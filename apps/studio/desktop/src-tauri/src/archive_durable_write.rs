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
// CONTAINMENT IS DESCRIPTOR-RELATIVE, NOT PATHNAME-RELATIVE.
//
// A custom command bypasses the `plugin:fs` scope entirely, so this module's own
// containment implementation IS the security boundary. A check-then-use design
// over pathnames is not sufficient: an earlier revision validated ancestors with
// `symlink_metadata` and then called `create_dir_all`, and a concurrent attacker
// swapping an ancestor for a symlink between those two steps redirected writes
// outside the root (reproduced in 59 attempts).
//
// The boundary is therefore established once, as an open directory descriptor on
// the archive root, and every subsequent operation is performed RELATIVE to an
// already-admitted descriptor via `openat`/`mkdirat`/`fstatat`/`renameat` with
// `O_NOFOLLOW` and `O_DIRECTORY`. Once a descriptor is held it names an inode,
// not a path, so replacing a component afterwards cannot redirect anything: the
// attacker either loses the race (we keep writing into the original directory,
// still inside the root) or wins it before our `openat`, which then fails closed
// with `ELOOP`. There is no window in which a redirected pathname is used.
//
// The archive root itself is admitted the same way — opened through its parent
// with `O_NOFOLLOW | O_DIRECTORY`, so a symlink standing where `archive` belongs
// is refused rather than followed.
//
// PLATFORM SUPPORT: Unix only, and proven on macOS. There is no equivalent
// handle/reparse-point-safe traversal here for Windows, so rather than silently
// degrading to the raceable pathname model this primitive FAILS CLOSED on any
// non-Unix target (`durable-write-unsupported-platform`). Adding Windows support
// means implementing the equivalent traversal, not relaxing this one.
//
// Ordering follows the established durable-write discipline (temp in the
// destination directory -> write -> sync contents -> close -> atomic rename ->
// sync parent directory). See docs/systems/archive/saved-chat-package-v3.md
// for the package-level invariant this protects.

use serde::{Deserialize, Serialize};
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

/// Splits a caller-supplied relative destination into validated components.
///
/// Rejects anything that is not a plain relative path built from normal
/// components, so `..`, absolute paths, drive prefixes, `.` and embedded NULs
/// never reach the traversal. The components are returned as owned byte strings
/// because every subsequent syscall consumes them one at a time, relative to a
/// descriptor — the joined pathname is never used to open anything.
fn validated_components(relative: &str) -> Result<Vec<Vec<u8>>, &'static str> {
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

    let mut out: Vec<Vec<u8>> = vec![];
    for component in candidate.components() {
        match component {
            Component::Normal(part) => {
                let text = part.to_str().ok_or("durable-write-path-invalid")?;
                // Reject our own staging prefix so a caller can never target
                // another operation's private temp artifact.
                if text.starts_with(TEMP_PREFIX) {
                    return Err("durable-write-path-reserved");
                }
                out.push(text.as_bytes().to_vec());
            }
            Component::ParentDir => return Err("durable-write-path-traversal"),
            Component::CurDir => return Err("durable-write-path-invalid"),
            Component::RootDir | Component::Prefix(_) => {
                return Err("durable-write-path-not-relative")
            }
        }
    }

    if out.is_empty() {
        return Err("durable-write-path-empty");
    }
    Ok(out)
}

#[cfg(unix)]
mod confined {
    //! Descriptor-relative filesystem primitives. Every operation is performed
    //! against an already-admitted directory descriptor, so a concurrent
    //! rename/symlink swap of a path component cannot redirect it.

    use std::ffi::CString;
    use std::fs::File;
    use std::io;
    use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
    use std::path::Path;

    fn cstr(name: &[u8]) -> io::Result<CString> {
        CString::new(name).map_err(|_| io::Error::from(io::ErrorKind::InvalidInput))
    }

    /// An open directory descriptor. Dropping it closes the descriptor.
    pub struct Dir(OwnedFd);

