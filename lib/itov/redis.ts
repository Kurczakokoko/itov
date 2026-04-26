// Redis client + per-room distributed lock for ITOV.
//
// Why this exists: the previous server-store kept room state in a process
// `Map`, which doesn't survive across serverless instances. On Vercel, every
// state poll could land on a cold instance with no room data, returning 404
// and triggering the "Return to Lobby" overlay mid-match.
//
// Now all room state lives in Upstash Redis under a single JSON value per
// room. Concurrent mutations (e.g., both players submitting selections at
// the same instant) are serialized via a short-lived per-room lock so that
// a get-modify-set cycle is safe.

import { Redis } from "@upstash/redis"
import type { Room } from "./server-store"

// ---------- Singleton client ----------

declare global {
  // Cache across HMR reloads in dev.
  var __itovRedis: Redis | undefined
}

function makeClient(): Redis {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    throw new Error(
      "Upstash Redis env vars missing: KV_REST_API_URL / KV_REST_API_TOKEN",
    )
  }
  return new Redis({ url, token })
}

export const redis: Redis = globalThis.__itovRedis ?? makeClient()
if (!globalThis.__itovRedis) globalThis.__itovRedis = redis

// ---------- Keys ----------

export const ROOM_TTL_SECONDS = 60 * 60 // 1h
const LOCK_TTL_MS = 3000 // 3s — long enough for any single op, short enough to recover from a crashed holder
const LOCK_RETRY_MS = 15
const LOCK_MAX_ATTEMPTS = 80 // ~1.2s worst case

export function roomKey(code: string): string {
  return `itov:room:${code}`
}

export function lockKey(code: string): string {
  return `itov:lock:${code}`
}

export function hostIndexKey(clientId: string): string {
  return `itov:host:${clientId}`
}

// ---------- Room read/write ----------

export async function readRoom(code: string): Promise<Room | null> {
  // Upstash auto-decodes JSON values written via redis-js.
  const raw = (await redis.get(roomKey(code))) as Room | null
  return raw ?? null
}

export async function writeRoom(room: Room): Promise<void> {
  await redis.set(roomKey(room.code), room, { ex: ROOM_TTL_SECONDS })
}

export async function deleteRoom(code: string): Promise<void> {
  await redis.del(roomKey(code))
}

// ---------- Distributed lock ----------

function randomToken(): string {
  return (
    Math.random().toString(36).slice(2) +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Acquire a per-room lock. Retries for up to ~1.2s before giving up.
 * Returns a token used to safely release the lock.
 */
export async function acquireLock(code: string): Promise<string> {
  const token = randomToken()
  for (let i = 0; i < LOCK_MAX_ATTEMPTS; i++) {
    const ok = await redis.set(lockKey(code), token, {
      nx: true,
      px: LOCK_TTL_MS,
    })
    if (ok === "OK") return token
    // Jittered backoff so two contenders don't lockstep forever.
    await sleep(LOCK_RETRY_MS + Math.floor(Math.random() * 10))
  }
  throw new Error(`Could not acquire lock for room ${code}`)
}

/**
 * Release a lock only if we still own it (token match). This avoids
 * accidentally releasing a lock that has expired and been re-acquired
 * by someone else.
 */
export async function releaseLock(
  code: string,
  token: string,
): Promise<void> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `
  try {
    await redis.eval(script, [lockKey(code)], [token])
  } catch {
    // Best-effort: if eval fails the lock will expire on its own.
  }
}

/**
 * Run `fn` while holding the room lock. The latest room snapshot is read
 * inside the critical section and passed to `fn`. If `fn` returns a room,
 * it is written back. Returns whatever `fn` produced.
 */
export async function withRoomLock<T>(
  code: string,
  fn: (room: Room | null) => Promise<{ value: T; save?: Room | null }> | { value: T; save?: Room | null },
): Promise<T> {
  const token = await acquireLock(code)
  try {
    const room = await readRoom(code)
    const out = await fn(room)
    if (out.save) {
      await writeRoom(out.save)
    } else if (out.save === null) {
      await deleteRoom(code)
    }
    return out.value
  } finally {
    await releaseLock(code, token)
  }
}
