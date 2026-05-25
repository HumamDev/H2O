# F10.1 Platform Capability Manifest

## Status

F10.1 defines the platform identity, authority, and capability contract for the cross-platform mesh. It is a declaration layer only.

No bridge is active from this document. No write behavior changes. No import, export, sync, cache, WebDAV, mobile, Chrome, Native Extension, or Desktop runtime behavior changes are introduced here.

Future F10 phases must validate new bridges and write paths against this manifest before they move data between platforms.

## Architecture Direction

F10 connects the Native ChatGPT Extension, Chrome Studio, Desktop Studio, and Mobile as a capability-based platform mesh. The platforms are not equal writers.

The system separates:

- `evidence`: observed facts or captured state.
- `preview`: dry-run display or comparison.
- `proposal`: requested possible change.
- `conflictReview`: durable review and decision state.
- `apply`: audited mutation.
- `export`: transportable state or evidence bundle.
- `cache`: non-authoritative display optimization.

Desktop Studio remains the first strong local authority. Chrome Studio and the Native Extension can produce and display evidence. Mobile remains read-only now and may become proposal-only later, but not a direct writer.

## Manifest Shape

Future static manifests should use this shape:

```js
{
  schema: "h2o.platform.capabilities.v1",
  platformId: "desktop-studio",
  surfaceKind: "desktop-tauri",
  authorityLevel: "strong-local-authority",
  capabilities: {
    read: true,
    produceEvidence: true,
    preview: true,
    propose: true,
    conflictReview: true,
    apply: "gated",
    delete: "f5-gated",
    export: true,
    cache: "non-authoritative",
    transport: ["local-bundle"],
    syncOutward: "bundle-export"
  },
  forbidden: [
    "silent-overwrite",
    "ungated-delete",
    "remote-apply-without-review"
  ]
}
```

Boolean `true` means the capability is currently allowed. Boolean `false` means denied. String values such as `gated`, `f5-gated`, or `metadata-only` must be interpreted as constrained capabilities, not broad permission.

## Capability Categories

- `read`: can read local or provided state.
- `produceEvidence`: can create observed evidence records or evidence-like diagnostics.
- `preview`: can render dry-run state, comparisons, or read-only projections.
- `propose`: can create non-authoritative requested changes.
- `conflictReview`: can participate in durable conflict review or decisions.
- `apply`: can mutate authoritative state through an audited gate.
- `delete`: can perform destructive mutation through an audited gate.
- `export`: can create transportable bundles or state packages.
- `cache`: can store local non-authoritative display data.
- `transport`: can move data between surfaces.
- `syncOutward`: can publish data outward, subject to the declared scope.

## Authority Levels

- `none`: no authority to read or act.
- `read-only`: can display provided state but cannot propose or mutate.
- `evidence-producer`: can record observed facts but cannot request or apply changes.
- `preview-coordinator`: can organize and compare state for display, without authority to apply.
- `proposal-source`: can submit requested changes for later review.
- `strong-local-authority`: owns durable local state and validation boundaries.
- `audited-apply-authority`: can mutate through explicit gates, audit records, and rollback-aware procedures.

## Platform Manifests

### Native Extension

```js
{
  schema: "h2o.platform.capabilities.v1",
  platformId: "native-extension",
  surfaceKind: "browser-runtime",
  authorityLevel: "evidence-producer",
  capabilities: {
    read: true,
    produceEvidence: true,
    preview: "limited",
    propose: false,
    conflictReview: false,
    apply: false,
    delete: false,
    export: false,
    cache: "local-runtime-only",
    transport: [],
    syncOutward: "evidence-only-later"
  },
  forbidden: [
    "direct-desktop-db-mutation",
    "uncontrolled-sync-authority",
    "direct-apply",
    "delete-propagation"
  ]
}
```

Current role: captures ChatGPT/runtime state and can produce evidence. It must not directly mutate Desktop state or become an uncontrolled sync authority.

### Chrome Studio

```js
{
  schema: "h2o.platform.capabilities.v1",
  platformId: "chrome-studio",
  surfaceKind: "browser-studio",
  authorityLevel: "preview-coordinator",
  capabilities: {
    read: true,
    produceEvidence: true,
    preview: true,
    propose: false,
    conflictReview: "display-only",
    apply: false,
    delete: false,
    export: "browser-state-only",
    cache: "non-authoritative",
    transport: ["chrome-storage-bridge-later"],
    syncOutward: "evidence-state-bridge-later"
  },
  forbidden: [
    "silent-overwrite",
    "desktop-db-apply",
    "ungated-delete",
    "remote-apply-without-review"
  ]
}
```

Current role: displays and organizes browser-side state and evidence. It may coordinate previews, but must not silently overwrite Desktop state.

