//! T1.1 proofs for the instance-presence lock and the in-process mutation gate.
//!
//! The presence proofs deliberately spawn REAL child processes. `flock` scopes
//! a lock to an open file description, so a same-thread test can only ever
//! demonstrate this process contending with itself — which is not the property
//! AC-M06-03 requires. Only a second process proves that exclusive acquisition
//! is positive evidence about *other instances*.
//!
//! Every root here is a disposable temp directory. No production archive, no
//! production database, no network.

use super::*;

fn temp_root(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "h2o-m06-t11-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(&dir).expect("temp root");
    dir
}

/// Runs this test binary as a helper child. The child holds SHARED presence on
/// `root` until its stdin closes, so the parent controls its lifetime exactly.
fn spawn_shared_holder(root: &std::path::Path) -> std::process::Child {
    spawn_helper(root, "helper_hold_shared_presence")
}

/// Spawns a child that takes EXCLUSIVE presence and holds it. Used to create a
/// deterministic case where this process CANNOT establish shared presence.
fn spawn_exclusive_holder(root: &std::path::Path) -> std::process::Child {
    spawn_helper(root, "helper_hold_exclusive_presence")
}

fn spawn_helper(root: &std::path::Path, name: &str) -> std::process::Child {
    let exe = std::env::current_exe().expect("test binary path");
    std::process::Command::new(exe)
        .arg(format!("archive_instance_lock::tests::{name}"))
        .arg("--exact")
        .arg("--include-ignored")
        .arg("--test-threads=1")
        .env("H2O_T11_HELPER_ROOT", root)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn shared-presence helper")
}

