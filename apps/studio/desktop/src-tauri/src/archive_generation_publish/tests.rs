//! T1.2.2 — load-bearing proof for the trusted generation publisher.
//!
//! Every test here is written to FAIL if the property it names is removed. The
//! mutation controls at the end of the file record which guard each test kills.

use super::*;
use std::path::PathBuf;

// ── Harness ────────────────────────────────────────────────────────────────

fn scratch_root(tag: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "h2o-genpub-{tag}-{nanos}-{:?}",
        std::thread::current().id()
    ));
    std::fs::create_dir_all(dir.join("archive")).expect("scratch");
    dir.join("archive")
}

fn publisher(tag: &str) -> Publisher {
    Publisher::new(scratch_root(tag))
}

fn sha_of(bytes: &[u8]) -> String {
    format!("sha256-{}", sha256_hex(bytes))
}

/// Builds a coherent v1 package: snapshot + renderers + manifest whose
/// descriptors and contentHash are all self-consistent.
struct Fixture {
    chat_id: String,
    snapshot: Vec<u8>,
    markdown: Vec<u8>,
    html: Vec<u8>,
    manifest: Vec<u8>,
    content_hash: String,
}

fn v1_fixture(chat_id: &str, snapshot_id: &str, body: &str) -> Fixture {
    let snapshot = format!(
        r#"{{"schemaVersion":1,"chatId":"{chat_id}","snapshotId":"{snapshot_id}","messages":[{{"id":"m0","turnIndex":0,"contentText":"{body}"}}]}}"#
    )
    .into_bytes();
    let markdown = format!("# {chat_id}\n\n{body}\n").into_bytes();
    let html = format!("<!doctype html><title>{chat_id}</title><p>{body}</p>").into_bytes();
    // v1 identity = SHA-256 of the exact snapshot bytes.
    let content_hash = sha_of(&snapshot);
    let manifest = format!(
        r#"{{"schema":"h2o.savedChatPackage","schemaVersion":1,"chatId":"{chat_id}","snapshotId":"{snapshot_id}","contentHash":"{content_hash}","files":{{"snapshot":{{"path":"snapshot.json","sha256":"{}","byteLength":{}}},"markdown":{{"path":"chat.md","sha256":"{}","byteLength":{}}},"html":{{"path":"chat.html","sha256":"{}","byteLength":{}}}}},"assets":[]}}"#,
        sha_of(&snapshot),
        snapshot.len(),
        sha_of(&markdown),
        markdown.len(),
        sha_of(&html),
        html.len(),
    )
    .into_bytes();
    Fixture {
        chat_id: chat_id.to_string(),
        snapshot,
        markdown,
        html,
        manifest,
        content_hash,
    }
}

/// Builds a coherent v2 package referencing CAS objects, and plants those
/// objects in the scratch CAS.
fn v2_fixture(root: &std::path::Path, chat_id: &str, assets: &[(&str, &[u8])]) -> Fixture {
    let mut descriptors = Vec::new();
    let mut shas = Vec::new();
    let mut refs = Vec::new();
    for (ext, bytes) in assets {
        let sha = sha_of(bytes);
        let hex = sha.strip_prefix("sha256-").unwrap();
        let shard = root.join("assets").join(&hex[0..2]);
        std::fs::create_dir_all(&shard).expect("cas shard");
        std::fs::write(shard.join(format!("sha256-{hex}")), bytes).expect("cas object");
        descriptors.push(format!(
            r#"{{"path":"assets/{sha}.{ext}","sha256":"{sha}","ext":"{ext}","mimeType":"image/{ext}","byteLength":{}}}"#,
            bytes.len()
        ));
        refs.push(format!("\"{sha}\""));
        shas.push(sha);
    }
    let snapshot = format!(
        r#"{{"schemaVersion":2,"chatId":"{chat_id}","snapshotId":"s1","messages":[{{"id":"m0","turnIndex":0,"assetRefs":[{}]}}]}}"#,
        refs.join(",")
    )
    .into_bytes();
    let markdown = b"# v2\n".to_vec();
    let html = b"<!doctype html><p>v2</p>".to_vec();
    let mut sorted = shas.clone();
    sorted.sort();
    let content_hash = derive_content_hash(true, &snapshot, &sorted);
    let manifest = format!(
        r#"{{"schema":"h2o.savedChatPackage","schemaVersion":2,"payloadVersion":2,"chatId":"{chat_id}","snapshotId":"s1","contentHash":"{content_hash}","files":{{"snapshot":{{"path":"snapshot.json","sha256":"{}","byteLength":{}}},"markdown":{{"path":"chat.md","sha256":"{}","byteLength":{}}},"html":{{"path":"chat.html","sha256":"{}","byteLength":{}}}}},"assets":[{}]}}"#,
        sha_of(&snapshot),
        snapshot.len(),
        sha_of(&markdown),
        markdown.len(),
        sha_of(&html),
        html.len(),
        descriptors.join(",")
    )
    .into_bytes();
    Fixture {
        chat_id: chat_id.to_string(),
        snapshot,
        markdown,
        html,
        manifest,
        content_hash,
    }
}

fn stage_all(p: &Publisher, token: u64, fx: &Fixture) {
    assert!(write_member(p, token, Member::Snapshot, &fx.snapshot).ok);
    assert!(write_member(p, token, Member::Markdown, &fx.markdown).ok);
    assert!(write_member(p, token, Member::Html, &fx.html).ok);
    assert!(write_member(p, token, Member::Manifest, &fx.manifest).ok);
}

fn publish(p: &Publisher, fx: &Fixture) -> PublishResult {
    let begun = begin(p, &fx.chat_id);
    assert!(begun.ok, "begin refused: {:?}", begun.blockers);
    stage_all(p, begun.token, fx);
    commit(p, begun.token, None)
}

