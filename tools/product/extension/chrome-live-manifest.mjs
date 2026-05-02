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
  MANIFEST_PROFILE = "development",
  IDENTITY_PROVIDER_OPTIONAL_HOST_PERMISSIONS = [],
  IDENTITY_PROVIDER_REQUEST_OTP_ARMED = false,
  IDENTITY_PROVIDER_OAUTH_PROVIDER = null,
}) {
  function originWildcard(urlStr) {
    try {
      const u = new URL(urlStr);
      return `${u.protocol}//${u.host}/*`;
    } catch {
      return "http://127.0.0.1:5500/*";
    }
  }

  const manifestProfile = String(MANIFEST_PROFILE || "development").trim().toLowerCase() === "production"
    ? "production"
    : "development";
  const hostPerm = originWildcard(PROXY_PACK_URL);
  const extraHostPerms = String(process.env.H2O_EXT_HOST_PERMS || "*://*/*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const requestOtpArmed = IDENTITY_PROVIDER_REQUEST_OTP_ARMED === true;
  const oauthProvider = String(IDENTITY_PROVIDER_OAUTH_PROVIDER || "").trim().toLowerCase();
  const oauthGoogleEnabled = oauthProvider === "google";
  const hostPermissions = manifestProfile === "production"
    ? [CHAT_MATCH]
    : (requestOtpArmed
      ? Array.from(new Set([CHAT_MATCH, hostPerm].filter(Boolean)))
      : Array.from(new Set([hostPerm, ...extraHostPerms])));
  const optionalHostPermissions = Array.from(new Set(
    (Array.isArray(IDENTITY_PROVIDER_OPTIONAL_HOST_PERMISSIONS) ? IDENTITY_PROVIDER_OPTIONAL_HOST_PERMISSIONS : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/\*$/.test(value)),
  ));
  const action = {
    default_title: DEV_TITLE,
    default_icon: {
      "16": "icon16.png",
      "32": "icon32.png",
    },
  };
  if (DEV_HAS_CONTROLS) action.default_popup = "popup.html";
  const permissions = DEV_HAS_CONTROLS ? ["storage", "tabs", "contextMenus"] : ["storage", "contextMenus"];
  if (oauthGoogleEnabled) permissions.push("identity");
  const manifest = {
    manifest_version: 3,
    name: DEV_NAME,
    version: DEV_VERSION,
    description: DEV_DESCRIPTION,
    permissions,
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
  if (optionalHostPermissions.length) {
    manifest.optional_host_permissions = optionalHostPermissions;
  }
  if (DEV_HAS_CONTROLS && manifestProfile !== "production" && !requestOtpArmed) {
    manifest.externally_connectable = { ids: ["*"] };
  }
  return manifest;
}
