// ==H2O Module==
// @h2o-id             1a1g.native.prompt.toc.rail
// @name               1A1g.🟥🧭 Native Prompt TOC Rail 🧭
// @namespace          H2O.Premium.CGX.nativePromptTocRail
// @author             HumamDev
// @version            1.0.3
// @revision           004
// @build              260707-000004
// @description        Native Prompt/TOC Rail placement and hover viewer repair
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const TOPW = W.top || W;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const MODULE_VERSION = '1.0.3';
  const MODULE_BUILD = '260707-000004';
  const MODULE = (H2O.NativePromptTocRail = H2O.NativePromptTocRail || {});
  H2O.NPTR = MODULE;
  if (MODULE.initialized) return;

  const RAIL_POS_DEFAULT = 'auto';
  const RAIL_GAP_DEFAULT = 4;
  const RAIL_EDGE_INSET_PX = 16;
  const TURN_SECTION_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
  const VIEWER_MARGIN_PX = 8;
  const VIEWER_MAX_WIDTH_PX = 360;
  const VIEWER_MIN_WIDTH_PX = 180;
  const VIEWER_MAX_MISS_MS = 500;
  const RAIL_DOMAIN_SEL = [
    '[data-h2o-native-prompt-rail-managed]',
    '[data-h2o-native-prompt-rail-position]',
    '[data-h2o-native-toc-rail-position]',
    'button[aria-label^="Prompt "]',
    'button[data-toc-active]',
    '[data-toc-active]',
    'div[class*="max-h-[50lvh]"][class*="w-9"]',
    'div[class*="no-scrollbar"][class*="w-9"]',
    'div[class*="inset-e-4"]',
    'div[class*="top-1/2"][class*="fixed"]',
  ].join(',');
  const VIEWER_DOMAIN_SEL = [
    '[data-h2o-native-toc-viewer-managed]',
    'div[class*="popover"]',
    'div[class*="rounded-2xl"]',
    'div[class*="shadow-long"]',
    'div[class*="max-w-85"]',
    'div[class*="min-w-60"]',
    'div[class*="select-none"][class*="absolute"]',
    '[role="menu"]', '[role="listbox"]', '[class*="max-h-[50lvh]"]',
    'button.__menu-item', 'button[class*="__menu-item"]',
    '[role="menuitem"]', '[role="option"]',
  ].join(',');
  const ANCHOR_DOMAIN_SEL = [
    'nav', 'aside', '[role="navigation"]', '#stage-slideover-sidebar',
    '[data-ho-chat-root="true"]', 'main#main', '#thread',
    '[class*="sidebar" i]', '[id*="sidebar" i]',
    '[class*="slideover" i]', '[id*="slideover" i]',
    '[class*="scroll-root"]', TURN_SECTION_SEL,
  ].join(',');
  const MUTATION_DOMAIN_SEL = `${RAIL_DOMAIN_SEL},${VIEWER_DOMAIN_SEL},${ANCHOR_DOMAIN_SEL}`;
  const VIEWER_UNION_SEL = [
    '[data-h2o-native-toc-viewer-managed="1"]',
    'div.z-50.max-w-xs.rounded-2xl.popover',
    'div[class*="popover"]', 'div[class*="rounded-2xl"]',
    'div[class*="shadow-long"]', 'div[class*="max-w-85"]',
    'div[class*="min-w-60"]', 'div[class*="select-none"][class*="absolute"]',
    'ul', 'ol', '[role="menu"]', '[role="listbox"]', '[class*="max-h-[50lvh]"]',
    'button.__menu-item', 'button[class*="__menu-item"]', 'li > button',
    '[role="menuitem"]', '[role="option"]',
    'button[class*="hoverable"][class*="text-start"]', 'button[class*="text-start"]',
  ].join(',');

  const VIEWER_STYLE_PROPS = [
    'position', 'inset-inline-start', 'inset-inline-end', 'left', 'right', 'top', 'bottom',
    'transform', 'translate', '--tw-translate-x', '--tw-translate-y', 'max-width',
    'max-height', 'overflow', 'overflow-y', 'z-index',
  ];

  const VIEWER_ATTRS = [
    'data-h2o-native-toc-viewer-managed',
    'data-h2o-native-toc-viewer-side',
    'data-h2o-native-toc-viewer-left',
    'data-h2o-native-toc-viewer-right',
    'data-h2o-native-toc-viewer-rail-left',
    'data-h2o-native-toc-viewer-rail-right',
    'data-h2o-native-toc-viewer-applied-left',
    'data-h2o-native-toc-viewer-applied-top',
    'data-h2o-native-toc-viewer-container-left',
    'data-h2o-native-toc-viewer-container-top',
    'data-h2o-native-toc-viewer-final-left',
    'data-h2o-native-toc-viewer-final-right',
    'data-h2o-native-toc-viewer-final-top',
    'data-h2o-native-toc-viewer-final-bottom',
    'data-h2o-native-toc-viewer-detection-method',
    'data-h2o-native-toc-viewer-hidden',
  ];

  const state = {
    railContainer: null,
    railInner: null,
    railBound: null,
    viewerLoopActive: false,
    lastViewerSeenAt: 0,
    managed: new Set(),
    hiddenViewers: new Set(),
    rafQueued: false,
    pendingCauses: new Set(),
    pendingViewerDiscovery: false,
    inRepairPass: false,
    viewerInteractionGeneration: 0,
    viewerVerifiedGeneration: 0,
    viewerVerificationPending: false,
    viewerFollowSnapshot: null,
    lastRepairHadRail: false,
    mutationObserver: null,
    intervalId: 0,
  };

  let ownAttributeTransitions = new WeakMap();
  let ownTransitionExpiryQueued = false;

  function clampNum(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function classText(el) {
    try { return String(el?.getAttribute?.('class') || el?.className || ''); } catch { return ''; }
  }

  function rectOf(el) {
    try {
      const r = el?.getBoundingClientRect?.();
      return (r && r.width > 0 && r.height > 0) ? r : null;
    } catch { return null; }
  }

  function visibleRect(el, minWidth = 1, minHeight = 1) {
    const r = rectOf(el);
    if (!r || r.width < minWidth || r.height < minHeight) return null;
    try {
      const cs = W.getComputedStyle(el);
      if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    } catch {}
    try {
      if (el.hidden || el.getAttribute?.('aria-hidden') === 'true') return null;
    } catch {}
    return r;
  }

  function rectSnapshot(input) {
    const r = input && typeof input.getBoundingClientRect === 'function' ? rectOf(input) : input;
    if (!r) return null;
    const round = (v) => Math.round(Number(v || 0) * 100) / 100;
    return {
      left: round(r.left),
      right: round(r.right),
      top: round(r.top),
      bottom: round(r.bottom),
      width: round(r.width),
      height: round(r.height),
    };
  }

  function elementLabel(el) {
    if (!el) return '';
    const tag = String(el.tagName || '').toLowerCase();
    const cls = classText(el).trim().split(/\s+/).filter(Boolean).slice(0, 8).join('.');
    const id = String(el.id || '').trim();
    const role = String(el.getAttribute?.('role') || '').trim();
    return `${tag}${id ? `#${id}` : ''}${cls ? `.${cls}` : ''}${role ? `[role="${role}"]` : ''}`;
  }

  function isRootLike(el) {
    return el === document.documentElement || el === document.body || el === document.scrollingElement;
  }

  function isViewportLikeRect(r) {
    if (!r) return false;
    const vw = Number(W.innerWidth || 0);
    const vh = Number(W.innerHeight || 0);
    if (!vw || !vh) return false;
    return r.left <= 2 && r.top <= 2 && r.width >= vw * 0.72 && r.height >= vh * 0.72;
  }

  function isOwnedByH2O(el) {
    try { return !!el.closest?.('[data-cgxui-owner]'); } catch { return false; }
  }

  function isNativeRailOrViewerNode(el) {
    if (!el) return false;
    try {
      return !!el.closest?.([
        '[data-h2o-native-prompt-rail-managed]',
        '[data-h2o-native-toc-rail-position]',
        '[data-h2o-native-toc-viewer-managed]',
        '[data-cgxui="mnmp-root"]',
        '[data-cgxui="mnmp-panel"]',
      ].join(','));
    } catch { return false; }
  }

  function isElement(node) {
    return !!node && node.nodeType === 1;
  }

  function matchesDomain(node, selector) {
    if (!isElement(node)) return false;
    try { return !!node.matches?.(selector); } catch { return false; }
  }

  function subtreeCarriesDomain(node, selector = MUTATION_DOMAIN_SEL) {
    if (!isElement(node)) return false;
    if (matchesDomain(node, selector)) return true;
    try { return !!node.querySelector?.(selector); } catch { return false; }
  }

  function managedRelationship(node) {
    if (!isElement(node)) return false;
    const managed = [state.railContainer, state.railInner, state.railBound, ...state.managed, ...state.hiddenViewers];
    for (const current of managed) {
      if (!current) continue;
      try {
        if (node === current || current.contains?.(node)) return true;
      } catch {}
    }
    return false;
  }

  function subtreeContainsManaged(node) {
    if (!isElement(node)) return false;
    const managed = [state.railContainer, state.railInner, state.railBound, ...state.managed, ...state.hiddenViewers];
    for (const current of managed) {
      if (!current) continue;
      try { if (node === current || node.contains?.(current)) return true; } catch {}
    }
    return false;
  }

  function managedViewerRelationship(node, includeContainingSubtree = false) {
    if (!isElement(node)) return false;
    for (const current of [...state.managed, ...state.hiddenViewers]) {
      if (!current) continue;
      try {
        if (node === current || current.contains?.(node) || (includeContainingSubtree && node.contains?.(current))) return true;
      } catch {}
    }
    return false;
  }

  function serializeAttribute(target, attributeName) {
    try {
      if (attributeName === 'style') return String(target?.getAttribute?.('style') ?? target?.style?.cssText ?? '');
      return target?.getAttribute?.(attributeName);
    } catch { return null; }
  }

  function scheduleOwnTransitionExpiry() {
    if (ownTransitionExpiryQueued) return;
    ownTransitionExpiryQueued = true;
    try {
      const enqueue = W.queueMicrotask || globalThis.queueMicrotask;
      enqueue?.(() => {
        ownAttributeTransitions = new WeakMap();
        ownTransitionExpiryQueued = false;
      });
    } catch {}
  }

  function registerOwnAttributeTransition(target, attributeName, oldValue, newValue) {
    if (!target || oldValue === newValue) return;
    let byAttribute = ownAttributeTransitions.get(target);
    if (!byAttribute) {
      byAttribute = new Map();
      ownAttributeTransitions.set(target, byAttribute);
    }
    let transitions = byAttribute.get(attributeName);
    if (!transitions) {
      transitions = [];
      byAttribute.set(attributeName, transitions);
    }
    for (const transition of transitions) transition.newValue = newValue;
    transitions.push({ oldValue, newValue });
    scheduleOwnTransitionExpiry();
  }

  function mutateOwnedAttribute(target, attributeName, mutate) {
    if (!target) return false;
    const oldValue = serializeAttribute(target, attributeName);
    try { mutate(); } catch { return false; }
    const newValue = serializeAttribute(target, attributeName);
    if (oldValue === newValue) return false;
    registerOwnAttributeTransition(target, attributeName, oldValue, newValue);
    return true;
  }

  function writeOwnedAttribute(target, attributeName, value) {
    const next = String(value);
    if (serializeAttribute(target, attributeName) === next) return false;
    return mutateOwnedAttribute(target, attributeName, () => target.setAttribute(attributeName, next));
  }

  function removeOwnedAttribute(target, attributeName) {
    if (serializeAttribute(target, attributeName) == null) return false;
    return mutateOwnedAttribute(target, attributeName, () => target.removeAttribute(attributeName));
  }

  function writeAttributeValue(target, attributeName, value) {
    const next = String(value);
    if (!target || serializeAttribute(target, attributeName) === next) return false;
    try { target.setAttribute(attributeName, next); return true; } catch { return false; }
  }

  function removeAttributeValue(target, attributeName) {
    if (!target || serializeAttribute(target, attributeName) == null) return false;
    try { target.removeAttribute(attributeName); return true; } catch { return false; }
  }

  function writeOwnedStyle(target, property, value, priority = '') {
    if (!target?.style) return false;
    const next = String(value);
    try {
      if (target.style.getPropertyValue(property) === next && target.style.getPropertyPriority(property) === String(priority)) return false;
    } catch {}
    return mutateOwnedAttribute(target, 'style', () => target.style.setProperty(property, next, priority));
  }

  function removeOwnedStyle(target, property) {
    if (!target?.style) return false;
    try { if (!target.style.getPropertyValue(property)) return false; } catch {}
    return mutateOwnedAttribute(target, 'style', () => target.style.removeProperty(property));
  }

  function exactOwnAttributeRecord(record) {
    if (record?.type !== 'attributes') return false;
    const attributeName = String(record.attributeName || '');
    const transitions = ownAttributeTransitions.get(record.target)?.get(attributeName) || [];
    if (!transitions.length) return false;
    const oldValue = attributeName === 'style' ? String(record.oldValue ?? '') : (record.oldValue ?? null);
    const newValue = serializeAttribute(record.target, attributeName);
    return transitions.some((transition) => transition.oldValue === oldValue && transition.newValue === newValue);
  }

  function attributeTargetRelevant(target, attributeName) {
    if (!isElement(target)) return false;
    if (attributeName === 'data-toc-active') {
      return managedRelationship(target) || matchesDomain(target, `${RAIL_DOMAIN_SEL},${VIEWER_DOMAIN_SEL}`);
    }
    if (attributeName === 'data-h2o-native-prompt-rail-position') {
      return managedRelationship(target) || matchesDomain(target, RAIL_DOMAIN_SEL);
    }
    if (attributeName === 'class' || attributeName === 'style') {
      return managedRelationship(target) || matchesDomain(target, MUTATION_DOMAIN_SEL);
    }
    return false;
  }

  function classifyMutationRecords(records) {
    let relevant = false;
    let discoverViewer = false;
    for (const record of Array.from(records || [])) {
      if (!record) continue;
      if (record.type === 'attributes') {
        if (exactOwnAttributeRecord(record)) continue;
        const attributeName = String(record.attributeName || '');
        if (!attributeTargetRelevant(record.target, attributeName)) continue;
        relevant = true;
        if (managedViewerRelationship(record.target) || matchesDomain(record.target, VIEWER_DOMAIN_SEL) || attributeName === 'data-toc-active') discoverViewer = true;
        continue;
      }
      if (record.type !== 'childList') continue;
      let recordRelevant = managedRelationship(record.target) || matchesDomain(record.target, MUTATION_DOMAIN_SEL);
      let recordViewer = matchesDomain(record.target, VIEWER_DOMAIN_SEL);
      for (const node of Array.from(record.addedNodes || [])) {
        if (!subtreeCarriesDomain(node)) continue;
        recordRelevant = true;
        if (subtreeCarriesDomain(node, VIEWER_DOMAIN_SEL)) recordViewer = true;
      }
      for (const node of Array.from(record.removedNodes || [])) {
        if (!subtreeContainsManaged(node) && !subtreeCarriesDomain(node)) continue;
        recordRelevant = true;
        if (managedViewerRelationship(node, true) || subtreeCarriesDomain(node, VIEWER_DOMAIN_SEL)) recordViewer = true;
      }
      if (recordRelevant) relevant = true;
      if (recordViewer) discoverViewer = true;
    }
    return { relevant, discoverViewer };
  }

  function hasConversationTurn(el) {
    try { return !!(el?.matches?.(TURN_SECTION_SEL) || el?.querySelector?.(TURN_SECTION_SEL)); } catch { return false; }
  }

  function isSidebarLike(el) {
    if (!el) return false;
    try {
      if (el.matches?.('nav, aside, [role="navigation"], #stage-slideover-sidebar')) return true;
      const text = [
        String(el.id || ''),
        String(el.getAttribute?.('data-testid') || ''),
        classText(el),
      ].join(' ');
      if (/\b(sidebar|slideover|stage-sidebar|stage-slideover|sidebar-panel|sidebar-surface)\b/i.test(text)) return true;
      return !!el.closest?.([
        'nav[aria-label]',
        'aside',
        '#stage-slideover-sidebar',
        '[id*="sidebar" i]',
        '[class*="sidebar" i]',
        '[id*="slideover" i]',
        '[class*="slideover" i]',
      ].join(','));
    } catch { return false; }
  }

  function evaluateSidebarCandidate(el, source = 'unknown') {
    const reasons = [];
    const r = visibleRect(el, 24, 180);
    const vw = Number(W.innerWidth || 0);
    const vh = Number(W.innerHeight || 0);
    if (!el) reasons.push('missing-element');
    if (el && isRootLike(el)) reasons.push('root-element');
    if (el && (isOwnedByH2O(el) || isNativeRailOrViewerNode(el))) reasons.push('h2o-owned-or-native-toc');
    if (!r) reasons.push('not-visible');
    if (r && isViewportLikeRect(r)) reasons.push('viewport-root-like');
    if (r && r.height < Math.max(280, vh * 0.45)) reasons.push('too-short-for-sidebar');
    if (r && (r.width < 80 || r.width > Math.min(560, vw * 0.45))) reasons.push('sidebar-width-out-of-range');
    if (r && r.left > Math.min(180, vw * 0.16)) reasons.push('not-left-panel');
    if (r && r.right < 140) reasons.push('only-app-rail-not-sidebar');
    if (r && r.right > Math.min(640, vw * 0.55)) reasons.push('too-wide-or-too-far-right');
    if (el && hasConversationTurn(el)) reasons.push('contains-conversation-turns');
    const identity = el ? isSidebarLike(el) : false;
    if (!identity) reasons.push('no-sidebar-identity');
    const score = (reasons.length === 0 ? 1000 : 0)
      + (identity ? 320 : 0)
      + (source === '#stage-slideover-sidebar' ? 220 : 0)
      + (source.includes('hit-test') ? 80 : 0)
      + (r ? Math.min(280, r.right) : 0);
    return {
      el,
      source,
      rect: r,
      ok: reasons.length === 0,
      reasons,
      score,
      selector: selectorSummary(el),
    };
  }

  function collectVisibleSidebarCandidates() {
    const map = new Map();
    const add = (el, source) => {
      if (!el || map.has(el)) return;
      map.set(el, evaluateSidebarCandidate(el, source));
    };
    try {
      for (const el of document.querySelectorAll([
        '#stage-slideover-sidebar',
        'nav[aria-label="Chat history"]',
        'nav[aria-label="Sidebar"]',
        'nav[aria-label]',
        'aside',
        '[data-testid*="sidebar" i]',
        '[id*="sidebar" i]',
        '[class*="sidebar" i]',
        '[id*="slideover" i]',
        '[class*="slideover" i]',
        '[class*="stage-sidebar" i]',
        '[class*="sidebar-panel" i]',
        '[class*="sidebar-surface" i]',
      ].join(','))) add(el, el.id === 'stage-slideover-sidebar' ? '#stage-slideover-sidebar' : 'selector');
    } catch {}
    try {
      const vw = Number(W.innerWidth || 0);
      const vh = Number(W.innerHeight || 0);
      const xs = [8, 32, 64, 96, 140, 220, 320].filter((x) => x < vw - 8);
      const ys = [0.25, 0.5, 0.75].map((p) => Math.floor(vh * p));
      for (const x of xs) {
        for (const y of ys) {
          let el = document.elementFromPoint(x, y);
          for (let steps = 0; el && el !== document.body && steps < 14; steps += 1) {
            add(el, `hit-test-${x}x${y}`);
            el = el.parentElement;
          }
        }
      }
    } catch {}
    return Array.from(map.values()).sort((a, b) => {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      return b.score - a.score;
    });
  }

  function selectSidebarBoundary() {
    const candidates = collectVisibleSidebarCandidates();
    const accepted = candidates.filter((c) => c.ok && c.rect);
    if (!accepted.length) return { selected: null, visibleSidebarRight: 0, candidates };
    const selected = accepted.reduce((best, c) => (c.rect.right > best.rect.right ? c : best), accepted[0]);
    return {
      selected,
      visibleSidebarRight: Math.round(selected.rect.right),
      candidates,
    };
  }

  function getOpenAISidebarRight() {
    return selectSidebarBoundary().visibleSidebarRight;
  }

  function evaluateChatSurfaceCandidate(el, source = 'unknown', sidebarRight = getOpenAISidebarRight()) {
    const reasons = [];
    const r = visibleRect(el, 1, 1);
    if (!el) reasons.push('missing-element');
    if (el && isRootLike(el)) reasons.push('root-element');
    if (el && isOwnedByH2O(el)) reasons.push('h2o-owned');
    if (el && isSidebarLike(el)) reasons.push('sidebar-or-nav');
    if (!r) reasons.push('not-visible');
    if (r && r.width < 320) reasons.push('too-narrow-for-chat-surface');
    if (r && r.height < Math.max(220, Number(W.innerHeight || 0) * 0.45)) reasons.push('too-short-for-chat-surface');
    if (r && sidebarRight > 80 && r.left < sidebarRight - 8) reasons.push('starts-before-sidebar-right');
    if (r && isViewportLikeRect(r) && r.left <= Math.max(8, sidebarRight - 8)) reasons.push('viewport-root-like');
    const turns = el ? hasConversationTurn(el) : false;
    if (!turns) reasons.push('does-not-contain-conversation-turns');
    let position = '';
    let isScrollable = false;
    try {
      const cs = W.getComputedStyle(el);
      position = String(cs.position || '');
      isScrollable = /(auto|scroll)/i.test(String(cs.overflowY || '')) || (el.scrollHeight || 0) > (el.clientHeight || 0) + 80;
    } catch {}
    const cls = classText(el);
    const id = String(el?.id || '');
    const sourceWeight = source === 'data-ho-chat-root' ? 260
      : source === 'main#main' ? 250
        : source === '#thread' ? 230
          : source === 'scroll-root-class' ? 220
            : source === 'main' ? 200
              : source === 'turn-ancestor' ? 120
                : 80;
    const sidebarDelta = r && sidebarRight > 0 ? Math.abs(r.left - sidebarRight) : (r ? r.left : 400);
    const classWeight = cls.includes('group/scroll-root') || cls.includes('scroll-root') ? 90 : 0;
    const idWeight = id === 'main' || id === 'thread' ? 60 : 0;
    const score = (reasons.length === 0 ? 1000 : 0)
      + sourceWeight
      + classWeight
      + idWeight
      + (turns ? 160 : 0)
      + (isScrollable ? 90 : 0)
      - Math.min(260, sidebarDelta);
    return {
      ok: reasons.length === 0,
      source,
      element: el || null,
      label: elementLabel(el),
      rect: rectSnapshot(r),
      reasons,
      containsTurns: turns,
      sidebarRight,
      position,
      isScrollable,
      score,
    };
  }

  function collectChatSurfaceCandidates(sidebarRightInput = null) {
    const out = [];
    const seen = new Set();
    const sidebarRight = sidebarRightInput == null ? getOpenAISidebarRight() : Number(sidebarRightInput || 0);
    const push = (el, source) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      out.push(evaluateChatSurfaceCandidate(el, source, sidebarRight));
    };
    try { push(document.querySelector('[data-ho-chat-root="true"]'), 'data-ho-chat-root'); } catch {}
    try { push(document.querySelector('main#main'), 'main#main'); } catch {}
    try { push(document.querySelector('#thread'), '#thread'); } catch {}
    try { for (const el of document.querySelectorAll('[class*="group/scroll-root"], [class*="scroll-root"]')) push(el, 'scroll-root-class'); } catch {}
    try { for (const el of document.querySelectorAll('main')) push(el, 'main'); } catch {}
    try {
      const turns = Array.from(document.querySelectorAll(TURN_SECTION_SEL)).slice(0, 12);
      for (const turn of turns) {
        let cur = turn;
        for (let steps = 0; cur && cur !== document.body && cur !== document.documentElement && steps < 14; steps += 1) {
          const r = rectOf(cur);
          if (r && r.width >= 320 && r.height >= 220) push(cur, 'turn-ancestor');
          cur = cur.parentElement;
        }
      }
    } catch {}
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  function selectChatSurfaceAnchor(sidebarRight = null, candidates = null) {
    return (candidates || collectChatSurfaceCandidates(sidebarRight)).find((candidate) => candidate.ok) || null;
  }

  function resolveLeftRailAnchor(sidebarBoundaryInput = null, chatCandidatesInput = null) {
    const sidebarBoundary = sidebarBoundaryInput || selectSidebarBoundary();
    const chatCandidates = chatCandidatesInput || collectChatSurfaceCandidates(sidebarBoundary.visibleSidebarRight);
    const selected = selectChatSurfaceAnchor(sidebarBoundary.visibleSidebarRight, chatCandidates);
    if (sidebarBoundary.visibleSidebarRight > 0) {
      return {
        source: 'visible-sidebar-right',
        label: sidebarBoundary.selected?.selector || sidebarBoundary.selected?.source || '',
        left: sidebarBoundary.visibleSidebarRight,
        rect: sidebarBoundary.selected?.rect ? rectSnapshot(sidebarBoundary.selected.rect) : null,
        sidebarRight: sidebarBoundary.visibleSidebarRight,
        selectedSidebar: sidebarBoundary.selected || null,
        candidate: selected,
      };
    }
    if (selected?.rect) {
      return {
        source: selected.source,
        label: selected.label,
        left: selected.rect.left,
        rect: selected.rect,
        sidebarRight: selected.sidebarRight,
        candidate: selected,
      };
    }
    return {
      source: 'viewport-fallback-no-sidebar',
      label: '',
      left: 0,
      rect: null,
      sidebarRight: 0,
      selectedSidebar: null,
      candidate: null,
    };
  }

  function readBridgeSettings() {
    try {
      const s = TOPW.H2O_MM_NativeRailSettings?.getSettings?.();
      if (s && typeof s === 'object') return s;
    } catch {}
    try {
      const s = TOPW.H2O_MM_NativeRail?.getSettings?.();
      if (s && typeof s === 'object') return s;
    } catch {}
    return null;
  }

  function readSuffixStorage(suffix, fallback = '') {
    try {
      const storage = W.localStorage || null;
      if (!storage) return fallback;
      for (let i = 0; i < storage.length; i += 1) {
        const key = String(storage.key(i) || '');
        if (!key.endsWith(suffix)) continue;
        const value = storage.getItem(key);
        if (value != null) return String(value);
      }
    } catch {}
    return fallback;
  }

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function normalizeRailPosition(value) {
    const raw = String(value || RAIL_POS_DEFAULT).trim().toLowerCase();
    return ['auto', 'right', 'left', 'hidden', 'off'].includes(raw) ? raw : RAIL_POS_DEFAULT;
  }

  function getSettings(input = null) {
    const bridged = (input && typeof input === 'object' && input.settings) ? input.settings : readBridgeSettings();
    if (bridged && typeof bridged === 'object') {
      return {
        railPosition: normalizeRailPosition(bridged.railPosition),
        gapPx: clampInt(bridged.gapPx, 0, 24, RAIL_GAP_DEFAULT),
      };
    }
    return {
      railPosition: normalizeRailPosition(readSuffixStorage(':nativePromptRail:position', RAIL_POS_DEFAULT)),
      gapPx: clampInt(readSuffixStorage(':nativePromptRail:gapPx', RAIL_GAP_DEFAULT), 0, 24, RAIL_GAP_DEFAULT),
    };
  }

  function looksLikeRailInner(el) {
    const cls = classText(el);
    if (!el || el.tagName !== 'DIV') return false;
    if (!cls.includes('max-h-[50lvh]') || !cls.includes('w-9')) return false;
    if (!cls.includes('flex-col') || !cls.includes('overflow-y-auto')) return false;
    return true;
  }

  function isRailInner(el) {
    if (!looksLikeRailInner(el)) return false;
    const r = visibleRect(el, 8, 80);
    return !!(r && r.width <= 80);
  }

  function railButtonCount(root) {
    if (!root?.querySelectorAll) return 0;
    try {
      const buttons = root.querySelectorAll('button[aria-label^="Prompt "], button[data-toc-active], [data-toc-active]');
      if (buttons.length) return buttons.length;
    } catch {}
    return 0;
  }

  function railChildCount(root) {
    if (!root) return 0;
    const inner = isRailInner(root) ? root : firstVisibleRailInner(root);
    try { return inner ? Array.from(inner.children || []).filter((child) => !!visibleRect(child, 1, 1)).length : 0; } catch { return 0; }
  }

  function evaluateRailCandidate(el, source = 'unknown') {
    const reasons = [];
    const r = visibleRect(el, 1, 1);
    if (!el) reasons.push('missing-element');
    if (el && isRootLike(el)) reasons.push('root-element');
    if (!r) reasons.push('not-visible');
    if (r && isViewportLikeRect(r)) reasons.push('viewport-sized');
    if (r && r.width > 140) reasons.push('too-wide-for-rail');
    if (r && r.height < Math.max(60, Number(W.innerHeight || 0) * 0.08)) reasons.push('too-short-for-rail');
    let position = '';
    try { position = String(W.getComputedStyle(el).position || ''); } catch {}
    const inner = el ? (isRailInner(el) ? el : firstVisibleRailInner(el)) : null;
    const markerCount = el ? railButtonCount(el) : 0;
    const childCount = inner ? railChildCount(inner) : 0;
    const cls = classText(el);
    const classLooksRail = /\binset-e-4\b|\btop-1\/2\b|\bw-9\b|max-h-\[50lvh\]|no-scrollbar/.test(cls);
    if (!markerCount && !inner && !classLooksRail) reasons.push('no-markers-inner-or-rail-class');
    if (position && !['fixed', 'absolute', 'sticky'].includes(position) && !inner) reasons.push(`position-${position || 'static'}`);
    const ok = reasons.length === 0;
    const narrowScore = r ? Math.max(0, 80 - Math.abs(36 - Math.min(r.width, 80))) : 0;
    const score = (ok ? 1000 : 0)
      + markerCount * 20
      + childCount * 10
      + (inner ? 60 : 0)
      + (position === 'fixed' ? 80 : 0)
      + (classLooksRail ? 40 : 0)
      + narrowScore;
    return {
      ok,
      source,
      element: el || null,
      label: elementLabel(el),
      rect: rectSnapshot(r),
      reasons,
      markerCount,
      childCount,
      hasInner: !!inner,
      inner,
      innerRect: rectSnapshot(inner),
      position,
      score,
    };
  }

  function fixedRailContainerFrom(el) {
    let cur = el;
    let best = null;
    for (let steps = 0; cur && cur !== document.body && steps < 16; steps += 1) {
      const info = evaluateRailCandidate(cur, 'ancestor');
      if (info.ok) {
        if (info.position === 'fixed') return cur;
        if (!best) best = cur;
      }
      cur = cur.parentElement;
    }
    if (best) return best;
    try {
      const fallbacks = [
        el.closest?.('[class*="inset-e-"]'),
        el.closest?.('[class*="top-1/2"][class*="fixed"]'),
        el.closest?.('.fixed'),
        el.parentElement,
        el,
      ].filter(Boolean);
      for (const candidate of fallbacks) {
        if (evaluateRailCandidate(candidate, 'fallback').ok) return candidate;
      }
    } catch { return el; }
    return evaluateRailCandidate(el, 'self').ok ? el : null;
  }

  function firstVisibleRailInner(root = null) {
    const local = [];
    try {
      if (root?.querySelectorAll) local.push(...root.querySelectorAll('div'));
    } catch {}
    if (!root) {
      try { local.push(...document.querySelectorAll('div[class*="max-h-[50lvh]"][class*="w-9"], div[class*="no-scrollbar"][class*="w-9"]')); } catch {}
    }
    for (const el of local) {
      if (isOwnedByH2O(el)) continue;
      if (isRailInner(el)) return el;
    }
    return null;
  }

  function collectRailCandidates() {
    const out = [];
    const seen = new Set();
    const push = (el, source) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      out.push(evaluateRailCandidate(el, source));
    };
    try {
      for (const el of document.querySelectorAll('[data-h2o-native-prompt-rail-managed="1"], [data-h2o-native-prompt-rail-position], [data-h2o-native-toc-rail-position]')) {
        push(el, 'managed-attr');
      }
    } catch {}
    try {
      for (const btn of document.querySelectorAll('button[aria-label^="Prompt "], button[data-toc-active], [data-toc-active]')) {
        if (isOwnedByH2O(btn)) continue;
        push(fixedRailContainerFrom(btn), 'marker-ancestor');
        push(btn.parentElement, 'marker-parent');
      }
    } catch {}
    try {
      for (const inner of document.querySelectorAll('div[class*="max-h-[50lvh]"][class*="w-9"], div[class*="no-scrollbar"][class*="w-9"]')) {
        if (isOwnedByH2O(inner)) continue;
        push(fixedRailContainerFrom(inner), 'inner-ancestor');
        push(inner, 'inner');
      }
    } catch {}
    try {
      for (const el of document.querySelectorAll('div[class*="inset-e-4"], div[class*="top-1/2"][class*="fixed"], div.fixed')) {
        push(el, 'class-scan');
      }
    } catch {}
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  function selectRailCandidate() {
    return collectRailCandidates().find((candidate) => candidate.ok) || null;
  }

  function resolveRailContainer() {
    if (state.railContainer?.isConnected) {
      try {
        if (matchesDomain(state.railContainer, RAIL_DOMAIN_SEL) || state.railContainer.querySelector?.(RAIL_DOMAIN_SEL)) return state.railContainer;
      } catch {}
    }
    const selected = selectRailCandidate();
    const container = selected?.element || null;
    state.railContainer = container;
    state.railInner = selected?.inner || (container ? firstVisibleRailInner(container) : null);
    return container;
  }

  function getRailMeasure() {
    const container = resolveRailContainer();
    if (!container) return null;
    const inner = state.railInner?.isConnected && container.contains?.(state.railInner) && looksLikeRailInner(state.railInner)
      ? state.railInner
      : firstVisibleRailInner(container);
    const innerRect = rectOf(inner);
    const containerRect = rectOf(container);
    if (!innerRect && !containerRect) return null;
    state.railInner = inner || null;
    return {
      container,
      inner: inner || null,
      rect: innerRect || containerRect,
      containerRect,
    };
  }

  function restoreHiddenViewerCards() {
    for (const el of Array.from(state.hiddenViewers)) {
      try {
        if (el?.getAttribute?.('data-h2o-native-toc-viewer-hidden') === '1') {
          removeOwnedStyle(el, 'display');
          removeAttributeValue(el, 'data-h2o-native-toc-viewer-hidden');
        }
      } catch {}
      state.hiddenViewers.delete(el);
    }
  }

  function hideCurrentViewerCards(candidates = []) {
    for (const candidate of candidates) {
      const card = candidate?.card || null;
      if (!card) continue;
      try {
        writeOwnedStyle(card, 'display', 'none', 'important');
        writeAttributeValue(card, 'data-h2o-native-toc-viewer-hidden', '1');
        state.hiddenViewers.add(card);
      } catch {}
    }
  }

  function hideRailContainer(container, viewerCandidates = []) {
    if (!container) return;
    try {
      clearManagedViewer(true);
      hideCurrentViewerCards(viewerCandidates);
      state.viewerLoopActive = false;
      writeOwnedStyle(container, 'display', 'none', 'important');
      writeAttributeValue(container, 'data-h2o-native-prompt-rail-managed', '1');
      writeOwnedAttribute(container, 'data-h2o-native-prompt-rail-position', 'hidden');
      writeAttributeValue(container, 'data-h2o-native-toc-rail-position', 'hidden');
      writeAttributeValue(container, 'data-h2o-native-toc-rail-hidden', '1');
      removeAttributeValue(container, 'data-h2o-native-toc-rail-anchor');
      removeAttributeValue(container, 'data-h2o-native-toc-rail-anchor-left');
      removeAttributeValue(container, 'data-h2o-native-toc-rail-applied-left');
      removeAttributeValue(document.documentElement, 'data-h2o-native-toc-rail-position');
      writeAttributeValue(document.documentElement, 'data-h2o-native-toc-rail-config-position', 'hidden');
    } catch {}
  }

  function restoreRailContainer(container) {
    restoreHiddenViewerCards();
    if (!container) return;
    try {
      if (container.getAttribute?.('data-h2o-native-toc-rail-hidden') === '1') {
        removeOwnedStyle(container, 'display');
      }
      removeAttributeValue(container, 'data-h2o-native-toc-rail-hidden');
    } catch {}
  }

  function inferRailSide(measure, settings) {
    const configured = normalizeRailPosition(settings?.railPosition);
    if (configured === 'left' || configured === 'right') return configured;
    const r = measure?.rect || null;
    const vw = Number(W.innerWidth || 0);
    if (r && vw) return ((r.left + r.right) / 2) < (vw / 2) ? 'left' : 'right';
    return 'right';
  }

  function applyRailPosition(settings = getSettings(), repairPlan = null) {
    const position = normalizeRailPosition(settings.railPosition);
    const railPlan = repairPlan?.railPlan || repairPlan || null;
    const measure = railPlan?.measure || getRailMeasure();
    const container = measure?.container || null;
    if (!container) return null;
    try {
      if (position === 'hidden') {
        hideRailContainer(container, repairPlan?.viewerCandidates || []);
        return null;
      }
      restoreRailContainer(container);
      if (position === 'left') {
        const anchor = railPlan?.anchor || { left: 0, source: 'viewport-fallback-no-sidebar', candidate: null };
        const desiredLeft = railPlan?.desiredLeft ?? Math.round(Number(anchor.left || 0) + RAIL_EDGE_INSET_PX);
        const appliedLeft = railPlan?.appliedLeft ?? desiredLeft;
        writeOwnedStyle(container, 'left', `${appliedLeft}px`, 'important');
        writeOwnedStyle(container, 'right', 'auto', 'important');
        writeOwnedStyle(container, 'inset-inline-start', `${appliedLeft}px`, 'important');
        writeOwnedStyle(container, 'inset-inline-end', 'auto', 'important');
        writeAttributeValue(container, 'data-h2o-native-prompt-rail-managed', '1');
        writeOwnedAttribute(container, 'data-h2o-native-prompt-rail-position', 'left');
        writeAttributeValue(container, 'data-h2o-native-toc-rail-position', 'left');
        writeAttributeValue(container, 'data-h2o-native-toc-rail-anchor', anchor.source || (anchor.candidate ? 'chat-surface' : 'unknown'));
        writeAttributeValue(container, 'data-h2o-native-toc-rail-anchor-left', String(Math.round(Number(anchor.left || 0))));
        writeAttributeValue(container, 'data-h2o-native-toc-rail-applied-left', String(appliedLeft));
      } else {
        removeOwnedStyle(container, 'left');
        removeOwnedStyle(container, 'right');
        removeOwnedStyle(container, 'inset-inline-start');
        removeOwnedStyle(container, 'inset-inline-end');
        removeAttributeValue(container, 'data-h2o-native-toc-rail-anchor');
        removeAttributeValue(container, 'data-h2o-native-toc-rail-anchor-left');
        removeAttributeValue(container, 'data-h2o-native-toc-rail-applied-left');
        removeAttributeValue(container, 'data-h2o-native-toc-rail-hidden');
        if (position === 'off') {
          removeAttributeValue(container, 'data-h2o-native-prompt-rail-managed');
          removeOwnedAttribute(container, 'data-h2o-native-prompt-rail-position');
          removeAttributeValue(container, 'data-h2o-native-toc-rail-position');
        } else {
          writeAttributeValue(container, 'data-h2o-native-prompt-rail-managed', '1');
          writeOwnedAttribute(container, 'data-h2o-native-prompt-rail-position', position);
          writeAttributeValue(container, 'data-h2o-native-toc-rail-position', position);
        }
      }
      removeAttributeValue(document.documentElement, 'data-h2o-native-toc-rail-position');
      writeAttributeValue(document.documentElement, 'data-h2o-native-toc-rail-config-position', position);
    } catch {}
    return railPlan?.resultMeasure || measure;
  }

  function getRailMarkerRect() {
    const measure = getRailMeasure();
    const host = measure?.inner || measure?.container || null;
    if (!host) return null;
    const nodes = [];
    try { nodes.push(...host.querySelectorAll('button')); } catch {}
    if (!nodes.length) {
      try { nodes.push(...Array.from(host.children || [])); } catch {}
    }
    let left = Infinity;
    let right = -Infinity;
    for (const node of nodes) {
      const r = visibleRect(node, 1, 1);
      if (!r) continue;
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
    }
    if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) {
      const r = measure.rect || null;
      return r ? { left: r.left, right: r.right, width: r.width } : null;
    }
    return { left, right, width: right - left };
  }

  function isHiddenTooltipShell(el) {
    let shell = null;
    try { shell = el?.closest?.('[role="tooltip"], [popover="hint"]') || null; } catch { shell = null; }
    if (!shell) return false;
    const r = rectOf(shell);
    try {
      const cs = W.getComputedStyle(shell);
      if (!r || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return true;
    } catch {}
    return !r;
  }

  function isSidebarContainerOrDescendant(el) {
    if (!el) return false;
    try {
      if (isSidebarLike(el)) return true;
      return !!el.closest?.([
        '#stage-slideover-sidebar',
        'nav[aria-label]',
        'aside',
        '[id*="sidebar" i]',
        '[class*="sidebar" i]',
        '[id*="slideover" i]',
        '[class*="slideover" i]',
        '[class*="sidebar-panel" i]',
        '[class*="sidebar-surface" i]',
      ].join(','));
    } catch { return false; }
  }

  function isFullHeightLeftPanel(el) {
    const r = rectOf(el);
    if (!r) return false;
    const vh = Number(W.innerHeight || 0);
    const vw = Number(W.innerWidth || 0);
    return r.left <= Math.min(180, vw * 0.16)
      && r.right <= Math.min(680, vw * 0.6)
      && r.height >= vh * 0.72;
  }

  function itemButtonsIn(root) {
    if (!root?.querySelectorAll) return [];
    if (isSidebarContainerOrDescendant(root)) return [];
    const out = [];
    try {
      out.push(...root.querySelectorAll([
        'button.__menu-item',
        'button[class*="__menu-item"]',
        'li > button',
        '[role="menuitem"]',
        '[role="option"]',
        'button[class*="hoverable"][class*="text-start"]',
        'button[class*="text-start"]',
      ].join(',')));
    } catch {}
    const seen = new Set();
    return out.filter((el) => {
      if (!el || seen.has(el)) return false;
      seen.add(el);
      if (isOwnedByH2O(el) || isSidebarContainerOrDescendant(el)) return false;
      return !!visibleRect(el, 8, 8);
    });
  }

  function visibleRowCount(root) {
    if (!root?.querySelectorAll) return 0;
    let count = itemButtonsIn(root).length;
    try {
      for (const row of root.querySelectorAll('li, [role="menuitem"], [role="option"]')) {
        if (visibleRect(row, 30, 8)) count += 1;
      }
    } catch {}
    return count;
  }

  function visibleListIn(root) {
    if (!root?.querySelectorAll) return null;
    try {
      const lists = Array.from(root.querySelectorAll('ul, ol, [role="menu"], [role="listbox"], [class*="max-h-[50lvh]"]'));
      for (const list of lists) {
        const r = visibleRect(list, 80, 40);
        if (!r) continue;
        if (isSidebarContainerOrDescendant(list)) continue;
        if (visibleRowCount(list) > 1 || classText(list).includes('max-h-[50lvh]')) return list;
      }
    } catch {}
    return null;
  }

  function isComposerMenuLike(el) {
    try {
      if (el?.querySelector?.('textarea, input, [contenteditable="true"]')) return true;
      const form = el?.closest?.('form');
      if (form && form.contains(el) && visibleRowCount(el) < 4) return true;
    } catch {}
    return false;
  }

  function evaluateViewerCard(el, method = 'unknown', railRect = null, list = null) {
    const reasons = [];
    const r = visibleRect(el, 1, 1);
    if (!el) reasons.push('missing-element');
    if (el && isRootLike(el)) reasons.push('root-element');
    if (el && isOwnedByH2O(el)) reasons.push('h2o-owned');
    if (el && isSidebarContainerOrDescendant(el)) reasons.push('sidebar-or-slideover-container');
    if (el && isHiddenTooltipShell(el)) reasons.push('hidden-tooltip-shell');
    if (!r) reasons.push('not-visible');
    if (r && isViewportLikeRect(r)) reasons.push('viewport-sized');
    if (el && isFullHeightLeftPanel(el)) reasons.push('full-height-left-panel');
    if (r && r.width > 700) reasons.push('too-wide-for-viewer');
    if (r && r.height > Number(W.innerHeight || 900) + 180) reasons.push('too-tall-for-viewer');
    const cls = classText(el);
    const hasCardClass = cls.includes('popover')
      || cls.includes('rounded-2xl')
      || cls.includes('shadow-long')
      || cls.includes('max-w-xs')
      || cls.includes('max-w-85')
      || cls.includes('min-w-60')
      || cls.includes('z-50')
      || cls.includes('select-none');
    const actualList = list && visibleRect(list, 40, 20) ? list : visibleListIn(el);
    const itemCount = itemButtonsIn(el).length;
    const rowCount = visibleRowCount(el);
    const active = !!el?.querySelector?.('[data-toc-active], button[data-active]');
    if (isComposerMenuLike(el) && itemCount < 4 && !active) reasons.push('composer-menu-like');
    if (!hasCardClass && itemCount < 2 && rowCount < 3 && !actualList) reasons.push('no-viewer-shape');
    const ok = reasons.length === 0;
    const verticalNear = railRect && r ? Math.max(0, Math.abs(((r.top + r.bottom) / 2) - ((railRect.top + railRect.bottom) / 2))) : 0;
    const score = (ok ? 1000 : 0)
      + itemCount * 30
      + rowCount * 8
      + (active ? 80 : 0)
      + (actualList ? 60 : 0)
      + (cls.includes('popover') ? 70 : 0)
      + (cls.includes('rounded-2xl') ? 40 : 0)
      + (cls.includes('shadow-long') ? 30 : 0)
      - Math.min(120, verticalNear / 8);
    return {
      ok,
      method,
      card: el || null,
      list: actualList || list || null,
      label: elementLabel(el),
      rect: rectSnapshot(r),
      listRect: rectSnapshot(actualList || list),
      itemCount,
      rowCount,
      active,
      reasons,
      score,
    };
  }

  function looksLikeViewerCard(el) {
    return evaluateViewerCard(el).ok;
  }

  function floatingCardFor(node) {
    let cur = node;
    let best = node;
    for (let steps = 0; cur && cur !== document.body && steps < 12; steps += 1) {
      if (looksLikeViewerCard(cur)) {
        const cls = classText(cur);
        if (cls.includes('popover') || cls.includes('rounded-2xl') || cls.includes('shadow-long')) return cur;
        best = cur;
      }
      cur = cur.parentElement;
    }
    return best;
  }

  function addCandidate(map, rejected, seen, card, list, method, railRect) {
    if (!card || seen.has(card)) return;
    seen.add(card);
    const candidate = evaluateViewerCard(card, method, railRect, list);
    if (!candidate.ok) {
      rejected.push(candidate);
      return;
    }
    const key = card;
    const prev = map.get(key);
    if (!prev || candidate.score > prev.score) map.set(key, candidate);
  }

  function collectViewerCandidates(railRect = null) {
    const candidates = new Map();
    const rejected = [];
    const seen = new Set();
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll(VIEWER_UNION_SEL));
    } catch {}
    try {
      for (const card of nodes) {
        if (!matchesDomain(card, [
          '[data-h2o-native-toc-viewer-managed="1"]',
          'div.z-50.max-w-xs.rounded-2xl.popover',
          'div[class*="popover"]', 'div[class*="rounded-2xl"]',
          'div[class*="shadow-long"]', 'div[class*="max-w-85"]',
          'div[class*="min-w-60"]', 'div[class*="select-none"][class*="absolute"]',
        ].join(','))) continue;
        addCandidate(candidates, rejected, seen, card, visibleListIn(card), 'card-class', railRect);
      }
    } catch {}
    try {
      for (const list of nodes) {
        if (!matchesDomain(list, 'ul, ol, [role="menu"], [role="listbox"], [class*="max-h-[50lvh]"]')) continue;
        if (!visibleRect(list, 80, 40) || isOwnedByH2O(list) || isHiddenTooltipShell(list)) continue;
        if (list.closest?.('nav[aria-label], aside')) continue;
        if (visibleRowCount(list) < 2 && !classText(list).includes('max-h-[50lvh]')) continue;
        addCandidate(candidates, rejected, seen, floatingCardFor(list), list, 'list-menu', railRect);
      }
    } catch {}
    try {
      const itemSelector = [
        'button.__menu-item',
        'button[class*="__menu-item"]',
        'li > button',
        '[role="menuitem"]',
        '[role="option"]',
        'button[class*="hoverable"][class*="text-start"]',
        'button[class*="text-start"]',
      ].join(',');
      for (const btn of nodes) {
        if (!matchesDomain(btn, itemSelector)) continue;
        if (!visibleRect(btn, 8, 8) || isOwnedByH2O(btn) || isHiddenTooltipShell(btn)) continue;
        if (btn.closest?.('nav[aria-label], aside')) continue;
        addCandidate(candidates, rejected, seen, floatingCardFor(btn), btn.closest?.('ul, ol, [role="menu"], [role="listbox"]') || null, 'menu-item', railRect);
      }
    } catch {}
    const sorted = Array.from(candidates.values()).filter((c) => c.itemCount > 0 || c.rowCount > 1 || c.active);
    sorted.sort((a, b) => b.score - a.score);
    rejected.sort((a, b) => b.score - a.score);
    return { accepted: sorted, rejected };
  }

  function findViewerCandidate(railRect = null) {
    return collectViewerCandidates(railRect).accepted[0] || null;
  }

  function containingBlockForFixed(card) {
    let cur = card?.parentElement || null;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      try {
        const cs = W.getComputedStyle(cur);
        const contain = String(cs.contain || '');
        const willChange = String(cs.willChange || '');
        const fixedContext = (cs.transform && cs.transform !== 'none')
          || (cs.perspective && cs.perspective !== 'none')
          || (cs.filter && cs.filter !== 'none')
          || (cs.backdropFilter && cs.backdropFilter !== 'none')
          || /\b(layout|paint|strict|content)\b/.test(contain)
          || /\b(transform|perspective|filter)\b/.test(willChange);
        if (fixedContext) return cur;
      } catch {}
      cur = cur.parentElement;
    }
    return null;
  }

  function currentManagedViewerCandidate(railRect = null) {
    for (const card of state.managed) {
      if (!card?.isConnected || card.getAttribute?.('data-h2o-native-toc-viewer-managed') !== '1') continue;
      const candidate = evaluateViewerCard(card, 'managed-current', railRect, visibleListIn(card));
      if (candidate.ok) return candidate;
    }
    return null;
  }

  function translateRectSnapshot(input, deltaLeft) {
    if (!input || !Number.isFinite(deltaLeft)) return input;
    return { ...input, left: input.left + deltaLeft, right: input.right + deltaLeft };
  }

  function buildViewerPlan(candidate, measure, settings) {
    const card = candidate?.card || null;
    if (!card) return null;
    const railRect = measure?.rect || null;
    if (!railRect) return null;
    const side = inferRailSide(measure, settings);
    const gap = Math.max(8, Number(settings.gapPx || RAIL_GAP_DEFAULT) || RAIL_GAP_DEFAULT);
    const vw = Number(W.innerWidth || 0);
    const vh = Number(W.innerHeight || 0);
    if (!vw || !vh) return null;

    const startRect = rectOf(card);
    if (!startRect) return null;
    const margin = VIEWER_MARGIN_PX;
    const width = clampNum(startRect.width || VIEWER_MAX_WIDTH_PX, VIEWER_MIN_WIDTH_PX, Math.min(VIEWER_MAX_WIDTH_PX, vw - (margin * 2)));
    let desiredLeft = side === 'left'
      ? railRect.right + gap
      : railRect.left - gap - width;
    desiredLeft = clampNum(desiredLeft, margin, Math.max(margin, vw - width - margin));

    const availableHeight = Math.max(80, vh - (margin * 2));
    const height = Math.min(startRect.height || availableHeight, availableHeight);
    const railCenterY = railRect.top + (railRect.height / 2);
    const desiredTop = clampNum(railCenterY - (height / 2), margin, Math.max(margin, vh - height - margin));
    const block = containingBlockForFixed(card);
    const blockRect = rectOf(block);
    const containerLeft = blockRect ? blockRect.left : 0;
    const containerTop = blockRect ? blockRect.top : 0;
    const appliedLeft = Math.round(desiredLeft - containerLeft);
    const appliedTop = Math.round(desiredTop - containerTop);
    const viewerSide = side === 'left' ? 'right' : 'left';

    return {
      candidate, card, railRect, side, viewerSide, startRect, width,
      desiredLeft, desiredTop, availableHeight, block, blockRect,
      containerLeft, containerTop, appliedLeft, appliedTop,
    };
  }

  function buildRepairPlan(settings = getSettings(), options = {}) {
    const position = normalizeRailPosition(settings.railPosition);
    const measure = getRailMeasure();
    if (!measure) return { settings, position, measure: null, railPlan: null, viewerCandidates: [], viewerPlan: null };
    let anchor = null;
    let desiredLeft = null;
    let appliedLeft = null;
    let resultMeasure = measure;
    if (position === 'left') {
      const sidebarBoundary = selectSidebarBoundary();
      const chatCandidates = collectChatSurfaceCandidates(sidebarBoundary.visibleSidebarRight);
      anchor = resolveLeftRailAnchor(sidebarBoundary, chatCandidates);
      desiredLeft = Math.round(Number(anchor.left || 0) + RAIL_EDGE_INSET_PX);
      const railBlock = containingBlockForFixed(measure.container);
      const railBlockRect = rectOf(railBlock);
      appliedLeft = Math.round(desiredLeft - Number(railBlockRect?.left || 0));
      const currentContainerLeft = Number(measure.containerRect?.left ?? measure.rect?.left ?? 0);
      const deltaLeft = desiredLeft - currentContainerLeft;
      resultMeasure = {
        ...measure,
        rect: translateRectSnapshot(measure.rect, deltaLeft),
        containerRect: translateRectSnapshot(measure.containerRect, deltaLeft),
      };
    }
    const railPlan = { measure, position, anchor, desiredLeft, appliedLeft, resultMeasure };
    let viewerCandidates = [];
    let candidate = null;
    if (options.discoverViewer) {
      const sets = collectViewerCandidates(resultMeasure.rect);
      viewerCandidates = sets.accepted;
      candidate = viewerCandidates[0] || null;
    } else {
      candidate = currentManagedViewerCandidate(resultMeasure.rect);
      if (candidate) viewerCandidates = [candidate];
    }
    const viewerPlan = position !== 'hidden' && position !== 'off'
      ? buildViewerPlan(candidate, resultMeasure, settings)
      : null;
    return { settings, position, measure, railPlan, viewerCandidates, viewerPlan };
  }

  function clearManagedViewer(force = false) {
    for (const el of Array.from(state.managed)) {
      if (!force && el?.isConnected) continue;
      try {
        for (const prop of VIEWER_STYLE_PROPS) removeOwnedStyle(el, prop);
        for (const attr of VIEWER_ATTRS) removeAttributeValue(el, attr);
      } catch {}
      state.managed.delete(el);
    }
  }

  function applyCorrection(card, desiredLeft, desiredTop, appliedLeft, appliedTop) {
    const measured = rectOf(card);
    if (!measured) return null;
    const dx = desiredLeft - measured.left;
    const dy = desiredTop - measured.top;
    const correctedLeft = Math.abs(dx) > 1 ? Math.round(appliedLeft + dx) : appliedLeft;
    const correctedTop = Math.abs(dy) > 1 ? Math.round(appliedTop + dy) : appliedTop;
    if (correctedLeft !== appliedLeft) writeOwnedStyle(card, 'left', `${correctedLeft}px`, 'important');
    if (correctedTop !== appliedTop) writeOwnedStyle(card, 'top', `${correctedTop}px`, 'important');
    return {
      left: desiredLeft,
      right: desiredLeft + measured.width,
      top: desiredTop,
      bottom: desiredTop + measured.height,
      width: measured.width,
      height: measured.height,
    };
  }

  function placeViewer(candidate, measure, settings, preparedPlan = null) {
    const plan = preparedPlan || buildViewerPlan(candidate, measure, settings);
    const card = plan?.card || null;
    if (!card) return false;
    const { railRect, viewerSide, desiredLeft, desiredTop, width, availableHeight, containerLeft, containerTop, appliedLeft, appliedTop } = plan;

    try {
      let positionChanged = false;
      const positionWrite = (property, value, priority = '') => {
        positionChanged = writeOwnedStyle(card, property, value, priority) || positionChanged;
      };
      positionWrite('position', 'fixed', 'important');
      positionWrite('inset-inline-start', 'auto', 'important');
      positionWrite('inset-inline-end', 'auto', 'important');
      positionWrite('right', 'auto', 'important');
      positionWrite('bottom', 'auto', 'important');
      positionWrite('left', `${appliedLeft}px`, 'important');
      positionWrite('top', `${appliedTop}px`, 'important');
      positionWrite('transform', 'none', 'important');
      positionWrite('translate', 'none', 'important');
      positionWrite('--tw-translate-x', '0px');
      positionWrite('--tw-translate-y', '0px');
      positionWrite('max-width', `${Math.min(VIEWER_MAX_WIDTH_PX, Number(W.innerWidth || 0) - (VIEWER_MARGIN_PX * 2))}px`, 'important');
      positionWrite('max-height', `${availableHeight}px`, 'important');
      writeOwnedStyle(card, 'overflow', 'hidden', 'important');
      writeOwnedStyle(card, 'z-index', '2147483000', 'important');
      if (plan.candidate.list && plan.candidate.list !== card) {
        writeOwnedStyle(plan.candidate.list, 'max-height', `${Math.max(40, availableHeight - 12)}px`, 'important');
        writeOwnedStyle(plan.candidate.list, 'overflow-y', 'auto', 'important');
        state.managed.add(plan.candidate.list);
      }
      state.managed.add(card);

      const finalRect = positionChanged
        ? applyCorrection(card, desiredLeft, desiredTop, appliedLeft, appliedTop)
        : {
          left: desiredLeft,
          right: desiredLeft + width,
          top: desiredTop,
          bottom: desiredTop + Number(plan.startRect.height || 0),
        };
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-managed', '1');
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-side', viewerSide);
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-left', String(Math.round(desiredLeft)));
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-right', String(Math.round(desiredLeft + width)));
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-rail-left', String(Math.round(railRect.left)));
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-rail-right', String(Math.round(railRect.right)));
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-applied-left', String(appliedLeft));
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-applied-top', String(appliedTop));
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-container-left', String(Math.round(containerLeft)));
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-container-top', String(Math.round(containerTop)));
      writeAttributeValue(card, 'data-h2o-native-toc-viewer-detection-method', plan.candidate.method || 'unknown');
      if (finalRect) {
        writeAttributeValue(card, 'data-h2o-native-toc-viewer-final-left', String(Math.round(finalRect.left)));
        writeAttributeValue(card, 'data-h2o-native-toc-viewer-final-right', String(Math.round(finalRect.right)));
        writeAttributeValue(card, 'data-h2o-native-toc-viewer-final-top', String(Math.round(finalRect.top)));
        writeAttributeValue(card, 'data-h2o-native-toc-viewer-final-bottom', String(Math.round(finalRect.bottom)));
      }
      return true;
    } catch {
      return false;
    }
  }

  function bindRailEvents(container) {
    if (!container || state.railBound === container) return;
    if (state.railBound) {
      try {
        state.railBound.removeEventListener('pointerover', startViewerLoop, true);
        state.railBound.removeEventListener('mousemove', startViewerLoop, true);
        state.railBound.removeEventListener('focusin', startViewerLoop, true);
      } catch {}
    }
    state.railBound = container;
    try {
      container.addEventListener('pointerover', startViewerLoop, true);
      container.addEventListener('mousemove', startViewerLoop, true);
      container.addEventListener('focusin', startViewerLoop, true);
    } catch {}
  }

  function sameFollowSnapshot(a, b) {
    if (!a || !b) return false;
    const keys = ['left', 'right', 'top', 'bottom', 'width', 'height'];
    return keys.every((key) => Math.abs(Number(a.rail?.[key] || 0) - Number(b.rail?.[key] || 0)) <= 0.5)
      && keys.every((key) => Math.abs(Number(a.viewer?.[key] || 0) - Number(b.viewer?.[key] || 0)) <= 0.5);
  }

  function viewerFollowAfterPass(plan, found) {
    if (!state.viewerLoopActive) return;
    if (!found || !plan?.viewerPlan) {
      if (Date.now() - state.lastViewerSeenAt <= VIEWER_MAX_MISS_MS) {
        requestRepair('viewer-verification', { discoverViewer: true });
      } else {
        state.viewerLoopActive = false;
        state.viewerVerificationPending = false;
        state.viewerFollowSnapshot = null;
        clearManagedViewer(false);
      }
      return;
    }
    state.lastViewerSeenAt = Date.now();
    const snapshot = {
      rail: rectSnapshot(plan.railPlan?.resultMeasure?.rect),
      viewer: rectSnapshot(plan.viewerPlan.startRect),
    };
    const freshGeneration = state.viewerVerifiedGeneration !== state.viewerInteractionGeneration;
    const geometryChanged = !!state.viewerFollowSnapshot && !sameFollowSnapshot(state.viewerFollowSnapshot, snapshot);
    if (state.viewerVerificationPending || freshGeneration || geometryChanged) {
      state.viewerFollowSnapshot = snapshot;
      state.viewerVerifiedGeneration = state.viewerInteractionGeneration;
      state.viewerVerificationPending = false;
      requestRepair('viewer-verification', { discoverViewer: false });
      return;
    }
    state.viewerLoopActive = false;
    state.viewerFollowSnapshot = null;
  }

  function applyRepairPlan(plan) {
    if (!plan?.railPlan) return false;
    clearManagedViewer(false);
    const measure = applyRailPosition(plan.settings, plan);
    if (plan.position === 'hidden') return false;
    bindRailEvents(plan.railPlan.measure.container);
    if (plan.position === 'off') {
      clearManagedViewer(true);
      return false;
    }
    if (!measure || !plan.viewerPlan) return false;
    return placeViewer(plan.viewerPlan.candidate, measure, plan.settings, plan.viewerPlan);
  }

  function repairViewer(reason = 'repair', options = {}) {
    const settings = options.settings || getSettings(options.input || null);
    const discoverViewer = Object.prototype.hasOwnProperty.call(options, 'discoverViewer')
      ? !!options.discoverViewer
      : true;
    const plan = buildRepairPlan(settings, { discoverViewer });
    state.lastRepairHadRail = !!plan.measure;
    const found = applyRepairPlan(plan);
    viewerFollowAfterPass(plan, found);
    return found;
  }

  function runRepairFrame() {
    state.rafQueued = false;
    if (!state.pendingCauses.size) return;
    const causes = Array.from(state.pendingCauses);
    const discoverViewer = state.pendingViewerDiscovery;
    state.pendingCauses.clear();
    state.pendingViewerDiscovery = false;
    state.inRepairPass = true;
    try { repairViewer(causes.join('+'), { discoverViewer }); }
    finally { state.inRepairPass = false; }
  }

  function requestRepair(cause = 'scheduled', options = {}) {
    state.pendingCauses.add(String(cause || 'scheduled'));
    if (options.discoverViewer) state.pendingViewerDiscovery = true;
    if (state.rafQueued) return;
    state.rafQueued = true;
    W.requestAnimationFrame(runRepairFrame);
  }

  function startViewerLoop(event = null) {
    if (event?.type === 'mousemove' && state.railBound && !state.railBound.contains?.(event.target)) return;
    state.viewerLoopActive = true;
    state.viewerVerificationPending = true;
    state.viewerInteractionGeneration += 1;
    state.lastViewerSeenAt = Date.now();
    requestRepair(`viewer-${event?.type || 'interaction'}`, { discoverViewer: true });
  }

  function scheduleApply() {
    requestRepair('scheduled', { discoverViewer: true });
  }

  function handleResize() {
    const hasManagedViewer = Array.from(state.managed).some((node) => node?.isConnected);
    requestRepair('resize', { discoverViewer: state.viewerLoopActive || hasManagedViewer });
  }

  function handleScroll() {
    const connectedRail = !!state.railContainer?.isConnected;
    const hasManagedViewer = Array.from(state.managed).some((node) => node?.isConnected);
    if (!connectedRail && !hasManagedViewer && !state.viewerLoopActive && !state.pendingCauses.size) return;
    requestRepair('scroll', { discoverViewer: false });
  }

  function handleMutations(records) {
    const classification = classifyMutationRecords(records);
    ownAttributeTransitions = new WeakMap();
    ownTransitionExpiryQueued = false;
    if (!classification.relevant) return;
    requestRepair('mutation', { discoverViewer: classification.discoverViewer });
  }

  function apply(input = null) {
    state.pendingCauses.clear();
    state.pendingViewerDiscovery = false;
    const settings = getSettings(input);
    repairViewer(input?.reason || 'explicit', { settings, discoverViewer: true });
    return state.lastRepairHadRail;
  }

  function intervalRecovery() {
    requestRepair('interval-recovery', { discoverViewer: true });
  }

  function ensureObservers() {
    try { W.addEventListener('resize', handleResize, { passive: true }); } catch {}
    try { W.addEventListener('scroll', handleScroll, { passive: true, capture: true }); } catch {}
    try {
      state.mutationObserver = new MutationObserver(handleMutations);
      state.mutationObserver.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['class', 'style', 'data-toc-active', 'data-h2o-native-prompt-rail-position'],
      });
    } catch {}
    try { state.intervalId = W.setInterval(intervalRecovery, 1500); } catch {}
  }

  function publicRailCandidate(candidate) {
    if (!candidate) return null;
    return {
      source: candidate.source,
      label: candidate.label,
      rect: candidate.rect,
      ok: candidate.ok,
      reasons: candidate.reasons,
      markerCount: candidate.markerCount,
      childCount: candidate.childCount,
      hasInner: candidate.hasInner,
      innerRect: candidate.innerRect,
      position: candidate.position,
      score: Math.round(Number(candidate.score || 0)),
    };
  }

  function publicChatSurfaceCandidate(candidate) {
    if (!candidate) return null;
    return {
      source: candidate.source,
      label: candidate.label,
      rect: candidate.rect,
      ok: candidate.ok,
      reasons: candidate.reasons,
      containsTurns: candidate.containsTurns,
      sidebarRight: candidate.sidebarRight,
      position: candidate.position,
      isScrollable: candidate.isScrollable,
      score: Math.round(Number(candidate.score || 0)),
    };
  }

  function publicSidebarCandidate(candidate) {
    if (!candidate) return null;
    return {
      source: candidate.source,
      selector: candidate.selector,
      rect: rectSnapshot(candidate.rect),
      ok: candidate.ok,
      reasons: candidate.reasons,
      score: Math.round(Number(candidate.score || 0)),
    };
  }

  function publicViewerCandidate(candidate) {
    if (!candidate) return null;
    return {
      method: candidate.method,
      label: candidate.label,
      rect: candidate.rect,
      listRect: candidate.listRect,
      ok: candidate.ok,
      reasons: candidate.reasons,
      itemCount: candidate.itemCount,
      rowCount: candidate.rowCount,
      active: candidate.active,
      score: Math.round(Number(candidate.score || 0)),
    };
  }

  function debugSnapshot() {
    const settings = getSettings();
    const sidebarBoundary = selectSidebarBoundary();
    const chatSurfaceCandidates = collectChatSurfaceCandidates();
    const selectedChatSurface = chatSurfaceCandidates.find((candidate) => candidate.ok) || null;
    const leftAnchor = resolveLeftRailAnchor();
    const railCandidates = collectRailCandidates();
    const selectedRail = railCandidates.find((candidate) => candidate.ok) || null;
    const selectedRailOuter = selectedRail?.element || null;
    const selectedRailInner = selectedRail?.inner || (selectedRailOuter ? firstVisibleRailInner(selectedRailOuter) : null);
    const selectedRailRect = rectOf(selectedRailInner) || rectOf(selectedRailOuter);
    const railSide = selectedRailRect ? inferRailSide({ rect: selectedRailRect }, settings) : normalizeRailPosition(settings.railPosition);
    const viewerSets = collectViewerCandidates(selectedRailRect || null);
    const selectedViewer = viewerSets.accepted[0] || null;
    const viewerRect = rectOf(selectedViewer?.card || null);
    const gap = Math.max(8, Number(settings.gapPx || RAIL_GAP_DEFAULT) || RAIL_GAP_DEFAULT);
    const expectedRailLeft = railSide === 'left' ? Math.round(Number(leftAnchor.left || 0) + RAIL_EDGE_INSET_PX) : null;
    const visibleSidebarRight = Number(sidebarBoundary.visibleSidebarRight || leftAnchor.sidebarRight || 0);
    const safeLeftBoundary = railSide === 'left' ? Number(leftAnchor.left || 0) : null;
    let desired = { left: null, right: null };
    if (selectedRailRect && viewerRect) {
      if (railSide === 'left') {
        desired.left = Math.round(selectedRailRect.right + gap);
        desired.right = Math.round(desired.left + viewerRect.width);
      } else {
        desired.right = Math.round(selectedRailRect.left - gap);
        desired.left = Math.round(desired.right - viewerRect.width);
      }
    }
    const finalRect = rectSnapshot(viewerRect);
    const itemCount = Number(selectedViewer?.itemCount || 0);
    return {
      moduleLoaded: true,
      moduleVersion: MODULE_VERSION,
      moduleBuild: MODULE_BUILD,
      settings,
      viewport: {
        width: Number(W.innerWidth || 0),
        height: Number(W.innerHeight || 0),
      },
      visibleSidebarCandidates: sidebarBoundary.candidates.filter((candidate) => candidate.ok).map(publicSidebarCandidate),
      rejectedSidebarCandidates: sidebarBoundary.candidates.filter((candidate) => !candidate.ok).slice(0, 30).map(publicSidebarCandidate),
      selectedSidebarBoundary: publicSidebarCandidate(sidebarBoundary.selected),
      visibleSidebarRight,
      selectedChatSurfaceAnchor: selectedChatSurface ? {
        source: selectedChatSurface.source,
        label: selectedChatSurface.label,
        rect: selectedChatSurface.rect,
        sidebarRight: selectedChatSurface.sidebarRight,
      } : null,
      chatSurfaceAnchorFallback: !selectedChatSurface ? {
        source: leftAnchor.source,
        left: leftAnchor.left,
        sidebarRight: leftAnchor.sidebarRight,
      } : null,
      safeLeftBoundary,
      chatSurfaceCandidates: chatSurfaceCandidates.filter((candidate) => candidate.ok).map(publicChatSurfaceCandidate),
      rejectedChatSurfaceCandidates: chatSurfaceCandidates.filter((candidate) => !candidate.ok).slice(0, 20).map(publicChatSurfaceCandidate),
      railCandidates: railCandidates.map(publicRailCandidate),
      selectedRailOuter: selectedRailOuter ? {
        label: elementLabel(selectedRailOuter),
        rect: rectSnapshot(selectedRailOuter),
      } : null,
      selectedRailInner: selectedRailInner ? {
        label: elementLabel(selectedRailInner),
        rect: rectSnapshot(selectedRailInner),
        childElementCount: selectedRailInner.childElementCount || 0,
      } : null,
      viewerCandidates: viewerSets.accepted.map(publicViewerCandidate),
      rejectedViewerCandidates: viewerSets.rejected.slice(0, 20).map(publicViewerCandidate),
      selectedViewerCard: selectedViewer?.card ? {
        label: elementLabel(selectedViewer.card),
        rect: rectSnapshot(selectedViewer.card),
      } : null,
      selectedViewerList: selectedViewer?.list ? {
        label: elementLabel(selectedViewer.list),
        rect: rectSnapshot(selectedViewer.list),
      } : null,
      selectedViewerCardRejectReasons: !selectedViewer
        ? viewerSets.rejected.slice(0, 12).map((candidate) => ({
          label: candidate.label,
          rect: candidate.rect,
          method: candidate.method,
          reasons: candidate.reasons,
          itemCount: candidate.itemCount,
          rowCount: candidate.rowCount,
        }))
        : [],
      railSide,
      railOffset: RAIL_EDGE_INSET_PX,
      expectedRailLeft,
      itemCount,
      rowCount: Number(selectedViewer?.rowCount || 0),
      detectionMethod: selectedViewer?.method || null,
      desired,
      finalViewerRect: finalRect,
      actualGapFromRail: selectedRailRect && viewerRect
        ? (railSide === 'left'
          ? Math.round((viewerRect.left - selectedRailRect.right) * 100) / 100
          : Math.round((selectedRailRect.left - viewerRect.right) * 100) / 100)
        : null,
      pass: {
        moduleLoaded: true,
        railDetected: !!selectedRailOuter,
        railIsNarrow: !!selectedRailRect && selectedRailRect.width <= 140,
        viewerDetected: !!selectedViewer?.card,
        viewerNotSidebar: !!selectedViewer?.card && !isSidebarContainerOrDescendant(selectedViewer.card) && !isFullHeightLeftPanel(selectedViewer.card),
        itemCountPositive: itemCount > 0,
        railAnchoredToChatSurface: railSide !== 'left'
          || (!!selectedRailRect && expectedRailLeft != null && Math.abs(selectedRailRect.left - expectedRailLeft) <= 6),
        railRightOfSidebar: railSide !== 'left'
          || (!!selectedRailRect && selectedRailRect.left >= visibleSidebarRight),
        leftRailViewerOpensRight: railSide !== 'left' || (!!selectedRailRect && !!viewerRect && viewerRect.left >= selectedRailRect.right),
        rightRailViewerOpensLeft: railSide !== 'right' || (!!selectedRailRect && !!viewerRect && viewerRect.right <= selectedRailRect.left),
        viewerAttachedSmallGap: selectedRailRect && viewerRect
          ? (railSide === 'left'
            ? viewerRect.left - selectedRailRect.right >= 0 && viewerRect.left - selectedRailRect.right <= 32
            : selectedRailRect.left - viewerRect.right >= 0 && selectedRailRect.left - viewerRect.right <= 32)
          : false,
        verticalClamped: !!viewerRect && viewerRect.top >= VIEWER_MARGIN_PX && viewerRect.bottom <= Number(W.innerHeight || 0) - VIEWER_MARGIN_PX,
      },
    };
  }

  const api = {
    version: MODULE_VERSION,
    build: MODULE_BUILD,
    apply,
    repairViewer,
    snapshot: debugSnapshot,
    getSettings,
    getRailElement() { return resolveRailContainer(); },
    getRailContainer() { return resolveRailContainer(); },
    getRailInner() { getRailMeasure(); return state.railInner || null; },
    getRailRect() { return getRailMeasure()?.rect || null; },
    getRailMarkerRect,
    findViewer() {
      const measure = getRailMeasure();
      return findViewerCandidate(measure?.rect || null);
    },
  };

  try { MODULE.api = api; } catch {}
  try {
    const debugApi = {
      snapshot: debugSnapshot,
      apply,
      repairViewer,
    };
    W.H2O_NATIVE_TOC_RAIL_DEBUG = debugApi;
    TOPW.H2O_NATIVE_TOC_RAIL_DEBUG = debugApi;
  } catch {}
  try {
    TOPW.H2O_MM_NativeRail = {
      __owner: 'native-prompt-toc-rail',
      apply,
      getSettings,
      getRailElement: api.getRailElement,
      getRailContainer: api.getRailContainer,
      getRailMarkerRect,
    };
  } catch {}

  ensureObservers();
  try { apply({ reason: 'boot' }); } catch {}
  MODULE.initialized = true;
})();
