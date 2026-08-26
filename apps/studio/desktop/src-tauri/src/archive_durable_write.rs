// Bounded durable write for the app-owned saved-chat archive.
//
// `plugin:fs|write_file` opens, writes and drops the handle with no fsync, and
// `plugin:fs|rename` is a bare `std::fs::rename` with no parent-directory sync.
// The archive package writer therefore has no durability fence: its
// "manifest.json written last means the package is complete" invariant holds
// only in program order, so a power loss can persist the manifest while losing
// the snapshot member written before it.
//
// This module closes that gap with the narrowest primitive that does the job:
// a destination and bytes go in, a durably promoted file comes out. It is NOT
// a rename API — no source path is ever accepted from the renderer, so no
// caller can move or replace an arbitrary file. It exposes no delete
// authority: the only unlink that can ever happen is of this module's own
// private temporary artifact on a failed write.
//
// Because a custom command bypasses the `plugin:fs` scope entirely, the
// containment check in `resolve_destination` IS the security boundary for this
// path — it replaces what `capabilities/archive-cas.json` enforces for the
// plugin. Every destination is admitted only under $APPLOCALDATA/archive.
//
// Ordering follows the established durable-write discipline (temp in the
// destination directory -> write -> sync contents -> close -> atomic rename ->
// sync parent directory). See docs/systems/archive/saved-chat-package-v3.md
// for the package-level invariant this protects.

use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub const DURABLE_WRITE_SCHEMA: &str = "h2o.studio.archive.durable-write.v1";

/// Every admitted destination lives under `$APPLOCALDATA/<ARCHIVE_ROOT>`.
pub const ARCHIVE_ROOT: &str = "archive";

/// Distinguishes this module's private staging artifacts from any real
/// archive member. A CAS blob is `sha256-<hex>` and a package member is a
/// plain name, so neither can collide with this prefix.
const TEMP_PREFIX: &str = ".h2o-durable-";
const TEMP_SUFFIX: &str = ".tmp";

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// What to do when the canonical destination already exists.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ExistingPolicy {
    /// Refuse the write and report `durable-write-destination-exists`.
    #[default]
    Fail,
    /// Let the atomic rename supersede the existing entry. This is not a
    /// delete: the old inode is unlinked by `rename(2)` itself, never by an
    /// unlink this module issues, and the destination is never left absent.
    Replace,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableWriteOptions {
    /// Destination relative to the archive root. Must be relative, must not
    /// escape the root, and must contain only normal path components.
    pub path: String,
    #[serde(default)]
    pub existing: ExistingPolicy,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableWriteBlocker {
    pub code: String,
}

impl DurableWriteBlocker {
    fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableWriteResult {
    pub schema: &'static str,
    pub ok: bool,
    pub wrote: bool,
    pub replaced: bool,
    pub byte_length: u64,
    /// True only when the file contents were flushed with macOS `F_FULLFSYNC`.
    /// False means the weaker `fsync(2)` guarantee — see `sync_file_contents`.
    pub full_fsync: bool,
    /// True when the parent directory entry was itself synced.
    pub parent_synced: bool,
    pub blockers: Vec<DurableWriteBlocker>,
}

impl DurableWriteResult {
    fn skeleton() -> Self {
        Self {
            schema: DURABLE_WRITE_SCHEMA,
            ok: false,
            wrote: false,
            replaced: false,
            byte_length: 0,
            full_fsync: false,
            parent_synced: false,
            blockers: vec![],
        }
    }

    pub fn blocked(code: &str) -> Self {
        let mut result = Self::skeleton();
        result.blockers.push(DurableWriteBlocker::new(code));
        result
    }
}

/// Validates a caller-supplied relative destination and resolves it under
/// `root`. Rejects anything that is not a plain relative path built from
/// normal components, so `..`, absolute paths, drive prefixes and embedded
/// NULs can never reach the filesystem.
fn resolve_destination(root: &Path, relative: &str) -> Result<PathBuf, &'static str> {
    if relative.is_empty() {
        return Err("durable-write-path-empty");
    }
    if relative.contains('\0') {
        return Err("durable-write-path-invalid");
    }

    let candidate = Path::new(relative);
    if candidate.is_absolute() {
        return Err("durable-write-path-not-relative");
    }

    let mut resolved = root.to_path_buf();
    let mut components = 0usize;
    for component in candidate.components() {
        match component {
            Component::Normal(part) => {
                // A normal component can still be a lone dot-name; those are
                // legal filenames, but reject our own staging prefix so a
                // caller can never target another writer's temp artifact.
                let text = part.to_str().ok_or("durable-write-path-invalid")?;
                if text.starts_with(TEMP_PREFIX) {
                    return Err("durable-write-path-reserved");
                }
                resolved.push(part);
                components += 1;
            }
            Component::ParentDir => return Err("durable-write-path-traversal"),
            Component::CurDir => return Err("durable-write-path-invalid"),
            Component::RootDir | Component::Prefix(_) => {
                return Err("durable-write-path-not-relative")
            }
        }
    }

    if components == 0 {
        return Err("durable-write-path-empty");
    }
    // Defense in depth: with only normal components this cannot fail, but the
    // containment invariant is the whole security boundary here, so assert it.
    if !resolved.starts_with(root) {
        return Err("durable-write-path-outside-root");
    }

    Ok(resolved)
}

/// Rejects a symlinked ancestor anywhere between the archive root (exclusive)
/// and the destination's parent (inclusive). The root itself is not checked —
/// the app data directory may legitimately sit beneath a symlinked path.
fn assert_no_symlinked_ancestor(root: &Path, destination: &Path) -> Result<(), &'static str> {
    let parent = match destination.parent() {
        Some(parent) => parent,
        None => return Err("durable-write-path-invalid"),
    };

    let mut chain: Vec<&Path> = vec![];
    let mut cursor = Some(parent);
    while let Some(current) = cursor {
        if current == root {
            break;
        }
        chain.push(current);
        cursor = current.parent();
    }

    for ancestor in chain.into_iter().rev() {
        match fs::symlink_metadata(ancestor) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() {
                    return Err("durable-write-parent-symlink");
                }
                if !metadata.is_dir() {
                    return Err("durable-write-parent-not-directory");
                }
            }
            // Absent ancestors are created below; nothing to reject yet.
            Err(_) => break,
        }
    }

    Ok(())
}

