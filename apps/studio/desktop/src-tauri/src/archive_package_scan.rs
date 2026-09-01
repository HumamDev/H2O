//! M06 T2.1 — trusted READ-ONLY enumerate / verify / classify.
//!
//! Answers exactly one question: *what is actually present under
//! `archive/packages`, and what can the trusted side prove about each item?*
//!
//! It deliberately does NOT answer *what should be reclaimed*. There is no
//! retention floor here, no `K`, no candidate selection, no reclaimability and
//! no plan. Those belong to T2.2 and T2.3.
//!
//! Three reuse rules hold this module together:
//!
//! * Verification is the publisher's own `verify_occupant`, factored out of
//!   `classify_occupant` unchanged. There is no second verifier, no second
//!   contentHash, no second canonicaliser and no second projection.
//! * Orderability is T1.5's `classify`. Timestamps are not parsed again here.
//! * The reserved-namespace predicate is T1.2's `is_reserved_component`.
//!
//! No filesystem timestamp is read anywhere: not mtime, not ctime, not
//! birthtime, and no wall clock. The only time fact in the result is the
//! verified in-content `snapshot.savedAt` that T1.5 adjudicates.
//!
//! Read-only: it opens the archive with the non-creating opener, refuses to
//! follow symlinks, and creates, renames, removes and writes nothing.

use crate::archive_durable_write::{confined, ARCHIVE_ROOT};
use crate::archive_generation_order::{UnorderableReason, VerifiedGenerationFacts};
use crate::archive_generation_publish::{verify_occupant, Outcome};

/// The canonical package suffix. Paired with `generation_basename` in the
/// publisher; a test pins that this parser is that constructor's inverse.
pub const PACKAGE_SUFFIX: &str = ".h2ochat";
const GENERATION_INFIX: &str = ".g";
const PACKAGES_DIR: &str = "packages";

pub mod codes {
    pub const PACKAGES_UNREADABLE: &str = "package-scan-packages-unreadable";
    pub const ENTRY_UNREPRESENTABLE: &str = "package-scan-entry-unrepresentable";
}

/// Why an occupant could not be admitted as a verified package. Every variant
/// is protective: a later stage may only treat these as "do not touch".
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum IndeterminateReason {
    /// Not `<name>.h2ochat` at all — a stray or foreign entry.
    NotAPackageName,
    /// Required members missing or unreadable.
    Partial,
    /// Present but structurally invalid by the authoritative verification.
    Corrupt,
    /// Verification could not read the occupant at all. This is also where a
    /// SYMLINK lands: the authoritative verifier refuses to follow one and
    /// reports it unreadable, and adding a second symlink check here purely to
    /// relabel it would duplicate a security decision that already exists.
    Unreadable,
    /// The occupant verified, but its proven identity disagrees with the name
    /// it is stored under. Never laundered into a verified generation.
    IdentityMismatch,
    /// The publisher's verifier reported an outcome this scan does not model.
    UnexpectedOutcome,
}

impl IndeterminateReason {
    /// Is this the governed AC-M06-10 operator-remedy class?
    ///
    /// The contract names exactly four states a damaged generation-path
    /// occupant may be remedied in — corrupt, partial, foreign (identity
    /// mismatch) and unreadable. The other two fail closed: `NotAPackageName`
    /// is not a package at all, and `UnexpectedOutcome` is a state this scan
    /// does not model, so neither may widen a destructive remedy.
    ///
    /// This is the SINGLE authority for that rule. It lives beside the
    /// classifier that produces the reasons, so the trusted occupant action and
    /// the read-only Preview hint cannot drift apart by each keeping a private
    /// copy of the same four-state match.
    ///
    /// Being in this class is NOT permission to act. It answers a
    /// classification question; the destructive path additionally re-derives
    /// and re-classifies its target under exclusive ownership.
    pub fn is_occupant_remedy_class(&self) -> bool {
        match self {
            IndeterminateReason::Corrupt
            | IndeterminateReason::Partial
            | IndeterminateReason::IdentityMismatch
            | IndeterminateReason::Unreadable => true,
            IndeterminateReason::NotAPackageName | IndeterminateReason::UnexpectedOutcome => false,
        }
    }
}

