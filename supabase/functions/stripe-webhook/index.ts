import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";
import Stripe from "https://esm.sh/stripe@18.0.0?target=deno";

const STRIPE_API_VERSION = "2026-02-25.clover";
const SUPPORTED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

type JsonRecord = Record<string, unknown>;

type WebhookEventRow = {
  stripe_event_id: string;
  event_type: string;
  object_id: string | null;
  event_created_at: string | null;
  received_at: string;
  processed_at: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  processing_error: string | null;
};

type BillingSubscriptionRow = {
  stripe_subscription_id: string;
  user_id: string;
  last_stripe_event_created_at: string | null;
};

type EventHandlingResult = {
  ok: true;
  supported: boolean;
  synced: boolean;
  stale: boolean;
  entitlementActivated: boolean;
  skippedReason?: string;
} | {
  ok: false;
  error: string;
};

const stripeSecretKey = requiredEnv("STRIPE_SECRET_KEY");
const stripeWebhookSecret = requiredEnv("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = requiredEnv("SUPABASE_URL");
const supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
});

const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse({ ok: false, error: "missing_stripe_signature" }, 400);
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_request_body" }, 400);
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      stripeWebhookSecret,
      undefined,
      stripeCryptoProvider,
    );
  } catch {
    return jsonResponse({ ok: false, error: "invalid_stripe_signature" }, 400);
  }

  const eventId = String(event.id || "").trim();
  if (!eventId) {
    return jsonResponse({ ok: false, error: "missing_stripe_event_id" }, 400);
  }

  const eventType = String(event.type || "").trim();
  const objectId = getStripeObjectId(event);
  const eventCreatedAt = stripeEpochToIso(event.created);

  const recorded = await ensureWebhookEventRecorded({
    stripe_event_id: eventId,
    event_type: eventType,
    object_id: objectId,
    event_created_at: eventCreatedAt,
  });

  if (!recorded.ok) {
    return jsonResponse({ ok: false, error: recorded.error }, 500);
  }

  if (recorded.row?.processed_at) {
    return jsonResponse({
      ok: true,
      duplicate: true,
      processed: true,
      eventId,
      eventType,
    });
  }

  const attempted = await markProcessingAttempt(recorded.row || {
    stripe_event_id: eventId,
    event_type: eventType,
    object_id: objectId,
    event_created_at: eventCreatedAt,
    received_at: new Date().toISOString(),
    processed_at: null,
    attempt_count: 0,
    last_attempt_at: null,
    processing_error: null,
  });

  if (!attempted.ok) {
    return jsonResponse({ ok: false, error: attempted.error }, 500);
  }

  const handling = await handleStripeEvent(event);
  if (!handling.ok) {
    await markProcessingError(eventId, handling.error);
    return jsonResponse({ ok: false, error: handling.error }, 500);
  }

  const completed = await markProcessed(eventId);
  if (!completed.ok) {
    return jsonResponse({ ok: false, error: completed.error }, 500);
  }

  return jsonResponse({
    ok: true,
    eventId,
    eventType,
    supported: handling.supported,
    processed: true,
    synced: handling.synced,
    stale: handling.stale,
    entitlementActivated: handling.entitlementActivated,
    skippedReason: handling.skippedReason || null,
  });
});

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function ensureWebhookEventRecorded(input: {
  stripe_event_id: string;
  event_type: string;
  object_id: string | null;
  event_created_at: string | null;
}): Promise<{ ok: true; row: WebhookEventRow | null } | { ok: false; error: string }> {
  const { data: inserted, error: insertError } = await supabase
    .from("stripe_webhook_events")
    .insert({
      stripe_event_id: input.stripe_event_id,
      event_type: input.event_type,
      object_id: input.object_id,
      event_created_at: input.event_created_at,
      received_at: new Date().toISOString(),
      attempt_count: 0,
    })
    .select("*")
    .maybeSingle();

  if (!insertError) {
    return { ok: true, row: (inserted as WebhookEventRow | null) };
  }

  if (insertError.code !== "23505") {
    return { ok: false, error: "webhook_event_record_failed" };
  }

  const { data: existing, error: selectError } = await supabase
    .from("stripe_webhook_events")
    .select("*")
    .eq("stripe_event_id", input.stripe_event_id)
    .maybeSingle();

  if (selectError) {
    return { ok: false, error: "webhook_event_lookup_failed" };
  }

  return { ok: true, row: (existing as WebhookEventRow | null) };
}

