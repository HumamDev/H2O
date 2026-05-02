// ==UserScript==
// @h2o-id             0d4b.identity.first-run.prompt
// @name               0D4b.⚫️🔐 Identity First-Run Prompt 🚪🔐
// @namespace          H2O.Premium.CGX.identity.first-run
// @author             HumamDev
// @version            1.1.1
// @revision           001
// @build              260427-000000
// @description        Soft, non-blocking Cockpit Pro/H2O first-run onboarding prompt for local mock identity setup.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});

  const OWNER = 'identity-first-run-prompt';
  const VERSION = '1.1.0';
  const MODTAG = '[H2O.IdentityFirstRun]';

  const ROOT_ID = 'h2o-identity-first-run-root';
  const STYLE_ID = 'h2o-identity-first-run-style';
  const ATTR_OWNER = 'data-h2o-owner';
  const ATTR_STATE = 'data-h2o-state';
  const ATTR_READY = 'data-h2o-ready';

  const STORAGE_DISMISSED_UNTIL = 'h2oIdentityFirstRunPromptDismissedUntilV1';
  const STORAGE_SEEN_COUNT = 'h2oIdentityFirstRunPromptSeenCountV1';
  const STORAGE_LAST_ACTION = 'h2oIdentityFirstRunPromptLastActionV1';

  const EVENT_IDENTITY_READY = 'h2o:identity:ready';
  const EVENT_IDENTITY_CHANGED = 'h2o:identity:changed';
  const EVENT_PROMPT_CHANGED = 'h2o:identity:first-run-prompt:changed';
  const MSG_OPS_PANEL_PROMPT = 'h2o-ext-identity-first-run:v1';

  const DISMISS_CLOSE_MS = 6 * 60 * 60 * 1000;
  const DISMISS_REMIND_MS = 24 * 60 * 60 * 1000;
  const DISMISS_AFTER_OPEN_MS = 15 * 60 * 1000;
  const BOOT_RETRY_MS = 400;
  const BOOT_RETRY_MAX = 25;

  const FIRST_RUN_STATUSES = new Set(['anonymous_local']);
  const READY_STATUSES = new Set(['profile_ready', 'sync_ready']);

  const existing = H2O.IdentityFirstRunPrompt;
  if (existing && existing.__owner === OWNER && typeof existing.dispose === 'function') {
    try { existing.dispose('reload'); } catch {}
  }

  const state = {
    mounted: false,
    busy: false,
    lastReason: 'boot',
    identityUnsub: null,
    retryTimer: 0,
    retryCount: 0,
    listenersBound: false,
  };

  const api = {
    __owner: OWNER,
    version: VERSION,
    storageKeys: Object.freeze({
      dismissedUntil: STORAGE_DISMISSED_UNTIL,
      seenCount: STORAGE_SEEN_COUNT,
      lastAction: STORAGE_LAST_ACTION,
    }),
    evaluate,
    show,
    hide,
    remindLater,
    clearDismissal,
    forceShow,
    dispose,
    selfCheck,
    diag,
  };

  H2O.IdentityFirstRunPrompt = api;

  ensureStyle();
  bindGlobalListeners();
  scheduleEvaluate('boot', 60);

  function identityApi() {
    return W.H2O?.Identity || null;
  }

  function getIdentitySnapshot() {
    const id = identityApi();
    if (!id) return null;
    try {
      if (typeof id.getSnapshot === 'function') return id.getSnapshot() || null;
    } catch (error) {
      warn('getSnapshot failed', error);
    }
    try {
      return { status: id.getState?.() || 'unknown', profile: id.getProfile?.() || null, workspace: id.getWorkspace?.() || null };
    } catch {
      return null;
    }
  }

  function isFirstRunSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return false;
    const status = String(snap.status || '').trim();
    if (!FIRST_RUN_STATUSES.has(status)) return false;
    if (snap.profile) return false;
    if (snap.onboardingCompleted === true) return false;
    return true;
  }

  function isReadySnapshot(snap) {
    const status = String(snap?.status || '').trim();
    return READY_STATUSES.has(status) || !!snap?.profile || snap?.onboardingCompleted === true;
  }

  function dismissedUntil() {
    const raw = Number(readStorage(STORAGE_DISMISSED_UNTIL, 0));
    return Number.isFinite(raw) ? raw : 0;
  }

  function isDismissedNow(now = Date.now()) {
    const until = dismissedUntil();
    return until > now;
  }

  function setDismissedFor(ms, reason) {
    const until = Date.now() + Math.max(0, Number(ms || 0));
    writeStorage(STORAGE_DISMISSED_UNTIL, String(until));
    writeLastAction(reason || 'dismiss', { until });
    emitPromptChanged('dismissed', { reason, until });
    return until;
  }

  function clearDismissal(reason = 'manual') {
    removeStorage(STORAGE_DISMISSED_UNTIL);
    writeLastAction(reason, { cleared: true });
    scheduleEvaluate(`clear-dismissal:${reason}`, 0);
    return true;
  }

  function evaluate(reason = 'manual') {
    state.lastReason = reason;
    const id = identityApi();
    if (!id) {
      hide('identity-missing');
      scheduleBootRetry('identity-missing');
      return { visible: false, reason: 'identity-missing' };
    }

    subscribeIdentity(id);

    const snap = getIdentitySnapshot();
    if (isReadySnapshot(snap)) {
      hide('identity-ready');
      return { visible: false, reason: 'identity-ready', status: snap?.status || '' };
    }

    if (!isFirstRunSnapshot(snap)) {
      hide('not-first-run');
      return { visible: false, reason: 'not-first-run', status: snap?.status || '' };
    }

    if (isDismissedNow()) {
      hide('temporarily-dismissed');
      return { visible: false, reason: 'temporarily-dismissed', dismissedUntil: dismissedUntil(), status: snap?.status || '' };
    }

    show('first-run');
    return { visible: true, reason: 'first-run', status: snap?.status || '' };
  }

  function scheduleEvaluate(reason, delay = 0) {
    W.setTimeout(() => evaluate(reason), Math.max(0, Number(delay || 0)));
  }

  function scheduleBootRetry(reason) {
    if (state.retryTimer || state.retryCount >= BOOT_RETRY_MAX) return;
    state.retryCount += 1;
    state.retryTimer = W.setTimeout(() => {
      state.retryTimer = 0;
      evaluate(`retry:${reason}:${state.retryCount}`);
    }, BOOT_RETRY_MS);
  }

  function subscribeIdentity(id) {
    if (state.identityUnsub || !id || typeof id.onChange !== 'function') return;
    try {
      state.identityUnsub = id.onChange(() => scheduleEvaluate('identity:onChange', 0));
    } catch (error) {
      state.identityUnsub = null;
      warn('identity onChange subscription failed', error);
    }
  }

  function bindGlobalListeners() {
    if (state.listenersBound) return;
    state.listenersBound = true;

    W.addEventListener('message', onOpsPanelMessage, true);
    W.addEventListener(EVENT_IDENTITY_READY, onIdentityReady, true);
    W.addEventListener(EVENT_IDENTITY_CHANGED, onIdentityChanged, true);
    W.addEventListener('storage', onStorage, true);
    W.addEventListener('visibilitychange', onVisibility, true);
  }

  function unbindGlobalListeners() {
    if (!state.listenersBound) return;
    state.listenersBound = false;

    W.removeEventListener('message', onOpsPanelMessage, true);
    W.removeEventListener(EVENT_IDENTITY_READY, onIdentityReady, true);
    W.removeEventListener(EVENT_IDENTITY_CHANGED, onIdentityChanged, true);
    W.removeEventListener('storage', onStorage, true);
    W.removeEventListener('visibilitychange', onVisibility, true);
  }

  function onIdentityReady() {
    scheduleEvaluate('identity:ready', 0);
  }

  function onIdentityChanged() {
    scheduleEvaluate('identity:changed-event', 0);
  }

  function onStorage(ev) {
    if (!ev || ev.key !== STORAGE_DISMISSED_UNTIL) return;
    scheduleEvaluate('storage:dismissal', 0);
  }

  function onVisibility() {
    if (D.visibilityState === 'visible') scheduleEvaluate('visibility', 120);
  }

  function onOpsPanelMessage(ev) {
    if (!ev || ev.source !== W) return;
    const data = ev.data;
    if (!data || typeof data !== 'object' || data.type !== MSG_OPS_PANEL_PROMPT) return;

    const action = String(data.action || 'force-show').trim().toLowerCase();
    if (action === 'force-show' || action === 'show') {
      forceShow('ops-panel');
      return;
    }
    if (action === 'clear-dismissal') {
      clearDismissal('ops-panel');
      return;
    }
    if (action === 'evaluate') {
      scheduleEvaluate('ops-panel', 0);
    }
  }

  function forceShow(reason = 'manual') {
    // Intentional testing/debug path: bypasses temporary dismissal and ready-state
    // suppression so Control Hub / Ops Panel can manually review the prompt UI.
    // Normal automatic display still goes through evaluate() and stays hidden after
    // profile_ready / sync_ready.
    removeStorage(STORAGE_DISMISSED_UNTIL);
    writeLastAction('force-show', { reason, bypassesReadyState: true });
    const ok = show(`force:${reason}`);
    if (ok) setStatus('Shown for testing. Normal auto-display still hides after profile setup.', 'ok');
    emitPromptChanged('force-shown', { reason, bypassesReadyState: true });
    return { ok, visible: ok, reason, bypassesReadyState: true };
  }


  function show(reason = 'manual') {
    const root = ensureRoot();
    if (!root) return false;
    state.mounted = true;
    root.hidden = false;
    root.setAttribute(ATTR_STATE, state.busy ? 'busy' : 'visible');
    root.setAttribute(ATTR_READY, '1');
    root.classList.add('is-visible');
    bumpSeenCount();
    render(root, reason);
    emitPromptChanged('shown', { reason });
    return true;
  }

  function hide(reason = 'manual') {
    const root = D.getElementById(ROOT_ID);
    state.mounted = false;
    if (!root) return false;
    root.classList.remove('is-visible');
    root.setAttribute(ATTR_STATE, 'hidden');
    W.setTimeout(() => {
      if (state.mounted) return;
      const current = D.getElementById(ROOT_ID);
      if (current) current.hidden = true;
    }, 180);
    emitPromptChanged('hidden', { reason });
    return true;
  }

  function remindLater(reason = 'remind-later') {
    setDismissedFor(DISMISS_REMIND_MS, reason);
    hide(reason);
    return true;
  }

  async function handleSetupClick() {
    const id = identityApi();
    if (!id?.openOnboarding) {
      setStatus('Onboarding is unavailable. Check that Identity Core is loaded.', 'error');
      return;
    }

    setBusy(true, 'Opening setup…');
    try {
      const opened = await id.openOnboarding({ source: 'first-run-prompt' });
      if (opened) {
        setDismissedFor(DISMISS_AFTER_OPEN_MS, 'opened-onboarding');
        setStatus('Setup opened. Complete it there when ready.', 'ok');
        hide('opened-onboarding');
      } else {
        setStatus('Could not open setup. Use Control Hub → Account → Open Onboarding.', 'error');
      }
    } catch (error) {
      warn('openOnboarding failed', error);
      setStatus('Could not open setup. Check the extension is active.', 'error');
    } finally {
      setBusy(false);
      scheduleEvaluate('after-open-onboarding', 250);
    }
  }

  async function handleContinueLocalMode() {
    const id = identityApi();
    setBusy(true, 'Creating local profile…');
    try {
      if (typeof id?.enterLocalMode === 'function') {
        await id.enterLocalMode({
          displayName: 'Local H2O User',
          workspaceName: 'Local H2O Workspace',
          source: 'first-run-prompt',
        });
        setStatus('Local profile created.', 'ok');
      } else {
        setDismissedFor(DISMISS_REMIND_MS, 'continue-local-unavailable');
        setStatus('Local mode API unavailable; prompt dismissed for now.', 'warn');
      }
      hide('continue-local-mode');
    } catch (error) {
      warn('enterLocalMode failed', error);
      setStatus('Could not create local profile.', 'error');
    } finally {
      setBusy(false);
      scheduleEvaluate('after-continue-local', 200);
    }
  }

  function handleClose() {
    setDismissedFor(DISMISS_CLOSE_MS, 'close');
    hide('close');
  }

  function handleRemindLater() {
    remindLater('remind-later');
  }

  function ensureRoot() {
    let root = D.getElementById(ROOT_ID);
    if (root) return root;

    root = D.createElement('section');
    root.id = ROOT_ID;
    root.className = 'h2o-idfr';
    root.setAttribute(ATTR_OWNER, OWNER);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-label', 'Cockpit Pro local profile setup');
    root.hidden = true;

    const host = D.body || D.documentElement;
    host.appendChild(root);
    return root;
  }

  function render(root, reason) {
    const snap = getIdentitySnapshot() || {};
    const status = String(snap.status || 'anonymous_local');

    root.innerHTML = `
      <div class="h2o-idfr__shell">
        <div class="h2o-idfr__glow" aria-hidden="true"></div>
        <div class="h2o-idfr__top">
          <div class="h2o-idfr__mark" aria-hidden="true">🔐</div>
          <div class="h2o-idfr__head">
            <div class="h2o-idfr__eyebrow">Cockpit Pro · H2O setup</div>
            <h2 class="h2o-idfr__title">Create your local profile foundation.</h2>
          </div>
          <button class="h2o-idfr__x" type="button" title="Remind me later" aria-label="Close first-run setup prompt">×</button>
        </div>
        <p class="h2o-idfr__copy">
          This is your Cockpit Pro/H2O workspace identity — separate from ChatGPT or OpenAI. It stays local/mock for now and does not add real auth, passwords, billing, or tokens.
        </p>
        <div class="h2o-idfr__chips" aria-label="Identity status">
          <span>local mock</span>
          <span>no tokens</span>
          <span>${escapeHtml(status.replace(/_/g, ' '))}</span>
        </div>
        <div class="h2o-idfr__actions">
          <button class="h2o-idfr__btn h2o-idfr__btn--primary" type="button" data-action="setup">Set up profile</button>
          <button class="h2o-idfr__btn" type="button" data-action="local">Continue local mode</button>
          <button class="h2o-idfr__btn h2o-idfr__btn--ghost" type="button" data-action="later">Remind me later</button>
        </div>
        <div class="h2o-idfr__status" data-role="status">${escapeHtml(statusTextFor(reason))}</div>
      </div>
    `;

    root.querySelector('[data-action="setup"]')?.addEventListener('click', handleSetupClick, true);
    root.querySelector('[data-action="local"]')?.addEventListener('click', handleContinueLocalMode, true);
    root.querySelector('[data-action="later"]')?.addEventListener('click', handleRemindLater, true);
    root.querySelector('.h2o-idfr__x')?.addEventListener('click', handleClose, true);
  }

  function statusTextFor(reason) {
    if (reason === 'opened-onboarding') return 'Setup opened.';
    return 'Soft prompt only — you can keep using ChatGPT normally.';
  }

  function setStatus(message, tone = '') {
    const root = D.getElementById(ROOT_ID);
    const node = root?.querySelector('[data-role="status"]');
    if (!node) return;
    node.textContent = String(message || '');
    node.setAttribute('data-tone', tone || '');
  }

  function setBusy(on, message) {
    state.busy = !!on;
    const root = D.getElementById(ROOT_ID);
    if (!root) return;
    root.setAttribute(ATTR_STATE, on ? 'busy' : (state.mounted ? 'visible' : 'hidden'));
    root.querySelectorAll('button').forEach((btn) => { btn.disabled = !!on; });
    if (message) setStatus(message, 'busy');
  }

  function ensureStyle() {
    let style = D.getElementById(STYLE_ID);
    if (style) return style;

    style = D.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute(ATTR_OWNER, OWNER);
    style.textContent = `
      #${ROOT_ID}.h2o-idfr{
        position:fixed;
        left:clamp(16px, 2.2vw, 28px);
        bottom:clamp(82px, 11vh, 128px);
        width:min(390px, calc(100vw - 32px));
        z-index:2147483565;
        color:#f7f7fb;
        font:500 14px/1.42 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        opacity:0;
        transform:translateY(14px) scale(.985);
        transition:opacity .18s ease, transform .18s ease, filter .18s ease;
        pointer-events:none;
      }
      #${ROOT_ID}.h2o-idfr.is-visible{
        opacity:1;
        transform:translateY(0) scale(1);
        pointer-events:auto;
      }
      #${ROOT_ID}[hidden]{display:none!important;}
      #${ROOT_ID} .h2o-idfr__shell{
        position:relative;
        overflow:hidden;
        border:1px solid rgba(255,255,255,.16);
        border-radius:28px;
        padding:18px;
        background:
          radial-gradient(circle at 12% 0%, rgba(139,92,246,.30), transparent 34%),
          radial-gradient(circle at 100% 12%, rgba(34,211,238,.20), transparent 35%),
          linear-gradient(145deg, rgba(29,31,48,.94), rgba(8,10,21,.92));
        box-shadow:0 26px 80px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.13);
        backdrop-filter:blur(22px) saturate(1.18);
        -webkit-backdrop-filter:blur(22px) saturate(1.18);
      }
      #${ROOT_ID} .h2o-idfr__glow{
        position:absolute;
        right:-64px;
        bottom:-74px;
        width:190px;
        height:190px;
        border-radius:50%;
        background:radial-gradient(circle, rgba(34,211,238,.35), rgba(124,58,237,.14) 42%, transparent 70%);
        filter:blur(4px);
        pointer-events:none;
      }
      #${ROOT_ID} .h2o-idfr__top{display:flex;gap:12px;align-items:flex-start;position:relative;z-index:1;}
      #${ROOT_ID} .h2o-idfr__mark{
        display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:16px;
        background:linear-gradient(145deg, rgba(124,58,237,.52), rgba(34,211,238,.22));
        border:1px solid rgba(255,255,255,.16);
        box-shadow:0 12px 28px rgba(30,20,90,.36);
      }
      #${ROOT_ID} .h2o-idfr__head{min-width:0;flex:1;}
      #${ROOT_ID} .h2o-idfr__eyebrow{
        letter-spacing:.16em;text-transform:uppercase;font-size:11px;font-weight:850;color:#67e8f9;margin:1px 0 5px;
      }
      #${ROOT_ID} .h2o-idfr__title{margin:0;font-size:24px;line-height:1.02;font-weight:880;letter-spacing:-.04em;color:#fff;}
      #${ROOT_ID} .h2o-idfr__x{
        appearance:none;border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:999px;width:30px;height:30px;
        font-size:20px;line-height:28px;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.11);
      }
      #${ROOT_ID} .h2o-idfr__x:hover{background:rgba(255,255,255,.16);}
      #${ROOT_ID} .h2o-idfr__copy{position:relative;z-index:1;margin:14px 0 13px;color:rgba(247,247,251,.78);font-size:14px;}
      #${ROOT_ID} .h2o-idfr__chips{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:7px;margin:0 0 15px;}
      #${ROOT_ID} .h2o-idfr__chips span{
        border-radius:999px;padding:6px 10px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.86);
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);font-size:12px;font-weight:760;text-transform:lowercase;
      }
      #${ROOT_ID} .h2o-idfr__actions{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:8px;}
      #${ROOT_ID} .h2o-idfr__btn{
        appearance:none;border:0;border-radius:14px;padding:10px 12px;min-height:40px;cursor:pointer;
        color:#f8fafc;background:rgba(255,255,255,.09);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);
        font-weight:820;letter-spacing:-.01em;transition:transform .12s ease, background .12s ease, box-shadow .12s ease, opacity .12s ease;
      }
      #${ROOT_ID} .h2o-idfr__btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.14);}
      #${ROOT_ID} .h2o-idfr__btn:disabled{opacity:.62;cursor:wait;transform:none;}
      #${ROOT_ID} .h2o-idfr__btn--primary{
        grid-column:1 / -1;color:#06111c;background:linear-gradient(135deg, #a78bfa, #67e8f9 58%, #22d3ee);
        box-shadow:0 12px 30px rgba(34,211,238,.22), inset 0 0 0 1px rgba(255,255,255,.32);
      }
      #${ROOT_ID} .h2o-idfr__btn--ghost{color:rgba(255,255,255,.72);background:transparent;}
      #${ROOT_ID} .h2o-idfr__status{position:relative;z-index:1;margin-top:11px;min-height:18px;color:rgba(255,255,255,.58);font-size:12px;font-weight:650;}
      #${ROOT_ID} .h2o-idfr__status[data-tone="ok"]{color:#86efac;}
      #${ROOT_ID} .h2o-idfr__status[data-tone="warn"]{color:#fde68a;}
      #${ROOT_ID} .h2o-idfr__status[data-tone="error"]{color:#fca5a5;}
      #${ROOT_ID}[data-h2o-state="busy"] .h2o-idfr__shell{filter:saturate(.92) brightness(.96);}
      @media (max-width: 760px){
        #${ROOT_ID}.h2o-idfr{left:12px;right:12px;bottom:86px;width:auto;}
        #${ROOT_ID} .h2o-idfr__title{font-size:21px;}
        #${ROOT_ID} .h2o-idfr__actions{grid-template-columns:1fr;}
        #${ROOT_ID} .h2o-idfr__btn--primary{grid-column:auto;}
      }
      @media (prefers-reduced-motion: reduce){
        #${ROOT_ID}.h2o-idfr, #${ROOT_ID} .h2o-idfr__btn{transition:none!important;}
      }
    `;

    (D.head || D.documentElement).appendChild(style);
    return style;
  }

  function bumpSeenCount() {
    const current = Number(readStorage(STORAGE_SEEN_COUNT, 0));
    const next = Number.isFinite(current) ? current + 1 : 1;
    writeStorage(STORAGE_SEEN_COUNT, String(next));
  }

  function writeLastAction(action, meta = {}) {
    writeStorage(STORAGE_LAST_ACTION, JSON.stringify({ action, meta, at: new Date().toISOString() }));
  }

  function emitPromptChanged(type, detail = {}) {
    try {
      W.dispatchEvent(new CustomEvent(EVENT_PROMPT_CHANGED, { detail: { type, owner: OWNER, ...detail } }));
    } catch {}
  }

  function readStorage(key, fallback) {
    try {
      const value = W.localStorage?.getItem(key);
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      W.localStorage?.setItem(key, String(value));
      return true;
    } catch (error) {
      warn(`Storage write failed: ${key}`, error);
      return false;
    }
  }

  function removeStorage(key) {
    try {
      W.localStorage?.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function dispose(reason = 'manual') {
    if (state.retryTimer) {
      try { W.clearTimeout(state.retryTimer); } catch {}
      state.retryTimer = 0;
    }
    if (typeof state.identityUnsub === 'function') {
      try { state.identityUnsub(); } catch {}
      state.identityUnsub = null;
    }
    unbindGlobalListeners();
    const root = D.getElementById(ROOT_ID);
    if (root) root.remove();
    const style = D.getElementById(STYLE_ID);
    if (style) style.remove();
    state.mounted = false;
    emitPromptChanged('disposed', { reason });
    return true;
  }

  function diag() {
    const snap = getIdentitySnapshot();
    return {
      owner: OWNER,
      version: VERSION,
      mounted: state.mounted,
      busy: state.busy,
      lastReason: state.lastReason,
      identityReady: !!identityApi(),
      status: snap?.status || null,
      firstRun: isFirstRunSnapshot(snap),
      ready: isReadySnapshot(snap),
      dismissedUntil: dismissedUntil(),
      dismissedNow: isDismissedNow(),
      rootExists: !!D.getElementById(ROOT_ID),
      styleExists: !!D.getElementById(STYLE_ID),
      storageKey: STORAGE_DISMISSED_UNTIL,
      forceShowBypassesReadyState: true,
      noSecretsStored: !/token|secret|password|refresh/i.test([
        STORAGE_DISMISSED_UNTIL,
        STORAGE_SEEN_COUNT,
        STORAGE_LAST_ACTION,
      ].join(' ')),
    };
  }

  function selfCheck() {
    const d = diag();
    const checks = {
      apiInstalled: W.H2O?.IdentityFirstRunPrompt === api,
      styleExists: d.styleExists,
      hasStorageKey: STORAGE_DISMISSED_UNTIL === 'h2oIdentityFirstRunPromptDismissedUntilV1',
      versionConsistent: VERSION === '1.1.0',
      forceShowSemanticsExplicit: d.forceShowBypassesReadyState === true,
      noSecretsStored: d.noSecretsStored,
      publicApi: ['evaluate', 'show', 'hide', 'remindLater', 'clearDismissal', 'forceShow', 'dispose', 'selfCheck', 'diag'].every((name) => typeof api[name] === 'function'),
    };
    return { ok: Object.values(checks).every(Boolean), checks, diag: d };
  }

  function warn(message, error) {
    try { console.warn(MODTAG, message, error || ''); } catch {}
  }
})();
