-- Phase 5.0M — Profile avatar uploads (mobile-first; browser may follow later).
--
-- Adds a single nullable text column `avatar_path` to public.profiles, an
-- update RPC, and a public Storage bucket `avatars` with owner-only
-- INSERT/UPDATE/DELETE policies. SELECT remains public via the bucket flag
-- so the mobile app can render the image straight from the public URL
-- without signing every fetch.
--
-- The avatar_path column stores ONLY the storage object path, never the
-- public URL. The mobile client constructs the URL at render time, which
-- means a future migration to private+signed-URL storage is a client-only
-- change with no schema migration required.
--
-- avatar_color (slug) remains the perpetual fallback. Removing the
-- uploaded image (avatar_path -> null) returns the user to the colored
-- initials affordance — they can never end up with no avatar visible.
--
-- Path format: avatars/<user_uuid>/profile_<timestamp>.jpg
--   - <user_uuid> matches auth.uid() (verified in both the storage policy
--     and the RPC's path-validity check).
--   - timestamped filename buckets cleanly across replacements; the mobile
--     client deletes the previous file (best-effort) after a successful
--     upload to keep the bucket tidy.
--
-- v1: JPEG only (matches mobile's image-manipulator output). Future-proofing
-- the path regex below would allow other formats; tightening it deliberately
-- now keeps the surface narrow.

-- ─── Profiles column ──────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists avatar_path text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_path_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_path_format check (
        avatar_path is null
        or avatar_path ~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/profile_[0-9]+\.jpg$'
      );
  end if;
end
$$;

-- ─── Storage bucket ───────────────────────────────────────────────────────
-- Public (so mobile can render via stable URLs without per-request signing),
-- with size + MIME limits enforced server-side. Re-runs are safe: existing
-- bucket settings are preserved; we only adjust on a fresh insert.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2 * 1024 * 1024, array['image/jpeg'])
on conflict (id) do nothing;

-- ─── Storage policies ─────────────────────────────────────────────────────
-- Owner-only writes into avatars/<auth.uid()>/... — verified by splitting
-- the object name on '/' and matching the first segment against the
-- caller's UUID. SELECT is implicit via bucket.public=true.

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── RPC: update_identity_avatar_path ─────────────────────────────────────
-- Owner-only metadata write. Does NOT touch storage; the mobile client
-- uploads to Storage first, then calls this RPC to record the path. Two
-- failure-isolated steps so a failed Storage upload never leaves a stale
-- DB pointer, and a failed RPC never leaves orphan metadata.
--
-- Validates that the supplied path follows the same regex as the table
-- check, AND that the path's user-folder segment matches auth.uid() (so a
-- caller cannot point their own profile at another user's storage path).

create or replace function public.update_identity_avatar_path(
  p_avatar_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clean text := nullif(btrim(coalesce(p_avatar_path, '')), '');
  v_folder text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_clean is not null then
    if v_clean !~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/profile_[0-9]+\.jpg$' then
      raise exception 'Invalid avatar path' using errcode = '22023';
    end if;
    v_folder := split_part(v_clean, '/', 2);
    if v_folder <> v_uid::text then
      raise exception 'Avatar path must reference own user folder' using errcode = '42501';
    end if;
  end if;

  update public.profiles
    set avatar_path = v_clean,
        updated_at = now()
  where id = v_uid
    and deleted_at is null;

  if not found then
    raise exception 'Profile not found' using errcode = '02000';
  end if;

  return jsonb_build_object('avatarPath', v_clean);
end;
$$;

revoke all on function public.update_identity_avatar_path(text) from anon, public;
grant execute on function public.update_identity_avatar_path(text) to authenticated;

-- ─── load_identity_state — extend to return avatar_path ──────────────────
-- Layered on top of the 202605010005 version. Adds avatar_path to the
-- profile sub-object; everything else (credential_state, role, workspace)
-- is preserved verbatim from the prior definition.

create or replace function public.load_identity_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_workspace public.workspaces%rowtype;
  v_membership public.workspace_memberships%rowtype;
  v_password_complete boolean := false;
  v_oauth_provider text := null;
  v_credential_state text := 'required';
  v_credential_provider text := 'unknown';
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(ips.password_setup_completed, false)
    into v_password_complete
    from public.identity_password_status ips
   where ips.user_id = v_uid
   limit 1;

  v_password_complete := coalesce(v_password_complete, false);

  select ios.provider
    into v_oauth_provider
    from public.identity_oauth_status ios
   where ios.user_id = v_uid
     and ios.provider = 'google'
     and ios.credential_completed is true
   order by ios.completed_at asc
   limit 1;

  if v_password_complete is true or v_oauth_provider is not null then
    v_credential_state := 'complete';
    v_credential_provider := case
      when v_password_complete is true and v_oauth_provider is not null then 'multiple'
      when v_oauth_provider is not null then v_oauth_provider
      else 'password'
    end;
  end if;

  select p.*
    into v_profile
    from public.profiles p
   where p.id = v_uid
     and p.deleted_at is null;

  select wm.*
    into v_membership
    from public.workspace_memberships wm
    join public.workspaces w
      on w.id = wm.workspace_id
   where wm.user_id = v_uid
     and wm.role = 'owner'
     and w.deleted_at is null
   order by wm.created_at asc, wm.id asc
   limit 1;

  if v_membership.id is not null then
    select w.*
      into v_workspace
      from public.workspaces w
     where w.id = v_membership.workspace_id
       and w.deleted_at is null;
  end if;

  return jsonb_build_object(
    'credential_state', v_credential_state,
    'credential_provider', v_credential_provider,
    'profile',
      case
        when v_profile.id is null then null
        else jsonb_build_object(
          'id', v_profile.id,
          'display_name', v_profile.display_name,
          'avatar_color', v_profile.avatar_color,
          'avatar_path', v_profile.avatar_path,
          'onboarding_completed', v_profile.onboarding_completed,
          'created_at', v_profile.created_at,
          'updated_at', v_profile.updated_at
        )
      end,
    'workspace',
      case
        when v_workspace.id is null then null
        else jsonb_build_object(
          'id', v_workspace.id,
          'name', v_workspace.name,
          'created_at', v_workspace.created_at,
          'updated_at', v_workspace.updated_at
        )
      end,
    'role',
      case
        when v_workspace.id is not null and v_membership.role = 'owner' then 'owner'
        else null
      end
  );
end;
$$;

revoke all on function public.load_identity_state() from anon, public;
grant execute on function public.load_identity_state() to authenticated;
