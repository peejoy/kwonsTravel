import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSession, verifyPassword, verifySession } from "../src/lib/auth";
import { DELETE, GET, POST } from "../src/app/api/session/route";
import { GET as getTrip, PUT as putTrip } from "../src/app/api/trip/route";
import { createSeed } from "../src/lib/seed";

const origin = "https://family.example";
const secret = "test-session-secret-with-at-least-32-bytes";
function request(method = "GET", body?: unknown, requestOrigin: string | null = origin, token?: string) {
  const headers = new Headers();
  if (requestOrigin !== null) headers.set("Origin", requestOrigin);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Cookie", `okinawa_session=${token}`);
  return new NextRequest(`${origin}/api/session`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FAMILY_PASSWORD", "family-test-password");
  vi.stubEnv("SESSION_SECRET", secret);
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("family session", () => {
  it("rejects a configured family password shorter than eight characters", async () => {
    vi.stubEnv("FAMILY_PASSWORD", "short");
    await expect(createSession()).rejects.toThrow(/설정/);
  });
  it("accepts a signed session and rejects an altered signature", async () => {
    const token = await createSession();
    expect(await verifySession(token)).toBe(true);
    const parts = token.split(".");
    parts[2] = `${parts[2][0] === "a" ? "b" : "a"}${parts[2].slice(1)}`;
    expect(await verifySession(parts.join("."))).toBe(false);
    expect(await verifySession("not-a-token")).toBe(false);
  });

  it("expires exactly seven days after issue", async () => {
    vi.useFakeTimers();
    const issued = new Date("2026-10-09T00:00:00Z");
    vi.setSystemTime(issued);
    const token = await createSession();
    vi.setSystemTime(issued.getTime() + 7 * 86400_000 - 1000);
    expect(await verifySession(token)).toBe(true);
    vi.setSystemTime(issued.getTime() + 7 * 86400_000);
    expect(await verifySession(token)).toBe(false);
  });

  it("rejects tokens after session key rotation", async () => {
    const token = await createSession();
    vi.stubEnv("SESSION_SECRET", "different-session-secret-with-at-least-32-bytes");
    expect(await verifySession(token)).toBe(false);
  });

  it("compares the full family password", () => {
    expect(verifyPassword("family-test-password")).toBe(true);
    expect(verifyPassword("wrong")).toBe(false);
    expect(verifyPassword("family-test-password ")).toBe(false);
    expect(verifyPassword("")).toBe(false);
  });

  it("fails closed when production session secret is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    await expect(createSession()).rejects.toThrow(/설정/);
    await expect(verifySession("anything")).rejects.toThrow(/설정/);
  });
});

describe("session HTTP boundary", () => {
  it("accepts the browser Origin when Next.js normalizes the internal server URL", async () => {
    const browserRequest = new NextRequest("http://0.0.0.0:3002/api/session", {
      method: "POST",
      headers: { Origin: "http://localhost:3002", Host: "localhost:3002", "Content-Type": "application/json" },
      body: JSON.stringify({ password: "family-test-password" }),
    });
    expect((await POST(browserRequest)).status).toBe(200);
  });
  it("reports unauthenticated shared-password sessions with local storage", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false, mode: "local" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("automatically authenticates local preview without a password", async () => {
    vi.stubEnv("FAMILY_PASSWORD", "");
    vi.stubEnv("SESSION_SECRET", "");
    const response = await GET(request());
    expect(await response.json()).toEqual({ authenticated: true, mode: "local" });
  });

  it.each(["FAMILY_PASSWORD", "SESSION_SECRET", "SUPABASE_URL"])("returns 503 when production %s is missing", async (name) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "https://storage.example");
    vi.stubEnv("SUPABASE_SECRET_KEY", "server-only-key");
    vi.stubEnv(name, "");
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).error).toMatch(/[가-힣]/);
  });

  it("rejects a wrong password without issuing a cookie", async () => {
    const response = await POST(request("POST", { password: "wrong" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("sets a seven-day HttpOnly, SameSite=Lax, production Secure cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "https://storage.example");
    vi.stubEnv("SUPABASE_SECRET_KEY", "server-only-key");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/rpc/claim_family_login_attempt")) return new Response("true", { headers: { "Content-Type": "application/json" } });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      throw new Error("Unexpected external request");
    });
    const response = await POST(request("POST", { password: "family-test-password" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true, mode: "shared" });
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Max-Age=604800/i);
    const token = cookie.match(/^okinawa_session=([^;]+)/)![1];
    expect(await (await GET(request("GET", undefined, origin, token))).json()).toEqual({ authenticated: true, mode: "shared" });
    const logout = await DELETE(request("DELETE", undefined, origin, token));
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  it.each([null, "https://other.example", "null"])("rejects mutation Origin %s for login, logout and trip saves", async (requestOrigin) => {
    const login = await POST(request("POST", { password: "family-test-password" }, requestOrigin));
    const logout = await DELETE(request("DELETE", undefined, requestOrigin));
    const save = await putTrip(request("PUT", { state: createSeed(), expectedVersion: 0 }, requestOrigin));
    for (const response of [login, logout, save]) {
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("rejects unauthenticated trip reads and saves", async () => {
    expect((await getTrip(request())).status).toBe(401);
    expect((await putTrip(request("PUT", { state: createSeed(), expectedVersion: 0 }))).status).toBe(401);
  });

  it("validates complete trip state and matching expected version", async () => {
    const token = await createSession();
    const mismatch = await putTrip(request("PUT", { state: createSeed(), expectedVersion: 1 }, origin, token));
    expect(mismatch.status).toBe(400);
    const invalid = createSeed();
    invalid.places[0].lat = 1000;
    expect((await putTrip(request("PUT", { state: invalid, expectedVersion: 0 }, origin, token))).status).toBe(400);
    expect((await POST(request("POST", { password: 123 }))).status).toBe(400);
  });
  it("limits repeated incorrect passwords before further verification", async () => {
    vi.stubEnv("SESSION_SECRET", "rate-limit-route-secret-at-least-thirty-two-bytes");
    for (let i = 0; i < 8; i++) expect((await POST(request("POST", { password: "incorrect" }))).status).toBe(401);
    const limited = await POST(request("POST", { password: "incorrect" }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("600");
  });
});
