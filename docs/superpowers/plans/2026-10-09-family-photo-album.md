# Family Photo Album Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private family album for phone photos with confirmed capture locations on the existing Google map.

**Architecture:** Retain the signed family cookie and server-only Supabase client. Store album records independently of itinerary JSON, upload normalized photos directly to a private bucket with signed upload permissions, and publish only server-validated display images. Share an album controller between the date-grouped gallery, location map, upload editor, and photo detail dialog.

**Tech Stack:** Existing Next.js, React, TypeScript, Zod, Supabase JS, Vitest, lucide-react, Google Maps/Leaflet; exifr for metadata and sharp for server image normalization. Resolve and pin exact new dependency versions during Task 2, including the lockfile.

**Spec:** `docs/superpowers/specs/2026-10-09-family-photo-album-design.md`

## Global Constraints

- Preserve all existing places, schedules, packing items, and Google place-photo behavior.
- All family members have equal access; no fabricated individual uploader identity.
- Cloud album access requires the signed family session, even in development.
- Private bucket only; server secrets never reach browser bundles or logs.
- Maximum source 30 MiB; selection 20 photos; normalized JPEG 3 MiB, longest side 2048 pixels.
- Read EXIF before resizing; confirmed GPS optional; never substitute upload position.
- HEIC/HEIF decoding is conditional on browser support; otherwise explicit conversion error.
- EXIF without timezone retains wall-clock time; manual input uses Asia/Tokyo.
- Five-minute signed read URLs; no claim of immediate revocation on logout.
- Separate album metadata from the CAS-managed itinerary JSON.
- No automatic deletion of completed photos; incomplete uploads older than 24 hours eligible for cleanup.
- No actual family-photo upload/deletion during testing; use synthetic fixtures.

## Review Focus

1. A phone photo loses GPS during compression: read and confirm metadata before encoding (Task 2).
2. A signed upload completes after cancellation: keep a cleanup tombstone through token expiration (Tasks 3-4).
3. Two finalize requests overlap with deletion: CAS/lease prevents ready-state resurrection (Tasks 3-4).
4. A family member returns to an old tab: expired signed media refreshes without an error loop (Task 5).
5. More photos exist than one listing page: gallery and map expose all pages without drawing a false route (Task 5).

## File Map

- `src/lib/album/model.ts`: schemas, constants, dates, cursor, object-path helpers.
- `src/lib/album/prepare.ts`: browser EXIF extraction and image normalization.
- `src/lib/album/images.ts`: server-only bounded decode/re-encode and thumbnails.
- `src/lib/album/store.ts`: server-only Supabase records and Storage lifecycle.
- `src/lib/album/http.ts`: shared strict cloud auth, Origin and safe API errors.
- `src/app/api/album/route.ts`: listing and upload reservation.
- `src/app/api/album/[id]/route.ts`: detail, revision-checked edit/delete.
- `src/app/api/album/[id]/finalize/route.ts`: bounded idempotent publication.
- `src/app/api/album/[id]/upload/route.ts`: signed upload permission renewal.
- `src/app/api/album/cleanup/route.ts`: authenticated, bounded cleanup operation.
- `src/components/album/use-album.ts`: pagination, refresh, upload queue, errors.
- `src/components/album/album-view.tsx`: gallery/map and setup/empty/loading states.
- `src/components/album/upload-editor.tsx`: preview and metadata confirmation.
- `src/components/album/photo-detail.tsx`: enlarge, edit, location, delete dialog.
- `supabase/album-schema.sql`: reproducible album table/private bucket configuration.
- Existing `planner.tsx`, `trip-map.tsx`, `globals.css`: narrow integration only.
- Tests named `tests/album-{model,prepare,images,store,routes,ui}.test.ts`.

## Task 1: Album Contracts

**Files:** Create `src/lib/album/model.ts`, `tests/album-model.test.ts`.

