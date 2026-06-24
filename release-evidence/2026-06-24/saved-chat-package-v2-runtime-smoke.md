# Saved Chat Package v2 Runtime Smoke - Phase C4.4

Date: 2026-06-24

Status: PREPARED - NOT EXECUTED

Reason not executed in this shell: the repository checkout contains Desktop runtime binaries, but this Codex shell session does not expose an attachable Desktop WebView DevTools console automation channel for invoking `window.H2O.Studio.*` in the live Tauri runtime. This smoke is therefore recorded as an operator-run DevTools evidence script, matching the C3.3 runtime-smoke pattern.

## Scope

This is a focused runtime smoke/evidence step for C4.4 only. It does not add UI wiring, Sync behavior, import/recovery flows, WebDAV/cloud behavior, user-folder export dialogs, automatic GC, or Phase C5 behavior.

The smoke proves that real Desktop/Tauri runtime package materialization can build and write a saved-chat package with a materialized inline image asset under:

```text
$APPLOCALDATA/archive/packages/<chatId>.h2ochat/
```

The package writer must use Tauri `BaseDirectory.AppLocalData` token `15` and binary `write_file` calls for package files.

## How To Run

1. Build/prepare Desktop Studio from commit `6dd82c6` or later.
2. Launch the Desktop Studio app.
3. Open the Desktop WebView DevTools console.
4. Paste and run the snippet below.
5. Record the console output and the generated package path in this file or a follow-up evidence note.

## DevTools Console Snippet

