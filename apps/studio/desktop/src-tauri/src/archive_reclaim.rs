//! M06 T3.1 — quarantine namespace and confined purge primitive.
//!
//! DORMANT. Nothing here is registered as a command, reachable from the
//! renderer, or wired to any UI. G02 remains the activation gate; this module
//! is the filesystem safety foundation the later destructive core will build
//! on, and it executes no reclamation run of its own.
//!
//! This is the ONLY module in M06 that holds physical delete authority, and
//! that authority is deliberately tiny: it can remove data that already lives
//! inside `archive/.h2o-reclaim`, and nothing else. There is no API here that
//! accepts a caller path, so "delete an arbitrary location" is not a refused
//! request — it is an unrepresentable one.
//!
//! Revision 2 removed destructive CAS reclamation from M06 entirely, and
//! withdrew both "destructive CAS collection" and "one-run CAS dwell" (§Q).
//! Accordingly there is NO CAS destructive target here: `QuarantineKind` has no
//! Cas/Asset/Sha variant, no path is ever built through `assets`, and a test
//! fails if a future change adds one.
//!
//! Confinement reuses the existing descriptor-relative primitives from
//! `archive_durable_write::confined` — no second confinement implementation is
//! introduced. Every step is `openat`/`unlinkat` relative to a held descriptor
//! with `O_NOFOLLOW`, so a symlink planted inside quarantine can have its own
//! entry removed but can never be traversed.

use crate::archive_durable_write::{confined, RECLAIM_NAMESPACE_COMPONENT};
use crate::archive_instance_lock::ExclusiveOwnership;

/// Reserved sibling namespace INSIDE `.h2o-reclaim` holding evidence.
///
/// Receipts are required before or while destructive actions occur (§J), so
/// they must survive item purge. It is refused as a run name, which is what
/// keeps the ordinary item-purge path from ever addressing it.
pub const RECEIPTS_NAMESPACE: &str = "receipts";

/// Bound on quarantine tree depth while purging. A quarantined package is a
/// shallow tree; this only stops a pathological structure from recursing
/// without limit.
const MAX_PURGE_DEPTH: usize = 8;

pub mod codes {
    pub const COMPONENT_EMPTY: &str = "reclaim-component-empty";
    pub const COMPONENT_TRAVERSAL: &str = "reclaim-component-traversal";
    pub const COMPONENT_SEPARATOR: &str = "reclaim-component-separator";
    pub const COMPONENT_RESERVED: &str = "reclaim-component-reserved";
    pub const RUN_ID_EMPTY: &str = "reclaim-run-id-empty";
    pub const RUN_ID_PREFIXED: &str = "reclaim-run-id-already-prefixed";
    pub const RUN_ID_CHARSET: &str = "reclaim-run-id-charset";
    pub const ROOT_UNAVAILABLE: &str = "reclaim-root-unavailable";
    pub const RUN_UNREADABLE: &str = "reclaim-run-unreadable";
    pub const ITEM_UNREADABLE: &str = "reclaim-item-unreadable";
    pub const PURGE_FAILED: &str = "reclaim-purge-failed";
    pub const DEPTH_EXCEEDED: &str = "reclaim-purge-depth-exceeded";
}

/// What a quarantined item was, for later evidence.
///
/// There is deliberately NO CAS variant. M06 analyzes CAS read-only and never
/// reclaims it, so a destructive CAS target must not be expressible.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum QuarantineKind {
    /// A published generation package moved out of the canonical namespace.
    Generation,
    /// Reserved staging or temporary residue.
    StagingTemp,
    /// A non-VALID occupant removed from a canonical destination.
    Occupant,
}

/// One validated path component. Constructing this is the ONLY way to name
/// anything inside quarantine, so a separator, `..` or absolute path cannot
/// reach a syscall.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QuarantineComponent(String);

