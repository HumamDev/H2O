# H2O Studio — Mobile App

iPhone-first React Native / Expo app for browsing, searching, and reading your saved ChatGPT conversations.

## Stack

- Expo SDK 55 + Expo Router (file-based routing)
- React Native 0.83
- TypeScript (strict)
- SQLite via `expo-sqlite` (planned)

## Getting started

```bash
cd apps/studio-mobile
npm install
npm run ios        # open in iOS Simulator
npm run android    # open in Android emulator
npm run web        # run in browser
```

## Folder map

| Folder | Purpose |
|--------|---------|
| `src/app/` | Expo Router file-based routes |
| `src/components/` | Shared UI components |
| `src/features/` | Domain feature modules |
| `src/db/` | SQLite schema, migrations, queries |
| `src/repositories/` | Data access layer |
| `src/parser/` | ChatGPT JSON → snapshot normalizer |
| `src/renderer/` | Transcript → React Native nodes |
| `src/importers/` | Import pipelines (ZIP, JSON) |
| `src/exporters/` | Export pipelines |
| `src/search/` | Full-text search index |
| `src/sync/` | Remote sync (future) |
| `src/theme/` | Design tokens |

## Development status

This is a reserved scaffold. Screens are placeholders — see `TODO` comments in each feature file for the next steps.
