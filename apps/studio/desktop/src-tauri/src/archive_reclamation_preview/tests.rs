use super::*;
use crate::archive_cas_scan::CasInventory;
use crate::archive_db_probe::{DbProbeCounts, DbProbeResult, GenerationProtection, ProtectionSource};
use crate::archive_generation_order::UnorderableReason;
use crate::archive_package_scan::{
    ClassifiedOccupant, ConstructionFamily, IndeterminateReason, OccupantClass, OrderFact,
    PackageScan, VerifiedPackage,
};
use crate::archive_retention_plan::{Decision, ProtectionReason, RETENTION_FLOOR_K};

fn hash(tag: u8) -> String {
    format!("{:02x}{}", tag, "0".repeat(62))
}
fn day(n: u32) -> String {
    format!("2026-01-{n:02}T00:00:00.000Z")
}

fn gen_in(chat: &str, tag: u8, family: ConstructionFamily) -> ClassifiedOccupant {
    let h = hash(tag);
    ClassifiedOccupant {
        path: format!("archive/packages/{chat}.g{h}.h2ochat"),
        name: format!("{chat}.g{h}.h2ochat"),
        class: OccupantClass::VerifiedGeneration(VerifiedPackage {
            chat_id: chat.to_string(),
            content_hash: h,
            construction_family: family,
            order: OrderFact::Orderable { saved_at: day(tag as u32) },
            asset_shas: vec![],
        }),
    }
}
fn gen(chat: &str, tag: u8) -> ClassifiedOccupant {
    gen_in(chat, tag, ConstructionFamily::V1)
}

fn five(chat: &str) -> Vec<ClassifiedOccupant> {
    (1u8..=5).map(|t| gen(chat, t)).collect()
}

fn scan(occupants: Vec<ClassifiedOccupant>) -> PackageScan {
    PackageScan { complete: true, blockers: vec![], occupants }
}
fn db(protections: Vec<GenerationProtection>, roots: Vec<String>) -> DbProbeResult {
    DbProbeResult {
        complete: true,
        blockers: vec![],
        cas_roots: roots,
        generation_protections: protections,
        counts: DbProbeCounts::default(),
    }
}
fn cas(observed: Vec<String>) -> CasInventory {
    CasInventory { complete: true, observed, foreign: vec![], blockers: vec![] }
}

fn request(pairs: &[(&str, &str, &str)]) -> PreviewRequest {
    PreviewRequest {
        chat_scope: None,
        projections: pairs
            .iter()
            .map(|(chat, status, h)| ProjectionInput {
                chat_id: chat.to_string(),
                status: status.to_string(),
                content_hash: h.to_string(),
            })
            .collect(),
    }
}

fn run(s: &PackageScan, d: &DbProbeResult, c: &CasInventory, r: &PreviewRequest) -> PreviewResult {
    preview_from_parts(s, d, c, r).expect("preview envelope")
}

fn candidates(p: &PreviewResult) -> Vec<&str> {
    p.plan
        .decisions
        .iter()
        .filter(|d| matches!(d.decision, Decision::Candidate { .. }))
        .map(|d| d.name.as_str())
        .collect()
}

fn reasons(p: &PreviewResult, name: &str) -> Vec<ProtectionReason> {
    match &p.plan.decisions.iter().find(|d| d.name == name).expect("decision").decision {
        Decision::Protected { reasons } => reasons.clone(),
        other => panic!("{name}: expected protected, got {other:?}"),
    }
}

