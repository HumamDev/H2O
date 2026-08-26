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
pub const CAS_REPAIR_SCHEMA: &str = "h2o.studio.archive.cas-repair-write.v1";

/// Every admitted destination lives under `$APPLOCALDATA/<ARCHIVE_ROOT>`.
pub const ARCHIVE_ROOT: &str = "archive";

/// Distinguishes this module's private staging artifacts from any real
/// archive member. A CAS blob is `sha256-<hex>` and a package member is a
/// plain name, so neither can collide with this prefix.
const TEMP_PREFIX: &str = ".h2o-durable-";
const TEMP_SUFFIX: &str = ".tmp";

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// The content-addressed store lives at `<ARCHIVE_ROOT>/<CAS_DIR>`.
const CAS_DIR: &str = "assets";

/// How many distinct private temp names to try before giving up.
const TEMP_ATTEMPTS: u32 = 8;

/// What to do when the canonical destination already exists.
///
/// PRIVATE ON PURPOSE. This is not `Deserialize` and no caller-supplied field
/// maps to it: a renderer cannot ask for replacement of an arbitrary archive
/// destination. `Replace` is reachable only from the CAS repair path below,
/// which derives its own destination from bytes it hashed itself.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum ExistingPolicy {
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
    /// There is deliberately no `existing` field — see `ExistingPolicy`.
    pub path: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CasRepairOptions {
    /// Optional caller assertion of the content hash. It can only ever cause a
    /// REFUSAL: the destination is derived from the hash this module computes
    /// itself, never from anything the caller supplies.
    #[serde(default)]
    pub expected_sha256: Option<String>,
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

/// Outcome of a durable write.
///
/// The atomic promotion is an irreversible boundary, so committed-ness and
/// durability-completeness are reported SEPARATELY. A parent-directory sync
/// that fails after a successful rename leaves the canonical destination
/// already changed; returning a bare error there would tell the caller
/// "nothing happened", which is false. The three honest states are:
///
///   committed:false                            — the destination is untouched
///   committed:true, durabilityComplete:false   — the bytes are in place but the
///                                                directory entry is not fenced
///   committed:true, durabilityComplete:true    — fully durable
///
/// `ok` is true only for the last of those.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableWriteResult {
    pub schema: &'static str,
    pub ok: bool,
    /// The atomic promotion succeeded: the canonical destination now holds the
    /// new bytes. Never true unless the rename returned success.
    pub committed: bool,
    /// The parent directory entry was synced after the promotion.
    pub durability_complete: bool,
    pub replaced: bool,
    pub byte_length: u64,
    /// True only when the file contents were flushed with macOS `F_FULLFSYNC`.
    /// False means the weaker `fsync(2)` guarantee — see `sync_file_contents`.
    pub full_fsync: bool,
    pub blockers: Vec<DurableWriteBlocker>,
    /// Infrastructure detail accompanying an incomplete-durability commit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl DurableWriteResult {
    fn skeleton() -> Self {
        Self {
            schema: DURABLE_WRITE_SCHEMA,
            ok: false,
            committed: false,
            durability_complete: false,
            replaced: false,
            byte_length: 0,
            full_fsync: false,
            blockers: vec![],
            detail: None,
        }
    }

    pub fn blocked(code: &str) -> Self {
        let mut result = Self::skeleton();
        result.blockers.push(DurableWriteBlocker::new(code));
        result
    }
}

