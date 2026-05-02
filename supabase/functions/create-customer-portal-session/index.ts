import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";
import Stripe from "https://esm.sh/stripe@18.0.0?target=deno";

const STRIPE_API_VERSION = "2026-02-25.clover";

type JsonRecord = Record<string, unknown>;

type Runtime = {
  stripe: Stripe;
  supabase: ReturnType<typeof createClient>;
  returnUrl: string;
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
    logPortalWarning("runtime_unavailable", { reason: runtime.error });
    return jsonResponse({
      ok: false,
      error: "billing/portal-failed",
      errorCode: "billing/portal-failed",
    }, 500, cors);
  }

  const token = bearerToken(request);
  if (!token) {
    logPortalWarning("missing_authorization");
    return jsonResponse({
      ok: false,
      error: "missing_authorization",
      errorCode: "missing_authorization",
    }, 401, cors);
  }

  const { data: userData, error: userError } = await runtime.value.supabase.auth.getUser(token);
  const userId = normalizeUuid(userData?.user?.id);
  if (userError || !userId) {
    const errorCode = userError
      ? "authentication_required_auth_get_user_failed"
      : "authentication_required_user_id_missing";
    logPortalWarning("authentication_required", {
      reason: errorCode,
      auth_get_user_error_code: sanitizeErrorCode(
        (userError as { code?: unknown; status?: unknown; name?: unknown } | null)?.code
          || (userError as { code?: unknown; status?: unknown; name?: unknown } | null)?.status
          || (userError as { code?: unknown; status?: unknown; name?: unknown } | null)?.name
      ),
      user_id_present: typeof userData?.user?.id === "string" && userData.user.id.trim().length > 0,
    });
    return jsonResponse({
      ok: false,
      error: "authentication_required",
      errorCode: "authentication_required",
    }, 401, cors);
  }

  const customer = await lookupBillingCustomerByUser(runtime.value.supabase, userId);
  if (!customer.ok) {
    logPortalWarning("billing_customer_lookup_failed", { reason: customer.error });
    return jsonResponse({ ok: false, error: "billing/portal-failed" }, 500, cors);
  }
  if (!customer.stripeCustomerId) {
    return jsonResponse({ ok: false, error: "billing/customer-not-found" }, 404, cors);
  }

  const session = await createPortalSession(runtime.value.stripe, {
    stripeCustomerId: customer.stripeCustomerId,
    returnUrl: runtime.value.returnUrl,
  });
  if (!session.ok) {
    logPortalWarning("portal_session_create_failed", { reason: session.error });
    return jsonResponse({ ok: false, error: "billing/portal-failed" }, 500, cors);
  }

  return jsonResponse({ url: session.url }, 200, cors);
});

function getRuntime(): { ok: true; value: Runtime } | { ok: false; error: string } {
  if (runtimeCache) return { ok: true, value: runtimeCache };

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const supabaseUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const returnUrl = Deno.env.get("CUSTOMER_PORTAL_RETURN_URL") || "";

  if (!stripeSecretKey) return { ok: false, error: "stripe_secret_not_configured" };
  if (!supabaseUrl || !supabaseServiceRoleKey) return { ok: false, error: "supabase_service_not_configured" };
  if (!returnUrl) return { ok: false, error: "customer_portal_return_url_not_configured" };

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
    returnUrl,
  };

  return { ok: true, value: runtimeCache };
}

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
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

async function createPortalSession(stripe: Stripe, input: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: input.stripeCustomerId,
      return_url: input.returnUrl,
    });
    if (!session.url) return { ok: false, error: "customer_portal_session_url_missing" };
    return { ok: true, url: session.url };
  } catch {
    return { ok: false, error: "customer_portal_session_create_failed" };
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
  return String(Deno.env.get("CUSTOMER_PORTAL_ALLOWED_ORIGINS") || "")
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

function logPortalWarning(code: string, detail: JsonRecord = {}): void {
  const safeDetail = sanitizeLogDetail(detail);
  try {
    console.warn("[h2o-billing:create-customer-portal-session]", {
      code: sanitizeErrorCode(code) || "unknown",
      ...safeDetail,
    });
  } catch {
    // Logging must never affect the request path.
  }
}

function sanitizeLogDetail(detail: JsonRecord): JsonRecord {
  const out: JsonRecord = {};
  for (const [key, value] of Object.entries(detail || {})) {
    const safeKey = sanitizeErrorCode(key);
    if (!safeKey || /token|secret|authorization|password|key/i.test(safeKey)) continue;
    if (typeof value === "boolean") {
      out[safeKey] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[safeKey] = value;
    } else if (typeof value === "string") {
      out[safeKey] = sanitizeErrorCode(value);
    }
  }
  return out;
}

function sanitizeErrorCode(value: unknown): string | null {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_/-]/g, "")
    .slice(0, 96);
  return text || null;
}

function jsonResponse(body: JsonRecord, status = 200, headers?: Headers | null): Response {
  const responseHeaders = new Headers(headers || undefined);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}
