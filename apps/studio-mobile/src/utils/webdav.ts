import type { WebDAVSyncSettingsInput } from '@/storage/sync-creds';

export const WEBDAV_ARCHIVE_FILE_NAME = 'h2o-archive.json';

const REQUEST_TIMEOUT_MS = 15_000;
const PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>';

export class WebDAVHttpError extends Error {
  status: number;
  url: string;
  body: string;

  constructor(message: string, status: number, url: string, body: string) {
    super(message);
    this.name = 'WebDAVHttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export interface WebDAVJsonResult {
  json: unknown;
  url: string;
  status: number;
}

export interface WebDAVWriteResult {
  url: string;
  status: number;
}

function validateSettings(settings: WebDAVSyncSettingsInput): void {
  if (!settings.serverUrl.trim()) throw new Error('WebDAV URL is required.');
  if (!/^https?:\/\//i.test(settings.serverUrl.trim())) {
    throw new Error('WebDAV URL must start with http:// or https://.');
  }
  if (!settings.username.trim()) throw new Error('WebDAV username is required.');
  if (!settings.password) throw new Error('WebDAV password is required.');
}

function base64EncodeUtf8(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];

  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }

    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    output += alphabet[a >> 2];
    output += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    output += b == null ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    output += c == null ? '=' : alphabet[c & 63];
  }
  return output;
}

function authHeader(settings: WebDAVSyncSettingsInput): string {
  return `Basic ${base64EncodeUtf8(`${settings.username}:${settings.password}`)}`;
}

function baseUrl(settings: WebDAVSyncSettingsInput): string {
  const url = new URL(settings.serverUrl.trim());
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}

function pathSegments(path: string | undefined): string[] {
  return String(path || '')
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)
    .map(encodeURIComponent);
}

export function buildWebDAVRemoteUrl(
  settings: WebDAVSyncSettingsInput,
  fileName: string,
  options: { cacheBust?: boolean } = {},
): string {
  validateSettings(settings);
  const segments = [...pathSegments(settings.rootPath), encodeURIComponent(fileName)];
  const url = `${baseUrl(settings)}/${segments.join('/')}`;
  if (!options.cacheBust) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}h2oCacheBust=${Date.now()}`;
}

export function buildWebDAVFolderUrl(settings: WebDAVSyncSettingsInput): string {
  validateSettings(settings);
  const segments = pathSegments(settings.rootPath);
  const suffix = segments.length ? `${segments.join('/')}/` : '';
  return `${baseUrl(settings)}/${suffix}`;
}

async function responseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('WebDAV request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function assertOk(response: Response, url: string, okStatuses: number[]): Promise<Response> {
  if (response.ok || okStatuses.includes(response.status)) return Promise.resolve(response);
  return responseBody(response).then(body => {
    throw new WebDAVHttpError(`WebDAV request failed with HTTP ${response.status}.`, response.status, url, body);
  });
}

export async function testWebDAVConnection(settings: WebDAVSyncSettingsInput): Promise<WebDAVWriteResult> {
  const url = buildWebDAVFolderUrl(settings);
  const response = await fetchWithTimeout(url, {
    method: 'PROPFIND',
    headers: {
      Authorization: authHeader(settings),
      Depth: '0',
      Accept: 'application/xml,text/xml,*/*',
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
    body: PROPFIND_BODY,
  });
  await assertOk(response, url, [207]);
  return { url, status: response.status };
}

export async function getWebDAVJson(
  settings: WebDAVSyncSettingsInput,
  fileName: string,
): Promise<WebDAVJsonResult> {
  const url = buildWebDAVRemoteUrl(settings, fileName);
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader(settings),
      Accept: 'application/json,text/plain,*/*',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  await assertOk(response, url, []);
  const text = await response.text();
  try {
    return { json: JSON.parse(text), url, status: response.status };
  } catch {
    throw new Error(`Remote ${fileName} is not valid JSON.`);
  }
}

export async function putWebDAVJson(
  settings: WebDAVSyncSettingsInput,
  fileName: string,
  jsonText: string,
): Promise<WebDAVWriteResult> {
  const url = buildWebDAVRemoteUrl(settings, fileName);
  const response = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(settings),
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json,text/plain,*/*',
      'Cache-Control': 'no-cache',
    },
    body: jsonText,
  });
  await assertOk(response, url, []);
  return { url, status: response.status };
}
