# Contract: Side Actions Panel

Status: Draft / boundary clarified by Reader & Notes Architecture Contract v1.2

Purpose:
Defines the user-facing feature workflow lane for Reader & Notes without adding
runtime behavior in MVP-A0.

Related:

- [ADR-0002: Command Bar vs Side Actions Panel](../../decisions/ADR-0002-command-bar-vs-side-actions-panel.md)
- [Studio Reader & Notes Architecture Contract v1.2](../reader-notes/architecture-contract-v1.2.md)
- [Studio Dock Panel Contract](../../../src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md)

## Boundary

Side Actions/Dock is the user feature workflow surface. Command Bar remains the
system/debug/recovery surface.

MVP-A0 changes no runtime behavior. Future Reader & Notes user-facing actions
must respect the Reader & Notes architecture contract, protected lanes, feature
flags, and phase validators before they ship enabled.