    impl Dir {
        /// Opens `path` as a directory without following a symlink standing at
        /// its final component. Used only to admit the root.
        pub fn open_root(path: &Path) -> io::Result<Dir> {
            use std::os::unix::ffi::OsStrExt;

            let parent = path
                .parent()
                .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidInput))?;
            let name = path
                .file_name()
                .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidInput))?;

            // The parent (Tauri's app-local-data directory) is trusted input,
            // not caller input; it is opened as a directory so the final
            // component can then be admitted with O_NOFOLLOW.
            std::fs::create_dir_all(parent)?;
            let parent_dir = Dir::open_trusted_dir(parent)?;
            let name = name.as_bytes();
            parent_dir.mkdir_child(name)?;
            parent_dir.open_child_nofollow(name)
        }

        /// Opens a trusted directory path with `O_DIRECTORY`. Only used for the
        /// app-local-data parent, which the caller never influences.
        fn open_trusted_dir(path: &Path) -> io::Result<Dir> {
            use std::os::unix::ffi::OsStrExt;

            let c = cstr(path.as_os_str().as_bytes())?;
            let fd = unsafe {
                libc::open(
                    c.as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC,
                )
            };
            if fd < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(Dir(unsafe { OwnedFd::from_raw_fd(fd) }))
        }

        /// Opens a child directory relative to this descriptor, refusing to
        /// follow a symlink. A component swapped for a symlink after this
        /// descriptor was admitted fails here with `ELOOP` rather than
        /// redirecting the write.
        pub fn open_child_nofollow(&self, name: &[u8]) -> io::Result<Dir> {
            let c = cstr(name)?;
            let fd = unsafe {
                libc::openat(
                    self.0.as_raw_fd(),
                    c.as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                )
            };
            if fd < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(Dir(unsafe { OwnedFd::from_raw_fd(fd) }))
        }

        /// Creates a child directory relative to this descriptor. An existing
        /// entry is tolerated here and rejected by the subsequent `O_NOFOLLOW`
        /// open if it is not a real directory.
        pub fn mkdir_child(&self, name: &[u8]) -> io::Result<()> {
            let c = cstr(name)?;
            let rc = unsafe { libc::mkdirat(self.0.as_raw_fd(), c.as_ptr(), 0o755) };
            if rc < 0 {
                let err = io::Error::last_os_error();
                if err.kind() != io::ErrorKind::AlreadyExists {
                    return Err(err);
                }
            }
            Ok(())
        }

        /// `fstatat` with `AT_SYMLINK_NOFOLLOW`. Returns `None` when absent.
        pub fn stat_child_nofollow(&self, name: &[u8]) -> io::Result<Option<libc::stat>> {
            let c = cstr(name)?;
            let mut st: libc::stat = unsafe { std::mem::zeroed() };
            let rc = unsafe {
                libc::fstatat(
                    self.0.as_raw_fd(),
                    c.as_ptr(),
                    &mut st,
                    libc::AT_SYMLINK_NOFOLLOW,
                )
            };
            if rc < 0 {
                let err = io::Error::last_os_error();
                if err.kind() == io::ErrorKind::NotFound {
                    return Ok(None);
                }
                return Err(err);
            }
            Ok(Some(st))
        }

        /// Exclusively creates a file relative to this descriptor.
        pub fn create_new_child(&self, name: &[u8]) -> io::Result<File> {
            let c = cstr(name)?;
            let fd = unsafe {
                libc::openat(
                    self.0.as_raw_fd(),
                    c.as_ptr(),
                    libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_CLOEXEC,
                    0o644 as libc::c_uint,
                )
            };
            if fd < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(unsafe { File::from_raw_fd(fd) })
        }

        /// Renames within this same directory descriptor, so the promotion can
        /// never cross a filesystem or be redirected by a path swap.
        pub fn rename_within(&self, from: &[u8], to: &[u8]) -> io::Result<()> {
            let from_c = cstr(from)?;
            let to_c = cstr(to)?;
            let rc = unsafe {
                libc::renameat(
                    self.0.as_raw_fd(),
                    from_c.as_ptr(),
                    self.0.as_raw_fd(),
                    to_c.as_ptr(),
                )
            };
            if rc < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }

        /// Unlinks a child of this directory. Only ever called on this
        /// operation's own private temp artifact.
        pub fn unlink_child(&self, name: &[u8]) -> io::Result<()> {
            let c = cstr(name)?;
            let rc = unsafe { libc::unlinkat(self.0.as_raw_fd(), c.as_ptr(), 0) };
            if rc < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }

        /// Syncs this directory so the promoted entry is durable.
        pub fn sync(&self) -> io::Result<()> {
            let rc = unsafe { libc::fsync(self.0.as_raw_fd()) };
            if rc < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }
    }

    /// Whether `st` describes a regular file.
    pub fn is_regular(st: &libc::stat) -> bool {
        (st.st_mode & libc::S_IFMT) == libc::S_IFREG
    }

    /// Whether `st` describes a symbolic link.
    pub fn is_symlink(st: &libc::stat) -> bool {
        (st.st_mode & libc::S_IFMT) == libc::S_IFLNK
    }
}