**Interfaces:**
```ts
type PhotoMetadata = {
  caption: string;
  capturedAt: string | null; // YYYY-MM-DDTHH:mm:ss wall clock
  captureTimezone: string | null; // null, validated IANA zone, or EXIF +/-HH:mm offset
  lat: number | null;
  lng: number | null;
  locationSource: "exif" | "place" | "manual" | "none";
};
type AlbumPhoto = PhotoMetadata & {
  id: string; revision: number;
  createdAt: string; updatedAt: string;
  imageUrl: string; thumbnailUrl: string; urlsExpireAt: string;
};
type AlbumPage = { photos: AlbumPhoto[]; nextCursor: string | null };
type UploadReservation = {
  id: string; revision: number; uploadUrl: string;
  uploadExpiresAt: string;
};
// Export schemas/types and constants from this module.
photoPaths(id: string): { temporary: string; display: string; thumbnail: string };
photoDateKey(photo: PhotoMetadata): string; // capture date or "unknown"
```

- [ ] Add tests for coordinate pairing/ranges, finite values, provenance, real calendar dates, timezone validation, bounded captions (1000 characters), UUID-only paths, revision and strict cursors. Cursor uses server-created `(created_at,id)` tuple, not nullable capture time.
```ts
it("rejects half a location and an invented GPS source", () => {
  const base = { caption: "", capturedAt: null, captureTimezone: null,
    lat: null, lng: null, locationSource: "none" };
  expect(photoMetadataSchema.safeParse({ ...base, lat: 26 }).success).toBe(false);
  expect(photoMetadataSchema.safeParse({ ...base, locationSource: "exif" }).success).toBe(false);
});
```
- [ ] Run `npx vitest run tests/album-model.test.ts`; confirm failure before implementation.
- [ ] Implement Zod contracts and UUID validation before deriving `okinawa/<uuid>/temporary.jpg`, `display.jpg`, `thumbnail.jpg`. Reject client-provided storage paths. Encode cursor as validated base64url JSON containing only the tuple.
- [ ] Run targeted tests and `npm run typecheck`; commit only Task 1 files.

## Task 2: Phone Preparation and Safe Image Bytes

**Files:** Create `prepare.ts`, `images.ts`, `tests/album-prepare.test.ts`, `tests/album-images.test.ts`; modify `package.json`, `package-lock.json`.

**Interfaces:**
```ts
type PreparedPhoto = { blob: Blob; previewUrl: string; metadata: PhotoMetadata };
preparePhoto(file: File): Promise<PreparedPhoto>;
normalizeExif(raw: Record<string, unknown> | null): PhotoMetadata;
normalizeImage(bytes: Buffer): Promise<{ display: Buffer; thumbnail: Buffer }>;
```

- [ ] Verify exact versions using `npm view exifr version` and `npm view sharp version`, inspect official supported Node/platform requirements, then install exact pinned versions. Browser module must never import sharp.
- [ ] Write EXIF tests with numeric GPS, no GPS, invalid GPS, raw date string without timezone, valid offset, and metadata containing unrelated device information. Use exifr with date revival disabled so source strings retain wall-clock meaning; discard all unneeded fields.
```ts
it("keeps capture GPS and timezone-free wall clock before encoding", () => {
  expect(normalizeExif({ latitude: 26.3, longitude: 127.7,
    DateTimeOriginal: "2026:10:14 13:05:00" })).toMatchObject({
    lat: 26.3, lng: 127.7, locationSource: "exif",
    capturedAt: "2026-10-14T13:05:00", captureTimezone: null,
  });
});
```
- [ ] Add mocked browser decoder/canvas tests for orientation-aware decode, oversized source, unsupported HEIC, quality-reduction loop, impossible 3 MiB target, and object URL cleanup. Generate actual synthetic sharp images for server tests: invalid bytes, animated/multi-page rejection, excessive dimensions, EXIF stripping and thumbnail size.
- [ ] Run targeted tests; confirm meaningful failures.
- [ ] Implement source checks before decode, `createImageBitmap` with orientation support or browser Image fallback, aspect-preserving canvas JPEG encoding with bounded quality attempts. Release bitmap and object URLs after preview use. Do not upload original EXIF-bearing bytes.
- [ ] Implement server sharp decoding with `limitInputPixels: 16_000_000`, single-frame verification, auto orientation, longest side 2048, JPEG recompression and 480px thumbnail; output no EXIF/XMP/ICC metadata. Bound incoming bytes at 3 MiB and actual output bytes at the same cap.
```ts
const display = await sharp(bytes, { limitInputPixels: 16_000_000 })
  .rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 85 }).toBuffer();
```
- [ ] Run targeted tests/typecheck; commit code, tests, exact dependency metadata.

