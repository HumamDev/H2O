import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";
import Stripe from "https://esm.sh/stripe@18.0.0?target=deno";

const STRIPE_API_VERSION = "2026-02-25.clover";
const PLAN_PRICE_ENV: Record<string, string> = Object.freeze({
  pro_monthly: "STRIPE_PRICE_PRO_MONTHLY",
  pro_yearly: "STRIPE_PRICE_PRO_YEARLY",
});

type JsonRecord = Record<string, unknown>;

type CheckoutAttemptRow = {
  id: string;
};

type Runtime = {
  stripe: Stripe;
  supabase: ReturnType<typeof createClient>;
  checkoutSuccessUrl: string;
  checkoutCancelUrl: string;
};

let runtimeCache: Runtime | null = null;

Deno.serve(async (request: Request): Promise<Response> => {
  const cors = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return cors
      ? new Response(null, { status: 204, headers: cors })
      : jsonResponse({ ok: false, error: "origin_not_allowed" }, 403);
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, cors);
  }

  if (request.headers.get("origin") && !cors) {
    return jsonResponse({ ok: false, error: "origin_not_allowed" }, 403);
  }

  const runtime = getRuntime();
  if (!runtime.ok) {
    return jsonResponse({ ok: false, error: runtime.error }, 500, cors);
  }

  const token = bearerToken(request);
  if (!token) {
    return jsonResponse({ ok: false, error: "missing_authorization" }, 401, cors);
  }

  const { data: userData, error: userError } = await runtime.value.supabase.auth.getUser(token);
  const userId = normalizeUuid(userData?.user?.id);
  if (userError || !userId) {
    return jsonResponse({ ok: false, error: "authentication_required" }, 401, cors);
  }

  let body: JsonRecord = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json_body" }, 400, cors);
  }

  const planKey = normalizePlanKey(body.planKey);
  if (!planKey) {
    return jsonResponse({ ok: false, error: "invalid_plan_key" }, 400, cors);
  }

  const priceId = Deno.env.get(PLAN_PRICE_ENV[planKey]) || "";
  if (!priceId) {
    return jsonResponse({ ok: false, error: "checkout_price_not_configured" }, 500, cors);
  }

  const activeSubscription = await hasActiveOrTrialingSubscription(runtime.value.supabase, userId);
  if (!activeSubscription.ok) {
    return jsonResponse({ ok: false, error: activeSubscription.error }, 500, cors);
  }
  if (activeSubscription.exists) {
    return jsonResponse({
      ok: false,
      error: "subscription_already_active",
      action: "open_portal",
    }, 409, cors);
  }

  const customer = await findOrCreateBillingCustomer(runtime.value.supabase, runtime.value.stripe, userId);
  if (!customer.ok) {
    return jsonResponse({ ok: false, error: customer.error }, 409, cors);
  }

  const stripeActiveSubscription = await hasStripeActiveOrTrialingSubscription(
    runtime.value.stripe,
    customer.stripeCustomerId,
  );
  if (!stripeActiveSubscription.ok) {
    return jsonResponse({ ok: false, error: stripeActiveSubscription.error }, 500, cors);
  }
  if (stripeActiveSubscription.exists) {
    return jsonResponse({
      ok: false,
      error: "subscription_already_active",
      action: "open_portal",
    }, 409, cors);
  }

  const expired = await expirePendingCheckoutAttempts(runtime.value.supabase, userId);
  if (!expired.ok) {
    return jsonResponse({ ok: false, error: expired.error }, 500, cors);
  }

  const pending = await findPendingCheckoutAttempt(
    runtime.value.supabase,
    userId,
    customer.stripeCustomerId,
  );
  if (!pending.ok) {
    return jsonResponse({ ok: false, error: pending.error }, 500, cors);
  }
  if (pending.exists) {
    return jsonResponse({ ok: false, error: "checkout_already_pending" }, 409, cors);
  }

  const attempt = await createPendingCheckoutAttempt(runtime.value.supabase, {
    userId,
    stripeCustomerId: customer.stripeCustomerId,
    planKey,
  });
  if (!attempt.ok) {
    const status = attempt.error === "checkout_already_pending" ? 409 : 500;
    return jsonResponse({ ok: false, error: attempt.error }, status, cors);
  }

  const session = await createCheckoutSession(runtime.value.stripe, {
    userId,
    stripeCustomerId: customer.stripeCustomerId,
    priceId,
    planKey,
    successUrl: runtime.value.checkoutSuccessUrl,
    cancelUrl: runtime.value.checkoutCancelUrl,
  });

  if (!session.ok) {
    await markCheckoutAttemptAbandoned(runtime.value.supabase, attempt.id);
    return jsonResponse({ ok: false, error: session.error }, 500, cors);
  }

  const sessionRecorded = await attachCheckoutSessionToAttempt(
    runtime.value.supabase,
    attempt.id,
    session.stripeCheckoutSessionId,
  );
  if (!sessionRecorded.ok) {
    return jsonResponse({ ok: false, error: sessionRecorded.error }, 500, cors);
  }

  return jsonResponse({ url: session.url }, 200, cors);
});

