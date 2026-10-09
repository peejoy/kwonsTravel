# Okinawa Family Trip Design

## Intent and confirmed choices
Build a Korean, mobile-friendly personal Okinawa planner for a family. Family members use one shared password and may all edit. The owner has supplied a Google Maps API key and has no Supabase project. Deploy to Vercel when account access and shared storage are available. Complete a working local version first; do not describe local storage as deployed family synchronization.

## Architecture
Next.js App Router with React and TypeScript. All reads and writes go through same-origin route handlers. A signed, expiring, HttpOnly session cookie protects the shared family data. Password and session secret are server-only environment variables; the browser maps key is stored in ignored `.env.local`. Production fails closed if required configuration is absent. Development without a password is a visibly local preview.

Supabase stores a single family trip document with an integer revision. Atomic updates match that revision and return a conflict if another family member saved first. Table grants to public roles are revoked and RLS blocks direct public access; server requests use a Supabase secret key. Development without Supabase uses an atomic local JSON file and a process-level write queue. Production never uses filesystem persistence. Poll every 15 seconds and on window focus; avoid replacing an open editor's unsaved input. Do not silently discard edits on a version conflict.

## Experience and visual direction
The initial screen is the usable planner: an unframed, numbered daily timeline beside a large map. Separate tabs show the saved places, restaurants, photo spots, packing list and trip settings. Desktop uses a quiet sidebar; mobile uses a compact header and bottom navigation. White and pale gray-green surfaces (#F7FAF9, #FFFFFF), deep neutral green text (#243B33), jade actions (#19806B), coral place accents (#DF897B), and amber highlights (#E4AF4E). Korean system sans-serif text; a restrained serif treatment is reserved for the Okinawa destination wordmark. No landing page or feature marketing.

## Data and interactions
Trip: title, optional start date, one to fourteen days, optional traveler count, notes. Place: id, name, category, area, description, coordinates, optional image URL, source URL, favorite, notes. Schedule entry: id, placeId, day, time, duration, notes, completion. Packing item: id, label, category, assignee, done. All entries can be added, edited and removed; removing a place removes its itinerary references after confirmation. Itinerary entries support moving up/down, setting day and time, and completion. Place categories are sight, food, photo, stay and transport.

Start with a clearly marked four-day sample itinerary, editable and removable, and a short packing checklist. Dates and traveler counts are unconfirmed and remain empty. Restaurant samples have no invented ratings, prices or opening hours. Photograph sources and licenses are recorded separately. Users can add a photo via HTTPS URL. Counts, favorites, filtered searches and packing progress derive from saved data.

## Maps
Google Maps via the established `@vis.gl/react-google-maps` library. Numbered markers follow the selected day's itinerary, highlight the selected entry, fit bounds and show the visit order with a polyline. The line is not a calculated road route. Map clicks can set coordinates in the place editor. External Google Maps URLs support directions without an API key. A Leaflet/OpenStreetMap fallback is available when Maps initialization or authorization fails, and always credits OSM. Do not use public OSM tiles for offline download or automated bulk fetching.

## Error handling and delivery
Validate all payloads and HTTPS URLs. Save errors keep the user's form values. Optimistic state rolls back on error. Conflicts show a clear retry choice after refreshing shared state. No fabricated save success. Reject unauthenticated API access, expired/tampered sessions, cross-origin mutation requests and unconfigured production storage. No user data or secrets in logs. Vercel deployment remains pending until credentials and Supabase exist; provide executable SQL and setup instructions.

## Verification
Focused domain tests cover invalid dates/coordinates, dangling references, day reduction, expired/tampered cookies, and concurrent revision conflicts. Run type checking and a production build. Browser QA covers desktop/mobile, nonblank map or an honest map fallback, itinerary edits, place additions/deletions, checklist changes and reload persistence. Check unauthorized access and session behavior with an isolated password-protected development server. Keep the local preview server available for the owner.
