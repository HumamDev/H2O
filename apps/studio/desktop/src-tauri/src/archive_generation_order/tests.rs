use super::*;

const H_A: &str = "aa00000000000000000000000000000000000000000000000000000000000000";
const H_B: &str = "bb00000000000000000000000000000000000000000000000000000000000000";
const H_C: &str = "cc00000000000000000000000000000000000000000000000000000000000000";

fn facts(saved_at: Option<&str>, hash: &str) -> VerifiedGenerationFacts {
    VerifiedGenerationFacts {
        saved_at: saved_at.map(str::to_string),
        content_hash: hash.to_string(),
    }
}

fn hashes(result: &OrderedGenerations) -> Vec<&str> {
    result
        .orderable
        .iter()
        .map(|g| g.content_hash.as_str())
        .collect()
}

/// A snapshot shaped like the ACTUAL writer's output (saved-chat-package-v1
/// `snapshot.json`), not invented JSON: same top-level field set and order.
fn real_snapshot_json(saved_at: &str, schema_version: u32) -> Vec<u8> {
    serde_json::json!({
        "schema": "h2o.savedChatSnapshot",
        "schemaVersion": schema_version,
        "chatId": "chat_t15",
        "snapshotId": "snap_t15",
        "capturedAt": "2026-08-01T00:00:00.000Z",
        "savedAt": saved_at,
        "title": "a chat title that must never reach the ordering result",
        "source": { "surface": "desktop" },
        "library": { "labels": [], "folders": [] },
        "messages": [
            { "index": 0, "role": "user", "text": "hello" },
            { "index": 1, "role": "assistant", "text": "hi" }
        ],
        "metadata": { "captureSurface": "desktop", "model": "" }
    })
    .to_string()
    .into_bytes()
}

/// (A) newest first.
#[test]
fn distinct_saved_at_values_sort_newest_first() {
    let result = order(&[
        facts(Some("2026-01-01T00:00:00.000Z"), H_A),
        facts(Some("2026-08-29T12:00:00.000Z"), H_B),
        facts(Some("2026-03-15T08:30:00.000Z"), H_C),
    ]);
    assert_eq!(result.orderable.len(), 3);
    assert!(result.unorderable.is_empty());
    assert_eq!(hashes(&result), vec![H_B, H_C, H_A]);
}

/// (B) equal instants fall through to contentHash ASCENDING, and input order
/// cannot change the answer.
#[test]
fn equal_saved_at_is_broken_by_content_hash_ascending_regardless_of_input_order() {
    let same = "2026-05-05T05:05:05.000Z";
    let forward = order(&[facts(Some(same), H_C), facts(Some(same), H_A), facts(Some(same), H_B)]);
    let reverse = order(&[facts(Some(same), H_B), facts(Some(same), H_A), facts(Some(same), H_C)]);
    assert_eq!(hashes(&forward), vec![H_A, H_B, H_C], "ascending hex tiebreak");
    assert_eq!(hashes(&forward), hashes(&reverse), "input order must not matter");
}

/// (C) the SAME instant written with different valid offsets ties on the
/// primary key and resolves through the hash — a string comparison would order
/// these two wrongly, because "2026-05-05T05:05:05.000Z" and
/// "2026-05-05T07:05:05.000+02:00" are the same moment but differ as text.
#[test]
fn offset_equivalent_instants_tie_and_resolve_through_the_hash() {
    let utc = "2026-05-05T05:05:05.000Z";
    let plus_two = "2026-05-05T07:05:05.000+02:00";
    let minus_five = "2026-05-05T00:05:05.000-05:00";

    let result = order(&[
        facts(Some(plus_two), H_C),
        facts(Some(minus_five), H_A),
        facts(Some(utc), H_B),
    ]);
    assert_eq!(result.orderable.len(), 3);
    assert_eq!(
        hashes(&result),
        vec![H_A, H_B, H_C],
        "equivalent instants must tie, then order by hash ascending"
    );
    // Each retains its own source spelling; nothing was silently rewritten.
    assert_eq!(result.orderable[0].saved_at, minus_five);
    assert_eq!(result.orderable[2].saved_at, plus_two);

    // And an offset instant genuinely earlier still sorts later.
    let mixed = order(&[
        facts(Some("2026-05-05T05:05:05.000Z"), H_A),
        facts(Some("2026-05-05T05:05:05.000+02:00"), H_B), // 2 hours EARLIER
    ]);
    assert_eq!(hashes(&mixed), vec![H_A, H_B]);
}

