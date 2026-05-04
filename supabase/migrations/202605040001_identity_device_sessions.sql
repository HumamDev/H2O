-- Phase 5.0E — Identity device sessions (v1)
--
-- Adds public.device_sessions table + 3 RPCs so each signed-in surface can
-- register itself and the user can see their active sessions in the mobile UI.
--
-- v1 deliberately omits the bulk-revoke RPC and any per-row revoke RPC.
-- "Sign out all other devices" is deferred until the Supabase signOut
-- scope='others' behavior is verified on real hardware. Per-row revoke is
-- deferred to a later phase (likely needs a service-role Edge Function).
-- Browser-extension registration is also deferred.
--
-- Privacy: no IP, no geolocation, no full user-agent, no device fingerprint.
-- Token model: SHA-256 hash sent to server; the plain nonce stays only on the
-- device (mobile SecureStore in Phase B). Server cannot reverse the hash.

create extension if not exists pgcrypto;

-- ─── Table ────────────────────────────────────────────────────────────────

create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null,
  label text not null,
  device_token_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz null,

  -- Surface allow-list. v1 ships only 'ios_app'; the other slugs are reserved
  -- so future surfaces (browser extensions, desktop, web) can ship without a
  -- new schema migration. Each surface activation is its own phase.
  constraint device_sessions_surface_allowed check (
    surface in (
      'ios_app',
      'android_app',
      'chrome_extension',
      'firefox_extension',
      'desktop_mac',
      'desktop_windows',
      'web'
    )
  ),
  constraint device_sessions_label_length check (
    char_length(btrim(label)) between 1 and 64
  ),
  constraint device_sessions_token_hash_format check (
    device_token_hash ~ '^[0-9a-f]{64}$'
  ),
  unique (user_id, device_token_hash)
);

create index if not exists device_sessions_user_active_idx
  on public.device_sessions (user_id, last_seen_at desc)
  where revoked_at is null;

-- ─── Row-Level Security ───────────────────────────────────────────────────
-- Owner-only SELECT and UPDATE. INSERT/DELETE are not granted as policies;
-- those operations happen exclusively through the SECURITY DEFINER RPCs below.

alter table public.device_sessions enable row level security;

create policy device_sessions_owner_select on public.device_sessions
  for select using (auth.uid() = user_id);

create policy device_sessions_owner_update on public.device_sessions
  for update using (auth.uid() = user_id);

-- ─── RPC: register_device_session ─────────────────────────────────────────
-- Idempotent upsert. Called by a surface on every successful sign-in.
-- (user_id, device_token_hash) is the unique key; same device → same row.

create or replace function public.register_device_session(
  p_surface text,
  p_label text,
  p_device_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_label text := btrim(coalesce(p_label, ''));
  v_session public.device_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_surface is null or p_surface not in (
    'ios_app','android_app','chrome_extension','firefox_extension',
    'desktop_mac','desktop_windows','web'
  ) then
    raise exception 'Invalid surface' using errcode = '22023';
  end if;
  if char_length(v_label) < 1 or char_length(v_label) > 64 then
    raise exception 'Invalid label' using errcode = '22023';
  end if;
  if p_device_token_hash is null or p_device_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device token hash' using errcode = '22023';
  end if;

  insert into public.device_sessions (user_id, surface, label, device_token_hash)
  values (v_uid, p_surface, v_label, p_device_token_hash)
  on conflict (user_id, device_token_hash) do update set
    surface = excluded.surface,
    label = excluded.label,
    last_seen_at = now(),
    revoked_at = null
  returning * into v_session;

  return jsonb_build_object('session', jsonb_build_object(
    'id', v_session.id,
    'surface', v_session.surface,
    'label', v_session.label,
    'created_at', v_session.created_at,
    'last_seen_at', v_session.last_seen_at,
    'revoked_at', v_session.revoked_at
  ));
end;
$$;

revoke all on function public.register_device_session(text, text, text) from anon, public;
grant execute on function public.register_device_session(text, text, text) to authenticated;

-- ─── RPC: touch_device_session ────────────────────────────────────────────
-- Bumps last_seen_at on the caller's row. Client rate-limits (10-min interval)
-- so this is called sparingly. Returns the updated row, or null if the device
-- isn't registered (or has been revoked) so the caller knows to re-register.

create or replace function public.touch_device_session(p_device_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.device_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_device_token_hash is null or p_device_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device token hash' using errcode = '22023';
  end if;

  update public.device_sessions
    set last_seen_at = now()
    where user_id = v_uid
      and device_token_hash = p_device_token_hash
      and revoked_at is null
    returning * into v_session;

  if v_session.id is null then
    return jsonb_build_object('session', null);
  end if;

  return jsonb_build_object('session', jsonb_build_object(
    'id', v_session.id,
    'surface', v_session.surface,
    'label', v_session.label,
    'created_at', v_session.created_at,
    'last_seen_at', v_session.last_seen_at,
    'revoked_at', v_session.revoked_at
  ));
end;
$$;

revoke all on function public.touch_device_session(text) from anon, public;
grant execute on function public.touch_device_session(text) to authenticated;

-- ─── RPC: list_my_device_sessions ─────────────────────────────────────────
-- Returns all non-revoked rows for the current user, ordered by last_seen_at desc.
-- The client matches its own SecureStore-held token-hash against the returned
-- ids to mark the "current device" — that mapping never crosses the wire.

create or replace function public.list_my_device_sessions()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_sessions jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'surface', s.surface,
        'label', s.label,
        'created_at', s.created_at,
        'last_seen_at', s.last_seen_at,
        'revoked_at', s.revoked_at
      )
      order by s.last_seen_at desc
    ),
    '[]'::jsonb
  ) into v_sessions
  from public.device_sessions s
  where s.user_id = v_uid
    and s.revoked_at is null;

  return jsonb_build_object('sessions', v_sessions);
end;
$$;

revoke all on function public.list_my_device_sessions() from anon, public;
grant execute on function public.list_my_device_sessions() to authenticated;
