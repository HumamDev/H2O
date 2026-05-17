// Minimal markdown tokenizer for ChatGPT chat content.
// Block types: headings, paragraphs, fenced code blocks, unordered lists, ordered lists, hr.
// Inline types: bold, italic, inline code, plain text.
// Not a full CommonMark implementation — covers the 90% case of typical ChatGPT responses.

export type InlineToken =
  | { t: 'text'; v: string }
  | { t: 'bold'; children: InlineToken[] }
  | { t: 'italic'; children: InlineToken[] }
  | { t: 'code'; v: string };

export type BlockToken =
  | { t: 'heading'; level: 1 | 2 | 3; inline: InlineToken[] }
  | { t: 'paragraph'; inline: InlineToken[] }
  | { t: 'code_block'; lang: string; code: string }
  | { t: 'ul'; items: InlineToken[][] }
  | { t: 'ol'; items: InlineToken[][] }
  | { t: 'hr' };

// Cursor-based inline parser — avoids global-regex lastIndex issues and handles
// orphaned markers gracefully. Processes the string left-to-right one token at a time.
function parseInline(text: string): InlineToken[] {
  const result: InlineToken[] = [];
  let s = text;

  while (s.length > 0) {
    // Inline code: `code`
    if (s[0] === '`') {
      const end = s.indexOf('`', 1);
      if (end > 0) {
        result.push({ t: 'code', v: s.slice(1, end) });
        s = s.slice(end + 1);
        continue;
      }
    }

    // Bold: **text** (check before single * to avoid false matches)
    if (s.startsWith('**')) {
      const end = s.indexOf('**', 2);
      if (end > 2) {
        result.push({ t: 'bold', children: parseInline(s.slice(2, end)) });
        s = s.slice(end + 2);
        continue;
      }
    }

    // Italic: *text* — single asterisk, not followed by another *
    if (s[0] === '*' && s[1] !== '*') {
      const end = s.indexOf('*', 1);
      if (end > 1) {
        result.push({ t: 'italic', children: parseInline(s.slice(1, end)) });
        s = s.slice(end + 1);
        continue;
      }
    }

    // Italic: _text_ — underscore style
    if (s[0] === '_' && s[1] !== '_') {
      const end = s.indexOf('_', 1);
      if (end > 1) {
        result.push({ t: 'italic', children: parseInline(s.slice(1, end)) });
        s = s.slice(end + 1);
        continue;
      }
    }

    // Plain text — consume up to the next potential marker character
    const nextMarker = s.search(/[`*_]/);
    if (nextMarker > 0) {
      result.push({ t: 'text', v: s.slice(0, nextMarker) });
      s = s.slice(nextMarker);
    } else {
      // No more markers — rest is plain text (or orphaned marker consumed as text)
      result.push({ t: 'text', v: s });
      break;
    }
  }

  return result;
}

export function parseMarkdown(text: string): BlockToken[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: BlockToken[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block (``` or ~~~)
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2].trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      blocks.push({ t: 'code_block', lang, code: codeLines.join('\n') });
      continue;
    }

    // ATX heading (# ## ###)
    const headingMatch = line.match(/^(#{1,3})[ \t]+(.+?)[ \t]*$/);
    if (headingMatch) {
      const raw = Math.min(headingMatch[1].length, 3);
      const level = raw as 1 | 2 | 3;
      blocks.push({ t: 'heading', level, inline: parseInline(headingMatch[2]) });
      i++;
      continue;
    }

    // Horizontal rule (--- or === or *** as a standalone line)
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }

    // Unordered list (-, *, + with space)
    if (/^[ \t]*[-*+][ \t]/.test(line)) {
      const items: InlineToken[][] = [];
      while (i < lines.length && /^[ \t]*[-*+][ \t]/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^[ \t]*[-*+][ \t]+/, '')));
        i++;
      }
      blocks.push({ t: 'ul', items });
      continue;
    }

    // Ordered list (1. 2. etc.)
    if (/^[ \t]*\d+\.[ \t]/.test(line)) {
      const items: InlineToken[][] = [];
      while (i < lines.length && /^[ \t]*\d+\.[ \t]/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^[ \t]*\d+\.[ \t]+/, '')));
        i++;
      }
      blocks.push({ t: 'ol', items });
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect until a blank line or block-level element starts
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === '') break;
      if (/^(`{3,}|~{3,})/.test(l)) break;
      if (/^#{1,3}[ \t]/.test(l)) break;
      if (/^[-*_]{3,}\s*$/.test(l.trim())) break;
      if (/^[ \t]*[-*+][ \t]/.test(l)) break;
      if (/^[ \t]*\d+\.[ \t]/.test(l)) break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ t: 'paragraph', inline: parseInline(paraLines.join(' ')) });
    }
  }

  return blocks;
}