async function markProcessingAttempt(
  row: WebhookEventRow,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nextAttemptCount = Math.max(0, Number(row.attempt_count || 0)) + 1;
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      attempt_count: nextAttemptCount,
      last_attempt_at: new Date().toISOString(),
      processing_error: null,
    })
    .eq("stripe_event_id", row.stripe_event_id)
    .is("processed_at", null);

  if (error) return { ok: false, error: "webhook_attempt_update_failed" };
  return { ok: true };
}

async function markProcessed(
  stripeEventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      processing_error: null,
    })
    .eq("stripe_event_id", stripeEventId)
    .is("processed_at", null);

  if (error) return { ok: false, error: "webhook_processed_update_failed" };
  return { ok: true };
}

async function markProcessingError(stripeEventId: string, errorCode: string): Promise<void> {
  await supabase
    .from("stripe_webhook_events")
    .update({
      processing_error: safeErrorCode(errorCode),
    })
    .eq("stripe_event_id", stripeEventId)
    .is("processed_at", null);
}

async function handleStripeEvent(
  event: Stripe.Event,
): Promise<EventHandlingResult> {
  const eventType = String(event.type || "");
  if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
    return {
      ok: true,
      supported: false,
      synced: false,
      stale: false,
      entitlementActivated: false,
      skippedReason: "unsupported_event_type",
    };
  }

  const object = event.data?.object as JsonRecord | undefined;
  if (!object || typeof object !== "object") {
    return { ok: false, error: "stripe_event_object_missing" };
  }

  switch (eventType) {
    case "checkout.session.completed":
      return syncCheckoutSessionCompleted(event, object);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncCustomerSubscriptionEvent(event, object);
    case "invoice.payment_failed":
      return syncInvoicePaymentFailed(event, object);
    default:
      return {
        ok: true,
        supported: false,
        synced: false,
        stale: false,
        entitlementActivated: false,
        skippedReason: "unsupported_event_type",
      };
  }
}

async function syncCheckoutSessionCompleted(
  event: Stripe.Event,
  session: JsonRecord,
): Promise<EventHandlingResult> {
  const checkoutSessionId = stripeId(session.id);
  if (checkoutSessionId) {
    await markCheckoutAttemptCompleted(checkoutSessionId);
  }

  const userId = normalizeUuid(
    stringValue(session.client_reference_id)
      || metadataString(session, "user_id"),
  );
  if (!userId) return handledWithoutSync("checkout_user_id_missing");

  const customerId = stripeId(session.customer);
  if (customerId) {
    const customerUpsert = await upsertBillingCustomer(userId, customerId);
    if (!customerUpsert.ok) return customerUpsert;
  }

  const subscriptionId = stripeId(session.subscription);
  if (!subscriptionId) return handledWithoutSync("checkout_subscription_missing");

  const subscription = await retrieveSubscription(subscriptionId);
  if (!subscription) return { ok: false, error: "stripe_subscription_fetch_failed" };

  return syncSubscriptionAndEntitlement({
    subscription,
    userId,
    event,
  });
}

async function markCheckoutAttemptCompleted(stripeCheckoutSessionId: string): Promise<void> {
  await supabase
    .from("billing_checkout_attempts")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("stripe_checkout_session_id", stripeCheckoutSessionId)
    .eq("status", "pending");
}

async function syncCustomerSubscriptionEvent(
  event: Stripe.Event,
  subscriptionObject: JsonRecord,
): Promise<EventHandlingResult> {
  const subscriptionId = stripeId(subscriptionObject.id);
  const eventSubscription = subscriptionId ? subscriptionObject : null;
  const fetchedSubscription = event.type === "customer.subscription.deleted"
    ? null
    : await retrieveSubscription(subscriptionId);
  const subscription = fetchedSubscription || eventSubscription;

  if (!subscription) return { ok: false, error: "stripe_subscription_missing" };

  const customerId = stripeId(subscription.customer) || stripeId(subscriptionObject.customer);
  const metadataUserId = normalizeUuid(
    metadataString(subscription, "user_id")
      || metadataString(subscriptionObject, "user_id"),
  );
  const mappedUserId = metadataUserId || (customerId ? await lookupUserIdByCustomer(customerId) : "");
  if (!mappedUserId) return { ok: false, error: "billing_user_mapping_unresolved" };

  if (customerId) {
    const customerUpsert = await upsertBillingCustomer(mappedUserId, customerId);
    if (!customerUpsert.ok) return customerUpsert;
  }

  return syncSubscriptionAndEntitlement({
    subscription,
    userId: mappedUserId,
    event,
  });
}

