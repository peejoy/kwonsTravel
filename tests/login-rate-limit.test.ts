import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LocalLoginLimiter, loginBucket } from "../src/lib/login-rate-limit";
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("login attempt windows", () => {
  it("blocks the ninth attempt and permits another attempt after ten minutes", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-09T00:00:00Z"));
    const limiter = new LocalLoginLimiter();
    for (let i = 0; i < 8; i++) expect(limiter.claim("family")).toBe(true);
    expect(limiter.claim("family")).toBe(false);
    vi.advanceTimersByTime(600000);
    expect(limiter.claim("family")).toBe(true);
  });
  it("separates clients and resets a successful client's attempts", () => {
    const limiter = new LocalLoginLimiter();
    for (let i = 0; i < 9; i++) limiter.claim("first");
    expect(limiter.claim("second")).toBe(true);
    limiter.clear("first");
    expect(limiter.claim("first")).toBe(true);
  });
  it("does not trust a spoofed forwarded IP outside Vercel", () => {
    vi.stubEnv("VERCEL", ""); vi.stubEnv("SESSION_SECRET", "rate-limit-bucket-secret-thirty-two-bytes");
    const a = new NextRequest("https://family.example", { headers: { "x-forwarded-for": "192.0.2.1", "x-vercel-forwarded-for": "192.0.2.1" } });
    const b = new NextRequest("https://family.example", { headers: { "x-forwarded-for": "192.0.2.2", "x-vercel-forwarded-for": "192.0.2.2" } });
    expect(loginBucket(a)).toBe(loginBucket(b));
    vi.stubEnv("VERCEL", "1");
    expect(loginBucket(a)).not.toBe(loginBucket(b));
    expect(loginBucket(a)).toMatch(/^[a-f0-9]{64}$/);
  });
});
