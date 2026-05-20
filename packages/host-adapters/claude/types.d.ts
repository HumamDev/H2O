// @h2o/host-adapter-claude — TypeScript declarations.
//
// The runtime is pure JavaScript ESM (so it can be loaded directly into a
// chrome content script without a build step). This .d.ts gives TypeScript
// consumers (Studio Mobile, future workspace packages) full type safety.

export const H2O_CLAUDE_ADAPTER_VERSION: '0.1.0';
export const H2O_CLAUDE_HOST: 'claude.ai';

export type RouteKindValue =
  | 'new'
  | 'chat'
  | 'project-chat'
  | 'project'
  | 'unknown';

export const RouteKind: Readonly<{
  NEW: 'new';
  CHAT: 'chat';
  PROJECT_CHAT: 'project-chat';
  PROJECT: 'project';
  UNKNOWN: 'unknown';
}>;

export type TurnRoleValue = 'user' | 'assistant' | 'system' | 'unknown';

export const TurnRole: Readonly<{
  USER: 'user';
  ASSISTANT: 'assistant';
  SYSTEM: 'system';
  UNKNOWN: 'unknown';
}>;

export interface HostContext {
  host: 'claude.ai';
  isClaudeAi: boolean;
  routeKind: RouteKindValue;
  conversationId: string | null;
  projectId: string | null;
  url: string;
}

export interface HostTurn {
  id: string | null;
  role: TurnRoleValue;
  order: number;
  text: string;
  markdown?: string;
  html?: string;
  element?: Element | null;
  isPartial?: boolean;
  hasCode?: boolean;
  hasAttachment?: boolean;
  hasArtifactRef?: boolean;
}

export interface SidebarChat {
  id: string | null;
  title: string;
  href: string;
  projectId: string | null;
}

export interface ProjectContext {
  projectId: string;
  projectName: string | null;
}

export interface ExtractedTurnText {
  text: string;
  markdown: string;
  html: string;
}

export interface ClaudeAdapter {
  readonly version: string;
  readonly host: 'claude.ai';
  detectContext(doc?: Document): HostContext;
  getConversationId(doc?: Document): string | null;
  getConversationUrl(doc?: Document): string;
  enumerateTurns(doc?: Document): HostTurn[];
  classifyTurnRole(el: Element | null | undefined): TurnRoleValue;
  extractTurnText(el: Element | null | undefined): ExtractedTurnText;
  isStreaming(doc?: Document): boolean;
  getProjectContext(doc?: Document): ProjectContext | null;
  getSidebarChats(doc?: Document): SidebarChat[];
}

// Standalone functional exports (mirrors the adapter object's methods).
export function detectContext(doc?: Document): HostContext;
export function getConversationId(doc?: Document): string | null;
export function getConversationUrl(doc?: Document): string;
export function enumerateTurns(doc?: Document): HostTurn[];
export function classifyTurnRole(el: Element | null | undefined): TurnRoleValue;
export function extractTurnText(el: Element | null | undefined): ExtractedTurnText;
export function isStreaming(doc?: Document): boolean;
export function getProjectContext(doc?: Document): ProjectContext | null;
export function getSidebarChats(doc?: Document): SidebarChat[];

export function createClaudeAdapter(): ClaudeAdapter;

// URL helpers.
export interface LocationShape {
  href?: string;
  pathname?: string;
  hostname?: string;
}

export function classifyRoute(
  src: string | LocationShape | Document | null | undefined
): RouteKindValue;

export function isClaudeAi(
  src: string | LocationShape | Document | null | undefined
): boolean;

export function normalizeLocation(
  src: string | LocationShape | Document | null | undefined
): Required<LocationShape>;

export function getConversationIdFromLocation(
  src: string | LocationShape | Document | null | undefined
): string | null;

export function getProjectIdFromLocation(
  src: string | LocationShape | Document | null | undefined
): string | null;

export function extractConversationIdFromHref(href: string): string | null;
export function extractProjectIdFromHref(href: string): string | null;
