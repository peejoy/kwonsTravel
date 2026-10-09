begin;
create table public.family_album (
  id uuid primary key,
  trip_id text not null default 'okinawa' check (trip_id = 'okinawa'),
  caption text not null default '' check (char_length(caption) <= 1000),
  captured_at timestamp without time zone,
  capture_timezone text check (char_length(capture_timezone) <= 80),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  location_source text not null check (location_source in ('none', 'exif', 'place', 'manual')),
  revision bigint not null default 0 check (revision between 0 and 9007199254740989),
  status text not null check (status in ('pending', 'ready', 'deleting')),
  temporary_path text not null,
  display_path text not null,
  thumbnail_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  upload_expires_at timestamptz not null,
  lease_id uuid,
  lease_expires_at timestamptz,
  temporary_cleanup_pending boolean not null default false,
  check ((lat is null) = (lng is null)),
  check ((lat is null) = (location_source = 'none')),
  check ((lease_id is null) = (lease_expires_at is null)),
  check (temporary_path = 'okinawa/' || id::text || '/temporary.jpg'),
  check (display_path = 'okinawa/' || id::text || '/display.jpg'),
  check (thumbnail_path = 'okinawa/' || id::text || '/thumbnail.jpg')
);
create index family_album_listing on public.family_album (trip_id, status, created_at desc, id desc);
create index family_album_cleanup on public.family_album (status, updated_at);
alter table public.family_album enable row level security;
revoke all on public.family_album from public, anon, authenticated;
grant select, insert, update, delete on public.family_album to service_role;
do $$
begin
  if exists (select 1 from storage.buckets where id = 'family-travel-photos' and public) then
    raise exception 'Existing family photo bucket must not be public';
  end if;
end $$;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-travel-photos', 'family-travel-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;
-- Access goes through the signed family session on Next.js, not Supabase Auth.
-- No anon/authenticated policies are granted for this private bucket.
commit;
