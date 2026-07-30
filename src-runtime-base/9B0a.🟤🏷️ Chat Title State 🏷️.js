// ==H2O Module==
// @h2o-id             9b0a.chat.title.state
// @name               9B0a.🟤🏷️ Chat Title State 🏷️
// @namespace          H2O.Premium.CGX.chat.title.state
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260506-000000
// @description        Canonical H2O chat title state owner for tab title, under-input title, and emoji metadata.
// @match              https://chatgpt.com/*
// @run-at             document-start
// @grant              none
// ==/H2O Module==

(function () {
  'use strict';

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});
  const BOOT_KEY = '__h2oChatTitleStateBooted_v1';
  if (W[BOOT_KEY] && H2O.ChatTitle) {
    try { H2O.ChatTitle.refresh('duplicate-boot'); } catch {}
    return;
  }
  W[BOOT_KEY] = 1;

  const VERSION = 1;
  const EVENT_PREFIX = 'h2o:chat-title';
  const STORE_STATE_KEY_PREFIX = 'h2o:prm:cgx:library:chat-title:state:v1:';
  const BOOT_CACHE_KEY_PREFIX = 'h2o:prm:cgx:library:chat-title:boot-cache:v1:';
  const MIGRATION_KEY = 'h2o:prm:cgx:library:chat-title:migration:v1';
  const LEGACY_BOOT_CACHE_KEY_PREFIX = 'h2o:chat-title:boot-cache:v1:';
  const LEGACY_MIGRATION_KEY = 'h2o:chat-title:migration:v1';
  const BOOT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const TITLE_WRITE_TTL_MS = 900;
  const ACTIVE_TRANSIENT_KEY = '__active_transient__';
  // Same native title container every committed sidebar-title reader uses.
  const NATIVE_TITLE_SELECTOR = '.truncate,[class*="truncate"]';
  const ROUTE_EVENT_NAMES = Object.freeze([
    'evt:h2o:route:changed',
    'h2o:route:changed',
  ]);
  const REFRESH_PRIORITY_DEFAULT = 0;
  const REFRESH_PRIORITY_ROUTE = 100;
  const ROUTE_REFRESH_DELAY_MS = 60;
  const CONVERGENCE_FLAG_KEY = 'title.threeSurfaceConvergenceV1';
  const CONVERGENCE_SESSION_OVERRIDE_KEY = '__H2O_TITLE_THREE_SURFACE_CONVERGENCE_V1__';
  const FLAGS_STORAGE_KEY = 'h2o:flags:v1';
  const CONVERGENCE_FLAG_EVENT_NAMES = Object.freeze([
    'h2o:flags:changed',
    'evt:h2o:flags:changed',
  ]);

  const BASE_PRIORITY = Object.freeze({
    none: 0,
    url: 20,
    fallback: 35,
    document: 60,
    detected: 70,
    library: 80,
    archive: 80,
    imported: 80,
    native: 95,
    official: 95,
    user: 100,
  });

  const EMOJI_PRIORITY = Object.freeze({
    none: 0,
    fallback: 10,
    auto: 50,
    migration: 70,
    stored: 75,
    native: 90,
    user: 100,
  });

  const subscribers = new Set();
  const records = new Map();
  let routeToken = 0;
  let lastIdentityKey = '';
  let opSeq = 0;
  let bodyObserver = null;
  let titleObserver = null;
  let refreshTimer = 0;
  let pendingRefresh = null;
  let refreshScheduleSeq = 0;
  let routeListenersInstalled = false;
  let routeListenerDisposer = null;
  let destroyed = false;
  let attachTimer = 0;
  let storeAdapter = null;
  let storeAttachInFlight = false;
  let debugStorageDegraded = false;
  let ownDocumentWrite = null;
  let lastWarning = '';
  let lastError = '';
  let renameOperationSeq = 0;
  let activeRenameOperation = null;
  let convergenceFlagListenerInstalled = false;
  let convergenceFlagListenerDisposer = null;
  let convergenceFlagAttachTimer = 0;
  let convergenceFlagSetRestore = null;
  let lastConvergenceStatus = Object.freeze({
    requested: false,
    enabled: false,
    mode: 'legacy',
    source: 'default',
    gate: 'not-requested',
  });

  let storageStatus = {
    backend: 'memory',
    durable: false,
    healthy: false,
    degraded: false,
    localStorageFallbackActive: false,
    localStorageFallbackAvailable: hasLocalStorage(),
    localStorageFallbackUsedThisSession: false,
    migratedFromLegacyLocalStorage: false,
    attachedAt: 0,
  };

  // H2O_TITLE_STAGE1C_PARITY_BEGIN
  const PARITY_MAX_COMPARISONS = 200;
  const PARITY_MAX_LENGTH = 1024;
  const PARITY_MAX_SUPPRESSED = 200;
  const PARITY_MAX_EMOJI_LENGTH = 64;
  const PARITY_CLASSES = Object.freeze([
    'empty-value',
    'chatgpt-suffix',
    'edge-emoji-dedupe',
    'rtl-range',
    'whitespace',
    'other',
  ]);
  const PARITY_IDENTITY = Object.freeze({
    schemaVersion: 2,
    bridgeVersion: '3',
    generatorVersion: '3',
    sourceExportCount: 39,
    publicExportCount: 29,
    privilegedExportCount: 8,
    sourceOnlyExportCount: 2,
    sourceSha256: '57f3fe783b5253d07dafcd7ec4c89b75602337b86d83033ed52fbcc104097b0d',
    publicSurfaceDigest: 'd525371c9e82cea7e59351a429120f049b52ca6c3b81ff72eeb599460bc755d3',
  });

  function parityOrdinaryObject(value) {
    if (!value || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function parityOwnData(object, key) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    return descriptor;
  }

  function inspectTitleContractParityGate() {
    try {
      const h2oDescriptor = Object.getOwnPropertyDescriptor(W, 'H2O');
      if (!h2oDescriptor) {
        return Object.freeze({ gate: 'absent', contract: null, sanitizer: null, formatter: null });
      }
      if (!Object.prototype.hasOwnProperty.call(h2oDescriptor, 'value') ||
          !parityOrdinaryObject(h2oDescriptor.value)) {
        return Object.freeze({
          gate: 'descriptor-mismatch',
          contract: null,
          sanitizer: null,
          formatter: null,
        });
      }

      const contractDescriptor = Object.getOwnPropertyDescriptor(h2oDescriptor.value, 'TitleContract');
      if (!contractDescriptor) {
        return Object.freeze({ gate: 'absent', contract: null, sanitizer: null, formatter: null });
      }
      if (!Object.prototype.hasOwnProperty.call(contractDescriptor, 'value') ||
          contractDescriptor.writable !== false ||
          contractDescriptor.enumerable !== false ||
          contractDescriptor.configurable !== false ||
          !parityOrdinaryObject(contractDescriptor.value)) {
        return Object.freeze({
          gate: 'descriptor-mismatch',
          contract: null,
          sanitizer: null,
          formatter: null,
        });
      }

      const contract = contractDescriptor.value;
      const identityDescriptor = parityOwnData(contract, 'identity');
      const identity = identityDescriptor && identityDescriptor.value;
      if (!parityOrdinaryObject(identity)) {
        return Object.freeze({
          gate: 'identity-mismatch',
          contract: null,
          sanitizer: null,
          formatter: null,
        });
      }
      for (const [key, expected] of Object.entries(PARITY_IDENTITY)) {
        const field = parityOwnData(identity, key);
        if (!field || field.value !== expected) {
          return Object.freeze({
            gate: 'identity-mismatch',
            contract: null,
            sanitizer: null,
            formatter: null,
          });
        }
      }

      const rtlDescriptor = parityOwnData(contract, 'isRTL');
      const sanitizerDescriptor = parityOwnData(contract, 'sanitizeNativeTitle');
      const formatterDescriptor = parityOwnData(contract, 'formatNativeDisplayTitle');
      if (!rtlDescriptor || typeof rtlDescriptor.value !== 'function' ||
          !sanitizerDescriptor || typeof sanitizerDescriptor.value !== 'function' ||
          !formatterDescriptor || typeof formatterDescriptor.value !== 'function') {
        return Object.freeze({
          gate: 'helper-missing',
          contract: null,
          sanitizer: null,
          formatter: null,
        });
      }
      return Object.freeze({
        gate: 'ok',
        contract,
        sanitizer: sanitizerDescriptor.value,
        formatter: formatterDescriptor.value,
      });
    } catch {
      return Object.freeze({ gate: 'gate-error', contract: null, sanitizer: null, formatter: null });
    }
  }

  function parityIncrement(value, cap) {
    return value >= cap ? cap : value + 1;
  }

  function parityInputString(value) {
    return typeof value === 'string' ? value : String(value || '');
  }

  function parityBoundedSample(value, limit) {
    if (value.length <= limit) return value;
    const half = Math.floor(limit / 2);
    return `${value.slice(0, half)}${value.slice(value.length - half)}`;
  }

  function paritySignature(baseTitle, emoji, currentRouteToken) {
    const base = parityInputString(baseTitle);
    const mark = parityInputString(emoji);
    const baseLen = Math.min(base.length, PARITY_MAX_LENGTH);
    const emojiLen = Math.min(mark.length, PARITY_MAX_EMOJI_LENGTH);
    const routeEpoch = Number.isSafeInteger(currentRouteToken) ? currentRouteToken : 0;
    const baseSample = parityBoundedSample(base, PARITY_MAX_LENGTH);
    const emojiSample = parityBoundedSample(mark, PARITY_MAX_EMOJI_LENGTH);
    const metadata = `${routeEpoch}|${baseLen}|${emojiLen}|`;
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    let offset = 0;

    const update = (text) => {
      for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        h1 = Math.imul((h1 ^ code) >>> 0, 0x01000193) >>> 0;
        h2 = Math.imul((h2 + code + offset + 0x7f4a7c15) ^ (h2 >>> 13), 0x85ebca6b) >>> 0;
        offset += 1;
      }
      h1 = Math.imul((h1 ^ 0xff) >>> 0, 0x01000193) >>> 0;
      h2 = Math.imul((h2 ^ 0xa5a5a5a5) >>> 0, 0xc2b2ae35) >>> 0;
      offset += 1;
    };

    update(metadata);
    update(baseSample);
    update(emojiSample);
    return Object.freeze({ routeToken: routeEpoch, baseLen, emojiLen, h1, h2 });
  }

  function paritySameSignature(left, right) {
    return !!left && !!right &&
      left.routeToken === right.routeToken &&
      left.baseLen === right.baseLen &&
      left.emojiLen === right.emojiLen &&
      left.h1 === right.h1 &&
      left.h2 === right.h2;
  }

  function parityLength(value) {
    return Math.min(typeof value === 'string' ? value.length : 0, PARITY_MAX_LENGTH);
  }

  function parityDirection(value) {
    return value === 'ltr' || value === 'rtl' ? value : 'unknown';
  }

  function createTitleContractParityController() {
    const gateResult = inspectTitleContractParityGate();
    const counters = {
      comparisons: 0,
      matches: 0,
      mismatches: 0,
      errors: 0,
      suppressed: 0,
      byClass: Object.fromEntries(PARITY_CLASSES.map((name) => [name, 0])),
      lastMismatch: null,
    };
    let previousSignature = null;

    function compare(baseTitle, emoji, legacyOutput, currentRouteToken) {
      if (gateResult.gate !== 'ok') return;
      let signature;
      try {
        signature = paritySignature(baseTitle, emoji, currentRouteToken);
      } catch {
        return;
      }
      if (paritySameSignature(previousSignature, signature)) {
        counters.suppressed = parityIncrement(counters.suppressed, PARITY_MAX_SUPPRESSED);
        return;
      }
      previousSignature = signature;
      if (counters.comparisons >= PARITY_MAX_COMPARISONS) {
        counters.suppressed = parityIncrement(counters.suppressed, PARITY_MAX_SUPPRESSED);
        return;
      }

      counters.comparisons = parityIncrement(counters.comparisons, PARITY_MAX_COMPARISONS);
      try {
        const sanitizedBase = gateResult.sanitizer.call(gateResult.contract, baseTitle);
        if (typeof sanitizedBase !== 'string') {
          counters.errors = parityIncrement(counters.errors, PARITY_MAX_COMPARISONS);
          return;
        }
        const contractResult = gateResult.formatter.call(gateResult.contract, baseTitle, emoji);
        const textDescriptor = contractResult && typeof contractResult === 'object'
          ? parityOwnData(contractResult, 'text')
          : null;
        const dirDescriptor = contractResult && typeof contractResult === 'object'
          ? parityOwnData(contractResult, 'dir')
          : null;
        if (!contractResult ||
            typeof contractResult !== 'object' ||
            !Object.isFrozen(contractResult) ||
            !textDescriptor ||
            typeof textDescriptor.value !== 'string' ||
            textDescriptor.value.length > PARITY_MAX_LENGTH ||
            !dirDescriptor ||
            (dirDescriptor.value !== 'ltr' && dirDescriptor.value !== 'rtl')) {
          counters.errors = parityIncrement(counters.errors, PARITY_MAX_COMPARISONS);
          return;
        }

        const contractText = textDescriptor.value;
        const contractDir = dirDescriptor.value;
        if (contractText === legacyOutput) {
          counters.matches = parityIncrement(counters.matches, PARITY_MAX_COMPARISONS);
          return;
        }

        const baseClean = cleanTitle(baseTitle);
        const baseNorm = norm(baseTitle);
        const emojiNorm = norm(emoji);
        const legacyDir = isRTL(baseClean) ? 'rtl' : 'ltr';
        let mismatchClass = 'other';
        if ((!baseClean || !emojiNorm) && baseClean === baseNorm) {
          mismatchClass = 'empty-value';
        } else if (baseClean !== baseNorm) {
          mismatchClass = 'chatgpt-suffix';
        } else if (baseClean && emojiNorm && getEdgeEmoji(baseClean) === emojiNorm) {
          mismatchClass = 'edge-emoji-dedupe';
        } else if (legacyDir !== contractDir) {
          mismatchClass = 'rtl-range';
        } else if (norm(legacyOutput) === norm(contractText)) {
          mismatchClass = 'whitespace';
        }

        counters.mismatches = parityIncrement(counters.mismatches, PARITY_MAX_COMPARISONS);
        counters.byClass[mismatchClass] = parityIncrement(
          counters.byClass[mismatchClass],
          PARITY_MAX_COMPARISONS,
        );
        counters.lastMismatch = Object.freeze({
          class: mismatchClass,
          baseLen: signature.baseLen,
          emojiLen: signature.emojiLen,
          legacyLen: parityLength(legacyOutput),
          contractLen: parityLength(contractText),
          legacyDir: parityDirection(legacyDir),
          contractDir: parityDirection(contractDir),
        });
      } catch {
        counters.errors = parityIncrement(counters.errors, PARITY_MAX_COMPARISONS);
      }
    }

    function snapshot() {
      const byClass = Object.freeze(Object.fromEntries(
        PARITY_CLASSES.map((name) => [name, counters.byClass[name]]),
      ));
      const lastMismatch = counters.lastMismatch
        ? Object.freeze({ ...counters.lastMismatch })
        : null;
      return Object.freeze({
        gate: gateResult.gate,
        comparisons: counters.comparisons,
        matches: counters.matches,
        mismatches: counters.mismatches,
        errors: counters.errors,
        suppressed: counters.suppressed,
        byClass,
        lastMismatch,
      });
    }

    return Object.freeze({ compare, snapshot });
  }

  const titleContractParity = createTitleContractParityController();
  // H2O_TITLE_STAGE1C_PARITY_END

  let identity = detectIdentity();
  let activeRecordKey = recordKeyForIdentity(identity);
  let activeRecord = ensureRecord(activeRecordKey, identity.chatId);
  let state = composeState(activeRecord, identity, 'boot');

  function now() {
    return Date.now();
  }

  function hasLocalStorage() {
    try {
      const key = 'h2o:chat-title:storage-probe';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function isLocalStorageFallbackActive() {
    return !!(
      storageStatus.localStorageFallbackActive &&
      (!storageStatus.durable || !storageStatus.healthy || storageStatus.degraded || storageStatus.backend === 'memory' || debugStorageDegraded)
    );
  }

  function norm(value) {
    return String(value || '').replace(/[\s\u00A0]+/g, ' ').trim();
  }

  function clampConfidence(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  }

  function sourcePriority(source, explicit, kind) {
    if (Number.isFinite(Number(explicit))) return Number(explicit);
    const table = kind === 'emoji' ? EMOJI_PRIORITY : BASE_PRIORITY;
    const s = String(source || '').toLowerCase();
    if (s.includes('user')) return table.user;
    if (s.includes('native') || s.includes('official')) return table.native || table.official;
    if (s.includes('archive')) return table.archive || table.stored;
    if (s.includes('library') || s.includes('import')) return table.library || table.stored;
    if (s.includes('migration') || s.includes('legacy')) return table.migration || table.stored;
    if (s.includes('stored') || s.includes('cache')) return table.stored || table.fallback;
    if (s.includes('auto')) return table.auto || table.fallback;
    if (s.includes('document')) return table.document || table.fallback;
    if (s.includes('url')) return table.url || table.fallback;
    if (s.includes('fallback')) return table.fallback;
    return table.detected || table.none || 0;
  }

  function graphemes(text) {
    const s = norm(text);
    if (!s) return [];
    try {
      if (W.Intl && Intl.Segmenter) {
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(seg.segment(s), (x) => x.segment);
      }
    } catch {}
    return Array.from(s);
  }

  function isEmojiCluster(cluster) {
    return /[\uFE0F\u200D]|\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(cluster || '');
  }

  function getEdgeEmoji(text) {
    const g = graphemes(text);
    if (!g.length) return '';
    if (isEmojiCluster(g[0])) return g[0];
    if (isEmojiCluster(g[g.length - 1])) return g[g.length - 1];
    return '';
  }

  function stripEdgeEmoji(text) {
    const g = graphemes(text);
    while (g.length && isEmojiCluster(g[0])) g.shift();
    while (g.length && isEmojiCluster(g[g.length - 1])) g.pop();
    return norm(g.join(''));
  }

  function splitEmojiFromTitle(raw) {
    const title = sanitizeTitleForState(raw);
    if (!title) return { baseTitle: '', emoji: '' };
    const emoji = getEdgeEmoji(title);
    const baseTitle = emoji ? stripEdgeEmoji(title) : title;
    return { baseTitle: baseTitle || title, emoji };
  }

  function splitNativeSubmission(raw) {
    const title = norm(raw);
    if (!title) return { baseTitle: '', emoji: '' };
    const emoji = getEdgeEmoji(title);
    const baseTitle = emoji ? stripEdgeEmoji(title) : title;
    return {
      baseTitle: norm(baseTitle),
      emoji,
    };
  }

  function isRTL(text) {
    return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text || '');
  }

  function legacyDisplayFrom(baseTitle, emoji) {
    const base = cleanTitle(baseTitle);
    const e = norm(emoji);
    if (!base) return e || '';
    if (!e) return base;
    if (getEdgeEmoji(base) === e) return base;
    return isRTL(base) ? `${base} ${e}` : `${e} ${base}`;
  }

  function convergenceDiagnostic(kind, message) {
    const text = `title-convergence: ${String(message || kind || 'unknown')}`;
    if (kind === 'error') lastError = text;
    else lastWarning = text;
  }

  function clearConvergenceDiagnostics() {
    if (/^title-convergence:/u.test(lastWarning)) lastWarning = '';
    if (/^title-convergence:/u.test(lastError)) lastError = '';
  }

  function convergenceStatus(status) {
    lastConvergenceStatus = Object.freeze({
      requested: status.requested === true,
      enabled: status.enabled === true,
      mode: status.mode || 'legacy',
      source: status.source || 'default',
      gate: status.gate || 'not-requested',
    });
    return lastConvergenceStatus;
  }

  function resolveConvergenceStatus() {
    let requested = false;
    let source = 'default';
    try {
      if (Object.prototype.hasOwnProperty.call(W, CONVERGENCE_SESSION_OVERRIDE_KEY)) {
        const override = W[CONVERGENCE_SESSION_OVERRIDE_KEY];
        if (typeof override !== 'boolean') {
          convergenceDiagnostic('warning', 'invalid session override; legacy fallback active');
          return convergenceStatus({
            requested: false,
            enabled: false,
            mode: 'legacy-fallback',
            source: 'invalid-session-override',
            gate: 'not-requested',
          });
        }
        requested = override;
        source = 'session-override';
      } else {
        const flags = H2O.flags;
        if (flags && typeof flags.get === 'function') {
          const value = flags.get(CONVERGENCE_FLAG_KEY, false);
          if (value !== true && value !== false && value !== undefined) {
            convergenceDiagnostic('warning', 'invalid feature flag value; legacy fallback active');
            return convergenceStatus({
              requested: false,
              enabled: false,
              mode: 'legacy-fallback',
              source: 'invalid-feature-flag',
              gate: 'not-requested',
            });
          }
          requested = value === true;
          source = 'feature-flags';
        }
      }
    } catch (err) {
      convergenceDiagnostic('error', `flag resolution failed: ${err && err.message ? err.message : String(err || '')}`);
      return convergenceStatus({
        requested: false,
        enabled: false,
        mode: 'legacy-fallback',
        source: 'flag-error',
        gate: 'not-requested',
      });
    }

    if (!requested) {
      clearConvergenceDiagnostics();
      return convergenceStatus({
        requested: false,
        enabled: false,
        mode: 'legacy',
        source,
        gate: 'not-requested',
      });
    }

    const gate = inspectTitleContractParityGate();
    if (gate.gate !== 'ok' || typeof gate.sanitizer !== 'function' || typeof gate.formatter !== 'function') {
      convergenceDiagnostic('warning', `contract gate ${gate.gate || 'invalid'}; legacy fallback active`);
      return convergenceStatus({
        requested: true,
        enabled: false,
        mode: 'legacy-fallback',
        source,
        gate: gate.gate || 'invalid',
      });
    }

    clearConvergenceDiagnostics();
    convergenceStatus({
      requested: true,
      enabled: true,
      mode: 'canonical',
      source,
      gate: 'ok',
    });
    return Object.freeze({
      ...lastConvergenceStatus,
      sanitizer: gate.sanitizer,
      formatter: gate.formatter,
    });
  }

  function canonicalSanitizedTitle(raw, status) {
    const value = status.sanitizer(raw);
    if (typeof value !== 'string') throw new TypeError('sanitizeNativeTitle returned a non-string value');
    return value;
  }

  function canonicalDisplayFrom(baseTitle, emoji, status) {
    const sanitized = canonicalSanitizedTitle(baseTitle, status);
    const formatted = status.formatter(sanitized, emoji);
    if (!parityOrdinaryObject(formatted) || !Object.isFrozen(formatted)) {
      throw new TypeError('formatNativeDisplayTitle returned an invalid object');
    }
    const textDescriptor = parityOwnData(formatted, 'text');
    const dirDescriptor = parityOwnData(formatted, 'dir');
    if (!textDescriptor || typeof textDescriptor.value !== 'string' ||
        !dirDescriptor || !['ltr', 'rtl'].includes(dirDescriptor.value)) {
      throw new TypeError('formatNativeDisplayTitle returned invalid fields');
    }
    return textDescriptor.value;
  }

  function displayFrom(baseTitle, emoji) {
    const status = resolveConvergenceStatus();
    if (!status.enabled) return legacyDisplayFrom(baseTitle, emoji);
    try {
      return canonicalDisplayFrom(baseTitle, emoji, status);
    } catch (err) {
      convergenceDiagnostic('error', `canonical formatter failed: ${err && err.message ? err.message : String(err || '')}`);
      convergenceStatus({
        requested: true,
        enabled: false,
        mode: 'legacy-fallback',
        source: status.source,
        gate: 'formatter-error',
      });
      return legacyDisplayFrom(baseTitle, emoji);
    }
  }

  // A base title may legitimately contain an internal " - " separator, so the
  // separator must never be treated as a title delimiter. Only one terminal
  // "<dash> ChatGPT" suffix may be removed, matching the accepted contract
  // sanitizer. A bare "ChatGPT" stays rejected because the legacy ingestion
  // path uses this helper to read document/native titles on non-chat routes.
  function cleanTitle(raw) {
    const s = cleanFullTitle(raw);
    if (!s || /^chatgpt$/i.test(s)) return '';
    return s;
  }

  function cleanFullTitle(raw) {
    return norm(raw).replace(/\s*[–—-]\s*ChatGPT\s*$/i, '').trim();
  }

  function sanitizeWithConvergence(raw, legacySanitizer, diagnosticLabel) {
    const status = resolveConvergenceStatus();
    if (!status.enabled) return legacySanitizer(raw);
    try {
      return canonicalSanitizedTitle(raw, status);
    } catch (err) {
      convergenceDiagnostic('error', `${diagnosticLabel} failed: ${err && err.message ? err.message : String(err || '')}`);
      convergenceStatus({
        requested: true,
        enabled: false,
        mode: 'legacy-fallback',
        source: status.source,
        gate: 'sanitizer-error',
      });
      return legacySanitizer(raw);
    }
  }

  function sanitizeTitleForState(raw) {
    return sanitizeWithConvergence(raw, cleanTitle, 'canonical sanitizer');
  }

  function sanitizeNativeBaseTitle(raw) {
    return sanitizeWithConvergence(raw, cleanFullTitle, 'native sanitizer');
  }

  function safeId(id) {
    return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function isStableChatId(chatId) {
    const id = String(chatId || '');
    if (/^g-p-/i.test(id)) return false;
    return /^[a-z0-9][a-z0-9_-]{7,}$/i.test(id);
  }

  function canPersistChatId(chatId, routeKind) {
    return routeKind === 'chat' && isStableChatId(chatId);
  }

  function detectIdentity() {
    const path = location.pathname || '';
    let chatId = '';
    try {
      if (H2O.util && typeof H2O.util.getChatId === 'function') {
        chatId = norm(H2O.util.getChatId());
      }
    } catch {}
    const chatMatch = path.match(/\/c\/([a-z0-9_-]+)/i);
    if (!chatId && chatMatch) chatId = chatMatch[1];
    if (chatId) {
      return {
        chatId,
        routeKind: 'chat',
        stableId: isStableChatId(chatId),
        routeKey: `chat:${chatId}`,
      };
    }

    const projectMatch = path.match(/^\/g\/(g-p-[^/]+)\/project\/?$/i);
    if (projectMatch) {
      return {
        chatId: projectMatch[1],
        routeKind: 'project',
        stableId: false,
        routeKey: `project:${projectMatch[1]}`,
      };
    }

    return {
      chatId: null,
      routeKind: /^\/g\//i.test(path) ? 'project' : 'transient',
      stableId: false,
      routeKey: `transient:${path}`,
    };
  }

  function recordKeyForIdentity(nextIdentity) {
    return (nextIdentity && nextIdentity.chatId) || ACTIVE_TRANSIENT_KEY;
  }

  function ensureRecord(key, chatId) {
    const k = key || ACTIVE_TRANSIENT_KEY;
    let rec = records.get(k);
    if (!rec) {
      rec = {
        version: VERSION,
        chatId: chatId || null,
        baseTitle: '',
        source: 'none',
        priority: 0,
        confidence: 0,
        emoji: '',
        emojiSource: 'none',
        emojiPriority: 0,
        emojiConfidence: 0,
        updatedAt: 0,
        emojiUpdatedAt: 0,
        rev: 0,
        hydrated: false,
      };
      records.set(k, rec);
    }
    if (chatId && !rec.chatId) rec.chatId = chatId;
    return rec;
  }

  function snapshotRecord(rec) {
    return {
      version: VERSION,
      chatId: rec.chatId || null,
      baseTitle: rec.baseTitle || '',
      source: rec.source || 'none',
      priority: rec.priority || 0,
      confidence: rec.confidence || 0,
      emoji: rec.emoji || '',
      emojiSource: rec.emojiSource || 'none',
      emojiPriority: rec.emojiPriority || 0,
      emojiConfidence: rec.emojiConfidence || 0,
      updatedAt: rec.updatedAt || 0,
      emojiUpdatedAt: rec.emojiUpdatedAt || 0,
    };
  }

  function mergeRecordPayload(rec, payload, reason, restored) {
    if (!rec || !payload || typeof payload !== 'object') return false;
    let changed = false;
    const basePriority = Number(payload.priority || payload.basePriority || 0);
    const emojiPriority = Number(payload.emojiPriority || 0);

    // Persisted sources (boot cache, Store, cross-surface) all carry user
    // priority, so priority alone cannot order them. A higher priority still
    // wins outright; at equal priority only a strictly newer record may
    // replace the incumbent, which keeps equal-freshness deterministic and
    // stops a late stale Store read from defeating a newer cached record.
    const recordUpdatedAt = Number(rec.updatedAt || 0);
    const payloadUpdatedAt = Number(payload.updatedAt || 0);
    const basePriorityWins = basePriority > (rec.priority || 0);
    const baseFreshEnough = basePriorityWins
      || !recordUpdatedAt
      || (Number.isFinite(payloadUpdatedAt) && payloadUpdatedAt > recordUpdatedAt);

    if (payload.baseTitle && basePriority >= (rec.priority || 0) && baseFreshEnough) {
      const nextBase = sanitizeTitleForState(payload.baseTitle);
      if (nextBase && (nextBase !== rec.baseTitle || basePriority !== rec.priority)) {
        rec.baseTitle = nextBase;
        rec.source = payload.source || rec.source || reason || 'stored';
        rec.priority = basePriority;
        rec.confidence = clampConfidence(payload.confidence, rec.confidence || 0.8);
        rec.updatedAt = Number(payload.updatedAt || now());
        changed = true;
      }
    }

    const emojiRecordUpdatedAt = Number(rec.emojiUpdatedAt || 0);
    const emojiPayloadUpdatedAt = Number(payload.emojiUpdatedAt || payload.updatedAt || 0);
    const emojiFreshEnough = emojiPriority > (rec.emojiPriority || 0)
      || !emojiRecordUpdatedAt
      || (Number.isFinite(emojiPayloadUpdatedAt) && emojiPayloadUpdatedAt > emojiRecordUpdatedAt);

    if (payload.emoji && emojiPriority >= (rec.emojiPriority || 0) && emojiFreshEnough) {
      const nextEmoji = norm(payload.emoji);
      if (nextEmoji && (nextEmoji !== rec.emoji || emojiPriority !== rec.emojiPriority)) {
        rec.emoji = nextEmoji;
        rec.emojiSource = payload.emojiSource || payload.source || rec.emojiSource || reason || 'stored';
        rec.emojiPriority = emojiPriority;
        rec.emojiConfidence = clampConfidence(payload.emojiConfidence || payload.confidence, rec.emojiConfidence || 0.8);
        rec.emojiUpdatedAt = Number(payload.emojiUpdatedAt || payload.updatedAt || now());
        changed = true;
      }
    }

    if (changed) {
      rec.rev += 1;
      rec.hydrated = true;
      // A restore from persistence (boot cache or durable Store) is a stale
      // snapshot, not a live decision, so it is marked reconcilable against the
      // current native title exactly once. A live cross-surface broadcast is
      // not a restore and is never marked.
      rec.restoredFromPersistence = restored === true;
    }
    return changed;
  }

  function composeState(rec, nextIdentity, reason) {
    const displayTitle = displayFrom(rec.baseTitle, rec.emoji);
    titleContractParity.compare(rec.baseTitle, rec.emoji, displayTitle, routeToken);
    return {
      version: VERSION,
      chatId: nextIdentity.chatId || null,
      routeKind: nextIdentity.routeKind || 'transient',
      stableId: !!nextIdentity.stableId,
      routeToken,
      baseTitle: rec.baseTitle || '',
      emoji: rec.emoji || '',
      displayTitle,
      documentTitle: displayTitle,
      source: rec.source || 'none',
      emojiSource: rec.emojiSource || 'none',
      priority: rec.priority || 0,
      emojiPriority: rec.emojiPriority || 0,
      confidence: rec.confidence || 0,
      convergence: { ...lastConvergenceStatus },
      storageBackend: storageStatus.backend,
      durability: {
        durable: !!storageStatus.durable,
        healthy: !!storageStatus.healthy,
        degraded: !!storageStatus.degraded,
      },
      localStorageFallbackActive: isLocalStorageFallbackActive(),
      localStorageFallbackAvailable: !!storageStatus.localStorageFallbackAvailable,
      localStorageFallbackUsedThisSession: !!storageStatus.localStorageFallbackUsedThisSession,
      migratedFromLegacyLocalStorage: !!storageStatus.migratedFromLegacyLocalStorage,
      subscriberCount: subscribers.size,
      lastUpdateAt: Math.max(rec.updatedAt || 0, rec.emojiUpdatedAt || 0),
      lastReason: reason || '',
      lastWarning,
      lastError,
    };
  }

  function payloadFor(eventState, reason) {
    return {
      version: VERSION,
      chatId: eventState.chatId || null,
      routeKind: eventState.routeKind || 'transient',
      baseTitle: eventState.baseTitle || '',
      emoji: eventState.emoji || '',
      displayTitle: eventState.displayTitle || '',
      documentTitle: eventState.documentTitle || '',
      source: eventState.source || 'none',
      emojiSource: eventState.emojiSource || 'none',
      priority: eventState.priority || 0,
      emojiPriority: eventState.emojiPriority || 0,
      confidence: eventState.confidence || 0,
      convergence: eventState.convergence ? { ...eventState.convergence } : { ...lastConvergenceStatus },
      reason: reason || eventState.lastReason || '',
      timestamp: now(),
    };
  }

  function emitEvent(name, eventState, reason) {
    const payload = payloadFor(eventState || state, reason);
    try { W.dispatchEvent(new CustomEvent(`${EVENT_PREFIX}:${name}`, { detail: payload })); } catch {}
    try {
      if (H2O.events && typeof H2O.events.emit === 'function') {
        H2O.events.emit(`evt:${EVENT_PREFIX}:${name}`, payload);
      } else if (H2O.bus && typeof H2O.bus.emit === 'function') {
        H2O.bus.emit(`evt:${EVENT_PREFIX}:${name}`, payload);
      }
    } catch {}
    return payload;
  }

  function notify(reason, changedRecord) {
    activeRecord = ensureRecord(activeRecordKey, identity.chatId);
    state = composeState(activeRecord, identity, reason);
    W.H2O_fullOriginalTitle = state.displayTitle || state.baseTitle || '';
    const payload = emitEvent('changed', state, reason);
    subscribers.forEach((fn) => {
      try { fn({ ...state }, payload); } catch (err) { warn('subscriber', err); }
    });
    if (changedRecord) {
      persistRecord(changedRecord, reason);
    }
    return state;
  }

  function warn(context, err) {
    lastWarning = `${context}: ${err && err.message ? err.message : String(err || '')}`;
    try { console.warn('[H2O.ChatTitle]', context, err); } catch {}
  }

  function fail(context, err) {
    lastError = `${context}: ${err && err.message ? err.message : String(err || '')}`;
    try { console.warn('[H2O.ChatTitle]', context, err); } catch {}
  }

  // A restored snapshot must not outrank current reality forever. Native
  // ChatGPT is re-fetched on reload, so an exact-route native observation for
  // the active chat may supersede a restored record once, after which normal
  // provenance ordering resumes. Live in-session titles are never lowered.
  function canReconcileRestoredRecord(rec, options) {
    if (!rec || rec.restoredFromPersistence !== true) return false;
    const context = options && typeof options === 'object' ? options : {};
    if (context.nativeObservation !== true) return false;
    if (identity.routeKind !== 'chat') return false;
    if (!identity.chatId || !isStableChatId(identity.chatId)) return false;
    return rec.chatId === identity.chatId;
  }

  function shouldAcceptEmoji(rec, nextPriority, options) {
    if (options && options.force) return true;
    return Number(nextPriority || 0) >= Number(rec.emojiPriority || 0);
  }

  function setTitle(payload, options) {
    const input = payload || {};
    const targetIdentity = input.chatId
      ? { chatId: input.chatId, routeKind: 'chat', stableId: isStableChatId(input.chatId), routeKey: `chat:${input.chatId}` }
      : identity;
    const key = recordKeyForIdentity(targetIdentity);
    const rec = ensureRecord(key, targetIdentity.chatId);
    const source = input.source || 'detected';
    const priority = sourcePriority(source, input.priority, 'base');
    const split = splitEmojiFromTitle(input.baseTitle || input.title || input.rawTitle || '');
    const baseTitle = split.baseTitle;
    if (!baseTitle) return false;

    // A reconciling native observation replaces the value of a startup-restored
    // record without lowering its authority, so a later stale persisted read at
    // the original priority cannot win it back on priority alone.
    const priorityAccepted = !!(options && options.force)
      || Number(priority || 0) >= Number(rec.priority || 0);
    // A native read that merely confirms the restored value is an observation,
    // not a new authorship: it must not restamp the record (which would make
    // every genuinely newer persisted record look stale) and must not consume
    // the single reconciliation allowance.
    const reconcileAccepted = !priorityAccepted
      && baseTitle !== rec.baseTitle
      && canReconcileRestoredRecord(rec, options);

    let changed = false;
    if (priorityAccepted || reconcileAccepted) {
      const nextPriority = reconcileAccepted ? (rec.priority || priority) : priority;
      if (baseTitle !== rec.baseTitle || nextPriority !== rec.priority || source !== rec.source) {
        rec.baseTitle = baseTitle;
        rec.source = source;
        rec.priority = nextPriority;
        rec.confidence = clampConfidence(input.confidence, 0.8);
        rec.updatedAt = now();
        rec.rev += 1;
        rec.hydrated = true;
        // Adopting native truth is not a live authorship. A sidebar row can
        // still be rendering ChatGPT's pre-reload cached title when startup
        // reads it, and that stale value differs from the restored record just
        // as a current one would, so consuming the allowance here would let the
        // first stale read capture the record permanently. The record stays
        // restored-derived until something live authors it (user submit,
        // confirmed rename, live cross-surface payload), which lets the settled
        // native title still win; same-value reads change nothing.
        if (!reconcileAccepted) rec.restoredFromPersistence = false;
        changed = true;
      }
    }

    if (split.emoji) {
      const emojiSource = source.includes('native') || source.includes('official') ? 'native-title' : `${source}:title`;
      const emojiPriority = sourcePriority(emojiSource, input.emojiPriority, 'emoji');
      if (shouldAcceptEmoji(rec, emojiPriority, options)) {
        if (split.emoji !== rec.emoji || emojiPriority !== rec.emojiPriority || emojiSource !== rec.emojiSource) {
          rec.emoji = split.emoji;
          rec.emojiSource = emojiSource;
          rec.emojiPriority = emojiPriority;
          rec.emojiConfidence = clampConfidence(input.emojiConfidence || input.confidence, 0.85);
          rec.emojiUpdatedAt = now();
          rec.rev += 1;
          rec.hydrated = true;
          changed = true;
          emitEvent('emoji-updated', composeState(rec, targetIdentity, options?.reason || input.reason || 'title-emoji-detected'), options?.reason || input.reason || 'title-emoji-detected');
        }
      }
    }

    if (changed) {
      const eventState = composeState(rec, targetIdentity, options?.reason || input.reason || 'set-title');
      emitEvent('detected', eventState, options?.reason || input.reason || 'set-title');
      if (key === activeRecordKey) notify(options?.reason || input.reason || 'set-title', rec);
      else {
        emitEvent('changed', eventState, options?.reason || input.reason || 'set-title');
        persistRecord(rec, options?.reason || input.reason || 'set-title');
      }
    }
    return changed;
  }

  function setEmoji(payload, options) {
    const input = payload || {};
    const emoji = norm(input.emoji);
    const targetChatId = input.chatId || identity.chatId;
    if (!targetChatId && !identity.chatId) return false;
    const targetIdentity = targetChatId
      ? { chatId: targetChatId, routeKind: 'chat', stableId: isStableChatId(targetChatId), routeKey: `chat:${targetChatId}` }
      : identity;
    const key = recordKeyForIdentity(targetIdentity);
    const rec = ensureRecord(key, targetIdentity.chatId);
    const source = input.source || 'auto';
    const priority = sourcePriority(source, input.priority, 'emoji');
    if (!emoji) return false;
    if (!shouldAcceptEmoji(rec, priority, options)) return false;
    if (emoji === rec.emoji && priority === rec.emojiPriority && source === rec.emojiSource) return false;

    rec.emoji = emoji;
    rec.emojiSource = source;
    rec.emojiPriority = priority;
    rec.emojiConfidence = clampConfidence(input.confidence, 0.75);
    rec.emojiUpdatedAt = now();
    rec.rev += 1;
    rec.hydrated = true;

    const eventState = composeState(rec, targetIdentity, options?.reason || input.reason || 'set-emoji');
    emitEvent('emoji-updated', eventState, options?.reason || input.reason || 'set-emoji');
    if (key === activeRecordKey) notify(options?.reason || input.reason || 'set-emoji', rec);
    else {
      emitEvent('changed', eventState, options?.reason || input.reason || 'set-emoji');
      persistRecord(rec, options?.reason || input.reason || 'set-emoji');
    }
    return true;
  }

  function getState(chatId) {
    if (chatId) {
      const targetIdentity = { chatId, routeKind: 'chat', stableId: isStableChatId(chatId), routeKey: `chat:${chatId}` };
      const rec = ensureRecord(chatId, chatId);
      if (!rec.hydrated) {
        readBootCache(chatId, null);
        migrateLegacyEmoji(chatId, null);
      }
      return { ...composeState(rec, targetIdentity, 'get-state') };
    }
    return { ...state };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    subscribers.add(fn);
    try { fn({ ...state }, payloadFor(state, 'subscribe')); } catch (err) { warn('subscribe.initial', err); }
    return () => subscribers.delete(fn);
  }

  function markDocumentTitleWrite(nextTitle, options) {
    const opts = options || {};
    const expectedTitle = norm(nextTitle);
    ownDocumentWrite = {
      expectedTitle,
      source: opts.source || 'tab-title',
      expiresAt: now() + Math.max(50, Number(opts.ttlMs || TITLE_WRITE_TTL_MS)),
      createdAt: now(),
    };
    return { ...ownDocumentWrite };
  }

  function isOwnDocumentTitle(rawTitle) {
    if (!ownDocumentWrite) return false;
    if (now() > ownDocumentWrite.expiresAt) return false;
    return norm(rawTitle) === ownDocumentWrite.expectedTitle;
  }

  function readBootCache(chatId, capture) {
    if (!canPersistChatId(chatId, 'chat')) return false;
    try {
      const cacheKey = `${BOOT_CACHE_KEY_PREFIX}${chatId}`;
      const legacyCacheKey = `${LEGACY_BOOT_CACHE_KEY_PREFIX}${chatId}`;
      const raw = localStorage.getItem(cacheKey) || localStorage.getItem(legacyCacheKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION) return false;
      if (Number(parsed.expiresAt || 0) < now()) {
        try { localStorage.removeItem(cacheKey); } catch {}
        try { localStorage.removeItem(legacyCacheKey); } catch {}
        return false;
      }
      if (capture && !isCaptureCurrent(capture)) return false;
      const rec = ensureRecord(chatId, chatId);
      const changed = mergeRecordPayload(rec, parsed.state, 'boot-cache', true);
      storageStatus.localStorageFallbackUsedThisSession = true;
      if (!storageStatus.durable || !storageStatus.healthy || storageStatus.degraded) {
        storageStatus.localStorageFallbackActive = true;
      }
      if (changed && chatId === identity.chatId) notify('boot-cache', null);
      return changed;
    } catch (err) {
      fail('boot-cache.read', err);
      return false;
    }
  }

  // The boot cache is the reload fallback. It is written both as the active
  // fallback store and as a durability mirror while a healthy primary Store is
  // present; only the former marks the localStorage fallback as active.
  function writeBootCache(rec, options) {
    if (!rec || !canPersistChatId(rec.chatId, 'chat')) return;
    try {
      const payload = {
        version: VERSION,
        chatId: rec.chatId,
        state: snapshotRecord(rec),
        updatedAt: now(),
        expiresAt: now() + BOOT_CACHE_TTL_MS,
      };
      localStorage.setItem(`${BOOT_CACHE_KEY_PREFIX}${rec.chatId}`, JSON.stringify(payload));
      storageStatus.localStorageFallbackUsedThisSession = true;
      if (!options || options.fallbackActive !== false) storageStatus.localStorageFallbackActive = true;
    } catch (err) {
      warn('boot-cache.write', err);
    }
  }

  function readMigrationIndex() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MIGRATION_KEY) || localStorage.getItem(LEGACY_MIGRATION_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeMigrationIndex(index) {
    try {
      localStorage.setItem(MIGRATION_KEY, JSON.stringify(index || {}));
    } catch (err) {
      warn('migration.write-index', err);
    }
  }

  function migrateLegacyEmoji(chatId, capture) {
    if (!canPersistChatId(chatId, 'chat')) return false;
    if (capture && !isCaptureCurrent(capture)) return false;
    const index = readMigrationIndex();
    if (index[chatId]) return false;
    let emoji = '';
    const modernKey = `h2o:prm:cgx:tmjttl:state:emoji_${safeId(chatId)}:v1`;
    const legacyKey = `ho:autoemoji:emoji:${chatId}`;
    try { emoji = norm(localStorage.getItem(modernKey) || ''); } catch {}
    if (!emoji) {
      try { emoji = norm(localStorage.getItem(legacyKey) || ''); } catch {}
    }
    if (emoji) {
      storageStatus.migratedFromLegacyLocalStorage = true;
      setEmoji({
        chatId,
        emoji,
        source: 'migration:autoemoji',
        priority: EMOJI_PRIORITY.migration,
        confidence: 0.8,
        reason: 'legacy-autoemoji-migration',
      }, { reason: 'legacy-autoemoji-migration' });
    }
    try { localStorage.removeItem(legacyKey); } catch {}
    try { localStorage.removeItem(`ho:autoemoji:done:${chatId}`); } catch {}
    storageStatus.localStorageFallbackUsedThisSession = true;
    index[chatId] = now();
    writeMigrationIndex(index);
    return !!emoji;
  }

  function storageKey(chatId) {
    return `${STORE_STATE_KEY_PREFIX}${chatId}`;
  }

  function captureFor(chatId) {
    return {
      chatId: chatId || identity.chatId || null,
      routeToken,
      opId: ++opSeq,
    };
  }

  function isCaptureCurrent(capture) {
    if (!capture) return false;
    if (capture.routeToken !== routeToken) return false;
    return (capture.chatId || null) === (identity.chatId || null);
  }

  async function hydrateFromStore(chatId, reason) {
    if (!storeAdapter || !canPersistChatId(chatId, 'chat')) return false;
    const capture = captureFor(chatId);
    try {
      const payload = await storeAdapter.get(storageKey(chatId));
      if (!isCaptureCurrent(capture)) return false;
      if (!payload || typeof payload !== 'object') return false;
      const rec = ensureRecord(chatId, chatId);
      const changed = mergeRecordPayload(rec, payload, reason || 'store-hydrate', true);
      if (changed) notify(reason || 'store-hydrate', null);
      return changed;
    } catch (err) {
      fail('store.hydrate', err);
      return false;
    }
  }

  async function persistRecord(rec, reason) {
    if (!rec || !canPersistChatId(rec.chatId, 'chat')) return false;
    const rev = rec.rev;
    const chatId = rec.chatId;
    const capture = { chatId, routeToken, opId: ++opSeq };
    const payload = snapshotRecord(rec);

    // Write the reload fallback from the accepted record before any await, so
    // the boot cache carries it whether the primary Store is unavailable,
    // delayed, superseded, rejected, timed out, or successful.
    const durablePrimary = !!storeAdapter && !!storageStatus.durable && !debugStorageDegraded;
    writeBootCache(rec, { fallbackActive: !durablePrimary });

    if (!durablePrimary) return false;
    await Promise.resolve();
    if (capture.routeToken !== routeToken) return false;
    const latest = records.get(chatId);
    if (!latest || latest.rev !== rev) return false;
    try {
      await storeAdapter.set(storageKey(chatId), payload);
      if (/^store\.persist:/i.test(lastError)) lastError = '';
      storageStatus.localStorageFallbackActive = false;
      if (!isCaptureCurrent(capture)) return true;
      emitEvent('storage', state, reason || 'store-persist');
      return true;
    } catch (err) {
      fail('store.persist', err);
      writeBootCache(rec);
      return false;
    }
  }

  function isStoreHealthy(Store) {
    if (!Store || debugStorageDegraded) return false;
    if (typeof Store.get !== 'function' || typeof Store.set !== 'function') return false;
    let caps = null;
    try { caps = typeof Store.caps === 'function' ? Store.caps() : null; } catch {}
    return !!(caps && caps.ready && caps.durable && caps.health !== 'degraded');
  }

  async function attachStore(reason) {
    if (storeAttachInFlight) return;
    storeAttachInFlight = true;
    try {
      const Store = H2O.Library && H2O.Library.Store;
      if (!Store || debugStorageDegraded) {
        storeAdapter = null;
        storageStatus = {
          ...storageStatus,
          backend: debugStorageDegraded ? 'debug-degraded' : 'memory',
          durable: false,
          healthy: false,
          degraded: !!debugStorageDegraded,
          localStorageFallbackActive: true,
        };
        notify(reason || 'store-unavailable', null);
        emitEvent('storage', state, reason || 'store-unavailable');
        return;
      }
      if (Store._readyPromise && typeof Store._readyPromise.then === 'function') {
        await Promise.race([
          Store._readyPromise.catch(() => null),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      }
      let caps = null;
      try { caps = typeof Store.caps === 'function' ? Store.caps() : null; } catch {}
      const healthy = isStoreHealthy(Store);
      if (!healthy) {
        storeAdapter = null;
        storageStatus = {
          ...storageStatus,
          backend: typeof Store.backend === 'function' ? Store.backend() : 'store-degraded',
          durable: !!(caps && caps.durable),
          healthy: false,
          degraded: true,
          localStorageFallbackActive: true,
        };
        notify(reason || 'store-degraded', null);
        emitEvent('storage', state, reason || 'store-degraded');
        return;
      }
      storeAdapter = Store;
      storageStatus = {
        ...storageStatus,
        backend: typeof Store.backend === 'function' ? Store.backend() : 'h2o-library-store',
        durable: true,
        healthy: true,
        degraded: false,
        localStorageFallbackActive: false,
        attachedAt: now(),
      };
      notify(reason || 'store-attached', null);
      emitEvent('storage', state, reason || 'store-attached');
      if (identity.chatId && canPersistChatId(identity.chatId, identity.routeKind)) {
        hydrateFromStore(identity.chatId, reason || 'store-attached');
      }
    } catch (err) {
      fail('store.attach', err);
    } finally {
      storeAttachInFlight = false;
    }
  }

  function scheduleStoreAttach(reason) {
    clearTimeout(attachTimer);
    attachTimer = setTimeout(() => { attachStore(reason || 'scheduled-store-attach'); }, 100);
  }

  function getSidebarEntry(chatId) {
    if (!chatId) return null;
    const id = String(chatId).replace(/"/g, '\\"');
    return D.querySelector(
      `aside a[href*="/c/${id}"], nav a[href*="/c/${id}"], aside button[href*="/c/${id}"], nav button[href*="/c/${id}"]`
    );
  }

  function readTextExcluding(root) {
    if (!root) return '';
    const ignore = [
      '.ho-emoji-badge',
      '.ho-emoji-lane',
      '.ho-emoji-picker',
      '.ho-colorbtn',
      '.ho-palette',
      '.ho-swatch',
      '.ho-meta-row',
      '.ho-meta-action',
      '.ho-meta-actions-right',
      '#ho-preview-tip',
      '[data-cgxui-owner]',
      '[data-h2o-owner]',
      '[data-ho-owner]',
    ].join(',');
    const walker = D.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const t = norm(node.nodeValue);
        if (!t) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (parent && parent.closest && parent.closest(ignore)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const texts = [];
    while (walker.nextNode()) texts.push(norm(walker.currentNode.nodeValue));
    return texts.filter((t) => t.length >= 2).sort((a, b) => b.length - a.length)[0] || '';
  }

  function readSidebarTitle(chatId) {
    const entry = getSidebarEntry(chatId);
    if (!entry) return '';
    const raw = norm(
      entry.getAttribute('data-ho-raw-title') ||
      entry.dataset?.hoRawTitle ||
      entry.dataset?.hoRawTitleFull ||
      ''
    );
    if (raw) return sanitizeTitleForState(raw) || raw;
    return readTextExcluding(entry);
  }

  function readProjectTitle() {
    const selectors = ['main h1', 'header h1', 'h1', '[role="heading"][aria-level="1"]'];
    for (const selector of selectors) {
      const text = sanitizeTitleForState(D.querySelector(selector)?.textContent || '');
      if (text) return text;
    }
    return '';
  }

  function readLibraryTitle(chatId) {
    try {
      const index = H2O.LibraryIndex;
      if (!index || typeof index.getChat !== 'function') return '';
      const row = index.getChat(chatId);
      return sanitizeTitleForState(row && (row.title || row.name || row.label));
    } catch {
      return '';
    }
  }

  function readDocumentTitle() {
    const raw = D.title || '';
    if (!raw || isOwnDocumentTitle(raw)) return '';
    return sanitizeTitleForState(raw);
  }

  async function readChatGptAccessToken(signal) {
    try {
      if (typeof W.fetch !== 'function') return '';
      const res = await W.fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal,
      });
      if (!res?.ok) return '';
      const json = await res.json();
      return norm(json?.accessToken || json?.access_token || '');
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      return '';
    }
  }

  function nativeConversationHeaders(path, accessToken) {
    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-openai-target-path': path,
      'x-openai-target-route': path,
    };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    return headers;
  }

  async function patchNativeConversationTitle(chatId, title, options) {
    if (typeof W.fetch !== 'function') return { ok: false, status: 'fetch-unavailable' };
    const signal = options?.signal;
    const path = `/backend-api/conversation/${encodeURIComponent(chatId)}`;
    const accessToken = await readChatGptAccessToken(signal);
    if (signal?.aborted) return { ok: false, status: 'aborted' };
    const prePatchStatus = typeof options?.operationStatus === 'function'
      ? options.operationStatus()
      : 'current';
    if (prePatchStatus !== 'current') {
      return {
        ok: false,
        status: prePatchStatus,
        reason: prePatchStatus,
        beforePatch: true,
      };
    }
    const res = await W.fetch(path, {
      method: 'PATCH',
      credentials: 'include',
      cache: 'no-store',
      headers: nativeConversationHeaders(path, accessToken),
      body: JSON.stringify({ title }),
      signal,
    });
    let body = null;
    try { body = await res.clone().json(); } catch {}
    if (!res?.ok) {
      return {
        ok: false,
        status: `backend-${res?.status || 'unknown'}`,
        statusCode: Number(res?.status || 0) || 0,
        body,
      };
    }
    return { ok: true, status: 'backend-submitted', statusCode: Number(res.status || 200), body };
  }

  function updateConversationHistoryCacheTitle(chatId, title) {
    try {
      const box = W.localStorage;
      const len = Number(box?.length || 0);
      for (let i = 0; i < len; i += 1) {
        const key = String(box.key(i) || '');
        if (!key || !/\/conversation-history$/i.test(key)) continue;
        const raw = box.getItem(key);
        if (!raw) continue;
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
        if (!parsed || typeof parsed !== 'object') continue;
        let changed = false;
        const pages = Array.isArray(parsed?.value?.pages) ? parsed.value.pages : [];
        pages.forEach((page) => {
          const items = Array.isArray(page?.items) ? page.items : [];
          items.forEach((item) => {
            if (String(item?.id || item?.conversationId || '') !== String(chatId)) return;
            item.title = title;
            changed = true;
          });
        });
        if (changed) box.setItem(key, JSON.stringify(parsed));
      }
    } catch (err) {
      warn('conversation-history-cache-title', err);
    }
  }

  // After a confirmed Native rename the server and the ChatGPT history cache
  // both hold the new clean base title, but an already-rendered sidebar row
  // keeps its previous text until ChatGPT itself re-renders. Reconcile those
  // rows with the value we just made authoritative so a later reveal (feature
  // rollback, collapse, virtualization) cannot expose a pre-rename title.
  //
  // Only the confirmed clean baseTitle is written - never a composed display
  // title - so every existing native-title reader keeps reading clean base
  // text. H2O-owned nodes are skipped and no ownership marker is added.
  function reconcileNativeSidebarTitle(chatId, baseTitle) {
    const nextText = norm(baseTitle);
    if (!chatId || !nextText || !isStableChatId(chatId)) return 0;
    const id = String(chatId).replace(/"/g, '\\"');
    let updated = 0;
    try {
      const anchors = D.querySelectorAll(
        `aside a[href*="/c/${id}"], nav a[href*="/c/${id}"]`
      );
      for (const anchor of anchors || []) {
        if (!anchor || typeof anchor.querySelector !== 'function') continue;
        if (anchor.closest && anchor.closest('[data-h2o-owner]')) continue;
        const source = anchor.querySelector(NATIVE_TITLE_SELECTOR);
        if (!source || typeof source.textContent !== 'string') continue;
        if (source.closest && source.closest('[data-h2o-owner]')) continue;
        if (norm(source.textContent) === nextText) continue;
        source.textContent = nextText;
        updated += 1;
      }
    } catch (err) {
      warn('native-sidebar-title-reconcile', err);
    }
    return updated;
  }

  function detectTitles(reason) {
    if (identity.routeKind === 'chat' && identity.chatId) {
      const sidebarTitle = readSidebarTitle(identity.chatId);
      if (sidebarTitle) setTitle({ chatId: identity.chatId, baseTitle: sidebarTitle, source: 'native', priority: BASE_PRIORITY.native, confidence: 0.95, reason }, { reason, nativeObservation: true });

      const libraryTitle = readLibraryTitle(identity.chatId);
      if (libraryTitle) setTitle({ chatId: identity.chatId, baseTitle: libraryTitle, source: 'library', priority: BASE_PRIORITY.library, confidence: 0.85, reason }, { reason });

      const docTitle = readDocumentTitle();
      if (docTitle) setTitle({ chatId: identity.chatId, baseTitle: docTitle, source: 'document', priority: BASE_PRIORITY.document, confidence: 0.65, reason }, { reason });

      if (!activeRecord.baseTitle && identity.chatId) {
        setTitle({ chatId: identity.chatId, baseTitle: `Chat ${identity.chatId.slice(0, 8)}`, source: 'url', priority: BASE_PRIORITY.url, confidence: 0.25, reason }, { reason });
      }
      return;
    }

    if (identity.routeKind === 'project') {
      const projectTitle = readProjectTitle() || readDocumentTitle();
      if (projectTitle) setTitle({ baseTitle: projectTitle, source: 'detected', priority: BASE_PRIORITY.detected, confidence: 0.75, reason }, { reason });
      return;
    }

    const docTitle = readDocumentTitle();
    if (docTitle) setTitle({ baseTitle: docTitle, source: 'document', priority: BASE_PRIORITY.document, confidence: 0.55, reason }, { reason });
  }

  function refresh(reason) {
    if (destroyed) return getState();
    const nextIdentity = detectIdentity();
    const nextKey = nextIdentity.routeKey;
    if (nextKey !== lastIdentityKey) {
      routeToken += 1;
      lastIdentityKey = nextKey;
      identity = nextIdentity;
      activeRecordKey = recordKeyForIdentity(identity);
      activeRecord = ensureRecord(activeRecordKey, identity.chatId);
      state = composeState(activeRecord, identity, reason || 'route-change');
      notify(reason || 'route-change', null);

      const capture = captureFor(identity.chatId);
      if (identity.chatId && canPersistChatId(identity.chatId, identity.routeKind)) {
        readBootCache(identity.chatId, capture);
        migrateLegacyEmoji(identity.chatId, capture);
        hydrateFromStore(identity.chatId, reason || 'route-change');
      }
    } else {
      identity = nextIdentity;
      activeRecordKey = recordKeyForIdentity(identity);
      activeRecord = ensureRecord(activeRecordKey, identity.chatId);
    }
    detectTitles(reason || 'refresh');
    scheduleStoreAttach(reason || 'refresh');
    return getState();
  }

  function scheduleRefresh(reason, delay, scheduling) {
    if (destroyed) return false;
    const options = scheduling && typeof scheduling === 'object' ? scheduling : {};
    const priority = Number.isFinite(options.priority)
      ? options.priority
      : REFRESH_PRIORITY_DEFAULT;
    const routeKey = typeof options.routeKey === 'string' ? options.routeKey : '';

    if (pendingRefresh) {
      if (pendingRefresh.priority > priority) return false;
      if (
        priority === REFRESH_PRIORITY_ROUTE
        && pendingRefresh.priority === REFRESH_PRIORITY_ROUTE
        && pendingRefresh.routeKey === routeKey
      ) {
        return false;
      }
    }

    clearTimeout(refreshTimer);
    const token = ++refreshScheduleSeq;
    pendingRefresh = {
      token,
      priority,
      routeKey,
      reason: String(reason || 'scheduled-refresh'),
    };
    refreshTimer = setTimeout(() => {
      if (destroyed || !pendingRefresh || pendingRefresh.token !== token) return;
      const scheduled = pendingRefresh;
      pendingRefresh = null;
      refreshTimer = 0;
      try { refresh(scheduled.reason); } catch (err) { fail('refresh', err); }
    }, Number.isFinite(delay) ? delay : 120);
    return true;
  }

  function scheduleRouteRefresh(reason) {
    if (destroyed) return false;
    const nextIdentity = detectIdentity();
    const routeKey = nextIdentity.routeKey;
    if (routeKey === lastIdentityKey) {
      if (
        pendingRefresh
        && pendingRefresh.priority === REFRESH_PRIORITY_ROUTE
        && pendingRefresh.routeKey !== routeKey
      ) {
        clearTimeout(refreshTimer);
        refreshTimer = 0;
        pendingRefresh = null;
      }
      return false;
    }
    return scheduleRefresh(reason || 'route-event', ROUTE_REFRESH_DELAY_MS, {
      priority: REFRESH_PRIORITY_ROUTE,
      routeKey,
    });
  }

  function installRouteEventListeners() {
    if (destroyed || routeListenersInstalled) return false;
    const onRouteEvent = () => {
      scheduleRouteRefresh('route-event');
    };
    const installed = [];
    for (const eventName of ROUTE_EVENT_NAMES) {
      try {
        W.addEventListener(eventName, onRouteEvent, { passive: true });
        installed.push(eventName);
      } catch {}
    }
    if (installed.length === 0) return false;
    routeListenersInstalled = true;
    routeListenerDisposer = () => {
      if (!routeListenersInstalled) return;
      routeListenersInstalled = false;
      for (const eventName of installed) {
        try { W.removeEventListener(eventName, onRouteEvent); } catch {}
      }
    };
    return true;
  }

  function dispatchConvergenceFlagChange(value, source) {
    try {
      W.dispatchEvent(new CustomEvent(CONVERGENCE_FLAG_EVENT_NAMES[0], {
        detail: {
          name: CONVERGENCE_FLAG_KEY,
          value,
          source: source || 'flags.set',
        },
      }));
    } catch {}
  }

  function attachConvergenceFlagSetHook() {
    if (destroyed || convergenceFlagSetRestore) return !!convergenceFlagSetRestore;
    const flags = H2O.flags;
    if (!flags || typeof flags.set !== 'function') return false;
    const originalSet = flags.set;
    const wrappedSet = function (name, value) {
      const result = originalSet.apply(this, arguments);
      if (String(name || '') === CONVERGENCE_FLAG_KEY) {
        dispatchConvergenceFlagChange(value, 'flags.set');
      }
      return result;
    };
    try {
      flags.set = wrappedSet;
    } catch {
      return false;
    }
    if (flags.set !== wrappedSet) return false;
    convergenceFlagSetRestore = () => {
      try {
        if (flags.set === wrappedSet) flags.set = originalSet;
      } catch {}
      convergenceFlagSetRestore = null;
    };
    return true;
  }

  function scheduleConvergenceFlagSetHook() {
    if (destroyed || convergenceFlagSetRestore || convergenceFlagAttachTimer) return;
    convergenceFlagAttachTimer = setTimeout(() => {
      convergenceFlagAttachTimer = 0;
      if (!attachConvergenceFlagSetHook()) scheduleConvergenceFlagSetHook();
    }, 120);
  }

  function installConvergenceFlagListener() {
    if (destroyed || convergenceFlagListenerInstalled) return convergenceFlagListenerInstalled;
    const onFlagChange = (event) => {
      if (destroyed) return;
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const name = String(detail.name || detail.key || detail.flag || '');
      if (name && name !== CONVERGENCE_FLAG_KEY) return;
      refreshDisplayIfConvergenceChanged('convergence-flag-change');
    };
    const onStorage = (event) => {
      if (destroyed || String(event?.key || '') !== FLAGS_STORAGE_KEY) return;
      refreshDisplayIfConvergenceChanged('convergence-flag-storage-change');
    };
    for (const eventName of CONVERGENCE_FLAG_EVENT_NAMES) {
      W.addEventListener(eventName, onFlagChange);
    }
    W.addEventListener('storage', onStorage);
    convergenceFlagListenerInstalled = true;
    convergenceFlagListenerDisposer = () => {
      if (!convergenceFlagListenerInstalled) return;
      convergenceFlagListenerInstalled = false;
      for (const eventName of CONVERGENCE_FLAG_EVENT_NAMES) {
        try { W.removeEventListener(eventName, onFlagChange); } catch {}
      }
      try { W.removeEventListener('storage', onStorage); } catch {}
      clearTimeout(convergenceFlagAttachTimer);
      convergenceFlagAttachTimer = 0;
      try { convergenceFlagSetRestore?.(); } catch {}
      convergenceFlagSetRestore = null;
    };
    if (!attachConvergenceFlagSetHook()) scheduleConvergenceFlagSetHook();
    return true;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    try { activeRenameOperation?.controller?.abort?.(); } catch {}
    activeRenameOperation = null;
    clearTimeout(refreshTimer);
    refreshTimer = 0;
    pendingRefresh = null;
    if (routeListenerDisposer) routeListenerDisposer();
    routeListenerDisposer = null;
    if (convergenceFlagListenerDisposer) convergenceFlagListenerDisposer();
    convergenceFlagListenerDisposer = null;
    return true;
  }

  async function renameNative(title, options) {
    const opts = options || {};
    const rejectBeforeRequest = (reason, extra) => ({
      ok: false,
      status: reason,
      reason,
      beforeRequest: true,
      ...(extra || {}),
    });
    if (!opts.userInitiated) {
      warn('renameNative.refused', 'missing userInitiated option');
      return rejectBeforeRequest('not-user-initiated');
    }

    const liveIdentity = detectIdentity();
    if (destroyed) return rejectBeforeRequest('destroyed-before-request');
    if (identity.routeKind !== 'chat' || !identity.chatId) {
      return rejectBeforeRequest('route-stale-before-request');
    }
    if (
      liveIdentity.routeKind !== identity.routeKind ||
      liveIdentity.chatId !== identity.chatId ||
      liveIdentity.routeKey !== identity.routeKey
    ) {
      return rejectBeforeRequest('route-stale-before-request', {
        chatId: identity.chatId || null,
        routeToken,
      });
    }

    const chatId = String(opts.chatId || identity.chatId || '').trim();
    if (!chatId) return rejectBeforeRequest('missing-chat-id');
    if (chatId !== identity.chatId) {
      return rejectBeforeRequest('route-stale-before-request', { chatId, routeToken });
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'expectedRouteToken')) {
      if (!Number.isSafeInteger(opts.expectedRouteToken) || opts.expectedRouteToken !== routeToken) {
        return rejectBeforeRequest('route-stale-before-request', { chatId, routeToken });
      }
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'expectedRouteKind')) {
      if (String(opts.expectedRouteKind || '') !== identity.routeKind) {
        return rejectBeforeRequest('route-stale-before-request', { chatId, routeToken });
      }
    }

    const externalSignal = opts.signal;
    if (externalSignal !== undefined && (
      !externalSignal ||
      typeof externalSignal !== 'object' ||
      typeof externalSignal.aborted !== 'boolean'
    )) {
      return rejectBeforeRequest('invalid-signal-before-request', { chatId, routeToken });
    }
    if (externalSignal?.aborted) {
      return rejectBeforeRequest('aborted-before-request', { chatId, routeToken });
    }

    const sanitizedSubmission = sanitizeNativeBaseTitle(title);
    if (!sanitizedSubmission) return rejectBeforeRequest('empty-title', { chatId, routeToken });
    const submitted = splitNativeSubmission(sanitizedSubmission);
    const nextBaseTitle = sanitizeNativeBaseTitle(submitted.baseTitle);
    if (!nextBaseTitle) {
      return rejectBeforeRequest('empty-base-after-emoji', { chatId, routeToken });
    }

    const reason = opts.source || 'rename-native';
    const operationNonce = ++renameOperationSeq;
    const requestedOperationId = typeof opts.operationId === 'string' ? opts.operationId.trim() : '';
    if (Object.prototype.hasOwnProperty.call(opts, 'operationId') && !requestedOperationId) {
      return rejectBeforeRequest('invalid-operation-id-before-request', { chatId, routeToken });
    }
    const operationId = requestedOperationId || `title-rename-${operationNonce}`;
    try { activeRenameOperation?.controller?.abort?.(); } catch {}
    const controller = typeof W.AbortController === 'function' ? new W.AbortController() : null;
    let removeExternalAbort = null;
    if (controller && externalSignal && typeof externalSignal.addEventListener === 'function') {
      const forwardAbort = () => {
        try { controller.abort(externalSignal.reason); } catch { try { controller.abort(); } catch {} }
      };
      externalSignal.addEventListener('abort', forwardAbort, { once: true });
      removeExternalAbort = () => {
        try { externalSignal.removeEventListener?.('abort', forwardAbort); } catch {}
      };
    }
    const signal = controller?.signal || externalSignal;
    const operation = {
      nonce: operationNonce,
      operationId,
      chatId,
      routeToken,
      routeKind: identity.routeKind,
      controller,
      signal,
    };
    activeRenameOperation = operation;

    const operationStatus = () => {
      if (destroyed) return 'destroyed';
      if (!activeRenameOperation || activeRenameOperation.nonce !== operationNonce) return 'superseded';
      const currentLiveIdentity = detectIdentity();
      if (
        operation.routeToken !== routeToken ||
        operation.routeKind !== identity.routeKind ||
        operation.chatId !== identity.chatId ||
        currentLiveIdentity.routeKind !== operation.routeKind ||
        currentLiveIdentity.chatId !== operation.chatId ||
        currentLiveIdentity.routeKey !== identity.routeKey
      ) {
        return 'route-stale';
      }
      if (operation.signal?.aborted) return 'aborted';
      return 'current';
    };

    try {
      const freshness = operationStatus();
      if (freshness !== 'current') {
        return { ok: false, status: freshness, reason: freshness, operationId, title: nextBaseTitle, chatId };
      }
      const result = await patchNativeConversationTitle(chatId, nextBaseTitle, {
        signal,
        operationStatus,
      });
      const completionStatus = operationStatus();
      if (completionStatus !== 'current') {
        return {
          ok: false,
          status: completionStatus,
          reason: completionStatus,
          operationId,
          title: nextBaseTitle,
          emoji: submitted.emoji,
          chatId,
        };
      }
      if (!result.ok) {
        return {
          ...result,
          operationId,
          title: nextBaseTitle,
          emoji: submitted.emoji,
          chatId,
        };
      }
      updateConversationHistoryCacheTitle(chatId, nextBaseTitle);
      reconcileNativeSidebarTitle(chatId, nextBaseTitle);
      setTitle({
        chatId,
        baseTitle: submitted.emoji ? sanitizedSubmission : nextBaseTitle,
        source: 'user',
        priority: BASE_PRIORITY.user,
        confidence: 1,
        reason,
      }, { force: true, userInitiated: true, reason });
      scheduleRefresh(reason, 80);
      return {
        ...result,
        operationId,
        title: nextBaseTitle,
        baseTitle: nextBaseTitle,
        emoji: submitted.emoji,
        chatId,
      };
    } catch (err) {
      const completionStatus = operationStatus();
      if (completionStatus !== 'current' || err?.name === 'AbortError') {
        return {
          ok: false,
          status: completionStatus === 'current' ? 'aborted' : completionStatus,
          reason: completionStatus === 'current' ? 'aborted' : completionStatus,
          operationId,
          title: nextBaseTitle,
          emoji: submitted.emoji,
          chatId,
        };
      }
      fail('renameNative', err);
      return {
        ok: false,
        status: 'error',
        reason: 'error',
        operationId,
        title: nextBaseTitle,
        emoji: submitted.emoji,
        chatId,
        error: String(err && err.message || err),
      };
    } finally {
      try { removeExternalAbort?.(); } catch {}
      if (activeRenameOperation?.nonce === operationNonce) activeRenameOperation = null;
    }
  }

  function refreshDisplay(reason) {
    if (destroyed) return getState();
    return notify(reason || 'display-refresh', null);
  }

  function refreshDisplayIfConvergenceChanged(reason) {
    if (destroyed) return getState();
    const previous = state?.convergence || {};
    const next = resolveConvergenceStatus();
    if (
      previous.requested === next.requested &&
      previous.enabled === next.enabled &&
      previous.mode === next.mode &&
      previous.source === next.source &&
      previous.gate === next.gate
    ) {
      return getState();
    }
    return notify(reason || 'convergence-display-refresh', null);
  }

  function selfCheck() {
    return {
      ok: true,
      version: VERSION,
      currentTitle: state.baseTitle || '',
      currentEmoji: state.emoji || '',
      displayTitle: state.displayTitle || '',
      documentTitle: state.documentTitle || '',
      source: state.source || 'none',
      emojiSource: state.emojiSource || 'none',
      priority: state.priority || 0,
      emojiPriority: state.emojiPriority || 0,
      confidence: state.confidence || 0,
      chatId: state.chatId || null,
      routeKind: state.routeKind || 'transient',
      routeToken,
      stableId: !!state.stableId,
      storageBackend: storageStatus.backend,
      durability: { ...state.durability },
      localStorageFallbackActive: isLocalStorageFallbackActive(),
      localStorageFallbackAvailable: !!storageStatus.localStorageFallbackAvailable,
      localStorageFallbackUsedThisSession: !!storageStatus.localStorageFallbackUsedThisSession,
      migratedFromLegacyLocalStorage: !!storageStatus.migratedFromLegacyLocalStorage,
      subscribers: subscribers.size,
      listeners: {
        titleObserver: !!titleObserver,
        bodyObserver: !!bodyObserver,
        history: !!history.__h2oChatTitlePatched,
      },
      lastUpdateTimestamp: state.lastUpdateAt || 0,
      lastError: lastError || '',
      lastWarning: lastWarning || '',
      convergence: { ...state.convergence },
      titleContractParity: titleContractParity.snapshot(),
      ownDocumentWrite: ownDocumentWrite ? {
        expectedTitle: ownDocumentWrite.expectedTitle,
        source: ownDocumentWrite.source,
        active: now() <= ownDocumentWrite.expiresAt,
      } : null,
    };
  }

  function installTitleObserver() {
    const el = D.querySelector('title');
    if (!el) return false;
    if (titleObserver) return true;
    titleObserver = new MutationObserver(() => {
      const raw = D.title || '';
      if (isOwnDocumentTitle(raw)) return;
      const title = sanitizeTitleForState(raw);
      if (title) {
        setTitle({ baseTitle: title, source: 'document', priority: BASE_PRIORITY.document, confidence: 0.65, reason: 'document-title-observer' }, { reason: 'document-title-observer' });
      }
    });
    titleObserver.observe(el, { childList: true, characterData: true, subtree: true });
    return true;
  }

  function installObservers() {
    const titlePoll = setInterval(() => {
      if (installTitleObserver()) clearInterval(titlePoll);
    }, 150);
    installTitleObserver();

    const installBody = () => {
      if (bodyObserver || !D.body) return;
      bodyObserver = new MutationObserver(() => scheduleRefresh('dom-mutation', 160));
      bodyObserver.observe(D.body, { childList: true, subtree: true });
    };

    if (D.body) installBody();
    else D.addEventListener('DOMContentLoaded', installBody, { once: true });
  }

  function patchHistory() {
    if (history.__h2oChatTitlePatched) return;
    const push = history.pushState;
    const replace = history.replaceState;
    history.pushState = function (...args) {
      const ret = push.apply(this, args);
      scheduleRouteRefresh('pushstate');
      return ret;
    };
    history.replaceState = function (...args) {
      const ret = replace.apply(this, args);
      scheduleRouteRefresh('replacestate');
      return ret;
    };
    try { Object.defineProperty(history, '__h2oChatTitlePatched', { value: true, configurable: true }); } catch { history.__h2oChatTitlePatched = true; }
    W.addEventListener('popstate', () => scheduleRouteRefresh('popstate'));
    W.addEventListener('focus', () => scheduleRefresh('focus', 80));
    D.addEventListener('visibilitychange', () => {
      if (!D.hidden) scheduleRefresh('visibilitychange', 80);
    });
    W.addEventListener('h2o:library:store:ready', () => scheduleStoreAttach('library-store-ready'));
    W.addEventListener('evt:h2o:library:store:ready', () => scheduleStoreAttach('library-store-ready'));
  }

  function unwrapCrossSurfacePayload(detail) {
    const root = detail && typeof detail === 'object' ? detail : {};
    const payload = root.payload && typeof root.payload === 'object' ? root.payload : root;
    return payload.payload && typeof payload.payload === 'object' ? payload.payload : payload;
  }

  function applyCrossSurfaceTitlePayload(detail) {
    const payload = unwrapCrossSurfacePayload(detail);
    const titleState = payload?.titleState && typeof payload.titleState === 'object'
      ? payload.titleState
      : (payload?.state && typeof payload.state === 'object' ? payload.state : payload);
    const chatId = String(payload?.chatId || titleState?.chatId || '').trim();
    if (!chatId || !canPersistChatId(chatId, 'chat') || !titleState || typeof titleState !== 'object') return false;
    if (!titleState.baseTitle && !titleState.emoji) return false;
    const rec = ensureRecord(chatId, chatId);
    const changed = mergeRecordPayload(rec, titleState, 'cross-surface-title-payload');
    if (!changed) return false;
    if (chatId === identity.chatId) notify('cross-surface-title-payload', null);
    else emitEvent('changed', composeState(rec, {
      chatId,
      routeKind: 'chat',
      stableId: isStableChatId(chatId),
      routeKey: `chat:${chatId}`,
    }, 'cross-surface-title-payload'), 'cross-surface-title-payload');
    return true;
  }

  function bindCrossSurfaceTitleSync() {
    const handler = (ev) => {
      const appliedDirectly = applyCrossSurfaceTitlePayload(ev && ev.detail);
      const chatId = identity && identity.chatId;
      if (!chatId || !canPersistChatId(chatId, identity.routeKind)) return;
      scheduleStoreAttach('cross-surface-title-sync');
      hydrateFromStore(chatId, 'cross-surface-title-sync').then((changed) => {
        if (changed || appliedDirectly) scheduleRefresh('cross-surface-title-sync', 60);
      }).catch((err) => fail('cross-surface-title-sync', err));
    };
    W.addEventListener('evt:h2o:library:cross-surface-sync', handler);
    W.addEventListener('h2o:library:cross-surface-sync', handler);
  }

  function boot() {
    H2O.ChatTitle = api;
    patchHistory();
    installRouteEventListeners();
    installConvergenceFlagListener();
    bindCrossSurfaceTitleSync();
    installObservers();
    scheduleStoreAttach('boot');
    refresh('boot');
  }

  const api = {
    version: VERSION,
    getState,
    setTitle,
    setEmoji,
    renameNative,
    subscribe,
    refresh,
    markDocumentTitleWrite,
    selfCheck,
    _isOwnDocumentTitle: isOwnDocumentTitle,
    _eventPayload: () => payloadFor(state, 'debug'),
    debug: {
      refreshDisplay,
      simulateStorageDegraded(value) {
        debugStorageDegraded = !!value;
        if (debugStorageDegraded) storeAdapter = null;
        scheduleStoreAttach(debugStorageDegraded ? 'debug-storage-degraded' : 'debug-storage-restored');
        return selfCheck();
      },
      storageKey,
      bootCacheKey(chatId) { return `${BOOT_CACHE_KEY_PREFIX}${chatId}`; },
      migrationKey: MIGRATION_KEY,
    },
  };

  W[BOOT_KEY] = Object.freeze({ destroy });
  boot();
})();
