create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_color text not null,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint profiles_display_name_length check (
    char_length(btrim(display_name)) between 1 and 64
  ),
  constraint profiles_avatar_color_slug check (
    avatar_color ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
  )
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint workspaces_name_length check (
    char_length(btrim(name)) between 1 and 64
  )
);

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_memberships_role_owner_only check (role in ('owner')),
  constraint workspace_memberships_workspace_user_unique unique (workspace_id, user_id)
);

create unique index if not exists workspaces_one_active_per_owner_idx
  on public.workspaces (owner_user_id)
  where deleted_at is null;

create index if not exists workspaces_owner_user_id_idx
  on public.workspaces (owner_user_id);

create index if not exists workspace_memberships_user_id_idx
  on public.workspace_memberships (user_id);

create index if not exists workspace_memberships_workspace_id_idx
  on public.workspace_memberships (workspace_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

drop trigger if exists workspaces_touch_updated_at on public.workspaces;
create trigger workspaces_touch_updated_at
  before update on public.workspaces
  for each row
  execute function public.touch_updated_at();

drop trigger if exists workspace_memberships_touch_updated_at on public.workspace_memberships;
create trigger workspace_memberships_touch_updated_at
  before update on public.workspace_memberships
  for each row
  execute function public.touch_updated_at();

create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = auth.uid()
      and w.deleted_at is null
  );
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
      and w.deleted_at is null
  );
$$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;

alter table public.workspace_memberships enable row level security;
alter table public.workspace_memberships force row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
  on public.workspaces
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or public.is_workspace_member(id)
  );

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner
  on public.workspaces
  for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner
  on public.workspaces
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists workspace_memberships_select_member on public.workspace_memberships;
create policy workspace_memberships_select_member
  on public.workspace_memberships
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );

drop policy if exists workspace_memberships_insert_owner_self on public.workspace_memberships;
create policy workspace_memberships_insert_owner_self
  on public.workspace_memberships
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and public.is_workspace_owner(workspace_id)
  );

create or replace function public.complete_onboarding(
  p_display_name text,
  p_avatar_color text,
  p_workspace_name text
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
  v_workspace_name text := btrim(coalesce(p_workspace_name, ''));
  v_profile public.profiles%rowtype;
  v_workspace public.workspaces%rowtype;
  v_membership public.workspace_memberships%rowtype;
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

  if char_length(v_workspace_name) < 1 or char_length(v_workspace_name) > 64 then
    raise exception 'Invalid workspace name' using errcode = '22023';
  end if;

  insert into public.profiles (
    id,
    display_name,
    avatar_color,
    onboarding_completed,
    deleted_at
  )
  values (
    v_uid,
    v_display_name,
    v_avatar_color,
    true,
    null
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        avatar_color = excluded.avatar_color,
        onboarding_completed = true,
        deleted_at = null,
        updated_at = now()
  returning * into v_profile;

  insert into public.workspaces (
    owner_user_id,
    name,
    deleted_at
  )
  values (
    v_uid,
    v_workspace_name,
    null
  )
  on conflict (owner_user_id) where deleted_at is null do update
    set name = excluded.name,
        updated_at = now()
  returning * into v_workspace;

  insert into public.workspace_memberships (
    workspace_id,
    user_id,
    role
  )
  values (
    v_workspace.id,
    v_uid,
    'owner'
  )
  on conflict (workspace_id, user_id) do update
    set role = 'owner',
        updated_at = now()
  returning * into v_membership;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'avatar_color', v_profile.avatar_color,
      'onboarding_completed', v_profile.onboarding_completed,
      'created_at', v_profile.created_at,
      'updated_at', v_profile.updated_at
    ),
    'workspace', jsonb_build_object(
      'id', v_workspace.id,
      'owner_user_id', v_workspace.owner_user_id,
      'name', v_workspace.name,
      'created_at', v_workspace.created_at,
      'updated_at', v_workspace.updated_at
    ),
    'role', v_membership.role
  );
end;
$$;

revoke all on table public.profiles from anon, public;
revoke all on table public.workspaces from anon, public;
revoke all on table public.workspace_memberships from anon, public;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.workspaces to authenticated;
grant select, insert on table public.workspace_memberships to authenticated;

revoke all on function public.touch_updated_at() from anon, public;
revoke all on function public.is_workspace_owner(uuid) from anon, public;
revoke all on function public.is_workspace_member(uuid) from anon, public;
revoke all on function public.complete_onboarding(text, text, text) from anon, public;

grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.complete_onboarding(text, text, text) to authenticated;