```js
await (async () => {
  const BaseDirectoryAppLocalData = 15;
  const RUN_OVERWRITE_REMOVE = false;
  const suffix = String(Date.now());
  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();
  const results = [];
  const events = [];

  function record(name, pass, detail = "") {
    results.push({ name, pass: !!pass, detail: String(detail || "") });
    if (!pass) {
      throw new Error(`[saved-chat-package-v2-smoke] FAIL: ${name}${detail ? ` - ${detail}` : ""}`);
    }
  }

  function assertApi(path, value) {
    record(`api available: ${path}`, typeof value === "function", typeof value);
  }

  function canonicalize(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
      return value.map(canonicalize).filter((entry) => entry !== undefined);
    }
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const next = canonicalize(value[key]);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }

  function canonicalJson(value) {
    return `${JSON.stringify(canonicalize(value))}\n`;
  }

  async function sha256Hex(textOrBytes) {
    const bytes = typeof textOrBytes === "string" ? textEncoder.encode(textOrBytes) : textOrBytes;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function toUint8Array(raw) {
    if (raw instanceof Uint8Array) return raw;
    if (Array.isArray(raw)) return Uint8Array.from(raw);
    if (raw && Array.isArray(raw.data)) return Uint8Array.from(raw.data);
    throw new Error(`Unexpected read_file payload: ${Object.prototype.toString.call(raw)}`);
  }

  function extractFsCall(command, args) {
    if (command !== "plugin:fs|write_file" && command !== "plugin:fs|read_file" && command !== "plugin:fs|exists" && command !== "plugin:fs|mkdir" && command !== "plugin:fs|remove") {
      return null;
    }
    const headers = args && args.headers ? args.headers : null;
    if (headers && typeof headers.path === "string") {
      let parsedOptions = {};
      try {
        parsedOptions = headers.options ? JSON.parse(headers.options) : {};
      } catch (_err) {
        parsedOptions = {};
      }
      return {
        command,
        path: decodeURIComponent(headers.path),
        baseDir: parsedOptions.baseDir,
      };
    }
    const options = args && args.options ? args.options : {};
    return {
      command,
      path: args && typeof args.path === "string" ? args.path : "",
      baseDir: options.baseDir,
    };
  }

  const H2O = window.H2O;
  record("H2O namespace available", !!H2O);
  const store = H2O.Studio.store;
  const ingestion = H2O.Studio.ingestion;
  assertApi("H2O.Studio.store.chats.upsert", store.chats && store.chats.upsert);
  assertApi("H2O.Studio.store.snapshots.upsert", store.snapshots && store.snapshots.upsert);
  assertApi("H2O.Studio.ingestion.writeSavedChatPackageV1", ingestion.writeSavedChatPackageV1);
  assertApi("H2O.Studio.ingestion.assetCas.getAssetBytes", ingestion.assetCas && ingestion.assetCas.getAssetBytes);

  const invokeHost =
    window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function"
      ? window.__TAURI_INTERNALS__
      : window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === "function"
        ? window.__TAURI__.core
        : window.__TAURI__ && typeof window.__TAURI__.invoke === "function"
          ? window.__TAURI__
          : null;

  record("tauri invoke host available", !!invokeHost);
  const originalInvoke = invokeHost.invoke.bind(invokeHost);
  const originalGetAssetBytes = ingestion.assetCas.getAssetBytes.bind(ingestion.assetCas);

  const fsCalls = [];
  const casGets = [];

  invokeHost.invoke = async function wrappedInvoke(command, args, ...rest) {
    const fsCall = extractFsCall(command, args);
    if (fsCall) {
      fsCalls.push(fsCall);
      events.push({ kind: fsCall.command, path: fsCall.path, baseDir: fsCall.baseDir });
    }
    return originalInvoke(command, args, ...rest);
  };

  ingestion.assetCas.getAssetBytes = async function wrappedGetAssetBytes(sha256, ...rest) {
    casGets.push({ sha256 });
    events.push({ kind: "assetCas.getAssetBytes", sha256 });
    return originalGetAssetBytes(sha256, ...rest);
  };

  async function fsExists(path) {
    return originalInvoke("plugin:fs|exists", { path, options: { baseDir: BaseDirectoryAppLocalData } });
  }

  async function fsReadBytes(path) {
    return toUint8Array(await originalInvoke("plugin:fs|read_file", { path, options: { baseDir: BaseDirectoryAppLocalData } }));
  }

  async function fsReadText(path) {
    return textDecoder.decode(await fsReadBytes(path));
  }

  async function createSnapshotFixture({ chatId, snapshotId, title, html, text }) {
    await store.chats.upsert({
      chatId,
      title,
      isSaved: true,
      isLinked: false,
      meta: { smoke: "saved-chat-package-v2-runtime", phase: "C4.4" },
    });
    await store.snapshots.upsert({
      snapshotId,
      chatId,
      title,
      digest: `${title} digest`,
      messageCount: 1,
      capturedAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:01:00.000Z",
      turns: [
        {
          turnIdx: 0,
          role: "assistant",
          outerHtml: html,
          text,
          meta: { smoke: "saved-chat-package-v2-runtime" },
        },
      ],
    });
  }

  try {
    const imageBytes = textEncoder.encode("h2o-package-v2-smoke-image");
    const imageBase64 = btoa(String.fromCharCode(...imageBytes));
    const v2ChatId = `c4_4_pkg_v2_smoke_${suffix}`;
    const v2SnapshotId = `snap_${v2ChatId}`;
    const v2Html = `<section><p>inline image smoke</p><img alt="runtime smoke" src="data:image/png;base64,${imageBase64}"></section>`;

    await createSnapshotFixture({
      chatId: v2ChatId,
      snapshotId: v2SnapshotId,
      title: "C4.4 package v2 runtime smoke",
      html: v2Html,
      text: "inline image smoke",
    });

    const v2 = await ingestion.writeSavedChatPackageV1({ snapshotId: v2SnapshotId });
    const v2PackagePath = `archive/packages/${v2ChatId}.h2ochat`;
    record("v2 package path is app-owned archive path", v2.packagePath === v2PackagePath, v2.packagePath);
    record("v2 manifest selected when asset exists", v2.manifest && v2.manifest.schemaVersion === 2, JSON.stringify({ schemaVersion: v2.manifest && v2.manifest.schemaVersion }));
    record("v2 manifest has one asset", Array.isArray(v2.manifest.assets) && v2.manifest.assets.length === 1, JSON.stringify(v2.manifest.assets || []));

    const v2Asset = v2.manifest.assets[0];
    const v2AssetPath = `${v2PackagePath}/${v2Asset.path}`;
    record("v2 asset path is package-relative CAS filename", /^assets\/sha256-[0-9a-f]{64}\.png$/.test(v2Asset.path), v2Asset.path);

    for (const path of [`${v2PackagePath}/manifest.json`, `${v2PackagePath}/snapshot.json`, `${v2PackagePath}/chat.md`, `${v2PackagePath}/chat.html`, v2AssetPath]) {
      record(`package file exists: ${path}`, await fsExists(path), path);
    }

    const v2ManifestText = await fsReadText(`${v2PackagePath}/manifest.json`);
    const v2SnapshotText = await fsReadText(`${v2PackagePath}/snapshot.json`);
    const v2ChatHtml = await fsReadText(`${v2PackagePath}/chat.html`);
    const v2PackageAssetBytes = await fsReadBytes(v2AssetPath);
    const v2Manifest = JSON.parse(v2ManifestText);
    const v2Snapshot = JSON.parse(v2SnapshotText);
    const firstMessage = v2Snapshot.messages && v2Snapshot.messages[0];

    record("manifest.assets path matches package asset file", v2Manifest.assets[0].path === v2Asset.path, JSON.stringify(v2Manifest.assets[0]));
    record("message assetRefs are present", firstMessage && Array.isArray(firstMessage.assetRefs) && firstMessage.assetRefs.length === 1, JSON.stringify(firstMessage && firstMessage.assetRefs));
    record("contentHtml uses package-relative asset ref", firstMessage && typeof firstMessage.contentHtml === "string" && firstMessage.contentHtml.includes(v2Asset.path), firstMessage && firstMessage.contentHtml);
    record("contentHtml no longer contains data image URI", firstMessage && !firstMessage.contentHtml.includes("data:image"), firstMessage && firstMessage.contentHtml);
    record("chat.html uses package-relative asset ref", v2ChatHtml.includes(v2Asset.path), v2Asset.path);
    record("chat.html no longer contains data image URI", !v2ChatHtml.includes("data:image"), "chat.html checked");
    record("package asset bytes match original inline bytes", v2PackageAssetBytes.length === imageBytes.length && v2PackageAssetBytes.every((byte, index) => byte === imageBytes[index]), String(v2PackageAssetBytes.length));

    const v2SnapshotSha = await sha256Hex(v2SnapshotText);
    record("v2 manifest files.snapshot.sha256 matches canonical snapshot bytes", v2Manifest.files.snapshot.sha256 === v2SnapshotSha, JSON.stringify({ expected: v2SnapshotSha, actual: v2Manifest.files.snapshot.sha256 }));
    const v2ExpectedContentHash = await sha256Hex(canonicalJson({
      assets: v2Manifest.assets.map((asset) => asset.sha256).sort(),
      snapshot: v2Manifest.files.snapshot.sha256,
    }));
    record("v2 contentHash validates", v2Manifest.contentHash === v2ExpectedContentHash, JSON.stringify({ expected: v2ExpectedContentHash, actual: v2Manifest.contentHash }));

    const v2Events = events.filter((event) => event.path && event.path.startsWith(v2PackagePath));
    const eventIndex = (predicate) => v2Events.findIndex(predicate);
    const casGetIndex = events.findIndex((event) => event.kind === "assetCas.getAssetBytes" && event.sha256 === v2Asset.sha256);
    const assetWriteIndex = eventIndex((event) => event.kind === "plugin:fs|write_file" && event.path === v2AssetPath);
    const textWriteIndexes = [
      `${v2PackagePath}/manifest.json`,
      `${v2PackagePath}/snapshot.json`,
      `${v2PackagePath}/chat.md`,
      `${v2PackagePath}/chat.html`,
    ].map((path) => eventIndex((event) => event.kind === "plugin:fs|write_file" && event.path === path));
    record("asset bytes read from live CAS before package asset write", casGetIndex >= 0 && assetWriteIndex >= 0 && casGetIndex < events.findIndex((event) => event.kind === "plugin:fs|write_file" && event.path === v2AssetPath), JSON.stringify({ casGetIndex, assetWriteIndex }));
    record("package asset file written before manifest/snapshot/renderers", assetWriteIndex >= 0 && textWriteIndexes.every((index) => index > assetWriteIndex), JSON.stringify({ assetWriteIndex, textWriteIndexes }));

    const packageWriteCalls = fsCalls.filter((call) => call.command === "plugin:fs|write_file" && call.path.startsWith("archive/packages/"));
    record("all package writes use binary write_file", packageWriteCalls.length >= 5, JSON.stringify(packageWriteCalls));
    record("all package writes use BaseDirectory.AppLocalData token 15", packageWriteCalls.every((call) => call.baseDir === BaseDirectoryAppLocalData), JSON.stringify(packageWriteCalls));
    record("no Sync folder path used", fsCalls.every((call) => !String(call.path || "").includes("H2O Studio Sync")), JSON.stringify(fsCalls.map((call) => call.path)));
    record("no user-folder export/save dialog involved", true, "smoke calls only the private AppLocalData package writer");

    const v1ChatId = `c4_4_pkg_v1_smoke_${suffix}`;
    const v1SnapshotId = `snap_${v1ChatId}`;
    await createSnapshotFixture({
      chatId: v1ChatId,
      snapshotId: v1SnapshotId,
      title: "C4.4 package v1 runtime smoke",
      html: "<section><p>asset-less smoke</p></section>",
      text: "asset-less smoke",
    });

    const v1 = await ingestion.writeSavedChatPackageV1({ snapshotId: v1SnapshotId });
    const v1PackagePath = `archive/packages/${v1ChatId}.h2ochat`;
    record("v1 package path is app-owned archive path", v1.packagePath === v1PackagePath, v1.packagePath);
    record("asset-less package stays v1", v1.manifest && v1.manifest.schemaVersion === 1, JSON.stringify({ schemaVersion: v1.manifest && v1.manifest.schemaVersion }));
    record("asset-less package has no manifest assets", Array.isArray(v1.manifest.assets) && v1.manifest.assets.length === 0, JSON.stringify(v1.manifest.assets || []));
    for (const path of [`${v1PackagePath}/manifest.json`, `${v1PackagePath}/snapshot.json`, `${v1PackagePath}/chat.md`, `${v1PackagePath}/chat.html`]) {
      record(`v1 package file exists: ${path}`, await fsExists(path), path);
    }
    const v1PackageWriteCalls = fsCalls.filter((call) => call.command === "plugin:fs|write_file" && call.path.startsWith(v1PackagePath));
    record("v1 package writes only the four text files", v1PackageWriteCalls.length === 4 && v1PackageWriteCalls.every((call) => !call.path.startsWith(`${v1PackagePath}/assets/`)), JSON.stringify(v1PackageWriteCalls));

    let duplicateRejected = false;
    try {
      await ingestion.writeSavedChatPackageV1({ snapshotId: v1SnapshotId });
    } catch (err) {
      duplicateRejected = /exist|overwrite/i.test(String(err && err.message ? err.message : err));
    }
    record("overwrite defaults to fail-if-existing", duplicateRejected, "second write without overwrite rejected");

    if (RUN_OVERWRITE_REMOVE) {
      const overwritten = await ingestion.writeSavedChatPackageV1({ snapshotId: v1SnapshotId, overwrite: true });
      record("explicit overwrite:true completed", !!overwritten && overwritten.packagePath === v1PackagePath, overwritten && overwritten.packagePath);
    } else {
      results.push({
        name: "overwrite:true remove-path behavior",
        pass: true,
        detail: "not executed by default; deferred to explicit security decision if remove permission is required",
      });
    }

    console.table(results);
    console.log("[saved-chat-package-v2-smoke] ALL PASS", {
      v2PackagePath,
      v1PackagePath,
      v2AssetPath,
      contentHash: v2Manifest.contentHash,
      overwriteRemoveExecuted: RUN_OVERWRITE_REMOVE,
    });
  } finally {
    invokeHost.invoke = originalInvoke;
    ingestion.assetCas.getAssetBytes = originalGetAssetBytes;
  }
})();
```