/// The package construction family, as the publisher's own version-triple gate
/// established it.
///
/// Grounded in source, not inferred: the live writer is
/// `buildSavedChatPackageV1`, which emits V1 or V2 from the SAME builder
/// depending on content — V2 exactly when inline `data:image` assets were
/// extracted (`isV2 = !!materialized.changed`), V1 otherwise. Both are
/// therefore produced by the current live writer. `buildSavedChatPackageV3`
/// exists but is called from no live path while live-v3 remains OFF, and the
/// trusted verifier admits v1 and v2 only.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum ConstructionFamily {
    /// schemaVersion 1, no payloadVersion, no assets.
    V1,
    /// schemaVersion 2 + payloadVersion 2 + assets.
    V2,
    /// The v3 family. Source-grounded, NOT speculative: `buildSavedChatPackageV3`
    /// exists in the package projector but is called from no live path while
    /// live-v3 remains OFF, and the trusted verifier refuses schemaVersion 3.
    ///
    /// No verified on-disk package can carry this family today — `verified_package`
    /// only ever produces V1 or V2. It exists so the format-stale protection is
    /// real and testable rather than latent, and so activating v3 later is a
    /// reviewable change to `is_live_writer_family` alone.
    V3,
}

impl ConstructionFamily {
    /// True when this family is one the CURRENT live writer produces. Both
    /// admitted families are live today; this predicate exists so the
    /// distinction is explicit rather than assumed, and so activating another
    /// family later is a one-line, reviewable change.
    pub fn is_live_writer_family(self) -> bool {
        match self {
            // `buildSavedChatPackageV1` emits BOTH: V2 when inline assets were
            // extracted, V1 otherwise. One writer, content-conditional output.
            ConstructionFamily::V1 | ConstructionFamily::V2 => true,
            // Live-v3 is OFF; no live path constructs it.
            ConstructionFamily::V3 => false,
        }
    }
}

/// How the verified in-content `savedAt` came out, via T1.5.
///
/// Validity and orderability are different things: a package can verify
/// perfectly and still be unorderable. No synthetic timestamp is ever
/// substituted, and `Unorderable` carries no time field at all.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum OrderFact {
    Orderable { saved_at: String },
    Unorderable { reason: UnorderableReason },
}

/// Trusted facts about a verified package. Carries identity and ordering
/// evidence only — never chat text, titles or message bodies.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct VerifiedPackage {
    pub chat_id: String,
    /// RECOMPUTED by the publisher's verifier from the stored bytes. Bare
    /// lowercase hex, normalized through the existing archive helper.
    pub content_hash: String,
    /// The construction family the publisher's version-triple gate established.
    pub construction_family: ConstructionFamily,
    pub order: OrderFact,
    /// Package-side CAS references from the VERIFIED manifest: sorted,
    /// deduplicated, normalized. Read-only evidence for later orphan analysis.
    /// This field exists only on a verified package, so an unreadable occupant
    /// can never present an empty list that reads as "references none".
    pub asset_shas: Vec<String>,
}

