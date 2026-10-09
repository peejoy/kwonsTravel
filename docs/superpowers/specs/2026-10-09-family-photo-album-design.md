# Family Travel Photo Album

## Approved Intent

The family wants to upload phone photos, share them privately, and see their
capture locations on the existing Google map. Keep the existing shared family
password rather than introducing individual accounts. Preserve all existing
places, schedules, packing items, and Google place-photo behavior.

This document specifies the new subsystem. Product implementation and live
Supabase changes begin after review of this specification and its subsequent
implementation plan.

## Scope and User Flow

- Add a travel album navigation entry, separate from photo-worthy places.
- Offer a responsive photo grid grouped by capture date and a map view.
- Allow multiple phone photos per selection, processed sequentially with
  per-photo progress, cancellation between files, and individual retry.
- Before upload, show each preview, capture time, proposed location, and caption.
- Read EXIF GPS and capture time before resizing. GPS is optional and must be
  validated; do not invent a location from a filename or the uploader's current
  position. Let users remove or correct the proposed location before upload.
- If GPS is missing, allow a saved-place selection, map selection, or no location.
- Distinguish photo GPS, selected place, and manually selected coordinates.
- Display only located photos on the map. Photos without coordinates remain in
  the album with a missing-location state and a location-edit action.
- Selecting a marker opens the associated photo; selecting a located photo can
  focus its marker. Do not connect photo markers with itinerary route lines.
- Detail view supports enlargement, caption/time/location edits, Google Maps
  link, and an explicit deletion confirmation.
- All family members have equal access. No personal uploader identity is
  claimed, since the existing login identifies the family, not an individual.

## Phone Formats and Size

Use a maintained EXIF parser rather than implementing EXIF parsing manually.
Normalize supported browser-decodable photos to JPEG with correct orientation,
longest side at most 2048 pixels, and a maximum normalized upload of 3 MiB.
Create a smaller thumbnail for gallery browsing.

JPEG, PNG, and WebP inputs are supported. HEIC/HEIF inputs are supported when
the target browser can decode them; otherwise show an explicit conversion
message rather than silently losing the photo. Dedicated universal HEIC
conversion and original-resolution archival are outside this first version.
Cap individual source files at 30 MiB and selections at 20 photos. Validate
decoded dimensions and guard against excessive pixel counts on the server.

Keep the user-selected capture time as a wall-clock time when EXIF has no timezone;
do not fabricate UTC offsets. Group unknown-date photos separately. Times entered
manually in this Okinawa trip use Asia/Tokyo, which matches Asia/Seoul's UTC offset.

## Private Storage and Authorization

Use a new private Supabase Storage bucket dedicated to family-uploaded photos.
Do not make it public or mix it with cached Google place photographs.

All Next.js album endpoints check the existing signed family session. Mutations
also check same-origin requests. Password-free local preview must not grant
access to live family photos. Cloud album endpoints require properly configured
family authentication even during local development.

The Supabase secret key remains server-only. Browser clients never receive it.
Use short-lived signed upload permissions restricted to a server-generated
temporary object path after family authentication. This avoids sending image
bodies through Vercel request-size limits. Upload tokens are bearer capabilities
and must not be logged, committed, or stored in photo metadata.

On finalization, the server verifies the pending record, file size and actual
image bytes, decodes and re-encodes the photo, strips embedded EXIF, and writes
the display JPEG and thumbnail. Remove the temporary upload after success.
Only the explicitly confirmed coordinates/time are kept as structured metadata.
Return short-lived signed read URLs only after family authentication. A signed
URL can be used by its holder until expiration; use a five-minute expiry and
refresh on demand. Do not present this as instant revocation on logout.

## Metadata and Data Boundaries

Keep album metadata in a separate table, not inside the CAS-managed itinerary
JSON. Each record includes a UUID, fixed trip ID `okinawa`, server-generated
object paths, caption, optional capture time/timezone, optional latitude and
longitude, location provenance, creation/update timestamps, integer revision,
and lifecycle status (`pending`, `ready`, or `deleting`).

Enforce both coordinates present or both absent, finite valid coordinate ranges,
bounded captions, fixed trip identity, and valid lifecycle states. Index the
trip/status/date listing path. Paginate listings rather than downloading the
entire album. Enable RLS and revoke public/anon/authenticated table access,
following this application's server-mediated family authorization model.
Grant only required operations to the server role. Do not add public Storage
policies or pretend the application session is a Supabase Auth JWT.

Use record revisions for metadata edit/delete conflicts so concurrent family
edits cannot silently overwrite one another. Do not change the itinerary schema
or migrate private trip content as part of this feature.

## Failure Handling and Lifecycle

Reserve a UUID and pending record before issuing an upload permission. Finalize
idempotently for that reservation; never replace an unrelated photo. A ready
record is visible only after both display photo and thumbnail exist.

Failed uploads remain retryable without creating duplicate ready records.
Cancellation cleans up the reservation through an authenticated endpoint.
Temporary uploads and incomplete reservations older than 24 hours are eligible
for a server cleanup command, restricted to owned paths. Do not automatically
delete completed family photos after the trip.

Deletion transitions the record to deleting before object cleanup, hides it
from normal listings, and completes after storage deletion succeeds. Failure
must show a retryable cleanup state; it must not falsely report successful
permanent removal. Deletion never alters places, schedules, packing items, or
Google photo cache. Previously issued read URLs may remain usable until expiry.

Cloud configuration failures show an actionable album setup state. Never fall
back to public URLs or upload personal files without an explicit user upload.
Local UI tests use disposable fixtures, not real family photos.

## Verification and Delivery

- Unit tests: EXIF GPS/time extraction, missing/invalid GPS, orientation,
  normalization limits, unsupported input, and coordinate/time validation.
- API tests: login/origin enforcement, no cloud access from password-free
  preview, path isolation, size/type checks, revisions, idempotent finalization,
  upload failure, partial storage cleanup, and expired read URL refresh.
- Database checks: table privileges/RLS, private bucket, constraints, indexes,
  and relevant Supabase security advisors.
- Browser checks: mobile selection and preview, location confirmation, album
  and marker interactions, editing, loading/error states, and no layout overflow.
- Isolated storage smoke test with an explicitly synthetic image; no real
  family-photo upload or deletion during verification.
- Run the full existing test suite, typecheck, and production build. Keep the
  local app available and deliver setup instructions for Vercel environment
  variables without publishing secrets or private data to GitHub.

## References

- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/storage/uploads/standard-uploads
- https://supabase.com/docs/guides/storage/uploads/resumable-uploads

Existing Google photo caching remains a separate feature and is not granted
new storage rights by adding an album for the family's own photographs.
