import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  assertAuthConfigured, AuthConfigurationError, checkOrigin, createSession, isAuthenticated,
  isLocalPreview, jsonResponse, SESSION_COOKIE, sessionCookieOptions, verifyPassword,
} from "@/lib/auth";
import { getStorageMode, StorageUnavailableError } from "@/lib/storage";
import { claimLoginAttempt, clearLoginAttempts, loginBucket, LOGIN_WINDOW_SECONDS } from "@/lib/login-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const passwordSchema = z.object({ password: z.string().min(1).max(1024) }).strict();

function unavailable(error: unknown) {
  const message = error instanceof AuthConfigurationError || error instanceof StorageUnavailableError
    ? error.message : "가족 공유 설정을 확인한 뒤 다시 시도해주세요.";
  return jsonResponse({ error: message }, 503);
}

export async function GET(request: NextRequest) {
  try {
    assertAuthConfigured();
    const mode = getStorageMode();
    return jsonResponse({ authenticated: await isAuthenticated(request), mode });
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: NextRequest) {
  const originError = checkOrigin(request);
  if (originError) return originError;
  try {
    assertAuthConfigured();
    const mode = getStorageMode();
    const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonResponse({ error: "비밀번호를 입력해주세요." }, 400);
    if (isLocalPreview()) return jsonResponse({ authenticated: true, mode });
    const bucket = loginBucket(request);
    if (!await claimLoginAttempt(bucket)) {
      const limited = jsonResponse({ error: "로그인 시도 횟수를 초과했습니다. 10분 후 다시 시도해주세요." }, 429);
      limited.headers.set("Retry-After", String(LOGIN_WINDOW_SECONDS));
      return limited;
    }
    if (!verifyPassword(parsed.data.password)) return jsonResponse({ error: "비밀번호가 맞지 않습니다." }, 401);
    await clearLoginAttempts(bucket);
    const response = jsonResponse({ authenticated: true, mode });
    response.cookies.set(SESSION_COOKIE, await createSession(), sessionCookieOptions());
    return response;
  } catch (error) {
    return unavailable(error);
  }
}

export async function DELETE(request: NextRequest) {
  const originError = checkOrigin(request);
  if (originError) return originError;
  try {
    assertAuthConfigured();
    const mode = getStorageMode();
    const response = jsonResponse({ authenticated: isLocalPreview(), mode });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  } catch (error) {
    return unavailable(error);
  }
}