### Desktop Studio

```js
{
  schema: "h2o.platform.capabilities.v1",
  platformId: "desktop-studio",
  surfaceKind: "desktop-tauri",
  authorityLevel: "strong-local-authority",
  capabilities: {
    read: true,
    produceEvidence: true,
    preview: true,
    propose: true,
    conflictReview: true,
    apply: "gated",
    delete: "f5-gated",
    export: true,
    cache: "non-authoritative",
    transport: ["local-bundle"],
    syncOutward: "bundle-export"
  },
  forbidden: [
    "silent-overwrite",
    "ungated-delete",
    "remote-apply-without-review",
    "metadata-apply-without-baseline"
  ]
}
```

Current role: owns the strongest local authority, durable state, audited apply paths, validation, rollback, and `latest.json` export.

### Mobile

```js
{
  schema: "h2o.platform.capabilities.v1",
  platformId: "mobile",
  surfaceKind: "mobile",
  authorityLevel: "read-only",
  capabilities: {
    read: true,
    produceEvidence: "metadata-only",
    preview: true,
    propose: false,
    conflictReview: false,
    apply: false,
    delete: false,
    export: false,
    cache: "metadata-only-non-authoritative",
    transport: ["file-picker-read-only"],
    syncOutward: "metadata-cache-status-only"
  },
  forbidden: [
    "archive-store-import",
    "bundle-content-cache",
    "snapshot-content-cache",
    "mobile-write-back",
    "direct-apply"
  ]
}
```

Current role: read-only viewer for pasted or selected `latest.json`. It may cache metadata-only counts/status, but it is not an authority and cannot write back.

## Platform Matrix

| Platform | Current authority | Allowed now | Forbidden now | Future unlock condition |
| --- | --- | --- | --- | --- |
| Native Extension | Evidence producer | Read runtime context, produce evidence | Direct Desktop mutation, apply, delete, uncontrolled sync outward | F10 evidence bridge with explicit envelope and destination validation |
| Chrome Studio | Preview coordinator | Read/display state, organize previews, produce evidence | Silent overwrite, Desktop DB apply, delete, remote apply | F10 Chrome-Desktop bridge with capability checks and no apply semantics |
| Desktop Studio | Strong local authority | Read, preview, propose, review, gated apply, F5-gated delete, bundle export | Silent overwrite, ungated delete, remote apply without review | Already allowed only through F5/F6/F7-style gates and audit |
| Mobile | Read-only viewer | Preview pasted/file bundle, read snapshots, show evidence, metadata-only cache | Archive import, content cache, write-back, apply, delete, conflict decisions | Later F10 proposal model, then gated review/apply on Desktop |

## Safety Rules

- Capabilities are deny-by-default.
- Cache is never authority.
- Transport is not apply.
- Evidence is not proposal.
- Proposal is not apply.
- Apply requires an audited gate.
- Delete requires F5 safety.
- Conflict decisions require F6 review semantics.
- Metadata apply requires F7-style baseline and audit checks.
- Remote apply and mobile write-back remain forbidden until explicitly enabled by later F10 phases.
- Every platform must declare capabilities before participating in a bridge.
- Every write path must be gated, auditable, and rollback-aware or explicitly documented as non-reversible.

## F10 Phase Usage

F10.2 should define a shared cross-platform envelope that carries `platformId`, schema, authority context, evidence/proposal type, and source metadata without granting apply authority.

F10.3, F10.4, and F10.5 bridge work must validate that the source platform capability permits the data being sent and that the destination treats it as evidence, preview, or proposal as declared.

F10.6 proposals must remain non-authoritative. F10.7 applies must remain Desktop-gated unless a later manifest update and safety model explicitly authorizes a new apply surface.

## Static Manifest Location Decision

F10.1 is docs-only. Inspection did not show an obvious neutral shared runtime-safe manifest location that spans Native Extension, Chrome Studio, Desktop Studio, and Mobile without biasing the architecture toward one surface.

Future implementation can add a static manifest after shared import constraints are decided. Candidate locations:

- `packages/studio-types`: suitable if the manifest remains TypeScript/schema-oriented and is consumed as shared definitions.
- A new shared sync/platform package: suitable if Native Extension, Chrome Studio, Desktop, and Mobile all need one canonical runtime-safe manifest.

Avoid placing the canonical manifest under `src-surfaces-base/studio/platform` because that would bias the source of truth toward Studio surfaces before Native Extension and Mobile import paths are defined.

## Validation Expectations

This document adds no runtime imports and no behavior. Future static manifests must pass syntax validation and must not enable bridge, apply, delete, WebDAV, import/export, or mobile write-back behavior by existing merely as declarations.

F10.1 stops here. F10.2 must not start from this document change.
