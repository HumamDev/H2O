// @h2o/host-adapter-claude — barrel export.
//
// Stable public API surface for Phase 9A-3 scaffolding. Consumers should
// import only from this entry point unless they need a specific submodule
// (selectors, url-parser, text-extract) — those are also exported via the
// package.json `exports` map.

export {
  H2O_CLAUDE_ADAPTER_VERSION,
  H2O_CLAUDE_HOST,
  RouteKind,
  TurnRole,
} from './src/types.js';

export {
  detectContext,
  getConversationId,
  getConversationUrl,
  enumerateTurns,
  classifyTurnRole,
  extractTurnText,
  isStreaming,
  getProjectContext,
  getSidebarChats,
  createClaudeAdapter,
} from './src/claude-adapter.js';

export {
  classifyRoute,
  isClaudeAi,
  normalizeLocation,
  getConversationIdFromLocation,
  getProjectIdFromLocation,
  extractConversationIdFromHref,
  extractProjectIdFromHref,
} from './src/url-parser.js';
