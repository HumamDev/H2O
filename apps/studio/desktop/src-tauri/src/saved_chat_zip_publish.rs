//! M08 — atomic create-only final publication for portable saved-chat ZIPs.
//!
//! The renderer may name only a governed staged/final LEAF pair. This module
//! resolves `$HOME/H2O Studio Exports` itself, opens that directory without
//! following its final component, proves the staged entry is a regular file,
//! and reuses the archive durable writer's descriptor-relative atomic
//! no-replace promotion primitive. It is not a general filesystem API.

use serde::Serialize;
use std::io;
use std::path::{Path, PathBuf};

const EXPORT_ROOT: &str = "H2O Studio Exports";
const FINAL_SUFFIX: &str = ".h2ochat.zip";
const TEMP_SUFFIX_PREFIX: &str = ".tmp-";
const RESULT_SCHEMA: &str = "h2o.savedChatZipPublish.v1";

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedChatZipPublishRequest {
    staged_name: String,
    final_name: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedChatZipPublishResult {
    schema: &'static str,
    ok: bool,
    status: &'static str,
    staging_removed: bool,
}

impl SavedChatZipPublishResult {
    fn published(staging_removed: bool) -> Self {
        Self {
            schema: RESULT_SCHEMA,
            ok: true,
            status: "published",
            staging_removed,
        }
    }

    fn refused(status: &'static str) -> Self {
        Self {
            schema: RESULT_SCHEMA,
            ok: false,
            status,
            staging_removed: false,
        }
    }
}

fn is_safe_ascii_leaf(name: &str) -> bool {
    if name.is_empty()
        || name != name.trim()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || Path::new(name).is_absolute()
    {
        return false;
    }
    let bytes = name.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return false;
    }
    bytes
        .iter()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(*byte, b'.' | b'_' | b'-' | b' '))
}

fn names_are_governed(staged_name: &str, final_name: &str) -> bool {
    if !is_safe_ascii_leaf(final_name) || !is_safe_ascii_leaf(staged_name) {
        return false;
    }
    let Some(final_stem) = final_name.strip_suffix(FINAL_SUFFIX) else {
        return false;
    };
    if final_stem.is_empty() {
        return false;
    }
    let prefix = format!("{final_name}{TEMP_SUFFIX_PREFIX}");
    let Some(token) = staged_name.strip_prefix(&prefix) else {
        return false;
    };
    !token.is_empty()
        && token
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte.is_ascii_lowercase())
}

fn staged_is_regular(stat: &libc::stat) -> bool {
    (stat.st_mode & libc::S_IFMT) == libc::S_IFREG
}

fn publish_within_root_with<F>(
    root: &Path,
    staged_name: &str,
    final_name: &str,
    promote: F,
) -> SavedChatZipPublishResult
where
    F: FnOnce(&crate::archive_durable_write::confined::Dir, &[u8], &[u8]) -> io::Result<bool>,
{
    if !names_are_governed(staged_name, final_name) {
        return SavedChatZipPublishResult::refused("invalid-name");
    }

    let dir = match crate::archive_durable_write::confined::Dir::open_existing_nofollow(root) {
        Ok(dir) => dir,
        Err(_) => return SavedChatZipPublishResult::refused("publish-failed"),
    };
    let staged = match dir.stat_child_nofollow(staged_name.as_bytes()) {
        Ok(Some(stat)) => stat,
        Ok(None) => return SavedChatZipPublishResult::refused("staged-missing"),
        Err(_) => return SavedChatZipPublishResult::refused("publish-failed"),
    };
    if !staged_is_regular(&staged) {
        return SavedChatZipPublishResult::refused("staged-not-regular");
    }

    match promote(&dir, staged_name.as_bytes(), final_name.as_bytes()) {
        Ok(false) => SavedChatZipPublishResult::refused("destination-exists"),
        Err(_) => SavedChatZipPublishResult::refused("publish-failed"),
        Ok(true) => {
            // macOS RENAME_EXCL removes the staged name atomically. The
            // portable linkat implementation also unlinks it best-effort. If
            // a future platform leaves the private name behind, try once more
            // without changing the already-committed publication result.
            let staging_removed = match dir.stat_child_nofollow(staged_name.as_bytes()) {
                Ok(None) => true,
                Ok(Some(_)) => {
                    let _ = dir.unlink_child(staged_name.as_bytes());
                    matches!(dir.stat_child_nofollow(staged_name.as_bytes()), Ok(None))
                }
                Err(_) => false,
            };
            SavedChatZipPublishResult::published(staging_removed)
        }
    }
}

pub fn publish_saved_chat_zip_within_root(
    root: &Path,
    staged_name: &str,
    final_name: &str,
) -> SavedChatZipPublishResult {
    publish_within_root_with(root, staged_name, final_name, |dir, from, to| {
        dir.promote_exclusive(from, to)
    })
}

