// @h2o/host-adapter-claude — selector constants.
//
// Phase 9A-3: hypothesis-grade selectors. Each is annotated with its 9A-2
// CLAUDE_DOM_NOTES.md row reference. Operator verification of the live
// selector table is what graduates a hypothesis from "candidate" to "adopted".
//
// Convention:
// - Primary selectors come from URL / ARIA / role / href / contenteditable.
// - Tailwind class fragments are AVOIDED as primary selectors (volatility).
// - Every DOM selector is paired with a fallback predicate in claude-adapter.js.
//
// Update protocol: when a selector is empirically falsified, update this file
// AND the matching CLAUDE_DOM_NOTES.md §6 row in the same commit.

// ── URL patterns ───────────────────────────────────────────────────────────

/** Matches the per-conversation UUID v4 in /chat/<id> or /conversations/<id>. */
export const CONV_PATH_RE = /\/(?:chat|conversations)\/([0-9a-f-]{36})/i;

/** Matches the project segment: /projects/<projectId>(/...) */
export const PROJ_PATH_RE = /\/projects\/([^/]+)/;

/** Matches the empty-composer route /new (with optional trailing slash). */
export const NEW_PATH_RE = /^\/new\/?$/;

/** Hostname check (subdomain-tolerant). */
export const CLAUDE_HOST_RE = /(?:^|\.)claude\.ai$/i;

// ── Page landmarks ─────────────────────────────────────────────────────────

/** Conversation root. CLAUDE_DOM_NOTES.md §6 row 1. */
export const CONVERSATION_ROOT_SELECTOR = 'main';

/** Sidebar/nav container holding conversation links. §6 rows 14-15. */
export const SIDEBAR_SELECTOR = 'nav,[role="navigation"]';

/** ProseMirror composer (contenteditable=true). §6 row 11. */
export const COMPOSER_SELECTOR = '[contenteditable="true"]';

// ── Turn-boundary selectors (layered predicate; see claude-adapter.js) ────

/** Primary turn-boundary anchor: any element with role="article". §6 row 4. */
export const TURN_PRIMARY_SELECTOR = '[role="article"]';

/** Avatar markers used by the fallback turn predicate. §6 rows 6-7. */
export const ASSISTANT_AVATAR_SELECTOR =
  'svg[aria-label*="claude" i],svg[aria-label*="anthropic" i]';

/** User-initials avatar predicate (programmatic — text-content based). */
export function isUserInitialsBlock(el) {
  if (!el || el.children?.length) return false;
  const t = (el.textContent || '').trim();
  return /^[A-Z]{1,2}$/.test(t);
}

// ── Send / Stop / Generation controls ──────────────────────────────────────

/** Send-message button. §6 row 12. */
export const SEND_BUTTON_SELECTOR =
  'button[aria-label*="send" i]:not([aria-label*="cancel" i])';

/** Stop-generation button. Visible only while streaming. §6 row 13. */
export const STOP_BUTTON_SELECTOR = 'button[aria-label*="stop" i]';

// ── Content features ───────────────────────────────────────────────────────

/** Code block (highlight.js / Prism convention). §6 rows 9-10. */
export const CODE_BLOCK_SELECTOR = 'pre > code';

/** Inline file/attachment reference. §6 row 19. */
export const ATTACHMENT_SELECTOR =
  'a[href*=".pdf" i],[aria-label*="attachment" i],[aria-label*="file" i]';

/** Image attachment in main column (excludes avatars). §6 row 18. */
export const IMAGE_SELECTOR = 'img:not([alt*="avatar" i])';

/** Artifact panel hints. §6 rows 16-17. */
export const ARTIFACT_PANEL_SELECTOR =
  '[aria-label*="artifact" i],[role="complementary"]';

/** Breadcrumb container (project context). §6 row 3. */
export const BREADCRUMB_SELECTOR = 'nav[aria-label*="breadcrumb" i]';

// ── Sidebar link patterns ──────────────────────────────────────────────────

/** Conversation links in the sidebar nav. §6 row 14. */
export const SIDEBAR_CONV_LINK_SELECTOR =
  'a[href*="/chat/"], a[href*="/conversations/"]';

/** Project links in the sidebar nav. §6 row 15. */
export const SIDEBAR_PROJECT_LINK_SELECTOR = 'a[href*="/projects/"]';
