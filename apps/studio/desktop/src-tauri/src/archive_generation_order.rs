//! M06 T1.5 — trusted ordering foundation for verified generations.
//!
//! This module answers exactly one question: given generations that have
//! ALREADY passed the required verification authority, in what deterministic
//! order do they stand? It does not decide reclaimability, does not apply the
//! retention floor `K`, does not classify construction families, and does not
//! know what legacy or format-stale mean.
//!
//! Order authority, per reclamation contract §E:
//!
//!   1. verified in-content `snapshot.savedAt`, newest first;
//!   2. deterministic `contentHash` tiebreak.
//!
//! The contract fixes the tiebreak as deterministic but not its direction, so
//! this module adopts the direction the repository already uses: the shipped
//! coverage comparator orders "newest verified savedAt first, then contentHash
//! hex ASCENDING". Matching it keeps one ordering convention in the product
//! rather than two that agree only by accident.
//!
//! Nothing else may establish recency. The input contract below carries no
//! filesystem timestamp, no `manifest.generatedAt`, no filename and no path —
//! those cannot influence ordering because they cannot be supplied at all.
//!
//! This module is pure: no filesystem I/O, no database access, no renderer
//! input, no Tauri command.

use time::{format_description::well_known::Rfc3339, OffsetDateTime};

/// Why a generation cannot take part in ordering.
///
/// Unorderable is NEVER a timestamp. There is deliberately no variant carrying
/// a substitute instant, so no caller can mistake a missing or broken
/// `savedAt` for a very old generation.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum UnorderableReason {
    /// No `savedAt` in the verified snapshot content.
    SavedAtMissing,
    /// Present but not a valid RFC 3339 instant.
    SavedAtMalformed,
    /// The trusted content hash is not canonical, so the tiebreak — and the
    /// generation's identity — cannot be established.
    ContentHashInvalid,
}

/// Facts about ONE generation that the verification authority has already
/// established. Deliberately minimal: this is the entire ordering input.
///
/// `saved_at` must come from the verified in-content snapshot, and
/// `content_hash` must be the trusted recomputed hash — never a manifest
/// claim, and never recomputed here. M06 adds no second contentHash or
/// projection implementation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedGenerationFacts {
    pub saved_at: Option<String>,
    pub content_hash: String,
}

/// A generation admitted to the ordered set.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct OrderedGeneration {
    /// The verified `savedAt` exactly as it appeared in the hashed snapshot.
    pub saved_at: String,
    /// Bare lowercase 64-hex, normalized through the existing archive helper.
    pub content_hash: String,
    /// Instant the ordering actually used. Retained so a later stage can show
    /// its work; two different offsets naming one instant share this value.
    #[serde(skip)]
    instant_nanos: i128,
}

/// A generation kept OUT of the ordered set, with the reason.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct UnorderableGeneration {
    pub content_hash: String,
    pub reason: UnorderableReason,
}

/// The ordering result. Orderable and unorderable are separate lists, never one
/// list with the unorderable swept to the end where "last" would read as
/// "oldest". A later stage must handle them as different things.
#[derive(serde::Serialize, Clone, Debug, Default)]
pub struct OrderedGenerations {
    /// Newest first, then contentHash ascending.
    pub orderable: Vec<OrderedGeneration>,
    /// No order is claimed over these; the vector is sorted only so the output
    /// is reproducible.
    pub unorderable: Vec<UnorderableGeneration>,
}

/// Parses the trusted ordering key.
///
/// Strict RFC 3339. An offset is honoured semantically rather than compared as
/// text: the canonical writer emits UTC via `toISOString()`, but the package
/// contract also admits a `meta.savedAt` passthrough and legacy content, so an
/// offset form can legitimately appear. Comparing those as strings would order
/// two spellings of the SAME instant differently.
fn parse_instant(text: &str) -> Option<i128> {
    OffsetDateTime::parse(text.trim(), &Rfc3339)
        .ok()
        .map(|value| value.unix_timestamp_nanos())
}

/// Classifies one generation's facts without ordering them.
pub fn classify(facts: &VerifiedGenerationFacts) -> Result<OrderedGeneration, UnorderableGeneration> {
    // Identity first: without a canonical hash there is no tiebreak and no
    // stable name for the thing being ordered.
    let Some(content_hash) =
        crate::archive_durable_write::normalize_expected_sha(&facts.content_hash)
    else {
        return Err(UnorderableGeneration {
            content_hash: String::new(),
            reason: UnorderableReason::ContentHashInvalid,
        });
    };

    let raw = match facts.saved_at.as_deref().map(str::trim) {
        None | Some("") => {
            return Err(UnorderableGeneration {
                content_hash,
                reason: UnorderableReason::SavedAtMissing,
            })
        }
        Some(text) => text,
    };

    match parse_instant(raw) {
        Some(instant_nanos) => Ok(OrderedGeneration {
            saved_at: raw.to_string(),
            content_hash,
            instant_nanos,
        }),
        // No epoch zero, no "now", no manifest time, no filesystem time.
        None => Err(UnorderableGeneration {
            content_hash,
            reason: UnorderableReason::SavedAtMalformed,
        }),
    }
}

/// The comparator. Newest `savedAt` first; equal instants fall through to
/// contentHash ascending, so input order can never leak into the result.
fn compare(a: &OrderedGeneration, b: &OrderedGeneration) -> std::cmp::Ordering {
    b.instant_nanos
        .cmp(&a.instant_nanos)
        .then_with(|| a.content_hash.cmp(&b.content_hash))
}

/// Orders verified generation facts. Pure: it touches no filesystem, no
/// database and no clock.
pub fn order(facts: &[VerifiedGenerationFacts]) -> OrderedGenerations {
    let mut out = OrderedGenerations::default();
    for item in facts {
        match classify(item) {
            Ok(ordered) => out.orderable.push(ordered),
            Err(unorderable) => out.unorderable.push(unorderable),
        }
    }
    out.orderable.sort_by(compare);
    out.unorderable
        .sort_by(|a, b| a.content_hash.cmp(&b.content_hash));
    out
}

/// Narrowly extracts `savedAt` from an ALREADY-VERIFIED logical snapshot.
///
/// Only that one field is retained — the surrounding chat content is walked by
/// the parser but never stored. The size of these bytes is already bounded by
/// the package logical-size authority upstream; this helper deliberately adds
/// no second bound and simply fails closed when the bytes are absent or are
/// not a JSON object.
///
/// The logical snapshot is format-neutral after verified decoding, so the same
/// extraction serves v1, v2 and supported v3 packages. It performs no
/// verification of its own and must never be handed unverified bytes.
pub fn extract_saved_at(verified_snapshot_json: &[u8]) -> Option<String> {
    #[derive(serde::Deserialize)]
    struct SavedAtOnly {
        #[serde(rename = "savedAt")]
        saved_at: Option<String>,
    }
    if verified_snapshot_json.is_empty() {
        return None;
    }
    let parsed: SavedAtOnly = serde_json::from_slice(verified_snapshot_json).ok()?;
    let text = parsed.saved_at?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests;
