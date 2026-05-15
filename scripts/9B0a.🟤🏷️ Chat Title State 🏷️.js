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
  let attachTimer = 0;
  let storeAdapter = null;
  let storeAttachInFlight = false;
  let debugStorageDegraded = false;
  let ownDocumentWrite = null;
  let lastWarning = '';
  let lastError = '';

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
    const title = cleanTitle(raw);
    if (!title) return { baseTitle: '', emoji: '' };
    const emoji = getEdgeEmoji(title);
    const baseTitle = emoji ? stripEdgeEmoji(title) : title;
    return { baseTitle: baseTitle || title, emoji };
  }

  function isRTL(text) {
    return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text || '');
  }

  function displayFrom(baseTitle, emoji) {
    const base = cleanTitle(baseTitle);
    const e = norm(emoji);
    if (!base) return e || '';
    if (!e) return base;
    if (getEdgeEmoji(base) === e) return base;
    return isRTL(base) ? `${base} ${e}` : `${e} ${base}`;
  }

  function cleanTitle(raw) {
    let s = norm(raw);
    if (!s) return '';
    s = s.replace(/\s*[–—-]\s*ChatGPT\s*$/i, '').trim();
    if (!s || /^chatgpt$/i.test(s)) return '';
    const parts = s.split(/\s*[–—-]\s*/g).map(norm).filter(Boolean);
    const filtered = parts.filter((part) => !/^chatgpt$/i.test(part));
    if (!filtered.length) return '';
    return filtered[filtered.length - 1] || '';
  }

  function cleanFullTitle(raw) {
    return norm(raw).replace(/\s*[–—-]\s*ChatGPT\s*$/i, '').trim();
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

  function mergeRecordPayload(rec, payload, reason) {
    if (!rec || !payload || typeof payload !== 'object') return false;
    let changed = false;
    const basePriority = Number(payload.priority || payload.basePriority || 0);
    const emojiPriority = Number(payload.emojiPriority || 0);

    if (payload.baseTitle && basePriority >= (rec.priority || 0)) {
      const nextBase = cleanTitle(payload.baseTitle);
      if (nextBase && (nextBase !== rec.baseTitle || basePriority !== rec.priority)) {
        rec.baseTitle = nextBase;
        rec.source = payload.source || rec.source || reason || 'stored';
        rec.priority = basePriority;
        rec.confidence = clampConfidence(payload.confidence, rec.confidence || 0.8);
        rec.updatedAt = Number(payload.updatedAt || now());
        changed = true;
      }
    }

    if (payload.emoji && emojiPriority >= (rec.emojiPriority || 0)) {
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
    }
    return changed;
  }

  function composeState(rec, nextIdentity, reason) {
    const displayTitle = displayFrom(rec.baseTitle, rec.emoji);
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

  function shouldAccept(rec, nextPriority, options) {
    if (options && options.force) return true;
    return Number(nextPriority || 0) >= Number(rec.priority || 0);
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

    let changed = false;
    if (shouldAccept(rec, priority, options)) {
      if (baseTitle !== rec.baseTitle || priority !== rec.priority || source !== rec.source) {
        rec.baseTitle = baseTitle;
        rec.source = source;
        rec.priority = priority;
        rec.confidence = clampConfidence(input.confidence, 0.8);
        rec.updatedAt = now();
        rec.rev += 1;
        rec.hydrated = true;
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
      const changed = mergeRecordPayload(rec, parsed.state, 'boot-cache');
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

  function writeBootCache(rec) {
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
      storageStatus.localStorageFallbackActive = true;
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
      const changed = mergeRecordPayload(rec, payload, reason || 'store-hydrate');
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

    if (!storeAdapter || !storageStatus.durable || debugStorageDegraded) {
      writeBootCache(rec);
      return false;
    }
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
    if (raw) return cleanTitle(raw) || raw;
    return readTextExcluding(entry);
  }

  function readProjectTitle() {
    const selectors = ['main h1', 'header h1', 'h1', '[role="heading"][aria-level="1"]'];
    for (const selector of selectors) {
      const text = cleanTitle(D.querySelector(selector)?.textContent || '');
      if (text) return text;
    }
    return '';
  }

  function readLibraryTitle(chatId) {
    try {
      const index = H2O.LibraryIndex;
      if (!index || typeof index.getChat !== 'function') return '';
      const row = index.getChat(chatId);
      return cleanTitle(row && (row.title || row.name || row.label));
    } catch {
      return '';
    }
  }

  function readDocumentTitle() {
    const raw = D.title || '';
    if (!raw || isOwnDocumentTitle(raw)) return '';
    return cleanTitle(raw);
  }

  async function readChatGptAccessToken() {
    try {
      if (typeof W.fetch !== 'function') return '';
      const res = await W.fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!res?.ok) return '';
      const json = await res.json();
      return norm(json?.accessToken || json?.access_token || '');
    } catch {
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

  async function patchNativeConversationTitle(chatId, title) {
    if (typeof W.fetch !== 'function') return { ok: false, status: 'fetch-unavailable' };
    const path = `/backend-api/conversation/${encodeURIComponent(chatId)}`;
    const accessToken = await readChatGptAccessToken();
    const res = await W.fetch(path, {
      method: 'PATCH',
      credentials: 'include',
      cache: 'no-store',
      headers: nativeConversationHeaders(path, accessToken),
      body: JSON.stringify({ title }),
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

  function detectTitles(reason) {
    if (identity.routeKind === 'chat' && identity.chatId) {
      const sidebarTitle = readSidebarTitle(identity.chatId);
      if (sidebarTitle) setTitle({ chatId: identity.chatId, baseTitle: sidebarTitle, source: 'native', priority: BASE_PRIORITY.native, confidence: 0.95, reason }, { reason });

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

  function scheduleRefresh(reason, delay) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      try { refresh(reason || 'scheduled-refresh'); } catch (err) { fail('refresh', err); }
    }, Number.isFinite(delay) ? delay : 120);
  }

  async function renameNative(title, options) {
    const opts = options || {};
    if (!opts.userInitiated) {
      warn('renameNative.refused', 'missing userInitiated option');
      return Promise.resolve({ ok: false, status: 'not-user-initiated' });
    }
    const nextTitle = cleanFullTitle(title);
    if (!nextTitle) return Promise.resolve({ ok: false, status: 'empty-title' });
    const chatId = opts.chatId || identity.chatId;
    if (!chatId) return Promise.resolve({ ok: false, status: 'missing-chat-id' });
    const reason = opts.source || 'rename-native';

    try {
      const result = await patchNativeConversationTitle(chatId, nextTitle);
      if (!result.ok) return { ...result, title: nextTitle, chatId };
      updateConversationHistoryCacheTitle(chatId, nextTitle);
      setTitle({ chatId, baseTitle: nextTitle, source: 'user', priority: BASE_PRIORITY.user, confidence: 1, reason }, { force: true, userInitiated: true, reason });
      scheduleRefresh(reason, 80);
      return { ...result, title: nextTitle, chatId };
    } catch (err) {
      fail('renameNative', err);
      return { ok: false, status: 'error', error: String(err && err.message || err) };
    }
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
      const title = cleanTitle(raw);
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
      scheduleRefresh('pushstate', 60);
      return ret;
    };
    history.replaceState = function (...args) {
      const ret = replace.apply(this, args);
      scheduleRefresh('replacestate', 60);
      return ret;
    };
    try { Object.defineProperty(history, '__h2oChatTitlePatched', { value: true, configurable: true }); } catch { history.__h2oChatTitlePatched = true; }
    W.addEventListener('popstate', () => scheduleRefresh('popstate', 60));
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

  boot();
})();
