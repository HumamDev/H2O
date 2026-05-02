-- Identity Phase 3.4A: read-only provider-backed identity restore.
-- This RPC derives the caller from auth.uid(), reads only safe profile/workspace
-- summary fields, and does not create, update, or delete rows.

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
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
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