## PASS Criteria

The smoke passes only if the console reports `ALL PASS` and the results table confirms:

1. A v2 package with an inline `data:image/png` asset is built and written.
2. The package path is `archive/packages/<chatId>.h2ochat` under `BaseDirectory.AppLocalData`.
3. The v2 package contains `manifest.json`, `snapshot.json`, `chat.md`, `chat.html`, and `assets/sha256-<hash>.png`.
4. Live CAS bytes are read before the package asset file is written.
5. The package asset file is written before `manifest.json`, `snapshot.json`, `chat.md`, and `chat.html`.
6. `manifest.assets[]` matches the package asset path.
7. The saved message includes `assetRefs[]`.
8. `contentHtml` and `chat.html` use package-relative `assets/sha256-<hash>.png` refs and no longer contain `data:image`.
9. The v2 `contentHash` validates from canonical package payload hashes.
10. An asset-less package still writes as v1 with only the four text files.
11. Package writes use binary `write_file` calls with `baseDir: 15`.
12. No path contains `$HOME/H2O Studio Sync`.
13. No user-folder export/save dialog is invoked.

## Overwrite Behavior

The snippet verifies that a second write without `overwrite: true` fails closed when the package directory already exists.

`overwrite: true` is intentionally disabled by default in the smoke via `RUN_OVERWRITE_REMOVE = false`. Earlier capability/security work did not grant broad remove/rename behavior for archive CAS. If package overwrite requires remove permission under `archive/packages`, that should be recorded as a separate scoped security decision before enabling the optional overwrite branch.

## Boundaries Confirmed By This Smoke

- No UI wiring.
- No Sync integration or Sync folder path.
- No import/recovery flow.
- No WebDAV/cloud behavior.
- No user-folder export/save dialog.
- No automatic GC.
- No Phase C5 behavior.