/// (D)(S)(L) happy path: the Preview carries T2.2's result exactly, under a
/// stable schema identity, with K=3 preserved.
#[test]
fn a_witnessed_preview_carries_the_engine_result_exactly() {
    let s = scan(five("chat_a"));
    let d = db(vec![], vec![]);
    let c = cas(vec![]);
    let p = run(&s, &d, &c, &request(&[("chat_a", "ok", &hash(5))]));

    assert_eq!(p.schema, PREVIEW_SCHEMA);
    assert_eq!(p.schema_version, PREVIEW_SCHEMA_VERSION);
    assert_eq!(p.schema, "h2o.m06.reclamationPreview");
    assert_eq!(p.plan.retention_floor, RETENTION_FLOOR_K);
    assert_eq!(p.plan.retention_floor, 3);
    assert!(p.plan.complete, "{:?}", p.plan.blockers);
    assert!(p.sources.package_scan_complete && p.sources.db_probe_complete);

    // Newest three protected; the two beyond the floor are candidates.
    assert_eq!(candidates(&p).len(), 2);
    assert!(reasons(&p, &format!("chat_a.g{}.h2ochat", hash(5)))
        .contains(&ProtectionReason::NewestOverall));
    assert!(reasons(&p, &format!("chat_a.g{}.h2ochat", hash(3)))
        .contains(&ProtectionReason::RetentionFloor));
}

/// (E)(F)(R) the witness rule survives the command layer, and renderer evidence
/// is enabling-only: less information can never mean more candidates.
#[test]
fn projection_evidence_stays_enabling_only_through_the_command() {
    let s = scan(five("chat_a"));
    let d = db(vec![], vec![]);
    let c = cas(vec![]);

    let witnessed = run(&s, &d, &c, &request(&[("chat_a", "ok", &hash(5))]));
    let informed: std::collections::BTreeSet<&str> = candidates(&witnessed).into_iter().collect();
    assert_eq!(informed.len(), 2, "the informed control must actually prune");

    // (E) status=ok, valid 64-hex, matching NO on-disk generation.
    let unwitnessed = run(&s, &d, &c, &request(&[("chat_a", "ok", &hash(99))]));
    assert!(candidates(&unwitnessed).is_empty(), "an unwitnessed hash prunes nothing");
    assert!(reasons(&unwitnessed, &format!("chat_a.g{}.h2ochat", hash(1)))
        .contains(&ProtectionReason::ProjectionUnwitnessed));

    // (F) missing / failed / malformed verdicts.
    for req in [
        PreviewRequest::default(),
        request(&[("chat_a", "indeterminate", "")]),
        request(&[("chat_a", "ok", "")]),
        request(&[("chat_a", "ok", "not-a-hash")]),
        request(&[("chat_a", "failed", &hash(5))]),
    ] {
        let p = run(&s, &d, &c, &req);
        let set: std::collections::BTreeSet<&str> = candidates(&p).into_iter().collect();
        assert!(set.is_empty(), "{req:?} must not create candidates");
        // (R) monotonic: less-informed is a subset of more-informed.
        assert!(set.is_subset(&informed));
    }
}

/// (B) the request is bounded, and an over-bound payload is REFUSED rather than
/// truncated. Duplicates are refused so no payload ordering can change results.
#[test]
fn the_request_is_bounded_and_refuses_rather_than_truncating() {
    let s = scan(five("chat_a"));
    let d = db(vec![], vec![]);
    let c = cas(vec![]);

    // At the bound: accepted.
    let at_bound = PreviewRequest {
        chat_scope: None,
        projections: (0..MAX_PREVIEW_INPUTS)
            .map(|i| ProjectionInput {
                chat_id: format!("chat_{i}"),
                status: "indeterminate".into(),
                content_hash: String::new(),
            })
            .collect(),
    };
    assert!(preview_from_parts(&s, &d, &c, &at_bound).is_ok());

    // One over: refused, and NOT silently truncated.
    let over = PreviewRequest {
        chat_scope: None,
        projections: (0..MAX_PREVIEW_INPUTS + 1)
            .map(|i| ProjectionInput {
                chat_id: format!("chat_{i}"),
                status: "indeterminate".into(),
                content_hash: String::new(),
            })
            .collect(),
    };
    assert_eq!(
        preview_from_parts(&s, &d, &c, &over).err().as_deref(),
        Some(codes::REQUEST_TOO_LARGE)
    );

    // An over-bound SCOPE is equally refused.
    let over_scope = PreviewRequest {
        chat_scope: Some((0..MAX_PREVIEW_INPUTS + 1).map(|i| format!("c{i}")).collect()),
        projections: vec![],
    };
    assert_eq!(
        preview_from_parts(&s, &d, &c, &over_scope).err().as_deref(),
        Some(codes::REQUEST_TOO_LARGE)
    );

    // Duplicates and empty identities are refused, not order-dependently merged.
    let dup = request(&[("chat_a", "ok", &hash(5)), ("chat_a", "indeterminate", "")]);
    assert_eq!(
        preview_from_parts(&s, &d, &c, &dup).err().as_deref(),
        Some(codes::DUPLICATE_CHAT)
    );
    let dup_scope = PreviewRequest {
        chat_scope: Some(vec!["chat_a".into(), "chat_a".into()]),
        projections: vec![],
    };
    assert_eq!(
        preview_from_parts(&s, &d, &c, &dup_scope).err().as_deref(),
        Some(codes::DUPLICATE_CHAT)
    );
    let empty = request(&[("   ", "ok", &hash(5))]);
    assert_eq!(
        preview_from_parts(&s, &d, &c, &empty).err().as_deref(),
        Some(codes::EMPTY_CHAT_ID)
    );
}

