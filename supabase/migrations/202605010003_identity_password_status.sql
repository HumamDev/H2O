-- Identity Phase 3.8E: durable password setup integrity gate.
-- Password setup status is deliberately separate from public.profiles so normal
-- profile update policies cannot mutate account credential readiness.

create table if not exists public.identity_password_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_setup_completed boolean not null default false,
  completed_source text null check (
    completed_source is null
    or completed_source in (
      'password_sign_up',
      'signup_confirmation',
      'password_sign_in',
      'password_recovery_update'
    )
  ),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.identity_password_status enable row level security;
alter table public.identity_password_status force row level security;

drop trigger if exists identity_password_status_touch_updated_at on public.identity_password_status;
create trigger identity_password_status_touch_updated_at
before update on public.identity_password_status
for each row
execute function public.touch_updated_at();

revoke all on table public.identity_password_status from anon, authenticated, public;

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
    'password_recovery_update'
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
  v_credential_state text := 'required';
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select case
           when ips.password_setup_completed is true then 'complete'
           else 'required'
         end
    into v_credential_state
    from public.identity_password_status ips
   where ips.user_id = v_uid;

  v_credential_state := coalesce(v_credential_state, 'required');

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