async function syncInvoicePaymentFailed(
  event: Stripe.Event,
  invoice: JsonRecord,
): Promise<EventHandlingResult> {
  const subscriptionId = stripeId(invoice.subscription);
  const customerId = stripeId(invoice.customer);
  const subscription = subscriptionId ? await retrieveSubscription(subscriptionId) : null;
  const metadataUserId = normalizeUuid(
    metadataString(subscription || {}, "user_id")
      || metadataString(invoice, "user_id"),
  );
  const mappedUserId = metadataUserId || (customerId ? await lookupUserIdByCustomer(customerId) : "");

  if (!subscription) return { ok: false, error: "stripe_subscription_fetch_failed" };
  if (!mappedUserId) return { ok: false, error: "billing_user_mapping_unresolved" };

  if (customerId) {
    const customerUpsert = await upsertBillingCustomer(mappedUserId, customerId);
    if (!customerUpsert.ok) return customerUpsert;
  }

  return syncSubscriptionAndEntitlement({
    subscription,
    userId: mappedUserId,
    event,
  });
}

async function syncSubscriptionAndEntitlement(input: {
  subscription: JsonRecord;
  userId: string;
  event: Stripe.Event;
}): Promise<EventHandlingResult> {
  const subscription = input.subscription;
  const subscriptionId = stripeId(subscription.id);
  if (!subscriptionId) return { ok: false, error: "stripe_subscription_id_missing" };

  const eventCreatedAt = stripeEpochToIso(input.event.created);
  const existing = await getBillingSubscription(subscriptionId);
  if (!existing.ok) return existing;

  if (isStaleSubscriptionEvent(eventCreatedAt, existing.row?.last_stripe_event_created_at || null)) {
    return {
      ok: true,
      supported: true,
      synced: false,
      stale: true,
      entitlementActivated: false,
      skippedReason: "stale_stripe_event",
    };
  }

  const customerId = stripeId(subscription.customer);
  if (!customerId) return { ok: false, error: "stripe_subscription_customer_missing" };

  const customerUpsert = await upsertBillingCustomer(input.userId, customerId);
  if (!customerUpsert.ok) return customerUpsert;

  const priceId = primaryPriceId(subscription);
  const status = safeSubscriptionStatus(subscription.status);
  const currentPeriod = subscriptionPeriod(subscription);
  const currentPeriodStart = currentPeriod.currentPeriodStart;
  const currentPeriodEnd = currentPeriod.currentPeriodEnd;
  const premiumEnabled = status === "active" || status === "trialing";
  const now = new Date().toISOString();

  const { error: subscriptionError } = await supabase
    .from("billing_subscriptions")
    .upsert({
      stripe_subscription_id: subscriptionId,
      user_id: input.userId,
      stripe_customer_id: customerId,
      stripe_price_id: priceId,
      status,
      cancel_at_period_end: subscription.cancel_at_period_end === true,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      trial_end: stripeEpochToIso(subscription.trial_end),
      synced_at: now,
      latest_stripe_event_id: input.event.id,
      last_stripe_event_created_at: eventCreatedAt,
    }, { onConflict: "stripe_subscription_id" });

  if (subscriptionError) return { ok: false, error: "billing_subscription_upsert_failed" };

  const { error: entitlementError } = await supabase
    .from("billing_entitlements")
    .upsert({
      user_id: input.userId,
      tier: premiumEnabled ? "pro" : "free",
      premium_enabled: premiumEnabled,
      source: "stripe_webhook",
      source_subscription_id: subscriptionId,
      valid_until: premiumEnabled ? currentPeriodEnd : null,
      synced_at: now,
    }, { onConflict: "user_id" });

  if (entitlementError) return { ok: false, error: "billing_entitlement_upsert_failed" };

  return {
    ok: true,
    supported: true,
    synced: true,
    stale: false,
    entitlementActivated: premiumEnabled,
  };
}

async function getBillingSubscription(
  subscriptionId: string,
): Promise<{ ok: true; row: BillingSubscriptionRow | null } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("stripe_subscription_id,user_id,last_stripe_event_created_at")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (error) return { ok: false, error: "billing_subscription_lookup_failed" };
  return { ok: true, row: (data as BillingSubscriptionRow | null) };
}