/// (C) the request type cannot express a filesystem path, a floor, or a
/// destructive flag. Structural, so it cannot regress silently.
#[test]
fn the_request_contract_admits_no_path_floor_or_force() {
    let source = include_str!("../archive_reclamation_preview.rs");
    let start = source.find("pub struct PreviewRequest").expect("request type");
    let end = source[start..].find("\n}").unwrap() + start;
    let contract = &source[start..end];
    assert!(contract.contains("chat_scope") && contract.contains("projections"));
    for forbidden in [
        "path", "root", "dir", "target", "db", "database", "retention", "floor",
        "k:", "force", "confirm", "delete", "reclaim", "execute", "destructive",
        "classification", "candidate",
    ] {
        assert!(
            !contract.to_ascii_lowercase().contains(forbidden),
            "the request must not carry {forbidden}"
        );
    }
}

/// (G)(H)(I)(Q) each trusted source fails closed independently, is reported
/// separately, and is never converted into authoritative emptiness.
#[test]
fn incomplete_trusted_sources_fail_closed_and_stay_visible() {
    let base = five("chat_a");
    let req = request(&[("chat_a", "ok", &hash(5))]);

    // (G) package scan incomplete.
    let mut s = scan(base.clone());
    s.complete = false;
    s.blockers.push("package-scan-packages-unreadable".into());
    let p = run(&s, &db(vec![], vec![]), &cas(vec![]), &req);
    assert!(!p.sources.package_scan_complete);
    assert!(!p.plan.complete);
    assert!(candidates(&p).is_empty(), "no authoritative candidates");
    assert!(!p.plan.blockers.is_empty(), "blockers must remain visible");
    assert!(p.sources.package_scan_blockers.contains(&"package-scan-packages-unreadable".to_string()));

    // (H) DB probe incomplete.
    let mut d = db(vec![], vec![]);
    d.complete = false;
    d.blockers.push("db-probe-query-failed:chats".into());
    let p = run(&scan(base.clone()), &d, &cas(vec![]), &req);
    assert!(!p.sources.db_probe_complete);
    assert!(!p.plan.complete);
    assert!(candidates(&p).is_empty());

    // (I) CAS inventory incomplete — CAS analysis is non-authoritative, but the
    // GENERATION plan is untouched, exactly as T2.2 defines.
    let mut c = cas(vec!["dd".repeat(32)]);
    c.complete = false;
    c.blockers.push("cas-scan-shard-unreadable".into());
    let p = run(&scan(base), &db(vec![], vec![]), &c, &req);
    assert!(!p.sources.cas_inventory_complete);
    assert!(!p.plan.cas.complete, "CAS analysis is not authoritative");
    assert!(p.plan.complete, "the generation plan must NOT be erased by CAS incompleteness");
    assert_eq!(candidates(&p).len(), 2, "generation candidates survive");
}

