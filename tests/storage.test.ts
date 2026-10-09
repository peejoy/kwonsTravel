import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readTrip, writeTrip, TripConflictError } from "../src/lib/storage";
import { createSeed } from "../src/lib/seed";
import { GET, PUT } from "../src/app/api/trip/route";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "okinawa-storage-test-"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FAMILY_PASSWORD", "");
  vi.stubEnv("SESSION_SECRET", "");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  vi.stubEnv("TRIP_DATA_DIR", path.join(directory, "data"));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

describe("local trip storage", () => {
  it("initializes the sample once and reloads saved state from disk", async () => {
    const initial = await readTrip();
    expect(initial.version).toBe(0);
    expect(initial.trip.title).toBe("우리 가족의 오키나와");
    expect(initial.schedule).toHaveLength(12);
    const saved = await writeTrip({ ...initial, trip: { ...initial.trip, title: "가족의 수정한 일정" } }, 0);
    expect(saved.version).toBe(1);
    const stored = JSON.parse(await readFile(path.join(directory, "data", "trip.json"), "utf8"));
    expect(stored.trip.title).toBe("가족의 수정한 일정");
    vi.resetModules();
    const reloadedStorage = await import("../src/lib/storage");
    expect(await reloadedStorage.readTrip()).toEqual(saved);
    expect(await readdir(path.join(directory, "data"))).toEqual(["trip.json"]);
  });

  it("serializes initialization and two concurrent saves so exactly one succeeds", async () => {
    const initialReads = await Promise.all([readTrip(), readTrip(), readTrip()]);
    expect(initialReads.map((state) => state.version)).toEqual([0, 0, 0]);
    const initial = initialReads[0];
    const results = await Promise.allSettled([
      writeTrip({ ...initial, trip: { ...initial.trip, notes: "first" } }, 0),
      writeTrip({ ...initial, trip: { ...initial.trip, notes: "second" } }, 0),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(TripConflictError);
    const winner = await readTrip();
    expect(winner.version).toBe(1);
    expect(rejected.reason.state).toEqual(winner);
  });

  it("rejects a mismatched revision without changing stored data", async () => {
    const initial = await readTrip();
    await expect(writeTrip(initial, 1)).rejects.toThrow(/버전/);
    expect((await readTrip()).version).toBe(0);
  });

  it("rejects invalid state before changing stored data", async () => {
    const initial = await readTrip();
    await expect(writeTrip({ ...initial, schedule: [{ ...initial.schedule[0], placeId: "missing" }] }, 0)).rejects.toThrow();
    expect(await readTrip()).toEqual(initial);
  });

  it("keeps corrupt storage intact and recovers the write queue after failure", async () => {
    await readTrip();
    const file = path.join(directory, "data", "trip.json");
    await writeFile(file, "corrupt-json");
    await expect(readTrip()).rejects.toThrow(/저장/);
    expect(await readFile(file, "utf8")).toBe("corrupt-json");
    await writeFile(file, JSON.stringify(createSeed()));
    expect((await readTrip()).version).toBe(0);
  });
});

describe("trip HTTP boundary", () => {
  const origin = "https://family.example";
  function request(method = "GET", body?: unknown) {
    return new NextRequest(`${origin}/api/trip`, {
      method, headers: { Origin: origin, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("returns persisted state, local mode and latest state on a conflict", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const initial = await response.json();
    expect(initial.mode).toBe("local");
    const saved = await PUT(request("PUT", { state: initial.state, expectedVersion: 0 }));
    expect(saved.status).toBe(200);
    const savedBody = await saved.json();
    expect(savedBody.state.version).toBe(1);
    expect(savedBody.mode).toBe("local");
    const conflict = await PUT(request("PUT", { state: initial.state, expectedVersion: 0 }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: expect.stringMatching(/[가-힣]/), state: savedBody.state });
  });

  it("returns a generic Korean 503 when local storage is unavailable", async () => {
    const blockedPath = path.join(directory, "not-a-directory");
    await writeFile(blockedPath, "file");
    vi.stubEnv("TRIP_DATA_DIR", blockedPath);
    const response = await GET(request());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toMatch(/[가-힣]/);
    expect(body.error).not.toContain(blockedPath);
    expect(body.error).not.toContain("ENOTDIR");
  });
});

describe("production storage", () => {
  it.each(["SUPABASE_URL", "SUPABASE_SECRET_KEY"])("fails closed without %s", async (name) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "https://storage.example");
    vi.stubEnv("SUPABASE_SECRET_KEY", "server-only-key");
    vi.stubEnv(name, "");
    await expect(readTrip()).rejects.toThrow(/Supabase/);
    await expect(writeTrip(createSeed(), 0)).rejects.toThrow(/Supabase/);
    expect(await readdir(directory)).toEqual([]);
  });
});

describe("Supabase transport boundary", () => {
  beforeEach(() => {
    vi.stubEnv("FAMILY_PASSWORD", "family-test-password");
    vi.stubEnv("SUPABASE_URL", "https://storage.example");
    vi.stubEnv("SUPABASE_SECRET_KEY", "server-only-key");
  });

  it("keeps an existing document when another server initializes first", async () => {
    const existing = { ...createSeed(), version: 5, trip: { ...createSeed().trip, title: "이미 저장된 가족 일정" } };
    let row: { document: typeof existing; version: number } | null = null;
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
      const url = new URL(input);
      expect(url.pathname).toBe("/rest/v1/family_trip");
      if (init.method === "POST") {
        // A competing server has inserted between this server's read and insert.
        row = { document: existing, version: 5 };
        expect(new Headers(init.headers).get("Prefer")).toContain("resolution=ignore-duplicates");
        expect(JSON.parse(String(init.body)).id).toBe("okinawa");
        return new Response(null, { status: 201 });
      }
      return Response.json(row ? [row] : []);
    });
    expect(await readTrip()).toEqual(existing);
    expect(await readdir(directory)).toEqual([]);
  });

  it("uses database revision filters so simultaneous saves have only one winner", async () => {
    let row = { document: createSeed(), version: 0 };
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
      const url = new URL(input);
      expect(url.pathname).toBe("/rest/v1/family_trip");
      expect(url.searchParams.get("id")).toBe("eq.okinawa");
      expect(new Headers(init.headers).get("apikey")).toBe("server-only-key");
      if (init.method === "PATCH") {
        expect(url.searchParams.get("version")).toBe("eq.0");
        const update = JSON.parse(String(init.body));
        expect(update.version).toBe(1);
        expect(update.document.version).toBe(1);
        if (row.version !== 0) return Response.json([]);
        row = { document: update.document, version: update.version };
      }
      return Response.json([row]);
    });
    const initial = createSeed();
    const results = await Promise.allSettled([
      writeTrip({ ...initial, trip: { ...initial.trip, notes: "first" } }, 0),
      writeTrip({ ...initial, trip: { ...initial.trip, notes: "second" } }, 0),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const conflict = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(conflict.reason.state).toEqual(row.document);
    expect(row.version).toBe(1);
  });

  it("does not expose connection errors or mismatched stored revisions", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ code: "42501", message: "private upstream details" }, { status: 403 }));
    await expect(readTrip()).rejects.toThrow(/저장/);
    await expect(readTrip()).rejects.not.toThrow(/private upstream details/);
    vi.stubGlobal("fetch", async () => Response.json([{ document: createSeed(), version: 7 }]));
    await expect(readTrip()).rejects.toThrow(/저장/);
  });
});
