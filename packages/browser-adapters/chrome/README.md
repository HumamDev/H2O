# packages/browser-adapters/chrome — FUTURE PLACEHOLDER

Future Chrome-specific browser-API adapter — wraps `chrome.*` APIs
(storage, runtime, identity, scripting, etc.) into a versionable
package consumed by the various per-host extensions under
`apps/extensions/<host>/chrome/`.

Not yet implemented. Today the Chrome-API surface is used directly
inline by the chrome-live build outputs in `apps/extensions/chatgpt/chrome/`.
When Firefox WebExtension support is added (see
`packages/browser-adapters/firefox/`), a common adapter abstraction
will be extracted here.

Until then this README is the only tracked content; no package.json,
no source, no workspace entry.