impl QuarantineComponent {
    pub fn parse(raw: &str) -> Result<Self, String> {
        let text = raw.trim();
        if text.is_empty() {
            return Err(codes::COMPONENT_EMPTY.to_string());
        }
        if text == "." || text == ".." {
            return Err(codes::COMPONENT_TRAVERSAL.to_string());
        }
        // Both separators are refused regardless of host platform, so a
        // Windows-style name cannot become a traversal on a future target.
        if text.contains('/') || text.contains('\\') || text.contains('\0') {
            return Err(codes::COMPONENT_SEPARATOR.to_string());
        }
        Ok(QuarantineComponent(text.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The canonical prefix every quarantine run directory carries.
pub const RUN_PREFIX: &str = "run-";

/// A quarantine run namespace. Callers supply an ID, never a directory name:
/// the `run-` component is derived here, so an arbitrary top-level name such as
/// `foo`, `tmp` or `receipts2` cannot become a run directory.
///
/// A run id is namespace and evidence identity ONLY. Nothing derives deletion
/// authority from its lexical or temporal ordering, and no wall clock is needed
/// to build one — generation belongs to the later execution layer.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QuarantineRunId(String);

impl QuarantineRunId {
    /// Validates a bounded run identity and derives `run-<id>`.
    pub fn parse(id: &str) -> Result<Self, String> {
        let text = id.trim();
        if text.is_empty() {
            return Err(codes::RUN_ID_EMPTY.to_string());
        }
        // The id must be a plain component in its own right, so every
        // traversal and separator refusal applies to it first.
        let component = QuarantineComponent::parse(text)?;
        // And it must not smuggle the prefix or a reserved sibling back in.
        if component.as_str().starts_with(RUN_PREFIX) {
            return Err(codes::RUN_ID_PREFIXED.to_string());
        }
        if component.as_str() == RECEIPTS_NAMESPACE
            || component.as_str() == RECLAIM_NAMESPACE_COMPONENT
        {
            return Err(codes::COMPONENT_RESERVED.to_string());
        }
        if !component
            .as_str()
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err(codes::RUN_ID_CHARSET.to_string());
        }
        Ok(QuarantineRunId(format!("{RUN_PREFIX}{}", component.as_str())))
    }

    /// The derived directory component, always `run-<id>`.
    pub fn component(&self) -> &str {
        &self.0
    }
}

/// A target that exists INSIDE quarantine: `<reclaim>/<run>/<item>`.
///
/// There is no constructor for `<reclaim>` alone or `<reclaim>/<run>` alone, so
/// the reclaim root and a whole run cannot be addressed by the item purge
/// primitive at all.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QuarantineTarget {
    run: QuarantineRunId,
    item: QuarantineComponent,
    kind: QuarantineKind,
}

impl QuarantineTarget {
    /// `run_id` is an IDENTITY, not a directory name — the `run-` component is
    /// derived by `QuarantineRunId`. A caller therefore cannot address a
    /// non-run sibling of the reclaim root, including `receipts`.
    pub fn parse(run_id: &str, item: &str, kind: QuarantineKind) -> Result<Self, String> {
        let run = QuarantineRunId::parse(run_id)?;
        let item = QuarantineComponent::parse(item)?;
        Ok(QuarantineTarget { run, item, kind })
    }

    pub fn run_component(&self) -> &str {
        self.run.component()
    }

    pub fn kind(&self) -> QuarantineKind {
        self.kind
    }

    /// Archive-relative identity, for evidence only. Never used to open
    /// anything — every syscall is descriptor-relative.
    pub fn archive_relative_path(&self) -> String {
        format!(
            "{}/{}/{}/{}",
            crate::archive_durable_write::ARCHIVE_ROOT,
            RECLAIM_NAMESPACE_COMPONENT,
            self.run.component(),
            self.item.as_str()
        )
    }
}

/// An opaque capability handle for the quarantine namespace.
///
/// The inner descriptor is private and there is no constructor from a path, so
/// possessing a `ReclaimRoot` is proof that the namespace was derived beneath a
/// trusted archive root while exclusive ownership was held.
pub struct ReclaimRoot {
    dir: confined::Dir,
}

/// Opens the canonical quarantine namespace.
///
/// The PRODUCTION destructive entry point. It accepts no filesystem root of any
/// kind: the archive root is derived internally through the existing
/// `archive_durable_write::archive_root` authority, so neither a caller nor the
/// renderer can influence where destruction is confined to. There is no second
/// archive-root implementation here.
///
/// Requires the P1 exclusive-ownership capability BY TYPE — there is no second
/// lock, and no way to reach this while another instance may be mutating the
/// archive. The namespace identity is the T1.2 canonical constant.
pub fn open_reclaim_root(
    app: &tauri::AppHandle,
    exclusive: &ExclusiveOwnership<'_>,
) -> Result<ReclaimRoot, String> {
    let archive_root = crate::archive_durable_write::archive_root(app)
        .map_err(|_| codes::ROOT_UNAVAILABLE.to_string())?;
    open_reclaim_root_within(exclusive, &archive_root)
}

/// The confinement mechanics, shared by the production constructor above and by
/// the disposable-root test seam below.
///
/// Private: production code cannot reach it, so the only production path to a
/// `ReclaimRoot` is through the canonical archive-root authority.
fn open_reclaim_root_within(
    _exclusive: &ExclusiveOwnership<'_>,
    archive_root: &std::path::Path,
) -> Result<ReclaimRoot, String> {
    let root = confined::Dir::open_existing_nofollow(archive_root)
        .map_err(|_| codes::ROOT_UNAVAILABLE.to_string())?;
    let name = RECLAIM_NAMESPACE_COMPONENT.as_bytes();
    root.mkdir_child(name)
        .map_err(|_| codes::ROOT_UNAVAILABLE.to_string())?;
    let dir = root
        .open_child_nofollow(name)
        .map_err(|_| codes::ROOT_UNAVAILABLE.to_string())?;
    Ok(ReclaimRoot { dir })
}

/// Test-only seam for disposable archive roots. Compiled out of production
/// entirely, so no shipped caller can name a filesystem root.
#[cfg(test)]
pub(crate) fn open_reclaim_root_for_test(
    exclusive: &ExclusiveOwnership<'_>,
    archive_root: &std::path::Path,
) -> Result<ReclaimRoot, String> {
    open_reclaim_root_within(exclusive, archive_root)
}

/// Directory test on an ALREADY `O_NOFOLLOW`-stat'd entry.
///
/// Derived here rather than added to `confined` so `archive_durable_write.rs`
/// stays byte-unchanged. It is a mode check on a stat the caller already took
/// with the confined primitive, not a second confinement implementation: it
/// opens nothing and resolves no path.
fn is_dir(st: &libc::stat) -> bool {
    (st.st_mode & libc::S_IFMT) == libc::S_IFDIR
}

/// The outcome of one bounded purge. Partial failure is reported, never
/// rounded up into success.
#[derive(serde::Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct PurgeOutcome {
    /// True only when the target is gone AND nothing was left behind.
    pub converged: bool,
    /// Entries actually unlinked.
    pub removed: usize,
    /// True when the target was already absent — the idempotent re-run case.
    pub already_absent: bool,
    pub blockers: Vec<String>,
}

impl PurgeOutcome {
    fn fail(&mut self, code: &str) {
        self.converged = false;
        let code = code.to_string();
        if !self.blockers.contains(&code) {
            self.blockers.push(code);
        }
    }
}

/// Removes one quarantined item and everything beneath it.
///
/// Requires the P1 exclusive-ownership capability by type, so it cannot be
/// invoked while the archive may be concurrently mutated. It accepts NO path:
/// only the opaque quarantine handle and a validated `<run>/<item>` pair, so
/// the canonical archive root, `archive/packages`, `archive/assets`,
/// `.h2o-archive.lock` and the reclaim root itself are all unreachable — not by
/// refusal, but because no value of the argument types can name them.
///
/// Idempotent: an already-absent target converges without error, which is what
/// the crash-recovery model needs from a re-run.
pub fn purge_quarantined_item(
    _exclusive: &ExclusiveOwnership<'_>,
    root: &ReclaimRoot,
    target: &QuarantineTarget,
) -> PurgeOutcome {
    let mut out = PurgeOutcome {
        converged: true,
        ..PurgeOutcome::default()
    };

    let run_name = target.run.component().as_bytes();
    let run = match root.dir.stat_child_nofollow(run_name) {
        Ok(None) => {
            out.already_absent = true;
            return out;
        }
        Ok(Some(_)) => match root.dir.open_child_nofollow(run_name) {
            Ok(dir) => dir,
            Err(_) => {
                out.fail(codes::RUN_UNREADABLE);
                return out;
            }
        },
        Err(_) => {
            out.fail(codes::RUN_UNREADABLE);
            return out;
        }
    };

    let item_name = target.item.as_str().as_bytes();
    let st = match run.stat_child_nofollow(item_name) {
        Ok(None) => {
            out.already_absent = true;
            return out;
        }
        Ok(Some(st)) => st,
        Err(_) => {
            out.fail(codes::ITEM_UNREADABLE);
            return out;
        }
    };

    // A symlink standing as the item is unlinked as an ENTRY and never
    // followed, so whatever it pointed at is untouched.
    if confined::is_symlink(&st) || !is_dir(&st) {
        match run.unlink_child(item_name) {
            Ok(()) => out.removed += 1,
            Err(_) => out.fail(codes::PURGE_FAILED),
        }
        return out;
    }

    match run.open_child_nofollow(item_name) {
        Ok(dir) => purge_tree(&dir, &mut out, 0),
        Err(_) => {
            out.fail(codes::ITEM_UNREADABLE);
            return out;
        }
    }
    if out.converged {
        match run.unlink_child_dir(item_name) {
            Ok(()) => out.removed += 1,
            Err(_) => out.fail(codes::PURGE_FAILED),
        }
    }
    out
}

/// Depth-first removal beneath an already-opened, quarantine-owned directory.
/// Every step is descriptor-relative and `O_NOFOLLOW`, so no entry can redirect
/// the walk outside the tree it started in.
fn purge_tree(dir: &confined::Dir, out: &mut PurgeOutcome, depth: usize) {
    if depth >= MAX_PURGE_DEPTH {
        out.fail(codes::DEPTH_EXCEEDED);
        return;
    }
    let names = match dir.read_entry_names() {
        Ok(names) => names,
        Err(_) => {
            out.fail(codes::ITEM_UNREADABLE);
            return;
        }
    };
    for name in names {
        let st = match dir.stat_child_nofollow(&name) {
            Ok(Some(st)) => st,
            Ok(None) => continue,
            Err(_) => {
                out.fail(codes::ITEM_UNREADABLE);
                continue;
            }
        };
        if confined::is_symlink(&st) || !is_dir(&st) {
            match dir.unlink_child(&name) {
                Ok(()) => out.removed += 1,
                Err(_) => out.fail(codes::PURGE_FAILED),
            }
            continue;
        }
        match dir.open_child_nofollow(&name) {
            Ok(child) => {
                purge_tree(&child, out, depth + 1);
                drop(child);
                match dir.unlink_child_dir(&name) {
                    Ok(()) => out.removed += 1,
                    Err(_) => out.fail(codes::PURGE_FAILED),
                }
            }
            Err(_) => out.fail(codes::ITEM_UNREADABLE),
        }
    }
}

#[cfg(test)]
mod tests;