## Task 3: Private Supabase Lifecycle

**Files:** Create `store.ts`, `supabase/album-schema.sql`, `tests/album-store.test.ts`; reuse existing env names without changing `storage.ts` itinerary behavior.

**Interfaces:**
```ts
reservePhoto(metadata: PhotoMetadata): Promise<UploadReservation>;
renewUpload(id: string, revision: number): Promise<UploadReservation>;
finalizePhoto(id: string, revision: number): Promise<AlbumPhoto>;
listPhotos(cursor: string | null): Promise<AlbumPage>;
getPhoto(id: string): Promise<AlbumPhoto>;
updatePhoto(id: string, revision: number, metadata: PhotoMetadata): Promise<AlbumPhoto>;
deletePhoto(id: string, revision: number): Promise<{ cleanupPending: boolean }>;
cleanupPhotos(): Promise<{ removed: number; pending: number }>;
```

- [ ] Load Supabase and Postgres skills; inspect actual project tables, migrations and relevant official signed-upload documentation. Read `security-privileges`, `security-rls-basics`, `schema-constraints` references. Do not query personal photo contents.
- [ ] Write isolated transport tests using mocked Supabase HTTP responses for reservations, scoped paths, retries, expired upload permission, 40-row keyset pages, partial Storage failures, revision conflicts, simultaneous finalize/delete, and cancelled late uploads.
```ts
it("never lists a pending or deleting reservation", async () => {
  const fetcher = vi.fn(async () => Response.json([]));
  vi.stubGlobal("fetch", fetcher);
  expect((await listPhotos(null)).photos).toEqual([]);
  expect(String(fetcher.mock.calls[0][0])).toContain("status=eq.ready");
});
```
- [ ] Run targeted tests and observe failures. Test setup always uses fake credentials, never inherited secrets or live fetch.
- [ ] Create the table with UUID PK, fixed-trip check, caption <=1000, optional timestamp without timezone and separate timezone label, paired finite numeric coordinates, provenance check, revisions, lifecycle status, `upload_expires_at`, and finalize lease UUID/expiry. Create listing index on `(trip_id,status,created_at desc,id desc)` and cleanup index on `(status,updated_at)`.
```sql
alter table public.family_album enable row level security;
revoke all on public.family_album from public, anon, authenticated;
grant select, insert, update, delete on public.family_album to service_role;
```
- [ ] Create private `family-travel-photos` bucket, JPEG-only, 3 MiB size cap. Abort if an existing bucket is public; never silently expose or broaden access. Keep reproducible DDL separate from existing trip schema. Apply reviewed cloud migration via MCP, not local `apply_migration`; preserve existing history and run relevant advisors after applying.
- [ ] Implement server-only client consistent with existing no-store/fetch timeout patterns. Derive all paths internally; never accept a URL to fetch from clients. Reserve row before signing; renew only pending records after CAS validation. Verify actual signed-upload TTL in current SDK/service and persist actual expiration, rather than promising five minutes.
- [ ] Acquire bounded finalize lease through atomic filtered update. Download bounded temporary bytes, normalize via Task 2, upload display+thumbnail, then publish using matching pending status/revision/lease. Repeated finalize of ready record returns it. Failed leases expire for retry; never publish a deleting row. Clean partial owned outputs or retain a cleanup state when removal fails.
- [ ] Delete transitions row to deleting with CAS. Remove owned files, preserve tombstone until outstanding upload permissions/leases expire, then remove record. Cleanup revisits tombstones and old pending records, maximum 100 per invocation, and never ready records. This catches a temporary file uploaded after cancellation.
- [ ] Sign read URLs for 300 seconds only for ready rows. Filter fixed trip ID on every query and use keyset pages of 40; display capture-date groups on client independently of stable listing order.
- [ ] Run targeted transport/schema privilege tests, inspect advisors, commit schema/store/tests without keys or live personal data.