fn export_root(app: &tauri::AppHandle) -> Result<PathBuf, &'static str> {
    use tauri::Manager;

    app.path()
        .home_dir()
        .map(|home| home.join(EXPORT_ROOT))
        .map_err(|_| "home-unavailable")
}

#[tauri::command]
pub fn h2o_publish_saved_chat_zip_create_only(
    app: tauri::AppHandle,
    request: SavedChatZipPublishRequest,
) -> SavedChatZipPublishResult {
    let root = match export_root(&app) {
        Ok(root) => root,
        Err(status) => return SavedChatZipPublishResult::refused(status),
    };
    publish_saved_chat_zip_within_root(&root, &request.staged_name, &request.final_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn scratch_root(name: &str) -> PathBuf {
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "h2o-saved-chat-zip-publish-{name}-{}-{counter}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("scratch root");
        root
    }

    fn names() -> (&'static str, &'static str) {
        (
            "round-trip.h2ochat.zip.tmp-abc123",
            "round-trip.h2ochat.zip",
        )
    }

    #[test]
    fn absent_destination_is_published_create_only_and_staging_is_removed() {
        let root = scratch_root("absent");
        let (staged, final_name) = names();
        fs::write(root.join(staged), b"verified-zip-bytes").expect("write staged");

        let result = publish_saved_chat_zip_within_root(&root, staged, final_name);

        assert_eq!(result.status, "published");
        assert!(result.ok);
        assert!(result.staging_removed);
        assert_eq!(
            fs::read(root.join(final_name)).unwrap(),
            b"verified-zip-bytes"
        );
        assert!(fs::metadata(root.join(final_name)).unwrap().is_file());
        assert!(!root.join(staged).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn existing_destination_is_never_replaced() {
        let root = scratch_root("occupied");
        let (staged, final_name) = names();
        fs::write(root.join(staged), b"staged-bytes").unwrap();
        fs::write(root.join(final_name), b"existing-bytes").unwrap();

        let result = publish_saved_chat_zip_within_root(&root, staged, final_name);

        assert_eq!(result.status, "destination-exists");
        assert!(!result.ok);
        assert_eq!(fs::read(root.join(final_name)).unwrap(), b"existing-bytes");
        assert_eq!(fs::read(root.join(staged)).unwrap(), b"staged-bytes");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn race_point_winner_survives_unchanged() {
        let root = scratch_root("race-winner");
        let (staged, final_name) = names();
        fs::write(root.join(staged), b"our-staged-bytes").unwrap();
        // Models a competing actor winning after the renderer's advisory
        // existence check and immediately before this native publication.
        fs::write(root.join(final_name), b"race-winner-bytes").unwrap();

        let result = publish_saved_chat_zip_within_root(&root, staged, final_name);

        assert_eq!(result.status, "destination-exists");
        assert_eq!(
            fs::read(root.join(final_name)).unwrap(),
            b"race-winner-bytes"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn path_confinement_rejects_unsafe_or_unrelated_names() {
        let root = scratch_root("confinement");
        for (staged, final_name) in [
            ("../x", "round-trip.h2ochat.zip"),
            ("a/b", "round-trip.h2ochat.zip"),
            ("a\\b", "round-trip.h2ochat.zip"),
            ("round-trip.h2ochat.zip.tmp-abc", "/absolute.h2ochat.zip"),
            ("round-trip.h2ochat.zip.tmp-abc", "round-trip.zip"),
            ("other.h2ochat.zip.tmp-abc", "round-trip.h2ochat.zip"),
            ("round-trip.h2ochat.zip.tmp-", "round-trip.h2ochat.zip"),
        ] {
            assert_eq!(
                publish_saved_chat_zip_within_root(&root, staged, final_name).status,
                "invalid-name",
                "unexpected admission: {staged} -> {final_name}"
            );
        }
        assert!(fs::read_dir(&root).unwrap().next().is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn non_collision_publication_error_fails_closed_without_fallback() {
        let root = scratch_root("fail-closed");
        let (staged, final_name) = names();
        fs::write(root.join(staged), b"staged-bytes").unwrap();
        let mut calls = 0;

        let result = publish_within_root_with(&root, staged, final_name, |_dir, _from, _to| {
            calls += 1;
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        });

        assert_eq!(
            calls, 1,
            "publication primitive must be attempted exactly once"
        );
        assert_eq!(result.status, "publish-failed");
        assert!(!result.ok);
        assert!(!root.join(final_name).exists());
        assert_eq!(fs::read(root.join(staged)).unwrap(), b"staged-bytes");
        let _ = fs::remove_dir_all(root);
    }
}
