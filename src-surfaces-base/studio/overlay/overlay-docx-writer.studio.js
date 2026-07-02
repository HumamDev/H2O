/* H2O Studio — Edit Overlay DOCX Writer (Phase 3c-A)
 *
 * Pure, in-house minimal DOCX writer. Builds a valid OOXML
 * (WordprocessingML) `.docx` ZIP container from a snapshot + EditOverlay
 * record, mirroring what the Phase 2e Markdown serializer does but
 * emitting paragraph/run XML inside a stored-mode (uncompressed) ZIP
 * instead of plain text.
 *
 * Strict invariants (Phase 3c-A):
 *   - NO DOM access. NO storage access. NO platform.files. NO ribbon dep.
 *   - NEVER mutates `snap` or `overlay`.
 *   - Respects the Phase 2d reducer-filter active-set model by reusing
 *     H2O.Studio.overlay.computeMessageState / computeStructureState
 *     (both already skip inactive ops via getActiveOpIdSet).
 *   - Returns a Blob + a small metadata object. Never throws — every
 *     branch catches; on internal error the writer returns a minimal
 *     valid DOCX with just the header and reports `reason: 'writer-error'`.
 *
 * Zero new runtime dependencies. No vendor library. No deflate code —
 * ZIP entries use stored mode (method 0); valid DOCX files are accepted
 * by Word, LibreOffice, Pages without compression. Larger files but
 * simpler + smaller writer footprint (~25 KB vs ~120 KB for pako+JSZip).
 *
 * Public API:
 *   H2O.Studio.overlayDocxWriter.build({ snap, overlay, headerMeta, opts }) ->
 *     {
 *       blob:    Blob (application/vnd.openxmlformats-officedocument.wordprocessingml.document),
 *       bytes:   Uint8Array,           // raw ZIP bytes (same data backing the Blob)
 *       size:    number,
 *       opsApplied: number,            // count of active per-message ops emitted
 *       structureApplied: boolean,
 *       tocIncluded: boolean,
 *       collapsedSections: number,
 *       reason?: string,               // 'writer-error' on internal failure
 *     }
 *
 *   H2O.Studio.overlayDocxWriter.selfCheck() ->
 *     { ok, version, phase, crc32Probe, hasReducers, errors }
 *
 * DOCX subset emitted:
 *   - Root: [Content_Types].xml + _rels/.rels
 *   - Body: word/document.xml (paragraphs + runs)
 *   - Styles: word/styles.xml (Title, Heading1-3, IntenseQuote, ListBullet)
 *   - Rels: word/_rels/document.xml.rels (document → styles)
 *
 * Op → DOCX mapping (mirrors Phase 2e Markdown + Phase 3a):
 *   heading H1/H2/H3 → role-label paragraph styled Heading1/2/3
 *   quote            → body paragraphs styled IntenseQuote
 *   code             → body runs with Consolas font, '\n' → <w:br/>
 *   callout          → IntenseQuote with leading bold [!kind] run
 *   clean-spacing    → text pass: collapse 3+ '\n' → 2
 *   add-section /
 *   split-section    → Heading2 paragraph with section title
 *   collapse-section → section title gets " [collapsed — N turns]" suffix
 *   page-divider     → page-break paragraph
 *   toc              → optional; Heading1 "Contents" + ListBullet per section
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  if (H2O.Studio.overlayDocxWriter && H2O.Studio.overlayDocxWriter.__installed) {
    return;
  }

  var VERSION = '0.1.0-phase-3c-a';
  var PHASE = '3c-a';
  var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  var errors = [];
  var errMax = 20;

  function recordError(op, e) {
    try {
      errors.push({ t: Date.now(), op: String(op), e: String((e && e.message) || (e && e.stack) || e || '') });
      if (errors.length > errMax) errors.splice(0, errors.length - errMax);
    } catch (_) { /* swallow */ }
  }

  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  /* ════════════════════════════════════════════════════════════════════
   * CRC32 — ISO/IEC 3309 standard (zlib / PNG / ZIP polynomial)
   * Polynomial: 0xEDB88320 (reflected)
   * Init:       0xFFFFFFFF
   * Final XOR:  0xFFFFFFFF
   * Self-check: crc32("abc") === 0x352441C2
   * ════════════════════════════════════════════════════════════════════ */

  var CRC32_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i += 1) {
      var c = i;
      for (var k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i += 1) {
      crc = (CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /* ════════════════════════════════════════════════════════════════════
   * UTF-8 encoding + little-endian byte writers + concat
   * ════════════════════════════════════════════════════════════════════ */

  var TE = (typeof global.TextEncoder === 'function') ? new global.TextEncoder() : null;

  function utf8Encode(s) {
    var str = String(s == null ? '' : s);
    if (TE) return TE.encode(str);
    /* Tiny fallback for environments without TextEncoder. */
    var out = [];
    for (var i = 0; i < str.length; i += 1) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xC0 | (c >> 6)); out.push(0x80 | (c & 0x3F)); }
      else if (c < 0xD800 || c >= 0xE000) {
        out.push(0xE0 | (c >> 12));
        out.push(0x80 | ((c >> 6) & 0x3F));
        out.push(0x80 | (c & 0x3F));
      } else {
        /* surrogate pair */
        i += 1;
        var c2 = str.charCodeAt(i);
        var cp = 0x10000 + (((c & 0x3FF) << 10) | (c2 & 0x3FF));
        out.push(0xF0 | (cp >> 18));
        out.push(0x80 | ((cp >> 12) & 0x3F));
        out.push(0x80 | ((cp >> 6) & 0x3F));
        out.push(0x80 | (cp & 0x3F));
      }
    }
    return new Uint8Array(out);
  }

  function u16le(n) { var b = new Uint8Array(2); b[0] = n & 0xFF; b[1] = (n >>> 8) & 0xFF; return b; }
  function u32le(n) {
    var b = new Uint8Array(4);
    b[0] = n & 0xFF; b[1] = (n >>> 8) & 0xFF;
    b[2] = (n >>> 16) & 0xFF; b[3] = (n >>> 24) & 0xFF;
    return b;
  }

  function concatBytes(parts) {
    var total = 0;
    for (var i = 0; i < parts.length; i += 1) total += parts[i].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < parts.length; j += 1) {
      out.set(parts[j], off);
      off += parts[j].length;
    }
    return out;
  }

  /* DOS time/date for ZIP entries — use a fixed epoch (2020-01-01 00:00:00)
   * for byte-deterministic output. ZIP consumers ignore the timestamp for
   * content; deterministic output is friendlier for testing. */
  function dosTime() { return 0x0000; }          /* 00:00:00 */
  function dosDate() {
    /* year=2020 (offset from 1980 = 40), month=1, day=1 */
    return (40 << 9) | (1 << 5) | 1;
  }

  /* ════════════════════════════════════════════════════════════════════
   * ZIP writer (stored mode, method 0)
   * ════════════════════════════════════════════════════════════════════ */

  /* Build a single ZIP entry: local header + filename + raw data.
   * Returns { local: Uint8Array, central: Uint8Array, localSize: number }
   * where local is the local-file-header + filename + data block, and
   * central is the central-directory record for this entry. The caller
   * concatenates locals + centrals + EOCD. */
  function buildZipEntry(name, dataBytes, offset) {
    var nameBytes = utf8Encode(name);
    var dataCrc = crc32(dataBytes);
    var size = dataBytes.length;

    /* Local file header (signature 0x04034b50). */
    var local = concatBytes([
      u32le(0x04034b50),
      u16le(20),         /* version needed: 2.0 (stored mode) */
      u16le(0),          /* general purpose bit flag: 0 (no UTF-8 flag — all our names are ASCII) */
      u16le(0),          /* compression method: 0 (stored) */
      u16le(dosTime()),
      u16le(dosDate()),
      u32le(dataCrc),
      u32le(size),       /* compressed size = uncompressed (stored) */
      u32le(size),
      u16le(nameBytes.length),
      u16le(0),          /* extra field length */
      nameBytes,
      dataBytes,
    ]);

    /* Central directory file header (signature 0x02014b50). */
    var central = concatBytes([
      u32le(0x02014b50),
      u16le(20),         /* version made by: 2.0 */
      u16le(20),         /* version needed: 2.0 */
      u16le(0),          /* general purpose flag */
      u16le(0),          /* compression method */
      u16le(dosTime()),
      u16le(dosDate()),
      u32le(dataCrc),
      u32le(size),
      u32le(size),
      u16le(nameBytes.length),
      u16le(0),          /* extra field length */
      u16le(0),          /* file comment length */
      u16le(0),          /* disk number start */
      u16le(0),          /* internal file attrs */
      u32le(0),          /* external file attrs */
      u32le(offset),     /* relative offset of local header */
      nameBytes,
    ]);

    return { local: local, central: central, localSize: local.length };
  }

  /* Build a stored-mode ZIP from a list of { name, bytes } entries.
   * Returns Uint8Array. Deterministic byte output. */
  function buildZip(entries) {
    var locals = [];
    var centrals = [];
    var offset = 0;
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      var dataBytes = (entry.bytes instanceof Uint8Array) ? entry.bytes : utf8Encode(String(entry.text || ''));
      var built = buildZipEntry(entry.name, dataBytes, offset);
      locals.push(built.local);
      centrals.push(built.central);
      offset += built.localSize;
    }
    var centralBlock = concatBytes(centrals);
    var cdOffset = offset;
    var cdSize = centralBlock.length;

    /* End of Central Directory record (signature 0x06054b50). */
    var eocd = concatBytes([
      u32le(0x06054b50),
      u16le(0),          /* disk number */
      u16le(0),          /* disk where CD starts */
      u16le(entries.length),  /* entries on this disk */
      u16le(entries.length),  /* total CD entries */
      u32le(cdSize),
      u32le(cdOffset),
      u16le(0),          /* zip comment length */
    ]);

    return concatBytes(locals.concat([centralBlock, eocd]));
  }

  /* ════════════════════════════════════════════════════════════════════
   * XML helpers — escape user text + strip invalid XML 1.0 chars
   * ════════════════════════════════════════════════════════════════════ */

  /* XML 1.0 allows: \t (0x09), \n (0x0A), \r (0x0D), 0x20–0xD7FF,
   * 0xE000–0xFFFD, and supplementary chars. Strip everything else. */
  function stripInvalidXmlChars(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '');
  }

  function xmlEscape(s) {
    var str = stripInvalidXmlChars(String(s == null ? '' : s));
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /* ════════════════════════════════════════════════════════════════════
   * Run + paragraph emitters — Markdown-equivalent OOXML
   * ════════════════════════════════════════════════════════════════════ */

  /* Build a <w:r> run with optional <w:rPr> properties and embedded
   * line breaks (\n → <w:br/>). The text is escaped + invalid-char
   * stripped. Empty text returns an empty string. */
  function runXml(text, rProps) {
    if (text == null || text === '') return '';
    var rPrXml = rProps ? '<w:rPr>' + rProps + '</w:rPr>' : '';
    var lines = String(text).split('\n');
    var parts = [];
    for (var i = 0; i < lines.length; i += 1) {
      if (i > 0) parts.push('<w:br/>');
      var escaped = xmlEscape(lines[i]);
      /* `xml:space="preserve"` keeps leading/trailing whitespace in the run. */
      parts.push('<w:t xml:space="preserve">' + escaped + '</w:t>');
    }
    return '<w:r>' + rPrXml + parts.join('') + '</w:r>';
  }

  /* Paragraph wrapper. styleId is optional (e.g. "Heading2"). runsXml
   * may be a string of pre-built <w:r>...</w:r> elements. An empty
   * runsXml produces an empty paragraph (visible spacing in Word). */
  function paragraphXml(styleId, runsXml) {
    var pPr = styleId ? '<w:pPr><w:pStyle w:val="' + xmlEscape(styleId) + '"/></w:pPr>' : '';
    return '<w:p>' + pPr + (runsXml || '') + '</w:p>';
  }

  /* Phase 4-3 — paragraph wrapper that supports extra <w:pPr> children.
   * Children are ordered per OOXML schema requirements:
   *   pStyle → jc → ind
   * `extraPPr` is the already-composed string of pPr child elements
   * (excluding pStyle, which is composed here from styleId). Pass '' or
   * null when no extras are needed; an empty styleId AND empty extras
   * collapses to no <w:pPr> emission (matches paragraphXml behaviour). */
  function paragraphXmlWithProps(styleId, extraPPr, runsXml) {
    var styleEl = styleId ? '<w:pStyle w:val="' + xmlEscape(styleId) + '"/>' : '';
    var extras  = extraPPr || '';
    var pPr = (styleEl || extras) ? ('<w:pPr>' + styleEl + extras + '</w:pPr>') : '';
    return '<w:p>' + pPr + (runsXml || '') + '</w:p>';
  }

  /* Phase 4-3 — compose `<w:jc>` and `<w:ind>` fragments for align +
   * indent. Returns a string suitable for embedding INSIDE <w:pPr> (the
   * caller composes pStyle before this and supplies the runs after). */
  function paragraphAlignIndPPr(state) {
    if (!state) return '';
    var parts = [];
    if (state.align === 'left' || state.align === 'center' || state.align === 'right') {
      parts.push('<w:jc w:val="' + state.align + '"/>');
    }
    var lvl = Number(state.indent);
    if (isFinite(lvl) && lvl > 0) {
      if (lvl > 3) lvl = 3;
      var twips = 720 * Math.floor(lvl);
      parts.push('<w:ind w:left="' + twips + '"/>');
    }
    return parts.join('');
  }

  /* Page-break paragraph (used by page-divider op). */
  function pageBreakParaXml() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  /* ════════════════════════════════════════════════════════════════════
   * Role label resolution + raw turn extraction
   * (Mirrors the Phase 2e overlaySerializer.buildRawTurns shape.)
   * ════════════════════════════════════════════════════════════════════ */

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
      /* Phase 5d-2 — keep `source` so inline export can reconcile the
       * inline anchor offsets (flattened rendered-text space) against the
       * trimmed body via the raw text's leading-whitespace delta. */
      out.push({ turnIdx: i + 1, role: role, label: label, text: text, source: msg });
    }
    return out;
  }

  function defaultMessageState() {
    return {
      heading: null, quote: false, code: false, callout: null, cleanSpacing: false,
      /* Phase 4-1 — message-level character formatting. */
      bold: false, italic: false, underline: false, strikethrough: false,
      /* Phase 4-2 — message-level text color. Composes with the
       * character formatting rPr via combineRProps. */
      textColor: null,
      /* Phase 4-3 — paragraph controls (DOCX honors all three).
       *   list   — emits ListBullet / ListNumber pStyle per body line.
       *   align  — emits <w:jc w:val="..."/> inside <w:pPr>.
       *   indent — emits <w:ind w:left="720|1440|2160"/> (720 twips per level). */
      list: null, align: null, indent: 0,
      /* Phase 4-4 — OneNote-style visual tags. DOCX emits a leading
       * bold colored run on the FIRST body paragraph containing the
       * glyph string. NOT Library metadata tags. */
      visualTags: {
        todo: false, important: false, question: false,
        definition: false, warning: false, idea: false,
      },
    };
  }

  /* Phase 4-4 — canonical order + glyph/color maps. Order matches the
   * applier's VISUAL_TAG_ORDER exactly so the leading run renders
   * deterministically. Colors are hex (OOXML w:color val format — no
   * leading #), pinned to match the screen + print CSS so DOCX +
   * on-screen + PDF renders look consistent. */
  var VISUAL_TAG_ORDER_DOCX = ['todo', 'important', 'question', 'definition', 'warning', 'idea'];
  var VISUAL_TAG_GLYPHS_DOCX = {
    todo: '☐', important: '❗', question: '❓',
    definition: '📖', warning: '⚠', idea: '💡',
  };
  var VISUAL_TAG_HEX = {
    todo:       '3B82F6',
    important:  'DC2626',
    question:   '7C3AED',
    definition: '0891B2',
    warning:    'D97706',
    idea:       'CA8A04',
  };
  function getVisualTagPayload(state) {
    if (!state || !state.visualTags) return null;
    var glyphs = [];
    var primaryColor = null;
    for (var i = 0; i < VISUAL_TAG_ORDER_DOCX.length; i += 1) {
      var k = VISUAL_TAG_ORDER_DOCX[i];
      if (state.visualTags[k]) {
        glyphs.push(VISUAL_TAG_GLYPHS_DOCX[k]);
        if (!primaryColor) primaryColor = VISUAL_TAG_HEX[k];
      }
    }
    if (!glyphs.length) return null;
    return { glyphText: glyphs.join(' ') + ' ', color: primaryColor };
  }

  /* Phase 4-2 — semantic text-color palette → hex (OOXML w:color values
   * are 6-char hex strings WITHOUT the # prefix). Same constants are
   * mirrored in studio.css for screen + print rendering — keeping the
   * two in sync is intentional (DOCX consumer apps render without our
   * CSS, so the colors must look reasonable on a white page). */
  var TEXT_COLOR_HEX = {
    red:    'C53030',
    green:  '2F855A',
    blue:   '2C5282',
    orange: 'C05621',
    gray:   '4A5568',
  };
  function textColorRPr(state) {
    if (!state || !state.textColor || !state.textColor.kind) return '';
    var hex = TEXT_COLOR_HEX[state.textColor.kind];
    if (!hex) return '';
    return '<w:color w:val="' + hex + '"/>';
  }

  /* Phase 8d-1b — curated font-family token → Word font face. One
   * representative face per token that renders on a white page without our
   * CSS (mirrors the studio.css screen/print stacks). Emits an <w:rFonts>
   * fragment; because rFonts MUST come first inside rPr (OOXML schema),
   * callers place fontFamilyRPr() as the BASE rProps, before charFormatRPr.
   * Code runs are excluded by the caller — they keep Consolas. */
  var FONT_FAMILY_DOCX = {
    sans:     'Calibri',
    serif:    'Cambria',
    mono:     'Consolas',
    humanist: 'Segoe UI',
  };
  function fontFamilyRPr(state) {
    if (!state || !state.fontFamily || !state.fontFamily.token) return '';
    var face = FONT_FAMILY_DOCX[state.fontFamily.token];
    if (!face) return '';
    return '<w:rFonts w:ascii="' + face + '" w:hAnsi="' + face + '" w:cs="' + face + '"/>';
  }

  /* Phase 4-1 — compose `<w:rPr>` fragments for the 4 character toggles
   * (Phase 4-2 extends with text color). Combines with any prior rPr
   * (e.g. Consolas font for code). Returns a string suitable for
   * embedding inside `<w:rPr>...</w:rPr>` (the caller wraps). Order
   * matches the OOXML schema requirement: rFonts first, then b/i/
   * strike, then u, then color — but Word is permissive about ordering
   * inside rPr, so we keep it readable. */
  function charFormatRPr(state) {
    if (!state) return '';
    var parts = [];
    if (state.bold)          parts.push('<w:b/>');
    if (state.italic)        parts.push('<w:i/>');
    if (state.strikethrough) parts.push('<w:strike/>');
    if (state.underline)     parts.push('<w:u w:val="single"/>');
    /* Phase 4-2 — text color (always at the end so consumer apps that
     * read sequentially still see the b/i/u/strike toggles first). */
    var color = textColorRPr(state);
    if (color) parts.push(color);
    return parts.join('');
  }

  /* Combine a base rProps string (e.g. font face) with the character
   * formatting fragment. Returns null when both are empty so runXml
   * skips emitting an empty <w:rPr>. */
  function combineRProps(baseRProps, charRPr) {
    var base = baseRProps || '';
    var ch   = charRPr || '';
    if (!base && !ch) return null;
    return base + ch;
  }

  /* ════════════════════════════════════════════════════════════════════
   * Phase 5d-2 — inline run segmentation (DOCX export of inline B/I/U/S/color)
   *
   * Reuses the committed pure segmenter H2O.Studio.overlay.buildInlineRuns,
   * which folds message-level character formatting (full-range base) +
   * inline interval/segment state into ordered non-overlapping runs:
   *   { text, bold, italic, underline, strikethrough, textColor }
   * Each run becomes its own <w:r> so overlapping/crossing inline ranges
   * always produce schema-valid OOXML.
   * ════════════════════════════════════════════════════════════════════ */

  /* Build a <w:rPr> fragment from a single segmenter run's flat flags.
   * Order matches charFormatRPr (b → i → strike → u → color) so message-
   * level and inline rPr are byte-order-identical. Returns '' for an
   * unstyled run (caller combines with any base font rPr). */
  function runRPr(run) {
    if (!isObject(run)) return '';
    var parts = [];
    if (run.bold)          parts.push('<w:b/>');
    if (run.italic)        parts.push('<w:i/>');
    if (run.strikethrough) parts.push('<w:strike/>');
    if (run.underline)     parts.push('<w:u w:val="single"/>');
    if (run.textColor) {
      var hex = TEXT_COLOR_HEX[run.textColor];
      if (hex) parts.push('<w:color w:val="' + hex + '"/>');
    }
    return parts.join('');
  }

  /* Split segmenter runs into a per-line array of sub-run lists so no run
   * spans a newline (the DOCX writer emits one paragraph per body line).
   * Produces exactly bodyLineCount groups (incl. blank lines) so the
   * paragraph count is unchanged from the non-inline path. A run whose
   * text contains '\n' is split across line groups, preserving its style
   * flags on each piece. */
  function splitRunsByLine(runs) {
    var lines = [[]];
    if (!Array.isArray(runs)) return lines;
    for (var i = 0; i < runs.length; i += 1) {
      var run = runs[i];
      if (!isObject(run)) continue;
      var pieces = String(run.text == null ? '' : run.text).split('\n');
      for (var p = 0; p < pieces.length; p += 1) {
        if (p > 0) lines.push([]); /* newline → start a new line group */
        var seg = pieces[p];
        if (seg !== '') {
          lines[lines.length - 1].push({
            text: seg,
            bold: !!run.bold, italic: !!run.italic,
            underline: !!run.underline, strikethrough: !!run.strikethrough,
            textColor: run.textColor || null,
          });
        }
      }
    }
    return lines;
  }

  /* Emit the <w:r> runs for one line's sub-runs. `baseRProps` is any
   * paragraph-invariant rPr (e.g. a font face) merged with each run's
   * per-run rPr. Empty-text runs are skipped by runXml. Returns '' for an
   * empty line group (blank line → empty paragraph via the caller). */
  function emitRunsXml(subRuns, baseRProps) {
    if (!Array.isArray(subRuns) || !subRuns.length) return '';
    var out = '';
    for (var i = 0; i < subRuns.length; i += 1) {
      out += runXml(subRuns[i].text, combineRProps(baseRProps || '', runRPr(subRuns[i])));
    }
    return out;
  }

  /* Detect whether an inline state has any ranges to render. */
  function inlineStateHasRanges(inlineState) {
    if (!isObject(inlineState)) return false;
    return !!(
      (Array.isArray(inlineState.bold) && inlineState.bold.length) ||
      (Array.isArray(inlineState.italic) && inlineState.italic.length) ||
      (Array.isArray(inlineState.underline) && inlineState.underline.length) ||
      (Array.isArray(inlineState.strikethrough) && inlineState.strikethrough.length) ||
      (Array.isArray(inlineState.textColor) && inlineState.textColor.length)
    );
  }

  function applyCleanSpacing(text) {
    if (typeof text !== 'string' || !text) return text || '';
    return text.replace(/\n{3,}/g, '\n\n');
  }

  /* ════════════════════════════════════════════════════════════════════
   * Per-turn DOCX paragraph emission
   *
   * Stacking order (outer → inner) mirrors the Phase 2e serializer:
   *   1. callout (wraps role+body in IntenseQuote with [!kind] leading run)
   *   2. heading (decorates role-label paragraph style)
   *   3. code    (body runs use Consolas; code wins over quote when both set)
   *   4. quote   (body uses IntenseQuote paragraph)
   *   5. clean-spacing (text pass on body)
   *
   * Returns { xml: string, opsCount: number } — opsCount is the number of
   * per-message ops that produced visible output (for the metadata
   * counter). The xml string contains one or more <w:p> elements.
   * ════════════════════════════════════════════════════════════════════ */
  function emitTurnXml(turn, state, inlineState) {
    var opsCount = 0;
    var label = turn.label;
    var body = turn.text;

    /* 5: clean-spacing — text pass first so wrappers see normalized body. */
    if (state && state.cleanSpacing) {
      var normalized = applyCleanSpacing(body);
      if (normalized !== body) opsCount += 1;
      body = normalized;
    }

    /* Phase 4-1 — message-level character formatting. Composes a
     * `<w:rPr>` fragment that gets merged with any base rProps on each
     * body run (e.g. Consolas for code). Bold/italic/underline/strike
     * decorate THE BODY — the role label stays bold (existing behaviour)
     * regardless of state.bold so it remains visually distinct. Code
     * font (Consolas) and the character toggles compose freely. */
    var charRPr = charFormatRPr(state);
    /* Phase 8d-1b — message font family as the BASE rPr (rFonts first) for
     * non-code runs. Code messages keep Consolas, so font-family is
     * suppressed there (msgFontRPr stays ''); the code branch never reads
     * msgFontRPr and hardcodes Consolas. */
    var msgFontRPr = (state && state.code) ? '' : fontFamilyRPr(state);
    if (charRPr) {
      if (state.bold)          opsCount += 1;
      if (state.italic)        opsCount += 1;
      if (state.underline)     opsCount += 1;
      if (state.strikethrough) opsCount += 1;
    }

    /* Phase 5d-2 — inline run segmentation. When the turn has inline
     * ranges (and is neither code nor clean-spacing), fold message-level +
     * inline into per-run <w:r> output via the committed buildInlineRuns
     * segmenter. `inlineLines` is a per-body-line array of sub-run lists
     * (so paragraph count is unchanged). When useInline is true the body
     * runs carry their OWN rPr (message-level folded in), so charRPr is
     * NOT additionally applied to body runs. On any reconciliation
     * failure (offset out-of-range), useInline stays false and the
     * existing single-run-per-line path runs unchanged. Inline is
     * suppressed for code (Consolas literal) and clean-spacing
     * (coordinate base shifts). */
    var useInline = false;
    var inlineLines = null;
    if (inlineStateHasRanges(inlineState) && !(state && state.code) && !(state && state.cleanSpacing)) {
      var rawText = (turn.source && turn.source.text != null) ? String(turn.source.text) : body;
      var leadingTrim = rawText.length - rawText.replace(/^\s+/, '').length;
      var builder = (H2O.Studio.overlay && typeof H2O.Studio.overlay.buildInlineRuns === 'function')
        ? H2O.Studio.overlay.buildInlineRuns : null;
      var rr = builder ? builder(body, state, inlineState, { offsetAdjust: leadingTrim }) : null;
      if (rr && rr.ok && Array.isArray(rr.runs)) {
        inlineLines = splitRunsByLine(rr.runs);
        useInline = true;
        opsCount += 1;
      }
    }

    /* 2: heading style for the role-label paragraph. */
    var headingStyle = null;
    if (state && state.heading && state.heading.level) {
      var lvl = Number(state.heading.level);
      if (lvl === 1) headingStyle = 'Heading1';
      else if (lvl === 2) headingStyle = 'Heading2';
      else if (lvl === 3) headingStyle = 'Heading3';
      if (headingStyle) opsCount += 1;
    }

    /* Phase 4-3 — paragraph controls. List forces ListBullet/ListNumber
     * pStyle for body paragraphs (overriding plain/quote, but skipped
     * when state.code is set — fenced code stays literal). Align +
     * indent compose into <w:pPr> via paragraphAlignIndPPr. All three
     * decorate THE BODY paragraphs only; the role-label paragraph keeps
     * its own style (heading or none) without align/indent. */
    var listKind = (state && state.list && !state.code && state.list.kind) ? state.list.kind : null;
    var listStyleId = null;
    if (listKind === 'bullet')   listStyleId = 'ListBullet';
    if (listKind === 'numbered') listStyleId = 'ListNumber';
    var bodyAlignIndPPr = paragraphAlignIndPPr(state);
    if (listStyleId) opsCount += 1;
    if (state && (state.align === 'left' || state.align === 'center' || state.align === 'right')) {
      opsCount += 1;
    }
    if (state && Number(state.indent) > 0) {
      opsCount += 1;
    }

    /* Phase 4-4 — visual-tag leading run. Built once per turn; prepended
     * to the FIRST body paragraph (or first body line in list/quote/
     * plain mode). The run is BOLD + colored with the primary kind's
     * hex (first canonical-order kind that's active). NOT a separate
     * paragraph — it sits inline at the head of the body run so it
     * composes cleanly with character formatting and code rPr.
     * Returns '' when no visual tags are active. */
    var vtPayload = getVisualTagPayload(state);
    var vtLeadingRun = '';
    if (vtPayload) {
      var rPrParts = ['<w:b/>'];
      if (vtPayload.color) rPrParts.push('<w:color w:val="' + vtPayload.color + '"/>');
      vtLeadingRun = '<w:r><w:rPr>' + rPrParts.join('') + '</w:rPr><w:t xml:space="preserve">'
        + xmlEscape(vtPayload.glyphText) + '</w:t></w:r>';
      opsCount += 1;
    }

    /* 1: callout wraps everything in IntenseQuote with [!kind] leading run. */
    if (state && state.callout && state.callout.kind) {
      var kind = state.callout.kind;
      opsCount += 1;
      /* code wins over quote inside callout body, same as outside. */
      var bodyHasCode = !!(state && state.code);
      var bodyHasQuote = !!(state && state.quote && !bodyHasCode);
      if (bodyHasCode) opsCount += 1;
      else if (bodyHasQuote) opsCount += 1;

      /* Compose the callout block as a sequence of IntenseQuote-styled paragraphs:
       *   [!kind] bold leading run
       *   role label run
       *   one paragraph per body line (preserves visual separation in Word) */
      var calloutXml = paragraphXml('IntenseQuote',
        runxBold('[!' + xmlEscape(kind) + ']') + runxText(' ' + label, headingStyle ? bold() : null));
      var bodyLines = String(body).split('\n');
      /* Inside callout, list style does NOT override IntenseQuote (callout
       * is more specific). Align/indent still compose into pPr.
       * Phase 4-4 — visual-tag leading run prepended to FIRST line only. */
      for (var bi = 0; bi < bodyLines.length; bi += 1) {
        var line = bodyLines[bi];
        var baseRPr = bodyHasCode ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : msgFontRPr;
        /* Phase 5d-2 — inline runs when available (code suppresses inline,
         * so bodyHasCode and useInline are mutually exclusive). */
        var lineRun = useInline ? emitRunsXml(inlineLines[bi], baseRPr) : runXml(line, combineRProps(baseRPr, charRPr));
        var firstLinePrefix = (bi === 0) ? vtLeadingRun : '';
        calloutXml += paragraphXmlWithProps('IntenseQuote', bodyAlignIndPPr, firstLinePrefix + lineRun);
      }
      return { xml: calloutXml, opsCount: opsCount };
    }

    /* No callout — emit role-label paragraph + body paragraph(s). */
    var xml = '';

    /* Role label paragraph (with heading style if present). The role
     * label stays bold regardless of state.bold — character formatting
     * applies to the BODY, not the role label, so the label remains
     * visually distinct even when the body has its own bold toggle.
     * Phase 4-3: align/indent do NOT decorate the role label either —
     * they apply to body paragraphs only, mirroring the char-format pattern. */
    xml += paragraphXml(headingStyle, runxText(label, bold()));

    /* Body.
     * Phase 4-4 — vtLeadingRun is prepended ONCE to the first body
     * paragraph (or first line in multi-line branches). All four
     * branches honor this consistently. */
    if (state && state.code) {
      opsCount += 1;
      /* One paragraph per body, with embedded <w:br/> per \n via runXml.
       * Could also split into one paragraph per line; one-paragraph is more
       * compact and Word renders embedded <w:br/> as soft line breaks.
       * Code skips list style but still honours align/indent. */
      xml += paragraphXmlWithProps(null, bodyAlignIndPPr,
        vtLeadingRun + runXml(body, combineRProps('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>', charRPr)));
    } else if (listStyleId) {
      /* List wins over quote when both set (list is more specific). One
       * paragraph per body line, each with the ListBullet / ListNumber
       * pStyle. Word's default numbering definition renders ListNumber as
       * decimal; consumers may swap in their own numPr — we keep it
       * minimal. */
      var listLines = String(body).split('\n');
      for (var li = 0; li < listLines.length; li += 1) {
        var listLinePrefix = (li === 0) ? vtLeadingRun : '';
        var listLineRun = useInline ? emitRunsXml(inlineLines[li], msgFontRPr) : runXml(listLines[li], combineRProps(msgFontRPr, charRPr) || null);
        xml += paragraphXmlWithProps(listStyleId, bodyAlignIndPPr, listLinePrefix + listLineRun);
      }
    } else if (state && state.quote) {
      opsCount += 1;
      var quoteLines = String(body).split('\n');
      for (var qi = 0; qi < quoteLines.length; qi += 1) {
        var quoteLinePrefix = (qi === 0) ? vtLeadingRun : '';
        var quoteLineRun = useInline ? emitRunsXml(inlineLines[qi], msgFontRPr) : runXml(quoteLines[qi], combineRProps(msgFontRPr, charRPr) || null);
        xml += paragraphXmlWithProps('IntenseQuote', bodyAlignIndPPr, quoteLinePrefix + quoteLineRun);
      }
    } else {
      /* Plain — one paragraph per body line so newlines render. */
      var plainLines = String(body).split('\n');
      for (var pi = 0; pi < plainLines.length; pi += 1) {
        var plainLinePrefix = (pi === 0) ? vtLeadingRun : '';
        var plainLineRun = useInline ? emitRunsXml(inlineLines[pi], msgFontRPr) : runXml(plainLines[pi], combineRProps(msgFontRPr, charRPr) || null);
        xml += paragraphXmlWithProps(null, bodyAlignIndPPr, plainLinePrefix + plainLineRun);
      }
    }
    return { xml: xml, opsCount: opsCount };
  }

  /* Convenience helpers. */
  function bold() { return '<w:b/>'; }
  function italic() { return '<w:i/>'; }
  function runxText(text, rProps) { return runXml(text, rProps); }
  function runxBold(text) { return runXml(text, bold()); }

  /* ════════════════════════════════════════════════════════════════════
   * Structure interleave + section-meta walk
   * ════════════════════════════════════════════════════════════════════ */

  function buildSectionMeta(turns, structure) {
    var sectionMeta = Object.create(null);
    if (!isObject(structure)) return sectionMeta;
    var findContaining = H2O.Studio.overlay && H2O.Studio.overlay.findSectionContaining;
    var sections = Array.isArray(structure.sections) ? structure.sections : [];
    for (var i = 0; i < sections.length; i += 1) {
      var sec = sections[i];
      if (!sec || !sec.sectionId) continue;
      sectionMeta[String(sec.sectionId)] = { turnCount: 0, collapsed: !!sec.collapsed };
    }
    if (typeof findContaining !== 'function') return sectionMeta;
    for (var t = 0; t < turns.length; t += 1) {
      var containing = findContaining(structure, turns[t].turnIdx);
      if (!containing || !containing.sectionId) continue;
      var entry = sectionMeta[String(containing.sectionId)];
      if (entry) entry.turnCount += 1;
    }
    return sectionMeta;
  }

  /* Returns an array of inserts (XML strings) that should appear BEFORE
   * the turn with the given turnIdx (1-based). Mirrors the Phase 2e
   * serializer pickInsertsBefore — sections first, then dividers.
   * dividerSeen[] dedupes dividers across calls. */
  function pickInsertsBefore(structure, beforeTurnIdx, sectionMeta, dividerSeen, collapsedMode) {
    var out = [];
    if (!isObject(structure)) return out;
    var pos = beforeTurnIdx - 1;
    var sections = Array.isArray(structure.sections) ? structure.sections : [];
    for (var i = 0; i < sections.length; i += 1) {
      var sec = sections[i];
      if (!sec || Number(sec.afterTurnIdx) !== pos) continue;
      var title = String(sec.title || 'Section');
      var meta = sectionMeta[String(sec.sectionId)];
      if (sec.collapsed && collapsedMode !== 'include-silent') {
        var n = meta ? meta.turnCount : 0;
        var tail = (collapsedMode === 'omit') ? ' hidden' : '';
        title += ' [collapsed — ' + n + ' turn' + (n === 1 ? '' : 's') + tail + ']';
      }
      out.push(paragraphXml('Heading2', runxText(title, null)));
    }
    var dividers = Array.isArray(structure.dividers) ? structure.dividers : [];
    for (var d = 0; d < dividers.length; d += 1) {
      var div = dividers[d];
      if (!div || Number(div.afterTurnIdx) !== pos) continue;
      if (dividerSeen[String(div.dividerId)]) continue;
      dividerSeen[String(div.dividerId)] = true;
      out.push(pageBreakParaXml());
    }
    return out;
  }

  /* ════════════════════════════════════════════════════════════════════
   * Header block emit (title + metadata)
   * ════════════════════════════════════════════════════════════════════ */

  function buildHeaderBlockXml(headerMeta) {
    var meta = isObject(headerMeta) ? headerMeta : {};
    var title = String(meta.title || 'Studio transcript');
    var date;
    var rawDate = String(meta.capturedDate || '');
    if (rawDate && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) date = rawDate.slice(0, 10);
    else {
      var d = new Date();
      date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    var src = String(meta.originalUrl == null ? '' : meta.originalUrl).trim();
    var chatId = String(meta.chatId == null ? '' : meta.chatId).trim();

    var xml = '';
    xml += paragraphXml('Title', runxText(title, null));
    xml += paragraphXml(null, runxText('Captured: ' + date, italic()));
    if (src) xml += paragraphXml(null, runxText('Source: ' + src, italic()));
    if (chatId) xml += paragraphXml(null, runxText('Chat ID: ' + chatId, italic()));
    /* Spacer before body. */
    xml += paragraphXml(null, '');
    return xml;
  }

  /* ════════════════════════════════════════════════════════════════════
   * Optional TOC emit
   * ════════════════════════════════════════════════════════════════════ */

  function buildTocXml(structure) {
    var sections = (isObject(structure) && Array.isArray(structure.sections)) ? structure.sections : [];
    if (sections.length === 0) return { xml: '', included: false };
    var xml = paragraphXml('Heading1', runxText('Contents', null));
    for (var i = 0; i < sections.length; i += 1) {
      var sec = sections[i];
      if (!sec) continue;
      xml += paragraphXml('ListBullet', runxText(String(sec.title || 'Section'), null));
    }
    return { xml: xml, included: true };
  }

  /* ════════════════════════════════════════════════════════════════════
   * Static DOCX parts (Content_Types + rels + styles)
   * ════════════════════════════════════════════════════════════════════ */

  function contentTypesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '</Types>';
  }

  function rootRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '</Relationships>';
  }

  function documentRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';
  }

  function stylesXml() {
    /* Minimal styles declarations. Word + LibreOffice apply their default
     * theme for each named style — we don't override visual properties,
     * so the styles render whatever the consumer's theme provides. */
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:qFormat/></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:qFormat/></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:qFormat/></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:qFormat/></w:style>'
      + '<w:style w:type="paragraph" w:styleId="IntenseQuote"><w:name w:val="Intense Quote"/><w:qFormat/></w:style>'
      + '<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:qFormat/></w:style>'
      + '<w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:qFormat/></w:style>'
      + '</w:styles>';
  }

  function buildDocumentXml(bodyInnerXml) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:body>'
      + (bodyInnerXml || '')
      + '</w:body>'
      + '</w:document>';
  }

  /* ════════════════════════════════════════════════════════════════════
   * Main entry — build
   * ════════════════════════════════════════════════════════════════════ */

  function build(input) {
    var safeInput = isObject(input) ? input : {};
    var snap = safeInput.snap || null;
    var overlay = safeInput.overlay || null;
    var headerMeta = isObject(safeInput.headerMeta) ? safeInput.headerMeta : {};
    var options = isObject(safeInput.opts) ? safeInput.opts : {};
    var includeOverlay = options.includeOverlay !== false; /* default true */
    var includeToc = options.includeToc === true;          /* default false */
    var collapsedMode = options.collapsedMode;
    if (collapsedMode !== 'include-silent' && collapsedMode !== 'omit') {
      collapsedMode = 'include-marked';
    }

    var result = {
      opsApplied: 0,
      structureApplied: false,
      tocIncluded: false,
      collapsedSections: 0,
    };

    try {
      var turns = buildRawTurns(snap);
      var applier = H2O.Studio.overlay;
      var useReducers = !!(includeOverlay && isObject(overlay) && applier
        && typeof applier.computeMessageState === 'function'
        && typeof applier.computeStructureState === 'function');

      var bodyXml = '';

      /* Header block always emitted. Title falls back to snap.title if not
       * provided in headerMeta. */
      var effectiveHeader = Object.assign({}, headerMeta);
      if (!effectiveHeader.title) effectiveHeader.title = (snap && snap.title) || '';
      if (!effectiveHeader.capturedDate && snap && snap.capturedAt) {
        effectiveHeader.capturedDate = String(snap.capturedAt).slice(0, 10);
      }
      if (!effectiveHeader.chatId && snap && snap.chatId) effectiveHeader.chatId = snap.chatId;
      bodyXml += buildHeaderBlockXml(effectiveHeader);

      /* Optional TOC. */
      if (useReducers && includeToc) {
        var structureForToc = applier.computeStructureState(overlay);
        var toc = buildTocXml(structureForToc);
        bodyXml += toc.xml;
        result.tocIncluded = toc.included;
      }

      /* Body — walk turns, interleave structure inserts, emit DOCX per turn. */
      if (turns.length > 0) {
        if (useReducers) {
          var structure = applier.computeStructureState(overlay);
          var sectionMeta = buildSectionMeta(turns, structure);
          var dividerSeen = Object.create(null);
          result.collapsedSections = Object.keys(sectionMeta).filter(function (k) { return sectionMeta[k].collapsed; }).length;

          for (var ti = 0; ti < turns.length; ti += 1) {
            var turn = turns[ti];

            /* Structure inserts before this turn. */
            var inserts = pickInsertsBefore(structure, turn.turnIdx, sectionMeta, dividerSeen, collapsedMode);
            for (var ii = 0; ii < inserts.length; ii += 1) {
              bodyXml += inserts[ii];
              result.structureApplied = true;
            }

            /* Skip the body of collapsed turns in 'omit' mode. */
            var containing = (applier.findSectionContaining)
              ? applier.findSectionContaining(structure, turn.turnIdx)
              : null;
            if (collapsedMode === 'omit' && containing && containing.collapsed) {
              continue;
            }

            var state = defaultMessageState();
            try { state = applier.computeMessageState(overlay, turn.turnIdx) || defaultMessageState(); }
            catch (e) { recordError('computeMessageState:' + turn.turnIdx, e); }

            /* Phase 5d-2 — inline interval/segment state for this turn
             * (null when the reducer is unavailable; emitTurnXml degrades
             * to the message-level path). */
            var inlineState = null;
            try {
              if (typeof applier.computeInlineState === 'function') {
                inlineState = applier.computeInlineState(overlay, turn.turnIdx);
              }
            } catch (e4) { recordError('computeInlineState:' + turn.turnIdx, e4); inlineState = null; }

            var emitted = emitTurnXml(turn, state, inlineState);
            bodyXml += emitted.xml;
            result.opsApplied += emitted.opsCount;
          }
        } else {
          /* Raw mode — no overlay, no reducers. Just one paragraph per
           * turn body line, prefixed by the role label. */
          for (var rti = 0; rti < turns.length; rti += 1) {
            var rt = turns[rti];
            bodyXml += paragraphXml(null, runxText(rt.label, bold()));
            var rLines = String(rt.text).split('\n');
            for (var rli = 0; rli < rLines.length; rli += 1) {
              bodyXml += paragraphXml(null, runxText(rLines[rli], null));
            }
          }
        }
      }

      var entries = [
        { name: '[Content_Types].xml',          bytes: utf8Encode(contentTypesXml()) },
        { name: '_rels/.rels',                  bytes: utf8Encode(rootRelsXml()) },
        { name: 'word/_rels/document.xml.rels', bytes: utf8Encode(documentRelsXml()) },
        { name: 'word/document.xml',            bytes: utf8Encode(buildDocumentXml(bodyXml)) },
        { name: 'word/styles.xml',              bytes: utf8Encode(stylesXml()) },
      ];
      var zipBytes = buildZip(entries);
      var blob;
      try { blob = new global.Blob([zipBytes], { type: DOCX_MIME }); }
      catch (_) { blob = null; }

      return Object.assign(result, {
        blob: blob,
        bytes: zipBytes,
        size: zipBytes.length,
      });
    } catch (e) {
      recordError('build', e);
      /* Last-resort fallback — emit a minimal valid DOCX with just the
       * header so the user gets *something*. */
      try {
        var fallbackBody = buildHeaderBlockXml({ title: 'Studio transcript' });
        var fbEntries = [
          { name: '[Content_Types].xml',          bytes: utf8Encode(contentTypesXml()) },
          { name: '_rels/.rels',                  bytes: utf8Encode(rootRelsXml()) },
          { name: 'word/_rels/document.xml.rels', bytes: utf8Encode(documentRelsXml()) },
          { name: 'word/document.xml',            bytes: utf8Encode(buildDocumentXml(fallbackBody)) },
          { name: 'word/styles.xml',              bytes: utf8Encode(stylesXml()) },
        ];
        var fbBytes = buildZip(fbEntries);
        var fbBlob = null;
        try { fbBlob = new global.Blob([fbBytes], { type: DOCX_MIME }); } catch (_) {}
        return {
          blob: fbBlob, bytes: fbBytes, size: fbBytes.length,
          opsApplied: 0, structureApplied: false, tocIncluded: false, collapsedSections: 0,
          reason: 'writer-error',
        };
      } catch (_) {
        /* Truly nothing we can do — return an empty shape. */
        return {
          blob: null, bytes: new Uint8Array(0), size: 0,
          opsApplied: 0, structureApplied: false, tocIncluded: false, collapsedSections: 0,
          reason: 'writer-error',
        };
      }
    }
  }

  /* ════════════════════════════════════════════════════════════════════
   * selfCheck — boot-time sanity probe
   * ════════════════════════════════════════════════════════════════════ */

  function selfCheck() {
    var probe = 0;
    var probeOk = false;
    try {
      probe = crc32(utf8Encode('abc'));
      probeOk = (probe === 0x352441C2);
    } catch (e) { recordError('selfCheck:crc32', e); probeOk = false; }
    return {
      ok: probeOk && errors.length === 0,
      version: VERSION,
      phase: PHASE,
      mutatesSnapshots: false,
      mutatesOverlay: false,
      readsDOM: false,
      readsStorage: false,
      docxMime: DOCX_MIME,
      crc32Probe: { input: 'abc', got: '0x' + probe.toString(16).toUpperCase().padStart(8, '0'), expected: '0x352441C2', ok: probeOk },
      hasReducers: !!(H2O.Studio.overlay
        && typeof H2O.Studio.overlay.computeMessageState === 'function'
        && typeof H2O.Studio.overlay.computeStructureState === 'function'),
      defaultIncludeOverlay: true,
      defaultIncludeToc: false,
      defaultCollapsedMode: 'include-marked',
      errors: errors.slice(),
    };
  }

  H2O.Studio.overlayDocxWriter = {
    __installed: true,
    version: VERSION,
    phase: PHASE,
    docxMime: DOCX_MIME,
    build: build,
    selfCheck: selfCheck,
    /* Pure helpers exposed for sandbox tests. Not part of the public
     * contract; prefer `build()` from production callers. */
    _crc32: crc32,
    _buildZip: buildZip,
    _xmlEscape: xmlEscape,
    _stripInvalidXmlChars: stripInvalidXmlChars,
  };
})(globalThis);