function getRuntime(): { ok: true; value: Runtime } | { ok: false; error: string } {
  if (runtimeCache) return { ok: true, value: runtimeCache };

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const supabaseUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const checkoutSuccessUrl = Deno.env.get("CHECKOUT_SUCCESS_URL") || "";
  const checkoutCancelUrl = Deno.env.get("CHECKOUT_CANCEL_URL") || "";

  if (!stripeSecretKey) return { ok: false, error: "stripe_secret_not_configured" };
  if (!supabaseUrl || !supabaseServiceRoleKey) return { ok: false, error: "supabase_service_not_configured" };
  if (!checkoutSuccessUrl || !checkoutCancelUrl) return { ok: false, error: "checkout_redirects_not_configured" };

  runtimeCache = {
    stripe: new Stripe(stripeSecretKey, {
      apiVersion: STRIPE_API_VERSION,
      httpClient: Stripe.createFetchHttpClient(),
    }),
    supabase: createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
    checkoutSuccessUrl,
    checkoutCancelUrl,
  };

  return { ok: true, value: runtimeCache };
}

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function normalizePlanKey(value: unknown): "pro_monthly" | "pro_yearly" | "" {
  const key = String(value || "").trim();
  return key === "pro_monthly" || key === "pro_yearly" ? key : "";
}

async function hasActiveOrTrialingSubscription(
  supabase: Runtime["supabase"],
  userId: string,
): Promise<{ ok: true; exists: boolean } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .limit(1);

  if (error) return { ok: false, error: "subscription_lookup_failed" };
  return { ok: true, exists: Array.isArray(data) && data.length > 0 };
}

async function hasStripeActiveOrTrialingSubscription(
  stripe: Stripe,
  stripeCustomerId: string,
): Promise<{ ok: true; exists: boolean } | { ok: false; error: string }> {
  try {
    const active = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "active",
      limit: 1,
    });
    if (Array.isArray(active.data) && active.data.length > 0) {
      return { ok: true, exists: true };
    }

    const trialing = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "trialing",
      limit: 1,
    });
    return { ok: true, exists: Array.isArray(trialing.data) && trialing.data.length > 0 };
  } catch {
    return { ok: false, error: "stripe_subscription_lookup_failed" };
  }
}

async function expirePendingCheckoutAttempts(
  supabase: Runtime["supabase"],
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("billing_checkout_attempts")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString());

  if (error) return { ok: false, error: "checkout_attempt_expire_failed" };
  return { ok: true };
}

async function findPendingCheckoutAttempt(
  supabase: Runtime["supabase"],
  userId: string,
  stripeCustomerId: string,
): Promise<{ ok: true; exists: boolean } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("billing_checkout_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("stripe_customer_id", stripeCustomerId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1);

  if (error) return { ok: false, error: "checkout_attempt_lookup_failed" };
  return { ok: true, exists: Array.isArray(data) && data.length > 0 };
}

