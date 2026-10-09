begin;

create table if not exists public.family_trip (
  id text primary key check (id = 'okinawa'),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  version bigint not null default 0 check (version between 0 and 9007199254740990),
  updated_at timestamptz not null default now(),
  constraint family_trip_document_version check (
    document ? 'version'
    and jsonb_typeof(document -> 'version') = 'number'
    and (document ->> 'version')::numeric = version
  )
);

alter table public.family_trip enable row level security;

revoke all on table public.family_trip from public, anon, authenticated;
grant select, insert, update on table public.family_trip to service_role;

create table if not exists public.family_login_attempts (
  bucket text primary key check (bucket ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null default now(),
  attempts integer not null check (attempts between 1 and 9)
);
create index if not exists family_login_attempts_window on public.family_login_attempts (window_start);
alter table public.family_login_attempts enable row level security;
revoke all on table public.family_login_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.family_login_attempts to service_role;

create or replace function public.claim_family_login_attempt(p_bucket text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_count integer;
begin
  delete from public.family_login_attempts where window_start < now() - interval '1 day';
  insert into public.family_login_attempts as current_attempt (bucket, window_start, attempts)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    window_start = case when current_attempt.window_start <= now() - interval '10 minutes' then now() else current_attempt.window_start end,
    attempts = case when current_attempt.window_start <= now() - interval '10 minutes' then 1 else least(current_attempt.attempts + 1, 9) end
  returning attempts into attempt_count;
  return attempt_count <= 8;
end;
$$;
revoke all on function public.claim_family_login_attempt(text) from public, anon, authenticated;
grant execute on function public.claim_family_login_attempt(text) to service_role;

-- No public policies: only server requests using the service role can access data.
commit;
