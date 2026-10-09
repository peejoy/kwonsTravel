import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE = "okinawa_session";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
const issuer = "okinawa-family-trip";
const audience = "family";

export class AuthConfigurationError extends Error {
  constructor() {
    super("가족 공유 설정을 확인해주세요. 8자 이상의 FAMILY_PASSWORD와 32바이트 이상의 SESSION_SECRET이 필요합니다.");
    this.name = "AuthConfigurationError";
  }
}

export function assertAuthConfigured(): void {
  const password = process.env.FAMILY_PASSWORD;
  if (!password?.trim()) {
    if (process.env.NODE_ENV === "production") throw new AuthConfigurationError();
    return;
  }
  if (password.length < 8 || Buffer.byteLength(process.env.SESSION_SECRET ?? "", "utf8") < 32) {
    throw new AuthConfigurationError();
  }
}

export function isLocalPreview(): boolean {
  assertAuthConfigured();
  return process.env.NODE_ENV !== "production" && !process.env.FAMILY_PASSWORD?.trim();
}

function sessionKey(): Uint8Array {
  assertAuthConfigured();
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) throw new AuthConfigurationError();
  return new TextEncoder().encode(secret);
}

export async function createSession(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("family")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(sessionKey());
}

export async function verifySession(token: string): Promise<boolean> {
  assertAuthConfigured();
  if (isLocalPreview()) return false;
  const key = sessionKey();
  if (!token || token.length > 4096) return false;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"], issuer, audience, subject: "family",
      requiredClaims: ["exp", "iat", "sub"], maxTokenAge: SESSION_MAX_AGE,
    });
    return payload.exp! - payload.iat! <= SESSION_MAX_AGE;
  } catch {
    return false;
  }
}

export function verifyPassword(password: string): boolean {
  assertAuthConfigured();
  if (isLocalPreview()) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(password), digest(process.env.FAMILY_PASSWORD!));
}

export async function isAuthenticated(request: NextRequest): Promise<boolean> {
  if (isLocalPreview()) return true;
  return verifySession(request.cookies.get(SESSION_COOKIE)?.value ?? "");
}

export function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function checkOrigin(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host") || request.nextUrl.host;
  let matches = false;
  try {
    const origin = new URL(request.headers.get("origin") || "");
    matches = origin.host === host && origin.protocol === request.nextUrl.protocol && !origin.username && !origin.password;
  } catch { /* Missing and opaque origins cannot authorize a mutation. */ }
  if (!matches) {
    return jsonResponse({ error: "같은 사이트에서 다시 요청해주세요." }, 403);
  }
  return null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const, path: "/", maxAge: SESSION_MAX_AGE,
  };
}