async function createPendingCheckoutAttempt(
  supabase: Runtime["supabase"],
  input: {
    userId: string;
    stripeCustomerId: string;
    planKey: "pro_monthly" | "pro_yearly";
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("billing_checkout_attempts")
    .insert({
      user_id: input.userId,
      stripe_customer_id: input.stripeCustomerId,
      plan_key: input.planKey,
      status: "pending",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "checkout_already_pending" };
    return { ok: false, error: "checkout_attempt_insert_failed" };
  }

  const id = stringValue((data as CheckoutAttemptRow | null)?.id);
  if (!id) return { ok: false, error: "checkout_attempt_insert_failed" };
  return { ok: true, id };
}

async function attachCheckoutSessionToAttempt(
  supabase: Runtime["supabase"],
  attemptId: string,
  stripeCheckoutSessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("billing_checkout_attempts")
    .update({
      stripe_checkout_session_id: stripeCheckoutSessionId,
    })
    .eq("id", attemptId)
    .eq("status", "pending");

  if (error) return { ok: false, error: "checkout_attempt_update_failed" };
  return { ok: true };
}

async function markCheckoutAttemptAbandoned(
  supabase: Runtime["supabase"],
  attemptId: string,
): Promise<void> {
  await supabase
    .from("billing_checkout_attempts")
    .update({ status: "abandoned" })
    .eq("id", attemptId)
    .eq("status", "pending");
}

async function findOrCreateBillingCustomer(
  supabase: Runtime["supabase"],
  stripe: Stripe,
  userId: string,
): Promise<{ ok: true; stripeCustomerId: string } | { ok: false; error: string }> {
  const existing = await lookupBillingCustomerByUser(supabase, userId);
  if (!existing.ok) return existing;
  if (existing.stripeCustomerId) return { ok: true, stripeCustomerId: existing.stripeCustomerId };

  const customer = await createStripeCustomer(stripe, userId);
  if (!customer.ok) return customer;

  const inserted = await insertBillingCustomer(supabase, userId, customer.stripeCustomerId);
  if (inserted.ok) return { ok: true, stripeCustomerId: customer.stripeCustomerId };

  if (inserted.error !== "billing_customer_conflict") return inserted;

  const afterConflict = await lookupBillingCustomerByUser(supabase, userId);
  if (!afterConflict.ok) return afterConflict;
  if (afterConflict.stripeCustomerId === customer.stripeCustomerId) {
    return { ok: true, stripeCustomerId: customer.stripeCustomerId };
  }

  return { ok: false, error: "billing_customer_conflict" };
}

async function lookupBillingCustomerByUser(
  supabase: Runtime["supabase"],
  userId: string,
): Promise<{ ok: true; stripeCustomerId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, error: "billing_customer_lookup_failed" };
  return {
    ok: true,
    stripeCustomerId: stripeId((data as { stripe_customer_id?: unknown } | null)?.stripe_customer_id) || "",
  };
}

async function createStripeCustomer(
  stripe: Stripe,
  userId: string,
): Promise<{ ok: true; stripeCustomerId: string } | { ok: false; error: string }> {
  try {
    const customer = await stripe.customers.create({
      metadata: {
        user_id: userId,
      },
    });
    const stripeCustomerId = stripeId(customer.id);
    if (!stripeCustomerId) return { ok: false, error: "stripe_customer_create_failed" };
    return { ok: true, stripeCustomerId };
  } catch {
    return { ok: false, error: "stripe_customer_create_failed" };
  }
}

async function insertBillingCustomer(
  supabase: Runtime["supabase"],
  userId: string,
  stripeCustomerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("billing_customers")
    .insert({
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
    });

  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: false, error: "billing_customer_conflict" };
  return { ok: false, error: "billing_customer_insert_failed" };
}

async function createCheckoutSession(stripe: Stripe, input: {
  userId: string;
  stripeCustomerId: string;
  priceId: string;
  planKey: "pro_monthly" | "pro_yearly";
  successUrl: string;
  cancelUrl: string;
}): Promise<{ ok: true; url: string; stripeCheckoutSessionId: string } | { ok: false; error: string }> {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.stripeCustomerId,
      line_items: [
        {
          price: input.priceId,
          quantity: 1,
        },
      ],
      client_reference_id: input.userId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: {
        user_id: input.userId,
        plan_key: input.planKey,
      },
      subscription_data: {
        metadata: {
          user_id: input.userId,
          plan_key: input.planKey,
        },
      },
    });

    if (!session.url || !session.id) return { ok: false, error: "checkout_session_url_missing" };
    return { ok: true, url: session.url, stripeCheckoutSessionId: session.id };
  } catch {
    return { ok: false, error: "checkout_session_create_failed" };
  }
}

function corsHeadersFor(request: Request): Headers | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const allowed = allowedOrigins();
  if (!allowed.includes(origin)) return null;

  return new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "vary": "origin",
  });
}

function allowedOrigins(): string[] {
  return String(Deno.env.get("CHECKOUT_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeUuid(value: unknown): string {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text.toLowerCase()
    : "";
}

function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const id = (value as JsonRecord).id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  }
  return null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function jsonResponse(body: JsonRecord, status = 200, headers?: Headers | null): Response {
  const responseHeaders = new Headers(headers || undefined);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}