/// What the trusted side proved about one occupant.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "class", rename_all = "kebab-case")]
pub enum OccupantClass {
    /// `<chatId>.g<64 hex>.h2ochat` that passed verification AND whose proven
    /// identity matches the name it is stored under.
    VerifiedGeneration(VerifiedPackage),
    /// Grandfathered `<chatId>.h2ochat`. A DISTINCT variant, so no later stage
    /// can reach it through the generation path by accident.
    LegacyPackage(VerifiedPackage),
    /// Reserved trusted infrastructure (T1.2). Never a package; residue
    /// accounting stays with T1.3.
    ReservedInfrastructure,
    /// Present, visible, and not safely classifiable.
    Indeterminate { reason: IndeterminateReason },
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct ClassifiedOccupant {
    /// Archive-relative identity, e.g. `archive/packages/<name>`.
    pub path: String,
    pub name: String,
    #[serde(flatten)]
    pub class: OccupantClass,
}

#[derive(serde::Serialize, Clone, Debug, Default)]
pub struct PackageScan {
    /// True only when the namespace was enumerated end to end. A partial scan
    /// must never be read as the whole archive.
    pub complete: bool,
    pub blockers: Vec<String>,
    /// Sorted by occupant name, so filesystem enumeration order cannot leak
    /// into the result.
    pub occupants: Vec<ClassifiedOccupant>,
}

impl PackageScan {
    fn fail(&mut self, code: &str) {
        self.complete = false;
        let code = code.to_string();
        if !self.blockers.contains(&code) {
            self.blockers.push(code);
        }
    }
}

/// The shape a name claims. Claims only — verification decides the truth.
///
/// Crate-visible so M06 T3.4 can ask THIS parser whether an operator-named
/// occupant is generation-path shaped, instead of restating the grammar. A
/// visibility seam only: nothing about the parse changed.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum NameShape {
    Generation { chat_id: String, content_hash: String },
    Legacy { chat_id: String },
    Reserved,
    NotAPackage,
}

/// Inverse of the publisher's `generation_basename`. A test pins the round trip
/// so the two cannot drift apart.
pub(crate) fn name_shape(name: &str) -> NameShape {
    if crate::archive_durable_write::is_reserved_component(name) {
        return NameShape::Reserved;
    }
    let Some(stem) = name.strip_suffix(PACKAGE_SUFFIX) else {
        return NameShape::NotAPackage;
    };
    if stem.is_empty() {
        return NameShape::NotAPackage;
    }
    // `<chatId>.g<64 hex>`: split at the LAST `.g` so a chatId containing `.g`
    // cannot shadow the generation marker.
    if let Some(cut) = stem.rfind(GENERATION_INFIX) {
        let (chat_id, rest) = stem.split_at(cut);
        let hex = &rest[GENERATION_INFIX.len()..];
        if !chat_id.is_empty()
            && hex.len() == 64
            && hex.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            return NameShape::Generation {
                chat_id: chat_id.to_string(),
                content_hash: hex.to_string(),
            };
        }
    }
    NameShape::Legacy {
        chat_id: stem.to_string(),
    }
}

/// Canonical grandfathered legacy basename. The caller still has to validate
/// `chat_id` through the publisher's single chat-id authority before using it.
/// Kept beside `name_shape` so legacy construction and parsing cannot grow two
/// independent grammars.
pub(crate) fn legacy_basename(chat_id: &str) -> String {
    format!("{chat_id}{PACKAGE_SUFFIX}")
}

fn indeterminate_for(outcome: Outcome) -> IndeterminateReason {
    match outcome {
        Outcome::GenerationPartial => IndeterminateReason::Partial,
        Outcome::GenerationDestinationCorrupt => IndeterminateReason::Corrupt,
        Outcome::GenerationOccupantUnreadable => IndeterminateReason::Unreadable,
        Outcome::GenerationDestinationForeign => IndeterminateReason::IdentityMismatch,
        _ => IndeterminateReason::UnexpectedOutcome,
    }
}

/// Verifies one occupant and turns the publisher's proof into trusted facts.
fn verified_package(
    packages: &confined::Dir,
    name: &str,
) -> Result<VerifiedPackage, IndeterminateReason> {
    let verified =
        verify_occupant(packages, name.as_bytes()).map_err(|(outcome, _)| indeterminate_for(outcome))?;

    // The publisher derives `sha256-<hex>`; normalize through the existing
    // helper rather than restating the shape here.
    let content_hash =
        crate::archive_durable_write::normalize_expected_sha(&verified.content_hash)
            .ok_or(IndeterminateReason::Corrupt)?;

    // Ordering is T1.5's decision, from the verified in-content savedAt.
    let saved_at = crate::archive_generation_order::extract_saved_at(&verified.snapshot_bytes);
    let order = match crate::archive_generation_order::classify(&VerifiedGenerationFacts {
        saved_at,
        content_hash: content_hash.clone(),
    }) {
        Ok(ordered) => OrderFact::Orderable {
            saved_at: ordered.saved_at,
        },
        Err(unorderable) => OrderFact::Unorderable {
            reason: unorderable.reason,
        },
    };

    // Package-side CAS references, from the VERIFIED manifest only.
    let mut asset_shas: Vec<String> = verified
        .manifest
        .assets
        .iter()
        .filter_map(|asset| {
            crate::archive_durable_write::normalize_expected_sha(&asset.sha256)
        })
        .collect();
    // A declared asset whose sha is unusable would silently shrink the
    // reference set, so refuse the package rather than under-report it.
    if asset_shas.len() != verified.manifest.assets.len() {
        return Err(IndeterminateReason::Corrupt);
    }
    asset_shas.sort();
    asset_shas.dedup();

    Ok(VerifiedPackage {
        chat_id: verified.manifest.chat_id.clone(),
        content_hash,
        construction_family: if verified.manifest.payload_v2 {
            ConstructionFamily::V2
        } else {
            ConstructionFamily::V1
        },
        order,
        asset_shas,
    })
}

