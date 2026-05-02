-- Identity Phase 4.0B: Account & Security MVP RPCs.
-- These functions keep account edits behind authenticated SECURITY DEFINER
-- calls and return only the safe DTOs consumed by the extension.

alter table public.identity_password_status
  drop constraint if exists identity_password_status_completed_source_check;

alter table public.identity_password_status
  add constraint identity_password_status_completed_source_check
  check (
    completed_source is null
    or completed_source in (
      'password_sign_up',
      'signup_confirmation',
      'password_sign_in',
      'password_recovery_update',
      'password_account_change'
    )
  );

create or replace function public.mark_password_setup_completed(p_source text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_source text := nullif(btrim(p_source), '');
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_source not in (
    'password_sign_up',
    'signup_confirmation',
    'password_sign_in',
    'password_recovery_update',
    'password_account_change'
  ) then
    raise exception 'Invalid password setup source' using errcode = '22023';
  end if;

  insert into public.identity_password_status (
    user_id,
    password_setup_completed,
    completed_source,
    completed_at,
    created_at,
    updated_at
  )
  values (
    v_uid,
    true,
    v_source,
    now(),
    now(),
    now()
  )
  on conflict (user_id) do update
     set password_setup_completed = true,
         completed_source = excluded.completed_source,
         completed_at = now(),
         updated_at = now();

  return jsonb_build_object('credential_state', 'complete');
end;
$$;

revoke all on function public.mark_password_setup_completed(text) from anon, public;
grant execute on function public.mark_password_setup_completed(text) to authenticated;

create or replace function public.update_identity_profile(
  p_display_name text,
  p_avatar_color text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_avatar_color text := btrim(coalesce(p_avatar_color, ''));
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(v_display_name) < 1 or char_length(v_display_name) > 64 then
    raise exception 'Invalid display name' using errcode = '22023';
  end if;

  if v_avatar_color !~ '^[a-z0-9][a-z0-9_-]{0,31}$' then
    raise exception 'Invalid avatar color' using errcode = '22023';
  end if;

  update public.profiles
     set display_name = v_display_name,
         avatar_color = v_avatar_color,
         updated_at = now()
   where id = v_uid
     and deleted_at is null
   returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'avatar_color', v_profile.avatar_color,
      'onboarding_completed', v_profile.onboarding_completed,
      'created_at', v_profile.created_at,
      'updated_at', v_profile.updated_at
    )
  );
end;
$$;

revoke all on function public.update_identity_profile(text, text) from anon, public;
grant execute on function public.update_identity_profile(text, text) to authenticated;

create or replace function public.rename_identity_workspace(p_workspace_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_workspace_name text := btrim(coalesce(p_workspace_name, ''));
  v_workspace public.workspaces%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(v_workspace_name) < 1 or char_length(v_workspace_name) > 64 then
    raise exception 'Invalid workspace name' using errcode = '22023';
  end if;

  update public.workspaces w
     set name = v_workspace_name,
         updated_at = now()
   where w.id = (
     select wm.workspace_id
       from public.workspace_memberships wm
       join public.workspaces owned
         on owned.id = wm.workspace_id
      where wm.user_id = v_uid
        and wm.role = 'owner'
        and owned.owner_user_id = v_uid
        and owned.deleted_at is null
      order by wm.created_at asc, wm.id asc
      limit 1
   )
     and w.owner_user_id = v_uid
     and w.deleted_at is null
   returning * into v_workspace;

  if v_workspace.id is null then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_workspace.id,
      'name', v_workspace.name,
      'created_at', v_workspace.created_at,
      'updated_at', v_workspace.updated_at
    ),
    'role', 'owner'
  );
end;
$$;

revoke all on function public.rename_identity_workspace(text) from anon, public;
grant execute on function public.rename_identity_workspace(text) to authenticated;