## Task 4: Authenticated Album API

**Files:** Create `http.ts`, the six route files in File Map, `tests/album-routes.test.ts`.

**Interfaces:** All endpoints use no-store JSON; known failures map to 400 validation, 401 missing session, 403 Origin, 409 revision/busy, 413 oversized image, 415 unsupported image, 503 configuration/storage. Never return raw upstream messages or secret paths.

- [ ] Write route tests with real signed test family cookies and mocked store exports. Cover every mutation without cookie/Origin, password-free preview with fake cloud keys, malformed IDs/JSON/cursor, stale revision, expired upload, finalize while deleting, and sanitized errors.
```ts
it("does not access live album from password-free preview", async () => {
  vi.stubEnv("FAMILY_PASSWORD", "");
  const result = await GET(new NextRequest("https://family.example/api/album"));
  expect(result.status).toBe(503);
  expect(listPhotos).not.toHaveBeenCalled();
});
```
- [ ] Run targeted tests; verify failures.
- [ ] Implement `requireAlbumSession(request, mutation)` using `assertAuthConfigured`, explicit nonempty FAMILY_PASSWORD requirement, `verifySession` directly, server config validation and `checkOrigin`. Do not use permissive local-preview `isAuthenticated` for cloud album requests.
- [ ] Implement GET list/detail, POST reservation/finalize/renew/cleanup, PATCH metadata, DELETE cancellation/photo. Route params use promised Next.js params and validated UUIDs. Mutation schemas are strict and accept only metadata/revision fields; direct upload URL never uses service secret in browser code.
```ts
await requireAlbumSession(request, true);
const { revision } = revisionSchema.parse(await request.json());
return jsonResponse(await finalizePhoto(validId, revision));
```
- [ ] Run all API tests/typecheck; commit API/tests.

## Task 5: Mobile Album, Confirmation and Map

**Files:** Create `use-album.ts`, `album-view.tsx`, `upload-editor.tsx`, `photo-detail.tsx`, `tests/album-ui.test.ts`; modify `planner.tsx`, `trip-map.tsx`, `globals.css` narrowly.

**Interfaces:** `AlbumView({ places, onAuthRequired })` owns independent state. `useAlbum()` exposes photos, nextCursor, loading/error, loadMore, refresh, upload queue, edit/delete. TripMap adds optional `connectPoints?: boolean` (default true) and `markerKind?: "place" | "photo"` (default place), applied consistently to Google and Leaflet; album uses `connectPoints={false}`.

