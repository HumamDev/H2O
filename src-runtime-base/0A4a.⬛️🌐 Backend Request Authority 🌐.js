// ==H2O Module==
// @h2o-id             0a4a.backend.request.authority
// @name               0A4a.⬛️🌐 Backend Request Authority 🌐
// @namespace          H2O.Premium.CGX.backend.request.authority
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260814-000001
// @description        Single serialization/pacing authority for authenticated ChatGPT backend traffic (Web Lock, cooldown, token, classification).
// @match              https://chatgpt.com/*
// @run-at             document-start
// @grant              none
// ==/H2O Module==

/* Why this module exists.

   ChatGPT rate-limits its authenticated backend per account. Every H2O caller
   used to hold its own transport: an uncached session fetch before each call,
   its own retry policy, and no memory of a limit once the page reloaded. A
   single 429 could therefore be met with more requests rather than fewer, and
   reloading — the natural response to a page that seems stuck — reset every
   guard and resumed at full rate.

   The fix is not a governor per module. Independent governors each obey their
   own pacing while collectively producing an unsafe rate, so all authenticated
   backend traffic converges here.

   IMPORTANT — what "one authority" means. This module is instantiated in every
   ChatGPT tab; there is no single instance. The guarantee is that all those
   instances contend for one named exclusive Web Lock, which is scoped to the
   origin's storage bucket within a browser profile. That lock, not the module,
   is the serialization domain. Cooldown and pacing state live in localStorage
   so they are shared by the same set of tabs the lock coordinates.

   Known limits, stated rather than implied: the lock coordinates page contexts
   on the supported origin only. It does not reach other browser profiles (a
   launcher-level concern), the extension background worker (a different
   security origin, which cannot join this lock), or ChatGPT's own page traffic.
   H2O can keep its own consumers from causing or amplifying a rate-limit storm
   and can obey server cooldown feedback. It cannot guarantee the server never
   returns 429. */

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  const BOOT_KEY = '__h2oBackendAuthorityBooted_v1';
  if (W[BOOT_KEY] && H2O.BackendAuthority) return;
  W[BOOT_KEY] = true;

  /* ── Supported origin ────────────────────────────────────────────────
     Relative backend paths inherit the page origin, so the authority is only
     meaningful where those paths resolve to the account we govern. A second
     origin would silently form a second lock domain while still looking like
     one, so anything else fails closed rather than degrading. */
  const SUPPORTED_ORIGIN = 'https://chatgpt.com';
  const AUTHORITY_LOCK_NAME = 'h2o.backend-authority.chatgpt.v1';
  /* The per-profile loader attaches its immutable build decision to this
     external script before execution. Capture it exactly once; an absent,
     malformed, or differently loaded module is not authorized. */
  const PROFILE_CAPABILITY_ATTRIBUTE = 'data-h2o-backend-authority-profile-v1';
  const PROFILE_CAPABILITY = Object.freeze({
    backendAuthority: (() => {
      try {
        return W.document?.currentScript?.getAttribute(PROFILE_CAPABILITY_ATTRIBUTE) === 'true';
      } catch {
        return false;
      }
    })(),
  });

  const BACKEND_COOLDOWN_KEY = 'h2o:backend-authority:cooldown:v1';
  const BACKEND_PACING_KEY = 'h2o:backend-authority:pacing:v1';

  const FOREGROUND_MIN_GAP_MS = 250;
  /* Deliberately conservative relative to H2O's measured workload, which is
     event-driven and single-chat with no batch anywhere in the product, so the
     practical cost is negligible. This is a product policy; it is NOT a claim
     about any rate the server accepts. Server feedback (429 / Retry-After)
     remains the only real signal. */
  const BACKGROUND_MIN_GAP_MS = 2000;

  const BACKEND_COOLDOWN_STEPS_MS = Object.freeze([30000, 60000, 120000, 300000, 600000]);
  const BACKEND_COOLDOWN_MAX_MS = 900000;
  const ACCESS_TOKEN_TTL_MS = 240000;

  /* Bounded so a hung socket cannot hold the authority for the whole profile.
     Chosen to be far longer than any healthy request yet short enough that a
     stall is measured in seconds, not minutes. It is an availability bound on
     lock-holder lifetime and is unrelated to any server rate limit. */
  const OPERATION_TIMEOUT_MS = 30000;

  let accessTokenCache = null;

  const now = () => Date.now();
  const norm = (v) => String(v || '').replace(/[\s ]+/g, ' ').trim();
  const delay = (ms) => new Promise((resolve) => W.setTimeout(resolve, ms));

  function currentOrigin() {
    try { return String(W.location?.origin || ''); } catch { return ''; }
  }

  function lockManager() {
    try { return W.navigator?.locks || null; } catch { return null; }
  }

  /* Every correctness dependency is checked up front. A missing one means the
     authority cannot guarantee its contract, and the answer is to stop — never
     to fall back to an ungoverned per-tab request, which would keep working
     while quietly violating the architecture. */
  function availability() {
    const origin = currentOrigin();
    if (origin !== SUPPORTED_ORIGIN) {
      return { available: false, reason: 'unsupported-origin', origin };
    }
    if (!PROFILE_CAPABILITY.backendAuthority) {
      return { available: false, reason: 'profile-not-authorized', origin };
    }
    if (typeof W.fetch !== 'function') return { available: false, reason: 'fetch-unavailable', origin };
    if (!lockManager() || typeof lockManager().request !== 'function') {
      return { available: false, reason: 'web-locks-unavailable', origin };
    }
    try {
      const probe = 'h2o:backend-authority:probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
    } catch {
      return { available: false, reason: 'storage-unavailable', origin };
    }
    return { available: true, reason: '', origin };
  }

  function unavailableResult(reason) {
    return { ok: false, status: 'authority-unavailable', reason, statusCode: 0, authorityUnavailable: true };
  }

  /* ── Cooldown state ──────────────────────────────────────────────────
     Server-directed and locally-invented deadlines are tracked apart. A server
     deadline is preserved exactly as sent; the local exponential fallback is
     our own invention and keeps its own cap. Several tabs share this record,
     so every write merges: an unconditional write let a tab holding stale
     state replace a long server deadline with a short computed one. */
  function readBackendCooldownRecord() {
    try {
      const raw = localStorage.getItem(BACKEND_COOLDOWN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const serverUntil = Number(parsed?.serverUntil || 0) || 0;
      const localUntil = Number(parsed?.localUntil || parsed?.until || 0) || 0;
      const consecutive = Math.max(0, Number(parsed?.consecutive || 0) || 0);
      if (!serverUntil && !localUntil && !consecutive) return null;
      return { serverUntil, localUntil, consecutive };
    } catch {
      return null;
    }
  }

  function writeBackendCooldownRecord(record) {
    try {
      if (record) localStorage.setItem(BACKEND_COOLDOWN_KEY, JSON.stringify(record));
      else localStorage.removeItem(BACKEND_COOLDOWN_KEY);
    } catch {}
  }

  function effectiveCooldownUntil(record) {
    if (!record) return 0;
    return Math.max(Number(record.serverUntil || 0), Number(record.localUntil || 0));
  }

  function backendCooldownRemainingMs() {
    const remaining = effectiveCooldownUntil(readBackendCooldownRecord()) - now();
    return remaining > 0 ? remaining : 0;
  }

  /* A valid server deadline is preserved verbatim — no cap. Capping it would
     mean retrying earlier than we were explicitly told to. Malformed or
     already-past values yield 0 so the caller falls back to local backoff. */
  function parseRetryAfterMs(res) {
    let header = '';
    try { header = norm(res?.headers?.get?.('retry-after') || ''); } catch {}
    if (!header) return 0;
    if (/^\d+$/.test(header)) return Number(header) * 1000;
    const at = Date.parse(header);
    if (!Number.isFinite(at)) return 0;
    const delta = at - now();
    return delta > 0 ? delta : 0;
  }

  /* The escalation count survives an expired cooldown on purpose: only an
     entitled success clears it. Otherwise a limit that outlasts our wait would
     drop us back to the shortest delay and we would probe far too eagerly. */
  function noteBackendRateLimited(res) {
    const previous = readBackendCooldownRecord();
    const consecutive = Math.max(1, Number(previous?.consecutive || 0) + 1);
    const serverWait = parseRetryAfterMs(res);

    let serverUntil = Number(previous?.serverUntil || 0);
    let localUntil = Number(previous?.localUntil || 0);

    if (serverWait > 0) {
      serverUntil = Math.max(serverUntil, now() + serverWait);
    } else {
      const step = BACKEND_COOLDOWN_STEPS_MS[Math.min(consecutive - 1, BACKEND_COOLDOWN_STEPS_MS.length - 1)];
      // Jitter so several tabs on one account do not resume in lockstep.
      const jittered = Math.round(step * (0.8 + Math.random() * 0.4));
      const waitMs = Math.max(1000, Math.min(jittered, BACKEND_COOLDOWN_MAX_MS));
      localUntil = Math.max(localUntil, now() + waitMs);
    }

    const record = { serverUntil, localUntil, consecutive };
    writeBackendCooldownRecord(record);
    return record;
  }

  /* Entitlement: a success may only clear a cooldown that was already over
     when its request was issued. A request that left before a limit was
     recorded proves nothing about that limit — without this rule one tab's
     in-flight success wiped a server-mandated cooldown for every tab. */
  function noteBackendSuccess(issuedAt) {
    const record = readBackendCooldownRecord();
    if (!record) return;
    const until = effectiveCooldownUntil(record);
    if (until && Number(issuedAt || 0) < until) return;
    writeBackendCooldownRecord(null);
  }

  function backendRateLimitedResult(extra) {
    return {
      ok: false,
      status: 'rate-limited-cooldown',
      statusCode: 429,
      rateLimited: true,
      retryAfterMs: backendCooldownRemainingMs(),
      ...(extra || {}),
    };
  }

  function isRateLimitedFailure(result) {
    return result?.rateLimited === true
      || result?.status === 'rate-limited-cooldown'
      || Number(result?.statusCode || 0) === 429;
  }

  /* A 429 is deliberately not transient. Treating it as one — the same bucket
     as a dropped connection — is what let a single rate limit escalate, since
     every layer retried within a few hundred milliseconds against a backend
     that had just asked us to stop. Rate limiting is owned by the persisted
     cooldown instead, so callers must stop rather than retry. An abort and a
     timeout are likewise not transient: neither says anything about the
     server, and retrying them would spend the authority for nothing. */
  function isTransientFailure(result) {
    if (isRateLimitedFailure(result)) return false;
    if (result?.aborted === true || result?.timedOut === true) return false;
    const code = Number(result?.statusCode || 0);
    return result?.status === 'network-error' || code >= 500;
  }

  /* ── Shared pacing state ─────────────────────────────────────────────
     Pacing is profile-wide, so the last-request timestamp cannot live in a
     module variable: that would give each tab its own spacing. It is read and
     written inside the critical section. */
  function readLastRequestAt() {
    try {
      const raw = localStorage.getItem(BACKEND_PACING_KEY);
      if (!raw) return 0;
      return Number(JSON.parse(raw)?.lastRequestAt || 0) || 0;
    } catch {
      return 0;
    }
  }

  function writeLastRequestAt(at) {
    try { localStorage.setItem(BACKEND_PACING_KEY, JSON.stringify({ lastRequestAt: Number(at) || 0 })); } catch {}
  }

  /* ── Access token ────────────────────────────────────────────────────
     Memory-only, per realm. Sharing it across tabs would save a request every
     four minutes at the cost of writing a bearer token into storage readable
     by anything on the origin; the request is the cheaper thing to spend.
     Dropping the cache is what lets a 401 recover — the ungoverned code got
     that for free by re-fetching every call, so caching without an
     invalidation path turned a stale token into a dead operation. */
  function invalidateAccessToken() {
    accessTokenCache = null;
  }

  async function fetchChatGptAccessToken(signal) {
    const res = await W.fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal,
    });
    if (Number(res?.status || 0) === 429) {
      noteBackendRateLimited(res);
      return { rateLimited: true, token: '' };
    }
    if (!res?.ok) return { rateLimited: false, token: '' };
    const json = await res.json();
    return { rateLimited: false, token: norm(json?.accessToken || json?.access_token || '') };
  }

  function readChatGptAccessToken(signal) {
    const cached = accessTokenCache;
    if (cached?.value && cached.expiresAt > now()) return Promise.resolve({ rateLimited: false, token: cached.value });
    if (cached?.inflight) return cached.inflight;
    const inflight = fetchChatGptAccessToken(signal).then((outcome) => {
      accessTokenCache = outcome.token
        ? { value: outcome.token, expiresAt: now() + ACCESS_TOKEN_TTL_MS, inflight: null }
        : null;
      return outcome;
    }).catch((err) => {
      accessTokenCache = null;
      throw err;
    });
    accessTokenCache = { value: '', expiresAt: 0, inflight };
    return inflight;
  }

  function isAbortError(err) {
    return err?.name === 'AbortError' || /abort/i.test(String(err?.message || ''));
  }

  /* Composes the caller's signal with the operation deadline. The Web Locks
     signal only cancels a request that is still queued — once the callback
     runs it is spent — so the fetch must consume cancellation itself, and the
     timeout needs its own controller. Listeners and timers are released on
     every path so nothing leaks after the operation settles. */
  function makeOperationSignal(callerSignal, timeoutMs) {
    const controller = new AbortController();
    const state = { timedOut: false };
    const timer = W.setTimeout(() => {
      state.timedOut = true;
      try { controller.abort(); } catch {}
    }, Math.max(1, Number(timeoutMs) || OPERATION_TIMEOUT_MS));
    const onCallerAbort = () => { try { controller.abort(); } catch {} };
    if (callerSignal) {
      if (callerSignal.aborted) onCallerAbort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
    state.signal = controller.signal;
    state.dispose = () => {
      try { W.clearTimeout(timer); } catch {}
      try { callerSignal?.removeEventListener('abort', onCallerAbort); } catch {}
    };
    return state;
  }

  /* ── Critical section ────────────────────────────────────────────────
     Everything that must be race-free across tabs runs while the lock is held:
     the cooldown re-read (another tab may have opened one while we queued),
     the pacing wait, the entitlement stamp, the request, and every state
     transition it implies. Serializing only fetch() would leave the
     read-modify-write races that made a stale tab shorten an active cooldown. */
  async function runCriticalSection(spec, op) {
    if (backendCooldownRemainingMs() > 0) return backendRateLimitedResult({ path: spec.path });
    if (spec.signal?.aborted) return { ok: false, status: 'aborted', aborted: true };

    const gapFloor = spec.background === true ? BACKGROUND_MIN_GAP_MS : FOREGROUND_MIN_GAP_MS;
    const gap = gapFloor - (now() - readLastRequestAt());
    if (gap > 0) {
      await delay(gap);
      // The Web Locks signal does not interrupt a running callback, so abort
      // has to be re-checked explicitly after any wait.
      if (spec.signal?.aborted || op.signal.aborted) {
        return op.timedOut
          ? { ok: false, status: 'timeout', timedOut: true }
          : { ok: false, status: 'aborted', aborted: true };
      }
      if (backendCooldownRemainingMs() > 0) return backendRateLimitedResult({ path: spec.path });
    }

    return performRequest(spec, op, true);
  }

  async function performRequest(spec, op, allowAuthRetry) {
    let tokenOutcome;
    try {
      tokenOutcome = await readChatGptAccessToken(op.signal);
    } catch (err) {
      if (isAbortError(err)) {
        return op.timedOut ? { ok: false, status: 'timeout', timedOut: true } : { ok: false, status: 'aborted', aborted: true };
      }
      return { ok: false, status: 'network-error', error: String(err?.message || err || '') };
    }
    if (tokenOutcome.rateLimited) return backendRateLimitedResult({ path: spec.path });

    const issuedAt = now();
    writeLastRequestAt(issuedAt);

    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-openai-target-path': spec.path,
      'x-openai-target-route': spec.path,
    };
    if (tokenOutcome.token) headers.authorization = `Bearer ${tokenOutcome.token}`;

    let res;
    try {
      res = await W.fetch(spec.path, {
        method: spec.method || 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers,
        ...(spec.body != null ? { body: JSON.stringify(spec.body) } : {}),
        signal: op.signal,
      });
    } catch (err) {
      if (isAbortError(err)) {
        // Neither an abort nor a timeout is evidence about the server, so
        // neither opens a cooldown or counts as a retryable network fault.
        return op.timedOut ? { ok: false, status: 'timeout', timedOut: true } : { ok: false, status: 'aborted', aborted: true };
      }
      return { ok: false, status: 'network-error', error: String(err?.message || err || '') };
    }

    let body = null;
    try { body = await res.clone().json(); } catch {}
    const code = Number(res?.status || 0) || 0;

    if (code === 429) {
      noteBackendRateLimited(res);
      return backendRateLimitedResult({ path: spec.path });
    }

    /* 401 may be a stale token, so it earns one refresh and one retry, made
       terminal by a flag rather than a counter so no two operations can chain
       into a loop. The retry stays inside this critical section: releasing the
       lock between invalidation and retry would let another tab interleave.
       403 means authenticated but not permitted — a new token cannot change an
       authorization decision, so refreshing would spend a request for no
       expected benefit. Nothing here inspects the body, so the reason is not
       knowable; this is the bounded choice under that uncertainty. */
    if (code === 401 && allowAuthRetry) {
      invalidateAccessToken();
      return performRequest(spec, op, false);
    }
    if (code === 401) return { ok: false, status: 'unauthorized-failed-closed', statusCode: 401, body };
    if (code === 403) return { ok: false, status: 'forbidden-failed-closed', statusCode: 403, body };

    if (!res.ok) return { ok: false, status: `backend-${code || 'unknown'}`, statusCode: code, body };

    noteBackendSuccess(issuedAt);
    return { ok: true, status: 'ok', statusCode: code, body };
  }

  /* Callers name a resource, not a URL. Keeping the endpoint vocabulary here
     means a consumer cannot quietly reach a different backend surface, and it
     gives the enforcement validator an exact rule: only this module may name
     an authenticated endpoint. */
  const RESOURCES = Object.freeze({
    conversation: (spec) => `/backend-api/conversation/${encodeURIComponent(spec.chatId)}`,
  });

  function resolvePath(spec) {
    const build = RESOURCES[String(spec?.resource || '')];
    if (!build) return '';
    if (!spec.chatId || typeof spec.chatId !== 'string') return '';
    return build(spec);
  }

  /* The only entry point. Acquires the named lock, then runs the critical
     section. The caller's signal cancels a still-queued request through the
     lock manager; once the callback runs, cancellation is the operation
     signal's job. */
  async function request(options) {
    const incoming = options || {};
    const resolvedPath = resolvePath(incoming);
    if (!resolvedPath) return { ok: false, status: 'invalid-request', statusCode: 0 };
    const spec = { ...incoming, path: resolvedPath };
    const state = availability();
    if (!state.available) return unavailableResult(state.reason);
    if (spec.signal?.aborted) return { ok: false, status: 'aborted', aborted: true };
    if (backendCooldownRemainingMs() > 0) return backendRateLimitedResult({ path: spec.path });

    const op = makeOperationSignal(spec.signal, spec.timeoutMs || OPERATION_TIMEOUT_MS);
    try {
      return await lockManager().request(
        AUTHORITY_LOCK_NAME,
        { mode: 'exclusive', signal: spec.signal },
        () => runCriticalSection(spec, op),
      );
    } catch (err) {
      if (isAbortError(err)) return { ok: false, status: 'aborted', aborted: true, beforeAcquire: true };
      return unavailableResult('lock-request-failed');
    } finally {
      op.dispose();
    }
  }

  const api = Object.freeze({
    request,
    cooldownRemainingMs: backendCooldownRemainingMs,
    isRateLimited: isRateLimitedFailure,
    isTransient: isTransientFailure,
    status() {
      const state = availability();
      return {
        available: state.available,
        reason: state.reason,
        origin: state.origin,
        supportedOrigin: SUPPORTED_ORIGIN,
        lockName: AUTHORITY_LOCK_NAME,
        cooldownMs: state.available ? backendCooldownRemainingMs() : 0,
      };
    },
  });

  H2O.BackendAuthority = api;
})();
