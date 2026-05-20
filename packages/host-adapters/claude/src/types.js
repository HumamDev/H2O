// @h2o/host-adapter-claude — runtime type tokens + small constants.
//
// JSDoc typedefs only; no values besides the version constant + role enum.
// Downstream TypeScript consumers should rely on types.d.ts (which re-states
// these via real `interface` declarations).

/** Package version. Bump when the contract changes. */
export const H2O_CLAUDE_ADAPTER_VERSION = '0.1.0';

/**
 * Host identifier used in Studio's `host` schema column (planned 9A-3 SQLite
 * migration v6) + in `chrome.storage.local` namespace keys.
 */
export const H2O_CLAUDE_HOST = 'claude.ai';

/** Roles the adapter classifies turns as. */
export const TurnRole = Object.freeze({
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  UNKNOWN: 'unknown',
});

/** Route kinds the adapter classifies pages as. */
export const RouteKind = Object.freeze({
  NEW: 'new',
  CHAT: 'chat',
  PROJECT_CHAT: 'project-chat',
  PROJECT: 'project',
  UNKNOWN: 'unknown',
});

/**
 * @typedef {Object} HostContext
 * @property {string} host - always "claude.ai" for this adapter
 * @property {boolean} isClaudeAi
 * @property {'new'|'chat'|'project-chat'|'project'|'unknown'} routeKind
 * @property {string|null} conversationId
 * @property {string|null} projectId
 * @property {string} url
 */

/**
 * @typedef {Object} HostTurn
 * @property {string|null} id
 * @property {'user'|'assistant'|'system'|'unknown'} role
 * @property {number} order
 * @property {string} text
 * @property {string} [markdown]
 * @property {string} [html]
 * @property {Element|null} [element]
 * @property {boolean} [isPartial]
 * @property {boolean} [hasCode]
 * @property {boolean} [hasAttachment]
 * @property {boolean} [hasArtifactRef]
 */

/**
 * @typedef {Object} SidebarChat
 * @property {string|null} id
 * @property {string} title
 * @property {string} href
 * @property {string|null} projectId
 */

/**
 * @typedef {Object} ProjectContext
 * @property {string} projectId
 * @property {string|null} projectName
 */

/**
 * @typedef {Object} ClaudeAdapter
 * @property {(doc?: Document) => HostContext} detectContext
 * @property {(doc?: Document) => string|null} getConversationId
 * @property {(doc?: Document) => string} getConversationUrl
 * @property {(doc?: Document) => HostTurn[]} enumerateTurns
 * @property {(el: Element|null|undefined) => 'user'|'assistant'|'system'|'unknown'} classifyTurnRole
 * @property {(el: Element|null|undefined) => {text: string, markdown: string, html: string}} extractTurnText
 * @property {(doc?: Document) => boolean} isStreaming
 * @property {(doc?: Document) => ProjectContext|null} getProjectContext
 * @property {(doc?: Document) => SidebarChat[]} getSidebarChats
 * @property {string} version
 * @property {string} host
 */