/// Waits until another PROCESS actually holds presence on `root`.
///
/// Polls through the caller's own descriptor deliberately. An earlier version
/// opened a second descriptor of its own to probe with — but `flock` contends
/// between two descriptions in the SAME process, so that probe reported
/// "externally held" against itself and returned before the child had even
/// started. The caller's descriptor is the only one this process holds, so a
/// refusal here can only come from another process.
fn wait_until_externally_held(state: &ArchiveInstanceState, root: &std::path::Path) -> bool {
    let marker = root.join(HELPER_READY);
    for _ in 0..400 {
        // BOTH conditions are required. The marker proves a second process
        // really reached the lock; the refusal proves it still holds it. An
        // earlier version checked only the refusal, which a mis-spawned child
        // could satisfy vacuously.
        if marker.exists() {
            match state.try_acquire_exclusive() {
                Err(_) => return true,
                Ok(owned) => {
                    let _ = owned.release();
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    false
}

/// Asserts the child process genuinely participated. Without this a spawn
/// failure would leave the presence proofs passing on an empty stage.
fn assert_helper_actually_ran(root: &std::path::Path) {
    assert!(
        root.join(HELPER_READY).exists(),
        "the helper process never acquired presence — the two-process proof \
         would otherwise pass without a second instance"
    );
}

/// Marker the helper writes ONLY after it actually holds shared presence.
const HELPER_READY: &str = ".t11-helper-ready";

/// HELPER, not a proof. Holds shared presence until stdin reaches EOF.
#[test]
#[ignore]
fn helper_hold_shared_presence() {
    let root = match std::env::var("H2O_T11_HELPER_ROOT") {
        Ok(value) => std::path::PathBuf::from(value),
        Err(_) => return,
    };
    let state = ArchiveInstanceState::default();
    state.ensure_presence(&root).expect("helper shared presence");
    // Announce only AFTER the lock is held, so the parent's wait cannot pass
    // before a real second process is actually participating.
    std::fs::write(root.join(HELPER_READY), b"1").expect("helper marker");
    // Block until the parent closes our stdin, then exit (dropping the fd).
    let mut sink = String::new();
    let _ = std::io::Read::read_to_string(&mut std::io::stdin(), &mut sink);
}

/// HELPER, not a proof. Takes EXCLUSIVE presence and holds it until stdin EOF.
#[test]
#[ignore]
fn helper_hold_exclusive_presence() {
    let root = match std::env::var("H2O_T11_HELPER_ROOT") {
        Ok(value) => std::path::PathBuf::from(value),
        Err(_) => return,
    };
    let state = ArchiveInstanceState::default();
    state.ensure_presence(&root).expect("helper shared presence");
    let owned = state
        .try_acquire_exclusive()
        .expect("helper exclusive presence");
    std::fs::write(root.join(HELPER_READY), b"1").expect("helper marker");
    let mut sink = String::new();
    let _ = std::io::Read::read_to_string(&mut std::io::stdin(), &mut sink);
    let _ = owned.release();
}

/// HELPER, not a proof. Establishes STARTUP participation only — it never runs
/// any archive mutation command. Proof (A) depends on that distinction.
#[test]
#[ignore]
fn helper_startup_participation_only() {
    let root = match std::env::var("H2O_T11_HELPER_ROOT") {
        Ok(value) => std::path::PathBuf::from(value),
        Err(_) => return,
    };
    let state = ArchiveInstanceState::default();
    // Exactly what the Tauri setup hook does — and nothing else.
    state.ensure_presence(&root).expect("startup participation");
    assert_eq!(state.presence_state(), PresenceState::Shared);
    std::fs::write(root.join(HELPER_READY), b"1").expect("helper marker");
    let mut sink = String::new();
    let _ = std::io::Read::read_to_string(&mut std::io::stdin(), &mut sink);
}

// ── A/B/C/D/E: cross-process presence semantics ─────────────────────────────

/// (A) Participation is instance-lifetime, not mutation-lazy: a child that
/// performs NO archive mutation still blocks another instance's exclusive
/// acquisition. Under the old lazy design this child would hold nothing.
#[test]
fn startup_participation_blocks_exclusive_without_any_mutation() {
    let root = temp_root("startup");
    let state = ArchiveInstanceState::default();
    state.ensure_presence(&root).expect("shared presence");

    let mut child = spawn_helper(&root, "helper_startup_participation_only");
    assert!(wait_until_externally_held(&state, &root), "child never participated");
    assert_helper_actually_ran(&root);

    let refused = state.try_acquire_exclusive().err();
    assert_eq!(
        refused.as_deref(),
        Some(codes::INSTANCE_LOCK_BUSY),
        "a startup-only participant must still block exclusive acquisition"
    );
    // And we recovered shared participation, so we may still mutate.
    assert_eq!(state.presence_state(), PresenceState::Shared);
    state.enter_mutation().expect("mutation available after refusal");

    drop(child.stdin.take());
    let _ = child.wait();
    let _ = std::fs::remove_dir_all(&root);
}

/// (B) A failed upgrade must RESTORE shared presence, not merely assume it
/// survived. Proven from the outside: after A's refusal and B's exit, a third
/// process must STILL be refused, which can only happen if A is genuinely
/// holding shared again.
#[test]
fn a_failed_upgrade_positively_restores_shared_participation() {
    let root = temp_root("restore");
    let a = ArchiveInstanceState::default();
    a.ensure_presence(&root).expect("A shared presence");

    let mut b = spawn_shared_holder(&root);
    assert!(wait_until_externally_held(&a, &root), "B never participated");
    assert_helper_actually_ran(&root);

    // A attempts exclusive and is refused (B participates).
    assert_eq!(
        a.try_acquire_exclusive().err().as_deref(),
        Some(codes::INSTANCE_LOCK_BUSY)
    );
    // A must report Shared again — restored, not assumed.
    assert_eq!(a.presence_state(), PresenceState::Shared);

    // B leaves.
    drop(b.stdin.take());
    let _ = b.wait();
    let _ = std::fs::remove_file(root.join(HELPER_READY));

    // A third process must STILL be refused, because A restored shared.
    let mut c = spawn_exclusive_holder(&root);
    std::thread::sleep(std::time::Duration::from_millis(600));
    assert!(
        !root.join(HELPER_READY).exists(),
        "C acquired exclusive, so A did not actually restore shared participation"
    );
    drop(c.stdin.take());
    let _ = c.wait();

    let _ = std::fs::remove_dir_all(&root);
}

/// (B, decisive) The restoration path is proven against the DOCUMENTED flock
/// contract, not against one platform's current behaviour.
///
/// `flock(2)` says a type change releases the previous lock before applying the
/// new one. On this macOS a *failed* non-blocking upgrade happens to leave the
/// shared lock in place, so an ordinary failed-upgrade test cannot distinguish
/// "restored" from "never lost" — it passes even with the restoration removed.
/// This test therefore reproduces the documented mid-transition release
/// explicitly and proves the recovery path re-establishes real OS presence,
/// verified from ANOTHER process.
#[test]
fn the_restoration_path_re_establishes_real_os_presence() {
    let root = temp_root("restorepath");
    let state = ArchiveInstanceState::default();
    state.ensure_presence(&root).expect("shared presence");

    // Simulate the documented release-then-fail, then run production recovery.
    state
        .simulate_failed_transition_for_test()
        .expect("recovery must re-establish shared presence");
    assert_eq!(state.presence_state(), PresenceState::Shared);

    // Verified externally: another instance must NOT be able to take exclusive.
    let mut other = spawn_exclusive_holder(&root);
    std::thread::sleep(std::time::Duration::from_millis(600));
    assert!(
        !root.join(HELPER_READY).exists(),
        "another instance acquired exclusive, so recovery did not re-establish \
         real OS presence"
    );
    drop(other.stdin.take());
    let _ = other.wait();

    let _ = std::fs::remove_dir_all(&root);
}

/// The negative half of the proof above: without restoration, an instance that
/// lost its lock mid-transition genuinely stops blocking other instances. This
/// is what makes the previous test meaningful rather than vacuous.
#[test]
fn without_restoration_a_lost_lock_no_longer_blocks_other_instances() {
    let root = temp_root("norestore");
    let state = ArchiveInstanceState::default();
    state.ensure_presence(&root).expect("shared presence");

    // Lose the lock exactly as flock documents, and do NOT recover.
    state
        .force_unlock_without_restore_for_test()
        .expect("forced unlock");

    let mut other = spawn_exclusive_holder(&root);
    let mut acquired = false;
    for _ in 0..400 {
        if root.join(HELPER_READY).exists() {
            acquired = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    assert!(
        acquired,
        "an unrestored instance must NOT keep blocking exclusive acquisition — \
         otherwise the restoration proof above would be vacuous"
    );
    drop(other.stdin.take());
    let _ = other.wait();

    let _ = std::fs::remove_dir_all(&root);
}

/// (C) When shared cannot be established, the instance must NOT claim normal
/// participation and MUST refuse mutation — then recover once unblocked.
#[test]
fn unrestorable_shared_presence_fails_closed_then_recovers() {
    let root = temp_root("failclosed");

    // An external owner holds EXCLUSIVE first, deterministically.
    let mut owner = spawn_exclusive_holder(&root);
    for _ in 0..400 {
        if root.join(HELPER_READY).exists() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    assert_helper_actually_ran(&root);

    let state = ArchiveInstanceState::default();
    // Startup participation cannot succeed while another instance owns EX.
    let err = state.ensure_presence(&root).err();
    assert_eq!(err.as_deref(), Some(codes::INSTANCE_LOCK_BUSY));
    assert_ne!(
        state.presence_state(),
        PresenceState::Shared,
        "must not claim shared participation it could not establish"
    );
    // Trusted mutation is refused, retryably — never as validity.
    let refused = state.enter_mutation().err();
    assert_eq!(refused.as_deref(), Some(codes::INSTANCE_LOCK_UNAVAILABLE));
    assert!(is_retryable_environmental(refused.as_deref().unwrap()));

    // The blocker leaves; participation becomes establishable and mutation reopens.
    drop(owner.stdin.take());
    let _ = owner.wait();
    let mut ok = false;
    for _ in 0..400 {
        if state.ensure_presence(&root).is_ok() {
            ok = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    assert!(ok, "shared participation must become establishable again");
    assert_eq!(state.presence_state(), PresenceState::Shared);
    state.enter_mutation().expect("mutation reopens after recovery");

    let _ = std::fs::remove_dir_all(&root);
}

/// A–H: transient startup contention is recoverable WITHOUT an app restart.
///
/// Drives the real production authority (`enter_mutation_recovering`, the exact
/// function `enter_mutation_for` wraps), in ONE process, with no second setup
/// call. Before this recovery existed, an instance that lost the startup race
/// stayed unusable until restart — which contradicted calling the refusal
/// "retryable".
#[test]
fn startup_contention_recovers_on_a_later_mutation_without_restart() {
    let root = temp_root("recover");

    // (A) An external instance owns exclusive presence first.
    let mut owner = spawn_exclusive_holder(&root);
    for _ in 0..400 {
        if root.join(HELPER_READY).exists() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    assert_helper_actually_ran(&root);

    // (B) This instance performs STARTUP participation and is refused.
    let state = ArchiveInstanceState::default();
    state.record_startup_attempt(&root);
    let startup = state.ensure_presence(&root);
    assert_eq!(startup.err().as_deref(), Some(codes::INSTANCE_LOCK_BUSY));
    assert_ne!(state.presence_state(), PresenceState::Shared);

    // (C) Mutation entry is refused while the owner still holds exclusive —
    //     through the production authority, recovery attempt included.
    let refused = enter_mutation_recovering(&state, Some(&root)).err();
    assert_eq!(refused.as_deref(), Some(codes::INSTANCE_LOCK_UNAVAILABLE));
    assert!(is_retryable_environmental(refused.as_deref().unwrap()));
    assert_ne!(
        state.presence_state(),
        PresenceState::Shared,
        "must not claim participation while contention persists"
    );

    // (D) The owner releases.
    drop(owner.stdin.take());
    let _ = owner.wait();
    let _ = std::fs::remove_file(root.join(HELPER_READY));

    // (E)(F)(G) SAME instance, no restart, no second setup call: the production
    //           mutation-entry authority re-establishes shared presence and the
    //           command is admitted.
    let mut admitted = false;
    for _ in 0..400 {
        if let Ok(entry) = enter_mutation_recovering(&state, Some(&root)) {
            admitted = true;
            drop(entry);
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    assert!(admitted, "mutation must become available again without a restart");
    assert_eq!(
        state.presence_state(),
        PresenceState::Shared,
        "shared presence must be positively established before mutation proceeds"
    );

    // (H) A third process must NOT be able to take exclusive now.
    let mut third = spawn_exclusive_holder(&root);
    std::thread::sleep(std::time::Duration::from_millis(600));
    assert!(
        !root.join(HELPER_READY).exists(),
        "recovered instance must hold REAL shared OS presence"
    );
    drop(third.stdin.take());
    let _ = third.wait();

    let _ = std::fs::remove_dir_all(&root);
}

/// Recovery may RE-establish presence a startup attempt already claimed; it may
/// never ORIGINATE presence for an instance that never enrolled at startup.
/// Without this distinction the recovery path degrades into lazy enrolment, and
/// a mutation command becomes its own admission authority.
#[test]
fn a_mutation_recovers_presence_but_never_originates_it() {
    let root = temp_root("originate");

    // Another instance owns exclusive, so this instance's enrolment fails and
    // the root is pinned WITHOUT any startup attempt being recorded.
    let mut owner = spawn_exclusive_holder(&root);
    for _ in 0..400 {
        if root.join(HELPER_READY).exists() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    assert_helper_actually_ran(&root);

    let state = ArchiveInstanceState::default();
    assert_eq!(
        state.ensure_presence(&root).err().as_deref(),
        Some(codes::INSTANCE_LOCK_BUSY)
    );
    assert_eq!(state.pinned_root().as_deref(), Some(root.as_path()));
    assert!(
        !state.startup_was_attempted(),
        "precondition: no startup participation was ever recorded"
    );

    // The contended archive is now completely free.
    drop(owner.stdin.take());
    let _ = owner.wait();
    let _ = std::fs::remove_file(root.join(HELPER_READY));

    // Even though presence is now available for the taking, a mutation must NOT
    // enrol on its own behalf: it refuses, and claims no participation.
    for _ in 0..8 {
        assert_eq!(
            enter_mutation_recovering(&state, Some(&root)).err().as_deref(),
            Some(codes::INSTANCE_LOCK_UNAVAILABLE),
            "a mutation must not originate presence startup never claimed"
        );
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    assert_ne!(state.presence_state(), PresenceState::Shared);

    // Proof the archive really was free the whole time: another instance can
    // still take exclusive, so the refusal above was the gate, not contention.
    let mut third = spawn_exclusive_holder(&root);
    let mut took = false;
    for _ in 0..400 {
        if root.join(HELPER_READY).exists() {
            took = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    drop(third.stdin.take());
    let _ = third.wait();
    assert!(took, "archive was free; refusal came from the enrolment gate");

    let _ = std::fs::remove_dir_all(&root);
}

/// Recovery is scoped to the root pinned at startup: a mutation naming a
/// different archive root fails closed instead of rebinding presence.
#[test]
fn recovery_cannot_silently_rebind_to_a_different_archive_root() {
    let root = temp_root("pinned");
    let other = temp_root("other");
    let state = ArchiveInstanceState::default();
    state.record_startup_attempt(&root);
    state.ensure_presence(&root).expect("shared presence");
    assert_eq!(state.pinned_root().as_deref(), Some(root.as_path()));
    // Even while presence is healthy, a different root must not be accepted:
    // the presence we hold protects the pinned archive, not this one.
    assert_eq!(state.presence_state(), PresenceState::Shared);

    let refused = enter_mutation_recovering(&state, Some(&other)).err();
    assert_eq!(
        refused.as_deref(),
        Some(codes::INSTANCE_LOCK_ROOT_MISMATCH),
        "a different root must fail closed, never rebind"
    );
    // And the pin is unchanged.
    assert_eq!(state.pinned_root().as_deref(), Some(root.as_path()));

    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&other);
}

/// (D) Releasing exclusive ownership re-establishes shared BEFORE ordinary
/// mutation entry reopens.
#[test]
fn exclusive_release_restores_shared_before_mutation_reopens() {
    let root = temp_root("release");
    let state = ArchiveInstanceState::default();
    state.ensure_presence(&root).expect("shared presence");

    let owned = state.try_acquire_exclusive().expect("lone exclusive");
    assert_eq!(state.presence_state(), PresenceState::Exclusive);
    // While reclamation owns the archive, ordinary mutation is refused.
    assert_eq!(
        state.enter_mutation().err().as_deref(),
        Some(codes::MUTATION_GATE_BUSY)
    );

    owned.release().expect("release restores shared");
    assert_eq!(state.presence_state(), PresenceState::Shared);
    state.enter_mutation().expect("mutation reopens only after shared is proven");

    let _ = std::fs::remove_dir_all(&root);
}



#[test]
fn a_killed_instance_releases_presence_for_a_later_exclusive_acquisition() {
    let root = temp_root("crash");
    let state = ArchiveInstanceState::default();
    state.ensure_presence(&root).expect("shared presence");

    let mut child = spawn_shared_holder(&root);
    assert!(wait_until_externally_held(&state, &root), "helper never took presence");
    assert_helper_actually_ran(&root);

    // (E) Hard kill — no graceful release, no journal, no stale-lock cleanup.
    let _ = child.kill();
    let _ = child.wait();

    let mut acquired = false;
    for _ in 0..200 {
        if let Ok(owned) = state.try_acquire_exclusive() {
            acquired = true;
            let _ = owned.release();
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    assert!(
        acquired,
        "the kernel must release a killed instance's presence"
    );

    let _ = std::fs::remove_dir_all(&root);
}


#[test]
fn presence_is_idempotent_and_does_not_reopen() {
    let root = temp_root("idem");
    let state = ArchiveInstanceState::default();
    state.ensure_presence(&root).expect("first");
    state.ensure_presence(&root).expect("second is a no-op");
    assert!(state.has_presence());
    let _ = std::fs::remove_dir_all(&root);
}

// ── D + in-process gate ─────────────────────────────────────────────────────

#[test]
fn the_mutation_gate_admits_concurrent_normal_work_and_excludes_it_under_reclamation() {
    let root = temp_root("gate");
    let state = ArchiveInstanceState::default();
    state.ensure_presence(&root).expect("shared presence");

    // Normal trusted mutations share the gate.
    let a = state.enter_mutation().expect("first mutation entry");
    let b = state.enter_mutation().expect("concurrent mutation entry");
    // Reclamation cannot start while mutations are in flight.
    assert_eq!(
        state.try_acquire_exclusive().err().as_deref(),
        Some(codes::MUTATION_GATE_BUSY)
    );
    drop(a);
    drop(b);

    // (D) With the exclusive side held, NEW mutation entry is refused — and
    //     refused retryably, never as invalidity.
    let excl = state.try_acquire_exclusive().expect("exclusive after drain");
    let refused = state.enter_mutation().err();
    assert_eq!(refused.as_deref(), Some(codes::MUTATION_GATE_BUSY));
    assert!(is_retryable_environmental(refused.as_deref().unwrap()));
    drop(excl);

    // Release restores normal operation.
    state.enter_mutation().expect("gate reusable after release");
}

#[test]
fn a_failing_mutation_leaks_no_guard() {
    let root = temp_root("leak");
    let state = ArchiveInstanceState::default();
    state.ensure_presence(&root).expect("shared presence");
    // Simulate a command that enters the gate and then fails.
    let result: Result<(), String> = (|| {
        let _entry = state.enter_mutation()?;
        Err("simulated-command-failure".to_string())
    })();
    assert!(result.is_err());
    // If the guard had leaked, exclusive acquisition would be impossible.
    let owned = state
        .try_acquire_exclusive()
        .expect("no guard may survive a failed mutation");
    let _ = owned.release();
}

#[test]
fn every_refusal_is_environmental_and_retryable_never_validity() {
    for code in [
        codes::INSTANCE_LOCK_BUSY,
        codes::INSTANCE_LOCK_UNAVAILABLE,
        codes::INSTANCE_LOCK_UNSUPPORTED,
        codes::MUTATION_GATE_BUSY,
        codes::MUTATION_GATE_UNAVAILABLE,
    ] {
        assert!(is_retryable_environmental(code), "{code} must be retryable");
        // None of them may read as package invalidity or corruption.
        for forbidden in ["mismatch", "corrupt", "invalid", "blocker"] {
            assert!(
                !code.contains(forbidden),
                "{code} must not read as a validity verdict ({forbidden})"
            );
        }
    }
}

// ── Non-destructive / no-authority pins ─────────────────────────────────────

#[test]
fn this_module_adds_no_destructive_capability() {
    let src = include_str!("../archive_instance_lock.rs");
    // Strip doc comments so prose describing what we do NOT do cannot trip this.
    let code: String = src
        .lines()
        .filter(|line| {
            let t = line.trim_start();
            !(t.starts_with("//!") || t.starts_with("///") || t.starts_with("//"))
        })
        .collect::<Vec<_>>()
        .join("\n");
    for banned in [
        "remove_file",
        "remove_dir",
        "unlinkat",
        "renameat",
        "rename(",
        "set_len",
        "truncate(true)",
    ] {
        assert!(
            !code.contains(banned),
            "T1.1 must add no destructive capability, found: {banned}"
        );
    }
    // And it registers no Tauri command.
    assert!(
        !code.contains("#[tauri::command]"),
        "T1.1 must register no command; G02 is not activated"
    );
}

#[test]
fn the_lock_artifact_cannot_be_mistaken_for_a_package_or_cas_object() {
    // Dot-leading, so discovery (which requires a literal leading dot) skips it.
    assert!(ARCHIVE_LOCK_NAME.starts_with('.'));
    // Not a generation.
    assert!(!ARCHIVE_LOCK_NAME.ends_with(".h2ochat"));
    // Not a CAS blob name.
    assert!(!ARCHIVE_LOCK_NAME.starts_with("sha256-"));
}
