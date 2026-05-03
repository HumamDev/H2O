# @h2o-studio/types

Shared TypeScript types for the H2O Studio ecosystem.

## Contents

- `src/snapshot.ts` — `ConversationSnapshot`, `Turn`, `TurnContent` — the canonical on-device representation of a chat
- `src/chat.ts` — `Chat` — library record with user-facing metadata
- `src/folder.ts` — `Folder` — named collection of chats
- `src/message.ts` — `Message` — flat turn projection for SQLite / FTS

## Usage

This package has no runtime code — types only. Import directly from TypeScript source.

```ts
import type { ConversationSnapshot, Chat } from '@h2o-studio/types';
```