- [ ] Write controller tests with mocked fetch and preparePhoto for metadata confirmation before upload, mixed successful/failed batches, cancel between files, retry same reservation, no duplicate success, 401 clears private album state, cleanup-pending deletion, and one bounded signed-image refresh per expiry/error cycle. Add rendered markup tests matching current Vitest Node UI pattern.
```ts
it("renders a separate album upload command", () => {
  const html = renderToStaticMarkup(<AlbumView places={[]} onAuthRequired={() => {}} />);
  expect(html).toContain("여행 앨범");
  expect(html).toContain("사진 올리기");
});
```
- [ ] Run targeted tests; verify failures.
- [ ] Build multi-file input, per-file preview, caption/date/location editor, GPS source badge and remove-location control. Use saved-place select and compact map picking without requesting device geolocation. No network upload until user presses upload after confirmation. Reject >20 selection with visible error; preserve remaining drafts for correction/retry.
- [ ] Implement sequential reservation -> signed direct upload -> finalize; validate upload host against configured Supabase origin before sending bytes. Fetch only signed URLs returned by authenticated endpoints, with abort/timeout. Revoke preview object URLs when discarded/unmounted. Progress is per file; cancellation waits for active step and attempts reservation cleanup.
- [ ] Build gallery with aspect-ratio thumbnails, grouped dates/unknown date, grid/map segmented control, load-more button, pending-cleanup retry notification, editable detail and existing explicit delete dialog conventions. Track signed media expiry and refresh once on view activation/expiry; never persist signed links in itinerary JSON or localStorage.
- [ ] Add album nav entry, including accessible mobile navigation with six items at 390px width (ensure fixed tracks and labels fit). Existing photo-spot entry stays separate. Album header button opens upload editor, not Google place registration. No double toolbar/header.
- [ ] Extend both map implementations with optional disconnected camera markers. Show located count and no route legend in album. Map loads paginated photo markers with explicit load-more so limited pages are not presented as the whole album. Photo selection opens detail; focus action fits location. Keep existing itinerary/places map behavior unchanged.
- [ ] Run controller/UI tests, existing map/editor tests and typecheck; commit scoped UI changes.

## Task 6: End-to-End Checks and Setup Documentation

**Files:** Modify `README.md`, `.env.example` only if an additional public Supabase URL configuration is actually needed. No browser secret/anon key is required if direct upload uses the signed endpoint alone.

- [ ] Document private bucket/table setup, existing server-only credentials, signed-link expiration, no individual identity, JPEG/HEIC limitations, metadata privacy, compression/original retention policy, deletion retry and cleanup endpoint. Document difference from Google cached photos.
- [ ] Read configuration by presence only, not printing values. Verify family authentication is configured before cloud smoke tests. If missing, finish mocked tests and request user to enter secrets privately; do not invent credentials or claim cloud verification.
- [ ] Using a synthetic sharp-generated image, verify reservation/direct upload/finalize/list/read/edit and cleanup via isolated records. Explicitly restrict all cleanup to synthetic UUIDs. Verify GPS coordinates are stored only after confirmation, final bytes lack EXIF, bucket is private, anonymous reads fail. No real family-photo uploads/deletions.
- [ ] Browser QA via documented CUA/Playwright: desktop and 390x844 mobile, fixture album, multi-file preview, unknown GPS selection, photo/map interaction, no connecting lines, expiry refresh, error recovery, dialog fit and thumbnail loading. Save representative screenshot; label synthetic fixtures. Never bypass strict cloud auth to make the demo work.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`; wait for all transient build/test processes. Verify real trip data counts/revisions are unchanged without printing its contents.
- [ ] Request one fresh whole-change review for Native execution, fix actionable findings with regression tests, rerun checks. Subagent-driven execution additionally reviews each task independently.
- [ ] Stop only temporary QA servers/tabs; keep the user's local app running. Inspect staged paths to exclude `.env.local`, `.data`, photos and signed tokens. Commit scoped artifacts, push to the previously authorized GitHub repository, and report actual verification/setup limitations. Do not deploy Vercel unless requested.

## Execution Choice

Recommend **Native**: the six tasks share lifecycle and metadata interfaces, and implementing them in this session avoids repeated context/setup overhead. One independent final review remains required because private photo access and concurrent cleanup are security-sensitive. A task-by-task subagent implementation/review is the more expensive alternative.

Implementation starts after the user reviews this plan and selects the execution approach.

## Official References

- https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
- https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://sharp.pixelplumbing.com/api-output/
- https://github.com/MikeKovarik/exifr