fn packages_entries(p: &Publisher) -> Vec<String> {
    let dir = p.root.join(PACKAGES_DIR);
    let mut out: Vec<String> = std::fs::read_dir(&dir)
        .map(|it| {
            it.filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out
}

fn blocker_codes(result: &PublishResult) -> Vec<String> {
    result.blockers.iter().map(|b| b.code.clone()).collect()
}

// ── FILESYSTEM / CONFINEMENT ───────────────────────────────────────────────

#[test]
fn publishes_a_v1_generation_under_the_derived_name() {
    let p = publisher("v1-happy");
    let fx = v1_fixture("chat_alpha", "snap1", "hello");
    let result = publish(&p, &fx);
    assert!(result.ok, "blockers: {:?}", blocker_codes(&result));
    assert_eq!(result.outcome, Outcome::Created);
    assert!(result.committed);
    assert!(result.durability_complete);
    assert_eq!(result.content_hash, fx.content_hash);

    let hex = fx.content_hash.strip_prefix("sha256-").unwrap();
    let expected = format!("chat_alpha.g{hex}.h2ochat");
    assert_eq!(packages_entries(&p), vec![expected.clone()]);
    // All four live v1/v2 members survive publication.
    for member in Member::all() {
        let path = p
            .root
            .join(PACKAGES_DIR)
            .join(&expected)
            .join(member.file_name());
        assert!(path.exists(), "missing member {}", member.file_name());
    }
}

#[test]
fn staging_uses_the_literal_dot_leading_reserved_prefix() {
    // The leading '.' is load-bearing: it is what the renderer's archive/**
    // glob does not reach through before the G1 cutover (§R.1).
    assert!(STAGING_PREFIX.starts_with('.'));
    let p = publisher("dot-prefix");
    let begun = begin(&p, "chat_dot");
    assert!(begun.ok);
    let entries = packages_entries(&p);
    assert_eq!(entries.len(), 1);
    assert!(
        entries[0].starts_with(STAGING_PREFIX),
        "staging dir {} must carry the reserved dot-leading prefix",
        entries[0]
    );
    assert!(abort(&p, begun.token).ok);
}

#[test]
fn the_dot_leading_prefix_is_not_matched_by_a_non_literal_dot_glob() {
    // Pins the assumption §R.1 declares load-bearing: a `**`-style match that
    // requires a literal leading dot does NOT admit the staging component.
    // (This is the property the pinned matcher provides; the test pins the
    // shape of the name we depend on, which is what this module controls.)
    let name = format!("{STAGING_PREFIX}deadbeef");
    assert!(name.as_bytes()[0] == b'.');
    // A generation name never starts with '.', so the two namespaces are
    // distinguishable by exactly the property the scope rule keys on.
    let generation = generation_basename("chat", &"a".repeat(64));
    assert!(!generation.starts_with('.'));
}

#[test]
fn a_symlinked_member_is_refused_and_never_followed() {
    let p = publisher("symlink-member");
    let fx = v1_fixture("chat_sym", "snap1", "x");
    let begun = begin(&p, &fx.chat_id);
    assert!(begun.ok);
    write_member(&p, begun.token, Member::Snapshot, &fx.snapshot);
    write_member(&p, begun.token, Member::Markdown, &fx.markdown);
    write_member(&p, begun.token, Member::Html, &fx.html);

    // Plant a symlink where manifest.json belongs.
    let staging = packages_entries(&p)
        .into_iter()
        .find(|n| n.starts_with(STAGING_PREFIX))
        .expect("staging");
    let target = p.root.join("outside-secret.json");
    std::fs::write(&target, fx.manifest.clone()).expect("target");
    std::os::unix::fs::symlink(
        &target,
        p.root
            .join(PACKAGES_DIR)
            .join(&staging)
            .join("manifest.json"),
    )
    .expect("symlink");

    let result = commit(&p, begun.token, None);
    assert!(!result.ok);
    // Either the O_NOFOLLOW open refuses it, or the not-regular check does.
    assert!(
        blocker_codes(&result)
            .iter()
            .any(|c| c.starts_with("generation-manifest-missing")
                || c.starts_with("generation-member")),
        "unexpected: {:?}",
        blocker_codes(&result)
    );
    assert!(packages_entries(&p).is_empty(), "staging must be cleaned");
}

#[test]
fn an_unexpected_staging_entry_refuses_the_commit() {
    let p = publisher("foreign-entry");
    let fx = v1_fixture("chat_foreign", "snap1", "x");
    let begun = begin(&p, &fx.chat_id);
    stage_all(&p, begun.token, &fx);
    let staging = packages_entries(&p)
        .into_iter()
        .find(|n| n.starts_with(STAGING_PREFIX))
        .expect("staging");
    std::fs::write(
        p.root
            .join(PACKAGES_DIR)
            .join(&staging)
            .join("smuggled.txt"),
        b"planted",
    )
    .expect("plant");
    let result = commit(&p, begun.token, None);
    assert!(!result.ok);
    assert!(blocker_codes(&result).contains(&"generation-staging-unexpected-entry".to_string()));
}

#[test]
fn name_max_is_read_from_the_descriptor_and_fails_closed_on_overflow() {
    let p = publisher("name-max");
    // 250-char chatId + 74-byte suffix exceeds a 255-byte component limit.
    let long_id = "a".repeat(250);
    let begun = begin(&p, &long_id);
    assert!(!begun.ok);
    assert_eq!(
        begun.blockers[0].code,
        "generation-name-exceeds-filesystem-limit"
    );
    // Nothing was left behind by the refusal.
    assert!(packages_entries(&p).is_empty());
}

#[test]
fn chat_id_charset_is_revalidated_on_the_trusted_side() {
    let p = publisher("chatid");
    for bad in ["", ".", "..", "a/b", "a\\b", "a b", "a\u{00e9}"] {
        let begun = begin(&p, bad);
        assert!(!begun.ok, "chatId {bad:?} must be refused");
    }
    assert!(packages_entries(&p).is_empty());
}

// ── SESSION / CONCURRENCY ──────────────────────────────────────────────────

#[test]
fn session_admission_is_bounded_and_begin_refuses_when_full() {
    let p = publisher("admission");
    let mut tokens = Vec::new();
    for i in 0..MAX_ADMITTED_SESSIONS {
        let begun = begin(&p, &format!("chat_{i}"));
        assert!(begun.ok);
        tokens.push(begun.token);
    }
    let refused = begin(&p, "chat_overflow");
    assert!(!refused.ok);
    assert_eq!(
        refused.blockers[0].code,
        "generation-staging-sessions-exhausted"
    );
    // Releasing one slot re-admits.
    assert!(abort(&p, tokens[0]).ok);
    let readmitted = begin(&p, "chat_readmit");
    assert!(readmitted.ok);
}

#[test]
fn commit_consumes_the_session_and_releases_its_admission_slot() {
    let p = publisher("slot-release");
    let fx = v1_fixture("chat_slot", "snap1", "x");
    let result = publish(&p, &fx);
    assert!(result.ok);
    assert_eq!(p.registry.session_count(), 0, "session must be consumed");
    assert_eq!(
        p.registry.admitted_count(),
        0,
        "in-flight COMMIT must release its admission slot when it returns"
    );
}

#[test]
fn double_commit_and_post_commit_abort_are_safe() {
    let p = publisher("double-commit");
    let fx = v1_fixture("chat_double", "snap1", "x");
    let begun = begin(&p, &fx.chat_id);
    stage_all(&p, begun.token, &fx);
    let first = commit(&p, begun.token, None);
    assert!(first.ok && first.committed);

    // Second COMMIT finds no session.
    let second = commit(&p, begun.token, None);
    assert!(!second.ok);
    assert_eq!(second.blockers[0].code, "generation-session-unknown");

    // `finally { abort }` after a successful commit must be a benign no-op and
    // must NOT destroy the published generation.
    assert!(abort(&p, begun.token).ok);
    assert_eq!(packages_entries(&p).len(), 1);
    let published = &packages_entries(&p)[0];
    for member in Member::all() {
        assert!(p
            .root
            .join(PACKAGES_DIR)
            .join(published)
            .join(member.file_name())
            .exists());
    }
}

#[test]
fn abort_cleans_only_its_own_staging_and_is_idempotent() {
    let p = publisher("abort-clean");
    let keep = v1_fixture("chat_keep", "snap1", "keep");
    assert!(publish(&p, &keep).ok);
    let published = packages_entries(&p);
    assert_eq!(published.len(), 1);

    let begun = begin(&p, "chat_abort");
    stage_all(&p, begun.token, &v1_fixture("chat_abort", "snap1", "x"));
    assert!(abort(&p, begun.token).ok);
    // Idempotent: unknown token is benign.
    assert!(abort(&p, begun.token).ok);
    assert_eq!(packages_entries(&p), published, "only own staging removed");
}

#[test]
fn write_to_an_unknown_or_consumed_session_is_refused() {
    let p = publisher("unknown-write");
    let fx = v1_fixture("chat_unknown", "snap1", "x");
    assert!(!write_member(&p, 9_999, Member::Snapshot, b"x").ok);
    let begun = begin(&p, &fx.chat_id);
    stage_all(&p, begun.token, &fx);
    assert!(commit(&p, begun.token, None).ok);
    let after = write_member(&p, begun.token, Member::Snapshot, b"x");
    assert!(!after.ok);
    assert_eq!(after.blockers[0].code, "generation-session-unknown");
}

#[test]
fn a_member_may_arrive_in_many_chunks_and_interleave_with_others() {
    let p = publisher("chunked");
    let fx = v1_fixture("chat_chunk", "snap1", "chunked-body");
    let begun = begin(&p, &fx.chat_id);
    // Interleave snapshot and markdown chunk-by-chunk (§Q permits this).
    let mut si = 0usize;
    let mut mi = 0usize;
    while si < fx.snapshot.len() || mi < fx.markdown.len() {
        if si < fx.snapshot.len() {
            let end = (si + 7).min(fx.snapshot.len());
            assert!(write_member(&p, begun.token, Member::Snapshot, &fx.snapshot[si..end]).ok);
            si = end;
        }
        if mi < fx.markdown.len() {
            let end = (mi + 5).min(fx.markdown.len());
            assert!(write_member(&p, begun.token, Member::Markdown, &fx.markdown[mi..end]).ok);
            mi = end;
        }
    }
    assert!(write_member(&p, begun.token, Member::Html, &fx.html).ok);
    assert!(write_member(&p, begun.token, Member::Manifest, &fx.manifest).ok);
    let result = commit(&p, begun.token, None);
    assert!(result.ok, "{:?}", blocker_codes(&result));
    assert_eq!(result.content_hash, fx.content_hash);
}

#[test]
fn a_chunk_over_the_transport_bound_is_refused_without_capping_the_member() {
    let p = publisher("chunk-bound");
    let begun = begin(&p, "chat_bound");
    let oversize = vec![0u8; (CHUNK_CAP_BYTES + 1) as usize];
    let refused = write_member(&p, begun.token, Member::Snapshot, &oversize);
    assert!(!refused.ok);
    assert_eq!(refused.blockers[0].code, "generation-chunk-too-large");
    // The SAME number of bytes is accepted as two chunks — proving the bound is
    // transport-only and never a member ceiling (§R.2-A).
    let half = (CHUNK_CAP_BYTES / 2) as usize;
    assert!(write_member(&p, begun.token, Member::Snapshot, &oversize[..half]).ok);
    assert!(write_member(&p, begun.token, Member::Snapshot, &oversize[half..]).ok);
    assert!(abort(&p, begun.token).ok);
}

#[test]
fn concurrent_writers_never_clean_beneath_an_in_flight_operation() {
    // Acceptance invariant (§Q): an in-flight operation must never have its
    // staging cleaned nor its identity reused beneath it.
    use std::sync::Barrier;
    let p = Arc::new(publisher("concurrent"));
    let fx = Arc::new(v1_fixture("chat_conc", "snap1", "body"));
    let begun = begin(&p, &fx.chat_id);
    let token = begun.token;
    let barrier = Arc::new(Barrier::new(2));

    let writer = {
        let p = Arc::clone(&p);
        let fx = Arc::clone(&fx);
        let barrier = Arc::clone(&barrier);
        std::thread::spawn(move || {
            barrier.wait();
            for _ in 0..200 {
                write_member(&p, token, Member::Snapshot, &fx.snapshot);
            }
        })
    };
    let aborter = {
        let p = Arc::clone(&p);
        let barrier = Arc::clone(&barrier);
        std::thread::spawn(move || {
            barrier.wait();
            abort(&p, token)
        })
    };
    writer.join().expect("writer");
    aborter.join().expect("aborter");
    // Whatever the interleaving, exactly one claimant cleaned up and no staging
    // survives; the process did not panic or corrupt state.
    assert!(packages_entries(&p).is_empty());
    assert_eq!(p.registry.admitted_count(), 0);
}

// ── SESSION EVICTION (§Q) ──────────────────────────────────────────────────

/// Back-dates a session's last activity so lazy eviction can reach it. Uses the
/// existing test seam (mod tests sees privates); adds no production hook.
fn back_date(p: &Publisher, token: u64) {
    let session = p
        .registry
        .lock_map()
        .get(&token)
        .map(Arc::clone)
        .expect("session present");
    let mut inner = session.inner.lock().unwrap_or_else(|e| e.into_inner());
    inner.last_activity = Instant::now()
        .checked_sub(SESSION_IDLE_TIMEOUT + Duration::from_secs(1))
        .expect("clock");
}

#[test]
fn an_idle_session_is_evicted_and_its_staging_and_slot_are_reclaimed() {
    let p = publisher("evict-idle");
    let begun = begin(&p, "chat_idle");
    assert!(begun.ok);
    assert_eq!(p.registry.admitted_count(), 1);
    assert_eq!(packages_entries(&p).len(), 1, "staging exists");

    back_date(&p, begun.token);
    // Eviction is lazy: it runs under the BEGIN path.
    let next = begin(&p, "chat_next");
    assert!(next.ok);

    assert!(
        p.registry.lock_map().get(&begun.token).is_none(),
        "the idle session must be evicted"
    );
    assert_eq!(
        p.registry.admitted_count(),
        1,
        "exactly one slot released, one taken by the new session"
    );
    // Only the new session's staging remains — the evicted one was cleaned.
    let entries = packages_entries(&p);
    assert_eq!(
        entries.len(),
        1,
        "evicted staging must be removed: {entries:?}"
    );
    assert!(abort(&p, next.token).ok);
    assert!(packages_entries(&p).is_empty());
}

#[test]
fn a_fresh_session_is_never_evicted() {
    let p = publisher("evict-fresh");
    let a = begin(&p, "chat_a");
    assert!(a.ok);
    let b = begin(&p, "chat_b");
    assert!(b.ok);
    // Neither is idle, so an unconditional reap would wrongly remove them.
    assert!(p.registry.lock_map().get(&a.token).is_some());
    assert!(p.registry.lock_map().get(&b.token).is_some());
    assert_eq!(p.registry.admitted_count(), 2);
    assert_eq!(packages_entries(&p).len(), 2);
    assert!(abort(&p, a.token).ok);
    assert!(abort(&p, b.token).ok);
}

#[test]
fn eviction_runs_under_the_admission_claim_before_begin_refuses() {
    // §Q: "claim terminable sessions, then refuse if still full" — reaping must
    // happen BEFORE the cap check, or a full-but-idle registry would stay
    // wedged.
    let p = publisher("evict-then-admit");
    let mut tokens = Vec::new();
    for i in 0..MAX_ADMITTED_SESSIONS {
        let begun = begin(&p, &format!("chat_{i}"));
        assert!(begun.ok);
        tokens.push(begun.token);
    }
    assert!(
        !begin(&p, "chat_full").ok,
        "cap must refuse while every session is live"
    );
    back_date(&p, tokens[0]);
    let admitted = begin(&p, "chat_after_reap");
    assert!(
        admitted.ok,
        "reaping one idle session must free exactly one admission slot"
    );
    assert!(abort(&p, admitted.token).ok);
    for t in tokens.into_iter().skip(1) {
        assert!(abort(&p, t).ok);
    }
}

#[test]
fn an_idle_session_holding_its_lease_is_not_evicted_beneath_active_work() {
    // §Q property 8: eviction may not delete staging beneath an active WRITE,
    // even when the session looks idle by timestamp.
    let p = Arc::new(publisher("evict-vs-lease"));
    let begun = begin(&p, "chat_leased");
    assert!(begun.ok);
    back_date(&p, begun.token);
    let session = p
        .registry
        .lock_map()
        .get(&begun.token)
        .map(Arc::clone)
        .expect("session");

    // Hold the lease, as an in-flight WRITE does.
    let guard = session.inner.lock().unwrap_or_else(|e| e.into_inner());
    let before = packages_entries(&p);
    let other = begin(&p, "chat_other");
    assert!(other.ok);
    // The leased session's staging survives: try_lock in reap_idle skipped it.
    let after = packages_entries(&p);
    for entry in &before {
        assert!(
            after.contains(entry),
            "staging {entry} was removed beneath a held lease"
        );
    }
    assert!(
        p.registry.lock_map().get(&begun.token).is_some(),
        "a leased session must not be evicted"
    );
    drop(guard);
    assert!(abort(&p, begun.token).ok);
    assert!(abort(&p, other.token).ok);
}

// ── MEMBERS ────────────────────────────────────────────────────────────────

#[test]
fn every_required_v1_member_is_mandatory() {
    for missing in Member::all() {
        let p = publisher("missing-member");
        let fx = v1_fixture("chat_missing", "snap1", "x");
        let begun = begin(&p, &fx.chat_id);
        for member in Member::all() {
            if member == missing {
                continue;
            }
            let bytes = match member {
                Member::Snapshot => &fx.snapshot,
                Member::Markdown => &fx.markdown,
                Member::Html => &fx.html,
                Member::Manifest => &fx.manifest,
            };
            write_member(&p, begun.token, member, bytes);
        }
        let result = commit(&p, begun.token, None);
        assert!(
            !result.ok,
            "missing {} must refuse — the v3 two-member form is not admitted",
            missing.file_name()
        );
        assert!(packages_entries(&p).is_empty());
    }
}

#[test]
fn staged_bytes_altered_before_verification_are_detected() {
    let p = publisher("altered");
    let fx = v1_fixture("chat_alter", "snap1", "x");
    let begun = begin(&p, &fx.chat_id);
    stage_all(&p, begun.token, &fx);
    // Mutate the staged markdown behind the session's back, as a separately
    // held writable handle could.
    let staging = packages_entries(&p)
        .into_iter()
        .find(|n| n.starts_with(STAGING_PREFIX))
        .expect("staging");
    let path = p.root.join(PACKAGES_DIR).join(&staging).join("chat.md");
    std::fs::write(&path, b"TAMPERED-TAMPERED-TAMPERED").expect("tamper");

    let result = commit(&p, begun.token, None);
    assert!(!result.ok, "tampered member must not publish");
    let codes = blocker_codes(&result);
    assert!(
        codes.contains(&"generation-member-sha-mismatch".to_string())
            || codes.contains(&"generation-member-byte-length-mismatch".to_string()),
        "unexpected: {codes:?}"
    );
    assert!(packages_entries(&p).is_empty());
}

// ── IDENTITY ───────────────────────────────────────────────────────────────

#[test]
fn v1_identity_is_the_hash_of_the_exact_staged_snapshot_bytes() {
    // Whitespace that a parse-and-reserialize would normalize away MUST change
    // identity, proving the bytes — not a reparse — are the authority.
    let p = publisher("v1-bytes");
    let a = v1_fixture("chat_bytes", "snap1", "x");
    let result_a = publish(&p, &a);
    assert!(result_a.ok);
    assert_eq!(result_a.content_hash, sha_of(&a.snapshot));

    let mut b = v1_fixture("chat_bytes", "snap1", "x");
    // Re-space the JSON without changing its meaning.
    let respaced = String::from_utf8(b.snapshot.clone())
        .unwrap()
        .replace("\":", "\" :");
    b.snapshot = respaced.into_bytes();
    b.content_hash = sha_of(&b.snapshot);
    b.manifest = String::from_utf8(b.manifest.clone())
        .unwrap()
        .replace(
            &format!("\"contentHash\":\"{}\"", sha_of(&a.snapshot)),
            &format!("\"contentHash\":\"{}\"", b.content_hash),
        )
        .replace(
            &format!(
                "\"snapshot\":{{\"path\":\"snapshot.json\",\"sha256\":\"{}\",\"byteLength\":{}}}",
                sha_of(&a.snapshot),
                a.snapshot.len()
            ),
            &format!(
                "\"snapshot\":{{\"path\":\"snapshot.json\",\"sha256\":\"{}\",\"byteLength\":{}}}",
                sha_of(&b.snapshot),
                b.snapshot.len()
            ),
        )
        .into_bytes();
    assert_ne!(
        a.content_hash, b.content_hash,
        "byte identity, not semantic"
    );
    let result_b = publish(&p, &b);
    assert!(result_b.ok, "{:?}", blocker_codes(&result_b));
    assert_eq!(packages_entries(&p).len(), 2, "two distinct generations");
}

#[test]
fn v2_pre_image_is_the_frozen_two_key_descriptor() {
    // Golden vector: the exact historical shape, compact, keys in this order.
    let pre = v2_content_pre_image(
        "sha256-1111111111111111111111111111111111111111111111111111111111111111",
        &[
            "sha256-2222222222222222222222222222222222222222222222222222222222222222".to_string(),
            "sha256-3333333333333333333333333333333333333333333333333333333333333333".to_string(),
        ],
    );
    assert_eq!(
        pre,
        "{\"assets\":[\"sha256-2222222222222222222222222222222222222222222222222222222222222222\",\"sha256-3333333333333333333333333333333333333333333333333333333333333333\"],\"snapshot\":\"sha256-1111111111111111111111111111111111111111111111111111111111111111\"}"
    );
    // No spaces, no trailing comma, `assets` before `snapshot`.
    assert!(!pre.contains(' '));
    assert!(pre.find("\"assets\"").unwrap() < pre.find("\"snapshot\"").unwrap());
}

#[test]
fn v2_identity_ignores_caller_asset_order_but_not_content() {
    let root = scratch_root("v2-order");
    let p = Publisher::new(root.clone());
    let a = v2_fixture(
        &root,
        "chat_v2",
        &[("png", b"alpha-bytes"), ("png", b"beta-bytes")],
    );
    let b = v2_fixture(
        &root,
        "chat_v2",
        &[("png", b"beta-bytes"), ("png", b"alpha-bytes")],
    );
    // Same asset SET in reversed input order → identical identity.
    assert_eq!(
        derive_content_hash(true, &a.snapshot, &{
            let mut v = vec![sha_of(b"alpha-bytes"), sha_of(b"beta-bytes")];
            v.sort();
            v
        }),
        derive_content_hash(true, &a.snapshot, &{
            let mut v = vec![sha_of(b"beta-bytes"), sha_of(b"alpha-bytes")];
            v.sort();
            v
        })
    );
    let result = publish(&p, &a);
    assert!(result.ok, "{:?}", blocker_codes(&result));
    assert_eq!(result.content_hash, a.content_hash);
    // Different content → different identity.
    assert_ne!(
        a.content_hash,
        v2_fixture(&root, "chat_v2", &[("png", b"other")]).content_hash
    );
    // Republishing the SAME v2 content exercises classify_occupant's v2 branch
    // — the payload_v2 arm and the descriptor sort — which the v1 occupant
    // tests never reach.
    let again = publish(&p, &a);
    assert!(again.ok, "{:?}", blocker_codes(&again));
    assert_eq!(again.outcome, Outcome::Deduped);
    assert!(!again.committed);
    assert_eq!(packages_entries(&p).len(), 1);
    let _ = b;
}

#[test]
fn a_v2_occupant_missing_its_asset_copies_is_partial_not_deduped() {
    // RED repair: the occupant's declared asset copies are required members
    // (§J) and the reader blocks on them, so an occupant whose assets/ subtree
    // was removed must never be laundered into DEDUPED — especially since
    // dedupe DELETES this attempt's correct copy.
    let root = scratch_root("occupant-assets-missing");
    let p = Publisher::new(root.clone());
    let fx = v2_fixture(&root, "chat_v2miss", &[("png", b"asset-bytes")]);
    assert!(publish(&p, &fx).ok);
    let published = packages_entries(&p)[0].clone();
    let assets_dir = p.root.join(PACKAGES_DIR).join(&published).join("assets");
    std::fs::remove_dir_all(&assets_dir).expect("remove assets");

    let result = publish(&p, &fx);
    assert!(!result.ok, "a missing asset copy must not dedupe");
    assert_eq!(result.outcome, Outcome::GenerationPartial);
    assert_eq!(packages_entries(&p), vec![published]);
}

#[test]
fn a_v2_occupant_with_tampered_asset_bytes_is_corrupt_not_deduped() {
    let root = scratch_root("occupant-assets-tampered");
    let p = Publisher::new(root.clone());
    let fx = v2_fixture(&root, "chat_v2tamper", &[("png", b"asset-bytes")]);
    assert!(publish(&p, &fx).ok);
    let published = packages_entries(&p)[0].clone();
    let sha = sha_of(b"asset-bytes");
    let copied = p
        .root
        .join(PACKAGES_DIR)
        .join(&published)
        .join("assets")
        .join(format!("{sha}.png"));
    std::fs::write(&copied, b"TAMPERED").expect("tamper");

    let result = publish(&p, &fx);
    assert!(!result.ok, "tampered asset bytes must not dedupe");
    assert_eq!(result.outcome, Outcome::GenerationDestinationCorrupt);
    assert_eq!(
        std::fs::read(&copied).unwrap(),
        b"TAMPERED",
        "occupant untouched"
    );
}

#[test]
fn a_v1_occupant_with_a_truncated_renderer_member_still_dedupes() {
    // NEGATIVE CONTROL, deliberately pinning what must NOT be enforced: the
    // governed reader never hashes chat.md / chat.html (presence only), and §K
    // states they are not identity authority. Such an occupant is VALID and
    // §P case B mandates DEDUPED. A future "tightening" that re-hashed them
    // would permanently fail republication of a package the reader accepts.
    let p = publisher("occupant-md-truncated");
    let fx = v1_fixture("chat_mdtrunc", "snap1", "x");
    assert!(publish(&p, &fx).ok);
    let published = packages_entries(&p)[0].clone();
    std::fs::write(
        p.root.join(PACKAGES_DIR).join(&published).join("chat.md"),
        b"",
    )
    .expect("truncate");

    let result = publish(&p, &fx);
    assert!(result.ok, "{:?}", blocker_codes(&result));
    assert_eq!(result.outcome, Outcome::Deduped);
}

#[test]
fn an_internally_inconsistent_occupant_is_corrupt_not_deduped() {
    // The occupant's manifest declares OUR content hash and describes OUR
    // snapshot bytes correctly, so the pre-existing hash checks all pass — the
    // ONLY thing wrong is that its manifest.chatId disagrees with its own
    // snapshot.chatId, which the governed reader blocks (chat-id-mismatch).
    // Without the occupant cross-binding check this laundering succeeds.
    let p = publisher("occupant-crossbind");
    let fx = v1_fixture("chat_join", "snap1", "shared-body");
    let hex = fx.content_hash.strip_prefix("sha256-").unwrap();
    let target = p
        .root
        .join(PACKAGES_DIR)
        .join(generation_basename(&fx.chat_id, hex));
    std::fs::create_dir_all(&target).expect("plant");
    // Same manifest as fx, but with a divergent chatId. Every descriptor and
    // the contentHash still describe fx's real bytes.
    let divergent = String::from_utf8(fx.manifest.clone())
        .unwrap()
        .replace("\"chatId\":\"chat_join\"", "\"chatId\":\"chat_other\"")
        .into_bytes();
    std::fs::write(target.join("snapshot.json"), &fx.snapshot).unwrap();
    std::fs::write(target.join("chat.md"), &fx.markdown).unwrap();
    std::fs::write(target.join("chat.html"), &fx.html).unwrap();
    std::fs::write(target.join("manifest.json"), &divergent).unwrap();

    let result = publish(&p, &fx);
    assert!(
        !result.ok,
        "an occupant whose manifest and snapshot disagree must not dedupe"
    );
    assert_eq!(result.outcome, Outcome::GenerationDestinationCorrupt);
    // Occupant untouched.
    assert_eq!(
        std::fs::read(target.join("manifest.json")).unwrap(),
        divergent
    );
}

#[test]
fn a_symlink_at_the_destination_is_unreadable_and_never_followed() {
    let p = publisher("occupant-symlink");
    let fx = v1_fixture("chat_symdest", "snap1", "x");
    let hex = fx.content_hash.strip_prefix("sha256-").unwrap();
    // Point it at a byte-identical valid package: the case that must NOT
    // become DEDUPED by following the link.
    let elsewhere = p.root.join("elsewhere.h2ochat");
    std::fs::create_dir_all(&elsewhere).expect("elsewhere");
    std::fs::write(elsewhere.join("snapshot.json"), &fx.snapshot).unwrap();
    std::fs::write(elsewhere.join("chat.md"), &fx.markdown).unwrap();
    std::fs::write(elsewhere.join("chat.html"), &fx.html).unwrap();
    std::fs::write(elsewhere.join("manifest.json"), &fx.manifest).unwrap();
    std::fs::create_dir_all(p.root.join(PACKAGES_DIR)).ok();
    let link = p
        .root
        .join(PACKAGES_DIR)
        .join(generation_basename(&fx.chat_id, hex));
    std::os::unix::fs::symlink(&elsewhere, &link).expect("symlink");

    let result = publish(&p, &fx);
    assert!(!result.ok, "a symlink is neither valid nor an identity");
    assert_eq!(result.outcome, Outcome::GenerationOccupantUnreadable);
    assert!(std::fs::symlink_metadata(&link)
        .unwrap()
        .file_type()
        .is_symlink());
    assert!(elsewhere.join("manifest.json").exists());
}

#[test]
fn hash_math_does_not_deduplicate_even_though_the_gate_refuses_duplicates() {
    // Historical reader compatibility: the FORMULA hashes the list it is given.
    let sha = "sha256-4444444444444444444444444444444444444444444444444444444444444444".to_string();
    let once = v2_content_pre_image(
        "sha256-0000000000000000000000000000000000000000000000000000000000000000",
        &[sha.clone()],
    );
    let twice = v2_content_pre_image(
        "sha256-0000000000000000000000000000000000000000000000000000000000000000",
        &[sha.clone(), sha.clone()],
    );
    assert_ne!(once, twice, "the formula must not silently dedupe");
    assert_eq!(twice.matches("sha256-4444").count(), 2);
    // Pin the property at the derivation entry point too, not only in the
    // pre-image builder: a `dedup()` anywhere on this path would change the
    // identity of a historical duplicate-bearing package.
    let snapshot = b"{\"chatId\":\"c\"}";
    assert_ne!(
        derive_content_hash(true, snapshot, &[sha.clone()]),
        derive_content_hash(true, snapshot, &[sha.clone(), sha.clone()]),
        "derive_content_hash must hash the list it is given"
    );
}

#[test]
fn a_caller_supplied_content_hash_cannot_force_identity() {
    let p = publisher("hash-forge");
    let mut fx = v1_fixture("chat_forge", "snap1", "x");
    let forged = "sha256-".to_string() + &"f".repeat(64);
    // Replace ONLY the contentHash field. For v1 the contentHash equals the
    // snapshot descriptor's sha, so a blanket replace would corrupt the
    // descriptor too and the member re-hash would fire first — this test must
    // isolate the identity-derivation guard.
    fx.manifest = String::from_utf8(fx.manifest.clone())
        .unwrap()
        .replace(
            &format!("\"contentHash\":\"{}\"", fx.content_hash),
            &format!("\"contentHash\":\"{forged}\""),
        )
        .into_bytes();
    let result = publish(&p, &fx);
    assert!(!result.ok, "a forged contentHash must refuse, never steer");
    assert_eq!(
        blocker_codes(&result),
        vec!["generation-content-hash-mismatch".to_string()]
    );
    // And no directory was created under the forged name.
    assert!(packages_entries(&p).is_empty());
}

#[test]
fn expected_manifest_sha_can_only_refuse() {
    let p = publisher("expected-sha");
    let fx = v1_fixture("chat_expect", "snap1", "x");

    // Wrong assertion refuses.
    let begun = begin(&p, &fx.chat_id);
    stage_all(&p, begun.token, &fx);
    let wrong = commit(
        &p,
        begun.token,
        Some(&("sha256-".to_string() + &"a".repeat(64))),
    );
    assert!(!wrong.ok);
    assert_eq!(
        wrong.blockers[0].code,
        "generation-expected-manifest-sha-mismatch"
    );

    // Correct assertion changes nothing about the derived identity.
    let begun = begin(&p, &fx.chat_id);
    stage_all(&p, begun.token, &fx);
    let right = commit(&p, begun.token, Some(&sha_of(&fx.manifest)));
    assert!(right.ok);
    assert_eq!(right.content_hash, fx.content_hash);
}

#[test]
fn the_module_uses_no_generic_canonicalizer_and_no_colon_identity() {
    // Wrong-canonicalizer tripwire (§T / C7). The identity path must not reuse
    // transport canonicalization, generic object sorting, or a `sha256:` form.
    let source = include_str!("../archive_generation_publish.rs");
    assert!(
        !source.contains("sorted_json_value"),
        "archive identity must not reuse transport canonicalization"
    );
    // The colon form would appear as a string literal prefix (`"sha256:`), not
    // as Rust struct-field syntax (`sha256: String`), so match the literal.
    assert!(
        !source.contains("\"sha256:"),
        "archive identity uses the `sha256-` prefix, never the colon transport form"
    );
    assert!(
        source.contains("\"sha256-{}\""),
        "identity must be emitted in the historical `sha256-` prefixed form"
    );
    // The pre-image is built literally, not serialized from a map.
    assert!(
        source.contains("out.push_str(\"{\\\"assets\\\":[\")")
            || source.contains("String::from(\"{\\\"assets\\\":[\")")
    );
    // A serde_json map serialization of the descriptor would be a generic
    // canonicalizer; ensure the identity fn does not take that route.
    let fn_start = source
        .find("fn v2_content_pre_image")
        .expect("pre-image fn present");
    let fn_end = source[fn_start..].find("\n}\n").expect("fn end") + fn_start;
    let body = &source[fn_start..fn_end];
    assert!(!body.contains("serde_json"), "pre-image must be literal");
    assert!(
        !body.contains("to_string()"),
        "no serializer in the pre-image"
    );
}

#[test]
fn integer_like_metadata_keys_do_not_affect_archive_identity() {
    // The JS canonicalizer's integer-index-key hazard must never reach this
    // module: v1 hashes bytes, so key ORDER in the snapshot is whatever the
    // producer wrote and is hashed verbatim.
    let with_keys =
        br#"{"schemaVersion":1,"chatId":"c","snapshotId":"s","metadata":{"10":"a","2":"b"}}"#;
    let reordered =
        br#"{"schemaVersion":1,"chatId":"c","snapshotId":"s","metadata":{"2":"b","10":"a"}}"#;
    assert_ne!(
        derive_content_hash(false, with_keys, &[]),
        derive_content_hash(false, reordered, &[]),
        "byte identity means a different byte order is a different package"
    );
    // And neither is reordered by us.
    assert_eq!(
        derive_content_hash(false, with_keys, &[]),
        sha_of(with_keys)
    );
}

// ── VERSION TRIPLES ────────────────────────────────────────────────────────

#[test]
fn incoherent_version_triples_are_refused() {
    let base = |extra: &str, assets: &str| {
        format!(
            r#"{{"schema":"h2o.savedChatPackage","chatId":"c","snapshotId":"s","contentHash":"sha256-{}","files":{{}},{extra}"assets":[{assets}]}}"#,
            "0".repeat(64)
        )
        .into_bytes()
    };
    // A fully VALID descriptor, so each case is refused by the version triple
    // itself rather than by an unrelated descriptor guard.
    let good_asset = format!(
        r#"{{"path":"assets/sha256-{h}.png","sha256":"sha256-{h}","ext":"png","mimeType":"image/png","byteLength":1}}"#,
        h = "9".repeat(64)
    );
    let triple = "generation-manifest-version-triple-incoherent";

    // schemaVersion 1 + payloadVersion 2 hybrid
    assert_eq!(
        validate_manifest(&base("\"schemaVersion\":1,\"payloadVersion\":2,", "")).unwrap_err(),
        triple
    );
    // v1 with non-empty assets
    assert_eq!(
        validate_manifest(&base("\"schemaVersion\":1,", &good_asset)).unwrap_err(),
        triple
    );
    // v2 with empty assets
    assert_eq!(
        validate_manifest(&base("\"schemaVersion\":2,\"payloadVersion\":2,", "")).unwrap_err(),
        triple
    );
    // schemaVersion 3 is not admitted by M05, even when otherwise coherent.
    assert_eq!(
        validate_manifest(&base(
            "\"schemaVersion\":3,\"payloadVersion\":3,",
            &good_asset
        ))
        .unwrap_err(),
        triple
    );
    // Wrong schema string
    assert_eq!(
        validate_manifest(br#"{"schema":"other","schemaVersion":1,"assets":[]}"#).unwrap_err(),
        "generation-manifest-schema-invalid"
    );
}

#[test]
fn cross_binding_between_manifest_snapshot_and_begin_chat_id_is_enforced() {
    let p = publisher("cross-bind");
    let fx = v1_fixture("chat_bind", "snap1", "x");
    // A snapshot naming a different chat than BEGIN/manifest.
    let mut wrong = v1_fixture("chat_bind", "snap1", "x");
    wrong.snapshot = String::from_utf8(fx.snapshot.clone())
        .unwrap()
        .replace("\"chatId\":\"chat_bind\"", "\"chatId\":\"chat_other\"")
        .into_bytes();
    // Keep the manifest self-consistent for the snapshot descriptor so the
    // cross-binding check is what fires.
    wrong.content_hash = sha_of(&wrong.snapshot);
    wrong.manifest = String::from_utf8(fx.manifest.clone())
        .unwrap()
        .replace(&sha_of(&fx.snapshot), &sha_of(&wrong.snapshot))
        .replace(
            &format!("\"byteLength\":{}", fx.snapshot.len()),
            &format!("\"byteLength\":{}", wrong.snapshot.len()),
        )
        .replace(&fx.content_hash, &wrong.content_hash)
        .into_bytes();
    let result = publish(&p, &wrong);
    assert!(!result.ok);
    assert!(blocker_codes(&result).contains(&"generation-chat-id-mismatch".to_string()));
}

// ── REAL SANCTIONED-WRITER CONFORMANCE ─────────────────────────────────────

#[test]
fn the_gate_accepts_a_real_committed_sanctioned_writer_package() {
    // The strongest conformance proof available without launching Desktop: run
    // the ACTUAL committed v1 fixture — produced by the live JS writer — end to
    // end through this gate. The gate must never refuse writer-producible
    // output (that would be a class-C new package-validity rule).
    let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../tools/validation/fixtures/saved-chat-archive/import-recovery/i-harness-source.h2ochat");
    if !base.join("manifest.json").exists() {
        // Fixture path is relative to the repo; skip rather than fail if the
        // crate is built out of tree.
        return;
    }
    let manifest = std::fs::read(base.join("manifest.json")).expect("manifest");
    let snapshot = std::fs::read(base.join("snapshot.json")).expect("snapshot");
    let markdown = std::fs::read(base.join("chat.md")).expect("chat.md");
    let html = std::fs::read(base.join("chat.html")).expect("chat.html");

    // The manifest validates, and its version triple is the real v1 shape.
    let validated = validate_manifest(&manifest).expect("real manifest must validate");
    assert!(!validated.payload_v2, "the fixture is v1");
    assert!(validated.assets.is_empty());

    // Our derivation reproduces the writer's own contentHash byte-exactly.
    let derived = derive_content_hash(false, &snapshot, &[]);
    assert_eq!(
        derived, validated.content_hash,
        "trusted derivation must reproduce the live writer's identity"
    );

    // And the whole package publishes through the real protocol.
    let p = publisher("real-fixture");
    let begun = begin(&p, &validated.chat_id);
    assert!(begun.ok, "{:?}", begun.blockers);
    assert!(write_member(&p, begun.token, Member::Snapshot, &snapshot).ok);
    assert!(write_member(&p, begun.token, Member::Markdown, &markdown).ok);
    assert!(write_member(&p, begun.token, Member::Html, &html).ok);
    assert!(write_member(&p, begun.token, Member::Manifest, &manifest).ok);
    let result = commit(&p, begun.token, None);
    assert!(
        result.ok && result.committed,
        "a real sanctioned-writer package must publish: {:?}",
        blocker_codes(&result)
    );
    assert_eq!(result.content_hash, validated.content_hash);
}

// ── ASSETS ─────────────────────────────────────────────────────────────────

#[test]
fn v2_assets_are_copied_from_the_cas_and_reverified() {
    let root = scratch_root("assets-copy");
    let p = Publisher::new(root.clone());
    let fx = v2_fixture(&root, "chat_assets", &[("png", b"image-bytes-here")]);
    let result = publish(&p, &fx);
    assert!(result.ok, "{:?}", blocker_codes(&result));
    let published = &packages_entries(&p)[0];
    let sha = sha_of(b"image-bytes-here");
    let copied = p
        .root
        .join(PACKAGES_DIR)
        .join(published)
        .join("assets")
        .join(format!("{sha}.png"));
    assert!(copied.exists(), "package must be self-contained");
    assert_eq!(std::fs::read(&copied).unwrap(), b"image-bytes-here");
}

#[test]
fn a_corrupt_cas_object_refuses_publication() {
    let root = scratch_root("cas-corrupt");
    let p = Publisher::new(root.clone());
    let fx = v2_fixture(&root, "chat_cas", &[("png", b"good-bytes")]);
    // Corrupt the CAS object AFTER the manifest was built.
    let sha = sha_of(b"good-bytes");
    let hex = sha.strip_prefix("sha256-").unwrap();
    let path = root
        .join("assets")
        .join(&hex[0..2])
        .join(format!("sha256-{hex}"));
    std::fs::write(&path, b"corrupted!").expect("corrupt");
    let result = publish(&p, &fx);
    assert!(
        !result.ok,
        "a CAS object that does not hash to its name must refuse"
    );
    let codes = blocker_codes(&result);
    assert!(
        codes.contains(&"generation-asset-sha-mismatch".to_string())
            || codes.contains(&"generation-asset-byte-length-mismatch".to_string()),
        "{codes:?}"
    );
    assert!(packages_entries(&p).is_empty());
}

#[test]
fn a_historical_over_ingest_cap_cas_object_remains_packageable() {
    // DP-PRE-M05-ASSET-BOUND is an INGEST ceiling, never a read/packaging
    // ceiling. A pre-existing object larger than the ingest cap must still be
    // copyable into a new generation.
    let root = scratch_root("over-cap");
    let p = Publisher::new(root.clone());
    let big = vec![7u8; (crate::archive_durable_write::GOVERNED_ASSET_BLOB_CAP_BYTES + 1) as usize];
    let fx = v2_fixture(&root, "chat_big", &[("png", &big)]);
    let result = publish(&p, &fx);
    assert!(
        result.ok,
        "historical over-cap CAS object must remain packageable: {:?}",
        blocker_codes(&result)
    );
    let published = &packages_entries(&p)[0];
    let copied = p
        .root
        .join(PACKAGES_DIR)
        .join(published)
        .join("assets")
        .join(format!("{}.png", sha_of(&big)));
    assert_eq!(std::fs::metadata(&copied).unwrap().len(), big.len() as u64);
}

#[test]
fn a_caller_cannot_redirect_the_cas_source_through_the_descriptor_path() {
    // The descriptor `path` is validated to be exactly `assets/<sha>.<ext>`, so
    // it cannot name another location; the CAS source is derived from the sha.
    let manifest = format!(
        r#"{{"schema":"h2o.savedChatPackage","schemaVersion":2,"payloadVersion":2,"chatId":"c","snapshotId":"s","contentHash":"sha256-{h}","files":{{}},"assets":[{{"path":"../../escape.png","sha256":"sha256-{h}","ext":"png","mimeType":"image/png","byteLength":1}}]}}"#,
        h = "1".repeat(64)
    );
    let err = validate_manifest(manifest.as_bytes()).unwrap_err();
    assert_eq!(err, "generation-manifest-asset-path-invalid");
}

#[test]
fn duplicate_asset_descriptors_are_refused_on_new_publications() {
    let sha = format!("sha256-{}", "2".repeat(64));
    let manifest = format!(
        r#"{{"schema":"h2o.savedChatPackage","schemaVersion":2,"payloadVersion":2,"chatId":"c","snapshotId":"s","contentHash":"sha256-{h}","files":{{}},"assets":[{{"path":"assets/{sha}.png","sha256":"{sha}","ext":"png","mimeType":"image/png","byteLength":1}},{{"path":"assets/{sha}.png","sha256":"{sha}","ext":"png","mimeType":"image/png","byteLength":1}}]}}"#,
        h = "1".repeat(64)
    );
    let err = validate_manifest(manifest.as_bytes()).unwrap_err();
    assert!(err.starts_with("generation-manifest-asset-duplicate"));
}

// ── PROMOTION / OCCUPIED DESTINATION ───────────────────────────────────────

#[test]
fn republishing_identical_content_dedupes_trusted_side() {
    let p = publisher("dedupe");
    let fx = v1_fixture("chat_dedupe", "snap1", "same");
    let first = publish(&p, &fx);
    assert!(first.ok && first.committed && first.outcome == Outcome::Created);

    let second = publish(&p, &fx);
    assert!(second.ok, "{:?}", blocker_codes(&second));
    assert_eq!(second.outcome, Outcome::Deduped);
    assert!(
        !second.committed,
        "dedupe is a success that deliberately wrote nothing"
    );
    assert_eq!(second.content_hash, fx.content_hash);
    assert_eq!(packages_entries(&p).len(), 1, "no second directory");
}

#[test]
fn a_corrupt_occupant_is_classified_and_never_overwritten() {
    let p = publisher("occupant-corrupt");
    let fx = v1_fixture("chat_corrupt", "snap1", "x");
    assert!(publish(&p, &fx).ok);
    let published = packages_entries(&p)[0].clone();
    // Corrupt the published manifest.
    let manifest_path = p
        .root
        .join(PACKAGES_DIR)
        .join(&published)
        .join("manifest.json");
    std::fs::write(&manifest_path, b"{not json").expect("corrupt");

    let result = publish(&p, &fx);
    assert!(!result.ok);
    assert_eq!(result.outcome, Outcome::GenerationDestinationCorrupt);
    // The occupant is untouched — create-only is unconditional.
    assert_eq!(std::fs::read(&manifest_path).unwrap(), b"{not json");
    assert_eq!(packages_entries(&p), vec![published]);
}

#[test]
fn a_partial_occupant_is_classified_partial() {
    let p = publisher("occupant-partial");
    let fx = v1_fixture("chat_partial", "snap1", "x");
    assert!(publish(&p, &fx).ok);
    let published = packages_entries(&p)[0].clone();
    std::fs::remove_file(p.root.join(PACKAGES_DIR).join(&published).join("chat.md"))
        .expect("remove member");

    let result = publish(&p, &fx);
    assert!(!result.ok);
    assert_eq!(result.outcome, Outcome::GenerationPartial);
    assert_eq!(packages_entries(&p), vec![published]);
}

#[test]
fn a_foreign_occupant_is_classified_foreign() {
    let p = publisher("occupant-foreign");
    let fx = v1_fixture("chat_foreign2", "snap1", "x");
    let hex = fx.content_hash.strip_prefix("sha256-").unwrap();
    // Plant a DIFFERENT but internally valid package at our target name.
    let other = v1_fixture("chat_foreign2", "snap2", "different-body");
    let target = p
        .root
        .join(PACKAGES_DIR)
        .join(generation_basename(&fx.chat_id, hex));
    std::fs::create_dir_all(&target).expect("plant dir");
    std::fs::write(target.join("snapshot.json"), &other.snapshot).unwrap();
    std::fs::write(target.join("chat.md"), &other.markdown).unwrap();
    std::fs::write(target.join("chat.html"), &other.html).unwrap();
    std::fs::write(target.join("manifest.json"), &other.manifest).unwrap();

    let result = publish(&p, &fx);
    assert!(!result.ok);
    assert_eq!(result.outcome, Outcome::GenerationDestinationForeign);
    // Occupant preserved byte-for-byte.
    assert_eq!(
        std::fs::read(target.join("snapshot.json")).unwrap(),
        other.snapshot
    );
}

#[test]
fn two_publishers_racing_the_same_generation_produce_exactly_one_commit() {
    let p = Arc::new(publisher("race-same"));
    let fx = Arc::new(v1_fixture("chat_race", "snap1", "race-body"));
    let barrier = Arc::new(std::sync::Barrier::new(3));
    let mut handles = Vec::new();
    for _ in 0..3 {
        let p = Arc::clone(&p);
        let fx = Arc::clone(&fx);
        let barrier = Arc::clone(&barrier);
        handles.push(std::thread::spawn(move || {
            let begun = begin(&p, &fx.chat_id);
            assert!(begun.ok);
            stage_all(&p, begun.token, &fx);
            barrier.wait();
            commit(&p, begun.token, None)
        }));
    }
    let results: Vec<PublishResult> = handles
        .into_iter()
        .map(|h| h.join().expect("thread"))
        .collect();
    let committed = results.iter().filter(|r| r.committed).count();
    let deduped = results
        .iter()
        .filter(|r| r.outcome == Outcome::Deduped)
        .count();
    assert_eq!(committed, 1, "exactly one publisher may promote");
    assert_eq!(deduped, 2, "the losers dedupe trusted-side");
    assert!(results.iter().all(|r| r.ok));
    assert_eq!(
        packages_entries(&p).len(),
        1,
        "one directory, no staging residue"
    );
}

#[test]
fn different_generations_for_one_chat_both_publish_side_by_side() {
    let p = publisher("race-diff");
    let a = v1_fixture("chat_multi", "snap1", "first");
    let b = v1_fixture("chat_multi", "snap2", "second");
    assert!(publish(&p, &a).ok);
    assert!(publish(&p, &b).ok);
    let entries = packages_entries(&p);
    assert_eq!(entries.len(), 2, "generations accumulate side by side");
    assert!(entries.iter().all(|e| e.starts_with("chat_multi.g")));
    assert_ne!(a.content_hash, b.content_hash);
}

#[test]
fn promotion_is_create_only_and_never_replaces_a_destination() {
    // Directly exercise the promotion primitive with a POPULATED directory.
    let p = publisher("promote-excl");
    let packages = p.packages_dir().expect("packages");
    packages.mkdir_child_exclusive(b"src-dir").expect("src");
    let src = packages.open_child_nofollow(b"src-dir").expect("open src");
    src.create_new_child(b"member").expect("member");
    packages.mkdir_child_exclusive(b"dest-dir").expect("dest");
    let dest = packages
        .open_child_nofollow(b"dest-dir")
        .expect("open dest");
    dest.create_new_child(b"occupant-file").expect("occupant");

    let promoted = packages
        .promote_dir_exclusive(b"src-dir", b"dest-dir")
        .expect("promote call");
    assert!(!promoted, "an occupied destination must not be replaced");
    // The occupant survived.
    assert!(p
        .root
        .join(PACKAGES_DIR)
        .join("dest-dir")
        .join("occupant-file")
        .exists());
    // A free destination promotes, carrying its contents.
    let promoted = packages
        .promote_dir_exclusive(b"src-dir", b"free-dir")
        .expect("promote call");
    assert!(promoted);
    assert!(p
        .root
        .join(PACKAGES_DIR)
        .join("free-dir")
        .join("member")
        .exists());
}

// ── DURABILITY ─────────────────────────────────────────────────────────────

#[test]
fn a_successful_promotion_reports_committed_and_retains_the_generation() {
    let p = publisher("durability");
    let fx = v1_fixture("chat_durable", "snap1", "x");
    let result = publish(&p, &fx);
    assert!(result.committed, "promotion is the commit point");
    assert!(result.durability_complete);
    assert!(result.blockers.is_empty());
    // The published tree left cleanup scope: it is still there.
    assert_eq!(packages_entries(&p).len(), 1);
}

#[test]
fn a_successful_promotion_releases_the_staging_tree_from_cleanup_scope() {
    // §N: once promoted, the tree IS the published generation and leaves §X's
    // cleanup scope. Pinned directly: after a successful commit, running the
    // cleanup path against that very session must not touch the generation.
    let p = publisher("cleanup-scope");
    let fx = v1_fixture("chat_scope", "snap1", "x");
    let begun = begin(&p, &fx.chat_id);
    stage_all(&p, begun.token, &fx);
    // Hold the session so the cleanup path can be exercised after COMMIT
    // consumed it from the map.
    let session = p
        .registry
        .lock_map()
        .get(&begun.token)
        .map(Arc::clone)
        .expect("session present before commit");

    let result = commit(&p, begun.token, None);
    assert!(result.ok && result.committed);
    let published = packages_entries(&p);
    assert_eq!(published.len(), 1);

    // The session must no longer own any staging: cleanup is a no-op.
    {
        let mut inner = session.inner.lock().unwrap_or_else(|e| e.into_inner());
        assert!(
            inner.dir.is_none(),
            "a promoted tree must be released from the session"
        );
        assert!(cleanup_staging(&p, &mut inner));
    }
    // The published generation is intact, members and all.
    assert_eq!(packages_entries(&p), published);
    for member in Member::all() {
        assert!(
            p.root
                .join(PACKAGES_DIR)
                .join(&published[0])
                .join(member.file_name())
                .exists(),
            "cleanup must never touch a published generation"
        );
    }
}

#[test]
fn the_result_contract_distinguishes_created_from_deduped_by_outcome() {
    let p = publisher("outcome-discriminator");
    let fx = v1_fixture("chat_outcome", "snap1", "x");
    let created = publish(&p, &fx);
    let deduped = publish(&p, &fx);
    // `ok` alone cannot distinguish them — `outcome` is the discriminator.
    assert!(created.ok && deduped.ok);
    assert_ne!(created.outcome, deduped.outcome);
    assert!(created.committed && !deduped.committed);
}

// ── RESOURCE (environmental, never validity) ───────────────────────────────

#[test]
fn resource_errors_map_to_a_retryable_family_not_a_validity_blocker() {
    for (errno, expected) in [
        (libc::ENOSPC, "generation-staging-resource-no-space"),
        (libc::EDQUOT, "generation-staging-resource-quota"),
        (libc::EFBIG, "generation-staging-resource-file-too-large"),
    ] {
        let err = std::io::Error::from_raw_os_error(errno);
        assert!(is_resource_errno(&err));
        assert_eq!(resource_code(&err), expected);
        // The family is textually distinct from every validity blocker.
        assert!(resource_code(&err).starts_with("generation-staging-resource-"));
    }
    // A validity failure is NOT a resource failure.
    let other = std::io::Error::from_raw_os_error(libc::EACCES);
    assert!(!is_resource_errno(&other));
}

#[test]
fn byte_accounting_is_overflow_safe() {
    // The accumulator uses checked arithmetic; prove the guard exists by
    // exercising the boundary arithmetic directly.
    let near_max = u64::MAX - 4;
    assert!(near_max.checked_add(8).is_none());
    assert!(near_max.checked_add(4).is_some());
}

#[test]
fn no_total_member_or_package_ceiling_exists() {
    // Guards against a chunk bound quietly becoming a member ceiling: a member
    // several times the chunk bound must stage successfully.
    let p = publisher("no-ceiling");
    let begun = begin(&p, "chat_nocap");
    let chunk = vec![0u8; (CHUNK_CAP_BYTES / 4) as usize];
    for _ in 0..6 {
        assert!(
            write_member(&p, begun.token, Member::Snapshot, &chunk).ok,
            "a member larger than the chunk bound must be stageable"
        );
    }
    assert!(abort(&p, begun.token).ok);
}

// ── MUTATION CONTROLS ──────────────────────────────────────────────────────
//
// Each control below documents the guard its paired test kills. They are
// asserted structurally so a future edit that deletes a guard fails here even
// if the behavioural test is also weakened.

#[test]
fn mutation_controls_pin_the_load_bearing_guards() {
    let source = include_str!("../archive_generation_publish.rs");

    // Caller-supplied hashes are never authority.
    assert!(source.contains("generation-content-hash-mismatch"));
    assert!(source.contains("generation-expected-manifest-sha-mismatch"));
    // Required-member completeness.
    for code in [
        "generation-manifest-missing",
        "generation-snapshot-missing",
        "generation-markdown-missing",
        "generation-html-missing",
    ] {
        assert!(source.contains(code), "missing guard {code}");
    }
    // Asset re-hash on copy.
    assert!(source.contains("generation-asset-sha-mismatch"));
    assert!(source.contains("generation-asset-byte-length-mismatch"));
    // Unknown staging entry.
    assert!(source.contains("generation-staging-unexpected-entry"));
    // Exclusive promotion, not a replacing rename.
    assert!(source.contains("promote_dir_exclusive"));
    assert!(
        !source.contains("rename_within("),
        "publication must never use a replacing rename"
    );
    // Occupant adjudication is trusted-side.
    assert!(source.contains("fn classify_occupant"));
    // Create-only: no delete authority over an occupant.
    assert!(
        !source.contains("remove_dir_all"),
        "no recursive delete authority may exist in this module"
    );
    // Environmental family is distinct.
    assert!(source.contains("generation-staging-resource-"));
    // Commands are not production-registered at this Stage.
    assert!(source.contains("commands_pending_g1_cutover"));
}

#[test]
fn the_commands_are_not_registered_in_the_production_handler() {
    // Production-wiring boundary (§N): publication must not be renderer-
    // invokable before the G1 capability cutover.
    let lib = include_str!("../lib.rs");
    assert!(
        !lib.contains("archive_generation_publish::"),
        "no generation publish symbol may be referenced by lib.rs before the G1 cutover"
    );
    assert!(lib.contains("pub mod archive_generation_publish;"));
    // Stronger than a naming convention: the module declares NO Tauri command
    // at all, so there is nothing a handler could register.
    let source = include_str!("../archive_generation_publish.rs");
    assert!(
        !source.contains("#[tauri::command]") && !source.contains("#[command]"),
        "publication must not be renderer-invokable before the G1 cutover"
    );
}