fn classify_one(packages: &confined::Dir, name: &str) -> OccupantClass {
    match name_shape(name) {
        NameShape::Reserved => OccupantClass::ReservedInfrastructure,
        NameShape::NotAPackage => OccupantClass::Indeterminate {
            reason: IndeterminateReason::NotAPackageName,
        },
        NameShape::Legacy { .. } => match verified_package(packages, name) {
            Ok(package) => OccupantClass::LegacyPackage(package),
            Err(reason) => OccupantClass::Indeterminate { reason },
        },
        NameShape::Generation {
            chat_id,
            content_hash,
        } => match verified_package(packages, name) {
            // The name is a CLAIM. A generation is admitted only when the
            // proven identity matches the name it is stored under; neither the
            // filename nor the manifest may assert identity on its own.
            Ok(package) => {
                if package.content_hash != content_hash || package.chat_id != chat_id {
                    OccupantClass::Indeterminate {
                        reason: IndeterminateReason::IdentityMismatch,
                    }
                } else {
                    OccupantClass::VerifiedGeneration(package)
                }
            }
            Err(reason) => OccupantClass::Indeterminate { reason },
        },
    }
}

/// Enumerates and classifies the canonical package namespace beneath
/// `archive_root`. Complete by construction: there is no limit, no page and no
/// caller-supplied directory.
pub fn scan_packages_within(archive_root: &std::path::Path) -> PackageScan {
    let mut out = PackageScan {
        complete: true,
        ..PackageScan::default()
    };

    let packages_path = archive_root.join(PACKAGES_DIR);
    let packages = match confined::Dir::open_existing_nofollow(&packages_path) {
        Ok(dir) => dir,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            // No package directory: an absence this scan proved, and it created
            // nothing by looking.
            return out;
        }
        Err(_) => {
            out.fail(codes::PACKAGES_UNREADABLE);
            return out;
        }
    };

    let names = match packages.read_entry_names() {
        Ok(names) => names,
        Err(_) => {
            out.fail(codes::PACKAGES_UNREADABLE);
            return out;
        }
    };

    for raw in names {
        let Ok(name) = std::str::from_utf8(&raw).map(str::to_string) else {
            // Visible as evidence rather than dropped, and the scan is no
            // longer a complete account of the namespace.
            out.fail(codes::ENTRY_UNREPRESENTABLE);
            continue;
        };
        let class = classify_one(&packages, &name);
        out.occupants.push(ClassifiedOccupant {
            path: format!("{ARCHIVE_ROOT}/{PACKAGES_DIR}/{name}"),
            name,
            class,
        });
    }

    // Deterministic trusted key: the canonical occupant name, never mtime and
    // never enumeration order.
    out.occupants.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Scans the application's canonical archive. Internal trusted Rust: T2.1
/// registers no command, and T2.3 owns the preview surface.
pub fn scan_packages(app: &tauri::AppHandle) -> Result<PackageScan, String> {
    let root = crate::archive_durable_write::archive_root(app)?;
    Ok(scan_packages_within(&root))
}

#[cfg(test)]
mod tests;
