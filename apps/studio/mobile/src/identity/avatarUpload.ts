// Phase 5.0M — pure-function helper for uploading a profile avatar to the
// public `avatars` Supabase Storage bucket. Two-phase contract:
//   1. uploadAvatarFromLocalUri()  → resize/compress, upload, return path
//   2. caller invokes identity.setAvatarPath(path)  → records on profile
// Splitting the two means a failed upload never leaves a stale DB pointer,
// and a failed RPC never leaves a working image with no profile reference.
//
// SDK boundary: this file uses raw fetch against Storage REST. The
// @supabase/supabase-js client is owned exclusively by MobileSupabaseProvider
// (5.0B mobile-alignment validator).

import * as ImageManipulator from 'expo-image-manipulator';

import { getMobileSupabaseConfig } from './mobileConfig';

export const AVATAR_RESIZE_PX = 512;
export const AVATAR_JPEG_QUALITY = 0.8;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export interface UploadAvatarInput {
  uri: string;
  userId: string;
  accessToken: string;
  previousPath?: string | null;
}

export interface UploadAvatarResult {
  path: string;
}

export class AvatarUploadError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AvatarUploadError';
  }
}

function buildAvatarPath(userId: string): string {
  // Match the storage policy + table-check regex exactly:
  //   ^avatars/[uuid]/profile_[0-9]+\.jpg$
  // The regex requires lowercase hex; PostgreSQL's auth.uid()::text is
  // already canonical lowercase, but we lowercase here defensively so a
  // future codepath handing in an upper-case UUID never silently fails the
  // regex check on the server.
  const safeUserId = String(userId).toLowerCase();
  return `avatars/${safeUserId}/profile_${Date.now()}.jpg`;
}

export async function uploadAvatarFromLocalUri(input: UploadAvatarInput): Promise<UploadAvatarResult> {
  const config = getMobileSupabaseConfig();
  if (!config) {
    throw new AvatarUploadError('avatar/no-config', 'Supabase config is not available.');
  }
  if (!input.userId) {
    throw new AvatarUploadError('avatar/no-user', 'Missing user id for avatar path.');
  }
  if (!input.accessToken) {
    throw new AvatarUploadError('avatar/no-session', 'No active session.');
  }
  if (!input.uri) {
    throw new AvatarUploadError('avatar/no-uri', 'Missing local image URI.');
  }

  // 1. Resize + recompress to JPEG. Centered square, 512×512, q=0.8 — the
  //    output is typically 30–150 KB, well under the 2 MB bucket cap.
  const manipulated = await ImageManipulator.manipulateAsync(
    input.uri,
    [{ resize: { width: AVATAR_RESIZE_PX, height: AVATAR_RESIZE_PX } }],
    { compress: AVATAR_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );

  // 2. Read the resulting file as raw bytes. fetch() of a file:// URI returns
  //    an ArrayBuffer in modern React Native — usable directly as a fetch body.
  const fileResp = await fetch(manipulated.uri);
  const bytes = await fileResp.arrayBuffer();
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    throw new AvatarUploadError(
      'avatar/too-large',
      `Image is too large after compression (${Math.round(bytes.byteLength / 1024)} KB > ${Math.round(AVATAR_MAX_BYTES / 1024)} KB).`
    );
  }

  const path = buildAvatarPath(input.userId);
  const uploadUrl = `${config.url}/storage/v1/object/${path}`;

  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      apikey: config.anonKey,
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'max-age=3600',
      'x-upsert': 'false',
    },
    body: bytes,
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text().catch(() => '');
    throw new AvatarUploadError(
      'avatar/upload-failed',
      `Storage upload failed (${uploadResp.status}): ${text || uploadResp.statusText}`
    );
  }

  // 3. Best-effort delete of previous file. Failure is non-fatal — at worst
  //    the bucket retains an orphan; the new path is already live on the row.
  if (input.previousPath && input.previousPath !== path) {
    await deleteAvatarObject({ path: input.previousPath, accessToken: input.accessToken });
  }

  return { path };
}

export interface DeleteAvatarObjectInput {
  path: string;
  accessToken: string;
}

// Best-effort DELETE against /storage/v1/object/<path>. Used by
// uploadAvatarFromLocalUri (cleaning up the prior file after a replace) and
// by the Remove-avatar UI flow (cleaning up after the metadata pointer is
// nulled). Always resolves; never throws — caller treats orphaned files as
// non-fatal. Storage RLS limits the blast radius to the caller's own folder.
export async function deleteAvatarObject(input: DeleteAvatarObjectInput): Promise<void> {
  const config = getMobileSupabaseConfig();
  if (!config) return;
  if (!input.path || !input.accessToken) return;
  try {
    await fetch(`${config.url}/storage/v1/object/${input.path}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        apikey: config.anonKey,
      },
    });
  } catch {
    /* non-fatal */
  }
}

export function buildAvatarPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const config = getMobileSupabaseConfig();
  if (!config) return null;
  return `${config.url}/storage/v1/object/public/${path}`;
}