async function upsertBillingCustomer(
  userId: string,
  stripeCustomerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: selectError } = await supabase
    .from("billing_customers")
    .select("user_id,stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) return { ok: false, error: "billing_customer_lookup_failed" };

  const existingCustomerId = stringValue(
    (existing as { stripe_customer_id?: unknown } | null)?.stripe_customer_id,
  );
  if (existingCustomerId) {
    if (existingCustomerId !== stripeCustomerId) {
      return { ok: false, error: "billing_customer_conflict" };
    }

    const { error: touchError } = await supabase
      .from("billing_customers")
      .update({ updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("stripe_customer_id", stripeCustomerId);

    if (touchError) return { ok: false, error: "billing_customer_touch_failed" };
    return { ok: true };
  }

  const { error: insertError } = await supabase
    .from("billing_customers")
    .insert({
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
    });

  if (insertError) {
    if (insertError.code === "23505") return { ok: false, error: "billing_customer_conflict" };
    return { ok: false, error: "billing_customer_insert_failed" };
  }

  return { ok: true };
}

async function lookupUserIdByCustomer(stripeCustomerId: string): Promise<string> {
  const { data, error } = await supabase
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) return "";
  return normalizeUuid((data as { user_id?: unknown } | null)?.user_id);
}

async function retrieveSubscription(subscriptionId: string | null): Promise<JsonRecord | null> {
  if (!subscriptionId) return null;
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription as unknown as JsonRecord;
  } catch {
    return null;
  }
}

function handledWithoutSync(skippedReason: string): EventHandlingResult {
  return {
    ok: true,
    supported: true,
    synced: false,
    stale: false,
    entitlementActivated: false,
    skippedReason,
  };
}

function isStaleSubscriptionEvent(incoming: string | null, stored: string | null): boolean {
  if (!incoming || !stored) return false;
  const incomingMs = Date.parse(incoming);
  const storedMs = Date.parse(stored);
  if (!Number.isFinite(incomingMs) || !Number.isFinite(storedMs)) return false;
  return incomingMs < storedMs;
}

function metadataString(object: JsonRecord | null | undefined, key: string): string {
  const metadata = object && typeof object === "object" ? object.metadata : null;
  if (!metadata || typeof metadata !== "object") return "";
  const value = (metadata as JsonRecord)[key];
  return typeof value === "string" ? value.trim() : "";
}

function primaryPriceId(subscription: JsonRecord): string | null {
  const direct = stripeId(subscription.plan);
  const first = primarySubscriptionItem(subscription);
  const price = first && typeof first === "object" ? first.price : null;
  return stripeId(price) || direct;
}

function primarySubscriptionItem(subscription: JsonRecord): JsonRecord | null {
  const items = subscription.items as JsonRecord | undefined;
  const data = Array.isArray(items?.data) ? items?.data : [];
  const first = data[0];
  return first && typeof first === "object" && !Array.isArray(first)
    ? first as JsonRecord
    : null;
}

function subscriptionPeriod(subscription: JsonRecord): {
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
} {
  const directStart = stripeEpochToIso(subscription.current_period_start);
  const directEnd = stripeEpochToIso(subscription.current_period_end);
  if (directStart || directEnd) {
    return {
      currentPeriodStart: directStart,
      currentPeriodEnd: directEnd,
    };
  }

  const primaryItem = primarySubscriptionItem(subscription);
  const primaryStart = stripeEpochToIso(primaryItem?.current_period_start);
  const primaryEnd = stripeEpochToIso(primaryItem?.current_period_end)
    || stripeEpochToIso(primaryItem?.billed_until);
  if (primaryStart || primaryEnd) {
    return {
      currentPeriodStart: primaryStart,
      currentPeriodEnd: primaryEnd,
    };
  }

  const items = subscription.items as JsonRecord | undefined;
  const data = Array.isArray(items?.data) ? items?.data : [];
  for (const rawItem of data) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) continue;
    const item = rawItem as JsonRecord;
    const itemStart = stripeEpochToIso(item.current_period_start);
    const itemEnd = stripeEpochToIso(item.current_period_end) || stripeEpochToIso(item.billed_until);
    if (itemStart || itemEnd) {
      return {
        currentPeriodStart: itemStart,
        currentPeriodEnd: itemEnd,
      };
    }
  }

  return {
    currentPeriodStart: null,
    currentPeriodEnd: null,
  };
}

function safeSubscriptionStatus(value: unknown): string {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_/-]/g, "")
    .slice(0, 48) || "unknown";
}

function normalizeUuid(value: unknown): string {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text.toLowerCase()
    : "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const id = (value as JsonRecord).id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  }
  return null;
}

function getStripeObjectId(event: Stripe.Event): string | null {
  const object = event.data?.object as JsonRecord | undefined;
  const id = object && typeof object === "object" ? object.id : null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function stripeEpochToIso(value: unknown): string | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Math.floor(seconds) * 1000).toISOString();
}

function safeErrorCode(value: string): string {
  return String(value || "webhook_processing_failed")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_/-]/g, "")
    .slice(0, 96) || "webhook_processing_failed";
}

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
