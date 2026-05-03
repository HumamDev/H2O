# @h2o-studio/core

Platform-agnostic business logic for H2O Studio.

## Contents

- `src/normalization/` — parse ChatGPT export JSON into `ConversationSnapshot`
- `src/snapshot/` — snapshot diff, merge, clone utilities
- `src/chats/` — chat domain logic (sort, filter, preview)
- `src/folders/` — folder domain logic
- `src/messages/` — message/turn projection logic
- `src/import-export/` — shared ZIP / JSON pipeline helpers
- `src/migrations/` — versioned snapshot schema migration runner
- `src/search/` — FTS tokenization and query building
- `src/utils/` — shared utilities

## Design principle

No platform-specific imports (no `react-native`, `expo-*`, or `react`). Pure TypeScript. Testable in Node.
