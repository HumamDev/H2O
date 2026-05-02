create table if not exists public.billing_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  plan_key text not null,
  stripe_checkout_session_id text null unique,
  status text not null default 'pending',
  expires_at timestamptz not null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_checkout_attempts_status_check
    check (status in ('pending', 'completed', 'expired', 'abandoned')),
  constraint billing_checkout_attempts_plan_key_check
    check (plan_key in ('pro_monthly', 'pro_yearly')),
  constraint billing_checkout_attempts_expires_after_created_check
    check (expires_at > created_at)
);

create index if not exists billing_checkout_attempts_user_status_expires_idx
  on public.billing_checkout_attempts (user_id, status, expires_at);

create index if not exists billing_checkout_attempts_stripe_checkout_session_id_idx
  on public.billing_checkout_attempts (stripe_checkout_session_id);

create index if not exists billing_checkout_attempts_pending_idx
  on public.billing_checkout_attempts (user_id, stripe_customer_id, expires_at)
  where status = 'pending';

create unique index if not exists billing_checkout_attempts_one_pending_user_idx
  on public.billing_checkout_attempts (user_id)
  where status = 'pending';

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

drop trigger if exists billing_checkout_attempts_touch_updated_at on public.billing_checkout_attempts;
create trigger billing_checkout_attempts_touch_updated_at
before update on public.billing_checkout_attempts
for each row execute function public.touch_updated_at();

alter table public.billing_checkout_attempts enable row level security;
alter table public.billing_checkout_attempts force row level security;

revoke all on table public.billing_checkout_attempts from anon, authenticated, public;
