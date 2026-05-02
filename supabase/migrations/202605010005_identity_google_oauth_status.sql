-- Identity Phase 3.9B: Google OAuth credential status.
-- OAuth credential completion is separate from password status so Google-only
-- accounts can satisfy the credential gate without creating a password.

create table if not exists public.identity_oauth_status (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  credential_completed boolean not null default true,
  completed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.identity_oauth_status enable row level security;
alter table public.identity_oauth_status force row level security;

drop trigger if exists identity_oauth_status_touch_updated_at on public.identity_oauth_status;
create trigger identity_oauth_status_touch_updated_at
before update on public.identity_oauth_status
for each row
execute function public.touch_updated_at();

revoke all on table public.identity_oauth_status from anon, authenticated, public;

create or replace function public.mark_oauth_credential_completed(p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_provider text := lower(nullif(btrim(p_provider), ''));
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_provider <> 'google' then
    raise exception 'Invalid OAuth credential provider' using errcode = '22023';
  end if;

  insert into public.identity_oauth_status (
    user_id,
    provider,
    credential_completed,
    completed_at,
    last_seen_at,
    created_at,
    updated_at
  )
  values (
    v_uid,
    v_provider,
    true,
    now(),
    now(),
    now(),
    now()
  )
  on conflict (user_id, provider) do update
     set credential_completed = true,
         last_seen_at = now(),
         updated_at = now();

  return jsonb_build_object(
    'credential_state', 'complete',
    'credential_provider', v_provider
  );
end;
$$;

revoke all on function public.mark_oauth_credential_completed(text) from anon, public;
grant execute on function public.mark_oauth_credential_completed(text) to authenticated;

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