/// Flushes file contents. On macOS plain `fsync(2)` only pushes writes to the
/// device without forcing a drive-cache flush, so `F_FULLFSYNC` is used first
/// and `sync_all` is the documented fallback for filesystems that reject it.
/// Returns whether the strong `F_FULLFSYNC` guarantee was established.
#[cfg(target_os = "macos")]
fn sync_file_contents(file: &File) -> std::io::Result<bool> {
    use std::os::unix::io::AsRawFd;

    let rc = unsafe { libc::fcntl(file.as_raw_fd(), libc::F_FULLFSYNC) };
    if rc == 0 {
        return Ok(true);
    }
    file.sync_all()?;
    Ok(false)
}

#[cfg(not(target_os = "macos"))]
fn sync_file_contents(file: &File) -> std::io::Result<bool> {
    file.sync_all()?;
    Ok(false)
}

/// Syncs the directory entry so the rename itself is durable. Directory fsync
/// is meaningful on unix; on other platforms the rename's durability is left
/// to the filesystem and the result reports `parentSynced: false`.
#[cfg(unix)]
fn sync_parent_dir(dir: &Path) -> std::io::Result<bool> {
    File::open(dir)?.sync_all()?;
    Ok(true)
}

#[cfg(not(unix))]
fn sync_parent_dir(_dir: &Path) -> std::io::Result<bool> {
    Ok(false)
}

fn temp_path_for(parent: &Path) -> PathBuf {
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    parent.join(format!(
        "{TEMP_PREFIX}{}-{counter}{TEMP_SUFFIX}",
        std::process::id()
    ))
}