/// (D)(E) malformed and missing produce an explicit unorderable — never a
/// synthetic timestamp.
#[test]
fn malformed_or_missing_saved_at_is_explicitly_unorderable() {
    let cases: &[(Option<&str>, UnorderableReason)] = &[
        (None, UnorderableReason::SavedAtMissing),
        (Some(""), UnorderableReason::SavedAtMissing),
        (Some("   "), UnorderableReason::SavedAtMissing),
        (Some("not a timestamp"), UnorderableReason::SavedAtMalformed),
        (Some("2026-13-01T00:00:00Z"), UnorderableReason::SavedAtMalformed), // month 13
        (Some("2026-02-30T00:00:00Z"), UnorderableReason::SavedAtMalformed), // no Feb 30
        (Some("2026-08-29T25:00:00Z"), UnorderableReason::SavedAtMalformed), // hour 25
        (Some("2026-08-29"), UnorderableReason::SavedAtMalformed),           // date only
        (Some("1756425600000"), UnorderableReason::SavedAtMalformed),        // epoch millis
        (Some("2026-08-29T00:00:00"), UnorderableReason::SavedAtMalformed),  // no offset
    ];
    for (input, expected) in cases {
        let result = order(&[facts(*input, H_A)]);
        assert!(
            result.orderable.is_empty(),
            "{input:?} must not enter the ordered set"
        );
        assert_eq!(result.unorderable.len(), 1);
        assert_eq!(result.unorderable[0].reason, *expected, "{input:?}");
    }

    // A valid leap day IS orderable, so the calendar checks above are strict
    // rather than merely rejecting anything unusual.
    let leap = order(&[facts(Some("2024-02-29T00:00:00.000Z"), H_A)]);
    assert_eq!(leap.orderable.len(), 1);
    let non_leap = order(&[facts(Some("2026-02-29T00:00:00.000Z"), H_A)]);
    assert_eq!(non_leap.unorderable.len(), 1);
}

/// (J) unorderable facts are never mixed into the ordered list, so "last" can
/// never be misread as "oldest".
#[test]
fn unorderable_generations_are_separated_not_appended_as_oldest() {
    let result = order(&[
        facts(Some("2026-01-01T00:00:00.000Z"), H_A),
        facts(None, H_B),
        facts(Some("garbage"), H_C),
    ]);
    assert_eq!(hashes(&result), vec![H_A], "only the orderable one is ordered");
    assert_eq!(result.unorderable.len(), 2);
    let unordered: Vec<&str> = result
        .unorderable
        .iter()
        .map(|g| g.content_hash.as_str())
        .collect();
    assert_eq!(unordered, vec![H_B, H_C]);
    // The types differ, so a caller cannot concatenate them by accident.
    let serialized = serde_json::to_value(&result).unwrap();
    assert!(serialized["orderable"].as_array().unwrap().len() == 1);
    assert!(serialized["unorderable"].as_array().unwrap().len() == 2);
    // No unorderable entry carries anything a caller could read as a time.
    for entry in serialized["unorderable"].as_array().unwrap() {
        assert!(entry.get("saved_at").is_none());
        assert!(entry.get("savedAt").is_none());
        assert!(entry.get("instant_nanos").is_none());
    }
}

/// (F)(G)(H) filesystem time, manifest.generatedAt and filename cannot affect
/// ordering because the input contract cannot express them. Structural.
#[test]
fn ordering_input_admits_no_filesystem_time_generated_at_or_filename() {
    let source = include_str!("../archive_generation_order.rs");
    let start = source
        .find("pub struct VerifiedGenerationFacts")
        .expect("input contract present");
    let end = source[start..].find('}').unwrap() + start;
    let contract = &source[start..end];
    // The entire ordering input is these two fields.
    assert!(contract.contains("saved_at"));
    assert!(contract.contains("content_hash"));
    for forbidden in [
        "generated_at", "generatedAt", "mtime", "modified", "ctime", "birthtime",
        "path", "file_name", "filename", "package_dir", "index", "position",
    ] {
        assert!(
            !contract.contains(forbidden),
            "the ordering input must not carry {forbidden}"
        );
    }
    // And the module reaches for no clock or filesystem anywhere.
    for forbidden in [
        "SystemTime", "Instant::now", "OffsetDateTime::now", "std::fs", "metadata(",
        "read_dir", "now_utc",
    ] {
        assert!(!source.contains(forbidden), "ordering must not use {forbidden}");
    }
}

/// (I) determinism across permutations.
#[test]
fn every_permutation_of_the_same_facts_yields_the_same_order() {
    let same = "2026-07-07T07:07:07.000Z";
    let base = vec![
        facts(Some("2026-09-09T00:00:00.000Z"), H_C),
        facts(Some(same), H_A),
        facts(Some(same), H_B),
        facts(None, "zz-not-a-hash"),
    ];
    let expected = order(&base);
    // All 24 permutations of four items.
    let mut indices = [0usize, 1, 2, 3];
    let mut seen = 0;
    permute(&mut indices, 0, &mut |order_of| {
        let permuted: Vec<VerifiedGenerationFacts> =
            order_of.iter().map(|i| base[*i].clone()).collect();
        let result = order(&permuted);
        assert_eq!(hashes(&result), hashes(&expected));
        assert_eq!(result.unorderable, expected.unorderable);
        seen += 1;
    });
    assert_eq!(seen, 24, "all permutations exercised");
    assert_eq!(hashes(&expected), vec![H_C, H_A, H_B]);
}

