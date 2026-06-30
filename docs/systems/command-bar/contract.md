# Contract: Command Bar

Status: Draft / boundary clarified by Reader & Notes Architecture Contract v1.2

Purpose:
Defines Command Bar ownership so Reader & Notes workflows do not use it as a
feature UI surface.

Related:

- [ADR-0002: Command Bar vs Side Actions Panel](../../decisions/ADR-0002-command-bar-vs-side-actions-panel.md)
- [Studio Reader & Notes Architecture Contract v1.2](../reader-notes/architecture-contract-v1.2.md)

## Boundary

Command Bar is for system, debug, recovery, and operator actions. It is not the
user-facing feature workflow lane for Reader & Notes.

MVP-A0 changes no runtime behavior. Future Reader & Notes feature workflows
belong in Side Actions/Dock surfaces unless a later approved contract explicitly
adds a Command Bar diagnostic or recovery action.
