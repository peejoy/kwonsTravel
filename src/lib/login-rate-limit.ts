import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getStorageMode, StorageUnavailableError } from "./storage";

export const LOGIN_ATTEMPT_LIMIT = 8;
export const LOGIN_WINDOW_SECONDS = 600;
export class LocalLoginLimiter {
  private buckets = new Map<string, { start: number; attempts: number }>();
  claim(bucket: string): boolean {
    const now = Date.now();
    for (const [key, value] of this.buckets) if (value.start + LOGIN_WINDOW_SECONDS * 1000 <= now) this.buckets.delete(key);
    const value = this.buckets.get(bucket) || { start: now, attempts: 0 };
    value.attempts = Math.min(value.attempts + 1, LOGIN_ATTEMPT_LIMIT + 1);
    this.buckets.set(bucket, value);
    return value.attempts <= LOGIN_ATTEMPT_LIMIT;
  }
  clear(bucket: string): void { this.buckets.delete(bucket); }
}
const processState = globalThis as typeof globalThis & { __okinawaLoginLimiter?: LocalLoginLimiter };
const local = () => processState.__okinawaLoginLimiter ??= new LocalLoginLimiter();

export function loginBucket(request: NextRequest): string {
  // Vercel supplies this header; arbitrary forwarded IPs are not trusted locally.
  const identity = process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown"
    : "local";
  return createHmac("sha256", process.env.SESSION_SECRET!).update(identity).digest("hex");
}
function client() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { timeout: 10_000 },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
export async function claimLoginAttempt(bucket: string): Promise<boolean> {
  if (getStorageMode() === "local") return local().claim(bucket);
  try {
    const { data, error } = await client().rpc("claim_family_login_attempt", { p_bucket: bucket }).retry(false);
    if (error || typeof data !== "boolean") throw new Error();
    return data;
  } catch { throw new StorageUnavailableError("로그인 확인 저장소에 연결할 수 없습니다. 공유 저장소 설정을 확인해주세요."); }
}
export async function clearLoginAttempts(bucket: string): Promise<void> {
  if (getStorageMode() === "local") { local().clear(bucket); return; }
  try {
    const { error } = await client().from("family_login_attempts").delete().eq("bucket", bucket).retry(false);
    if (error) throw new Error();
  } catch { throw new StorageUnavailableError("로그인 확인 저장소에 연결할 수 없습니다. 공유 저장소 설정을 확인해주세요."); }
}
