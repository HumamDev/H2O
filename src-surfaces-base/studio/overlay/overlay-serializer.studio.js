/* H2O Studio — Edit Overlay Serializer (Phase 2e)
 *
 * Pure, side-effect-free serializer that turns a saved snapshot + its
 * EditOverlay record into a Markdown-flavoured transcript that mirrors
 * what the user sees in the reader. Used by
 * RibbonBridge.getCleanTranscript({ includeOverlay }) for the
 * "Copy clean transcript" action.
 *
 * Strict invariants (Phase 2e):
 *   - NO DOM access. NO storage access. NO H2O.events. NO I/O.
 *   - NEVER mutates `snap` or `overlay` — both treated as read-only.
 *   - Respects the Phase 2d reducer-filter active-set model by reusing
 *     H2O.Studio.overlay.computeMessageState / computeStructureState
 *     (both already skip inactive ops via getActiveOpIdSet).
 *   - Returns a string + a small metadata object. Never throws — every
 *     branch catches; on internal error the raw output is returned.
 *
 * Raw mode contract (includeOverlay: false):
 *   - Output is byte-identical to Phase 1b's __ribbonBridge_getCleanTranscript:
 *     "User:\n<text>\n\nA:\n<text>\n\nSystem:\n<text>" with empty turns
 *     skipped and unknown roles dropped.
 *
 * Overlay mode contract (includeOverlay: true, default):
 *   - Per-message ops (heading / quote / code / callout / clean-spacing)
 *     decorate the role+body of each turn.
 *   - Structure ops (sections / page dividers / TOC) interleave between
 *     turns at their afterTurnIdx positions.
 *   - Collapsed sections include content by default, header gets a
 *     "[collapsed — N turns]" marker. The `collapsedMode` option lets
 *     callers switch to 'include-silent' or 'omit'.
 *   - TOC is omitted unless `includeToc: true`.
 *
 * Public API:
 *   H2O.Studio.overlaySerializer.serialize(snap, overlay, opts?) ->
 *     {
 *       text: string,
 *       opsApplied: number,           // count of active ops that produced output
 *       structureApplied: boolean,    // true iff any section/divider/TOC emitted
 *       tocIncluded: boolean,
 *       collapsedSections: number,
 *       reason?: string,              // 'serializer-error' on internal failure
 *     }
 *
 *   H2O.Studio.overlaySerializer.selfCheck() -> { ok, version, ... }
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  if (H2O.Studio.overlaySerializer && H2O.Studio.overlaySerializer.__installed) {
    return;
  }

  var VERSION = '0.1.0-phase-2e';
  var PHASE = '2e';
  var errors = [];
  var errMax = 20;

  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function recordError(op, e) {
    try {
      errors.push({ t: Date.now(), op: String(op), e: String((e && e.message) || (e && e.stack) || e || '') });
      if (errors.length > errMax) errors.splice(0, errors.length - errMax);
    } catch (_) { /* swallow */ }
  }

  function defaultMessageState() {
    return {
      heading: null, quote: false, code: false, callout: null, cleanSpacing: false,
      /* Phase 4-1 — message-level character formatting. */
      bold: false, italic: false, underline: false, strikethrough: false,
      /* Phase 4-2 — message-level text color. Markdown serializer emits
       * NO output for text-color (the field is intentionally not
       * portable to plain Markdown — `<span style="color:...">` would
       * render in some viewers but break round-trip; the DOCX writer
       * + screen + print CSS carry the colour instead). */
      textColor: null,
      /* Phase 4-3 — paragraph controls.
       *   list   — Markdown emits per-line "- " (bullet) or "N. "
       *            (numbered) prefixes on the body. Skipped when
       *            state.code is set (fenced code stays literal).
       *   align  — INTENTIONALLY LOSSY in Markdown (no portable syntax).
       *   indent — INTENTIONALLY LOSSY in Markdown (no portable syntax).
       * The DOCX writer + screen + print CSS carry align/indent. */
      list: null, align: null, indent: 0,
      /* Phase 4-4 — OneNote-style visual tags. Markdown export emits a
       * single bracketed prefix line "[tags: To Do, Important]" at the
       * very start of the body content (after callout/heading wrap, but
       * before list per-line prefixes). NOT Library metadata tags. */
      visualTags: {
        todo: false, important: false, question: false,
        definition: false, warning: false, idea: false,
      },
    };
  }

  /* Phase 4-4 — canonical kind→human-label map for the Markdown prefix.
   * Order matches the applier's VISUAL_TAG_ORDER exactly so the prefix
   * tag list renders deterministically. */
  var VISUAL_TAG_LABEL_ORDER = ['todo', 'important', 'question', 'definition', 'warning', 'idea'];
  var VISUAL_TAG_LABELS = {
    todo: 'To Do', important: 'Important', question: 'Question',
    definition: 'Definition', warning: 'Warning', idea: 'Idea',
  };
  function buildVisualTagPrefix(state) {
    if (!state || !state.visualTags) return '';
    var labels = [];
    for (var i = 0; i < VISUAL_TAG_LABEL_ORDER.length; i += 1) {
      var k = VISUAL_TAG_LABEL_ORDER[i];
      if (state.visualTags[k]) labels.push(VISUAL_TAG_LABELS[k]);
    }
    if (!labels.length) return '';
    return '[tags: ' + labels.join(', ') + '] ';
  }

  /* ── Raw serializer ───────────────────────────────────────────────────
   * Byte-identical to Phase 1b's __ribbonBridge_getCleanTranscript:
   *   - Iterate snap.messages.
   *   - Skip null/non-object messages, empty text, unknown roles.
   *   - Label each as "User:" / "A:" / "System:".
   *   - Join turns with a blank line. */
  function buildRawTurns(snap) {
    var out = [];
    if (!isObject(snap)) return out;
    var messages = Array.isArray(snap.messages) ? snap.messages : [];
    for (var i = 0; i < messages.length; i += 1) {
      var msg = messages[i];
      if (!msg || typeof msg !== 'object') continue;
      var text = String(msg.text == null ? '' : msg.text).trim();
      if (!text) continue;
      var role = String(msg.role || '').toLowerCase();
      var label;
      if (role === 'user') label = 'User:';
      else if (role === 'assistant') label = 'A:';
      else if (role === 'system') label = 'System:';
      else continue;
      out.push({ turnIdx: i + 1, role: role, label: label, text: text, source: msg });
    }
    return out;
  }

  function serializeRaw(snap) {
    var turns = buildRawTurns(snap);
    if (!turns.length) return '';
    var parts = [];
    for (var i = 0; i < turns.length; i += 1) {
      parts.push(turns[i].label + '\n' + turns[i].text);
    }
    return parts.join('\n\n');
  }

  /* ── clean-spacing — collapse 3+ consecutive newlines down to 2 ────── */
  function applyCleanSpacing(text) {
    if (typeof text !== 'string' || !text) return text || '';
    return text.replace(/\n{3,}/g, '\n\n');
  }

  /* ── Decorate body per per-message ops (quote / code / callout) ──────
   * Each helper takes the body text (already clean-spacing-normalised
   * if needed) and returns the wrapped form. The role label is NOT
   * inside quote/code wrappers but IS inside callout wrappers (spec:
   * GitHub/Obsidian alert with Role: line). */

  function prefixEachLine(text, prefix) {
    if (typeof text !== 'string') text = String(text || '');
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i += 1) {
      lines[i] = prefix + lines[i];
    }
    return lines.join('\n');
  }

  function wrapQuote(text) {
    return prefixEachLine(text, '> ');
  }

  function wrapCode(text) {
    /* Fenced code block; preserve interior blank lines as-is. */
    return '```\n' + (text || '') + '\n```';
  }

  function wrapCallout(roleLabel, body, kind) {
    var k = (kind === 'note' || kind === 'warning' || kind === 'tip' || kind === 'info') ? kind : 'info';
    var combined = roleLabel + '\n' + (body || '');
    return prefixEachLine('[!' + k + ']\n' + combined, '> ');
  }

  function headingPrefix(level) {
    var lvl = Number(level);
    if (lvl === 1) return '# ';
    if (lvl === 2) return '## ';
    if (lvl === 3) return '### ';
    return '';
  }

  /* ── Phase 5d-1 — inline run → Markdown ───────────────────────────────
   * Render the segmenter's runs to Markdown. Each run is wrapped
   * independently in the fixed nesting order (bold innermost → strike
   * outermost), matching the Phase 4-1 whole-body wrapper order. Wrapping
   * is applied PER-LINE within a run so markers never span newlines —
   * this keeps the result well-formed and lets the list per-line prefixer
   * work unchanged. Blank lines are left unwrapped (no stray `****`).
   * Text color is intentionally LOSSY: it carries no Markdown output
   * (matches the Phase 4-2 message-level precedent). */
  function runsToMarkdown(runs) {
    if (!Array.isArray(runs)) return '';
    var out = '';
    for (var i = 0; i < runs.length; i += 1) {
      var r = runs[i] || {};
      var lines = String(r.text == null ? '' : r.text).split('\n');
      for (var li = 0; li < lines.length; li += 1) {
        var x = lines[li];
        if (x !== '') {
          if (r.bold)          x = '**' + x + '**';
          if (r.italic)        x = '*' + x + '*';
          if (r.underline)     x = '<u>' + x + '</u>';
          if (r.strikethrough) x = '~~' + x + '~~';
          /* textColor: intentionally no Markdown output. */
        }
        lines[li] = x;
      }
      out += lines.join('\n');
    }
    return out;
  }

  /* ── Per-turn serializer ────────────────────────────────────────────
   * Stacking order (outer → inner):
   *   1. callout (if present)  — wraps everything including role label
   *   2. heading (if present)  — replaces the role label with a heading-
   *      prefixed role label. Inside a callout, the heading still
   *      decorates the role label that lives inside the callout.
   *   3. code (if present)     — wraps the body in a fenced block;
   *                              code wins over quote when both set
   *      (more specific). Role label sits outside the fence.
   *   4. quote (if present and no code)
   *                            — wraps the body in a blockquote with
   *                              "> " line prefix; role label outside.
   *   5. clean-spacing         — text pass on body, applied first so
   *                              wrappers see the normalised body.
   *
   * `opCounter.applied` is incremented by 1 for each per-message op
   * type that produced visible output (heading, quote, code, callout,
   * cleanSpacing).
   */
  function serializeTurn(turn, state, inlineState, opCounter) {
    if (!turn || !turn.text) return '';
    var label = turn.label;
    var body = turn.text;

    /* 5: clean-spacing — text pass on body. */
    if (state && state.cleanSpacing) {
      var normalised = applyCleanSpacing(body);
      if (normalised !== body) opCounter.applied += 1;
      body = normalised;
    }

    /* Phase 5d-1 — inline run segmentation (B/I/U/S; color lossy in MD).
     * Folds message-level char formatting + inline intervals into one
     * pass via the shared segmenter, producing a marked body. Runs on the
     * trimmed body BEFORE the visual-tag prefix so inline offsets
     * reconcile against the message's raw text via the leading-whitespace
     * delta (opts.offsetAdjust). Skipped when:
     *   - state.code is set (fenced code stays literal — inline suppressed)
     *   - state.cleanSpacing changed the body (coordinate base shifts)
     *   - there are no inline ranges
     *   - the segmenter cannot reconcile offsets (degrades safely)
     * When inlineApplied, the existing message-level char-format wrap and
     * the list per-line wrap are skipped (the runs already fold message-
     * level formatting), but the list per-line PREFIX still applies. */
    var inlineApplied = false;
    var hasInline = !!(inlineState && (
      (Array.isArray(inlineState.bold) && inlineState.bold.length) ||
      (Array.isArray(inlineState.italic) && inlineState.italic.length) ||
      (Array.isArray(inlineState.underline) && inlineState.underline.length) ||
      (Array.isArray(inlineState.strikethrough) && inlineState.strikethrough.length) ||
      (Array.isArray(inlineState.textColor) && inlineState.textColor.length)
    ));
    if (hasInline && !(state && state.code) && !(state && state.cleanSpacing)) {
      var rawText = (turn.source && turn.source.text != null) ? String(turn.source.text) : body;
      var leadingTrim = rawText.length - rawText.replace(/^\s+/, '').length;
      var builder = (H2O.Studio.overlay && typeof H2O.Studio.overlay.buildInlineRuns === 'function')
        ? H2O.Studio.overlay.buildInlineRuns : null;
      var rr = builder ? builder(body, state, inlineState, { offsetAdjust: leadingTrim }) : null;
      if (rr && rr.ok && Array.isArray(rr.runs)) {
        body = runsToMarkdown(rr.runs);
        inlineApplied = true;
        opCounter.applied += 1;
      }
    }

    /* Phase 4-4 — prepend "[tags: To Do, Important] " prefix on the
     * FIRST body line when any visual tag is active. The prefix lives
     * inside the body so it inherits list/code/quote/callout wraps
     * correctly. It is the SAME LINE as the existing body's first line,
     * separated from the rest with a trailing space (already in the
     * prefix string). When state.code is true the prefix still appears
     * — it's part of the body content the user opted to mark. */
    var vtPrefix = buildVisualTagPrefix(state);
    if (vtPrefix) {
      body = vtPrefix + body;
      opCounter.applied += 1;
    }

    /* Phase 4-1 — character formatting wrappers applied to the body BEFORE
     * heading/quote/code/callout decorate the message. The wrappers nest
     * tightest-first so the produced Markdown is well-formed:
     *
     *   raw       :  hello
     *   bold      :  **hello**
     *   italic    :  *hello*
     *   underline :  <u>hello</u>   (Markdown has no native underline;
     *                                inline HTML preserves the intent)
     *   strike    :  ~~hello~~
     *
     * Combinations stack outside-in (innermost is the text, outer wraps
     * are bold then italic then underline then strike). The wrappers
     * apply to the WHOLE body — including newlines. For multi-line
     * bodies inside a code fence, the wrappers are skipped (code wins);
     * the writer keeps the code block syntactically clean.
     *
     * When state.code is set the character wrappers are skipped so the
     * fenced code block stays literal (no `**` interpretation inside
     * code). This mirrors how the DOCX writer also bypasses character
     * formatting for code runs.
     *
     * Phase 4-3 — when list mode is active (and code is not), character
     * formatting is applied PER-LINE so each list item is syntactically
     * well-formed Markdown (`- **line**` rather than `- **line1\n- line2**`). */
    var useCharFormatting = !(state && state.code);
    var listKind = (state && state.list && !state.code && state.list.kind) ? state.list.kind : null;
    function wrapCharFormatting(s) {
      var x = s;
      if (state.bold)          x = '**' + x + '**';
      if (state.italic)        x = '*'  + x + '*';
      if (state.underline)     x = '<u>' + x + '</u>';
      if (state.strikethrough) x = '~~' + x + '~~';
      return x;
    }
    if (useCharFormatting && state && !listKind && !inlineApplied) {
      if (state.bold)          { body = '**' + body + '**'; opCounter.applied += 1; }
      if (state.italic)        { body = '*' + body + '*';   opCounter.applied += 1; }
      if (state.underline)     { body = '<u>' + body + '</u>'; opCounter.applied += 1; }
      if (state.strikethrough) { body = '~~' + body + '~~'; opCounter.applied += 1; }
    }

    /* Phase 4-3 — list per-line prefix. Skipped inside code (state.code).
     * When list is active and character formatting is also on, each line
     * gets wrapped individually so the markdown is clean. */
    if (listKind) {
      var listLines = String(body).split('\n');
      var numberedIdx = 1;
      var rendered = [];
      for (var li = 0; li < listLines.length; li += 1) {
        var lineRaw = listLines[li];
        /* When inline runs were applied, the body already carries B/I/U/S
         * markers (folded message-level + inline) — so do NOT re-wrap the
         * line; just prefix it. Otherwise keep the Phase 4-3 per-line
         * message-level char-format wrap. */
        var lineFormatted = (useCharFormatting && state && !inlineApplied) ? wrapCharFormatting(lineRaw) : lineRaw;
        var prefix = (listKind === 'bullet') ? '- ' : (String(numberedIdx) + '. ');
        rendered.push(prefix + lineFormatted);
        if (listKind === 'numbered') numberedIdx += 1;
      }
      body = rendered.join('\n');
      opCounter.applied += 1;
      if (useCharFormatting && state && !inlineApplied) {
        if (state.bold)          opCounter.applied += 1;
        if (state.italic)        opCounter.applied += 1;
        if (state.underline)     opCounter.applied += 1;
        if (state.strikethrough) opCounter.applied += 1;
      }
    }

    /* 2: heading — decorates the role label. */
    var roleLine = label;
    if (state && state.heading && state.heading.level) {
      var prefix = headingPrefix(state.heading.level);
      if (prefix) {
        roleLine = prefix + label;
        opCounter.applied += 1;
      }
    }

    /* 3 vs 4: code wins over quote when both set. */
    var bodyBlock;
    if (state && state.code) {
      bodyBlock = wrapCode(body);
      opCounter.applied += 1;
    } else if (state && state.quote) {
      bodyBlock = wrapQuote(body);
      opCounter.applied += 1;
    } else {
      bodyBlock = body;
    }

    /* 1: callout — wraps role+body inside the alert. */
    if (state && state.callout && state.callout.kind) {
      /* Heading-prefixed role line is preserved inside the callout. */
      var combinedForCallout = roleLine + '\n' + bodyBlock;
      var k = state.callout.kind;
      var calloutInner = '[!' + ((k === 'note' || k === 'warning' || k === 'tip' || k === 'info') ? k : 'info') + ']\n' + combinedForCallout;
      opCounter.applied += 1;
      return prefixEachLine(calloutInner, '> ');
    }

    return roleLine + '\n' + bodyBlock;
  }

  /* ── Structure interleave helpers ─────────────────────────────────── */

  function pickInsertsBefore(structure, beforeTurnIdx, sectionMeta, dividerSeen, collapsedMode) {
    /* `beforeTurnIdx` is the 1-based turnIdx of the turn we're about to
     * emit. Section headers and dividers whose `afterTurnIdx === beforeTurnIdx - 1`
     * belong here. Returns an array of pre-rendered strings (sections
     * first, then dividers — mirrors the applier order).
     *
     * Collapsed-section marker handling depends on collapsedMode:
     *   - 'include-marked' (default) → " [collapsed — N turns]" suffix
     *   - 'include-silent'           → no marker (header rendered plain)
     *   - 'omit'                     → " [collapsed — N turns hidden]" suffix
     *     (the "hidden" wording flags that content has been dropped). */
    var out = [];
    if (!isObject(structure)) return out;
    var pos = beforeTurnIdx - 1;
    var sections = Array.isArray(structure.sections) ? structure.sections : [];
    for (var i = 0; i < sections.length; i += 1) {
      var sec = sections[i];
      if (!sec || Number(sec.afterTurnIdx) !== pos) continue;
      var meta = sectionMeta[String(sec.sectionId)];
      var suffix = '';
      if (sec.collapsed && collapsedMode !== 'include-silent') {
        var n = meta ? meta.turnCount : 0;
        var tail = (collapsedMode === 'omit') ? ' hidden' : '';
        suffix = ' [collapsed — ' + n + ' turn' + (n === 1 ? '' : 's') + tail + ']';
      }
      out.push('## ' + String(sec.title || 'Section') + suffix);
    }
    var dividers = Array.isArray(structure.dividers) ? structure.dividers : [];
    for (var d = 0; d < dividers.length; d += 1) {
      var div = dividers[d];
      if (!div || Number(div.afterTurnIdx) !== pos) continue;
      if (dividerSeen[String(div.dividerId)]) continue;
      dividerSeen[String(div.dividerId)] = true;
      out.push('---');
    }
    return out;
  }

  /* Walk turns once to count per-section membership + tag collapsed
   * sections. Mirrors the applier's per-turn-counts pass. Returns
   * { sectionMeta, collapsedSectionIds }. */
  function buildSectionMeta(turns, structure) {
    var sectionMeta = Object.create(null);
    var collapsedSet = Object.create(null);
    if (!isObject(structure)) return { sectionMeta: sectionMeta, collapsedSet: collapsedSet };
    var findContaining = H2O.Studio.overlay && H2O.Studio.overlay.findSectionContaining;
    var sections = Array.isArray(structure.sections) ? structure.sections : [];
    for (var i = 0; i < sections.length; i += 1) {
      var sec = sections[i];
      if (!sec || !sec.sectionId) continue;
      sectionMeta[String(sec.sectionId)] = { turnCount: 0, collapsed: !!sec.collapsed };
      if (sec.collapsed) collapsedSet[String(sec.sectionId)] = true;
    }
    if (typeof findContaining !== 'function') {
      return { sectionMeta: sectionMeta, collapsedSet: collapsedSet };
    }
    for (var t = 0; t < turns.length; t += 1) {
      var turn = turns[t];
      var containing = findContaining(structure, turn.turnIdx);
      if (!containing || !containing.sectionId) continue;
      var entry = sectionMeta[String(containing.sectionId)];
      if (entry) entry.turnCount += 1;
    }
    return { sectionMeta: sectionMeta, collapsedSet: collapsedSet };
  }

  /* ── Main entry — serialize ────────────────────────────────────────── */
  function serialize(snap, overlay, opts) {
    var options = isObject(opts) ? opts : {};
    var includeOverlay = options.includeOverlay !== false; /* default true */
    var includeToc = options.includeToc === true;          /* default false */
    var collapsedMode = options.collapsedMode;
    if (collapsedMode !== 'include-silent' && collapsedMode !== 'omit') {
      collapsedMode = 'include-marked';
    }

    try {
      /* Step 0 — raw turns. Used by both raw mode and overlay mode. */
      var turns = buildRawTurns(snap);
      if (!turns.length) {
        return {
          text: '',
          opsApplied: 0,
          structureApplied: false,
          tocIncluded: false,
          collapsedSections: 0,
        };
      }

      /* Step 1 — raw mode short-circuit. */
      if (!includeOverlay || !isObject(overlay)) {
        var rawParts = [];
        for (var r = 0; r < turns.length; r += 1) {
          rawParts.push(turns[r].label + '\n' + turns[r].text);
        }
        return {
          text: rawParts.join('\n\n'),
          opsApplied: 0,
          structureApplied: false,
          tocIncluded: false,
          collapsedSections: 0,
        };
      }

      var applier = H2O.Studio.overlay;
      if (!applier || typeof applier.computeMessageState !== 'function' || typeof applier.computeStructureState !== 'function') {
        /* Fall back to raw if reducers unavailable. Documented in the
         * bridge as { overlaySkipped: true, reason: 'serializer-unavailable' }
         * — this branch should be impossible in production but we
         * never throw, so degrade safely. */
        var rawParts2 = [];
        for (var r2 = 0; r2 < turns.length; r2 += 1) {
          rawParts2.push(turns[r2].label + '\n' + turns[r2].text);
        }
        return {
          text: rawParts2.join('\n\n'),
          opsApplied: 0,
          structureApplied: false,
          tocIncluded: false,
          collapsedSections: 0,
          reason: 'reducer-unavailable',
        };
      }

      /* Step 2 — structure + per-turn ops. */
      var structure = applier.computeStructureState(overlay);
      var sectionInfo = buildSectionMeta(turns, structure);
      var sectionMeta = sectionInfo.sectionMeta;
      var collapsedSectionsCount = Object.keys(sectionInfo.collapsedSet).length;
      var dividerSeen = Object.create(null);
      var opCounter = { applied: 0 };

      var pieces = [];

      /* Optional TOC at top. */
      var tocIncluded = false;
      if (includeToc) {
        var sectionsForToc = Array.isArray(structure.sections) ? structure.sections : [];
        if (sectionsForToc.length > 0) {
          var tocLines = ['## Contents'];
          for (var s = 0; s < sectionsForToc.length; s += 1) {
            var secEntry = sectionsForToc[s];
            if (!secEntry) continue;
            tocLines.push('- ' + String(secEntry.title || 'Section'));
          }
          pieces.push(tocLines.join('\n'));
          tocIncluded = true;
        }
      }

      /* Iterate turns, interleaving structure inserts before each one. */
      var findContaining = applier.findSectionContaining;
      var structureApplied = false;
      for (var i = 0; i < turns.length; i += 1) {
        var turn = turns[i];

        /* Section header + divider that sit BEFORE this turn. Inserts
         * computed once per turnIdx position; structure ops with
         * afterTurnIdx === 0 surface before turn 1. collapsedMode
         * controls the marker suffix (see pickInsertsBefore doc). */
        var inserts = pickInsertsBefore(structure, turn.turnIdx, sectionMeta, dividerSeen, collapsedMode);
        for (var ii = 0; ii < inserts.length; ii += 1) {
          pieces.push(inserts[ii]);
          structureApplied = true;
        }

        /* Collapsed-section handling. Only the 'omit' mode skips the
         * turn body; 'include-marked' (default) and 'include-silent'
         * include it. Header marker is added at structure-insert time
         * for 'include-marked'. */
        var containing = (typeof findContaining === 'function') ? findContaining(structure, turn.turnIdx) : null;
        if (collapsedMode === 'omit' && containing && containing.collapsed) {
          continue;
        }

        /* Per-message state via the Phase 2d-aware reducer. */
        var state = defaultMessageState();
        try { state = applier.computeMessageState(overlay, turn.turnIdx) || defaultMessageState(); }
        catch (e) { recordError('computeMessageState:' + turn.turnIdx, e); state = defaultMessageState(); }

        /* Phase 5d-1 — inline interval/segment state for this turn (null
         * when the reducer is unavailable; serializeTurn degrades safely). */
        var inlineState = null;
        try {
          if (typeof applier.computeInlineState === 'function') {
            inlineState = applier.computeInlineState(overlay, turn.turnIdx);
          }
        } catch (e2) { recordError('computeInlineState:' + turn.turnIdx, e2); inlineState = null; }

        var turnText = serializeTurn(turn, state, inlineState, opCounter);
        if (turnText) pieces.push(turnText);
      }

      return {
        text: pieces.join('\n\n'),
        opsApplied: opCounter.applied,
        structureApplied: structureApplied,
        tocIncluded: tocIncluded,
        collapsedSections: collapsedSectionsCount,
      };
    } catch (e) {
      recordError('serialize', e);
      /* Last-resort raw fallback so callers always get a string. */
      var safe = '';
      try { safe = serializeRaw(snap); } catch (_) { safe = ''; }
      return {
        text: safe,
        opsApplied: 0,
        structureApplied: false,
        tocIncluded: false,
        collapsedSections: 0,
        reason: 'serializer-error',
      };
    }
  }

  function selfCheck() {
    return {
      ok: errors.length === 0,
      version: VERSION,
      phase: PHASE,
      mutatesSnapshots: false,
      mutatesOverlay: false,
      readsDOM: false,
      readsStorage: false,
      hasReducers: !!(H2O.Studio.overlay
        && typeof H2O.Studio.overlay.computeMessageState === 'function'
        && typeof H2O.Studio.overlay.computeStructureState === 'function'),
      defaultIncludeOverlay: true,
      defaultIncludeToc: false,
      defaultCollapsedMode: 'include-marked',
      errors: errors.slice(),
    };
  }

  H2O.Studio.overlaySerializer = {
    __installed: true,
    version: VERSION,
    phase: PHASE,
    serialize: serialize,
    serializeRaw: serializeRaw,
    selfCheck: selfCheck,
  };
})(globalThis);
