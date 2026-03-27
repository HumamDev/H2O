// ==UserScript==
// @h2o-id             3Z4a.drawer.panel
// @name               3Z4a.🔸🗃️ Drawer Panel 🗃️
// @namespace          H2O.Premium.CGX.drawer.panel
// @author             HumamDev
// @version            0.3.0
// @revision           001
// @build              260310-000000
// @description        Drawer body renderer for H2O Workspace. Consumes the shared Workspace Dock from 3X1a and renders chat artifacts.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = W.document;
  const H2O = (W.H2O = W.H2O || {});

  const SHELL_ROOT_ID = 'cgxui-wsdk-root';
  const SHELL_OWNER = 'wsdk';
  const ATTR_OWNER = 'data-cgxui-owner';
  const ATTR_UI = 'data-cgxui';
  const CSS_ID = 'cgxui-drwrb-style';
  const SkID = 'drwrb';

  const SEL = Object.freeze({
    root: `#${SHELL_ROOT_ID}[${ATTR_OWNER}="${SHELL_OWNER}"][${ATTR_UI}="root"]`,
    body: `[${ATTR_OWNER}="${SHELL_OWNER}"][${ATTR_UI}="body"]`,
    title: `[${ATTR_OWNER}="${SHELL_OWNER}"][${ATTR_UI}="title"]`,
  });

  const STR = Object.freeze({
    paneDrawer: 'drawer',
    title: 'Drawer',
    searchPh: 'Search artifacts…',
    emptyNoCore: 'Workspace Core not loaded.',
    emptyNoShell: 'Workspace Dock not loaded.',
    emptyNoArtifacts: 'No artifacts in this chat yet.',
    composerNew: 'New Artifact',
    composerEdit: 'Edit Artifact',
    save: 'Save',
    update: 'Update',
    cancel: 'Cancel',
    export: 'Export',
    copyTimeline: 'Copy Timeline Text',
    exportTimeline: 'Export Timeline JSON',
    copyCompactTimeline: 'Copy Compact Timeline',
    narrativePrompt: 'Generate Narrative Prompt',
    legalIssuesPrompt: 'Generate Legal Issues Prompt',
    contradictionsPrompt: 'Generate Contradictions Prompt',
    copyCompactClaims: 'Copy Compact Claims',
    copyCompactContradictions: 'Copy Compact Contradictions',
    claimAnalysisPrompt: 'Generate Claim Analysis Prompt',
    claimEvidencePrompt: 'Generate Claim Evidence Prompt',
    contradictionAnalysisPrompt: 'Generate Contradiction Analysis Prompt',
    reconciliationPrompt: 'Generate Reconciliation Prompt',
    copyCompactActors: 'Copy Compact Actors',
    stakeholderMapPrompt: 'Generate Stakeholder Map Prompt',
    responsibilityPrompt: 'Generate Responsibility Analysis Prompt',
    leverageRiskPrompt: 'Generate Leverage / Risk Prompt',
    promptBuilder: 'Prompt Builder',
    includeTimeline: 'Timeline',
    includeClaims: 'Claims',
    includeContradictions: 'Contradictions',
    includeActors: 'Actors',
    caseAnalysisPrompt: 'Generate Case Analysis Prompt',
    issuesMapPrompt: 'Generate Issues Map Prompt',
    strategyMemoPrompt: 'Generate Strategy Memo Prompt',
    evidenceGapsPrompt: 'Generate Evidence Gaps Prompt',
    savePromptCapsule: 'Save Prompt Capsule',
    builderModeCaseAnalysis: 'Case Analysis',
    builderModeIssuesMap: 'Issues Map',
    builderModeStrategyMemo: 'Strategy Memo',
    builderModeEvidenceGaps: 'Evidence Gaps',
    preset: 'Preset',
    builderDraft: 'Builder Draft',
    buildDraft: 'Build Draft',
    insertDraft: 'Insert Draft',
    saveDraftCapsule: 'Save Draft Capsule',
    presetIssueSpotting: 'Issue Spotting',
    presetProceduralDefectMemo: 'Procedural Defect Memo',
    presetEvidenceRequestMemo: 'Evidence Request Memo',
    presetContradictionEscalationMemo: 'Contradiction Escalation Memo',
    select: 'Select',
    selected: 'Selected',
    selectedOnly: 'Selected Only',
    clearSelection: 'Clear Selection',
    selectedCount: 'Selected',
    copied: 'Copied',
    done: 'Done',
    draft: 'Draft',
      archive: 'Archive',
      usedLabel: 'Used',
      showArchived: 'Show Archived',    hideArchived: 'Hide Archived',
    timelineTools: 'Timeline Tools',
    timelineView: 'Timeline Review',
    timelineWarnings: 'Warnings',
    duplicatePairs: 'Duplicate Pairs',
    possibleDuplicate: 'Possible duplicate',
    undated: 'Undated',
    exactCount: 'Exact',
    approximateCount: 'Approximate',
    actorsCount: 'Actors',
    firstEvent: 'First',
    lastEvent: 'Last',
    exact: 'Exact',
    approximate: 'Approximate',
    unknown: 'Unknown',
    used: 'Used',
    insert: 'Insert to Composer',
    rerun: 'Run Again',
    capsule: 'Prompt Capsule',
    refine: 'Refine',
    merge: 'Merge',
    merged: 'Merged',
  });

  const CFG = Object.freeze({
    waitMaxMs: 10000,
    debounceMs: 120,
    observerSubtree: true,
  });

  const S = {
    booted: false,
    api: null,
    root: null,
    body: null,
    titleEl: null,
    mo: null,
    rerenderT: 0,
    uiState: {
      q: '',
      type: 'all',
      showArchived: false,
      builder: {
        includeTimeline: true,
        includeClaims: true,
        includeContradictions: true,
        includeActors: true,
        selectedOnly: false,
        lastMode: 'case-analysis',
        preset: 'issue-spotting',
        draftText: '',
      },
      sections: {
        promptBuilder: true,
        builderPreset: false,
        context: true,
        artifacts: true,
        timelineSummary: true,
        timelineWarnings: true,
        timelineDuplicates: true,
      },
      editorOpen: false,
      editorMode: 'create',
      editorId: '',
      draft: { type: 'artifact', title: '', body: '' },
    },
    handlers: { workspace: [] },
  };

  function q(sel, root = D) { return root.querySelector(sel); }
  function safe(fn, fallback = null) { try { return fn(); } catch { return fallback; } }
  function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function debounce(fn, ms = CFG.debounceMs) { let t = 0; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
  function titleCaseWords(s) { return String(s || '').toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase()); }

  function getArtifactTypeLabel(type) {
    const raw = String(type || 'artifact').trim();
    const known = {
      legal_actor: 'Legal Actor',
      legal_claim: 'Legal Claim',
      legal_contradiction: 'Legal Contradiction',
      prompt_capsule: 'Prompt Capsule',
      timeline_item: 'Timeline Item',
    };
    if (known[raw]) return known[raw];
    return titleCaseWords(raw.replace(/[_-]+/g, ' '));
  }

  async function waitForWorkspaceApi(maxMs = CFG.waitMaxMs) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      (function tick() {
        const api = W.H2O?.Workspace || null;
        const ok = !!(api && typeof api.getRightState === 'function' && typeof api.listArtifacts === 'function' && typeof api.saveArtifact === 'function' && typeof api.updateArtifact === 'function');
        if (ok) return resolve(api);
        if (Date.now() - t0 > maxMs) return resolve(null);
        requestAnimationFrame(tick);
      })();
    });
  }

  async function waitForDock(maxMs = CFG.waitMaxMs) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      (function tick() {
        const root = q(SEL.root);
        const body = root ? q(SEL.body, root) : null;
        if (root && body) return resolve({ root, body, titleEl: q(SEL.title, root) });
        if (Date.now() - t0 > maxMs) return resolve(null);
        requestAnimationFrame(tick);
      })();
    });
  }

  function ensureStylesOnce() {
    if (D.getElementById(CSS_ID)) return;
    const style = D.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
      .cgxui-${SkID}-bar{ display:flex; flex-direction:column; gap:10px; margin-bottom:12px; }
      .cgxui-${SkID}-row{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
      .cgxui-${SkID}-search,.cgxui-${SkID}-select,.cgxui-${SkID}-input,.cgxui-${SkID}-textarea{ width:100%; border-radius:10px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.90); outline:none; }
      .cgxui-${SkID}-search,.cgxui-${SkID}-select,.cgxui-${SkID}-input{ height:34px; padding:0 10px; }
      .cgxui-${SkID}-textarea{ min-height:110px; resize:vertical; padding:10px; font:12px/1.45 system-ui,-apple-system,"Segoe UI",Arial; }
      .cgxui-${SkID}-btn{ height:34px; padding:0 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.92); cursor:pointer; white-space:nowrap; }
      .cgxui-${SkID}-btn:hover{ background:rgba(255,255,255,0.14); }
      .cgxui-${SkID}-btn.is-primary{ background:rgba(35,214,180,0.18); border-color:rgba(35,214,180,0.34); color:rgba(214,255,246,0.98); }
      .cgxui-${SkID}-btn.is-danger{ background:rgba(255,90,90,0.14); border-color:rgba(255,90,90,0.24); }
      .cgxui-${SkID}-sec{ margin-top:14px; }
      .cgxui-${SkID}-sec-hd{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
      .cgxui-${SkID}-sec-hd-left{ display:flex; align-items:center; gap:8px; min-width:0; }
      .cgxui-${SkID}-sec-ttl{ font:700 12px/1.2 system-ui,-apple-system,"Segoe UI",Arial; letter-spacing:.24px; color:rgba(255,255,255,0.88); text-transform:uppercase; }
      .cgxui-${SkID}-muted{ color:rgba(255,255,255,0.62); font:11px/1.35 system-ui,-apple-system,"Segoe UI",Arial; }
      .cgxui-${SkID}-chips,.cgxui-${SkID}-meta,.cgxui-${SkID}-actions{ display:flex; flex-wrap:wrap; gap:6px; }
      .cgxui-${SkID}-substate{
        margin-top:6px;
        font:10px/1.3 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.54);
      }
      .cgxui-${SkID}-chip,.cgxui-${SkID}-tag{ display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border-radius:999px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.90); font:11px/1.2 system-ui,-apple-system,"Segoe UI",Arial; }
      .cgxui-${SkID}-chips.is-type-wrap{ flex-shrink:0; }
      .cgxui-${SkID}-chip.is-type{ background:rgba(52,90,182,0.30); border-color:rgba(111,145,228,0.34); color:rgba(233,241,255,0.98); box-shadow:inset 0 0 0 1px rgba(111,145,228,0.10); }
      .cgxui-${SkID}-tag.is-hash{ padding:2px 6px; font:9px/1.05 system-ui,-apple-system,"Segoe UI",Arial; background:rgba(26,30,40,0.92); border-color:rgba(89,101,128,0.28); color:rgba(211,220,238,0.78); }
      .cgxui-${SkID}-editor,.cgxui-${SkID}-card{ border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.05); border-radius:14px; padding:10px; }
      .cgxui-${SkID}-list{ display:flex; flex-direction:column; gap:10px; }
      .cgxui-${SkID}-card-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
      .cgxui-${SkID}-card-ttl{ font:700 12px/1.28 system-ui,-apple-system,"Segoe UI",Arial; color:rgba(255,255,255,0.92); }
      .cgxui-${SkID}-card-sub{ margin-top:4px; font:11px/1.35 system-ui,-apple-system,"Segoe UI",Arial; color:rgba(255,255,255,0.62); }
      .cgxui-${SkID}-card-body{ margin-top:8px; font:12px/1.45 system-ui,-apple-system,"Segoe UI",Arial; color:rgba(255,255,255,0.88); white-space:pre-wrap; word-break:break-word; }
      .cgxui-${SkID}-card-meta-line{ margin-top:8px; display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
      .cgxui-${SkID}-card-foot,.cgxui-${SkID}-tl-foot{ margin-top:10px; display:flex; justify-content:flex-end; }
      .cgxui-${SkID}-meta-actions{ display:flex; justify-content:flex-end; margin-left:auto; flex:0 0 auto; }
      .cgxui-${SkID}-mini-btn{ height:28px; padding:0 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.90); cursor:pointer; font:11px/1 system-ui,-apple-system,"Segoe UI",Arial; }
      .cgxui-${SkID}-mini-btn.is-on{ background:rgba(255,212,96,0.18); border-color:rgba(255,212,96,0.34); }
      .cgxui-${SkID}-mini-btn.is-done{ background:rgba(35,214,180,0.16); border-color:rgba(35,214,180,0.32); }
      .cgxui-${SkID}-action-menu{ position:relative; }
      .cgxui-${SkID}-action-menu[open]{ z-index:4; }
      .cgxui-${SkID}-action-menu > summary{ list-style:none; }
      .cgxui-${SkID}-action-menu > summary::-webkit-details-marker{ display:none; }
      .cgxui-${SkID}-action-toggle{ width:30px; min-width:30px; padding:0; display:flex; align-items:center; justify-content:center; }
      .cgxui-${SkID}-action-toggle.is-small{ width:26px; min-width:26px; height:26px; padding:0; border-radius:7px; }
      .cgxui-${SkID}-action-toggle svg{ width:14px; height:14px; display:block; }
      .cgxui-${SkID}-action-toggle.is-small svg{ width:12px; height:12px; }
      .cgxui-${SkID}-action-pop{ position:absolute; right:0; top:calc(100% + 6px); display:flex; flex-direction:column; gap:6px; min-width:154px; padding:8px; border-radius:14px; border:1px solid rgba(106,128,170,0.24); background:linear-gradient(180deg, rgba(26,29,39,0.98), rgba(14,16,24,0.98)); box-shadow:0 18px 38px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04); backdrop-filter:blur(10px); }
      .cgxui-${SkID}-action-pop.is-capsule{ border-color:rgba(217,170,63,0.28); background:rgba(36,30,20,0.98); }
      .cgxui-${SkID}-action-pop .cgxui-${SkID}-mini-btn{ width:100%; display:flex; align-items:center; justify-content:flex-start; }
      .cgxui-${SkID}-action-pop .cgxui-${SkID}-mini-btn:hover,
      .cgxui-${SkID}-toolbar-pop .cgxui-${SkID}-btn:hover{ background:rgba(255,255,255,0.12); }
      .cgxui-${SkID}-toolbar-menu{ position:relative; }
      .cgxui-${SkID}-toolbar-menu[open]{ z-index:5; }
      .cgxui-${SkID}-toolbar-menu > summary{ list-style:none; }
      .cgxui-${SkID}-toolbar-menu > summary::-webkit-details-marker{ display:none; }
      .cgxui-${SkID}-toolbar-toggle{ width:30px; min-width:30px; padding:0; display:flex; align-items:center; justify-content:center; }
      .cgxui-${SkID}-toolbar-toggle svg{ width:14px; height:14px; display:block; }
      .cgxui-${SkID}-toolbar-pop{ position:absolute; left:0; top:calc(100% + 6px); min-width:244px; display:flex; flex-direction:column; gap:6px; padding:10px; border-radius:16px; border:1px solid rgba(96,126,204,0.24); background:linear-gradient(180deg, rgba(18,20,31,0.98), rgba(9,11,19,0.98)); box-shadow:0 22px 42px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.05); backdrop-filter:blur(12px); }
      .cgxui-${SkID}-toolbar-pop.is-right{ left:auto; right:0; }
      .cgxui-${SkID}-toolbar-pop .cgxui-${SkID}-btn{ justify-content:flex-start; }
      .cgxui-${SkID}-fold{ margin-top:14px; }
      .cgxui-${SkID}-fold > summary{ list-style:none; cursor:pointer; user-select:none; }
      .cgxui-${SkID}-fold > summary::-webkit-details-marker{ display:none; }
      .cgxui-${SkID}-fold-summary .cgxui-${SkID}-sec-hd{ margin-bottom:0; }
      .cgxui-${SkID}-fold-body{ margin-top:8px; }
      .cgxui-${SkID}-card.is-capsule{ border-color:rgba(217,170,63,0.28); background:linear-gradient(180deg, rgba(77,58,20,0.42), rgba(41,34,19,0.30)); }
      .cgxui-${SkID}-card-body.is-capsule{ padding:10px 12px; border-radius:12px; background:rgba(23,18,9,0.38); border:1px solid rgba(217,170,63,0.14); }
      .cgxui-${SkID}-chips.is-nowrap{ flex-wrap:nowrap; }
      .cgxui-${SkID}-chip.is-capsule{ white-space:nowrap; background:rgba(217,170,63,0.16); border-color:rgba(217,170,63,0.30); color:rgba(255,231,179,0.96); }
      .cgxui-${SkID}-meta.is-capsule{ margin-top:8px; gap:8px; }
      .cgxui-${SkID}-tag.is-capsule{ padding:3px 7px; font:10px/1.15 system-ui,-apple-system,"Segoe UI",Arial; background:rgba(0,0,0,0.26); border-color:rgba(255,255,255,0.06); color:rgba(255,235,198,0.82); }
      .cgxui-${SkID}-actions.is-capsule{ flex-wrap:nowrap; overflow-x:auto; padding-bottom:2px; }
      .cgxui-${SkID}-actions.is-capsule .cgxui-${SkID}-mini-btn{ flex:0 0 auto; white-space:nowrap; }
      .cgxui-${SkID}-empty{ padding:14px 12px; border-radius:12px; border:1px dashed rgba(255,255,255,0.12); background:rgba(255,255,255,0.03); color:rgba(255,255,255,0.62); }
      .cgxui-${SkID}-timeline{ display:flex; flex-direction:column; gap:10px; }
      .cgxui-${SkID}-tl{
        border:1px solid rgba(255,255,255,0.10);
        background:rgba(255,255,255,0.05);
        border-radius:14px;
        padding:10px;
      }
      .cgxui-${SkID}-tl-top{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:10px;
      }
      .cgxui-${SkID}-tl-date{
        font:700 12px/1.2 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(220,255,246,0.96);
      }
      .cgxui-${SkID}-tl-main{
        margin-top:6px;
        font:12px/1.45 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.90);
      }
      .cgxui-${SkID}-tl-sub{
        margin-top:6px;
        font:11px/1.35 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.62);
      }
      .cgxui-${SkID}-tl-row{
        margin-top:8px;
        display:flex;
        flex-wrap:wrap;
        gap:6px;
      }
      .cgxui-${SkID}-tl-badge{
        font:10px/1.2 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.78);
        padding:3px 6px;
        border-radius:999px;
        background:rgba(255,255,255,0.05);
        border:1px solid rgba(255,255,255,0.08);
      }
      .cgxui-${SkID}-tl-badge.is-date{
        color:rgba(220,255,246,0.92);
        background:rgba(35,214,180,0.16);
        border-color:rgba(35,214,180,0.28);
      }
      .cgxui-${SkID}-tl-actions{
        display:flex;
        flex-wrap:wrap;
        gap:6px;
        margin-top:10px;
      }
      .cgxui-${SkID}-tl-subline{ margin-top:8px; display:flex; align-items:flex-end; justify-content:space-between; gap:8px; }
      .cgxui-${SkID}-tl-subline .cgxui-${SkID}-tl-sub{ margin-top:0; flex:1 1 auto; }
      .cgxui-${SkID}-tl-inline-actions{ display:flex; justify-content:flex-end; align-self:flex-end; flex:0 0 auto; }
      .cgxui-${SkID}-tl-summary,
      .cgxui-${SkID}-tl-warnings,
      .cgxui-${SkID}-tl-group{
        border:1px solid rgba(255,255,255,0.10);
        background:rgba(255,255,255,0.05);
        border-radius:14px;
        padding:10px;
      }

      .cgxui-${SkID}-tl-summary{
        background:rgba(35,214,180,0.07);
        border-color:rgba(35,214,180,0.18);
      }

      .cgxui-${SkID}-tl-warnings{
        background:rgba(255,195,92,0.08);
        border-color:rgba(255,195,92,0.18);
      }

      .cgxui-${SkID}-tl-hd{
        font:700 12px/1.2 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(220,255,246,0.96);
        margin-bottom:8px;
      }

      .cgxui-${SkID}-tl-group-hd{
        font:700 12px/1.2 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.90);
        margin-bottom:8px;
      }

      .cgxui-${SkID}-tl-chips{
        display:flex;
        flex-wrap:wrap;
        gap:6px;
      }

      .cgxui-${SkID}-tl-chip{
        font:10px/1.2 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.82);
        padding:4px 7px;
        border-radius:999px;
        background:rgba(255,255,255,0.05);
        border:1px solid rgba(255,255,255,0.08);
      }

      .cgxui-${SkID}-tl-group-list{
        display:flex;
        flex-direction:column;
        gap:8px;
      }

      .cgxui-${SkID}-timeline-stack{
        display:flex;
        flex-direction:column;
        gap:10px;
      }
      .cgxui-${SkID}-tl-dup{
        border:1px solid rgba(255,195,92,0.18);
        background:rgba(255,195,92,0.08);
        border-radius:14px;
        padding:10px;
      }

      .cgxui-${SkID}-tl-dup-list{
        display:flex;
        flex-direction:column;
        gap:8px;
      }

      .cgxui-${SkID}-tl-dup-row{
        border:1px solid rgba(255,255,255,0.08);
        background:rgba(255,255,255,0.04);
        border-radius:10px;
        padding:8px;
      }

      .cgxui-${SkID}-tl-dup-top{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
      }

      .cgxui-${SkID}-tl-dup-score{
        font:10px/1.2 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.82);
        padding:3px 6px;
        border-radius:999px;
        background:rgba(255,195,92,0.12);
        border:1px solid rgba(255,195,92,0.24);
      }

      .cgxui-${SkID}-tl-dup-body{
        margin-top:6px;
        font:11px/1.4 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.72);
      }
      .cgxui-${SkID}-pb{
        border:1px solid rgba(120,170,255,0.18);
        background:rgba(120,170,255,0.07);
        border-radius:14px;
        padding:10px;
      }
      .cgxui-${SkID}-pb-row{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        align-items:center;
        margin-top:8px;
      }
      .cgxui-${SkID}-pb-chip{
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:5px 8px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,0.10);
        background:rgba(255,255,255,0.05);
        color:rgba(255,255,255,0.88);
        font:11px/1.2 system-ui,-apple-system,"Segoe UI",Arial;
        cursor:pointer;
        user-select:none;
      }
      .cgxui-${SkID}-pb-chip input{
        margin:0;
      }
      .cgxui-${SkID}-pb-draft{
        width:100%;
        min-height:140px;
        resize:vertical;
        border-radius:12px;
        border:1px solid rgba(255,255,255,0.10);
        background:rgba(255,255,255,0.04);
        color:rgba(255,255,255,0.92);
        padding:10px;
        font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
        box-sizing:border-box;
      }
    `;
    D.documentElement.appendChild(style);
  }

  function attachDockRefs() {
    const root = q(SEL.root);
    const body = root ? q(SEL.body, root) : null;
    const titleEl = root ? q(SEL.title, root) : null;
    S.root = root || null;
    S.body = body || null;
    S.titleEl = titleEl || null;
    return !!(S.root && S.body);
  }

  function observeDock() {
    if (S.mo || typeof MutationObserver !== 'function') return;
    S.mo = new MutationObserver(() => {
      const hadBody = !!S.body;
      const ok = attachDockRefs();
      if (!hadBody && ok) rerender();
    });
    S.mo.observe(D.documentElement, { childList: true, subtree: CFG.observerSubtree });
  }

  function isDrawerPane() {
    const rs = safe(() => S.api?.getRightState?.(), null) || { pane: 'shelf' };
    return String(rs.pane || '') === STR.paneDrawer;
  }

  function getDrawerUiState() {
    const coreUi = safe(() => S.api?.getContract?.()?.state?.drawerUi?.(), null) || {};
    return {
      q: S.uiState.q || coreUi.q || '',
      type: S.uiState.type || coreUi.type || 'all',
      showArchived: !!(coreUi.showArchived ?? S.uiState.showArchived ?? false),
      builder: {
        includeTimeline: !!(coreUi.builder?.includeTimeline ?? S.uiState.builder?.includeTimeline ?? true),
        includeClaims: !!(coreUi.builder?.includeClaims ?? S.uiState.builder?.includeClaims ?? true),
        includeContradictions: !!(coreUi.builder?.includeContradictions ?? S.uiState.builder?.includeContradictions ?? true),
        includeActors: !!(coreUi.builder?.includeActors ?? S.uiState.builder?.includeActors ?? true),
        selectedOnly: !!(coreUi.builder?.selectedOnly ?? S.uiState.builder?.selectedOnly ?? false),
        lastMode: String(S.uiState.builder?.lastMode || coreUi.builder?.lastMode || 'case-analysis'),
        preset: String(S.uiState.builder?.preset || coreUi.builder?.preset || 'issue-spotting'),
        draftText: String(S.uiState.builder?.draftText || coreUi.builder?.draftText || ''),
      },
      sections: {
        promptBuilder: !!(coreUi.sections?.promptBuilder ?? S.uiState.sections?.promptBuilder ?? true),
        builderPreset: !!(coreUi.sections?.builderPreset ?? S.uiState.sections?.builderPreset ?? false),
        context: !!(coreUi.sections?.context ?? S.uiState.sections?.context ?? true),
        artifacts: !!(coreUi.sections?.artifacts ?? S.uiState.sections?.artifacts ?? true),
        timelineSummary: !!(coreUi.sections?.timelineSummary ?? S.uiState.sections?.timelineSummary ?? true),
        timelineWarnings: !!(coreUi.sections?.timelineWarnings ?? S.uiState.sections?.timelineWarnings ?? true),
        timelineDuplicates: !!(coreUi.sections?.timelineDuplicates ?? S.uiState.sections?.timelineDuplicates ?? true),
      },
      view: coreUi.view || 'cards',
      sort: coreUi.sort || 'updated_desc',
      editorOpen: !!S.uiState.editorOpen,
      editorMode: S.uiState.editorMode || 'create',
      editorId: S.uiState.editorId || '',
      draft: { ...(S.uiState.draft || {}) },
    };
  }

  function saveDrawerUiPatch(patch) {
    S.uiState = {
      ...S.uiState,
      ...(patch || {}),
      builder: { ...(S.uiState.builder || {}), ...((patch && patch.builder) || {}) },
      sections: { ...(S.uiState.sections || {}), ...((patch && patch.sections) || {}) },
      draft: { ...(S.uiState.draft || {}), ...((patch && patch.draft) || {}) },
    };
    safe(() => S.api?.saveDrawerUi?.({
      q: S.uiState.q || '',
      type: S.uiState.type || 'all',
      showArchived: !!S.uiState.showArchived,
      builder: {
        ...(S.uiState.builder || {}),
      },
      sections: {
        ...(S.uiState.sections || {}),
      },
    }));
  }

  function resetEditor() {
    saveDrawerUiPatch({ editorOpen: false, editorMode: 'create', editorId: '', draft: { type: 'artifact', title: '', body: '' } });
  }

  function openCreateEditor(preset = null) {
    const profile = safe(() => S.api?.getChatProfile?.(), {}) || {};
    const activePackId = String(profile?.prefs?.primaryPackId || '') || String((Array.isArray(profile?.activePackIds) ? profile.activePackIds[0] : '') || '');
    saveDrawerUiPatch({ editorOpen: true, editorMode: 'create', editorId: '', draft: { type: String(preset?.type || 'artifact'), title: String(preset?.title || ''), body: String(preset?.body || ''), packId: activePackId } });
  }

  function openEditEditor(artifact) {
    if (!artifact) return;
    saveDrawerUiPatch({ editorOpen: true, editorMode: 'edit', editorId: String(artifact.id || ''), draft: { type: String(artifact.type || 'artifact'), title: String(artifact.title || ''), body: String(artifact.body || ''), packId: String(artifact.packId || '') } });
  }

  function formatDate(ts) {
    const n = Number(ts || 0); if (!n) return '';
    const d = new Date(n);
    return d.toLocaleString([], { year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

function formatUsedMeta(a) {
  const usedAt = Number(a?.data?.usedAt || 0);
  if (!usedAt) return '';
  return `${STR.usedLabel} · ${formatDate(usedAt)}`;
}

  function normTimelineDateText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function monthIndexFromName(name) {
    const m = String(name || '').toLowerCase().slice(0, 3);
    const map = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    return Object.prototype.hasOwnProperty.call(map, m) ? map[m] : -1;
  }

  function parseTimelineDateText(dateText) {
    const raw = normTimelineDateText(dateText);
    if (!raw) return null;

    let m;

    // YYYY-MM-DD
    m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (m) {
      const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
      return new Date(y, Number(m[2]) - 1, Number(m[1])).getTime();
    }

    // 17 July 2025
    m = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const mi = monthIndexFromName(m[2]);
      if (mi >= 0) return new Date(Number(m[3]), mi, Number(m[1])).getTime();
    }

    // July 17, 2025
    m = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) {
      const mi = monthIndexFromName(m[1]);
      if (mi >= 0) return new Date(Number(m[3]), mi, Number(m[2])).getTime();
    }

    // early/mid/late May 2025
    m = raw.match(/^(early|mid|late)\s+([A-Za-z]+)\s+(\d{4})$/i);
    if (m) {
      const mi = monthIndexFromName(m[2]);
      if (mi >= 0) {
        const day = /^early$/i.test(m[1]) ? 5 : /^mid$/i.test(m[1]) ? 15 : 25;
        return new Date(Number(m[3]), mi, day).getTime();
      }
    }

    // Month Year
    m = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const mi = monthIndexFromName(m[1]);
      if (mi >= 0) return new Date(Number(m[2]), mi, 1).getTime();
    }

    // bare year fallback
    m = raw.match(/^(\d{4})$/);
    if (m) return new Date(Number(m[1]), 0, 1).getTime();

    return null;
  }

  function sortArtifactsForDisplay(rows, ui) {
    const arr = Array.isArray(rows) ? rows.slice() : [];
    const type = String(ui?.type || 'all');

    if (type !== 'timeline_item') return arr;

    return arr.sort((a, b) => {
      const ad = parseTimelineDateText(a?.data?.dateText || '');
      const bd = parseTimelineDateText(b?.data?.dateText || '');

      if (ad != null && bd != null && ad !== bd) return ad - bd;
      if (ad != null && bd == null) return -1;
      if (ad == null && bd != null) return 1;

      const au = Number(a?.updatedAt || a?.createdAt || 0);
      const bu = Number(b?.updatedAt || b?.createdAt || 0);
      return au - bu;
    });
  }

  function getArtifactsAll() { return safe(() => S.api?.listArtifacts?.({}), []) || []; }
  function getArtifactTypes(arts) {
    const set = new Set();
    for (const a of arts || []) { const t = String(a?.type || '').trim(); if (t) set.add(t); }
    return Array.from(set).sort((a, b) => getArtifactTypeLabel(a).localeCompare(getArtifactTypeLabel(b)));
  }

  function getFilteredArtifacts() {
    const ui = getDrawerUiState();
    const qv = norm(ui.q);
    const type = String(ui.type || 'all');
    const showArchived = !!ui.showArchived;

    let arr = getArtifactsAll();

    if (!showArchived) {
      arr = arr.filter(a => String(a?.status || 'draft') !== 'archived');
    }

    if (type !== 'all') {
      arr = arr.filter(a => String(a?.type || '') === type);
    }

    if (qv) {
      arr = arr.filter((a) => {
        const hay = norm([
          a?.title,
          a?.body,
          a?.type,
          a?.status,
          ...(Array.isArray(a?.tags) ? a.tags : []),
        ].join(' '));
        return hay.includes(qv);
      });
    }

    return arr;
  }

  function getStatusLabel(s) {
    const v = String(s || 'draft');
    if (v === 'done') return STR.done;
    if (v === 'archived') return STR.archive;
    return STR.draft;
  }

  function getSectionOpen(ui, key, fallback = true) {
    if (!key) return !!fallback;
    return !!(ui?.sections && Object.prototype.hasOwnProperty.call(ui.sections, key)
      ? ui.sections[key]
      : fallback);
  }

  function renderCollapsibleSection({ ui, key, title, sideText = '', body = '' } = {}) {
    const open = getSectionOpen(ui, key, true);
    return `
      <details class="cgxui-${SkID}-fold" data-sec="${escHtml(String(key || ''))}"${open ? ' open' : ''}>
        <summary class="cgxui-${SkID}-fold-summary">
          <div class="cgxui-${SkID}-sec-hd">
            <div class="cgxui-${SkID}-sec-hd-left"><div class="cgxui-${SkID}-sec-ttl">${escHtml(String(title || 'Section'))}</div></div>
            ${sideText ? `<div class="cgxui-${SkID}-muted">${escHtml(String(sideText))}</div>` : ''}
          </div>
        </summary>
        <div class="cgxui-${SkID}-fold-body">${body}</div>
      </details>
    `;
  }

  function makeSectionKey(prefix, label) {
    return `${String(prefix || 'section')}:${String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  }

  function closeOpenMenus(exceptMenu = null) {
    D.querySelectorAll(`.cgxui-${SkID}-action-menu[open], .cgxui-${SkID}-toolbar-menu[open]`).forEach((node) => {
      if (exceptMenu && node === exceptMenu) return;
      node.open = false;
    });
  }

  function renderToolbarActionMenu(title, items = [], { iconOnly = false } = {}) {
    const buttons = (Array.isArray(items) ? items : [])
      .filter((x) => x && x.action && x.label)
      .map((item) => `<button class="cgxui-${SkID}-btn${item.primary ? ' is-primary' : ''}" type="button" data-drw="${escHtml(String(item.action))}">${escHtml(String(item.label))}</button>`)
      .join('');
    if (!buttons) return '';
    return `
      <details class="cgxui-${SkID}-toolbar-menu">
        <summary class="cgxui-${SkID}-btn${iconOnly ? ` cgxui-${SkID}-toolbar-toggle` : ''}"${iconOnly ? ` aria-label="${escHtml(String(title || 'Tools'))}" title="${escHtml(String(title || 'Tools'))}"` : ''}>${iconOnly ? renderActionDotsIcon() : escHtml(String(title || 'Tools'))}</summary>
        <div class="cgxui-${SkID}-toolbar-pop${iconOnly ? ' is-right' : ''}">${buttons}</div>
      </details>
    `;
  }

  function renderEmpty(msg) {
    if (!S.body) return;
    if (S.titleEl) S.titleEl.textContent = STR.title;
    S.body.innerHTML = `<div class="cgxui-${SkID}-empty">${msg}</div>`;
  }

  function renderEditor(ui) {
    if (!ui.editorOpen) return '';
    const isEdit = ui.editorMode === 'edit';
    const ttl = isEdit ? STR.composerEdit : STR.composerNew;
    return `
      <section class="cgxui-${SkID}-sec">
        <div class="cgxui-${SkID}-editor">
          <div class="cgxui-${SkID}-sec-hd"><div class="cgxui-${SkID}-sec-ttl">${escHtml(ttl)}</div><div class="cgxui-${SkID}-muted">${isEdit ? escHtml(ui.editorId || '') : 'new'}</div></div>
          <div class="cgxui-${SkID}-row" style="margin-bottom:8px;"><input class="cgxui-${SkID}-input" data-drw="editor-title" type="text" placeholder="Title" value="${escHtml(ui.draft.title || '')}"></div>
          <div class="cgxui-${SkID}-row" style="margin-bottom:8px;"><input class="cgxui-${SkID}-input" data-drw="editor-type" type="text" placeholder="Type (e.g. timeline_item, note, task)" value="${escHtml(ui.draft.type || 'artifact')}"></div>
          <div class="cgxui-${SkID}-row" style="margin-bottom:8px;"><textarea class="cgxui-${SkID}-textarea" data-drw="editor-body" placeholder="Artifact content…">${escHtml(ui.draft.body || '')}</textarea></div>
          <div class="cgxui-${SkID}-actions"><button class="cgxui-${SkID}-btn is-primary" type="button" data-drw="editor-save">${isEdit ? STR.update : STR.save}</button><button class="cgxui-${SkID}-btn" type="button" data-drw="editor-cancel">${STR.cancel}</button></div>
        </div>
      </section>
    `;
  }

  function getTimelineUncertaintyLabel(v) {
    const s = String(v || '').toLowerCase().trim();
    if (s === 'exact') return STR.exact;
    if (s === 'approximate' || s === 'indirect') return STR.approximate;
    return STR.unknown;
  }

  function renderActionDotsIcon() {
    return `
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="3" cy="8" r="1.4" fill="currentColor"></circle>
        <circle cx="8" cy="8" r="1.4" fill="currentColor"></circle>
        <circle cx="13" cy="8" r="1.4" fill="currentColor"></circle>
      </svg>
    `;
  }

  function renderArtifactActionMenu({ id, status = 'draft', isPinned = false, isCapsule = false, footClass = 'card-foot', small = false } = {}) {
    const actionSet = isCapsule ? `
      <button class="cgxui-${SkID}-mini-btn is-on" type="button" data-art-insert="${escHtml(String(id || ''))}">${escHtml(STR.insert)}</button>
      <button class="cgxui-${SkID}-mini-btn is-done" type="button" data-art-rerun="${escHtml(String(id || ''))}">${escHtml(STR.rerun)}</button>
    ` : `
      <button class="cgxui-${SkID}-mini-btn ${isPinned ? 'is-on' : ''}" type="button" data-art-pin="${escHtml(String(id || ''))}">${isPinned ? 'Pinned' : 'Pin'}</button>
      <button class="cgxui-${SkID}-mini-btn ${status === 'done' ? 'is-done' : ''}" type="button" data-art-status="${escHtml(String(id || ''))}">${status === 'done' ? 'Mark Draft' : 'Mark Done'}</button>
    `;

    return `
      <div class="cgxui-${SkID}-${footClass}">
        <details class="cgxui-${SkID}-action-menu">
          <summary class="cgxui-${SkID}-mini-btn cgxui-${SkID}-action-toggle${small ? ' is-small' : ''}" aria-label="Artifact actions" title="Artifact actions">${renderActionDotsIcon()}</summary>
          <div class="cgxui-${SkID}-action-pop${isCapsule ? ' is-capsule' : ''}">
            <button class="cgxui-${SkID}-mini-btn" type="button" data-art-edit="${escHtml(String(id || ''))}">Edit</button>
            ${actionSet}
            <button class="cgxui-${SkID}-mini-btn is-danger" type="button" data-art-del="${escHtml(String(id || ''))}">Delete</button>
          </div>
        </details>
      </div>
    `;
  }

  function renderTimelineCard(a) {
    const id = String(a?.id || '');
    const status = String(a?.status || 'draft');
    const isPinned = !!a?.pinned;
    const data = (a?.data && typeof a.data === 'object') ? a.data : {};

    const dateText = String(data?.dateText || '').trim() || 'Undated';
    const actor = String(data?.actorGuess || '').trim();
    const action = String(data?.actionSummary || '').trim() || String(a?.title || '').trim() || '(no summary)';
    const eventType = String(data?.eventType || '').trim();
    const uncertainty = getTimelineUncertaintyLabel(data?.uncertainty);
    const excerpt = String(data?.sourceExcerpt || a?.body || '').trim();

    return `
      <article class="cgxui-${SkID}-tl" data-art-card="${escHtml(id)}">
        <div class="cgxui-${SkID}-tl-top">
          <div class="cgxui-${SkID}-tl-date">${escHtml(dateText)}</div>
          <div class="cgxui-${SkID}-chips is-type-wrap">
            <span class="cgxui-${SkID}-chip is-type">timeline</span>
          </div>
        </div>

        <div class="cgxui-${SkID}-tl-main">
          ${actor ? `<b>${escHtml(actor)}</b>${action ? ` — ${escHtml(action)}` : ''}` : escHtml(action)}
        </div>

        <div class="cgxui-${SkID}-tl-row">
          ${eventType ? `<span class="cgxui-${SkID}-tl-badge">${escHtml(eventType)}</span>` : ''}
          <span class="cgxui-${SkID}-tl-badge is-date">${escHtml(uncertainty)}</span>
          ${String(data?.sourceRole || '').trim() ? `<span class="cgxui-${SkID}-tl-badge">role:${escHtml(String(data.sourceRole))}</span>` : ''}
          <span class="cgxui-${SkID}-tl-badge">${escHtml(getStatusLabel(status))}</span>
          ${String(data?.sourceMsgId || '').trim() ? `<span class="cgxui-${SkID}-tl-badge">src:${escHtml(String(data.sourceMsgId).slice(0, 28))}</span>` : ''}
        </div>

        <div class="cgxui-${SkID}-tl-subline">
          ${excerpt ? `<div class="cgxui-${SkID}-tl-sub">${escHtml(excerpt)}</div>` : '<div></div>'}
          ${renderArtifactActionMenu({ id, status, isPinned, footClass: 'tl-inline-actions', small: true })}
        </div>
      </article>
    `;
  }

  function formatTimelineBucket(ts, dateText) {
    if (ts == null) return STR.undated;
    const d = new Date(ts);
    const month = d.toLocaleString([], { month: 'short' });
    const year = d.getFullYear();

    const raw = String(dateText || '').toLowerCase();
    if (/\bearly\b|\bmid\b|\blate\b|\baround\b|\bsecond week\b|\bfirst week\b|\bthird week\b/.test(raw)) {
      return `${month} ${year} · ${STR.approximate}`;
    }

    return `${month} ${year}`;
  }

  function buildTimelineStats(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    const parsed = arr
      .map((x) => ({
        item: x,
        ts: parseTimelineDateText(x?.data?.dateText || ''),
        dateText: String(x?.data?.dateText || '').trim(),
        uncertainty: String(x?.data?.uncertainty || '').trim(),
        actor: String(x?.data?.actorGuess || '').trim(),
        eventType: String(x?.data?.eventType || '').trim(),
        body: String(x?.body || '').trim(),
      }));

    const dated = parsed.filter(x => x.ts != null).sort((a, b) => a.ts - b.ts);
    const exactCount = parsed.filter(x => String(x.uncertainty).toLowerCase() === 'exact').length;
    const approximateCount = parsed.filter(x => {
      const u = String(x.uncertainty).toLowerCase();
      return u === 'approximate' || u === 'indirect';
    }).length;
    const undatedCount = parsed.filter(x => x.ts == null).length;
    const missingActorCount = parsed.filter(x => !x.actor).length;
    const weakGranularityCount = parsed.filter(x => x.body.length > 220).length;

    const actorSet = new Set(parsed.map(x => x.actor).filter(Boolean));

    const eventTypeCounts = Object.create(null);
    for (const x of parsed) {
      const k = x.eventType || 'event';
      eventTypeCounts[k] = (eventTypeCounts[k] || 0) + 1;
    }

    const topEventTypes = Object.entries(eventTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    const duplicateCount = detectTimelineDuplicates(arr).length;

    return {
      count: arr.length,
      exactCount,
      approximateCount,
      undatedCount,
      missingActorCount,
      weakGranularityCount,
      duplicateCount,
      distinctActors: actorSet.size,
      firstDated: dated[0] || null,
      lastDated: dated[dated.length - 1] || null,
      topEventTypes,
    };
  }

  function normDupText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9äöüß:/.\- ]+/gi, ' ')
      .trim();
  }

  function tokeniseDupText(s) {
    return Array.from(new Set(
      normDupText(s)
        .split(/\s+/)
        .map(x => x.trim())
        .filter(x => x && x.length >= 4)
    ));
  }

  function timelineSimilarity(a, b) {
    const ad = String(a?.data?.dateText || '').trim().toLowerCase();
    const bd = String(b?.data?.dateText || '').trim().toLowerCase();
    const aa = String(a?.data?.actorGuess || '').trim().toLowerCase();
    const ba = String(b?.data?.actorGuess || '').trim().toLowerCase();
    const as = String(a?.data?.actionSummary || a?.body || '').trim();
    const bs = String(b?.data?.actionSummary || b?.body || '').trim();

    let score = 0;
    if (ad && bd && ad === bd) score += 0.38;
    if (aa && ba && aa === ba) score += 0.28;

    const at = tokeniseDupText(as);
    const bt = tokeniseDupText(bs);
    const bSet = new Set(bt);
    const overlap = at.filter(x => bSet.has(x));
    const union = new Set([...at, ...bt]).size || 1;
    const jaccard = overlap.length / union;

    score += Math.min(0.34, jaccard * 0.6);

    return {
      score: Number(Math.min(1, score).toFixed(2)),
      overlap,
      jaccard: Number(jaccard.toFixed(2)),
    };
  }

  function detectTimelineDuplicates(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    const out = [];

    for (let i = 0; i < arr.length; i += 1) {
      for (let j = i + 1; j < arr.length; j += 1) {
        const a = arr[i];
        const b = arr[j];
        const sim = timelineSimilarity(a, b);

        if (sim.score >= 0.68) {
          out.push({
            a,
            b,
            score: sim.score,
            overlap: sim.overlap.slice(0, 8),
          });
        }
      }
    }

    return out
      .sort((x, y) => y.score - x.score)
      .slice(0, 8);
  }

  function renderTimelineDuplicates(rows, ui) {
    const pairs = detectTimelineDuplicates(rows);
    if (!pairs.length) return '';

    return renderCollapsibleSection({
      ui,
      key: 'timelineDuplicates',
      title: STR.duplicatePairs,
      sideText: String(pairs.length),
      body: `
      <section class="cgxui-${SkID}-tl-dup">
        <div class="cgxui-${SkID}-tl-dup-list">
          ${pairs.map((pair) => `
            <div class="cgxui-${SkID}-tl-dup-row">
              <div class="cgxui-${SkID}-tl-dup-top">
                <div>${escHtml(STR.possibleDuplicate)}</div>
                <div class="cgxui-${SkID}-tl-dup-score">${escHtml(pair.score.toFixed(2))}</div>
              </div>
              <div class="cgxui-${SkID}-tl-dup-body">
                A: ${escHtml(String(pair.a?.title || pair.a?.data?.actionSummary || '').trim())}<br>
                B: ${escHtml(String(pair.b?.title || pair.b?.data?.actionSummary || '').trim())}
                ${pair.overlap.length ? `<br>Overlap: ${escHtml(pair.overlap.join(', '))}` : ''}
                <div class="cgxui-${SkID}-tl-actions">
                  <button class="cgxui-${SkID}-mini-btn" type="button" data-tl-refine-a="${escHtml(String(pair.a?.id || ''))}" data-tl-refine-b="${escHtml(String(pair.b?.id || ''))}">${escHtml(STR.refine)}</button>
                  <button class="cgxui-${SkID}-mini-btn is-done" type="button" data-tl-merge-a="${escHtml(String(pair.a?.id || ''))}" data-tl-merge-b="${escHtml(String(pair.b?.id || ''))}">${escHtml(STR.merge)}</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `,
    });
  }

  function chooseBetterText(a, b) {
    const aa = String(a || '').trim();
    const bb = String(b || '').trim();
    if (!aa) return bb;
    if (!bb) return aa;
    return aa.length <= bb.length ? aa : bb;
  }

  function chooseBetterEventType(a, b) {
    const rank = { decision: 6, appeal: 5, meeting: 4, email: 4, submission: 4, minutes: 3, portal_status: 3, acknowledgment: 2, event: 1 };
    const aa = String(a || '').trim();
    const bb = String(b || '').trim();
    return (rank[bb] || 0) > (rank[aa] || 0) ? bb : aa;
  }

  function chooseBetterUncertainty(a, b) {
    const rank = { exact: 3, approximate: 2, indirect: 1, unknown: 0 };
    const aa = String(a || 'unknown').trim();
    const bb = String(b || 'unknown').trim();
    return (rank[bb] || 0) > (rank[aa] || 0) ? bb : aa;
  }

  function buildMergedTimelinePatch(a, b) {
    const ad = (a?.data && typeof a.data === 'object') ? a.data : {};
    const bd = (b?.data && typeof b.data === 'object') ? b.data : {};

    const dateText = chooseBetterText(ad.dateText, bd.dateText);
    const actorGuess = chooseBetterText(ad.actorGuess, bd.actorGuess);
    const actionSummary = chooseBetterText(ad.actionSummary, bd.actionSummary);
    const eventType = chooseBetterEventType(ad.eventType, bd.eventType);
    const uncertainty = chooseBetterUncertainty(ad.uncertainty, bd.uncertainty);
    const sourceExcerpt = chooseBetterText(ad.sourceExcerpt, bd.sourceExcerpt);
    const rawText = [ad.rawText, bd.rawText].filter(Boolean).join('\n\n');
    const mergedSourceRefs = [...(a?.sourceRefs || []), ...(b?.sourceRefs || [])].slice(0, 12);
    const mergedTags = Array.from(new Set([...(a?.tags || []), ...(b?.tags || []), 'merged']));

    return {
      type: 'timeline_item',
      title: `${dateText ? `${dateText} - ` : ''}${actorGuess ? `${actorGuess}: ` : ''}${String(actionSummary || 'Merged event').slice(0, 80)}`,
      body: chooseBetterText(a?.body, b?.body),
      status: 'draft',
      tags: mergedTags,
      sourceRefs: mergedSourceRefs,
      data: {
        ...ad,
        ...bd,
        dateText,
        actorGuess,
        actionSummary,
        eventType,
        uncertainty,
        sourceExcerpt,
        rawText,
      },
    };
  }

  function archiveTimelineArtifact(item, mergedIntoId, mode) {
    if (!item?.id) return false;
    const data = (item?.data && typeof item.data === 'object') ? item.data : {};
    return safe(() => S.api?.updateArtifact?.(item.id, {
      status: 'archived',
      data: {
        ...data,
        mergedInto: mergedIntoId || '',
        mergeMode: mode || 'refine',
        supersededAt: Date.now(),
      },
    }), false);
  }

  function refineTimelinePair(aId, bId) {
    const a = safe(() => S.api?.getArtifact?.(aId), null);
    const b = safe(() => S.api?.getArtifact?.(bId), null);
    if (!a || !b) return false;

    const keep = a;
    const other = b;
    const patch = buildMergedTimelinePatch(keep, other);

    const ok1 = safe(() => S.api?.updateArtifact?.(keep.id, {
      ...patch,
      data: {
        ...(patch.data || {}),
        refinedFrom: [keep.id, other.id],
        refinedAt: Date.now(),
      },
    }), false);

    const ok2 = archiveTimelineArtifact(other, keep.id, 'refine');
    rerender();
    return !!(ok1 && ok2);
  }

  function mergeTimelinePair(aId, bId) {
    const a = safe(() => S.api?.getArtifact?.(aId), null);
    const b = safe(() => S.api?.getArtifact?.(bId), null);
    if (!a || !b) return false;

    const merged = buildMergedTimelinePatch(a, b);
    const created = safe(() => S.api?.saveArtifact?.({
      ...merged,
      data: {
        ...(merged.data || {}),
        mergedFrom: [a.id, b.id],
        mergedAt: Date.now(),
      },
    }), null);

    if (!created?.id) return false;

    archiveTimelineArtifact(a, created.id, 'merge');
    archiveTimelineArtifact(b, created.id, 'merge');
    rerender();
    return true;
  }

  function groupTimelineRows(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    const groups = Object.create(null);

    for (const item of arr) {
      const dateText = String(item?.data?.dateText || '').trim();
      const ts = parseTimelineDateText(dateText);
      const bucket = formatTimelineBucket(ts, dateText);

      if (!groups[bucket]) groups[bucket] = [];
      groups[bucket].push(item);
    }

    const orderedKeys = Object.keys(groups).sort((a, b) => {
      if (a === STR.undated) return 1;
      if (b === STR.undated) return -1;

      const aFirst = groups[a][0];
      const bFirst = groups[b][0];
      const at = parseTimelineDateText(aFirst?.data?.dateText || '');
      const bt = parseTimelineDateText(bFirst?.data?.dateText || '');

      if (at != null && bt != null) return at - bt;
      if (at != null) return -1;
      if (bt != null) return 1;
      return a.localeCompare(b);
    });

    return orderedKeys.map((key) => ({
      key,
      items: groups[key],
    }));
  }

  function renderTimelineSummary(stats, ui) {
    return renderCollapsibleSection({
      ui,
      key: 'timelineSummary',
      title: 'Summary',
      sideText: String(stats.count),
      body: `
      <section class="cgxui-${SkID}-tl-summary">
        <div class="cgxui-${SkID}-tl-chips">
          <span class="cgxui-${SkID}-tl-chip">${escHtml(String(stats.count))} events</span>
          <span class="cgxui-${SkID}-tl-chip">${escHtml(STR.exactCount)}: ${escHtml(String(stats.exactCount))}</span>
          <span class="cgxui-${SkID}-tl-chip">${escHtml(STR.approximateCount)}: ${escHtml(String(stats.approximateCount))}</span>
          <span class="cgxui-${SkID}-tl-chip">${escHtml(STR.actorsCount)}: ${escHtml(String(stats.distinctActors))}</span>
          ${stats.firstDated ? `<span class="cgxui-${SkID}-tl-chip">${escHtml(STR.firstEvent)}: ${escHtml(String(stats.firstDated.dateText || ''))}</span>` : ''}
          ${stats.lastDated ? `<span class="cgxui-${SkID}-tl-chip">${escHtml(STR.lastEvent)}: ${escHtml(String(stats.lastDated.dateText || ''))}</span>` : ''}
          ${stats.topEventTypes.map(([k, v]) => `<span class="cgxui-${SkID}-tl-chip">${escHtml(k)}: ${escHtml(String(v))}</span>`).join('')}
        </div>
      </section>
    `,
    });
  }

  function renderTimelineWarnings(stats, ui) {
    const warnings = [];
    if (stats.undatedCount > 0) warnings.push(`${STR.undated}: ${stats.undatedCount}`);
    if (stats.missingActorCount > 0) warnings.push(`Missing actor: ${stats.missingActorCount}`);
    if (stats.weakGranularityCount > 0) warnings.push(`Weak granularity: ${stats.weakGranularityCount}`);
    if (stats.duplicateCount > 0) warnings.push(`Possible duplicates: ${stats.duplicateCount}`);

    if (!warnings.length) return '';

    return renderCollapsibleSection({
      ui,
      key: 'timelineWarnings',
      title: STR.timelineWarnings,
      sideText: String(warnings.length),
      body: `
      <section class="cgxui-${SkID}-tl-warnings">
        <div class="cgxui-${SkID}-tl-chips">
          ${warnings.map(x => `<span class="cgxui-${SkID}-tl-chip">${escHtml(x)}</span>`).join('')}
        </div>
      </section>
    `,
    });
  }

  function renderTimelineGroups(rows) {
    const groups = groupTimelineRows(rows);

    return groups.map((group) => renderCollapsibleSection({
      ui: getDrawerUiState(),
      key: makeSectionKey('timelineGroup', group.key),
      title: group.key,
      sideText: String(group.items.length),
      body: `
        <section class="cgxui-${SkID}-tl-group">
          <div class="cgxui-${SkID}-tl-group-list">
            ${group.items.map(renderTimelineCard).join('')}
          </div>
        </section>
      `,
    })).join('');
  }

  function renderArtifactList(rows, ui) {
    const arr = Array.isArray(rows) ? rows : [];
    if (!arr.length) return `<div class="cgxui-${SkID}-empty">${escHtml(STR.emptyNoArtifacts)}</div>`;

    if (String(ui?.type || '') === 'timeline_item') {
      const stats = buildTimelineStats(arr);
      return `
        <div class="cgxui-${SkID}-timeline-stack">
          ${renderTimelineSummary(stats, ui)}
          ${renderTimelineWarnings(stats, ui)}
          ${renderTimelineDuplicates(arr, ui)}
          ${renderTimelineGroups(arr)}
        </div>
      `;
    }

    return arr.map(renderArtifactCard).join('');
  }

  function renderArtifactCard(a) {
    const id = String(a?.id || '');
    const title = String(a?.title || '').trim() || '(untitled)';
    const type = String(a?.type || 'artifact');
    const status = String(a?.status || 'draft');
    const created = formatDate(a?.createdAt);
    const updated = formatDate(a?.updatedAt);
    const tags = Array.isArray(a?.tags) ? a.tags : [];
    const isPinned = !!a?.pinned;
    const body = String(a?.body || '').trim();
    const data = (a?.data && typeof a.data === 'object') ? a.data : {};
    const isCapsule = type === 'prompt_capsule';
    const usedMeta = String(formatUsedMeta(a) || '');
    const typeLabel = getArtifactTypeLabel(type);

    const subLine = isCapsule
      ? `${STR.capsule} · ${escHtml(getStatusLabel(status))}${updated ? ` · ${escHtml(updated)}` : created ? ` · ${escHtml(created)}` : ''}`
      : `${escHtml(typeLabel)} · ${escHtml(getStatusLabel(status))}${updated ? ` · ${escHtml(updated)}` : created ? ` · ${escHtml(created)}` : ''}`;

    const capsuleMeta = isCapsule ? `
      <div class="cgxui-${SkID}-meta is-capsule">
        ${data.intent ? `<span class="cgxui-${SkID}-tag is-capsule">intent:${escHtml(String(data.intent))}</span>` : ''}
        ${data.targetArtifactType ? `<span class="cgxui-${SkID}-tag is-capsule">target:${escHtml(String(data.targetArtifactType))}</span>` : ''}
        ${Number.isFinite(data.confidenceBefore) ? `<span class="cgxui-${SkID}-tag is-capsule">confBefore:${escHtml(String(data.confidenceBefore))}</span>` : ''}
        ${data.promptTemplateId ? `<span class="cgxui-${SkID}-tag is-capsule">tpl:${escHtml(String(data.promptTemplateId))}</span>` : ''}
        ${data.sendMode ? `<span class="cgxui-${SkID}-tag is-capsule">send:${escHtml(String(data.sendMode))}</span>` : ''}
      </div>
    ` : `
      <div class="cgxui-${SkID}-card-meta-line">
        <div class="cgxui-${SkID}-meta">
          ${a?.packId ? `<span class="cgxui-${SkID}-tag">pack:${escHtml(a.packId)}</span>` : ''}
          ${a?.moduleId ? `<span class="cgxui-${SkID}-tag">module:${escHtml(a.moduleId)}</span>` : ''}
          ${tags.map(t => `<span class="cgxui-${SkID}-tag is-hash">#${escHtml(t)}</span>`).join('')}
          ${Number.isFinite(a?.confidence) ? `<span class="cgxui-${SkID}-tag">conf:${escHtml(String(a.confidence))}</span>` : ''}
        </div>
        ${renderArtifactActionMenu({ id, status, isPinned, isCapsule, footClass: 'meta-actions', small: true })}
      </div>
    `;

    return `
      <article class="cgxui-${SkID}-card${isCapsule ? ' is-capsule' : ''}" data-art-card="${escHtml(id)}">
        <div class="cgxui-${SkID}-card-top">
          <div>
            <div class="cgxui-${SkID}-card-ttl">${escHtml(title)}</div>
            <div class="cgxui-${SkID}-card-sub">${subLine}</div>
          </div>
          <div class="cgxui-${SkID}-chips${isCapsule ? ' is-nowrap' : ' is-type-wrap'}">
            <span class="cgxui-${SkID}-chip${isCapsule ? ' is-capsule' : ' is-type'}">${escHtml(isCapsule ? STR.capsule : typeLabel)}</span>
          </div>
        </div>

        ${body ? `<div class="cgxui-${SkID}-card-body${isCapsule ? ' is-capsule' : ''}">${escHtml(body)}</div>` : ''}

        ${capsuleMeta}
        ${String(a?.type || '') === 'prompt_capsule' && usedMeta ? `<div class="cgxui-${SkID}-substate">${escHtml(usedMeta)}</div>` : ''}
        ${isCapsule ? renderArtifactActionMenu({ id, status, isPinned, isCapsule, footClass: 'card-foot' }) : ''}
      </article>
    `;
  }

  function renderDrawer() {
    if (!S.api) return renderEmpty(STR.emptyNoCore);
    if (!S.root || !S.body) return renderEmpty(STR.emptyNoShell);
    if (!isDrawerPane()) return;
    if (S.titleEl) S.titleEl.textContent = STR.title;

    const ui = getDrawerUiState();
    const all = getArtifactsAll();
    const types = getArtifactTypes(all);
    const rows = sortArtifactsForDisplay(getFilteredArtifacts(), ui);
    const profile = safe(() => S.api?.getChatProfile?.(), {}) || {};
    const activePackIds = Array.isArray(profile?.activePackIds) ? profile.activePackIds : [];

    const timelineToolbarMenu = ui.type === 'timeline_item'
      ? renderToolbarActionMenu(STR.timelineTools, [
        { action: 'copy-compact-timeline', label: STR.copyCompactTimeline },
        { action: 'copy-timeline', label: STR.copyTimeline },
        { action: 'export-timeline', label: STR.exportTimeline },
        { action: 'narrative-prompt', label: STR.narrativePrompt, primary: true },
        { action: 'legal-issues-prompt', label: STR.legalIssuesPrompt },
        { action: 'contradictions-prompt', label: STR.contradictionsPrompt },
      ], { iconOnly: true })
      : '';

    const contextBody = `
      <div class="cgxui-${SkID}-chips">
        <span class="cgxui-${SkID}-chip">chat artifacts: ${escHtml(String(all.length))}</span>
        <span class="cgxui-${SkID}-chip">active packs: ${escHtml(String(activePackIds.length))}</span>
        ${profile?.prefs?.primaryPackId ? `<span class="cgxui-${SkID}-chip">primary: ${escHtml(profile.prefs.primaryPackId)}</span>` : ''}
        ${ui.type === 'timeline_item' ? `<span class="cgxui-${SkID}-chip">sorted: date ↑</span>` : ''}
        <span class="cgxui-${SkID}-chip">archived: ${ui.showArchived ? 'shown' : 'hidden'}</span>
        ${ui.type === 'timeline_item' ? `<span class="cgxui-${SkID}-chip">export: timeline-ready</span>` : ''}
        ${ui.type === 'timeline_item' ? `<span class="cgxui-${SkID}-chip">batch: compact + narrative</span>` : ''}
        ${ui.type === 'timeline_item' ? `<span class="cgxui-${SkID}-chip">prompt: issues + contradictions</span>` : ''}
        ${ui.type === 'legal_claim' ? `<span class="cgxui-${SkID}-chip">batch: claims -> analysis/evidence</span>` : ''}
        ${ui.type === 'legal_contradiction' ? `<span class="cgxui-${SkID}-chip">batch: contradictions -> analysis/reconcile</span>` : ''}
        ${ui.type === 'legal_actor' ? `<span class="cgxui-${SkID}-chip">batch: actors -> stakeholder/responsibility/risk</span>` : ''}
        <span class="cgxui-${SkID}-chip">builder: cross-artifact</span>
        <span class="cgxui-${SkID}-chip">builder preset: ${escHtml(getPresetLabel(ui.builder?.preset || 'issue-spotting'))}</span>
      </div>
    `;

    S.body.innerHTML = `
      <div class="cgxui-${SkID}-bar">
        <div class="cgxui-${SkID}-row">
          <input class="cgxui-${SkID}-search" data-drw="search" type="text" placeholder="${escHtml(STR.searchPh)}" value="${escHtml(ui.q || '')}">
        </div>
        <div class="cgxui-${SkID}-row">
          <select class="cgxui-${SkID}-select" data-drw="type">
            <option value="all"${ui.type === 'all' ? ' selected' : ''}>All types</option>
            ${types.map(t => `<option value="${escHtml(t)}"${ui.type === t ? ' selected' : ''}>${escHtml(getArtifactTypeLabel(t))}</option>`).join('')}
          </select>
          <button class="cgxui-${SkID}-btn" type="button" data-drw="toggle-archived">${ui.showArchived ? escHtml(STR.hideArchived) : escHtml(STR.showArchived)}</button>
          ${ui.type === 'legal_claim' ? `<button class="cgxui-${SkID}-btn" type="button" data-drw="copy-compact-claims">${escHtml(STR.copyCompactClaims)}</button>` : ''}
          ${ui.type === 'legal_claim' ? `<button class="cgxui-${SkID}-btn is-primary" type="button" data-drw="claim-analysis-prompt">${escHtml(STR.claimAnalysisPrompt)}</button>` : ''}
          ${ui.type === 'legal_claim' ? `<button class="cgxui-${SkID}-btn" type="button" data-drw="claim-evidence-prompt">${escHtml(STR.claimEvidencePrompt)}</button>` : ''}
          ${ui.type === 'legal_contradiction' ? `<button class="cgxui-${SkID}-btn" type="button" data-drw="copy-compact-contradictions">${escHtml(STR.copyCompactContradictions)}</button>` : ''}
          ${ui.type === 'legal_contradiction' ? `<button class="cgxui-${SkID}-btn is-primary" type="button" data-drw="contradiction-analysis-prompt">${escHtml(STR.contradictionAnalysisPrompt)}</button>` : ''}
          ${ui.type === 'legal_contradiction' ? `<button class="cgxui-${SkID}-btn" type="button" data-drw="reconciliation-prompt">${escHtml(STR.reconciliationPrompt)}</button>` : ''}
          ${ui.type === 'legal_actor' ? `<button class="cgxui-${SkID}-btn" type="button" data-drw="copy-compact-actors">${escHtml(STR.copyCompactActors)}</button>` : ''}
          ${ui.type === 'legal_actor' ? `<button class="cgxui-${SkID}-btn is-primary" type="button" data-drw="stakeholder-map-prompt">${escHtml(STR.stakeholderMapPrompt)}</button>` : ''}
          ${ui.type === 'legal_actor' ? `<button class="cgxui-${SkID}-btn" type="button" data-drw="responsibility-prompt">${escHtml(STR.responsibilityPrompt)}</button>` : ''}
          ${ui.type === 'legal_actor' ? `<button class="cgxui-${SkID}-btn" type="button" data-drw="leverage-risk-prompt">${escHtml(STR.leverageRiskPrompt)}</button>` : ''}
          <button class="cgxui-${SkID}-btn is-primary" type="button" data-drw="new">New</button>
          <button class="cgxui-${SkID}-btn" type="button" data-drw="export">${STR.export}</button>
          ${timelineToolbarMenu}
        </div>
      </div>
      ${renderPromptBuilder(ui)}
      ${renderEditor(ui)}
      ${renderCollapsibleSection({ ui, key: 'context', title: 'Context', sideText: `${rows.length}/${all.length}`, body: contextBody })}
      ${renderCollapsibleSection({ ui, key: 'artifacts', title: ui.type === 'timeline_item' ? STR.timelineView : 'Artifacts', sideText: String(rows.length), body: `<div class="cgxui-${SkID}-list">${renderArtifactList(rows, ui)}</div>` })}
    `;
    wireBody();
  }

  function readEditorValues() {
    if (!S.body) return null;
    const titleEl = q('[data-drw="editor-title"]', S.body);
    const typeEl = q('[data-drw="editor-type"]', S.body);
    const bodyEl = q('[data-drw="editor-body"]', S.body);
    return { title: String(titleEl?.value || '').trim(), type: String(typeEl?.value || 'artifact').trim() || 'artifact', body: String(bodyEl?.value || '').trim() };
  }

  function saveEditor() {
    const ui = getDrawerUiState();
    const vals = readEditorValues();
    if (!vals) return;
    const profile = safe(() => S.api?.getChatProfile?.(), {}) || {};
    const packId = String(ui?.draft?.packId || '') || String(profile?.prefs?.primaryPackId || '') || String((Array.isArray(profile?.activePackIds) ? profile.activePackIds[0] : '') || '');
    if (ui.editorMode === 'edit' && ui.editorId) {
      safe(() => S.api?.updateArtifact?.(ui.editorId, { title: vals.title, type: vals.type, body: vals.body, packId }));
    } else {
      safe(() => S.api?.saveArtifact?.({ type: vals.type, title: vals.title, body: vals.body, packId, moduleId: '', status: 'draft' }));
    }
    resetEditor();
    rerender();
  }

  function togglePinned(id) { const art = safe(() => S.api?.getArtifact?.(id), null); if (!art) return; safe(() => S.api?.updateArtifact?.(id, { pinned: !art.pinned })); rerender(); }
  function toggleStatus(id) { const art = safe(() => S.api?.getArtifact?.(id), null); if (!art) return; const next = String(art.status || 'draft') === 'done' ? 'draft' : 'done'; safe(() => S.api?.updateArtifact?.(id, { status: next })); rerender(); }
  function removeArtifact(id) { safe(() => S.api?.removeArtifact?.(id)); rerender(); }
  function exportArtifacts() {
    const raw = safe(() => S.api?.exportArtifactsJSON?.(), ''); if (!raw) return;
    try {
      const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = D.createElement('a');
      a.href = url; a.download = `workspace-artifacts-${Date.now()}.json`;
      D.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (_) {}
  }

  function getCurrentTimelineRowsForExport() {
    const ui = getDrawerUiState();
    const rows = sortArtifactsForDisplay(getFilteredArtifacts(), ui);
    if (String(ui?.type || '') !== 'timeline_item') return [];
    return Array.isArray(rows) ? rows : [];
  }

  function buildTimelinePlainText(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    return arr.map((a, idx) => {
      const data = (a?.data && typeof a.data === 'object') ? a.data : {};
      const dateText = String(data?.dateText || '').trim() || STR.undated;
      const actor = String(data?.actorGuess || '').trim();
      const action = String(data?.actionSummary || '').trim() || String(a?.title || '').trim() || '(no summary)';
      const eventType = String(data?.eventType || '').trim();
      const uncertainty = String(data?.uncertainty || '').trim();
      const excerpt = String(data?.sourceExcerpt || a?.body || '').trim();

      const parts = [];
      parts.push(`${idx + 1}. ${dateText}`);
      if (actor) parts.push(`Actor: ${actor}`);
      parts.push(`Action: ${action}`);
      if (eventType) parts.push(`Type: ${eventType}`);
      if (uncertainty) parts.push(`Uncertainty: ${uncertainty}`);
      if (excerpt) parts.push(`Source: ${excerpt}`);

      return parts.join('\n');
    }).join('\n\n');
  }

  function buildCompactTimelineText(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    return arr.map((a, idx) => {
      const data = (a?.data && typeof a.data === 'object') ? a.data : {};
      const dateText = String(data?.dateText || '').trim() || STR.undated;
      const actor = String(data?.actorGuess || '').trim();
      const action = String(data?.actionSummary || '').trim() || String(a?.title || '').trim() || '(no summary)';

      return `${idx + 1}. ${dateText}${actor ? ` - ${actor}` : ''}${action ? ` - ${action}` : ''}`;
    }).join('\n');
  }

  function buildTimelineNarrativePrompt(rows) {
    const compact = buildCompactTimelineText(rows);
    if (!compact.trim()) return '';

    return [
      'Using only the timeline events below, write a clean, chronological narrative of the case.',
      'Requirements:',
      '1. Keep the original order of events by date.',
      '2. Do not invent facts, names, motives, or missing links.',
      '3. If a date is approximate or uncertain, keep that uncertainty visible.',
      '4. Write in a formal, clear case-summary style.',
      '5. End with a short list of the main unresolved issues or ambiguities.',
      '',
      'Timeline events:',
      compact,
    ].join('\n');
  }

  function buildTimelineLegalIssuesPrompt(rows) {
    const compact = buildCompactTimelineText(rows);
    if (!compact.trim()) return '';

    return [
      'Using only the timeline events below, identify the main legal/procedural issues raised by this case.',
      'Requirements:',
      '1. Do not invent facts, missing documents, or motives.',
      '2. Base every issue only on the timeline provided.',
      '3. Separate clearly between facts, possible issues, and uncertainties.',
      '4. For each issue, explain which timeline events support it.',
      '5. Focus on things like: contradictory guidance, missing formal decision, unclear communication, timeline gaps, procedural unfairness, service/non-service, accommodation handling, and classification of decisions.',
      '6. End with a short prioritized list of the strongest issues.',
      '',
      'Timeline events:',
      compact,
    ].join('\n');
  }

  function buildTimelineContradictionsPrompt(rows) {
    const compact = buildCompactTimelineText(rows);
    if (!compact.trim()) return '';

    return [
      'Using only the timeline events below, identify possible contradictions, inconsistencies, or category-confusions in the case.',
      'Requirements:',
      '1. Do not invent facts or contradictions not grounded in the timeline.',
      '2. Look for conflicting statements, shifting positions, mixed signals, and unclear legal/administrative categories.',
      '3. For each possible contradiction, show:',
      '   - statement/event A',
      '   - statement/event B',
      '   - why they may conflict',
      '   - whether the conflict is direct, partial, or only possible',
      '4. Distinguish between proven contradiction and unresolved ambiguity.',
      '5. End with the strongest contradiction pairs first.',
      '',
      'Timeline events:',
      compact,
    ].join('\n');
  }

  async function copyTimelineText() {
    const rows = getCurrentTimelineRowsForExport();
    if (!rows.length) return false;

    const text = buildTimelinePlainText(rows);
    if (!text) return false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    try {
      const ta = D.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      D.body.appendChild(ta);
      ta.select();
      D.execCommand('copy');
      ta.remove();
      return true;
    } catch (_) {}

    return false;
  }

  async function copyCompactTimelineText() {
    const rows = getCurrentTimelineRowsForExport();
    if (!rows.length) return false;

    const text = buildCompactTimelineText(rows);
    if (!text) return false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    try {
      const ta = D.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      D.body.appendChild(ta);
      ta.select();
      D.execCommand('copy');
      ta.remove();
      return true;
    } catch (_) {}

    return false;
  }

  function insertTimelineNarrativePrompt() {
    const rows = getCurrentTimelineRowsForExport();
    if (!rows.length) return false;

    const text = buildTimelineNarrativePrompt(rows);
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function insertTimelineLegalIssuesPrompt() {
    const rows = getCurrentTimelineRowsForExport();
    if (!rows.length) return false;

    const text = buildTimelineLegalIssuesPrompt(rows);
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function insertTimelineContradictionsPrompt() {
    const rows = getCurrentTimelineRowsForExport();
    if (!rows.length) return false;

    const text = buildTimelineContradictionsPrompt(rows);
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function getCurrentRowsForType(typeName) {
    const ui = getDrawerUiState();
    const rows = sortArtifactsForDisplay(getFilteredArtifacts(), ui);
    if (String(ui?.type || '') !== String(typeName || '')) return [];
    return Array.isArray(rows) ? rows : [];
  }

  function buildCompactClaimsText(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    return arr.map((a, idx) => {
      const data = (a?.data && typeof a.data === 'object') ? a.data : {};
      const title = String(a?.title || '').trim();
      const body = String(a?.body || '').trim();
      const claimKind = String(data?.claimKind || '').trim();
      const sourceRole = String(data?.sourceRole || '').trim();
      return `${idx + 1}. ${title || '(untitled claim)'}${claimKind ? ` | kind: ${claimKind}` : ''}${sourceRole ? ` | role: ${sourceRole}` : ''}${body ? `\n   ${body}` : ''}`;
    }).join('\n\n');
  }

  function buildCompactContradictionsText(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    return arr.map((a, idx) => {
      const data = (a?.data && typeof a.data === 'object') ? a.data : {};
      const title = String(a?.title || '').trim();
      const relation = String(data?.relation || '').trim();
      const score = Number(data?.score || 0);
      const reasons = Array.isArray(data?.reasons) ? data.reasons.join('; ') : '';
      const body = String(a?.body || '').trim();

      return `${idx + 1}. ${title || '(untitled contradiction)'}${relation ? ` | relation: ${relation}` : ''}${score ? ` | score: ${score}` : ''}${reasons ? `\n   Reasons: ${reasons}` : ''}${body ? `\n   ${body}` : ''}`;
    }).join('\n\n');
  }

  function buildClaimAnalysisPrompt(rows) {
    const compact = buildCompactClaimsText(rows);
    if (!compact.trim()) return '';

    return [
      'Using only the claim artifacts below, analyze the case claims in a structured legal/procedural way.',
      'Requirements:',
      '1. Group claims by theme or issue.',
      '2. Separate facts from assertions and from interpretations.',
      '3. Identify which claims appear strongest, weakest, or incomplete.',
      '4. Do not invent missing facts or documents.',
      '5. End with the top unresolved questions.',
      '',
      'Claim artifacts:',
      compact,
    ].join('\n');
  }

  function buildClaimEvidencePrompt(rows) {
    const compact = buildCompactClaimsText(rows);
    if (!compact.trim()) return '';

    return [
      'Using only the claim artifacts below, identify what evidence would support, weaken, or clarify each claim.',
      'Requirements:',
      '1. For each claim, state what kind of evidence would be relevant.',
      '2. Distinguish between evidence already implied and evidence still missing.',
      '3. Do not invent documents or testimony.',
      '4. End with the claims that most urgently need evidence clarification.',
      '',
      'Claim artifacts:',
      compact,
    ].join('\n');
  }

  function buildContradictionAnalysisPrompt(rows) {
    const compact = buildCompactContradictionsText(rows);
    if (!compact.trim()) return '';

    return [
      'Using only the contradiction artifacts below, analyze the strongest contradictions and ambiguities in the case.',
      'Requirements:',
      '1. Separate direct contradictions from partial conflicts and unresolved ambiguity.',
      '2. Explain why each pair conflicts.',
      '3. Identify which contradictions matter most procedurally or legally.',
      '4. Do not invent facts outside the listed contradiction artifacts.',
      '',
      'Contradiction artifacts:',
      compact,
    ].join('\n');
  }

  function buildReconciliationPrompt(rows) {
    const compact = buildCompactContradictionsText(rows);
    if (!compact.trim()) return '';

    return [
      'Using only the contradiction artifacts below, propose the minimum factual clarifications needed to reconcile or resolve each contradiction.',
      'Requirements:',
      '1. Do not invent resolutions as facts.',
      '2. For each contradiction, state what exact clarification or document would resolve it.',
      '3. Distinguish between contradictions that may be reconcilable and those that are probably not.',
      '4. End with the most important clarification requests.',
      '',
      'Contradiction artifacts:',
      compact,
    ].join('\n');
  }

  async function copyCompactClaimsText() {
    const rows = getCurrentRowsForType('legal_claim');
    if (!rows.length) return false;

    const text = buildCompactClaimsText(rows);
    if (!text) return false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    try {
      const ta = D.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      D.body.appendChild(ta);
      ta.select();
      D.execCommand('copy');
      ta.remove();
      return true;
    } catch (_) {}

    return false;
  }

  async function copyCompactContradictionsText() {
    const rows = getCurrentRowsForType('legal_contradiction');
    if (!rows.length) return false;

    const text = buildCompactContradictionsText(rows);
    if (!text) return false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    try {
      const ta = D.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      D.body.appendChild(ta);
      ta.select();
      D.execCommand('copy');
      ta.remove();
      return true;
    } catch (_) {}

    return false;
  }

  function insertClaimAnalysisPrompt() {
    const rows = getCurrentRowsForType('legal_claim');
    if (!rows.length) return false;

    const text = buildClaimAnalysisPrompt(rows);
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function insertClaimEvidencePrompt() {
    const rows = getCurrentRowsForType('legal_claim');
    if (!rows.length) return false;

    const text = buildClaimEvidencePrompt(rows);
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function insertContradictionAnalysisPrompt() {
    const rows = getCurrentRowsForType('legal_contradiction');
    if (!rows.length) return false;

    const text = buildContradictionAnalysisPrompt(rows);
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function insertReconciliationPrompt() {
    const rows = getCurrentRowsForType('legal_contradiction');
    if (!rows.length) return false;

    const text = buildReconciliationPrompt(rows);
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function buildCompactActorsText(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    return arr.map((a, idx) => {
      const data = (a?.data && typeof a.data === 'object') ? a.data : {};
      const actorName = String(data?.actorName || a?.title || '').trim() || '(unnamed actor)';
      const roleGuess = String(data?.roleGuess || '').trim();
      const orgGuess = String(data?.orgGuess || '').trim();
      const stance = String(data?.stance || '').trim();
      const leverage = String(data?.leverage || '').trim();
      const risk = String(data?.risk || '').trim();
      const body = String(a?.body || '').trim();

      const head = [
        `${idx + 1}. ${actorName}`,
        roleGuess ? `role: ${roleGuess}` : '',
        orgGuess ? `org: ${orgGuess}` : '',
        stance ? `stance: ${stance}` : '',
      ].filter(Boolean).join(' | ');

      const tail = [
        leverage ? `leverage: ${leverage}` : '',
        risk ? `risk: ${risk}` : '',
        body || '',
      ].filter(Boolean);

      return [head, ...tail.map((x) => `   ${x}`)].join('\n');
    }).join('\n\n');
  }

  function buildStakeholderMapPrompt(rows) {
    const compact = buildCompactActorsText(rows);
    if (!compact.trim()) return '';

    return [
      'Using only the actor artifacts below, build a stakeholder map for this case.',
      'Requirements:',
      '1. Group actors by role in the process (decision-maker, adviser, administrator, witness, external institution, student support, student).',
      '2. Distinguish clearly between formal authority and informal influence.',
      '3. Note any missing or uncertain role assignments.',
      '4. Do not invent actors, motives, or powers not grounded in the artifacts.',
      '5. End with the most important actor relationships/conflicts.',
      '',
      'Actor artifacts:',
      compact,
    ].join('\n');
  }

  function buildResponsibilityPrompt(rows) {
    const compact = buildCompactActorsText(rows);
    if (!compact.trim()) return '';

    return [
      'Using only the actor artifacts below, analyze responsibility distribution in this case.',
      'Requirements:',
      '1. For each actor, identify what they appear responsible for, what they are not clearly responsible for, and what remains ambiguous.',
      '2. Separate formal responsibility from practical involvement.',
      '3. Highlight responsibility gaps, overlaps, and handoff failures.',
      '4. Do not invent duties or authority beyond the artifacts.',
      '5. End with the strongest responsibility conflicts or gaps.',
      '',
      'Actor artifacts:',
      compact,
    ].join('\n');
  }

  function buildLeverageRiskPrompt(rows) {
    const compact = buildCompactActorsText(rows);
    if (!compact.trim()) return '';

    return [
      'Using only the actor artifacts below, assess leverage and risk for each actor in the case.',
      'Requirements:',
      '1. For each actor, identify possible leverage, constraints, exposure, and strategic importance.',
      '2. Separate clearly between evidence-based observations and uncertainty.',
      '3. Do not invent motives or hidden intentions.',
      '4. Highlight which actors matter most for clarification, escalation, or resolution.',
      '5. End with the top-priority actors for follow-up.',
      '',
      'Actor artifacts:',
      compact,
    ].join('\n');
  }

  async function copyCompactActorsText() {
    const rows = getCurrentRowsForType('legal_actor');
    if (!rows.length) return false;

    const text = buildCompactActorsText(rows);
    if (!text) return false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    try {
      const ta = D.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      D.body.appendChild(ta);
      ta.select();
      D.execCommand('copy');
      ta.remove();
      return true;
    } catch (_) {}

    return false;
  }

  function insertStakeholderMapPrompt() {
    const rows = getCurrentRowsForType('legal_actor');
    if (!rows.length) return false;

    const text = buildStakeholderMapPrompt(rows);
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function insertResponsibilityPrompt() {
    const rows = getCurrentRowsForType('legal_actor');
    if (!rows.length) return false;

    const text = buildResponsibilityPrompt(rows);
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function insertLeverageRiskPrompt() {
    const rows = getCurrentRowsForType('legal_actor');
    if (!rows.length) return false;

    const text = buildLeverageRiskPrompt(rows);
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function getCrossArtifactRows(builder) {
    const all = getArtifactsAll();
    const showArchived = !!getDrawerUiState().showArchived;

    const visible = showArchived
      ? all
      : all.filter((a) => String(a?.status || 'draft') !== 'archived');

    return {
      timeline: builder?.includeTimeline ? sortArtifactsForDisplay(
        visible.filter((a) => String(a?.type || '') === 'timeline_item'),
        { type: 'timeline_item' }
      ) : [],
      claims: builder?.includeClaims ? visible.filter((a) => String(a?.type || '') === 'legal_claim') : [],
      contradictions: builder?.includeContradictions ? visible.filter((a) => String(a?.type || '') === 'legal_contradiction') : [],
      actors: builder?.includeActors ? visible.filter((a) => String(a?.type || '') === 'legal_actor') : [],
    };
  }

  function buildCrossArtifactBundle(builder) {
    const rows = getCrossArtifactRows(builder);
    const sections = [];

    if (rows.timeline.length) {
      sections.push([
        'Timeline items:',
        buildCompactTimelineText(rows.timeline),
      ].join('\n'));
    }

    if (rows.claims.length) {
      sections.push([
        'Claim artifacts:',
        buildCompactClaimsText(rows.claims),
      ].join('\n'));
    }

    if (rows.contradictions.length) {
      sections.push([
        'Contradiction artifacts:',
        buildCompactContradictionsText(rows.contradictions),
      ].join('\n'));
    }

    if (rows.actors.length) {
      sections.push([
        'Actor artifacts:',
        buildCompactActorsText(rows.actors),
      ].join('\n'));
    }

    return {
      rows,
      text: sections.join('\n\n'),
    };
  }

  function buildCaseAnalysisFromBundle(builder) {
    const bundle = buildCrossArtifactBundle(builder);
    if (!bundle.text.trim()) return '';

    return [
      'Using only the structured case materials below, produce a rigorous case analysis.',
      'Requirements:',
      '1. Separate chronology, claims, contradictions, and actors clearly.',
      '2. Do not invent facts, motives, or documents not present below.',
      '3. Distinguish between established facts, claimed facts, contradictions, and open uncertainties.',
      '4. Identify the strongest procedural/legal pressure points.',
      '5. End with the top unresolved questions and the most important next clarification steps.',
      '',
      bundle.text,
    ].join('\n');
  }

  function buildIssuesMapFromBundle(builder) {
    const bundle = buildCrossArtifactBundle(builder);
    if (!bundle.text.trim()) return '';

    return [
      'Using only the structured case materials below, build an issues map for this case.',
      'Requirements:',
      '1. Group issues by category: procedure, communication, decision-making, evidence, accommodations, authority/responsibility, contradiction.',
      '2. For each issue, cite which materials below support it.',
      '3. Distinguish clearly between strong issues, possible issues, and uncertainties.',
      '4. Do not invent missing facts.',
      '5. End with the top-priority issues in ranked order.',
      '',
      bundle.text,
    ].join('\n');
  }

  function buildStrategyMemoFromBundle(builder) {
    const bundle = buildCrossArtifactBundle(builder);
    if (!bundle.text.trim()) return '';

    return [
      'Using only the structured case materials below, draft a strategy memo.',
      'Requirements:',
      '1. Identify the strongest lines of argument available from the current record.',
      '2. Identify the biggest weaknesses or missing proof points.',
      '3. Note which actors matter most strategically and why.',
      '4. Distinguish immediate next steps from longer-term escalation paths.',
      '5. Do not invent facts, documents, or motives.',
      '',
      bundle.text,
    ].join('\n');
  }

  function buildEvidenceGapsFromBundle(builder) {
    const bundle = buildCrossArtifactBundle(builder);
    if (!bundle.text.trim()) return '';

    return [
      'Using only the structured case materials below, identify the most important evidence gaps.',
      'Requirements:',
      '1. Group missing evidence by issue.',
      '2. For each gap, explain what exact document, email, minute, witness statement, or clarification would help.',
      '3. Distinguish between evidence that likely exists and evidence that may never have existed.',
      '4. Do not invent records.',
      '5. End with the highest-priority evidence requests.',
      '',
      bundle.text,
    ].join('\n');
  }

  function buildIssueSpottingPreset(builder) {
    const bundle = buildCrossArtifactBundle(builder);
    if (!bundle.text.trim()) return '';
    return [
      'Using only the structured case materials below, identify the main issues in the case.',
      'Requirements:',
      '1. Group issues by category.',
      '2. Distinguish between strong issues, possible issues, and uncertainties.',
      '3. Do not invent facts.',
      '4. End with the top-priority issues.',
      '',
      bundle.text,
    ].join('\n');
  }

  function buildProceduralDefectMemoPreset(builder) {
    const bundle = buildCrossArtifactBundle(builder);
    if (!bundle.text.trim()) return '';
    return [
      'Using only the structured case materials below, draft a procedural defect memo.',
      'Requirements:',
      '1. Focus on procedure, communication, service/non-service, timing, authority, and decision classification.',
      '2. Distinguish clearly between facts and inferred procedural concerns.',
      '3. Do not invent missing records.',
      '4. End with the strongest procedural defects and the exact factual basis for each.',
      '',
      bundle.text,
    ].join('\n');
  }

  function buildEvidenceRequestMemoPreset(builder) {
    const bundle = buildCrossArtifactBundle(builder);
    if (!bundle.text.trim()) return '';
    return [
      'Using only the structured case materials below, draft an evidence request memo.',
      'Requirements:',
      '1. Identify the most important missing documents, emails, minutes, logs, or clarifications.',
      '2. Explain why each requested item matters.',
      '3. Distinguish between likely-existing records and uncertain records.',
      '4. Do not invent documents.',
      '5. End with a prioritized request list.',
      '',
      bundle.text,
    ].join('\n');
  }

  function buildContradictionEscalationMemoPreset(builder) {
    const bundle = buildCrossArtifactBundle(builder);
    if (!bundle.text.trim()) return '';
    return [
      'Using only the structured case materials below, draft a contradiction escalation memo.',
      'Requirements:',
      '1. Focus on the strongest contradictions, mixed signals, and category-confusions.',
      '2. Separate proven contradiction from unresolved ambiguity.',
      '3. Explain why each contradiction matters.',
      '4. End with the contradiction points that most require formal clarification.',
      '',
      bundle.text,
    ].join('\n');
  }

  function buildPromptFromPreset(preset, builder) {
    if (preset === 'issue-spotting') return buildIssueSpottingPreset(builder);
    if (preset === 'procedural-defect-memo') return buildProceduralDefectMemoPreset(builder);
    if (preset === 'evidence-request-memo') return buildEvidenceRequestMemoPreset(builder);
    if (preset === 'contradiction-escalation-memo') return buildContradictionEscalationMemoPreset(builder);
    return buildIssueSpottingPreset(builder);
  }

  function getPresetLabel(preset) {
    if (preset === 'issue-spotting') return STR.presetIssueSpotting;
    if (preset === 'procedural-defect-memo') return STR.presetProceduralDefectMemo;
    if (preset === 'evidence-request-memo') return STR.presetEvidenceRequestMemo;
    if (preset === 'contradiction-escalation-memo') return STR.presetContradictionEscalationMemo;
    return STR.presetIssueSpotting;
  }

  function getBuilderModeLabel(kind) {
    if (kind === 'case-analysis') return STR.builderModeCaseAnalysis;
    if (kind === 'issues-map') return STR.builderModeIssuesMap;
    if (kind === 'strategy-memo') return STR.builderModeStrategyMemo;
    if (kind === 'evidence-gaps') return STR.builderModeEvidenceGaps;
    return 'Builder Prompt';
  }

  function buildCrossArtifactPromptText(kind, builder) {
    if (kind === 'case-analysis') return buildCaseAnalysisFromBundle(builder);
    if (kind === 'issues-map') return buildIssuesMapFromBundle(builder);
    if (kind === 'strategy-memo') return buildStrategyMemoFromBundle(builder);
    if (kind === 'evidence-gaps') return buildEvidenceGapsFromBundle(builder);
    return '';
  }

  function getCrossArtifactSourceRefs(builder) {
    const rows = getCrossArtifactRows(builder);
    const all = [
      ...(rows.timeline || []),
      ...(rows.claims || []),
      ...(rows.contradictions || []),
      ...(rows.actors || []),
    ];

    return all.slice(0, 40).map((a) => ({
      kind: 'artifact',
      id: String(a?.id || ''),
      meta: { type: String(a?.type || 'artifact') },
    })).filter((x) => x.id);
  }

  function savePromptCapsuleFromBuilder(kind) {
    const ui = getDrawerUiState();
    const builder = ui.builder || {};
    const text = buildCrossArtifactPromptText(kind, builder);
    if (!text) return false;

    const sourceRefs = getCrossArtifactSourceRefs(builder);
    const rows = getCrossArtifactRows(builder);

    const capsule = safe(() => S.api?.createPromptCapsule?.({
      title: `${getBuilderModeLabel(kind)} Capsule`,
      body: text,
      data: {
        intent: 'builder_synthesis',
        builderKind: kind,
        builderModeLabel: getBuilderModeLabel(kind),
        selectedOnly: !!builder.selectedOnly,
        includeTimeline: !!builder.includeTimeline,
        includeClaims: !!builder.includeClaims,
        includeContradictions: !!builder.includeContradictions,
        includeActors: !!builder.includeActors,
        counts: {
          timeline: (rows.timeline || []).length,
          claims: (rows.claims || []).length,
          contradictions: (rows.contradictions || []).length,
          actors: (rows.actors || []).length,
        },
        approvalRequired: true,
        sendMode: 'insert-only',
        promptTemplateId: `builder.${kind}.v1`,
      },
      sourceRefs,
    }), null);

    if (capsule?.id) {
      saveDrawerUiPatch({ type: 'prompt_capsule', builder: { lastMode: kind } });
      rerender();
      return true;
    }

    return false;
  }

  function buildDraftFromPreset() {
    const ui = getDrawerUiState();
    const builder = ui.builder || {};
    const text = buildPromptFromPreset(builder.preset, builder);
    saveDrawerUiPatch({ builder: { draftText: text } });
    rerender();
    return !!text;
  }

  function insertBuilderDraft() {
    const ui = getDrawerUiState();
    const text = String(ui?.builder?.draftText || '').trim();
    if (!text) return false;
    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function saveBuilderDraftCapsule() {
    const ui = getDrawerUiState();
    const builder = ui.builder || {};
    const text = String(builder.draftText || '').trim();
    if (!text) return false;

    const sourceRefs = getCrossArtifactSourceRefs(builder);
    const rows = getCrossArtifactRows(builder);

    const capsule = safe(() => S.api?.createPromptCapsule?.({
      title: `${getPresetLabel(builder.preset)} Capsule`,
      body: text,
      data: {
        intent: 'builder_preset',
        builderPreset: String(builder.preset || ''),
        builderPresetLabel: getPresetLabel(builder.preset),
        selectedOnly: !!builder.selectedOnly,
        includeTimeline: !!builder.includeTimeline,
        includeClaims: !!builder.includeClaims,
        includeContradictions: !!builder.includeContradictions,
        includeActors: !!builder.includeActors,
        counts: {
          timeline: (rows.timeline || []).length,
          claims: (rows.claims || []).length,
          contradictions: (rows.contradictions || []).length,
          actors: (rows.actors || []).length,
        },
        approvalRequired: true,
        sendMode: 'insert-only',
        promptTemplateId: `builder.preset.${String(builder.preset || 'issue-spotting')}.v1`,
      },
      sourceRefs,
    }), null);

    if (capsule?.id) {
      saveDrawerUiPatch({ type: 'prompt_capsule' });
      rerender();
      return true;
    }

    return false;
  }

  function insertCrossArtifactPrompt(kind) {
    const ui = getDrawerUiState();
    const builder = ui.builder || {};
    const text = buildCrossArtifactPromptText(kind, builder);

    if (!text) return false;

    const ok = !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
    if (ok) saveDrawerUiPatch({ builder: { lastMode: kind } });
    return ok;
  }

  function renderPromptBuilder(ui) {
    const b = ui.builder || {};
    const presetBody = `
      <div class="cgxui-${SkID}-pb-row">
        <select class="cgxui-${SkID}-select" data-pb-select="preset">
          <option value="issue-spotting"${b.preset === 'issue-spotting' ? ' selected' : ''}>${escHtml(STR.presetIssueSpotting)}</option>
          <option value="procedural-defect-memo"${b.preset === 'procedural-defect-memo' ? ' selected' : ''}>${escHtml(STR.presetProceduralDefectMemo)}</option>
          <option value="evidence-request-memo"${b.preset === 'evidence-request-memo' ? ' selected' : ''}>${escHtml(STR.presetEvidenceRequestMemo)}</option>
          <option value="contradiction-escalation-memo"${b.preset === 'contradiction-escalation-memo' ? ' selected' : ''}>${escHtml(STR.presetContradictionEscalationMemo)}</option>
        </select>
        <button class="cgxui-${SkID}-btn" type="button" data-pb-build="draft">${escHtml(STR.buildDraft)}</button>
        <button class="cgxui-${SkID}-btn" type="button" data-pb-insert="draft">${escHtml(STR.insertDraft)}</button>
        <button class="cgxui-${SkID}-btn is-primary" type="button" data-pb-save-draft="1">${escHtml(STR.saveDraftCapsule)}</button>
      </div>

      <div class="cgxui-${SkID}-pb-row">
        <textarea class="cgxui-${SkID}-pb-draft" data-pb-draft="text" placeholder="${escHtml(STR.builderDraft)}">${escHtml(String(b.draftText || ''))}</textarea>
      </div>
    `;

    return renderCollapsibleSection({
      ui,
      key: 'promptBuilder',
      title: STR.promptBuilder,
      sideText: 'cross-artifact',
      body: `
        <div class="cgxui-${SkID}-pb">
          <div class="cgxui-${SkID}-pb-row">
            <label class="cgxui-${SkID}-pb-chip"><input type="checkbox" data-pb="timeline"${b.includeTimeline ? ' checked' : ''}>${escHtml(STR.includeTimeline)}</label>
            <label class="cgxui-${SkID}-pb-chip"><input type="checkbox" data-pb="claims"${b.includeClaims ? ' checked' : ''}>${escHtml(STR.includeClaims)}</label>
            <label class="cgxui-${SkID}-pb-chip"><input type="checkbox" data-pb="contradictions"${b.includeContradictions ? ' checked' : ''}>${escHtml(STR.includeContradictions)}</label>
            <label class="cgxui-${SkID}-pb-chip"><input type="checkbox" data-pb="actors"${b.includeActors ? ' checked' : ''}>${escHtml(STR.includeActors)}</label>
            <label class="cgxui-${SkID}-pb-chip"><input type="checkbox" data-pb="selected-only"${b.selectedOnly ? ' checked' : ''}>${escHtml(STR.selectedOnly)}</label>
          </div>

          ${renderCollapsibleSection({
            ui,
            key: 'builderPreset',
            title: STR.preset,
            sideText: getPresetLabel(b.preset || 'issue-spotting'),
            body: presetBody,
          })}

          <div class="cgxui-${SkID}-pb-row">
            <button class="cgxui-${SkID}-btn is-primary" type="button" data-pb-run="case-analysis">${escHtml(STR.caseAnalysisPrompt)}</button>
            <button class="cgxui-${SkID}-btn" type="button" data-pb-run="issues-map">${escHtml(STR.issuesMapPrompt)}</button>
            <button class="cgxui-${SkID}-btn" type="button" data-pb-run="strategy-memo">${escHtml(STR.strategyMemoPrompt)}</button>
            <button class="cgxui-${SkID}-btn" type="button" data-pb-run="evidence-gaps">${escHtml(STR.evidenceGapsPrompt)}</button>
            <button class="cgxui-${SkID}-btn" type="button" data-pb-save="${escHtml(String(b.lastMode || 'case-analysis'))}">${escHtml(STR.savePromptCapsule)}</button>
          </div>
        </div>
      `,
    });
  }

  function exportTimelineJSON() {
    const rows = getCurrentTimelineRowsForExport();
    if (!rows.length) return false;

    const payload = rows.map((a) => {
      const data = (a?.data && typeof a.data === 'object') ? a.data : {};
      return {
        id: a?.id || '',
        title: a?.title || '',
        status: a?.status || '',
        dateText: data?.dateText || '',
        actorGuess: data?.actorGuess || '',
        actionSummary: data?.actionSummary || '',
        eventType: data?.eventType || '',
        uncertainty: data?.uncertainty || '',
        sourceMsgId: data?.sourceMsgId || '',
        sourceRole: data?.sourceRole || '',
        sourceExcerpt: data?.sourceExcerpt || '',
        tags: Array.isArray(a?.tags) ? a.tags.slice() : [],
      };
    });

    try {
      const raw = JSON.stringify(payload, null, 2);
      const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = D.createElement('a');
      a.href = url;
      a.download = `timeline-items-${Date.now()}.json`;
      D.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (_) {}

    return false;
  }

  function insertCapsuleToComposer(id) {
    const art = safe(() => S.api?.getArtifact?.(id), null);
    if (!art || art.type !== 'prompt_capsule') return false;

    const text = String(art.body || '').trim();
    if (!text) return false;

    return !!safe(() => S.api?.insertTextIntoComposer?.(text, { replace: false }), false);
  }

  function markCapsuleUsed(id) {
    const art = safe(() => S.api?.getArtifact?.(id), null);
    if (!art || art.type !== 'prompt_capsule') return false;

    const ok =
      safe(() => S.api?.markPromptCapsuleUsed?.(id), null) ??
      safe(() => S.api?.updateArtifact?.(id, {
        status: 'used',
        data: {
          ...(art.data || {}),
          usedAt: Date.now(),
        },
      }), false);

    rerender();
    return !!ok;
  }

  async function rerunFromCapsule(id) {
    const art = safe(() => S.api?.getArtifact?.(id), null);
    if (!art || art.type !== 'prompt_capsule') return false;

    const moduleId = String(art.moduleId || '').trim();
    if (!moduleId) return false;

    const out = await safe(() => S.api?.runModule?.(moduleId, {
      mode: 'rerun',
      capsuleId: id,
      promptCapsule: art,
      targetArtifactType: String(art?.data?.targetArtifactType || ''),
      basedOnArtifactIds: Array.isArray(art?.data?.basedOnArtifactIds) ? art.data.basedOnArtifactIds.slice() : [],
      sourceRefs: Array.isArray(art?.sourceRefs) ? art.sourceRefs.slice() : [],
    }), null);

    if (out?.ok) {
      safe(() => S.api?.openDrawer?.());
      safe(() => S.api?.setRightMode?.('drawer'));
      rerender();
      return true;
    }

    return false;
  }

  function wireBody() {
    if (!S.body) return;
    const searchEl = q('[data-drw="search"]', S.body);
    const typeEl = q('[data-drw="type"]', S.body);
    if (searchEl && !searchEl.__h2oDrawerBound) {
      searchEl.__h2oDrawerBound = 1;
      const onInput = debounce((e) => { saveDrawerUiPatch({ q: String(e?.target?.value || '') }); rerender(); });
      searchEl.addEventListener('input', onInput);
    }
    if (typeEl && !typeEl.__h2oDrawerBound) {
      typeEl.__h2oDrawerBound = 1;
      typeEl.addEventListener('change', (e) => { saveDrawerUiPatch({ type: String(e?.target?.value || 'all') }); rerender(); });
    }
    if (!S.body.__h2oDrawerChangeBound) {
      S.body.__h2oDrawerChangeBound = 1;
      S.body.addEventListener('change', (e) => {
        const pbSelect = e.target.closest('[data-pb-select="preset"]');
        if (pbSelect) {
          saveDrawerUiPatch({ builder: { preset: String(pbSelect.value || 'issue-spotting') } });
          rerender();
          return;
        }

        const pbDraft = e.target.closest('[data-pb-draft="text"]');
        if (pbDraft) {
          saveDrawerUiPatch({ builder: { draftText: String(pbDraft.value || '') } });
          return;
        }

        const cb = e.target.closest('[data-pb]');
        if (!cb) return;

        const key = String(cb.getAttribute('data-pb') || '');
        const checked = !!cb.checked;

        if (key === 'timeline') saveDrawerUiPatch({ builder: { includeTimeline: checked } });
        if (key === 'claims') saveDrawerUiPatch({ builder: { includeClaims: checked } });
        if (key === 'contradictions') saveDrawerUiPatch({ builder: { includeContradictions: checked } });
        if (key === 'actors') saveDrawerUiPatch({ builder: { includeActors: checked } });
        if (key === 'selected-only') saveDrawerUiPatch({ builder: { selectedOnly: checked } });

        rerender();
      }, true);
    }
    if (!S.body.__h2oDrawerToggleBound) {
      S.body.__h2oDrawerToggleBound = 1;
      S.body.addEventListener('toggle', (e) => {
        const fold = e.target;
        if (!fold?.matches?.('[data-sec]')) return;
        const key = String(fold.getAttribute('data-sec') || '');
        if (!key) return;
        saveDrawerUiPatch({ sections: { [key]: !!fold.open } });
      }, true);
    }
    if (!S.body.__h2oDrawerClickBound) {
      S.body.__h2oDrawerClickBound = 1;
      S.body.addEventListener('click', (e) => {
        const activeMenu = e.target.closest(`.cgxui-${SkID}-action-menu, .cgxui-${SkID}-toolbar-menu`);
        setTimeout(() => closeOpenMenus(activeMenu || null), 0);

        const btnToggleArchived = e.target.closest('[data-drw="toggle-archived"]');
        if (btnToggleArchived) {
          saveDrawerUiPatch({ showArchived: !getDrawerUiState().showArchived });
          rerender();
          return;
        }
        const btnCopyCompactTimeline = e.target.closest('[data-drw="copy-compact-timeline"]');
        if (btnCopyCompactTimeline) {
          copyCompactTimelineText();
          return;
        }
        const btnCopyTimeline = e.target.closest('[data-drw="copy-timeline"]');
        if (btnCopyTimeline) {
          copyTimelineText();
          return;
        }
        const btnNarrativePrompt = e.target.closest('[data-drw="narrative-prompt"]');
        if (btnNarrativePrompt) {
          insertTimelineNarrativePrompt();
          return;
        }
        const btnLegalIssuesPrompt = e.target.closest('[data-drw="legal-issues-prompt"]');
        if (btnLegalIssuesPrompt) {
          insertTimelineLegalIssuesPrompt();
          return;
        }
        const btnContradictionsPrompt = e.target.closest('[data-drw="contradictions-prompt"]');
        if (btnContradictionsPrompt) {
          insertTimelineContradictionsPrompt();
          return;
        }
        const btnExportTimeline = e.target.closest('[data-drw="export-timeline"]');
        if (btnExportTimeline) {
          exportTimelineJSON();
          return;
        }
        const btnCopyCompactClaims = e.target.closest('[data-drw="copy-compact-claims"]');
        if (btnCopyCompactClaims) {
          copyCompactClaimsText();
          return;
        }
        const btnClaimAnalysisPrompt = e.target.closest('[data-drw="claim-analysis-prompt"]');
        if (btnClaimAnalysisPrompt) {
          insertClaimAnalysisPrompt();
          return;
        }
        const btnClaimEvidencePrompt = e.target.closest('[data-drw="claim-evidence-prompt"]');
        if (btnClaimEvidencePrompt) {
          insertClaimEvidencePrompt();
          return;
        }
        const btnCopyCompactContradictions = e.target.closest('[data-drw="copy-compact-contradictions"]');
        if (btnCopyCompactContradictions) {
          copyCompactContradictionsText();
          return;
        }
        const btnContradictionAnalysisPrompt = e.target.closest('[data-drw="contradiction-analysis-prompt"]');
        if (btnContradictionAnalysisPrompt) {
          insertContradictionAnalysisPrompt();
          return;
        }
        const btnReconciliationPrompt = e.target.closest('[data-drw="reconciliation-prompt"]');
        if (btnReconciliationPrompt) {
          insertReconciliationPrompt();
          return;
        }
        const btnCopyCompactActors = e.target.closest('[data-drw="copy-compact-actors"]');
        if (btnCopyCompactActors) {
          copyCompactActorsText();
          return;
        }
        const btnStakeholderMapPrompt = e.target.closest('[data-drw="stakeholder-map-prompt"]');
        if (btnStakeholderMapPrompt) {
          insertStakeholderMapPrompt();
          return;
        }
        const btnResponsibilityPrompt = e.target.closest('[data-drw="responsibility-prompt"]');
        if (btnResponsibilityPrompt) {
          insertResponsibilityPrompt();
          return;
        }
        const btnLeverageRiskPrompt = e.target.closest('[data-drw="leverage-risk-prompt"]');
        if (btnLeverageRiskPrompt) {
          insertLeverageRiskPrompt();
          return;
        }
        const pbBuild = e.target.closest('[data-pb-build="draft"]');
        if (pbBuild) {
          buildDraftFromPreset();
          return;
        }
        const pbInsertDraft = e.target.closest('[data-pb-insert="draft"]');
        if (pbInsertDraft) {
          insertBuilderDraft();
          return;
        }
        const pbSaveDraft = e.target.closest('[data-pb-save-draft]');
        if (pbSaveDraft) {
          saveBuilderDraftCapsule();
          return;
        }
        const pbSave = e.target.closest('[data-pb-save]');
        if (pbSave) {
          const kind = String(pbSave.getAttribute('data-pb-save') || '') || 'case-analysis';
          savePromptCapsuleFromBuilder(kind);
          return;
        }
        const pbRun = e.target.closest('[data-pb-run]');
        if (pbRun) {
          const kind = String(pbRun.getAttribute('data-pb-run') || '');
          if (kind) {
            insertCrossArtifactPrompt(kind);
            rerender();
          }
          return;
        }
        const btnNew = e.target.closest('[data-drw="new"]');
        if (btnNew) { openCreateEditor(); rerender(); return; }
        const btnExport = e.target.closest('[data-drw="export"]');
        if (btnExport) { exportArtifacts(); return; }
        const btnSave = e.target.closest('[data-drw="editor-save"]');
        if (btnSave) { saveEditor(); return; }
        const btnCancel = e.target.closest('[data-drw="editor-cancel"]');
        if (btnCancel) { resetEditor(); rerender(); return; }
        const btnInsert = e.target.closest('[data-art-insert]');
        if (btnInsert) {
          const id = String(btnInsert.getAttribute('data-art-insert') || '');
          if (id) insertCapsuleToComposer(id);
          return;
        }
        const btnRerun = e.target.closest('[data-art-rerun]');
        if (btnRerun) {
          const id = String(btnRerun.getAttribute('data-art-rerun') || '');
          if (id) rerunFromCapsule(id);
          return;
        }
        const btnRefine = e.target.closest('[data-tl-refine-a]');
        if (btnRefine) {
          const aId = String(btnRefine.getAttribute('data-tl-refine-a') || '');
          const bId = String(btnRefine.getAttribute('data-tl-refine-b') || '');
          if (aId && bId) refineTimelinePair(aId, bId);
          return;
        }
        const btnMerge = e.target.closest('[data-tl-merge-a]');
        if (btnMerge) {
          const aId = String(btnMerge.getAttribute('data-tl-merge-a') || '');
          const bId = String(btnMerge.getAttribute('data-tl-merge-b') || '');
          if (aId && bId) mergeTimelinePair(aId, bId);
          return;
        }
        const btnEdit = e.target.closest('[data-art-edit]');
        if (btnEdit) { const id = String(btnEdit.getAttribute('data-art-edit') || ''); const art = safe(() => S.api?.getArtifact?.(id), null); if (art) { openEditEditor(art); rerender(); } return; }
        const btnPin = e.target.closest('[data-art-pin]');
        if (btnPin) { const id = String(btnPin.getAttribute('data-art-pin') || ''); if (id) togglePinned(id); return; }
        const btnStatus = e.target.closest('[data-art-status]');
        if (btnStatus) { const id = String(btnStatus.getAttribute('data-art-status') || ''); if (id) toggleStatus(id); return; }
        const btnDel = e.target.closest('[data-art-del]');
        if (btnDel) { const id = String(btnDel.getAttribute('data-art-del') || ''); if (id && confirm('Delete this artifact?')) removeArtifact(id); }
      }, true);
    }
  }

  function rerender() {
    clearTimeout(S.rerenderT);
    S.rerenderT = setTimeout(() => {
      attachDockRefs();
      if (!S.api) return renderEmpty(STR.emptyNoCore);
      if (!S.root || !S.body) return renderEmpty(STR.emptyNoShell);
      if (!isDrawerPane()) return;
      renderDrawer();
    }, 0);
  }

  function bindWorkspaceEventsOnce() {
    ['h2o:wrkspc:ready','h2o:wrkspc:artifacts:changed','h2o:wrkspc:chat_profile:changed','h2o:wrkspc:right_shell:changed','h2o:wrkspc:packs:changed','h2o:wrkspc:modules:changed'].forEach((ev) => {
      const fn = () => rerender();
      W.addEventListener(ev, fn);
      S.handlers.workspace.push({ ev, fn });
    });
  }

  H2O.DrawerPanel = H2O.DrawerPanel || {};
  H2O.DrawerPanel.ready = () => !!S.booted;
  H2O.DrawerPanel.rerender = () => rerender();
  H2O.DrawerPanel.getSharedDock = () => ({ root: S.root, body: S.body });

  async function boot() {
    if (S.booted) return;
    S.booted = true;
    S.api = await waitForWorkspaceApi();
    ensureStylesOnce();
    const dock = await waitForDock();
    if (dock) { S.root = dock.root; S.body = dock.body; S.titleEl = dock.titleEl; }
    bindWorkspaceEventsOnce();
    observeDock();
    rerender();
  }

  boot();
})();