/// Durably writes `bytes` to `relative` beneath `root`.
///
/// Domain refusals (traversal, symlink, destination-exists) come back as
/// `Ok(result)` with `ok: false` and a blocker code; only infrastructure
/// faults return `Err`. On any failure the canonical destination is left
/// exactly as it was and only this module's own temp artifact is removed.
pub fn durable_write_within_root(
    root: &Path,
    relative: &str,
    bytes: &[u8],
    existing: ExistingPolicy,
) -> Result<DurableWriteResult, String> {
    let destination = match resolve_destination(root, relative) {
        Ok(path) => path,
        Err(code) => return Ok(DurableWriteResult::blocked(code)),
    };

    if let Err(code) = assert_no_symlinked_ancestor(root, &destination) {
        return Ok(DurableWriteResult::blocked(code));
    }

    let mut replaced = false;
    match fs::symlink_metadata(&destination) {
        Ok(metadata) => {
            // A symlink or a non-regular entry at the destination is refused
            // under every policy: replacing it would write through the link.
            if metadata.file_type().is_symlink() {
                return Ok(DurableWriteResult::blocked(
                    "durable-write-destination-symlink",
                ));
            }
            if !metadata.is_file() {
                return Ok(DurableWriteResult::blocked(
                    "durable-write-destination-not-regular-file",
                ));
            }
            if existing == ExistingPolicy::Fail {
                return Ok(DurableWriteResult::blocked(
                    "durable-write-destination-exists",
                ));
            }
            replaced = true;
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(format!("durable-write-destination-stat-failed:{err}")),
    }

    let parent = destination
        .parent()
        .ok_or_else(|| "durable-write-destination-parent-missing".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|err| format!("durable-write-parent-create-failed:{err}"))?;

    // Stage inside the destination directory so the promotion is a same
    // filesystem rename and can never degrade into a copy.
    let temp_path = temp_path_for(parent);
    let mut handle = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .map_err(|err| format!("durable-write-temp-create-failed:{err}"))?;

    let full_fsync = match handle
        .write_all(bytes)
        .and_then(|_| sync_file_contents(&handle))
    {
        Ok(full_fsync) => full_fsync,
        Err(err) => {
            drop(handle);
            let _ = fs::remove_file(&temp_path);
            return Err(format!("durable-write-temp-write-failed:{err}"));
        }
    };
    // Close before promoting so no buffered state can outlive the rename.
    drop(handle);

    if let Err(err) = fs::rename(&temp_path, &destination) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("durable-write-promote-failed:{err}"));
    }

    let parent_synced =
        sync_parent_dir(parent).map_err(|err| format!("durable-write-parent-sync-failed:{err}"))?;

    Ok(DurableWriteResult {
        schema: DURABLE_WRITE_SCHEMA,
        ok: true,
        wrote: true,
        replaced,
        byte_length: bytes.len() as u64,
        full_fsync,
        parent_synced,
        blockers: vec![],
    })
}

/// Resolves the app-owned archive root. This must agree with the renderer's
/// `BaseDirectory::AppLocalData` (15) + `archive/...` convention, so it uses
/// Tauri's own resolver rather than rebuilding a path from the product name.
fn archive_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;

    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|err| format!("durable-write-app-local-data-unavailable:{err}"))?;
    Ok(base.join(ARCHIVE_ROOT))
}

