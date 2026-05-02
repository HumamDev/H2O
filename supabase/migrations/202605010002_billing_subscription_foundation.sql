create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_price_id text,
  status text not null,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  synced_at timestamptz not null default now(),
  latest_stripe_event_id text,
  last_stripe_event_created_at timestamptz
);

create table if not exists public.billing_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free',
  premium_enabled boolean not null default false,
  source text not null default 'stripe_webhook',
  source_subscription_id text null,
  valid_until timestamptz null,
  synced_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  object_id text null,
  event_created_at timestamptz null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz null,
  processing_error text null,
  constraint stripe_webhook_events_attempt_count_nonnegative check (attempt_count >= 0)
);

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

drop trigger if exists billing_customers_touch_updated_at on public.billing_customers;
create trigger billing_customers_touch_updated_at
  before update on public.billing_customers
  for each row
  execute function public.touch_updated_at();

create index if not exists billing_customers_stripe_customer_id_idx
  on public.billing_customers (stripe_customer_id);

create index if not exists billing_subscriptions_user_id_idx
  on public.billing_subscriptions (user_id);

create index if not exists billing_subscriptions_stripe_customer_id_idx
  on public.billing_subscriptions (stripe_customer_id);

create index if not exists billing_subscriptions_latest_stripe_event_id_idx
  on public.billing_subscriptions (latest_stripe_event_id);

create index if not exists billing_entitlements_source_subscription_id_idx
  on public.billing_entitlements (source_subscription_id);

create index if not exists stripe_webhook_events_unprocessed_idx
  on public.stripe_webhook_events (received_at, stripe_event_id)
  where processed_at is null;

alter table public.billing_customers enable row level security;
alter table public.billing_customers force row level security;

alter table public.billing_subscriptions enable row level security;
alter table public.billing_subscriptions force row level security;

alter table public.billing_entitlements enable row level security;
alter table public.billing_entitlements force row level security;

alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;

create or replace function public.get_current_entitlement()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entitlement public.billing_entitlements%rowtype;
  v_subscription public.billing_subscriptions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select be.*
    into v_entitlement
    from public.billing_entitlements be
   where be.user_id = v_uid;

  if v_entitlement.user_id is not null and v_entitlement.source_subscription_id is not null then
    select bs.*
      into v_subscription
      from public.billing_subscriptions bs
     where bs.stripe_subscription_id = v_entitlement.source_subscription_id
       and bs.user_id = v_uid;
  end if;

  return jsonb_build_object(
    'tier', coalesce(v_entitlement.tier, 'free'),
    'premiumEnabled', coalesce(v_entitlement.premium_enabled, false),
    'subscriptionStatus',
      case
        when v_subscription.stripe_subscription_id is null then null
        else v_subscription.status
      end,
    'currentPeriodEnd',
      case
        when v_subscription.stripe_subscription_id is null then null
        else v_subscription.current_period_end
      end,
    'cancelAtPeriodEnd',
      case
        when v_subscription.stripe_subscription_id is null then false
        else v_subscription.cancel_at_period_end
      end,
    'validUntil', v_entitlement.valid_until,
    'syncedAt', coalesce(v_entitlement.synced_at, now())
  );
end;
$$;

revoke all on table public.billing_customers from anon, authenticated, public;
revoke all on table public.billing_subscriptions from anon, authenticated, public;
revoke all on table public.billing_entitlements from anon, authenticated, public;
revoke all on table public.stripe_webhook_events from anon, authenticated, public;

revoke all on function public.get_current_entitlement() from anon, authenticated, public;
grant execute on function public.get_current_entitlement() to authenticated;