/// (J)(K) every protection semantic survives the command layer intact.
#[test]
fn the_preview_carries_every_protection_reason() {
    let mut occupants = five("chat_a");
    // Legacy.
    occupants.push(ClassifiedOccupant {
        path: "archive/packages/chat_a.h2ochat".into(),
        name: "chat_a.h2ochat".into(),
        class: OccupantClass::LegacyPackage(VerifiedPackage {
            chat_id: "chat_a".into(),
            content_hash: hash(70),
            construction_family: ConstructionFamily::V1,
            order: OrderFact::Orderable { saved_at: day(1) },
            asset_shas: vec![],
        }),
    });
    // Unorderable.
    occupants.push(ClassifiedOccupant {
        path: format!("archive/packages/chat_a.g{}.h2ochat", hash(60)),
        name: format!("chat_a.g{}.h2ochat", hash(60)),
        class: OccupantClass::VerifiedGeneration(VerifiedPackage {
            chat_id: "chat_a".into(),
            content_hash: hash(60),
            construction_family: ConstructionFamily::V1,
            order: OrderFact::Unorderable { reason: UnorderableReason::SavedAtMissing },
            asset_shas: vec![],
        }),
    });
    // Format-stale (non-live family).
    occupants.push(gen_in("chat_a", 61, ConstructionFamily::V3));
    // Indeterminate.
    occupants.push(ClassifiedOccupant {
        path: "archive/packages/broken.h2ochat".into(),
        name: "broken.h2ochat".into(),
        class: OccupantClass::Indeterminate { reason: IndeterminateReason::Corrupt },
    });

    // All four trusted DB protection classes, on the two otherwise-candidate ones.
    let d = db(
        vec![
            GenerationProtection { chat_id: "chat_a".into(), content_hash: hash(1), source: ProtectionSource::StrandedWriting },
            GenerationProtection { chat_id: "chat_a".into(), content_hash: hash(1), source: ProtectionSource::Import },
            GenerationProtection { chat_id: "chat_a".into(), content_hash: hash(2), source: ProtectionSource::Restore },
            GenerationProtection { chat_id: "chat_a".into(), content_hash: hash(2), source: ProtectionSource::Relink },
        ],
        vec![],
    );
    let p = run(&scan(occupants), &d, &cas(vec![]), &request(&[("chat_a", "ok", &hash(5))]));

    assert!(reasons(&p, "chat_a.h2ochat").contains(&ProtectionReason::Legacy));
    assert!(reasons(&p, &format!("chat_a.g{}.h2ochat", hash(60)))
        .contains(&ProtectionReason::Unorderable));
    assert!(reasons(&p, &format!("chat_a.g{}.h2ochat", hash(61)))
        .contains(&ProtectionReason::FormatStale));
    let r1 = reasons(&p, &format!("chat_a.g{}.h2ochat", hash(1)));
    assert!(r1.contains(&ProtectionReason::StrandedWriting) && r1.contains(&ProtectionReason::ImportProvenance));
    let r2 = reasons(&p, &format!("chat_a.g{}.h2ochat", hash(2)));
    assert!(r2.contains(&ProtectionReason::RestoreProvenance) && r2.contains(&ProtectionReason::RelinkProvenance));
    assert!(matches!(
        p.plan.decisions.iter().find(|d| d.name == "broken.h2ochat").unwrap().decision,
        Decision::Excluded { .. }
    ));
    assert!(candidates(&p).is_empty(), "everything is protected here");
}