/// Flushes file contents. On macOS plain `fsync(2)` only pushes writes to the
/// device without forcing a drive-cache flush, so `F_FULLFSYNC` is used first
/// and `sync_all` is the documented fallback for filesystems that reject it.
/// Returns whether the strong `F_FULLFSYNC` guarantee was established.
#[cfg(target_os = "macos")]
fn sync_file_contents(file: &std::fs::File) -> std::io::Result<bool> {
    use std::os::unix::io::AsRawFd;

    let rc = unsafe { libc::fcntl(file.as_raw_fd(), libc::F_FULLFSYNC) };
    if rc == 0 {
        return Ok(true);
    }
    file.sync_all()?;
    Ok(false)
}

#[cfg(not(target_os = "macos"))]
fn sync_file_contents(file: &std::fs::File) -> std::io::Result<bool> {
    file.sync_all()?;
    Ok(false)
}

fn temp_name() -> Vec<u8> {
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{TEMP_PREFIX}{}-{counter}{TEMP_SUFFIX}", std::process::id()).into_bytes()
}

/// Durably writes `bytes` to `relative` beneath `root`.
///
/// Domain refusals (traversal, symlink, destination-exists) come back as
/// `Ok(result)` with `ok: false` and a blocker code; only infrastructure
/// faults return `Err`. Any failure up to and including the promotion leaves
/// the canonical destination exactly as it was, and removes only this
/// operation's own temp artifact.
///
/// The one exception is deliberate: if the parent-directory sync fails AFTER a
/// successful rename, the new bytes are already committed and this still
/// returns `Err`. The caller must therefore treat `Err` as "committed state
/// unknown", not as "nothing happened". Content-addressed callers are immune —
/// a re-put verifies whatever is on disk — which is why the failure is reported
/// rather than swallowed.
#[cfg(unix)]
pub fn durable_write_within_root(
    root: &Path,
    relative: &str,
    bytes: &[u8],
    existing: ExistingPolicy,
) -> Result<DurableWriteResult, String> {
    use confined::Dir;

    let components = match validated_components(relative) {
        Ok(components) => components,
        Err(code) => return Ok(DurableWriteResult::blocked(code)),
    };

    // Admit the root once, as a descriptor. Everything below is relative to it.
    let mut dir =
        Dir::open_root(root).map_err(|err| format!("durable-write-root-open-failed:{err}"))?;

    let (file_name, dir_names) = components.split_last().expect("validated non-empty");

    for name in dir_names {
        if let Err(err) = dir.mkdir_child(name) {
            return Err(format!("durable-write-parent-create-failed:{err}"));
        }
        // O_NOFOLLOW: a component swapped for a symlink is refused, never
        // followed. This is the step the previous pathname design could not do.
        dir = match dir.open_child_nofollow(name) {
            Ok(next) => next,
            Err(err) => {
                return match err.raw_os_error() {
                    Some(libc::ELOOP) | Some(libc::ENOTDIR) | Some(libc::EMLINK) => {
                        Ok(DurableWriteResult::blocked("durable-write-parent-symlink"))
                    }
                    _ => Err(format!("durable-write-parent-open-failed:{err}")),
                };
            }
        };
    }

    let mut replaced = false;
    match dir.stat_child_nofollow(file_name) {
        Ok(Some(st)) => {
            // A symlink or a non-regular entry at the destination is refused
            // under every policy: replacing it would write through the link.
            if confined::is_symlink(&st) {
                return Ok(DurableWriteResult::blocked(
                    "durable-write-destination-symlink",
                ));
            }
            if !confined::is_regular(&st) {
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
        Ok(None) => {}
        Err(err) => return Err(format!("durable-write-destination-stat-failed:{err}")),
    }

    // Stage inside the destination directory descriptor so the promotion is a
    // same-directory rename and can never degrade into a copy.
    let temp = temp_name();
    let mut handle = dir
        .create_new_child(&temp)
        .map_err(|err| format!("durable-write-temp-create-failed:{err}"))?;

    use std::io::Write;
    let full_fsync = match handle
        .write_all(bytes)
        .and_then(|_| sync_file_contents(&handle))
    {
        Ok(full_fsync) => full_fsync,
        Err(err) => {
            drop(handle);
            let _ = dir.unlink_child(&temp);
            return Err(format!("durable-write-temp-write-failed:{err}"));
        }
    };
    // Close before promoting so no buffered state can outlive the rename.
    drop(handle);

    if let Err(err) = dir.rename_within(&temp, file_name) {
        let _ = dir.unlink_child(&temp);
        return Err(format!("durable-write-promote-failed:{err}"));
    }

    dir.sync()
        .map_err(|err| format!("durable-write-parent-sync-failed:{err}"))?;

    Ok(DurableWriteResult {
        schema: DURABLE_WRITE_SCHEMA,
        ok: true,
        wrote: true,
        replaced,
        byte_length: bytes.len() as u64,
        full_fsync,
        parent_synced: true,
        blockers: vec![],
    })
}

/// Non-Unix targets have no proven handle-safe traversal here, so the primitive
/// fails closed rather than degrading to the raceable pathname model.
#[cfg(not(unix))]
pub fn durable_write_within_root(
    _root: &Path,
    _relative: &str,
    _bytes: &[u8],
    _existing: ExistingPolicy,
) -> Result<DurableWriteResult, String> {
    Ok(DurableWriteResult::blocked(
        "durable-write-unsupported-platform",
    ))
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
    use std::fs;

    /// Hand-rolled scratch root, matching the crate's existing convention of
    /// PID-suffixed temp paths rather than pulling in a temp-dir dependency.
    fn scratch_base(name: &str) -> PathBuf {
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "h2o-durable-write-{name}-{}-{counter}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch base");
        dir
    }

    /// Returns (base, root) where root is `<base>/archive`.
    fn scratch_root(name: &str) -> (PathBuf, PathBuf) {
        let base = scratch_base(name);
        let root = base.join(ARCHIVE_ROOT);
        (base, root)
    }

    fn blocker_codes(result: &DurableWriteResult) -> Vec<String> {
        result.blockers.iter().map(|b| b.code.clone()).collect()
    }

    /// Any file under `dir` whose name carries the staging prefix.
    fn temp_artifacts(dir: &Path) -> Vec<PathBuf> {
        let mut found = vec![];
        let mut stack = vec![dir.to_path_buf()];
        while let Some(current) = stack.pop() {
            let Ok(entries) = fs::read_dir(&current) else {
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
        let (base, root) = scratch_root("happy");
        let result = durable_write_within_root(
            &root,
            "assets/aa/sha256-abc",
            b"hello",
            ExistingPolicy::Fail,
        )
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
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn creates_nested_directories() {
        let (base, root) = scratch_root("nested");
        let result = durable_write_within_root(
            &root,
            "packages/a.h2ochat/nested/deeper/manifest.json",
            b"{}",
            ExistingPolicy::Fail,
        )
        .expect("write");
        assert!(result.ok);
        assert!(root
            .join("packages/a.h2ochat/nested/deeper/manifest.json")
            .is_file());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_traversal_absolute_and_malformed_destinations() {
        let (base, root) = scratch_root("reject");
        let cases: Vec<(&str, &str)> = vec![
            ("", "durable-write-path-empty"),
            ("../escape", "durable-write-path-traversal"),
            ("assets/../../escape", "durable-write-path-traversal"),
            ("./assets/x", "durable-write-path-invalid"),
            ("with\0nul", "durable-write-path-invalid"),
            (".h2o-durable-1-0.tmp", "durable-write-path-reserved"),
        ];
        for (relative, expected) in cases {
            let result = durable_write_within_root(&root, relative, b"x", ExistingPolicy::Fail)
                .expect("call");
            assert!(!result.ok, "{relative} must be refused");
            assert_eq!(
                blocker_codes(&result),
                vec![expected.to_string()],
                "{relative}"
            );
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
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn no_refused_destination_creates_anything_outside_the_root() {
        let (base, root) = scratch_root("outside");
        let witness = base.join("outside-witness.txt");
        let _ = fs::remove_file(&witness);

        let result =
            durable_write_within_root(&root, "../outside-witness.txt", b"x", ExistingPolicy::Fail)
                .expect("call");

        assert!(!result.ok);
        assert!(
            !witness.exists(),
            "traversal must not create a file outside the root"
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn destination_exists_is_refused_under_fail_and_superseded_under_replace() {
        let (base, root) = scratch_root("exists");
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
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_a_persistent_symlinked_ancestor_and_a_symlinked_destination() {
        let (base, root) = scratch_root("symlink");
        let outside = base.join("outside");
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

        // A symlinked directory standing on the path is refused, not followed.
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

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn refuses_a_symlink_standing_where_the_archive_root_belongs() {
        let base = scratch_base("root-symlink");
        let outside = base.join("outside");
        fs::create_dir_all(&outside).expect("outside");
        // `archive` is a symlink to a directory outside the intended root.
        std::os::unix::fs::symlink(&outside, base.join(ARCHIVE_ROOT)).expect("root symlink");

        let root = base.join(ARCHIVE_ROOT);
        let result = durable_write_within_root(&root, "assets/aa/blob", b"x", ExistingPolicy::Fail);

        assert!(
            result.is_err(),
            "a symlinked archive root must not be admitted"
        );
        assert!(
            !outside.join("assets").exists(),
            "nothing may be created through the link"
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn refuses_a_directory_standing_where_the_file_belongs() {
        let (base, root) = scratch_root("dir-dest");
        fs::create_dir_all(root.join("assets/aa/blob")).expect("dir");
        let result =
            durable_write_within_root(&root, "assets/aa/blob", b"x", ExistingPolicy::Replace)
                .expect("call");
        assert!(!result.ok);
        assert_eq!(
            blocker_codes(&result),
            vec!["durable-write-destination-not-regular-file".to_string()]
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn a_failed_staging_write_leaves_the_canonical_destination_intact() {
        use std::os::unix::fs::PermissionsExt;

        let (base, root) = scratch_root("stage-fail");
        durable_write_within_root(&root, "assets/aa/blob", b"canonical", ExistingPolicy::Fail)
            .expect("seed");

        // Make the destination directory unwritable so staging cannot start.
        let parent = root.join("assets/aa");
        let original = fs::metadata(&parent).unwrap().permissions();
        let mut locked = original.clone();
        locked.set_mode(0o500);
        fs::set_permissions(&parent, locked).expect("lock");

        let result = durable_write_within_root(
            &root,
            "assets/aa/blob",
            b"replacement",
            ExistingPolicy::Replace,
        );

        fs::set_permissions(&parent, original).expect("unlock");

        assert!(result.is_err(), "staging failure must surface");
        assert!(result
            .unwrap_err()
            .starts_with("durable-write-temp-create-failed:"));
        assert_eq!(fs::read(root.join("assets/aa/blob")).unwrap(), b"canonical");
        assert!(temp_artifacts(&root).is_empty());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn zero_byte_writes_are_permitted_and_durable() {
        let (base, root) = scratch_root("empty");
        let result = durable_write_within_root(&root, "assets/aa/empty", b"", ExistingPolicy::Fail)
            .expect("write");
        assert!(result.ok);
        assert_eq!(result.byte_length, 0);
        assert_eq!(
            fs::read(root.join("assets/aa/empty")).unwrap(),
            Vec::<u8>::new()
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn contents_are_synced_and_the_parent_entry_is_synced() {
        let (base, root) = scratch_root("sync");
        let result =
            durable_write_within_root(&root, "assets/aa/sync", b"bytes", ExistingPolicy::Fail)
                .expect("write");
        assert!(result.ok);
        assert!(result.parent_synced, "the parent directory must be synced");
        if cfg!(target_os = "macos") {
            // APFS and HFS+ both honour F_FULLFSYNC, so the strong guarantee
            // is the expected outcome here. The sync_all fallback exists for
            // filesystems that reject the fcntl, not as the normal path.
            assert!(
                result.full_fsync,
                "macOS write should establish the F_FULLFSYNC guarantee"
            );
        }
        let _ = fs::remove_dir_all(&base);
    }

    /// The adversarial race the previous pathname design lost.
    ///
    /// An attacker thread continuously swaps an admitted ancestor directory for
    /// a symlink pointing outside the root while the writer loops. The test is
    /// only meaningful if the attacker actually mutated the path during the run,
    /// so successful swaps are counted and asserted — a passing run caused by an
    /// idle attacker thread is treated as a failure.
    #[test]
    fn concurrent_ancestor_swap_cannot_redirect_a_write_outside_the_root() {
        use std::sync::atomic::{AtomicBool, AtomicU64};
        use std::sync::Arc;

        let (base, root) = scratch_root("race");
        let outside = base.join("outside");
        fs::create_dir_all(&outside).expect("outside");
        fs::create_dir_all(root.join("hop")).expect("hop");

        let stop = Arc::new(AtomicBool::new(false));
        let swaps = Arc::new(AtomicU64::new(0));

        let attacker = {
            let stop = Arc::clone(&stop);
            let swaps = Arc::clone(&swaps);
            let root = root.clone();
            let outside = outside.clone();
            std::thread::spawn(move || {
                let hop = root.join("hop");
                let mut round = 0u64;
                while !stop.load(Ordering::Relaxed) {
                    // A fresh stash name each round; reusing one name wedges the
                    // attacker after a single cycle and silently under-exercises
                    // the race.
                    let stash = root.join(format!("hop-real-{round}"));
                    round += 1;
                    let real_dir = matches!(
                        fs::symlink_metadata(&hop),
                        Ok(md) if md.is_dir() && !md.file_type().is_symlink()
                    );
                    if real_dir && fs::rename(&hop, &stash).is_ok() {
                        // Stand a symlink to the outside directory in its place.
                        if std::os::unix::fs::symlink(&outside, &hop).is_ok() {
                            swaps.fetch_add(1, Ordering::Relaxed);
                        }
                        std::thread::yield_now();
                        let _ = fs::remove_file(&hop);
                        if fs::rename(&stash, &hop).is_err() {
                            let _ = fs::remove_dir_all(&stash);
                        }
                    }
                    std::thread::yield_now();
                }
            })
        };

        let mut wrote = 0u64;
        for i in 0..4000u64 {
            let rel = format!("hop/blob-{i}");
            match durable_write_within_root(&root, &rel, b"payload", ExistingPolicy::Fail) {
                Ok(result) if result.ok => wrote += 1,
                // Losing the race is fine; being redirected is not.
                Ok(_) => {}
                Err(_) => {}
            }
        }
        stop.store(true, Ordering::Relaxed);
        attacker.join().expect("attacker thread");

        let swap_count = swaps.load(Ordering::Relaxed);
        assert!(
            swap_count > 0,
            "the attacker never mutated the path; the race was not exercised"
        );

        // The only acceptable outcome: nothing was ever written through the link.
        // Verified to have teeth — the pre-T05 pathname algorithm, run against
        // this same attacker, wrote files into `outside` (scratchpad race-proof
        // probe: OLD escaped on 3 of 4 runs, NEW escaped on 0 of 4).
        let escaped: Vec<_> = fs::read_dir(&outside)
            .expect("outside readable")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert!(
            escaped.is_empty(),
            "writes escaped the archive root ({swap_count} swaps): {escaped:?}"
        );
        assert!(
            wrote > 0,
            "the writer never succeeded; the test proved nothing about containment"
        );

        let _ = fs::remove_dir_all(&base);
    }
}
