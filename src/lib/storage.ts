import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseTripState, tripStateSchema, type TripState } from "./model";
import { createSeed } from "./seed";

export type StorageMode = "local" | "shared";
export class StorageUnavailableError extends Error {
  constructor(message = "여행 저장소에 연결할 수 없습니다. 저장소 연결과 Supabase 테이블·키 또는 로컬 폴더 권한을 확인한 뒤 다시 시도해주세요.") {
    super(message);
    this.name = "StorageUnavailableError";
  }
}
export class TripConflictError extends Error {
  constructor(public readonly state: TripState) {
    super("다른 가족이 먼저 저장했습니다. 최신 일정을 확인한 뒤 다시 저장해주세요.");
    this.name = "TripConflictError";
  }
}

export class TripValidationError extends Error {
  constructor() {
    super("여행 상태와 저장 버전을 확인해주세요.");
    this.name = "TripValidationError";
  }
}

export function getStorageMode(): StorageMode {
  const production = process.env.NODE_ENV === "production";
  // Password-free development must remain a local preview even with cloud credentials.
  if (!production && !process.env.FAMILY_PASSWORD?.trim()) return "local";
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (url && key) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && (production || parsed.protocol !== "http:")) throw new Error();
      return "shared";
    } catch {
      throw new StorageUnavailableError("Supabase 저장소 설정을 확인해주세요. 올바른 SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.");
    }
  }
  if (production || url || key) {
    throw new StorageUnavailableError("Supabase 저장소 설정을 확인해주세요. SUPABASE_URL, SUPABASE_SECRET_KEY와 family_trip 테이블이 필요합니다.");
  }
  return "local";
}

const processState = globalThis as typeof globalThis & { __okinawaTripQueue?: Promise<void> };
function withLocalLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = (processState.__okinawaTripQueue ?? Promise.resolve()).then(operation);
  processState.__okinawaTripQueue = result.then(() => undefined, () => undefined);
  return result;
}

function localFile(): string {
  return path.join(process.env.TRIP_DATA_DIR || path.join(process.cwd(), ".data"), "trip.json");
}

async function replaceLocalFile(file: string, state: TripState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function readLocal(file: string): Promise<TripState> {
  try {
    return parseTripState(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw new StorageUnavailableError();
    const initial = parseTripState(createSeed());
    await replaceLocalFile(file, initial);
    return initial;
  }
}

function storageClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!.trim(), process.env.SUPABASE_SECRET_KEY!.trim(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { timeout: 10_000 },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

const rowSchema = z.object({
  document: tripStateSchema,
  version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
});
function parseRow(data: unknown): TripState {
  const result = rowSchema.safeParse(data);
  if (!result.success || result.data.document.version !== result.data.version) throw new StorageUnavailableError();
  return result.data.document;
}

async function selectShared(client: SupabaseClient) {
  const result = await client.from("family_trip").select("document,version")
    .eq("id", "okinawa").maybeSingle().retry(false);
  if (result.error) throw new StorageUnavailableError();
  return result.data;
}

async function readShared(client: SupabaseClient): Promise<TripState> {
  const existing = await selectShared(client);
  if (existing) return parseRow(existing);
  const initial = parseTripState(createSeed());
  const { error } = await client.from("family_trip").upsert({
    id: "okinawa", document: initial, version: initial.version, updated_at: new Date().toISOString(),
  }, { onConflict: "id", ignoreDuplicates: true }).retry(false);
  if (error) throw new StorageUnavailableError();
  return parseRow(await selectShared(client));
}

async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TripConflictError || error instanceof StorageUnavailableError) throw error;
    throw new StorageUnavailableError();
  }
}

export async function readTrip(): Promise<TripState> {
  const mode = getStorageMode();
  const file = mode === "local" ? localFile() : "";
  return storageOperation(() => mode === "local"
    ? withLocalLock(() => readLocal(file))
    : readShared(storageClient()));
}

export async function writeTrip(next: TripState, expectedVersion: number): Promise<TripState> {
  let state: TripState;
  try {
    state = parseTripState(next);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || state.version !== expectedVersion) throw new Error();
    state = parseTripState({ ...state, version: expectedVersion + 1 });
  } catch {
    throw new TripValidationError();
  }
  const mode = getStorageMode();
  const file = mode === "local" ? localFile() : "";
  return storageOperation(async () => {
    if (mode === "local") {
      return withLocalLock(async () => {
        const current = await readLocal(file);
        if (current.version !== expectedVersion) throw new TripConflictError(current);
        await replaceLocalFile(file, state);
        return state;
      });
    }
    const client = storageClient();
    const current = await readShared(client);
    if (current.version !== expectedVersion) throw new TripConflictError(current);
    const { data, error } = await client.from("family_trip")
      .update({ document: state, version: state.version, updated_at: new Date().toISOString() })
      .eq("id", "okinawa").eq("version", expectedVersion)
      .select("document,version").maybeSingle().retry(false);
    if (error) throw new StorageUnavailableError();
    if (!data) throw new TripConflictError(await readShared(client));
    return parseRow(data);
  });
}