fn permute(items: &mut [usize], k: usize, visit: &mut impl FnMut(&[usize])) {
    if k == items.len() {
        visit(items);
        return;
    }
    for i in k..items.len() {
        items.swap(k, i);
        permute(items, k + 1, visit);
        items.swap(k, i);
    }
}

/// (K)(N) the trusted hash is the only identity accepted; a non-canonical one
/// fails closed instead of entering the ordered set.
#[test]
fn only_a_canonical_trusted_content_hash_is_admitted() {
    for bad in ["", "not-a-hash", "AA00", &"a".repeat(63), &"g".repeat(64)] {
        let result = order(&[facts(Some("2026-01-01T00:00:00.000Z"), bad)]);
        assert!(result.orderable.is_empty(), "{bad:?} must not be ordered");
        assert_eq!(
            result.unorderable[0].reason,
            UnorderableReason::ContentHashInvalid
        );
    }
    // The `sha256-` prefixed form normalizes to the same bare hex, so the same
    // trusted identity cannot be split into two orderings by spelling.
    let prefixed = order(&[facts(Some("2026-01-01T00:00:00.000Z"), &format!("sha256-{H_A}"))]);
    assert_eq!(prefixed.orderable[0].content_hash, H_A);
    // Uppercase normalizes too, rather than sorting into a different position.
    let upper = order(&[facts(Some("2026-01-01T00:00:00.000Z"), &H_A.to_ascii_uppercase())]);
    assert_eq!(upper.orderable[0].content_hash, H_A);
}

/// (L)(M) extraction against the REAL snapshot shape, across the logical
/// schema versions. The logical snapshot is format-neutral after verified
/// decoding, so no second v3 verification implementation is involved.
#[test]
fn saved_at_is_extracted_from_the_real_snapshot_shape_across_versions() {
    for schema_version in [1u32, 2, 3] {
        let bytes = real_snapshot_json("2026-08-29T10:11:12.000Z", schema_version);
        assert_eq!(
            extract_saved_at(&bytes).as_deref(),
            Some("2026-08-29T10:11:12.000Z"),
            "schemaVersion {schema_version}"
        );
    }

    // The writer's own fallback can leave savedAt empty; that is missing, not
    // an ordering value.
    assert_eq!(extract_saved_at(&real_snapshot_json("", 2)), None);

    // Absent field, empty bytes, and non-object bytes all fail closed.
    assert_eq!(extract_saved_at(br#"{"schema":"x","messages":[]}"#), None);
    assert_eq!(extract_saved_at(b""), None);
    assert_eq!(extract_saved_at(b"not json"), None);
    assert_eq!(extract_saved_at(b"[1,2,3]"), None);

    // End to end on the real shape: extraction feeds ordering.
    let bytes = real_snapshot_json("2026-08-29T10:11:12.000Z", 2);
    let result = order(&[VerifiedGenerationFacts {
        saved_at: extract_saved_at(&bytes),
        content_hash: H_A.to_string(),
    }]);
    assert_eq!(result.orderable.len(), 1);
    assert_eq!(result.orderable[0].saved_at, "2026-08-29T10:11:12.000Z");
}

/// Extraction keeps only the timestamp: chat content is walked but not stored,
/// and nothing else can reach an ordering result.
#[test]
fn extraction_and_ordering_retain_no_chat_content() {
    let bytes = real_snapshot_json("2026-08-29T10:11:12.000Z", 2);
    let extracted = extract_saved_at(&bytes).unwrap();
    assert_eq!(extracted, "2026-08-29T10:11:12.000Z");

    let result = order(&[VerifiedGenerationFacts {
        saved_at: Some(extracted),
        content_hash: H_A.to_string(),
    }]);
    let json = serde_json::to_string(&result).unwrap();
    for secret in ["a chat title", "hello", "hi", "snap_t15", "chat_t15", "captureSurface"] {
        assert!(!json.contains(secret), "{secret} must not reach the ordering result");
    }
}

/// T1.5 decides no policy: no retention floor, no candidacy, no destructive
/// vocabulary anywhere in the module.
#[test]
fn the_ordering_primitive_carries_no_reclamation_policy() {
    // Scan CODE only. A doc comment that states this module does not decide
    // reclaimability is documentation working correctly; a token scan that
    // failed on it would pressure someone into deleting an accurate comment.
    let code: String = include_str!("../archive_generation_order.rs")
        .lines()
        .map(str::trim_start)
        .filter(|line| !line.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    for forbidden in [
        "candidate", "reclaim", "quarantine", "purge", "prune", "delete", "unlink",
        "remove_file", "retention_floor", "RETENTION", "fn keep", "is_stale",
        "K = 3", "const K",
    ] {
        assert!(
            !code.contains(forbidden),
            "the ordering primitive must not implement {forbidden}"
        );
    }
    // The scan has teeth: the code it examined is the real module body.
    assert!(code.contains("pub fn order("), "the scanned code must be the module");
    assert!(code.contains("fn compare("));
}