/// Durable archive write.
///
/// Bytes travel as the raw invoke body and the destination travels as a
/// percent-encoded header, mirroring `plugin:fs|write_file`'s marshaling so a
/// multi-megabyte asset is not expanded into a JSON number array.
#[tauri::command]
pub async fn h2o_archive_durable_write(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<DurableWriteResult, String> {
    let raw_options = request
        .headers()
        .get("options")
        .ok_or_else(|| "durable-write-options-missing".to_string())?;
    let decoded = percent_encoding::percent_decode(raw_options.as_ref())
        .decode_utf8()
        .map_err(|_| "durable-write-options-not-utf8".to_string())?;
    let options: DurableWriteOptions = serde_json::from_str(&decoded)
        .map_err(|err| format!("durable-write-options-invalid:{err}"))?;

    let bytes: Vec<u8> = match request.body() {
        tauri::ipc::InvokeBody::Raw(data) => data.clone(),
        tauri::ipc::InvokeBody::Json(serde_json::Value::Array(data)) => data
            .iter()
            .map(|value| {
                value
                    .as_u64()
                    .filter(|byte| *byte <= u8::MAX as u64)
                    .map(|byte| byte as u8)
                    .ok_or_else(|| "durable-write-body-not-bytes".to_string())
            })
            .collect::<Result<Vec<u8>, String>>()?,
        _ => return Err("durable-write-body-unexpected".to_string()),
    };

    let root = archive_root(&app)?;
    durable_write_within_root(&root, &options.path, &bytes, options.existing)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Hand-rolled scratch root, matching the crate's existing convention of
    /// PID-suffixed temp paths rather than pulling in a temp-dir dependency.
    fn scratch_root(name: &str) -> PathBuf {
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "h2o-durable-write-{name}-{}-{counter}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch root");
        dir
    }

    fn blocker_codes(result: &DurableWriteResult) -> Vec<String> {
        result.blockers.iter().map(|b| b.code.clone()).collect()
    }

    /// Any file under `root` whose name carries the staging prefix.
    fn temp_artifacts(root: &Path) -> Vec<PathBuf> {
        let mut found = vec![];
        let mut stack = vec![root.to_path_buf()];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                } else if entry.file_name().to_string_lossy().starts_with(TEMP_PREFIX) {
                    found.push(path);
                }
            }
        }
        found
    }

    #[test]
    fn writes_exact_bytes_and_leaves_no_temp_artifact() {
        let root = scratch_root("happy");
        let result =
            durable_write_within_root(&root, "assets/aa/sha256-abc", b"hello", ExistingPolicy::Fail)
                .expect("write");

        assert!(result.ok);
        assert!(result.wrote);
        assert!(!result.replaced);
        assert_eq!(result.byte_length, 5);
        assert_eq!(
            fs::read(root.join("assets/aa/sha256-abc")).unwrap(),
            b"hello"
        );
        assert!(temp_artifacts(&root).is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn creates_nested_directories() {
        let root = scratch_root("nested");
        let result =
            durable_write_within_root(&root, "packages/a.h2ochat/manifest.json", b"{}", ExistingPolicy::Fail)
                .expect("write");
        assert!(result.ok);
        assert!(root.join("packages/a.h2ochat/manifest.json").is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_traversal_absolute_and_malformed_destinations() {
        let root = scratch_root("reject");
        let cases: Vec<(&str, &str)> = vec![
            ("", "durable-write-path-empty"),
            ("../escape", "durable-write-path-traversal"),
            ("assets/../../escape", "durable-write-path-traversal"),
            ("./assets/x", "durable-write-path-invalid"),
            ("with\0nul", "durable-write-path-invalid"),
            (".h2o-durable-1-0.tmp", "durable-write-path-reserved"),
        ];
        for (relative, expected) in cases {
            let result =
                durable_write_within_root(&root, relative, b"x", ExistingPolicy::Fail).expect("call");
            assert!(!result.ok, "{relative} must be refused");
            assert_eq!(blocker_codes(&result), vec![expected.to_string()], "{relative}");
        }

        let absolute = root.join("absolute.bin");
        let result = durable_write_within_root(
            &root,
            absolute.to_str().unwrap(),
            b"x",
            ExistingPolicy::Fail,
        )
        .expect("call");
        assert!(!result.ok);
        assert_eq!(
            blocker_codes(&result),
            vec!["durable-write-path-not-relative".to_string()]
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn no_refused_destination_creates_anything_outside_the_root() {
        let root = scratch_root("outside");
        let sibling = root.parent().unwrap().join(format!(
            "h2o-durable-write-outside-witness-{}",
            std::process::id()
        ));
        let _ = fs::remove_file(&sibling);

        let relative = format!("../{}", sibling.file_name().unwrap().to_string_lossy());
        let result =
            durable_write_within_root(&root, &relative, b"x", ExistingPolicy::Fail).expect("call");

        assert!(!result.ok);
        assert!(!sibling.exists(), "traversal must not create a file outside the root");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn destination_exists_is_refused_under_fail_and_superseded_under_replace() {
        let root = scratch_root("exists");
        durable_write_within_root(&root, "assets/aa/blob", b"first", ExistingPolicy::Fail)
            .expect("seed");

        let refused =
            durable_write_within_root(&root, "assets/aa/blob", b"second", ExistingPolicy::Fail)
                .expect("call");
        assert!(!refused.ok);
        assert_eq!(
            blocker_codes(&refused),
            vec!["durable-write-destination-exists".to_string()]
        );
        assert_eq!(fs::read(root.join("assets/aa/blob")).unwrap(), b"first");

        let replaced =
            durable_write_within_root(&root, "assets/aa/blob", b"second", ExistingPolicy::Replace)
                .expect("call");
        assert!(replaced.ok);
        assert!(replaced.replaced);
        assert_eq!(fs::read(root.join("assets/aa/blob")).unwrap(), b"second");
        assert!(temp_artifacts(&root).is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_destination_and_symlinked_parent() {
        let root = scratch_root("symlink");
        let outside = root.parent().unwrap().join(format!(
            "h2o-durable-write-symlink-target-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&outside).expect("outside dir");
        let victim = outside.join("victim.txt");
        fs::write(&victim, b"original").expect("victim");

        // Destination itself is a symlink pointing outside the root.
        fs::create_dir_all(root.join("assets")).expect("assets");
        std::os::unix::fs::symlink(&victim, root.join("assets/linked")).expect("file symlink");
        let result =
            durable_write_within_root(&root, "assets/linked", b"pwned", ExistingPolicy::Replace)
                .expect("call");
        assert!(!result.ok);
        assert_eq!(
            blocker_codes(&result),
            vec!["durable-write-destination-symlink".to_string()]
        );
        assert_eq!(fs::read(&victim).unwrap(), b"original");

        // A symlinked directory on the path is refused before any write.
        std::os::unix::fs::symlink(&outside, root.join("hop")).expect("dir symlink");
        let via_dir =
            durable_write_within_root(&root, "hop/planted.txt", b"pwned", ExistingPolicy::Fail)
                .expect("call");
        assert!(!via_dir.ok);
        assert_eq!(
            blocker_codes(&via_dir),
            vec!["durable-write-parent-symlink".to_string()]
        );
        assert!(!outside.join("planted.txt").exists());

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn refuses_a_directory_standing_where_the_file_belongs() {
        let root = scratch_root("dir-dest");
        fs::create_dir_all(root.join("assets/aa/blob")).expect("dir");
        let result =
            durable_write_within_root(&root, "assets/aa/blob", b"x", ExistingPolicy::Replace)
                .expect("call");
        assert!(!result.ok);
        assert_eq!(
            blocker_codes(&result),
            vec!["durable-write-destination-not-regular-file".to_string()]
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_staging_write_leaves_the_canonical_destination_intact() {
        use std::os::unix::fs::PermissionsExt;

        let root = scratch_root("stage-fail");
        durable_write_within_root(&root, "assets/aa/blob", b"canonical", ExistingPolicy::Fail)
            .expect("seed");

        // Make the destination directory unwritable so staging cannot start.
        let parent = root.join("assets/aa");
        let original = fs::metadata(&parent).unwrap().permissions();
        let mut locked = original.clone();
        locked.set_mode(0o500);
        fs::set_permissions(&parent, locked).expect("lock");

        let result =
            durable_write_within_root(&root, "assets/aa/blob", b"replacement", ExistingPolicy::Replace);

        fs::set_permissions(&parent, original).expect("unlock");

        assert!(result.is_err(), "staging failure must surface");
        assert!(result.unwrap_err().starts_with("durable-write-temp-create-failed:"));
        assert_eq!(fs::read(root.join("assets/aa/blob")).unwrap(), b"canonical");
        assert!(temp_artifacts(&root).is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn zero_byte_writes_are_permitted_and_durable() {
        let root = scratch_root("empty");
        let result =
            durable_write_within_root(&root, "assets/aa/empty", b"", ExistingPolicy::Fail)
                .expect("write");
        assert!(result.ok);
        assert_eq!(result.byte_length, 0);
        assert_eq!(fs::read(root.join("assets/aa/empty")).unwrap(), Vec::<u8>::new());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn contents_are_synced_and_the_parent_entry_is_synced_on_unix() {
        let root = scratch_root("sync");
        let result = durable_write_within_root(&root, "assets/aa/sync", b"bytes", ExistingPolicy::Fail)
            .expect("write");
        assert!(result.ok);
        if cfg!(unix) {
            assert!(result.parent_synced, "unix must sync the parent directory");
        }
        if cfg!(target_os = "macos") {
            // APFS and HFS+ both honour F_FULLFSYNC, so the strong guarantee
            // is the expected outcome here. The sync_all fallback exists for
            // filesystems that reject the fcntl, not as the normal path.
            assert!(
                result.full_fsync,
                "macOS write should establish the F_FULLFSYNC guarantee"
            );
        }
        let _ = fs::remove_dir_all(&root);
    }
}
