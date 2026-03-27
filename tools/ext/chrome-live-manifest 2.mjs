// @version 1.0.0
export function makeChromeLiveManifest({
  PROXY_PACK_URL,
  CHAT_MATCH,
  PAGE_FOLDER_BRIDGE_FILE,
  DEV_HAS_CONTROLS,
  DEV_TITLE,
  DEV_NAME,
  DEV_VERSION,
  DEV_DESCRIPTION,
}) {
  function originWildcard(urlStr) {
    try {
      const u = new URL(urlStr);
      return `${u.protocol}//${u.host}/*`;
    } catch {
      return "http://127.0.0.1:5500/*";
    }
  }

  const hostPerm = originWildcard(PROXY_PACK_URL);
  const extraHostPerms = String(process.env.H2O_EXT_HOST_PERMS || "*://*/*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hostPermissions = Array.from(new Set([hostPerm, ...extraHostPerms]));
  const action = {
    default_title: DEV_TITLE,
    default_icon: {
      "16": "icon16.png",
      "32": "icon32.png",
    },
  };
  if (DEV_HAS_CONTROLS) action.default_popup = "popup.html";
  const manifest = {
    manifest_version: 3,
    name: DEV_NAME,
    version: DEV_VERSION,
    description: DEV_DESCRIPTION,
    permissions: DEV_HAS_CONTROLS ? ["storage", "tabs", "contextMenus"] : ["storage", "contextMenus"],
    icons: {
      "16": "icon16.png",
      "32": "icon32.png",
      "48": "icon48.png",
      "128": "icon128.png",
    },
    action,
    background: {
      service_worker: "bg.js",
    },
    host_permissions: hostPermissions,
    content_scripts: [
      {
        matches: [CHAT_MATCH],
        js: ["loader.js"],
        run_at: "document_start",
      },
    ],
    web_accessible_resources: [
      {
        resources: [PAGE_FOLDER_BRIDGE_FILE],
        matches: [CHAT_MATCH],
      },
    ],
  };
  if (DEV_HAS_CONTROLS) {
    manifest.externally_connectable = { ids: ["*"] };
  }
  return manifest;
}
