// ==H2O Module==
// @h2o-id             9b2a.sidebar.title.renderer
// @name               9B2a.🟤🏷️ Sidebar Title Renderer 🏷️
// @namespace          H2O.Premium.CGX.chat.title.sidebar
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260730-000000
// @description        Passive canonical display-title renderer for visible active-chat native sidebar rows.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==
(function () {
  'use strict';
  const W = window, D = document;
  const H2O = (W.H2O = W.H2O || {});
  const BOOT_KEY = '__h2oSidebarTitleRendererRuntime_v1', PUBLIC_KEY = 'SidebarTitleRenderer';
  const OWNER = 'title-sidebar-renderer', STYLE_ID = 'h2o-title-sidebar-renderer-style-v1';
  const VISUAL_SELECTOR = `[data-h2o-owner="${OWNER}"][data-h2o-title-role="visual"]`;
  const ADOPTED_ATTR = 'data-h2o-title-sidebar-adopted', NATIVE_OWNER_ATTR = 'data-h2o-title-native-owner';
  const NATIVE_HIDDEN_ATTR = 'data-h2o-title-native-hidden';
  const ARIA_ABSENT_ATTR = 'data-h2o-title-aria-labelledby-absent', ARIA_ORIGINAL_ATTR = 'data-h2o-title-aria-labelledby-original';
  const VISUAL_ID_ATTR = 'data-h2o-title-aria-labelledby-visual-id';
  const NATIVE_TITLE_SELECTOR = '.truncate,[class*="truncate"]';
  const MAX_ADOPTED_ROWS = 6, MAX_ATTACH_RETRIES = 20, ATTACH_RETRY_MS = 180;
  const CSS = `
    [${NATIVE_OWNER_ATTR}="${OWNER}"][${NATIVE_HIDDEN_ATTR}="1"] { display: none !important; }
    ${VISUAL_SELECTOR} {
      display: block; flex: 1 1 auto; min-width: 0; max-width: 100%;
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
      pointer-events: none; font: inherit; color: inherit; line-height: inherit; unicode-bidi: isolate;
    }
  `;
  try { W[BOOT_KEY]?.destroy?.(); } catch {}
  const ariaEscrow = new WeakMap();
  const adoptions = new Map();
  const observedTargets = new Set();
  const runtimeId = Math.random().toString(36).slice(2, 10);
  let visualSequence = 0, acceptedSnapshot = null, unsubscribe = null, observer = null;
  let frameId = 0, retryTimer = 0, retryCount = 0, destroyed = false, publicApi = null;
  const diagnostics = {
    phase: 'unattached', scans: 0, adoptions: 0, releases: 0, overflowCandidates: 0,
    lastReleaseReason: '', lastChatId: null, lastRouteToken: -1,
  };
  function setPhase(phase) { diagnostics.phase = String(phase || 'unattached'); }
  function validChatId(value) { return typeof value === 'string' && /^[a-z0-9_-]+$/iu.test(value); }
  function snapshotIsRenderable(snapshot) {
    return !!snapshot &&
      snapshot.routeKind === 'chat' &&
      validChatId(snapshot.chatId) &&
      Number.isSafeInteger(snapshot.routeToken) &&
      typeof snapshot.displayTitle === 'string' &&
      snapshot.displayTitle.length > 0;
  }
  // Title authority and visible presentation are separate concerns. Canonical
  // convergence grants 9B0a's authority over the row; legacy mode grants none,
  // yet the visible title must still start with the H2O emoji, which the native
  // node cannot carry. So legacy keeps a purely passive visual whose only job is
  // that emoji - and when there is no emoji there is nothing to add, so the row
  // is released to ChatGPT entirely.
  function presentationModeFor(snapshot) {
    if (!snapshotIsRenderable(snapshot)) return '';
    if (snapshot.convergence?.enabled === true && snapshot.convergence?.mode === 'canonical') return 'canonical';
    return typeof snapshot.emoji === 'string' && snapshot.emoji !== '' ? 'legacy' : '';
  }
  function snapshotIsPresentable(snapshot) {
    return presentationModeFor(snapshot) !== '';
  }
  function routeIdentityFromHref(rawHref) {
    try {
      const url = new URL(String(rawHref || ''), W.location?.origin || 'https://chatgpt.com');
      const direct = url.pathname.match(/^\/c\/([^/]+)$/u);
      const project = url.pathname.match(/^\/g\/([^/]+)\/c\/([^/]+)$/u);
      if (!direct && !project) return null;
      const projectId = project ? decodeURIComponent(project[1]) : null;
      const chatId = decodeURIComponent((project || direct)[project ? 2 : 1]);
      if (!validChatId(chatId) || (project && !validChatId(projectId))) return null;
      const family = project ? 'project-chat' : 'direct-chat';
      return Object.freeze({
        family,
        projectId,
        chatId,
        key: project ? `${family}:${projectId}:${chatId}` : `${family}:${chatId}`,
      });
    } catch {
      return null;
    }
  }
  function liveRouteIdentity() {
    return routeIdentityFromHref(W.location?.href || W.location?.pathname || '');
  }
  function isH2OOwnedSurface(node) {
    try {
      return !!node?.closest?.('[data-h2o-owner]');
    } catch {
      return true;
    }
  }
  function isVisibleAnchor(anchor) {
    if (!(anchor instanceof HTMLElement) || !anchor.isConnected) return false;
    try {
      if (anchor.hidden || anchor.getAttribute('aria-hidden') === 'true') return false;
      if (anchor.closest('main,dialog,[role="dialog"],[hidden],[aria-hidden="true"]')) return false;
      if (isH2OOwnedSurface(anchor)) return false;
      const style = W.getComputedStyle?.(anchor);
      if (style && (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity || 1) === 0
      )) return false;
      const rects = anchor.getClientRects?.();
      if (rects && rects.length === 0) return false;
    } catch {
      return false;
    }
    return true;
  }
  function approvedContainers() {
    const out = [];
    const seen = new Set();
    for (const container of D.querySelectorAll('nav,aside')) {
      if (!(container instanceof HTMLElement) || !container.isConnected || seen.has(container)) continue;
      if (container.closest('main,dialog,[role="dialog"]') || isH2OOwnedSurface(container)) continue;
      seen.add(container);
      out.push(container);
    }
    return out;
  }
  function candidateFor(anchor, snapshot) {
    if (!snapshotIsPresentable(snapshot) || !(anchor instanceof HTMLElement)) return null;
    if (!isVisibleAnchor(anchor)) return null;
    const candidateIdentity = routeIdentityFromHref(anchor.getAttribute('href'));
    if (!candidateIdentity || candidateIdentity.key !== snapshot.routeIdentity?.key) return null;
    const source = anchor.querySelector(NATIVE_TITLE_SELECTOR);
    if (!(source instanceof HTMLElement) || !source.isConnected) return null;
    if (source.matches?.(VISUAL_SELECTOR) || source.closest?.(VISUAL_SELECTOR)) return null;
    const nativeText = typeof source.textContent === 'string' ? source.textContent : '';
    if (!nativeText.trim()) return null;
    return { anchor, source, nativeText };
  }
  function ensureStyle() {
    let style = D.getElementById(STYLE_ID);
    if (!style) {
      style = D.createElement('style');
      style.id = STYLE_ID;
      style.setAttribute('data-h2o-owner', OWNER);
      D.head?.appendChild(style);
    }
    if (style && style.textContent !== CSS) style.textContent = CSS;
    return style;
  }
  function removeStyle() {
    try { D.getElementById(STYLE_ID)?.remove?.(); } catch {}
  }
  function writeAriaEscrow(anchor) {
    if (ariaEscrow.has(anchor)) return ariaEscrow.get(anchor);
    const had = anchor.hasAttribute('aria-labelledby');
    const value = had ? anchor.getAttribute('aria-labelledby') : null;
    const escrow = Object.freeze({ had, value });
    ariaEscrow.set(anchor, escrow);
    anchor.setAttribute(ARIA_ABSENT_ATTR, had ? '0' : '1');
    if (had) anchor.setAttribute(ARIA_ORIGINAL_ATTR, value || '');
    else anchor.removeAttribute(ARIA_ORIGINAL_ATTR);
    return escrow;
  }
  function readAriaEscrow(anchor) {
    const memory = ariaEscrow.get(anchor);
    if (memory) return memory;
    const marker = anchor.getAttribute(ARIA_ABSENT_ATTR);
    if (marker === '1') return { had: false, value: null };
    if (marker === '0') return { had: true, value: anchor.getAttribute(ARIA_ORIGINAL_ATTR) || '' };
    return null;
  }
  function restoreAnchorAria(anchor, expectedVisualId = '') {
    const escrow = readAriaEscrow(anchor);
    const staleVisualId = expectedVisualId || anchor.getAttribute(VISUAL_ID_ATTR) || '';
    const current = anchor.getAttribute('aria-labelledby');
    const stillRendererOwned = !!staleVisualId &&
      String(current || '').split(/\s+/u).filter(Boolean).includes(staleVisualId);
    if (stillRendererOwned) {
      if (escrow?.had) anchor.setAttribute('aria-labelledby', escrow.value || '');
      else anchor.removeAttribute('aria-labelledby');
    }
    anchor.removeAttribute(ARIA_ABSENT_ATTR);
    anchor.removeAttribute(ARIA_ORIGINAL_ATTR);
    anchor.removeAttribute(VISUAL_ID_ATTR);
    anchor.removeAttribute(ADOPTED_ATTR);
    ariaEscrow.delete(anchor);
  }
  function insertVisualAfter(source, visual) {
    if (typeof source.insertAdjacentElement === 'function') {
      source.insertAdjacentElement('afterend', visual);
      return visual.parentElement !== null;
    }
    const parent = source.parentElement;
    if (!parent) return false;
    parent.insertBefore(visual, source.nextSibling || null);
    return true;
  }
  function releaseAdoption(anchor, reason) {
    const record = adoptions.get(anchor);
    if (!record) return false;
    setPhase(reason === 'native-node-replaced' ? 'native-node-replaced' : 'released');
    try { record.visual?.remove?.(); } catch {}
    try {
      record.source?.removeAttribute?.(NATIVE_OWNER_ATTR);
      record.source?.removeAttribute?.(NATIVE_HIDDEN_ATTR);
    } catch {}
    try { restoreAnchorAria(anchor, record.visual?.id || ''); } catch {}
    adoptions.delete(anchor);
    diagnostics.releases += 1;
    diagnostics.lastReleaseReason = String(reason || 'released');
    return true;
  }
  function releaseAll(reason) {
    for (const anchor of [...adoptions.keys()]) releaseAdoption(anchor, reason || 'rolled-back');
    if (reason === 'rolled-back') setPhase('rolled-back');
  }
  function recoverStaleDom() {
    const staleVisuals = [...D.querySelectorAll(VISUAL_SELECTOR)];
    const staleIds = new Set(staleVisuals.map((visual) => visual.id).filter(Boolean));
    const anchors = new Set(D.querySelectorAll(
      `[${ADOPTED_ATTR}],[${ARIA_ABSENT_ATTR}],[${ARIA_ORIGINAL_ATTR}],[${VISUAL_ID_ATTR}],[aria-labelledby]`,
    ));
    for (const anchor of anchors) {
      const recordedId = anchor.getAttribute(VISUAL_ID_ATTR) || '';
      const currentIds = String(anchor.getAttribute('aria-labelledby') || '').split(/\s+/u).filter(Boolean);
      const referencedStaleId = currentIds.find((id) => staleIds.has(id)) || '';
      if (!recordedId && !referencedStaleId && !anchor.hasAttribute(ADOPTED_ATTR)) continue;
      try { restoreAnchorAria(anchor, recordedId || referencedStaleId); } catch {}
    }
    for (const source of D.querySelectorAll(
      `[${NATIVE_OWNER_ATTR}="${OWNER}"],[${NATIVE_HIDDEN_ATTR}="1"]`,
    )) {
      try {
        source.removeAttribute(NATIVE_OWNER_ATTR);
        source.removeAttribute(NATIVE_HIDDEN_ATTR);
      } catch {}
    }
    for (const visual of staleVisuals) {
      try { visual.remove(); } catch {}
    }
    removeStyle();
  }
  function adoptCandidate(candidate, snapshot) {
    const { anchor, source, nativeText } = candidate;
    const current = adoptions.get(anchor);
    if (current) {
      if (current.source !== source) {
        releaseAdoption(anchor, 'native-node-replaced');
      } else {
        if (current.visual.textContent !== snapshot.displayTitle) {
          current.visual.textContent = snapshot.displayTitle;
        }
        current.visual.setAttribute('data-h2o-title-route-token', String(snapshot.routeToken));
        current.visual.setAttribute('data-h2o-title-chat-id', snapshot.chatId);
        // A live convergence toggle keeps the same visual, so the reported phase
        // must follow the current presentation instead of the one it adopted in.
        setPhase(snapshot.presentationMode === 'legacy' ? 'legacy-adopted' : 'adopted');
        return true;
      }
    }
    setPhase('candidate-found');
    writeAriaEscrow(anchor);
    setPhase('source-verified');
    const visual = D.createElement('span');
    visual.id = `h2o-sidebar-title-${runtimeId}-${++visualSequence}`;
    visual.className = 'h2o-title-sidebar-visual';
    visual.setAttribute('data-h2o-owner', OWNER);
    visual.setAttribute('data-h2o-title-role', 'visual');
    visual.setAttribute('data-h2o-title-chat-id', snapshot.chatId);
    visual.setAttribute('data-h2o-title-route-token', String(snapshot.routeToken));
    visual.setAttribute('dir', 'auto');
    visual.textContent = snapshot.displayTitle;
    if (!insertVisualAfter(source, visual)) {
      restoreAnchorAria(anchor);
      return false;
    }
    source.setAttribute(NATIVE_OWNER_ATTR, OWNER);
    source.setAttribute(NATIVE_HIDDEN_ATTR, '1');
    anchor.setAttribute(ADOPTED_ATTR, '1');
    anchor.setAttribute(VISUAL_ID_ATTR, visual.id);
    anchor.setAttribute('aria-labelledby', visual.id);
    adoptions.set(anchor, { anchor, source, visual, nativeText });
    diagnostics.adoptions += 1;
    setPhase(snapshot.presentationMode === 'legacy' ? 'legacy-adopted' : 'adopted');
    return true;
  }
  function adoptionStillValid(record, snapshot) {
    if (!record.anchor.isConnected || !record.source.isConnected || !record.visual.isConnected) return false;
    const candidate = candidateFor(record.anchor, snapshot);
    return !!candidate && candidate.source === record.source;
  }
  function releaseInvalidSynchronously() {
    for (const [anchor, record] of [...adoptions]) {
      if (!adoptionStillValid(record, acceptedSnapshot)) {
        releaseAdoption(anchor, record.source !== anchor.querySelector?.(NATIVE_TITLE_SELECTOR)
          ? 'native-node-replaced'
          : 'stale-adoption');
      }
    }
  }
  function findCandidates(snapshot, containers) {
    const out = [];
    const seen = new Set();
    for (const container of containers) {
      for (const anchor of container.querySelectorAll('a[href]')) {
        if (seen.has(anchor)) continue;
        seen.add(anchor);
        const candidate = candidateFor(anchor, snapshot);
        if (candidate) out.push(candidate);
      }
    }
    return out;
  }
  function mutationOwnedByVisual(record) {
    const nodes = [record.target, ...(record.addedNodes || []), ...(record.removedNodes || [])];
    return nodes.length > 0 && nodes.every((node) => {
      const element = node?.nodeType === 1 ? node : node?.parentElement;
      return !!element && (
        element.matches?.(VISUAL_SELECTOR) ||
        !!element.closest?.(VISUAL_SELECTOR)
      );
    });
  }
  function ensureObserver(containers) {
    if (!observer && typeof W.MutationObserver === 'function') {
      observer = new W.MutationObserver((records) => {
        if (destroyed) return;
        releaseInvalidSynchronously();
        if (records?.length && records.every(mutationOwnedByVisual)) return;
        scheduleSync('sidebar-mutation');
      });
    }
    if (!observer) return;
    for (const container of containers) {
      const targets = [
        [container, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['href', 'class', 'style', 'hidden', 'aria-hidden'],
        }],
        [container.parentElement, { childList: true }],
      ];
      for (const [target, options] of targets) {
        if (!(target instanceof HTMLElement) || observedTargets.has(target)) continue;
        try {
          observer.observe(target, options);
          observedTargets.add(target);
        } catch {}
      }
    }
  }
  function stopObservation() {
    try { observer?.disconnect?.(); } catch {}
    observer = null;
    observedTargets.clear();
  }
  function scheduleRetry() {
    if (destroyed || retryTimer || retryCount >= MAX_ATTACH_RETRIES) return;
    retryCount += 1;
    retryTimer = W.setTimeout(() => {
      retryTimer = 0;
      if (!unsubscribe) attachCanonicalSubscription();
      if (acceptedSnapshot) scheduleSync('bounded-attach-retry');
    }, ATTACH_RETRY_MS);
  }
  function syncSidebar() {
    frameId = 0;
    if (destroyed || !snapshotIsPresentable(acceptedSnapshot)) return;
    const currentRoute = liveRouteIdentity();
    if (!currentRoute || currentRoute.key !== acceptedSnapshot.routeIdentity?.key) {
      releaseAll('route-stale');
      scheduleRetry();
      return;
    }
    diagnostics.scans += 1;
    ensureStyle();
    const containers = approvedContainers();
    ensureObserver(containers);
    releaseInvalidSynchronously();
    const candidates = findCandidates(acceptedSnapshot, containers);
    diagnostics.overflowCandidates = Math.max(0, candidates.length - MAX_ADOPTED_ROWS);
    const accepted = candidates.slice(0, MAX_ADOPTED_ROWS);
    const acceptedAnchors = new Set(accepted.map((candidate) => candidate.anchor));
    for (const anchor of [...adoptions.keys()]) {
      if (!acceptedAnchors.has(anchor)) releaseAdoption(anchor, 'candidate-no-longer-active');
    }
    for (const candidate of accepted) adoptCandidate(candidate, acceptedSnapshot);
    if (accepted.length === 0) scheduleRetry();
    else {
      retryCount = 0;
      W.clearTimeout(retryTimer);
      retryTimer = 0;
    }
  }
  function scheduleSync() {
    if (destroyed || frameId) return;
    frameId = W.requestAnimationFrame(() => syncSidebar());
  }
  function disableRendering(reason) {
    W.cancelAnimationFrame(frameId);
    frameId = 0;
    W.clearTimeout(retryTimer);
    retryTimer = 0;
    retryCount = 0;
    releaseAll(reason || 'rolled-back');
    stopObservation();
    recoverStaleDom();
  }
  function acceptSnapshot(snapshot) {
    if (destroyed) return;
    if (!snapshotIsPresentable(snapshot)) {
      acceptedSnapshot = null;
      disableRendering('rolled-back');
      return;
    }
    const routeIdentity = liveRouteIdentity();
    if (!routeIdentity || routeIdentity.chatId !== snapshot.chatId) {
      acceptedSnapshot = null;
      disableRendering('route-stale');
      return;
    }
    const routeChanged = !acceptedSnapshot ||
      acceptedSnapshot.chatId !== snapshot.chatId ||
      acceptedSnapshot.routeToken !== snapshot.routeToken ||
      acceptedSnapshot.routeIdentity?.key !== routeIdentity.key;
    if (routeChanged) releaseAll('route-changed');
    acceptedSnapshot = {
      chatId: snapshot.chatId,
      routeKind: snapshot.routeKind,
      routeToken: snapshot.routeToken,
      baseTitle: snapshot.baseTitle,
      emoji: snapshot.emoji,
      displayTitle: snapshot.displayTitle,
      routeIdentity,
      presentationMode: presentationModeFor(snapshot),
      convergence: {
        enabled: snapshot.convergence.enabled,
        mode: snapshot.convergence.mode,
      },
    };
    diagnostics.lastChatId = snapshot.chatId;
    diagnostics.lastRouteToken = snapshot.routeToken;
    retryCount = 0;
    scheduleSync('canonical-snapshot');
  }
  function attachCanonicalSubscription() {
    if (destroyed || unsubscribe) return !!unsubscribe;
    const api = H2O.ChatTitle;
    if (!api || typeof api.subscribe !== 'function') {
      scheduleRetry();
      return false;
    }
    unsubscribe = api.subscribe((snapshot) => acceptSnapshot(snapshot));
    return true;
  }
  function diagnose() {
    return Object.freeze({
      version: 1,
      phase: diagnostics.phase,
      presentationMode: acceptedSnapshot?.presentationMode || '',
      adoptedRows: adoptions.size,
      scans: diagnostics.scans,
      adoptions: diagnostics.adoptions,
      releases: diagnostics.releases,
      overflowCandidates: diagnostics.overflowCandidates,
      lastReleaseReason: diagnostics.lastReleaseReason,
      chatId: diagnostics.lastChatId,
      routeToken: diagnostics.lastRouteToken,
      subscriptionActive: !!unsubscribe,
      observerActive: !!observer,
      retryCount,
      destroyed,
    });
  }
  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    try { unsubscribe?.(); } catch {}
    unsubscribe = null;
    stopObservation();
    W.cancelAnimationFrame(frameId);
    frameId = 0;
    W.clearTimeout(retryTimer);
    retryTimer = 0;
    releaseAll('destroyed');
    recoverStaleDom();
    acceptedSnapshot = null;
    setPhase('destroyed');
    try { if (H2O[PUBLIC_KEY] === publicApi) delete H2O[PUBLIC_KEY]; } catch {}
    try { if (W[BOOT_KEY]?.destroy === destroy) delete W[BOOT_KEY]; } catch {}
    return true;
  }
  recoverStaleDom();
  publicApi = Object.freeze({ version: 1, diagnose, destroy });
  H2O[PUBLIC_KEY] = publicApi;
  W[BOOT_KEY] = Object.freeze({ destroy });
  attachCanonicalSubscription();
})();