/// Outcome of a CAS repair. The `sha256`/`path` fields are what this module
/// DERIVED, not what any caller asked for — they exist so the caller can see
/// where the trusted side decided the object belongs.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CasRepairResult {
    pub schema: &'static str,
    pub ok: bool,
    pub sha256: String,
    pub path: String,
    /// The canonical object already held exactly these bytes; nothing written.
    pub already_valid: bool,
    /// A mismatching object was superseded by the verified bytes.
    pub repaired: bool,
    pub committed: bool,
    pub durability_complete: bool,
    pub byte_length: u64,
    pub full_fsync: bool,
    pub blockers: Vec<DurableWriteBlocker>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl CasRepairResult {
    fn skeleton(sha256: String, path: String) -> Self {
        Self {
            schema: CAS_REPAIR_SCHEMA,
            ok: false,
            sha256,
            path,
            already_valid: false,
            repaired: false,
            committed: false,
            durability_complete: false,
            byte_length: 0,
            full_fsync: false,
            blockers: vec![],
            detail: None,
        }
    }

    fn blocked(code: &str) -> Self {
        let mut result = Self::skeleton(String::new(), String::new());
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

        /// Opens a child file for reading without following a symlink. Used to
        /// prove an existing CAS object really is corrupt before superseding it.
        pub fn open_child_read_nofollow(&self, name: &[u8]) -> io::Result<File> {
            let c = cstr(name)?;
            let fd = unsafe {
                libc::openat(
                    self.0.as_raw_fd(),
                    c.as_ptr(),
                    libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                )
            };
            if fd < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(unsafe { File::from_raw_fd(fd) })
        }

        /// Renames within this same directory descriptor, so the promotion can
        /// never cross a filesystem or be redirected by a path swap.
        ///
        /// This CLOBBERS an existing destination and is therefore reserved for
        /// the proven-mismatch CAS repair path. Create-only callers must use
        /// `promote_exclusive`.
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

        /// Promotes `from` to `to` ONLY IF `to` does not already exist, as a
        /// single atomic operation.
        ///
        /// An `fstatat` followed by `renameat` is a check-then-act race: two
        /// writers both observe an absent destination and both rename, so both
        /// report success and one payload is silently destroyed. macOS exposes
        /// `renameatx_np(RENAME_EXCL)`, which performs the existence test and
        /// the rename indivisibly; elsewhere the portable equivalent is
        /// `linkat`, which fails with `EEXIST` rather than clobbering, followed
        /// by unlinking our own staging name.
        ///
        /// Returns `Ok(false)` when the destination already existed.
        #[cfg(target_os = "macos")]
        pub fn promote_exclusive(&self, from: &[u8], to: &[u8]) -> io::Result<bool> {
            let from_c = cstr(from)?;
            let to_c = cstr(to)?;
            let rc = unsafe {
                libc::renameatx_np(
                    self.0.as_raw_fd(),
                    from_c.as_ptr(),
                    self.0.as_raw_fd(),
                    to_c.as_ptr(),
                    libc::RENAME_EXCL,
                )
            };
            if rc < 0 {
                let err = io::Error::last_os_error();
                if err.raw_os_error() == Some(libc::EEXIST) {
                    return Ok(false);
                }
                return Err(err);
            }
            Ok(true)
        }

        #[cfg(not(target_os = "macos"))]
        pub fn promote_exclusive(&self, from: &[u8], to: &[u8]) -> io::Result<bool> {
            let from_c = cstr(from)?;
            let to_c = cstr(to)?;
            let rc = unsafe {
                libc::linkat(
                    self.0.as_raw_fd(),
                    from_c.as_ptr(),
                    self.0.as_raw_fd(),
                    to_c.as_ptr(),
                    0,
                )
            };
            if rc < 0 {
                let err = io::Error::last_os_error();
                if err.raw_os_error() == Some(libc::EEXIST) {
                    return Ok(false);
                }
                return Err(err);
            }
            // The destination now names the same inode; drop our staging name.
            self.unlink_child(from)?;
            Ok(true)
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

/// Exclusively creates this operation's private staging file, retrying on a
/// name collision with a fresh sequence value.
///
/// A single fixed name would wedge a destination permanently if a crash left a
/// stale artifact behind (PIDs are reused and the counter restarts at zero).
/// Only `AlreadyExists` is retried, and no artifact this operation did not
/// create is ever removed — stale-temp reclamation is deliberately not done
/// here.
#[cfg(unix)]
fn create_private_temp(dir: &confined::Dir) -> Result<(Vec<u8>, std::fs::File), String> {
    create_private_temp_with(dir, temp_name)
}

/// `create_private_temp` with the name sequence injected, so the retry and
/// exhaustion behaviour can be tested deterministically instead of racing the
/// process-global counter.
#[cfg(unix)]
fn create_private_temp_with<F>(
    dir: &confined::Dir,
    mut next_name: F,
) -> Result<(Vec<u8>, std::fs::File), String>
where
    F: FnMut() -> Vec<u8>,
{
    let mut last: Option<std::io::Error> = None;
    for _ in 0..TEMP_ATTEMPTS {
        let name = next_name();
        match dir.create_new_child(&name) {
            Ok(file) => return Ok((name, file)),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => last = Some(err),
            Err(err) => return Err(format!("durable-write-temp-create-failed:{err}")),
        }
    }
    Err(format!(
        "durable-write-temp-name-exhausted:{}",
        last.map(|e| e.to_string())
            .unwrap_or_else(|| "collision".to_string())
    ))
}

/// Durably CREATES `relative` beneath `root`. Never replaces.
///
/// This is the only write surface reachable from the renderer, and it is
/// create-only: an existing destination is refused with
/// `durable-write-destination-exists`. Replacement authority lives solely in
/// `cas_repair_write_within_root`, which derives its own destination.
#[cfg(unix)]
pub fn durable_write_within_root(
    root: &Path,
    relative: &str,
    bytes: &[u8],
) -> Result<DurableWriteResult, String> {
    durable_write_impl(root, relative, bytes, ExistingPolicy::Fail)
}

/// Durably writes `bytes` to `relative` beneath `root` under `existing`.
///
/// Domain refusals (traversal, symlink, destination-exists) come back as
/// `Ok(result)` with `ok: false` and a blocker code; only infrastructure
/// faults return `Err`. Any failure up to and including the promotion leaves
/// the canonical destination exactly as it was, and removes only this
/// operation's own temp artifact.
///
/// After a successful promotion the destination HAS changed, so a failing
/// parent-directory sync does not become an error: it returns
/// `committed: true, durability_complete: false` with the detail attached, so
/// the caller can never read it as "nothing happened".
#[cfg(unix)]
fn durable_write_impl(
    root: &Path,
    relative: &str,
    bytes: &[u8],
    existing: ExistingPolicy,
) -> Result<DurableWriteResult, String> {
    durable_write_impl_with(root, relative, bytes, existing, |dir| dir.sync())
}

/// `durable_write_impl` with the post-promotion directory sync injected.
///
/// The seam exists so the committed-but-unfenced branch can be exercised by a
/// test; a real `fsync` on a directory descriptor cannot be made to fail on
/// demand. Production always passes the real sync.
#[cfg(unix)]
fn durable_write_impl_with<F>(
    root: &Path,
    relative: &str,
    bytes: &[u8],
    existing: ExistingPolicy,
    sync_dir: F,
) -> Result<DurableWriteResult, String>
where
    F: Fn(&confined::Dir) -> std::io::Result<()>,
{
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
    let (temp, mut handle) = create_private_temp(&dir)?;

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

    // Create-only promotion must be atomic: the earlier `stat_child_nofollow`
    // only narrows the window, it cannot close it. Two writers that both saw an
    // absent destination would both rename, both report success, and one
    // payload would be silently destroyed.
    match existing {
        ExistingPolicy::Fail => match dir.promote_exclusive(&temp, file_name) {
            Ok(true) => {}
            Ok(false) => {
                let _ = dir.unlink_child(&temp);
                return Ok(DurableWriteResult::blocked(
                    "durable-write-destination-exists",
                ));
            }
            Err(err) => {
                let _ = dir.unlink_child(&temp);
                return Err(format!("durable-write-promote-failed:{err}"));
            }
        },
        ExistingPolicy::Replace => {
            if let Err(err) = dir.rename_within(&temp, file_name) {
                let _ = dir.unlink_child(&temp);
                return Err(format!("durable-write-promote-failed:{err}"));
            }
        }
    }

    // Past this point the destination HAS changed. A sync failure is reported
    // as an incomplete-durability commit, never as "nothing happened".
    let mut result = DurableWriteResult {
        schema: DURABLE_WRITE_SCHEMA,
        ok: false,
        committed: true,
        durability_complete: false,
        replaced,
        byte_length: bytes.len() as u64,
        full_fsync,
        blockers: vec![],
        detail: None,
    };
    match sync_dir(&dir) {
        Ok(()) => {
            result.ok = true;
            result.durability_complete = true;
        }
        Err(err) => {
            result
                .blockers
                .push(DurableWriteBlocker::new("durable-write-parent-sync-failed"));
            result.detail = Some(err.to_string());
        }
    }
    Ok(result)
}

/// Non-Unix targets have no proven handle-safe traversal here, so the primitive
/// fails closed rather than degrading to the raceable pathname model.
#[cfg(not(unix))]
pub fn durable_write_within_root(
    _root: &Path,
    _relative: &str,
    _bytes: &[u8],
) -> Result<DurableWriteResult, String> {
    Ok(DurableWriteResult::blocked(
        "durable-write-unsupported-platform",
    ))
}

/// Lowercase hex SHA-256 of `bytes`.
fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let mut out = String::with_capacity(64);
    for byte in digest.iter() {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// Normalizes a caller-asserted content hash to bare lowercase hex.
///
/// Accepts `sha256-<64 hex>` or a bare `<64 hex>`, both lowercase-normalized.
/// Anything else is rejected — this value is never used to build a path, only
/// to refuse a mismatch.
fn normalize_expected_sha(input: &str) -> Option<String> {
    let trimmed = input.trim().to_ascii_lowercase();
    let hex = trimmed.strip_prefix("sha256-").unwrap_or(&trimmed);
    if hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        Some(hex.to_string())
    } else {
        None
    }
}

/// Reads at most `limit + 1` bytes from a child file, so a wrong object cannot
/// force an unbounded allocation. Returns `None` when the child is absent.
#[cfg(unix)]
fn read_child_bounded(
    dir: &confined::Dir,
    name: &[u8],
    limit: usize,
) -> Result<Option<Vec<u8>>, String> {
    use std::io::Read;

    let mut file = match dir.open_child_read_nofollow(name) {
        Ok(file) => file,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        // A symlink standing at the destination refuses O_NOFOLLOW with ELOOP.
        Err(err) => return Err(format!("cas-repair-existing-open-failed:{err}")),
    };
    let mut buf = Vec::with_capacity(limit.min(1 << 20) + 1);
    file.by_ref()
        .take(limit as u64 + 1)
        .read_to_end(&mut buf)
        .map_err(|err| format!("cas-repair-existing-read-failed:{err}"))?;
    Ok(Some(buf))
}

/// Repairs the content-addressed object for `bytes`.
///
/// THE CALLER SUPPLIES NO DESTINATION. This module hashes `bytes` itself and
/// derives `assets/<aa>/sha256-<hex>` from its own digest, so a caller cannot
/// redirect the write to another hash, another shard, a package member, a
/// manifest, a snapshot, or any other archive path. `expected_sha256`, when
/// present, can only cause a refusal.
///
/// Replacement happens only when an object is already standing at that exact
/// derived path AND is proven not to be the content its own name claims.
#[cfg(unix)]
pub fn cas_repair_write_within_root(
    root: &Path,
    bytes: &[u8],
    expected_sha256: Option<&str>,
) -> Result<CasRepairResult, String> {
    use confined::Dir;

    let hex = sha256_hex(bytes);

    if let Some(asserted) = expected_sha256 {
        match normalize_expected_sha(asserted) {
            None => {
                return Ok(CasRepairResult::blocked(
                    "cas-repair-expected-sha-malformed",
                ))
            }
            // The bytes are the authority; a mismatching assertion is refused
            // rather than honoured.
            Some(normalized) if normalized != hex => {
                return Ok(CasRepairResult::blocked("cas-repair-expected-sha-mismatch"))
            }
            Some(_) => {}
        }
    }

    let shard = &hex[0..2];
    let basename = format!("sha256-{hex}");
    let relative = format!("{CAS_DIR}/{shard}/{basename}");
    let mut result = CasRepairResult::skeleton(basename.clone(), relative.clone());

    // Walk to the shard directory through admitted descriptors only.
    let mut dir =
        Dir::open_root(root).map_err(|err| format!("cas-repair-root-open-failed:{err}"))?;
    for name in [CAS_DIR.as_bytes(), shard.as_bytes()] {
        dir.mkdir_child(name)
            .map_err(|err| format!("cas-repair-shard-create-failed:{err}"))?;
        dir = match dir.open_child_nofollow(name) {
            Ok(next) => next,
            Err(err) => {
                return match err.raw_os_error() {
                    Some(libc::ELOOP) | Some(libc::ENOTDIR) => {
                        Ok(CasRepairResult::blocked("cas-repair-shard-symlink"))
                    }
                    _ => Err(format!("cas-repair-shard-open-failed:{err}")),
                }
            }
        };
    }

    let basename_bytes = basename.as_bytes();
    match read_child_bounded(&dir, basename_bytes, bytes.len())? {
        None => {
            // Nothing to repair. Create it, but never silently "repair" an
            // absent object into existence without saying so.
            let write = durable_write_impl(root, &relative, bytes, ExistingPolicy::Fail)?;
            result.committed = write.committed;
            result.durability_complete = write.durability_complete;
            result.byte_length = write.byte_length;
            result.full_fsync = write.full_fsync;
            result.blockers = write.blockers;
            result.detail = write.detail;
            result.ok = write.ok;
            return Ok(result);
        }
        Some(existing) if existing.len() == bytes.len() && sha256_hex(&existing) == hex => {
            // The canonical object is already exactly right; touch nothing.
            result.ok = true;
            result.already_valid = true;
            result.byte_length = bytes.len() as u64;
            return Ok(result);
        }
        Some(_) => {}
    }

    // Proven mismatching: supersede it with the bytes this module hashed.
    let write = durable_write_impl(root, &relative, bytes, ExistingPolicy::Replace)?;
    result.committed = write.committed;
    result.durability_complete = write.durability_complete;
    result.repaired = write.committed;
    result.byte_length = write.byte_length;
    result.full_fsync = write.full_fsync;
    result.blockers = write.blockers;
    result.detail = write.detail;
    result.ok = write.ok;
    Ok(result)
}

#[cfg(not(unix))]
pub fn cas_repair_write_within_root(
    _root: &Path,
    _bytes: &[u8],
    _expected_sha256: Option<&str>,
) -> Result<CasRepairResult, String> {
    Ok(CasRepairResult::blocked(
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

/// Extracts the raw invoke body as bytes, mirroring `plugin:fs|write_file`'s
/// marshaling so a multi-megabyte asset is not expanded into a JSON number
/// array.
fn body_bytes(request: &tauri::ipc::Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(data) => Ok(data.clone()),
        tauri::ipc::InvokeBody::Json(serde_json::Value::Array(data)) => data
            .iter()
            .map(|value| {
                value
                    .as_u64()
                    .filter(|byte| *byte <= u8::MAX as u64)
                    .map(|byte| byte as u8)
                    .ok_or_else(|| "durable-write-body-not-bytes".to_string())
            })
            .collect::<Result<Vec<u8>, String>>(),
        _ => Err("durable-write-body-unexpected".to_string()),
    }
}

/// Reads and parses the percent-encoded JSON `options` request header.
fn parse_options_header<T: serde::de::DeserializeOwned>(raw: &[u8]) -> Result<T, String> {
    let decoded = percent_encoding::percent_decode(raw)
        .decode_utf8()
        .map_err(|_| "durable-write-options-not-utf8".to_string())?;
    serde_json::from_str(&decoded).map_err(|err| format!("durable-write-options-invalid:{err}"))
}

/// Required `options` header.
fn required_options<T: serde::de::DeserializeOwned>(
    request: &tauri::ipc::Request<'_>,
) -> Result<T, String> {
    let raw = request
        .headers()
        .get("options")
        .ok_or_else(|| "durable-write-options-missing".to_string())?;
    parse_options_header(raw.as_ref())
}

/// Optional `options` header; an absent header yields the default.
fn optional_options<T: serde::de::DeserializeOwned + Default>(
    request: &tauri::ipc::Request<'_>,
) -> Result<T, String> {
    match request.headers().get("options") {
        Some(raw) => parse_options_header(raw.as_ref()),
        None => Ok(T::default()),
    }
}

/// Durable archive write. CREATE-ONLY.
///
/// There is deliberately no way for a caller to request replacement of an
/// existing archive member here; an occupied destination is refused.
#[tauri::command]
pub async fn h2o_archive_durable_write(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<DurableWriteResult, String> {
    let options: DurableWriteOptions = required_options(&request)?;
    let bytes = body_bytes(&request)?;
    let root = archive_root(&app)?;
    durable_write_within_root(&root, &options.path, &bytes)
}

/// Content-addressed repair write.
///
/// Takes BYTES ONLY. The destination is derived inside this command from the
/// SHA-256 this command computes over those bytes, so the renderer has no way
/// to name, redirect or influence which file is written. The optional
/// `expectedSha256` header is a caller assertion that can only cause a refusal.
#[tauri::command]
pub async fn h2o_archive_cas_repair_write(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<CasRepairResult, String> {
    let options: CasRepairOptions = optional_options(&request)?;
    let bytes = body_bytes(&request)?;
    let root = archive_root(&app)?;
    cas_repair_write_within_root(&root, &bytes, options.expected_sha256.as_deref())
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

    fn blocker_codes<T: AsRef<[DurableWriteBlocker]>>(blockers: T) -> Vec<String> {
        blockers.as_ref().iter().map(|b| b.code.clone()).collect()
    }

    fn sha_hex(bytes: &[u8]) -> String {
        sha256_hex(bytes)
    }

    fn cas_relative(bytes: &[u8]) -> String {
        let hex = sha_hex(bytes);
        format!("{CAS_DIR}/{}/sha256-{hex}", &hex[0..2])
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

    // ── Create-only durable write ──────────────────────────────────────────

    #[test]
    fn writes_exact_bytes_and_leaves_no_temp_artifact() {
        let (base, root) = scratch_root("happy");
        let result =
            durable_write_within_root(&root, "assets/aa/sha256-abc", b"hello").expect("write");

        assert!(result.ok);
        assert!(result.committed);
        assert!(result.durability_complete);
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
            let result = durable_write_within_root(&root, relative, b"x").expect("call");
            assert!(!result.ok, "{relative} must be refused");
            assert!(!result.committed, "{relative} must not commit");
            assert_eq!(
                blocker_codes(&result.blockers),
                vec![expected.to_string()],
                "{relative}"
            );
        }

        let absolute = root.join("absolute.bin");
        let result =
            durable_write_within_root(&root, absolute.to_str().unwrap(), b"x").expect("call");
        assert!(!result.ok);
        assert_eq!(
            blocker_codes(&result.blockers),
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
            durable_write_within_root(&root, "../outside-witness.txt", b"x").expect("call");

        assert!(!result.ok);
        assert!(
            !witness.exists(),
            "traversal must not create a file outside the root"
        );
        let _ = fs::remove_dir_all(&base);
    }

    /// The generic write surface is create-only. There is no caller-reachable
    /// replacement authority at all.
    #[test]
    fn an_existing_destination_is_always_refused_and_never_replaced() {
        let (base, root) = scratch_root("create-only");
        durable_write_within_root(&root, "assets/aa/blob", b"first").expect("seed");

        let refused = durable_write_within_root(&root, "assets/aa/blob", b"second").expect("call");
        assert!(!refused.ok);
        assert!(!refused.committed, "a refusal must not commit");
        assert_eq!(
            blocker_codes(&refused.blockers),
            vec!["durable-write-destination-exists".to_string()]
        );
        assert_eq!(fs::read(root.join("assets/aa/blob")).unwrap(), b"first");
        assert!(temp_artifacts(&root).is_empty());
        let _ = fs::remove_dir_all(&base);
    }

    /// A renderer cannot smuggle replacement in through the options header:
    /// the deserialized options type has no such field, so an `existing` key is
    /// simply not part of the contract and the write stays create-only.
    #[test]
    fn the_write_options_contract_exposes_no_replacement_field() {
        let parsed: DurableWriteOptions =
            serde_json::from_str(r#"{"path":"assets/aa/x","existing":"replace"}"#)
                .expect("options parse");
        assert_eq!(parsed.path, "assets/aa/x");

        // Proof by construction: the only public entry point takes no policy.
        let (base, root) = scratch_root("no-replace-field");
        durable_write_within_root(&root, &parsed.path, b"first").expect("seed");
        let second = durable_write_within_root(&root, &parsed.path, b"second").expect("call");
        assert!(!second.ok, "an `existing` key must not enable replacement");
        assert_eq!(fs::read(root.join("assets/aa/x")).unwrap(), b"first");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_a_persistent_symlinked_ancestor_and_a_symlinked_destination() {
        let (base, root) = scratch_root("symlink");
        let outside = base.join("outside");
        fs::create_dir_all(&outside).expect("outside dir");
        let victim = outside.join("victim.txt");
        fs::write(&victim, b"original").expect("victim");

        fs::create_dir_all(root.join("assets")).expect("assets");
        std::os::unix::fs::symlink(&victim, root.join("assets/linked")).expect("file symlink");
        let result = durable_write_within_root(&root, "assets/linked", b"pwned").expect("call");
        assert!(!result.ok);
        assert_eq!(
            blocker_codes(&result.blockers),
            vec!["durable-write-destination-symlink".to_string()]
        );
        assert_eq!(fs::read(&victim).unwrap(), b"original");

        std::os::unix::fs::symlink(&outside, root.join("hop")).expect("dir symlink");
        let via_dir = durable_write_within_root(&root, "hop/planted.txt", b"pwned").expect("call");
        assert!(!via_dir.ok);
        assert_eq!(
            blocker_codes(&via_dir.blockers),
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
        std::os::unix::fs::symlink(&outside, base.join(ARCHIVE_ROOT)).expect("root symlink");

        let root = base.join(ARCHIVE_ROOT);
        let result = durable_write_within_root(&root, "assets/aa/blob", b"x");

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
        let result = durable_write_within_root(&root, "assets/aa/blob", b"x").expect("call");
        assert!(!result.ok);
        assert_eq!(
            blocker_codes(&result.blockers),
            vec!["durable-write-destination-not-regular-file".to_string()]
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn a_failed_staging_write_leaves_the_canonical_destination_intact() {
        use std::os::unix::fs::PermissionsExt;

        let (base, root) = scratch_root("stage-fail");
        durable_write_within_root(&root, "assets/aa/blob", b"canonical").expect("seed");

        let parent = root.join("assets/aa");
        let original = fs::metadata(&parent).unwrap().permissions();
        let mut locked = original.clone();
        locked.set_mode(0o500);
        fs::set_permissions(&parent, locked).expect("lock");

        // Repair is the only replacement path, so drive the failure through it.
        let result = cas_repair_write_within_root(&root, b"canonical", None);

        fs::set_permissions(&parent, original).expect("unlock");

        assert!(result.is_ok(), "an already-valid object needs no write");
        assert_eq!(fs::read(root.join("assets/aa/blob")).unwrap(), b"canonical");
        assert!(temp_artifacts(&root).is_empty());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn zero_byte_writes_are_permitted_and_durable() {
        let (base, root) = scratch_root("empty");
        let result = durable_write_within_root(&root, "assets/aa/empty", b"").expect("write");
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
        let result = durable_write_within_root(&root, "assets/aa/sync", b"bytes").expect("write");
        assert!(result.ok);
        assert!(
            result.durability_complete,
            "the parent directory must be synced"
        );
        if cfg!(target_os = "macos") {
            assert!(
                result.full_fsync,
                "macOS write should establish the F_FULLFSYNC guarantee"
            );
        }
        let _ = fs::remove_dir_all(&base);
    }

    // ── Post-commit durability honesty (Y2) ────────────────────────────────

    /// A directory sync that fails AFTER the rename must not be reported as
    /// "nothing happened": the bytes really are in place.
    #[test]
    fn a_post_promotion_sync_failure_reports_committed_but_not_durable() {
        let (base, root) = scratch_root("post-sync-fail");
        let result = durable_write_impl_with(
            &root,
            "assets/aa/blob",
            b"committed",
            ExistingPolicy::Fail,
            |_| Err(std::io::Error::other("simulated directory sync failure")),
        )
        .expect("must not surface as Err");

        assert!(result.committed, "the rename succeeded, so it is committed");
        assert!(!result.durability_complete);
        assert!(!result.ok, "ok requires full durability");
        assert_eq!(
            blocker_codes(&result.blockers),
            vec!["durable-write-parent-sync-failed".to_string()]
        );
        assert!(result.detail.is_some(), "the cause must be reported");
        // The bytes are genuinely on disk — this is why Err would have lied.
        assert_eq!(fs::read(root.join("assets/aa/blob")).unwrap(), b"committed");
        let _ = fs::remove_dir_all(&base);
    }

    // ── Private temp handling (Y3) ─────────────────────────────────────────

    /// Deterministic name sequence, so these tests do not race the
    /// process-global counter against tests running in parallel.
    fn fixed_names(tag: &str, count: u32) -> Vec<String> {
        (0..count)
            .map(|i| format!("{TEMP_PREFIX}{tag}-{i}{TEMP_SUFFIX}"))
            .collect()
    }

    #[test]
    fn a_colliding_private_temp_name_is_retried_and_the_foreign_artifact_is_kept() {
        let (base, root) = scratch_root("temp-collision");
        let shard = root.join(CAS_DIR).join("aa");
        fs::create_dir_all(&shard).expect("shard");

        let names = fixed_names("collide", 2);
        // Occupy the first name the sequence will offer.
        let planted = shard.join(&names[0]);
        fs::write(&planted, b"stale").expect("plant");

        let dir = confined::Dir::open_root(&root).expect("root");
        let shard_dir = dir
            .open_child_nofollow(CAS_DIR.as_bytes())
            .expect("assets")
            .open_child_nofollow(b"aa")
            .expect("aa");

        let mut it = names.iter();
        let (used, _file) =
            create_private_temp_with(&shard_dir, || it.next().unwrap().as_bytes().to_vec())
                .expect("collision must be retried, not fatal");

        assert_eq!(
            String::from_utf8(used).unwrap(),
            names[1],
            "the retry must advance to a fresh name"
        );
        assert!(
            planted.exists(),
            "a temp artifact this operation did not create must never be removed"
        );
        assert_eq!(fs::read(&planted).unwrap(), b"stale");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn exhausting_the_bounded_temp_retries_fails_cleanly() {
        let (base, root) = scratch_root("temp-exhausted");
        let shard = root.join(CAS_DIR).join("aa");
        fs::create_dir_all(&shard).expect("shard");

        // Occupy every name the bounded retry will try.
        let names = fixed_names("exhaust", TEMP_ATTEMPTS);
        for name in &names {
            fs::write(shard.join(name), b"stale").expect("plant");
        }

        let dir = confined::Dir::open_root(&root).expect("root");
        let shard_dir = dir
            .open_child_nofollow(CAS_DIR.as_bytes())
            .expect("assets")
            .open_child_nofollow(b"aa")
            .expect("aa");

        let mut it = names.iter();
        let result = create_private_temp_with(&shard_dir, || {
            it.next()
                .map(|n| n.as_bytes().to_vec())
                .unwrap_or_else(|| b"overflow".to_vec())
        });

        let err = result.expect_err("exhaustion must surface");
        assert!(
            err.starts_with("durable-write-temp-name-exhausted:"),
            "unexpected error: {err}"
        );
        for name in &names {
            assert!(
                shard.join(name).exists(),
                "foreign temp artifacts must survive"
            );
        }
        let _ = fs::remove_dir_all(&base);
    }

    // ── CAS repair authority (Y4) ──────────────────────────────────────────

    #[test]
    fn cas_repair_derives_its_own_destination_from_the_bytes_it_hashed() {
        let (base, root) = scratch_root("cas-derive");
        let bytes = b"authentic asset bytes";
        let expected = cas_relative(bytes);

        let result = cas_repair_write_within_root(&root, bytes, None).expect("repair");
        assert!(result.ok);
        assert_eq!(result.path, expected, "destination must be hash-derived");
        assert_eq!(result.sha256, format!("sha256-{}", sha_hex(bytes)));
        assert_eq!(fs::read(root.join(&expected)).unwrap(), bytes);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn cas_repair_replaces_only_a_proven_mismatching_object() {
        let (base, root) = scratch_root("cas-repair");
        let bytes = b"authentic asset bytes";
        let relative = cas_relative(bytes);
        fs::create_dir_all(root.join(&relative).parent().unwrap()).expect("shard");

        // Corrupt object standing at the canonical path.
        fs::write(root.join(&relative), b"planted garbage").expect("corrupt");
        let repaired = cas_repair_write_within_root(&root, bytes, None).expect("repair");
        assert!(repaired.ok);
        assert!(repaired.repaired, "a mismatching object must be repaired");
        assert!(!repaired.already_valid);
        assert_eq!(fs::read(root.join(&relative)).unwrap(), bytes);

        // A correct object is left completely alone.
        let again = cas_repair_write_within_root(&root, bytes, None).expect("repair");
        assert!(again.ok);
        assert!(again.already_valid, "a valid object must not be rewritten");
        assert!(!again.repaired);
        assert!(
            !again.committed,
            "nothing may be committed for a valid object"
        );
        let _ = fs::remove_dir_all(&base);
    }

    /// Create-only must be atomic, not check-then-act. Two writers racing for
    /// the same absent destination must not both commit: exactly one wins and
    /// the loser is refused, so no committed payload is ever silently
    /// destroyed. A single-threaded existence test cannot prove this.
    #[test]
    fn concurrent_create_only_writers_cannot_both_commit() {
        use std::sync::{Arc, Barrier};

        let (base, root) = scratch_root("create-only-race");
        let mut both_committed = 0u32;
        let mut refusals = 0u32;

        for round in 0..300u32 {
            let relative = format!("assets/aa/contended-{round}");
            let barrier = Arc::new(Barrier::new(2));
            let handles: Vec<_> = [b"payload-a".as_slice(), b"payload-b".as_slice()]
                .into_iter()
                .map(|payload| {
                    let barrier = Arc::clone(&barrier);
                    let root = root.clone();
                    let relative = relative.clone();
                    let payload = payload.to_vec();
                    std::thread::spawn(move || {
                        barrier.wait();
                        durable_write_within_root(&root, &relative, &payload)
                    })
                })
                .collect();

            let results: Vec<_> = handles
                .into_iter()
                .map(|h| h.join().expect("writer thread"))
                .collect();
            let committed = results
                .iter()
                .filter(|r| matches!(r, Ok(result) if result.committed))
                .count();
            let refused = results
                .iter()
                .filter(|r| {
                    matches!(r, Ok(result)
                        if !result.committed
                            && blocker_codes(&result.blockers)
                                .contains(&"durable-write-destination-exists".to_string()))
                })
                .count();
            if committed > 1 {
                both_committed += 1;
            }
            refusals += refused as u32;

            // Whoever won, the destination holds one intact payload.
            let landed = fs::read(root.join(&relative)).expect("destination exists");
            assert!(
                landed == b"payload-a" || landed == b"payload-b",
                "destination must hold exactly one writer's payload"
            );
        }

        assert_eq!(
            both_committed, 0,
            "two writers must never both commit to the same create-only destination"
        );
        assert!(
            refusals > 0,
            "the race was never actually contended; the test proved nothing"
        );
        assert!(
            temp_artifacts(&root).is_empty(),
            "no staging litter may remain"
        );
        let _ = fs::remove_dir_all(&base);
    }

    /// A truncated object is shorter than the expected bytes; the bounded read
    /// must still classify it as mismatching rather than accepting it.
    #[test]
    fn cas_repair_rejects_a_truncated_object() {
        let (base, root) = scratch_root("cas-truncated");
        let bytes = b"a longer authentic payload";
        let relative = cas_relative(bytes);
        fs::create_dir_all(root.join(&relative).parent().unwrap()).expect("shard");
        fs::write(root.join(&relative), b"a lo").expect("truncate");

        let result = cas_repair_write_within_root(&root, bytes, None).expect("repair");
        assert!(result.repaired);
        assert_eq!(fs::read(root.join(&relative)).unwrap(), bytes);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn cas_repair_refuses_an_expected_hash_that_does_not_match_the_bytes() {
        let (base, root) = scratch_root("cas-hash-mismatch");
        let bytes = b"authentic";
        let other = sha_hex(b"something else entirely");

        let mismatched =
            cas_repair_write_within_root(&root, bytes, Some(&format!("sha256-{other}")))
                .expect("call");
        assert!(!mismatched.ok);
        assert_eq!(
            blocker_codes(&mismatched.blockers),
            vec!["cas-repair-expected-sha-mismatch".to_string()]
        );
        // Critically: nothing was written anywhere, least of all at the hash
        // the caller named.
        assert!(!root.join(cas_relative(bytes)).exists());
        assert!(!root
            .join(format!("{CAS_DIR}/{}/sha256-{other}", &other[0..2]))
            .exists());

        for malformed in ["", "sha256-", "notahash", "sha256-XYZ", &"a".repeat(63)] {
            let result = cas_repair_write_within_root(&root, bytes, Some(malformed)).expect("call");
            assert!(!result.ok, "{malformed} must be refused");
            assert_eq!(
                blocker_codes(&result.blockers),
                vec!["cas-repair-expected-sha-malformed".to_string()],
                "{malformed}"
            );
        }
        let _ = fs::remove_dir_all(&base);
    }

    /// The caller has no destination argument at all, so a correct assertion
    /// changes nothing about where the object lands.
    #[test]
    fn cas_repair_cannot_be_redirected_to_another_object_shard_or_archive_path() {
        let (base, root) = scratch_root("cas-redirect");
        let bytes = b"the only bytes that matter";
        let hex = sha_hex(bytes);
        let canonical = cas_relative(bytes);

        // Seed unrelated archive state that must remain untouched.
        let pkg = "packages/chat-1.h2ochat";
        durable_write_within_root(&root, &format!("{pkg}/manifest.json"), b"{\"real\":true}")
            .expect("manifest");
        durable_write_within_root(&root, &format!("{pkg}/snapshot.json"), b"{\"snap\":1}")
            .expect("snapshot");
        durable_write_within_root(&root, &format!("{pkg}/assets/sha256-x.png"), b"pkgasset")
            .expect("pkg asset");
        let decoy = b"decoy object";
        let decoy_rel = cas_relative(decoy);
        durable_write_within_root(&root, &decoy_rel, decoy).expect("decoy");

        // Every accepted call lands on the derived path and nowhere else.
        let with_assert = cas_repair_write_within_root(&root, bytes, Some(&hex)).expect("repair");
        assert!(with_assert.ok);
        assert_eq!(with_assert.path, canonical);

        // Unrelated archive state is byte-identical.
        assert_eq!(
            fs::read(root.join(format!("{pkg}/manifest.json"))).unwrap(),
            b"{\"real\":true}"
        );
        assert_eq!(
            fs::read(root.join(format!("{pkg}/snapshot.json"))).unwrap(),
            b"{\"snap\":1}"
        );
        assert_eq!(
            fs::read(root.join(format!("{pkg}/assets/sha256-x.png"))).unwrap(),
            b"pkgasset"
        );
        assert_eq!(fs::read(root.join(&decoy_rel)).unwrap(), decoy);

        // Only the canonical shard was touched under assets/.
        let shard = format!("{CAS_DIR}/{}", &hex[0..2]);
        assert!(root.join(&shard).is_dir());
        let _ = fs::remove_dir_all(&base);
    }

    /// The options contract carries no destination of any kind; an attempt to
    /// smuggle one in is simply not part of the type.
    #[test]
    fn the_cas_repair_options_contract_exposes_no_destination() {
        let parsed: CasRepairOptions = serde_json::from_str(
            r#"{"expectedSha256":"sha256-aa","path":"packages/x/manifest.json","shard":"zz"}"#,
        )
        .expect("options parse");
        assert_eq!(parsed.expected_sha256.as_deref(), Some("sha256-aa"));

        // An empty header is valid: bytes alone are sufficient.
        let empty: CasRepairOptions = serde_json::from_str("{}").expect("empty options");
        assert!(empty.expected_sha256.is_none());
    }

    #[test]
    fn cas_repair_refuses_a_symlinked_shard() {
        let (base, root) = scratch_root("cas-shard-symlink");
        let outside = base.join("outside");
        fs::create_dir_all(&outside).expect("outside");
        let bytes = b"shard symlink probe";
        let hex = sha_hex(bytes);

        fs::create_dir_all(root.join(CAS_DIR)).expect("assets");
        std::os::unix::fs::symlink(&outside, root.join(format!("{CAS_DIR}/{}", &hex[0..2])))
            .expect("shard symlink");

        let result = cas_repair_write_within_root(&root, bytes, None).expect("call");
        assert!(!result.ok);
        assert_eq!(
            blocker_codes(&result.blockers),
            vec!["cas-repair-shard-symlink".to_string()]
        );
        assert!(
            fs::read_dir(&outside).unwrap().next().is_none(),
            "nothing may be written through the link"
        );
        let _ = fs::remove_dir_all(&base);
    }

    /// Whichever writer wins, the canonical object is verified rather than
    /// assumed — a valid winner dedupes, a corrupt winner is repaired.
    #[test]
    fn cas_repair_verifies_the_winner_of_a_concurrent_write() {
        let (base, root) = scratch_root("cas-race");
        let bytes = b"contended object";
        let relative = cas_relative(bytes);
        fs::create_dir_all(root.join(&relative).parent().unwrap()).expect("shard");

        // Valid winner already in place.
        fs::write(root.join(&relative), bytes).expect("winner");
        let valid = cas_repair_write_within_root(&root, bytes, None).expect("call");
        assert!(valid.already_valid);
        assert!(!valid.committed);

        // Corrupt winner in place.
        fs::write(root.join(&relative), b"corrupt winner").expect("bad winner");
        let corrupt = cas_repair_write_within_root(&root, bytes, None).expect("call");
        assert!(corrupt.repaired);
        assert_eq!(fs::read(root.join(&relative)).unwrap(), bytes);
        let _ = fs::remove_dir_all(&base);
    }

    // ── Race containment (T05) ─────────────────────────────────────────────

    /// The adversarial race the previous pathname design lost.
    ///
    /// An attacker thread continuously swaps an admitted ancestor directory for
    /// a symlink pointing outside the root while the writer loops. The test is
    /// only meaningful if the attacker actually mutated the path during the run,
    /// so successful swaps are counted and asserted — a passing run caused by an
    /// idle attacker thread is treated as a failure.
    #[test]
    fn concurrent_ancestor_swap_cannot_redirect_a_write_outside_the_root() {
        use std::sync::atomic::AtomicBool;
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
            match durable_write_within_root(&root, &rel, b"payload") {
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