/// (M)(N) determinism and idempotence — the foundation G2's gate builds on.
#[test]
fn repeated_previews_over_identical_state_are_byte_identical() {
    let mut occupants = five("chat_a");
    occupants.extend(five("chat_b"));
    occupants.push(gen_in("chat_a", 61, ConstructionFamily::V3));
    let s = scan(occupants.clone());
    let d = db(
        vec![GenerationProtection { chat_id: "chat_a".into(), content_hash: hash(1), source: ProtectionSource::Import }],
        vec!["cc".repeat(32), "bb".repeat(32)],
    );
    let c = cas(vec!["dd".repeat(32), "bb".repeat(32)]);
    let req = request(&[("chat_a", "ok", &hash(5)), ("chat_b", "ok", &hash(5))]);

    // (N) idempotence: two calls, same state.
    let first = serde_json::to_string(&run(&s, &d, &c, &req)).unwrap();
    let second = serde_json::to_string(&run(&s, &d, &c, &req)).unwrap();
    assert_eq!(first, second, "Preview must be idempotent");

    // (M) determinism: reversed occupant, protection, root and request order.
    let mut rev_occ = occupants;
    rev_occ.reverse();
    let mut rev_roots = vec!["cc".repeat(32), "bb".repeat(32)];
    rev_roots.reverse();
    let rev_req = request(&[("chat_b", "ok", &hash(5)), ("chat_a", "ok", &hash(5))]);
    let permuted = serde_json::to_string(&run(
        &scan(rev_occ),
        &db(
            vec![GenerationProtection { chat_id: "chat_a".into(), content_hash: hash(1), source: ProtectionSource::Import }],
            rev_roots,
        ),
        &cas(vec!["bb".repeat(32), "dd".repeat(32)]),
        &rev_req,
    ))
    .unwrap();
    assert_eq!(first, permuted, "input order must not change the Preview");

    // No volatile authority anywhere in the envelope.
    for volatile in ["generatedAt", "generated_at", "timestamp", "uuid", "nonce", "20 26-"] {
        assert!(!first.contains(volatile), "volatile field leaked: {volatile}");
    }
}

/// (P) a complete empty archive is a complete deterministic empty plan.
#[test]
fn an_empty_archive_previews_as_complete_and_empty() {
    let p = run(&scan(vec![]), &db(vec![], vec![]), &cas(vec![]), &PreviewRequest::default());
    assert!(p.plan.complete && p.plan.blockers.is_empty());
    assert!(p.plan.decisions.is_empty());
    assert_eq!(p.plan.totals.candidates, 0);
    assert!(p.plan.cas.complete);
    assert!(p.sources.package_scan_complete && p.sources.db_probe_complete && p.sources.cas_inventory_complete);
}

/// (A)(V)(U) registration, and the absence of every destructive surface.
#[test]
fn only_a_read_only_preview_command_is_registered() {
    let lib = include_str!("../lib.rs");
    // (A) registered in BOTH invoke-handler arms.
    assert_eq!(
        lib.matches("archive_reclamation_preview::h2o_archive_reclamation_preview").count(),
        2,
        "Preview must be registered in every invoke-handler arm"
    );
    // No destructive M06 command is registered anywhere.
    for forbidden in [
        "h2o_archive_reclaim", "h2o_archive_execute", "h2o_archive_delete",
        "h2o_archive_purge", "h2o_archive_quarantine", "h2o_archive_prune",
        "h2o_archive_cas_collect", "h2o_archive_receipt",
    ] {
        assert!(!lib.contains(forbidden), "{forbidden} must not exist");
    }

    // (V)(U) the command module owns no destructive or persisting authority.
    let code: String = include_str!("../archive_reclamation_preview.rs")
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    assert!(code.contains("pub async fn h2o_archive_reclamation_preview"));
    for forbidden in [
        "remove_file", "remove_dir", "unlinkat", "renameat", "std::fs::rename",
        "create_dir", "File::create", "write(", "std::fs::write", "OpenOptions",
        "quarantine", "purge", "prune", "receipt", "Receipt",
        "SqliteConnection", "connect", "migration", "INSERT", "UPDATE", "DELETE",
        "SystemTime", "Instant::now", "mtime", "uuid", "random",
    ] {
        assert!(!code.contains(forbidden), "forbidden surface in the command: {forbidden}");
    }
    // (12) no authority is reimplemented here.
    for forbidden in ["Sha256", "Digest::", "sha256_hex", "verify_occupant", "validate_manifest", "OffsetDateTime", "read_entry_names"] {
        assert!(!code.contains(forbidden), "second authority leaked: {forbidden}");
    }
    // It orchestrates the committed authorities instead.
    for required in [
        "archive_package_scan::scan_packages_within",
        "archive_cas_scan::scan_cas_within",
        "archive_db_probe::probe_protection_facts",
        "archive_retention_plan",
    ] {
        assert!(code.contains(required), "must reuse {required}");
    }
    // One canonical root authority feeds both scans.
    assert_eq!(code.matches("archive_durable_write::archive_root").count(), 1);
}
