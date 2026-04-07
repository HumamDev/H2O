// ==UserScript==
// @name         3H3c.✴️✨ Smart Highlight UI 🖍️✨
// @namespace    H2O.Premium.CGX.smart-highlight.ui
// @author       HumamDev
// @version      0.3.0
// @description  Smart Highlight UI, sentence-level rendering, controls, restore, API.
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const ROOT = window;
  const DOC = document;

  const H2O = ROOT.H2O = ROOT.H2O || {};
  H2O.mods = H2O.mods || {};

  const MOD_ID = 'smartHighlight';
  const SH = H2O.mods[MOD_ID] = H2O.mods[MOD_ID] || {};

  SH.meta = SH.meta || {
    id: MOD_ID,
    version: '0.3.0',
    build: '260318-ui-v30'
  };

  SH.ready = SH.ready || {
    state: false,
    parser: false,
    engine: false,
    ui: false
  };

  SH.const = SH.const || {};
  SH.util = SH.util || {};
  SH.debug = SH.debug || {};

  const C = SH.const;

  C.EV = C.EV || {
    READY: 'h2o:sh:ready',
    INIT: 'h2o:sh:init',
    RUN: 'h2o:sh:run',
    APPLY: 'h2o:sh:apply',
    CLEAR: 'h2o:sh:clear',
    RESTORE: 'h2o:sh:restore',
    OVERRIDE: 'h2o:sh:override',
    REMOUNT_SCAN: 'h2o:sh:remount-scan',
    REMOUNT_PASS: 'h2o:sh:remount-pass'
  };

  C.MODE = C.MODE || {
    DIRECT: 'direct',
    ACTION: 'action',
    SUPPORT: 'support',
    BLEND: 'blend'
  };

  C.STRICT = C.STRICT || {
    STRICT: 'strict',
    BALANCED: 'balanced',
    BROAD: 'broad'
  };

  C.PAL = C.PAL || {
    YELLOW: 'yellow',
    BLUE: 'blue',
    GREEN: 'green',
    ROSE: 'rose'
  };

  C.CLS = C.CLS || {
    CTRL: 'h2o-sh-ctrl',
    BTN: 'h2o-sh-btn',
    SEL: 'h2o-sh-sel',
    CHUNK: 'h2o-sh-chunk',
    LOCKED: 'h2o-sh-locked'
  };

  C.SEL = C.SEL || {
    ANSWER: '[data-message-author-role="assistant"]'
  };

  const CMD = {
    OWNER: 'h2o-sh-ui',
    GROUP_ID: 'h2o-sh-controls',
    IDS: {
        TARGET: 'h2o-sh-target',
        MODE: 'h2o-sh-mode',
        LEVEL: 'h2o-sh-level',
        RUN: 'h2o-sh-run',
        RESTORE: 'h2o-sh-restore',
        CLEAR: 'h2o-sh-clear',
    }
  };

  SH.debug.enabled = SH.debug.enabled ?? false;

  SH.util.emit = SH.util.emit || function emit(name, detail = {}) {
    DOC.dispatchEvent(new CustomEvent(name, { detail }));
  };

  SH.util.log = SH.util.log || function log(...args) {
    if (!SH.debug.enabled) return;
    console.log('[H2O][SH]', ...args);
  };

  SH.util.whenReady = SH.util.whenReady || function whenReady(deps, fn, interval = 120) {
    const ok = deps.every(key => SH.ready[key]);
    if (ok) return fn();

    const t = setInterval(() => {
      const pass = deps.every(key => SH.ready[key]);
      if (!pass) return;
      clearInterval(t);
      fn();
    }, interval);
  };

  const REMOUNT_CFG = {
    scanDelay: 120,
    maxBatchPerPass: 50,
    autoBindFallbackObserver: true,
    pageChangeScanDelay: 70,
    visiblePadPx: 300
  };

  const remountState = {
    observer: null,
    dirtyAnswerEls: new Set(),
    scheduled: false,
    started: false,
    offObsReady: null,
    offObsMut: null,
    pageChangeHandler: null,
    unmountRemountHandler: null
  };

  let commandBarBound = false;

  function getAnswerEls() {
    if (SH.parser?.getAllAnswerEls) return SH.parser.getAllAnswerEls(DOC);
    return Array.from(DOC.querySelectorAll(C.SEL.ANSWER));
  }

  function injectCSS() {
    if (DOC.getElementById('h2o-sh-css')) return;

    const style = DOC.createElement('style');
    style.id = 'h2o-sh-css';
    style.textContent = `
      .${C.CLS.CHUNK}{
        transition: background-color 180ms ease, box-shadow 180ms ease;
        border-radius:8px;
      }
      .h2o-sh-i1{ background: rgba(255,230,80,0.10); }
      .h2o-sh-i2{ background: rgba(255,230,80,0.18); }
      .h2o-sh-i3{ background: rgba(255,230,80,0.28); }
      .h2o-sh-i4{ background: rgba(255,230,80,0.38); box-shadow: inset 0 0 0 1px rgba(255,230,80,0.20); }
      .${C.CLS.LOCKED}{ box-shadow: inset 0 0 0 1px rgba(255,255,255,0.28); }

      .h2o-sh-inline{
        border-radius: 3px;
        padding: 0 .05em;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }
      .h2o-sh-inline.h2o-sh-i1{ background: rgba(255,230,80,0.12); }
      .h2o-sh-inline.h2o-sh-i2{ background: rgba(255,230,80,0.20); }
      .h2o-sh-inline.h2o-sh-i3{ background: rgba(255,230,80,0.30); }
      .h2o-sh-inline.h2o-sh-i4{ background: rgba(255,230,80,0.42); }
    `;
    DOC.head.appendChild(style);
  }

  function unwrapInlineHighlights(root) {
    if (!root) return;

    root.querySelectorAll('.h2o-sh-inline').forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;

      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }

      parent.removeChild(span);
      parent.normalize?.();
    });
  }

  function mergeHighlightSegments(segments = []) {
    const sorted = [...segments]
      .filter(seg =>
        Number.isFinite(seg.start) &&
        Number.isFinite(seg.end) &&
        seg.end > seg.start
      )
      .sort((a, b) => a.start - b.start);

    if (!sorted.length) return [];

    const merged = [{ ...sorted[0] }];

    for (let i = 1; i < sorted.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = sorted[i];

      if (curr.start <= prev.end && curr.intensity === prev.intensity) {
        prev.end = Math.max(prev.end, curr.end);
        continue;
      }

      merged.push({ ...curr });
    }

    return merged;
  }

  function groupSentenceResultsByParent(runData, overrides) {
    const groups = new Map();

    for (const item of runData.chunks || []) {
      const parentChunkId =
        item.parentChunkId ||
        SH.parser.getParentBlockChunkId?.(item.chunkId) ||
        item.chunkId;

      let intensity = item.intensity || 0;
      if (overrides.cleared?.includes(item.chunkId)) intensity = 0;
      if (overrides.promoted?.includes(item.chunkId)) intensity = Math.min(4, intensity + 1);
      if (overrides.demoted?.includes(item.chunkId)) intensity = Math.max(0, intensity - 1);

      if (!groups.has(parentChunkId)) groups.set(parentChunkId, []);
      groups.get(parentChunkId).push({
        ...item,
        intensity
      });
    }

    return groups;
  }

  function collectTextNodes(root) {
    const out = [];
    if (!root) return out;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest('.h2o-sh-inline')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      out.push(node);
    }

    return out;
  }

  function buildTextNodeIndex(root) {
    const nodes = collectTextNodes(root);
    const index = [];
    let cursor = 0;

    for (const node of nodes) {
      const text = node.nodeValue || '';
      const start = cursor;
      const end = start + text.length;

      index.push({
        node,
        text,
        start,
        end
      });

      cursor = end;
    }

    return index;
  }

  function wrapTextRangeInNode(textNode, startOffset, endOffset, className) {
    if (!textNode || startOffset >= endOffset) return null;

    const range = document.createRange();
    range.setStart(textNode, startOffset);
    range.setEnd(textNode, endOffset);

    const span = document.createElement('span');
    span.className = className;

    try {
      range.surroundContents(span);
      return span;
    } catch (err) {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
      return span;
    }
  }

  function applyInlineSegmentsToElement(root, segments) {
    if (!root || !segments?.length) return;

    const merged = mergeHighlightSegments(segments);
    const textIndex = buildTextNodeIndex(root);

    for (let s = merged.length - 1; s >= 0; s--) {
      const seg = merged[s];
      const cls = `h2o-sh-inline h2o-sh-i${seg.intensity}`;

      for (let i = textIndex.length - 1; i >= 0; i--) {
        const entry = textIndex[i];

        const overlapStart = Math.max(seg.start, entry.start);
        const overlapEnd = Math.min(seg.end, entry.end);

        if (overlapEnd <= overlapStart) continue;

        const localStart = overlapStart - entry.start;
        const localEnd = overlapEnd - entry.start;

        wrapTextRangeInNode(entry.node, localStart, localEnd, cls);
      }
    }
  }

  function renderSentenceChunks(answerEl, runData) {
    const map = SH.parser.buildChunkMap(answerEl);
    const overrides = SH.state.getOverrides(runData.answerId);
    const grouped = groupSentenceResultsByParent(runData, overrides);

    for (const [parentChunkId, items] of grouped.entries()) {
      const el = map.get(parentChunkId);
      if (!el) continue;

      const sentenceItems = items.filter(item => item.type === 'sentence' || item.flags?.isSentence);
      if (!sentenceItems.length) continue;

      unwrapInlineHighlights(el);

      const segments = sentenceItems
        .filter(item => item.intensity > 0 && item.range?.end > item.range?.start)
        .map(item => ({
          start: item.range.start,
          end: item.range.end,
          intensity: item.intensity
        }))
        .filter(seg => (seg.end - seg.start) >= 3);

      if (!segments.length) continue;

      try {
        applyInlineSegmentsToElement(el, segments);
      } catch (err) {
        const strongest = Math.max(...segments.map(s => s.intensity), 0);
        if (strongest > 0) {
          el.classList.add(`h2o-sh-i${strongest}`);
        }
      }
    }
  }

  function clearRendered(answerEl) {
    if (!answerEl) return;

    answerEl.querySelectorAll?.('[data-h2o-sh-chunk-id]')?.forEach?.((el) => {
      el.classList.remove(
        'h2o-sh-i1', 'h2o-sh-i2', 'h2o-sh-i3', 'h2o-sh-i4',
        'h2o-sh-direct-answer', 'h2o-sh-action-step',
        'h2o-sh-support', 'h2o-sh-caveat',
        'h2o-sh-low-relevance', C.CLS.LOCKED
      );

      unwrapInlineHighlights(el);
      el.normalize?.();
    });
  }

  function applyOverrides(item, overrides) {
    let intensity = item.intensity || 0;

    if (overrides.cleared?.includes(item.chunkId)) intensity = 0;
    if (overrides.promoted?.includes(item.chunkId)) intensity = Math.min(4, intensity + 1);
    if (overrides.demoted?.includes(item.chunkId)) intensity = Math.max(0, intensity - 1);

    return {
      ...item,
      intensity,
      locked: overrides.locked?.includes(item.chunkId)
    };
  }

  function renderRun(answerEl, runData) {
    if (!answerEl || !runData) return false;

    clearRendered(answerEl);

    const map = SH.parser.buildChunkMap(answerEl);
    const overrides = SH.state.getOverrides(runData.answerId);

    renderSentenceChunks(answerEl, runData);

    for (const item of runData.chunks || []) {
      const isSentence = item.type === 'sentence' || item.flags?.isSentence;
      if (isSentence) continue;

      const el = map.get(item.chunkId);
      if (!el) continue;

      let intensity = item.intensity || 0;
      if (overrides.cleared?.includes(item.chunkId)) intensity = 0;
      if (overrides.promoted?.includes(item.chunkId)) intensity = Math.min(4, intensity + 1);
      if (overrides.demoted?.includes(item.chunkId)) intensity = Math.max(0, intensity - 1);

      if (intensity > 0) el.classList.add(`h2o-sh-i${intensity}`);
      if (item.semanticClass) el.classList.add(`h2o-sh-${item.semanticClass}`);
      if (overrides.locked?.includes(item.chunkId)) el.classList.add(C.CLS.LOCKED);
    }

    SH.util.emit(C.EV.APPLY, {
      answerId: runData.answerId,
      promptId: runData.promptId,
      mode: runData.mode,
      strictness: runData.strictness,
      palette: runData.palette,
      source: runData.source
    });

    return true;
  }

  function run(answerEl, opts = {}) {
    const parsed = SH.parser.parse(answerEl, opts);
    if (!parsed) return null;

    SH.state.invalidateIfStale(parsed.answerId, parsed.answerHash, parsed.promptHash);

    const settings = SH.state.getSettings();
    const finalOpts = {
      mode: opts.mode || settings.mode || C.MODE.DIRECT,
      strictness: opts.strictness || settings.strictness || C.STRICT.BALANCED,
      palette: opts.palette || settings.palette || C.PAL.YELLOW
    };

    const runData = SH.engine.run(parsed, finalOpts);

    SH.state.setRun(parsed.answerId, runData);
    renderRun(parsed.answerEl, runData);

    SH.util.emit(C.EV.RUN, {
      answerId: runData.answerId,
      promptId: runData.promptId,
      mode: runData.mode,
      strictness: runData.strictness,
      palette: runData.palette,
      source: runData.source
    });

    return runData;
  }

  function restore(answerEl, opts = {}) {
    const parsed = SH.parser.parse(answerEl, opts);
    if (!parsed) return false;

    if (!SH.state.isFresh(parsed.answerId, parsed.answerHash, parsed.promptHash)) return false;

    const saved = SH.state.getRun(parsed.answerId);
    if (!saved) return false;

    renderRun(parsed.answerEl, saved);

    SH.util.emit(C.EV.RESTORE, {
      answerId: saved.answerId,
      promptId: saved.promptId,
      mode: saved.mode,
      strictness: saved.strictness,
      palette: saved.palette,
      source: saved.source
    });

    return true;
  }

  function clear(answerEl) {
    const parsed = SH.parser.parse(answerEl);
    if (!parsed) return false;

    clearRendered(parsed.answerEl);
    SH.state.clearRun(parsed.answerId);

    SH.util.emit(C.EV.CLEAR, {
      answerId: parsed.answerId,
      promptId: parsed.promptId
    });

    return true;
  }

  function patchChunk(answerEl, chunkId, action) {
    const parsed = SH.parser.parse(answerEl);
    if (!parsed?.answerId || !chunkId) return null;

    SH.state.patchOverride(parsed.answerId, { chunkId, action });
    const saved = SH.state.getRun(parsed.answerId);
    if (saved) renderRun(parsed.answerEl, saved);
    return true;
  }

  function getCommandBarApi() {
    return ROOT.H2O?.commandBar || null;
  }

  function getUiSettings() {
    const settings = SH.state.getSettings?.() || {};
    return {
      target: String(settings.target || 'visible'),
      mode: String(settings.mode || C.MODE.DIRECT),
      strictness: String(settings.strictness || C.STRICT.BALANCED),
      palette: String(settings.palette || C.PAL.YELLOW)
    };
  }

  function setUiSettings(patch = {}) {
    const next = SH.state.setSettings ? SH.state.setSettings(patch) : { ...getUiSettings(), ...(patch || {}) };
    refreshCommandBarControls();
    return next;
  }

  function getCurrentAnswerEl() {
    const answers = getAnswerEls().filter((el) => el?.isConnected);
    if (!answers.length) return null;
    const mid = ROOT.innerHeight / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of answers) {
      const rect = el.getBoundingClientRect();
      const center = rect.top + (rect.height / 2);
      const score = Math.abs(center - mid);
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best || answers[0] || null;
  }

  function cleanupLegacyInjectedControls() {
    DOC.querySelectorAll(`.${C.CLS.CTRL}`).forEach((el) => {
      try { el.remove(); } catch {}
    });
  }

  function refreshCommandBarControls() {
    const api = getCommandBarApi();
    if (!api?.patchControl) return false;
    const settings = getUiSettings();
    try {
      api.patchControl(CMD.IDS.TARGET, { value: settings.target });
      api.patchControl(CMD.IDS.MODE, { value: settings.mode });
      api.patchControl(CMD.IDS.LEVEL, { value: settings.strictness });
      return true;
    } catch (err) {
      SH.util.log('command bar patch failed', err);
      return false;
    }
  }

  function bindCommandBar() {
    const api = getCommandBarApi();
    if (!api?.registerGroup || !api?.registerControl) return false;

    try { api.removeOwner?.(CMD.OWNER); } catch {}

    api.registerGroup({
      id: CMD.GROUP_ID,
      owner: CMD.OWNER,
      zone: 'main',
      order: 520,
      label: ''
    });

    const settings = getUiSettings();

    api.registerControl({
      id: CMD.IDS.TARGET,
      owner: CMD.OWNER,
      groupId: CMD.GROUP_ID,
      order: 10,
      type: 'select',
      /* select type stays in Command Bar — Side Actions bridge handles buttons only */
      keepInCommandBar: true,
      windowId: 'highlights',
      title: 'Highlight target',
      faceBase: 'Target',
      faceMap: { current: 'Current', visible: 'Visible' },
      options: [
        { value: 'current', label: 'Current' },
        { value: 'visible', label: 'Visible' }
      ],
      value: settings.target,
      onChange: ({ value }) => setUiSettings({ target: value })
    });

    api.registerControl({
      id: CMD.IDS.MODE,
      owner: CMD.OWNER,
      groupId: CMD.GROUP_ID,
      order: 20,
      type: 'select',
      /* select type stays in Command Bar */
      keepInCommandBar: true,
      windowId: 'highlights',
      title: 'Highlight mode',
      faceBase: 'Mode',
      faceMap: { direct: 'Direct', action: 'Action', support: 'Support', blend: 'Blend' },
      options: [
        { value: 'direct', label: 'Direct' },
        { value: 'action', label: 'Action' },
        { value: 'support', label: 'Support' },
        { value: 'blend', label: 'Blend' }
      ],
      value: settings.mode,
      onChange: ({ value }) => setUiSettings({ mode: value })
    });

    api.registerControl({
      id: CMD.IDS.LEVEL,
      owner: CMD.OWNER,
      groupId: CMD.GROUP_ID,
      order: 30,
      type: 'select',
      /* select type stays in Command Bar */
      keepInCommandBar: true,
      windowId: 'highlights',
      title: 'Highlight level',
      faceBase: 'Level',
      faceMap: { strict: 'Strict', balanced: 'Balanced', broad: 'Broad' },
      options: [
        { value: 'strict', label: 'Strict' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'broad', label: 'Broad' }
      ],
      value: settings.strictness,
      onChange: ({ value }) => setUiSettings({ strictness: value })
    });

    api.registerControl({
      id: CMD.IDS.RUN,
      owner: CMD.OWNER,
      groupId: CMD.GROUP_ID,
      order: 40,
      type: 'button',
      windowId: 'highlights',
      /* Primary user action: run highlights on the current chat */
      sideAction: true,
      sideTab: 'highlights',
      text: '✨ Highlight',
      title: 'Run Smart Highlight',
      onClick: () => {
        const opts = getUiSettings();
        if (opts.target === 'current') {
          const answerEl = getCurrentAnswerEl();
          if (answerEl) run(answerEl, opts);
          return;
        }
        SH.api.runVisible(opts);
      }
    });

    api.registerControl({
      id: CMD.IDS.RESTORE,
      owner: CMD.OWNER,
      groupId: CMD.GROUP_ID,
      order: 50,
      type: 'button',
      windowId: 'highlights',
      /* Restore saved highlights — normal daily use action */
      sideAction: true,
      sideTab: 'highlights',
      text: 'Restore',
      title: 'Restore Smart Highlight',
      onClick: () => {
        const opts = getUiSettings();
        if (opts.target === 'current') {
          const answerEl = getCurrentAnswerEl();
          if (answerEl) restore(answerEl, opts);
          return;
        }
        restoreVisible(opts);
      }
    });

    api.registerControl({
      id: CMD.IDS.CLEAR,
      owner: CMD.OWNER,
      groupId: CMD.GROUP_ID,
      order: 60,
      type: 'button',
      windowId: 'highlights',
      /* Clear highlights — normal daily use action */
      sideAction: true,
      sideTab: 'highlights',
      text: 'Clear',
      title: 'Clear Smart Highlight',
      onClick: () => {
        const opts = getUiSettings();
        if (opts.target === 'current') {
          const answerEl = getCurrentAnswerEl();
          if (answerEl) clear(answerEl);
          return;
        }
        SH.api.clearVisible();
      }
    });

    commandBarBound = true;
    refreshCommandBarControls();
    return true;
  }

  function restoreVisible(opts = {}) {
    const settings = SH.state.getSettings();
    if (!settings.autoRestore) return;

    getAnswerEls().forEach((answerEl) => {
      restore(answerEl, opts);
    });
  }

  function markDirtyAnswer(answerEl) {
    if (!answerEl) return;
    remountState.dirtyAnswerEls.add(answerEl);
    scheduleRemountPass('mark-dirty');
  }

  function markDirtyAnswers(answerEls = []) {
    answerEls.forEach((answerEl) => markDirtyAnswer(answerEl));
  }

  function scheduleRemountPass(reason = 'unknown') {
    if (remountState.scheduled) return;
    remountState.scheduled = true;

    ROOT.setTimeout(() => {
      remountState.scheduled = false;
      runRemountPass(reason);
    }, REMOUNT_CFG.scanDelay);
  }

  function isLikelyVisible(el) {
    if (!el?.isConnected) return false;
    const rect = el.getBoundingClientRect();
    return rect.bottom >= -REMOUNT_CFG.visiblePadPx && rect.top <= ROOT.innerHeight + REMOUNT_CFG.visiblePadPx;
  }

  function runRemountPass(reason = 'unknown') {
    const batch = Array.from(remountState.dirtyAnswerEls).slice(0, REMOUNT_CFG.maxBatchPerPass);
    remountState.dirtyAnswerEls.clear();

    if (!batch.length) return;

    SH.util.emit(C.EV.REMOUNT_PASS, {
      reason,
      count: batch.length
    });

    for (const answerEl of batch) {
      if (!answerEl?.isConnected) continue;
      if (isLikelyVisible(answerEl)) restore(answerEl);
    }
  }

  function scanMountedAnswers(reason = 'scan') {
    const answers = getAnswerEls();
    markDirtyAnswers(answers);

    SH.util.emit(C.EV.REMOUNT_SCAN, {
      reason,
      count: answers.length
    });
  }

  function collectAnswersFromObsPayload(payload) {
    const out = new Set();

    const add = (answerEl) => {
      if (answerEl?.isConnected) out.add(answerEl);
    };

    if (Array.isArray(payload?.addedAnswerCandidates)) {
      payload.addedAnswerCandidates.forEach((answerEl) => add(answerEl));
    }

    if (payload?.addedTurnCandidates instanceof Set) {
      payload.addedTurnCandidates.forEach((turnEl) => {
        const answers = SH.parser.collectAnswerElsFromNode?.(turnEl) || [];
        answers.forEach((answerEl) => add(answerEl));
      });
    }

    if (Array.isArray(payload?.addedElements)) {
      payload.addedElements.forEach((node) => {
        const answers = SH.parser.collectAnswerElsFromNode?.(node) || [];
        answers.forEach((answerEl) => add(answerEl));
      });
    }

    return Array.from(out);
  }

  function bindObserverHub() {
    const hub = ROOT.H2O?.obs || ROOT.H2O?.observerHub || null;
    if (!hub || typeof hub.onReady !== 'function' || typeof hub.onMutations !== 'function') return false;

    if (typeof remountState.offObsReady === 'function') {
      try { remountState.offObsReady(); } catch (_) {}
    }
    if (typeof remountState.offObsMut === 'function') {
      try { remountState.offObsMut(); } catch (_) {}
    }

    remountState.offObsReady = hub.onReady('smart-highlight:ready', () => {
      if (!SH.ready.ui && !remountState.started) return;
      scanMountedAnswers('hub-ready');
    }, { immediate: true });

    remountState.offObsMut = hub.onMutations('smart-highlight:mut', (payload) => {
      if (!payload?.conversationRelevant) return;

      const found = collectAnswersFromObsPayload(payload);
      if (found.length) {
        markDirtyAnswers(found);
        return;
      }

      if (payload?.removedAnswerLike || payload?.removedTurnLike) {
        ROOT.setTimeout(() => scanMountedAnswers('hub-removed-like'), REMOUNT_CFG.pageChangeScanDelay);
      }
    });

    SH.util.log('observer hub bound');
    return true;
  }

  function bindFallbackObserver() {
    if (remountState.observer || !REMOUNT_CFG.autoBindFallbackObserver) return false;

    const root = DOC.body;
    if (!root) return false;

    remountState.observer = new MutationObserver((mutations) => {
      const found = [];

      for (const mut of mutations) {
        for (const node of mut.addedNodes || []) {
          found.push(...(SH.parser.collectAnswerElsFromNode?.(node) || []));
        }
      }

      if (!found.length) return;
      markDirtyAnswers(found);
    });

    remountState.observer.observe(root, {
      childList: true,
      subtree: true
    });

    SH.util.log('fallback observer bound');
    return true;
  }

  function bindPaginationEvents() {
    if (remountState.pageChangeHandler) return false;

    remountState.pageChangeHandler = () => {
      ROOT.setTimeout(() => {
        scanMountedAnswers('pagination:pagechanged');
      }, REMOUNT_CFG.pageChangeScanDelay);
    };

    ROOT.addEventListener('evt:h2o:pagination:pagechanged', remountState.pageChangeHandler);
    ROOT.addEventListener('h2o:pagination:pagechanged', remountState.pageChangeHandler);
    return true;
  }

  function bindUnmountEvents() {
    if (remountState.unmountRemountHandler) return false;

    remountState.unmountRemountHandler = (ev) => {
      const rawId = String(ev?.detail?.id || ev?.detail?.msgId || '').trim();
      if (!rawId) {
        ROOT.setTimeout(() => scanMountedAnswers('unmount:remounted-scan'), REMOUNT_CFG.pageChangeScanDelay);
        return;
      }

      const found = SH.parser.findAnswerElsByAnyId?.(rawId, DOC) || [];
      if (found.length) {
        markDirtyAnswers(found);
        return;
      }

      ROOT.setTimeout(() => scanMountedAnswers('unmount:remounted-fallback'), REMOUNT_CFG.pageChangeScanDelay);
    };

    ROOT.addEventListener('evt:h2o:message:remounted', remountState.unmountRemountHandler);
    ROOT.addEventListener('h2o:message:remounted', remountState.unmountRemountHandler);
    ROOT.addEventListener('h2o:message-remounted', remountState.unmountRemountHandler);
    return true;
  }

  function startRemountIntegration() {
    if (remountState.started) return false;
    remountState.started = true;

    const boundHub = bindObserverHub();
    if (!boundHub) bindFallbackObserver();

    bindPaginationEvents();
    bindUnmountEvents();
    scanMountedAnswers('startup');
    return true;
  }

  function init() {
    injectCSS();
    cleanupLegacyInjectedControls();
    if (!bindCommandBar()) {
      ROOT.setTimeout(() => bindCommandBar(), 300);
    }
    restoreVisible();
    startRemountIntegration();
    SH.ready.ui = true;
    SH.util.emit(C.EV.INIT, { module: 'ui' });
    SH.util.emit(C.EV.READY, { module: 'ui' });
    SH.util.log('ui init done');
  }

  SH.api = {
    run,
    restore,
    clear,
    runVisible(opts = {}) {
      return getAnswerEls().map((answerEl) => run(answerEl, opts));
    },
    restoreVisible,
    clearVisible() {
      getAnswerEls().forEach((answerEl) => clear(answerEl));
    },
    remountScan(reason = 'manual') {
      return scanMountedAnswers(reason);
    },
    remountPass(reason = 'manual') {
      return runRemountPass(reason);
    },
    async ensureVisible(answerId, opts = {}) {
      const pg = ROOT.H2O_Pagination || null;
      if (!pg || typeof pg.ensureVisibleById !== 'function') {
        const found = SH.parser.findAnswerElsByAnyId?.(answerId, DOC) || [];
        if (found.length) {
          markDirtyAnswers(found);
          return { ok: true, reason: 'dom-found', answerEls: found };
        }
        return { ok: false, reason: 'pagination-unavailable', id: answerId };
      }

      const result = await pg.ensureVisibleById(answerId, {
        reason: opts.reason || 'smart-highlight:ensureVisibleById',
        restoreAnchor: opts.restoreAnchor !== false,
        timeoutMs: opts.timeoutMs || 1200
      });

      ROOT.setTimeout(() => {
        if (result?.targetAnswerHost?.isConnected) {
          markDirtyAnswer(result.targetAnswerHost);
          return;
        }
        scanMountedAnswers('ensureVisible:post');
      }, REMOUNT_CFG.pageChangeScanDelay);

      return result;
    }
  };

  SH.ui = {
    version: '0.3.0',
    init,
    renderRun,
    clearRendered,
    run,
    restore,
    clear,
    promoteChunk(answerEl, chunkId) {
      return patchChunk(answerEl, chunkId, 'promote');
    },
    demoteChunk(answerEl, chunkId) {
      return patchChunk(answerEl, chunkId, 'demote');
    },
    clearChunk(answerEl, chunkId) {
      return patchChunk(answerEl, chunkId, 'clear');
    },
    lockChunk(answerEl, chunkId) {
      return patchChunk(answerEl, chunkId, 'lock');
    },
    unlockChunk(answerEl, chunkId) {
      return patchChunk(answerEl, chunkId, 'unlock');
    },
    resetChunk(answerEl, chunkId) {
      return patchChunk(answerEl, chunkId, 'reset');
    },
    remountScan: scanMountedAnswers,
    remountPass: runRemountPass
  };

  SH.util.whenReady(['state', 'parser', 'engine'], init);
})();
