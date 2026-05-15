# @h2o-studio/ui

Shared design tokens and UI primitives for H2O Studio.

## Contents

- `src/icons/` — shared React SVG icon components
- `src/tokens/` — `Colors`, `Spacing`, `Radius` design tokens
- `src/types/` — shared UI prop types

## Design principle

Tokens are plain TypeScript objects — no React Native imports. The mobile app consumes them via `apps/studio-mobile/src/theme/` which maps tokens to `StyleSheet`-compatible values.
