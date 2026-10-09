# Family Album Verification

2026-10-09, Asia/Seoul.

- Full suite: 170 tests passed; two explicit live-operation tests skipped by default.
- Live synthetic album test passed separately: reservation, signed direct upload,
  JPEG finalization, private download, EXIF removal, revision edit, and deletion.
- Approved trip import check passed separately, without changing the local source.
- Typecheck and production build passed.
- Browser QA: desktop map, mobile gallery at 390x844, private image loading,
  missing GPS, selecting a saved place, upload completion, no horizontal overflow.
- Synthetic records and images removed after QA; no real family photos used.
- RLS enabled, anonymous table privileges denied, bucket private. The no-policy
  INFO advisor is intentional for server-mediated family sessions.
- Independent review identified four lifecycle/recovery issues; all reproduced
  by failing tests and fixed. Additional HEIC fallback, cursor validation and
  locked-map input regressions were verified RED-to-GREEN.

## Decisions and Tradeoffs

1. Existing checkout retained to keep the running app available; scoped commits
   isolate the changes logically but do not provide physical worktree isolation.
2. Initially missing credentials were handled with isolated fixtures; later
   supplied configuration enabled real synthetic cloud verification.
3. Shared transport/form modules avoid duplication at the cost of two modules.
4. Public Supabase project URL is an extra deployment setting, not a secret;
   it lets the browser restrict uploads to the configured Storage origin.
5. Browser QA isolates itinerary/login-attempt transport; its album operations
   use real Supabase and a genuine signed test session. Existing trip transport
   was verified independently by the approved import check.
6. Temporary cleanup requires an additive tracking column and a maintenance
   action, protecting ready display images from late-upload cleanup.
7. Existing ready records were not backfilled after the safety review rejected
   a blanket update. Only new publications receive cleanup tracking.
8. Existing family-trip/login schema was applied as an empty prerequisite;
   subsequent private-trip transfer was performed only after explicit approval.

## Deferred Cosmetic Detail

Leaflet uses numbered capture pins while Google uses camera icons. Both show the
same confirmed positions without itinerary route lines.

## Operations

Rotate a server key exposed in chat and update local/deployment configuration.
Never commit family secrets, signed media URLs, private trip data or photos.
Vercel deployment is not part of this implementation run.
