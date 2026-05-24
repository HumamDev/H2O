/* H2O Studio — S0Y1a Studio Ribbon (Phase 1a)
 *
 * Surface module that:
 *   1. Registers the seven default tabs (Home / Format / Structure / AI Tools /
 *      Metadata / View / Export) and their groups + placeholder actions on
 *      H2O.Studio.ribbon (the passive shell from ribbon/ribbon-shell.studio.js).
 *   2. Mounts the ribbon DOM into the <section id="studioRibbon"> placeholder
 *      that studio.html provides above .wbMain.
 *   3. Reacts to ribbon shell events (contextChanged / tabChanged /
 *      collapsedChanged) and to H2O.Studio.store.prefs 'ready' to repaint.
 *
 * Strict Phase 1a discipline:
 *   - Every action button is rendered disabled with title "Coming soon".
 *   - No action handler mutates application data.
 *   - No chrome.* / localStorage / indexedDB / fetch.
 *   - No selectors against the ChatGPT replay DOM (no cg* queries).
 *   - No imports from src-surfaces-base/desk/.
 *   - Storage limited to the two ribbon prefs keys (delegated to the shell).
 *   - Visibility is driven by chat-type context from studio.js. The ribbon
 *     hides itself entirely when chatType is null.
 *
 * Dependencies:
 *   - H2O.Studio.ribbon (ribbon-shell.studio.js, loaded earlier)
 *   - Optional: H2O.events.on (used for shell event subscriptions)
 *   - Optional: H2O.Studio.store.prefs (used indirectly via the shell)
 *
 * Does NOT depend on:
 *   - any other Studio feature module
 *   - studio.js exports (it talks to studio.js one-way, via shell.setContext)
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  /* Idempotency. */
  if (H2O.Studio.__studioRibbonSurfaceInstalled) return;
  H2O.Studio.__studioRibbonSurfaceInstalled = true;

  /* ── Default catalogue ─────────────────────────────────────────────────
   * Tabs not visible for a given chat type are filtered at render time.
   * chatTypes: which chatType values cause the tab to be rendered.
   * Phase 1a actions are all { disabled: true, tooltip: 'Coming soon' }. */
  const TAB_CATALOGUE = [
    {
      id: 'home', label: 'Home',
      chatTypes: ['saved', 'indexed', 'imported', 'readonly'],
      groups: [
        { id: 'edit', label: 'Edit', actions: [
          { id: 'rename-chat', label: 'Rename chat' },
          { id: 'copy-title',  label: 'Copy title' },
        ] },
        { id: 'history', label: 'History', actions: [
          { id: 'undo', label: 'Undo' },
          { id: 'redo', label: 'Redo' },
        ] },
        { id: 'source', label: 'Source', actions: [
          { id: 'open-original', label: 'Open original' },
        ] },
      ],
    },
    {
      id: 'format', label: 'Format',
      chatTypes: ['saved'],
      groups: [
        { id: 'headings', label: 'Headings', actions: [
          { id: 'h1', label: 'H1' },
          { id: 'h2', label: 'H2' },
          { id: 'h3', label: 'H3' },
        ] },
        { id: 'blocks', label: 'Blocks', actions: [
          { id: 'quote',   label: 'Quote' },
          { id: 'code',    label: 'Code block' },
          { id: 'callout', label: 'Callout' },
        ] },
        { id: 'cleanup', label: 'Cleanup', actions: [
          { id: 'clean-spacing', label: 'Clean spacing' },
        ] },
      ],
    },
    {
      id: 'structure', label: 'Structure',
      chatTypes: ['saved'],
      groups: [
        { id: 'sections', label: 'Sections', actions: [
          { id: 'add-section',      label: 'Add section' },
          { id: 'split-section',    label: 'Split section' },
          { id: 'collapse-section', label: 'Collapse section' },
        ] },
        { id: 'navigation', label: 'Navigation', actions: [
          { id: 'page-divider',     label: 'Page divider' },
          { id: 'table-of-contents', label: 'Table of contents' },
        ] },
      ],
    },
    {
      id: 'ai-tools', label: 'AI Tools',
      chatTypes: ['saved'],
      groups: [
        { id: 'extract', label: 'Extract', actions: [
          { id: 'summarize',     label: 'Summarize' },
          { id: 'extract-tasks', label: 'Extract tasks' },
          { id: 'generate-tags', label: 'Generate tags' },
        ] },
        { id: 'rewrite', label: 'Rewrite', actions: [
          { id: 'rewrite-selection', label: 'Rewrite selected' },
          { id: 'study-notes',       label: 'Create study notes' },
        ] },
      ],
    },
    {
      id: 'metadata', label: 'Metadata',
      chatTypes: ['saved', 'indexed', 'imported', 'readonly'],
      groups: [
        { id: 'labels', label: 'Labels', actions: [
          /* Phase 1c — placeholder tooltips updated with specific reason
           * for why these stay disabled (no public Workspace mutation API
           * yet; provider modules are read-only at the Studio surface). */
          { id: 'add-tags', label: 'Tags',     tooltip: 'No public Tags/Labels API yet' },
          { id: 'category', label: 'Category' },
          { id: 'project',  label: 'Project',  tooltip: 'No public Project API yet' },
          { id: 'status',   label: 'Status',   tooltip: 'Chat status is not in Studio schema yet' },
        ] },
        { id: 'source', label: 'Source', actions: [
          { id: 'source-link', label: 'Source link' },
        ] },
      ],
    },
    {
      id: 'view', label: 'View',
      chatTypes: ['saved', 'indexed', 'imported', 'readonly'],
      groups: [
        { id: 'modes', label: 'Modes', actions: [
          { id: 'compact-mode', label: 'Compact mode' },
          { id: 'focus-mode',   label: 'Focus mode' },
        ] },
        { id: 'overlays', label: 'Overlays', actions: [
          { id: 'show-timestamps', label: 'Timestamps' },
          { id: 'show-minimap',    label: 'MiniMap' },
        ] },
        { id: 'width', label: 'Width', actions: [
          { id: 'reading-width', label: 'Reading width' },
        ] },
      ],
    },
    {
      id: 'export', label: 'Export',
      chatTypes: ['saved', 'indexed', 'imported', 'readonly'],
      groups: [
        { id: 'copy', label: 'Copy', actions: [
          { id: 'copy-clean-transcript', label: 'Copy clean transcript' },
        ] },
        { id: 'download', label: 'Download', actions: [
          { id: 'export-markdown', label: 'Markdown' },
          { id: 'export-pdf',      label: 'PDF' },
          { id: 'export-docx',     label: 'DOCX' },
        ] },
        { id: 'print', label: 'Print', actions: [
          { id: 'print-view', label: 'Print view' },
        ] },
      ],
    },
  ];

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function getShell() {
    return H2O && H2O.Studio && H2O.Studio.ribbon;
  }
  function getContainer() {
    return document.getElementById('studioRibbon');
  }
  function safeEmit(name, detail) {
    try {
      if (H2O && H2O.events && typeof H2O.events.emit === 'function') {
        H2O.events.emit(name, detail || {});
      }
    } catch (_) { /* swallow */ }
  }
  function safeOn(name, fn) {
    try {
      if (H2O && H2O.events && typeof H2O.events.on === 'function') {
        H2O.events.on(name, fn);
      }
    } catch (_) { /* swallow */ }
  }
  function getPlatform() {
    try { return (H2O && H2O.Studio && H2O.Studio.platform) || null; }
    catch (_) { return null; }
  }
  function getRibbonBridge() {
    try { return (H2O && H2O.Studio && H2O.Studio.RibbonBridge) || null; }
    catch (_) { return null; }
  }

  /* ── Phase 1b — wired action handlers ────────────────────────────────
   * Map of actionId -> { isEnabled(ctx), onClick(ctx, setStatus) }.
   * Actions NOT present in this map render disabled with "Coming soon"
   * tooltip (the Phase 1a default). All handlers are no-mutation: they
   * only read ribbon context + call H2O.Studio.platform.* APIs.
   *
   * Enabled rules:
   *   - copy-title:         ctx.title is a non-empty string.
   *   - open-original:      ctx.chatType === 'indexed' AND ctx.originalUrl non-empty.
   *   - copy-clean-transcript: ctx.chatType === 'saved' AND the bridge
   *                         is installed AND getCleanTranscript() returns
   *                         non-empty text.
   */
  const ACTION_HANDLERS = {
    'copy-title': {
      isEnabled: function (ctx) { return !!(ctx && ctx.title && String(ctx.title).trim()); },
      onClick: function (ctx, setStatus) {
        const text = String((ctx && ctx.title) || '').trim();
        if (!text) { setStatus('No title available'); return; }
        const platform = getPlatform();
        const clip = platform && platform.clipboard;
        if (!clip || typeof clip.writeText !== 'function') {
          setStatus('Clipboard unavailable');
          return;
        }
        setStatus('Copying title…');
        Promise.resolve(clip.writeText(text)).then(
          function () { setStatus('Title copied'); },
          function (err) {
            const msg = (err && (err.message || String(err))) || 'unknown error';
            setStatus('Copy failed: ' + msg);
          }
        );
      },
    },
    'open-original': {
      isEnabled: function (ctx) {
        if (!ctx) return false;
        if (ctx.chatType !== 'indexed') return false;
        return !!(ctx.originalUrl && String(ctx.originalUrl).trim());
      },
      onClick: function (ctx, setStatus) {
        const href = String((ctx && ctx.originalUrl) || '').trim();
        if (!href) { setStatus('No source URL'); return; }
        const platform = getPlatform();
        setStatus('Opening original…');
        if (platform && typeof platform.openUrl === 'function') {
          Promise.resolve(platform.openUrl(href)).then(
            function () { setStatus(''); },
            function (err) {
              /* Mirror existing studio.js linked-reader precedent: fall back
               * to window.open when platform.openUrl rejects. */
              try { window.open(href, '_blank', 'noopener'); setStatus(''); }
              catch (_) {
                const msg = (err && (err.message || String(err))) || 'unknown error';
                setStatus('Open failed: ' + msg);
              }
            }
          );
          return;
        }
        try { window.open(href, '_blank', 'noopener'); setStatus(''); }
        catch (e) {
          const msg = (e && (e.message || String(e))) || 'unknown error';
          setStatus('Open failed: ' + msg);
        }
      },
    },
    'copy-clean-transcript': {
      isEnabled: function (ctx) {
        if (!ctx || ctx.chatType !== 'saved') return false;
        const bridge = getRibbonBridge();
        if (!bridge || typeof bridge.getCleanTranscript !== 'function') return false;
        try { return !!String(bridge.getCleanTranscript() || '').trim(); }
        catch (_) { return false; }
      },
      onClick: function (ctx, setStatus) {
        const bridge = getRibbonBridge();
        if (!bridge || typeof bridge.getCleanTranscript !== 'function') {
          setStatus('Transcript bridge unavailable');
          return;
        }
        let text = '';
        try { text = String(bridge.getCleanTranscript() || ''); }
        catch (e) { setStatus('Transcript read failed'); return; }
        if (!text.trim()) { setStatus('No transcript content'); return; }
        const platform = getPlatform();
        const clip = platform && platform.clipboard;
        if (!clip || typeof clip.writeText !== 'function') {
          setStatus('Clipboard unavailable');
          return;
        }
        setStatus('Copying transcript…');
        Promise.resolve(clip.writeText(text)).then(
          function () { setStatus('Transcript copied'); },
          function (err) {
            const msg = (err && (err.message || String(err))) || 'unknown error';
            setStatus('Copy failed: ' + msg);
          }
        );
      },
    },
    /* Phase 1c — Metadata → Category.
     * Does NOT mutate category itself; instead routes focus + brief
     * pulse highlight onto the existing topbar category picker
     * (#categoryAssignWrap, populated by studio.js renderCategoryInspector
     * when a saved snapshot reader opens). The picker is the canonical
     * mutation UI for category — the ribbon entry is a navigation aid for
     * users who don't know the topbar widget exists. Enabled only when
     * the picker is present and contains an interactive control. */
    'category': {
      isEnabled: function (ctx) {
        if (!ctx || ctx.chatType !== 'saved') return false;
        let wrap = null;
        try { wrap = document.getElementById('categoryAssignWrap'); }
        catch (_) { return false; }
        if (!wrap || wrap.hidden) return false;
        /* "Has interactive content" — at least one focusable descendant. */
        try {
          return !!wrap.querySelector('button, select, input, [role="button"], [tabindex]:not([tabindex="-1"])');
        } catch (_) { return false; }
      },
      onClick: function (ctx, setStatus) {
        let wrap = null;
        try { wrap = document.getElementById('categoryAssignWrap'); }
        catch (_) { wrap = null; }
        if (!wrap) { setStatus('Category picker not available'); return; }
        let interactive = null;
        try {
          interactive = wrap.querySelector('button, select, input, [role="button"], [tabindex]:not([tabindex="-1"])');
        } catch (_) { interactive = null; }
        if (interactive && typeof interactive.focus === 'function') {
          try { interactive.focus(); } catch (_) { /* swallow */ }
        }
        /* Pulse the picker briefly so the user sees where the action
         * routed to. Force reflow by reading offsetWidth so a repeat
         * click restarts the animation. */
        try {
          wrap.classList.remove('is-pulsing');
          /* eslint-disable-next-line no-unused-expressions */
          wrap.offsetWidth;
          wrap.classList.add('is-pulsing');
          setTimeout(function () {
            try { wrap.classList.remove('is-pulsing'); } catch (_) { /* swallow */ }
          }, 1300);
        } catch (_) { /* swallow */ }
        setStatus('Category picker is in the top bar');
      },
    },
    /* Phase 1c — Metadata → Source link.
     * Copies the source URL of an indexed (linked) chat to the clipboard.
     * Uses Phase 1b's H2O.Studio.platform.clipboard.writeText contract.
     * Saved chats have no source URL field — disabled there. */
    'source-link': {
      isEnabled: function (ctx) {
        if (!ctx) return false;
        if (ctx.chatType !== 'indexed') return false;
        return !!(ctx.originalUrl && String(ctx.originalUrl).trim());
      },
      onClick: function (ctx, setStatus) {
        const href = String((ctx && ctx.originalUrl) || '').trim();
        if (!href) { setStatus('No source URL'); return; }
        const platform = getPlatform();
        const clip = platform && platform.clipboard;
        if (!clip || typeof clip.writeText !== 'function') {
          setStatus('Clipboard unavailable');
          return;
        }
        setStatus('Copying source URL…');
        Promise.resolve(clip.writeText(href)).then(
          function () { setStatus('Source URL copied'); },
          function (err) {
            const msg = (err && (err.message || String(err))) || 'unknown error';
            setStatus('Copy failed: ' + msg);
          }
        );
      },
    },
  };

  /* ── Phase 2b — message-level format actions ───────────────────────────
   * Seven actions wired against the edit-overlay subsystem:
   *   h1 / h2 / h3 — set/toggle/switch heading level on the selected message
   *   quote / code / callout — toggle the wrapper
   *   clean-spacing — toggle clean-spacing flag (CSS-driven normalisation)
   *
   * Enabled ONLY when:
   *   - ctx.chatType === 'saved'
   *   - a saved reader is mounted (signalled by snapshotId + selectedTurnIdx)
   *   - editOverlay store + overlay applier are both installed
   *
   * All handlers go through H2O.Studio.RibbonBridge.applyOverlayOp, which
   * checks drift, appends an op via the pure helper, upserts to the
   * store, and re-applies the overlay to the live reader DOM. Toggle
   * semantics are decided here at click time based on the current
   * computed message state (via RibbonBridge.getMessageStateForTurn). */

  function formatActionsIsEnabled(ctx) {
    if (!ctx || ctx.chatType !== 'saved') return false;
    if (!ctx.snapshotId) return false;
    if (!Number.isFinite(Number(ctx.selectedTurnIdx)) || Number(ctx.selectedTurnIdx) <= 0) return false;
    const bridge = getRibbonBridge();
    if (!bridge || typeof bridge.applyOverlayOp !== 'function') return false;
    const store = H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.editOverlay;
    if (!store || typeof store.upsert !== 'function') return false;
    return true;
  }

  /* Helper to run an op spec via the bridge and route status feedback. */
  function runOverlayOp(opSpec, setStatus, statusLabels) {
    const bridge = getRibbonBridge();
    if (!bridge || typeof bridge.applyOverlayOp !== 'function') {
      setStatus('Overlay bridge unavailable');
      return;
    }
    setStatus(statusLabels.pending || 'Applying…');
    Promise.resolve(bridge.applyOverlayOp(opSpec)).then(
      function (result) {
        if (result && result.ok) {
          setStatus(statusLabels.success || 'Applied');
        } else {
          const reason = (result && result.reason) || 'unknown';
          if (reason === 'drift-detected') {
            setStatus('Snapshot has changed — overlay disabled until rebase');
          } else if (reason === 'no-snapshot') {
            setStatus('No saved chat open');
          } else {
            setStatus((statusLabels.fail || 'Failed') + ': ' + reason);
          }
        }
      },
      function (err) {
        const msg = (err && (err.message || String(err))) || 'unknown error';
        setStatus((statusLabels.fail || 'Failed') + ': ' + msg);
      }
    );
  }

  /* Look up current state synchronously by reading from the bridge.
   * The bridge returns a Promise; for toggle behaviour we need a
   * synchronous answer. Strategy: fire applyOverlayOp directly with a
   * `setLevel:N` op for headings (the reducer in the applier handles
   * the toggle/switch semantics — last op wins per message per type).
   * For quote/code/callout/clean-spacing, we pre-read via the bridge
   * helper (async) and decide the payload from current state. */
  function buildHeadingHandler(level) {
    return {
      isEnabled: formatActionsIsEnabled,
      onClick: function (ctx, setStatus) {
        const turnIdx = Number(ctx && ctx.selectedTurnIdx);
        if (!Number.isFinite(turnIdx) || turnIdx <= 0) { setStatus('Select a message first'); return; }
        /* Pre-read current state so we can toggle off when clicking the
         * same level twice; switch level when clicking a different level. */
        const bridge = getRibbonBridge();
        const readP = (bridge && typeof bridge.getMessageStateForTurn === 'function')
          ? Promise.resolve(bridge.getMessageStateForTurn(turnIdx))
          : Promise.resolve({ heading: null });
        readP.then(function (cur) {
          const curLevel = (cur && cur.heading && cur.heading.level) || null;
          const nextLevel = (curLevel === level) ? null : level;
          const opSpec = {
            type: 'heading',
            target: { kind: 'message', turnIdx: turnIdx, messageId: ctx.selectedMessageId || null },
            payload: { level: nextLevel },
            inverse: { level: curLevel },
          };
          runOverlayOp(opSpec, setStatus, {
            pending: nextLevel ? ('Applying H' + nextLevel + '…') : 'Removing heading…',
            success: nextLevel ? ('H' + nextLevel + ' applied') : 'Heading removed',
            fail: 'Heading failed',
          });
        }, function () { setStatus('Heading failed: state read'); });
      },
    };
  }

  function buildToggleHandler(kind, opType, payloadOn, labels) {
    return {
      isEnabled: formatActionsIsEnabled,
      onClick: function (ctx, setStatus) {
        const turnIdx = Number(ctx && ctx.selectedTurnIdx);
        if (!Number.isFinite(turnIdx) || turnIdx <= 0) { setStatus('Select a message first'); return; }
        const bridge = getRibbonBridge();
        const readP = (bridge && typeof bridge.getMessageStateForTurn === 'function')
          ? Promise.resolve(bridge.getMessageStateForTurn(turnIdx))
          : Promise.resolve({});
        readP.then(function (cur) {
          let isOn = false;
          if (kind === 'quote') isOn = !!(cur && cur.quote);
          else if (kind === 'code') isOn = !!(cur && cur.code);
          else if (kind === 'callout') isOn = !!(cur && cur.callout);
          else if (kind === 'clean-spacing') isOn = !!(cur && cur.cleanSpacing);
          /* Payload: toggle on/off */
          let nextPayload;
          if (kind === 'callout') {
            nextPayload = isOn ? { kind: null } : { kind: 'info' };
          } else {
            nextPayload = isOn ? { enabled: false } : payloadOn;
          }
          const opSpec = {
            type: opType,
            target: { kind: 'message', turnIdx: turnIdx, messageId: ctx.selectedMessageId || null },
            payload: nextPayload,
          };
          runOverlayOp(opSpec, setStatus, {
            pending: isOn ? labels.removingLabel : labels.applyingLabel,
            success: isOn ? labels.removedLabel : labels.appliedLabel,
            fail: labels.failLabel,
          });
        }, function () { setStatus(labels.failLabel + ': state read'); });
      },
    };
  }

  ACTION_HANDLERS['h1'] = buildHeadingHandler(1);
  ACTION_HANDLERS['h2'] = buildHeadingHandler(2);
  ACTION_HANDLERS['h3'] = buildHeadingHandler(3);
  ACTION_HANDLERS['quote'] = buildToggleHandler('quote', 'quote', { enabled: true }, {
    applyingLabel: 'Applying quote…', removingLabel: 'Removing quote…',
    appliedLabel: 'Quote applied', removedLabel: 'Quote removed',
    failLabel: 'Quote failed',
  });
  ACTION_HANDLERS['code'] = buildToggleHandler('code', 'code', { enabled: true }, {
    applyingLabel: 'Applying code block…', removingLabel: 'Removing code block…',
    appliedLabel: 'Code block applied', removedLabel: 'Code block removed',
    failLabel: 'Code block failed',
  });
  ACTION_HANDLERS['callout'] = buildToggleHandler('callout', 'callout', { kind: 'info' }, {
    applyingLabel: 'Applying callout…', removingLabel: 'Removing callout…',
    appliedLabel: 'Callout applied', removedLabel: 'Callout removed',
    failLabel: 'Callout failed',
  });
  ACTION_HANDLERS['clean-spacing'] = buildToggleHandler('clean-spacing', 'clean-spacing', { enabled: true }, {
    applyingLabel: 'Cleaning spacing…', removingLabel: 'Restoring spacing…',
    appliedLabel: 'Spacing cleaned', removedLabel: 'Spacing restored',
    failLabel: 'Clean spacing failed',
  });

  /* ── Phase 2c-A — structure actions (sections + page dividers) ────────
   * Three actions wired against the edit-overlay subsystem's structure
   * pass:
   *   add-section   — inserts a section header BEFORE the selected
   *                   turn (defaults to top when no selection). Auto-
   *                   numbered title.
   *   split-section — same op as add-section; UX differs only in the
   *                   enable rule (requires selection AND the selected
   *                   turn to be inside an existing section). Phase 2d
   *                   will let users rename sections.
   *   page-divider  — inserts a soft horizontal rule before the selected
   *                   turn. Requires selection.
   *
   * Collapse-section + table-of-contents stay placeholders in 2c-A and
   * ship in 2c-B.
   *
   * All three go through RibbonBridge.applyOverlayOp (Phase 2b), which
   * checks drift, appends an op via the pure helper, upserts, and
   * re-applies the overlay (which now includes the structure pass). */

  function makeOverlayId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function structureBaseEnabled(ctx) {
    if (!ctx || ctx.chatType !== 'saved') return false;
    if (!ctx.snapshotId) return false;
    const bridge = getRibbonBridge();
    if (!bridge || typeof bridge.applyOverlayOp !== 'function') return false;
    const store = H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.editOverlay;
    if (!store || typeof store.upsert !== 'function') return false;
    return true;
  }

  ACTION_HANDLERS['add-section'] = {
    /* Enabled whenever a saved reader is open. No selection required —
     * defaults to inserting at the top of the snapshot. */
    isEnabled: function (ctx) { return structureBaseEnabled(ctx); },
    onClick: function (ctx, setStatus) {
      const bridge = getRibbonBridge();
      const readP = (bridge && typeof bridge.getStructureState === 'function')
        ? Promise.resolve(bridge.getStructureState())
        : Promise.resolve({ sections: [] });
      readP.then(function (cur) {
        const sectionCount = (cur && Array.isArray(cur.sections)) ? cur.sections.length : 0;
        const title = 'Section ' + (sectionCount + 1);
        const sectionId = makeOverlayId('sec');
        const ti = Number(ctx && ctx.selectedTurnIdx);
        const afterTurnIdx = (Number.isFinite(ti) && ti > 0) ? (ti - 1) : 0;
        runOverlayOp({
          type: 'add-section',
          target: { kind: 'between-turns', afterTurnIdx: afterTurnIdx },
          payload: { sectionId: sectionId, title: title, afterTurnIdx: afterTurnIdx },
        }, setStatus, {
          pending: 'Adding section…',
          success: 'Section added',
          fail: 'Section failed',
        });
      }, function () { setStatus('Section failed: state read'); });
    },
  };

  ACTION_HANDLERS['split-section'] = {
    /* Enabled when saved reader + selection + at least one overlay op
     * exists. The "selected turn is inside an existing section" check
     * is async (computeStructureState is async via the bridge); we make
     * a fast best-effort sync check here using ctx.hasOverlay, and the
     * onClick performs the real containment check before dispatching. */
    isEnabled: function (ctx) {
      if (!structureBaseEnabled(ctx)) return false;
      const ti = Number(ctx && ctx.selectedTurnIdx);
      if (!Number.isFinite(ti) || ti <= 0) return false;
      if (!ctx.hasOverlay) return false;
      return true;
    },
    onClick: function (ctx, setStatus) {
      const ti = Number(ctx && ctx.selectedTurnIdx);
      if (!Number.isFinite(ti) || ti <= 0) { setStatus('Select a message first'); return; }
      const bridge = getRibbonBridge();
      const ov = H2O && H2O.Studio && H2O.Studio.overlay;
      const readP = (bridge && typeof bridge.getStructureState === 'function')
        ? Promise.resolve(bridge.getStructureState())
        : Promise.resolve({ sections: [] });
      readP.then(function (cur) {
        const containing = (ov && typeof ov.findSectionContaining === 'function')
          ? ov.findSectionContaining(cur, ti)
          : null;
        if (!containing) { setStatus('Select a turn inside an existing section to split'); return; }
        const sections = (cur && Array.isArray(cur.sections)) ? cur.sections : [];
        const title = 'Section ' + (sections.length + 1);
        const sectionId = makeOverlayId('sec');
        runOverlayOp({
          type: 'add-section',
          target: { kind: 'between-turns', afterTurnIdx: ti - 1 },
          payload: { sectionId: sectionId, title: title, afterTurnIdx: ti - 1 },
        }, setStatus, {
          pending: 'Splitting section…',
          success: 'Section split',
          fail: 'Split failed',
        });
      }, function () { setStatus('Split failed: state read'); });
    },
  };

  ACTION_HANDLERS['page-divider'] = {
    /* Enabled when saved reader + selection. No requirement to be
     * inside a section — divider is independent of sections. */
    isEnabled: function (ctx) {
      if (!structureBaseEnabled(ctx)) return false;
      const ti = Number(ctx && ctx.selectedTurnIdx);
      return Number.isFinite(ti) && ti > 0;
    },
    onClick: function (ctx, setStatus) {
      const ti = Number(ctx && ctx.selectedTurnIdx);
      if (!Number.isFinite(ti) || ti <= 0) { setStatus('Select a message first'); return; }
      const dividerId = makeOverlayId('div');
      runOverlayOp({
        type: 'page-divider',
        target: { kind: 'between-turns', afterTurnIdx: ti - 1 },
        payload: { dividerId: dividerId, afterTurnIdx: ti - 1 },
      }, setStatus, {
        pending: 'Adding divider…',
        success: 'Page divider added',
        fail: 'Divider failed',
      });
    },
  };

  /* ── Phase 2c-B — Collapse section + Table of contents ────────────────
   * Both actions go through RibbonBridge.applyOverlayOp (Phase 2b) with
   * structure op types that Phase 2c-A's reducer already accepts
   * (collapse-section + toc). The applier renders the visual outcome
   * via the structure pass — this layer only composes the op spec. */

  ACTION_HANDLERS['collapse-section'] = {
    /* Enabled when saved reader + selection + at least one overlay op
     * exists. The "selected turn is inside an existing section" check
     * runs in onClick because it requires the async structure-state
     * read; the sync gate uses hasOverlay for parity with split-section. */
    isEnabled: function (ctx) {
      if (!structureBaseEnabled(ctx)) return false;
      const ti = Number(ctx && ctx.selectedTurnIdx);
      if (!Number.isFinite(ti) || ti <= 0) return false;
      if (!ctx.hasOverlay) return false;
      return true;
    },
    onClick: function (ctx, setStatus) {
      const ti = Number(ctx && ctx.selectedTurnIdx);
      if (!Number.isFinite(ti) || ti <= 0) { setStatus('Select a message first'); return; }
      const bridge = getRibbonBridge();
      const ov = H2O && H2O.Studio && H2O.Studio.overlay;
      const readP = (bridge && typeof bridge.getStructureState === 'function')
        ? Promise.resolve(bridge.getStructureState())
        : Promise.resolve({ sections: [] });
      readP.then(function (cur) {
        const containing = (ov && typeof ov.findSectionContaining === 'function')
          ? ov.findSectionContaining(cur, ti)
          : null;
        if (!containing) { setStatus('Select a turn inside an existing section to collapse'); return; }
        const nextCollapsed = !containing.collapsed;
        runOverlayOp({
          type: 'collapse-section',
          target: { kind: 'section', sectionId: containing.sectionId },
          payload: { sectionId: containing.sectionId, collapsed: nextCollapsed },
        }, setStatus, {
          pending: nextCollapsed ? 'Collapsing section…' : 'Expanding section…',
          success: nextCollapsed ? 'Section collapsed' : 'Section expanded',
          fail: 'Collapse failed',
        });
      }, function () { setStatus('Collapse failed: state read'); });
    },
  };

  ACTION_HANDLERS['table-of-contents'] = {
    /* Enabled when saved reader is mounted AND any overlay exists (the
     * onClick path enforces the "at least one section" requirement
     * before dispatching the toc op — turns away with a clear status
     * when there are no sections to list). */
    isEnabled: function (ctx) {
      if (!structureBaseEnabled(ctx)) return false;
      if (!ctx.hasOverlay) return false;
      return true;
    },
    onClick: function (ctx, setStatus) {
      const bridge = getRibbonBridge();
      const readP = (bridge && typeof bridge.getStructureState === 'function')
        ? Promise.resolve(bridge.getStructureState())
        : Promise.resolve({ sections: [], toc: { position: null } });
      readP.then(function (cur) {
        const sections = (cur && Array.isArray(cur.sections)) ? cur.sections : [];
        const currentPos = (cur && cur.toc && cur.toc.position) || null;
        /* No sections + TOC currently off → refuse with a helpful status.
         * No sections + TOC currently on → still allow toggling off
         * (recovery from a stale state). */
        if (sections.length === 0 && !currentPos) {
          setStatus('Add at least one section first');
          return;
        }
        const nextPos = (currentPos === 'top') ? null : 'top';
        runOverlayOp({
          type: 'toc',
          target: { kind: 'snapshot' },
          payload: { position: nextPos },
        }, setStatus, {
          pending: nextPos ? 'Showing TOC…' : 'Hiding TOC…',
          success: nextPos ? 'Table of contents shown' : 'Table of contents hidden',
          fail: 'TOC failed',
        });
      }, function () { setStatus('TOC failed: state read'); });
    },
  };

  /* ── Registration of the default catalogue ────────────────────────── */
  function registerCatalogue(shell) {
    TAB_CATALOGUE.forEach(function (tab) {
      shell.registerTab(tab.id, { label: tab.label, chatTypes: tab.chatTypes.slice() });
      tab.groups.forEach(function (group) {
        shell.registerGroup(tab.id, group.id, { label: group.label });
        group.actions.forEach(function (action) {
          shell.registerAction(tab.id, group.id, action.id, {
            label: action.label,
            disabled: true,
            /* Phase 1c — per-action tooltip override. When a catalogue
             * entry specifies its own tooltip (e.g. "No public Tags/Labels
             * API yet"), use that instead of the generic placeholder. */
            tooltip: action.tooltip || 'Coming soon',
            phase: '1a',
          });
        });
      });
    });
  }

  /* ── Tab filter for current chat type ─────────────────────────────── */
  function visibleTabsFor(chatType) {
    if (!chatType) return [];
    return TAB_CATALOGUE.filter(function (tab) {
      return tab.chatTypes.indexOf(chatType) !== -1;
    });
  }

  /* ── DOM building ─────────────────────────────────────────────────── */
  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'dataset' && attrs[k] && typeof attrs[k] === 'object') {
          Object.keys(attrs[k]).forEach(function (dk) { node.dataset[dk] = attrs[k][dk]; });
        } else if (k.indexOf('aria-') === 0 || k === 'role' || k === 'tabindex' || k === 'type' || k === 'id' || k === 'title' || k === 'hidden') {
          if (k === 'hidden') { if (attrs[k]) node.hidden = true; }
          else node.setAttribute(k, String(attrs[k]));
        } else {
          node.setAttribute(k, String(attrs[k]));
        }
      });
    }
    if (text != null) node.textContent = String(text);
    return node;
  }

  function buildTabStrip(visibleTabs, activeTabId, collapsed) {
    const strip = el('div', { class: 'wbRibbonBar' });

    const tablist = el('div', { class: 'wbRibbonTabs', role: 'tablist', 'aria-label': 'Studio ribbon tabs' });
    visibleTabs.forEach(function (tab) {
      const isActive = (tab.id === activeTabId);
      const tabBtn = el('button', {
        type: 'button',
        class: 'wbRibbonTab' + (isActive ? ' is-active' : ''),
        role: 'tab',
        id: 'wbRibbonTab-' + tab.id,
        'aria-selected': isActive ? 'true' : 'false',
        'aria-controls': 'wbRibbonPanel-' + tab.id,
        tabindex: isActive ? '0' : '-1',
        'data-tab-id': tab.id,
      }, tab.label);
      tablist.appendChild(tabBtn);
    });

    strip.appendChild(tablist);

    /* Phase 1b — non-invasive status label between tab strip and collapse
     * chevron. role="status" + aria-live="polite" so screen readers
     * announce action results. Hidden via CSS :empty when no message. */
    const statusEl = el('div', {
      class: 'wbRibbonStatus',
      role: 'status',
      'aria-live': 'polite',
      'data-testid': 'wbRibbonStatus',
    });
    strip.appendChild(statusEl);

    const collapseBtn = el('button', {
      type: 'button',
      class: 'wbRibbonCollapse',
      'aria-label': collapsed ? 'Expand ribbon' : 'Collapse ribbon',
      'aria-expanded': collapsed ? 'false' : 'true',
      title: collapsed ? 'Expand ribbon' : 'Collapse ribbon',
      'data-action': 'toggle-collapsed',
    });
    /* Chevron — purely decorative; the aria-label drives screen readers. */
    collapseBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" width="14" height="14">'
      + '<path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    strip.appendChild(collapseBtn);

    return strip;
  }

  function buildPanels(shell, visibleTabs, activeTabId) {
    const panels = el('div', { class: 'wbRibbonPanels' });
    /* Phase 1b — context-aware enabled/disabled decision per action. */
    const ctx = shell.getContext();
    visibleTabs.forEach(function (tab) {
      const isActive = (tab.id === activeTabId);
      const panel = el('div', {
        class: 'wbRibbonPanel',
        role: 'tabpanel',
        id: 'wbRibbonPanel-' + tab.id,
        'aria-labelledby': 'wbRibbonTab-' + tab.id,
        tabindex: '0',
        'data-tab-id': tab.id,
        hidden: !isActive,
      });

      const groups = shell.groupsForTab(tab.id);
      Object.keys(groups).forEach(function (gid, idx, arr) {
        const group = groups[gid];
        const groupEl = el('div', { class: 'wbRibbonGroup', 'data-group-id': group.id });
        const actionsRow = el('div', { class: 'wbRibbonGroupActions' });
        const actions = shell.actionsForGroup(tab.id, group.id);
        Object.keys(actions).forEach(function (aid) {
          const action = actions[aid];
          const handler = ACTION_HANDLERS[action.id];
          let enabled = false;
          if (handler && typeof handler.isEnabled === 'function') {
            try { enabled = !!handler.isEnabled(ctx); }
            catch (_) { enabled = false; }
          }
          const attrs = {
            type: 'button',
            class: 'wbRibbonAction',
            'data-action-id': action.id,
            'aria-disabled': enabled ? 'false' : 'true',
          };
          if (enabled) {
            /* Drop the "Coming soon" placeholder tooltip when the action is wired. */
            attrs.title = '';
          } else {
            attrs.title = action.tooltip || '';
            attrs.disabled = 'disabled';
          }
          const btn = el('button', attrs, action.label);
          actionsRow.appendChild(btn);
        });
        groupEl.appendChild(actionsRow);
        const groupLabel = el('div', { class: 'wbRibbonGroupLabel' }, group.label);
        groupEl.appendChild(groupLabel);
        panel.appendChild(groupEl);
        if (idx < arr.length - 1) {
          panel.appendChild(el('div', { class: 'wbRibbonSeparator', 'aria-hidden': 'true' }));
        }
      });

      panels.appendChild(panel);
    });
    return panels;
  }

  /* ── Render orchestration ─────────────────────────────────────────── */
  function render(container, shell) {
    const ctx = shell.getContext();
    const chatType = (ctx && ctx.chatType) || null;
    const collapsed = !!shell.getCollapsed();

    /* Visibility: ribbon entirely hidden when no chat is open. */
    if (!chatType) {
      container.hidden = true;
      container.dataset.chatType = '';
      container.dataset.collapsed = '';
      /* Still clear content so a focus inside the hidden node has nothing
       * to grab. */
      container.innerHTML = '';
      return;
    }

    container.hidden = false;
    container.dataset.chatType = chatType;
    container.dataset.collapsed = collapsed ? 'true' : '';

    const visibleTabs = visibleTabsFor(chatType);
    if (!visibleTabs.length) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }

    /* Resolve active tab: persisted -> first visible. */
    let activeTabId = shell.getActiveTab();
    const visibleIds = visibleTabs.map(function (t) { return t.id; });
    if (!activeTabId || visibleIds.indexOf(activeTabId) === -1) {
      activeTabId = visibleTabs[0].id;
      /* Update the shell so persistence reflects the resolved state. */
      shell.setActiveTab(activeTabId);
    }

    container.innerHTML = '';
    container.appendChild(buildTabStrip(visibleTabs, activeTabId, collapsed));
    if (!collapsed) {
      container.appendChild(buildPanels(shell, visibleTabs, activeTabId));
    }
  }

  function focusActiveTab(container) {
    const active = container.querySelector('.wbRibbonTab[aria-selected="true"]');
    if (active && typeof active.focus === 'function') {
      try { active.focus(); } catch (_) { /* swallow */ }
    }
  }

  /* ── Keyboard navigation on the tablist ───────────────────────────── */
  function bindKeyboard(container, shell) {
    container.addEventListener('keydown', function (ev) {
      const target = ev.target;
      if (!target || !target.classList || !target.classList.contains('wbRibbonTab')) return;

      const tabs = Array.prototype.slice.call(container.querySelectorAll('.wbRibbonTab'));
      const idx = tabs.indexOf(target);
      if (idx === -1) return;

      let nextIdx = -1;
      switch (ev.key) {
        case 'ArrowRight': nextIdx = (idx + 1) % tabs.length; break;
        case 'ArrowLeft':  nextIdx = (idx - 1 + tabs.length) % tabs.length; break;
        case 'Home':       nextIdx = 0; break;
        case 'End':        nextIdx = tabs.length - 1; break;
        default: return;
      }
      ev.preventDefault();
      const nextTab = tabs[nextIdx];
      const tabId = nextTab && nextTab.getAttribute('data-tab-id');
      if (tabId) {
        shell.setActiveTab(tabId);
        /* render() will rebuild; refocus the new tab after rebuild. */
      }
    });
  }

  /* ── Status feedback ──────────────────────────────────────────────────
   * In-ribbon status label between tab strip and collapse chevron. Phase
   * 1b uses this for Copy/Open action feedback because Studio does not
   * have a shared toast surface. Auto-clears after 2400ms unless
   * { persist: true }. Re-queries the element on each fire so a
   * mid-fade re-render (e.g. context change) does not crash the timer. */
  let statusFadeTimer = null;
  function makeSetStatus(container) {
    return function setStatus(text, opts) {
      const el = container.querySelector('.wbRibbonStatus');
      if (!el) return;
      el.textContent = String(text || '');
      if (statusFadeTimer) {
        try { clearTimeout(statusFadeTimer); } catch (_) { /* swallow */ }
        statusFadeTimer = null;
      }
      if (text && !(opts && opts.persist)) {
        statusFadeTimer = setTimeout(function () {
          try {
            const fresh = container.querySelector('.wbRibbonStatus');
            if (fresh) fresh.textContent = '';
          } catch (_) { /* swallow */ }
          statusFadeTimer = null;
        }, 2400);
      }
    };
  }

  /* ── Click handlers (tab switch + collapse toggle + wired actions) ─ */
  function bindClicks(container, shell) {
    const setStatus = makeSetStatus(container);
    container.addEventListener('click', function (ev) {
      const target = ev.target;
      if (!target || !target.closest) return;

      const collapseBtn = target.closest('[data-action="toggle-collapsed"]');
      if (collapseBtn) {
        ev.preventDefault();
        shell.setCollapsed(!shell.getCollapsed());
        return;
      }

      const tabBtn = target.closest('.wbRibbonTab');
      if (tabBtn) {
        const tabId = tabBtn.getAttribute('data-tab-id');
        if (tabId) {
          ev.preventDefault();
          shell.setActiveTab(tabId);
        }
        return;
      }

      /* Phase 1b — wired action handlers. The [disabled] attribute already
       * blocks clicks on placeholder actions at the browser level; we
       * defensively also check :not([disabled]) in the selector. */
      const actionBtn = target.closest('.wbRibbonAction:not([disabled])');
      if (actionBtn) {
        const actionId = actionBtn.getAttribute('data-action-id');
        const handler = actionId && ACTION_HANDLERS[actionId];
        if (handler && typeof handler.onClick === 'function') {
          ev.preventDefault();
          let ctx = null;
          try { ctx = shell.getContext(); } catch (_) { ctx = null; }
          try { handler.onClick(ctx, setStatus); }
          catch (e) {
            const msg = (e && (e.message || String(e))) || 'unknown error';
            setStatus('Action failed: ' + msg);
          }
          safeEmit('evt:h2o:studio:ribbon:action-invoked', { action: actionId });
        }
        return;
      }
    });
  }

  /* ── Initialization ───────────────────────────────────────────────── */
  let initialized = false;
  function init() {
    if (initialized) return;
    const shell = getShell();
    if (!shell) return;
    const container = getContainer();
    if (!container) return;
    initialized = true;

    registerCatalogue(shell);

    bindKeyboard(container, shell);
    bindClicks(container, shell);

    /* Subscribe to shell events via the direct subscriber API. The global
     * H2O.events in the current Studio runtime exposes emit but not on, so
     * subscribing through that bus would silently no-op. shell.subscribe()
     * is the canonical channel for in-process listeners. */
    const evts = shell.events;
    if (typeof shell.subscribe === 'function') {
      shell.subscribe(function (evt) {
        const name = evt && evt.event;
        if (name === evts.contextChanged) {
          render(container, shell);
        } else if (name === evts.tabChanged) {
          render(container, shell);
          /* Move focus to the new active tab so arrow keys keep working. */
          focusActiveTab(container);
        } else if (name === evts.collapsedChanged) {
          render(container, shell);
        }
      });
    }

    /* Listen to prefs ready in case the shell hydrates active-tab/collapsed
     * asynchronously after the surface module renders. */
    try {
      const prefs = H2O.Studio && H2O.Studio.store && H2O.Studio.store.prefs;
      if (prefs && typeof prefs.subscribe === 'function') {
        prefs.subscribe(function (evt) {
          if (evt && evt.type === 'ready') render(container, shell);
        });
      }
    } catch (_) { /* swallow */ }

    /* Initial paint. Until studio.js calls shell.setContext, chatType is
     * null so the ribbon stays hidden — which is the correct passive
     * default. */
    render(container, shell);

    /* Mark the shell mounted (no-op in Phase 1a but emits 'ready'). */
    try { shell.mount(container); } catch (_) { /* swallow */ }
    safeEmit('evt:h2o:studio:ribbon:surface-ready', { phase: '1a' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(globalThis);
