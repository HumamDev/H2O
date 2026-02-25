const TAG = "[H2O DEV LEAN]";
const MSG_FETCH_TEXT = "h2o-ext-live:fetch-text";
const MSG_HTTP = "h2o-ext-live:http";

function normHeaders(h) {
  if (!h || typeof h !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    if (v == null) continue;
    out[String(k)] = String(v);
  }
  return out;
}

async function httpRequest(req) {
  const method = String(req?.method || "GET").toUpperCase();
  const url = String(req?.url || "");
  if (!url) return { ok: false, status: 0, error: "missing url" };

  const timeoutRaw = Number(req?.timeoutMs || 20000);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(1000, Math.min(120000, timeoutRaw)) : 20000;
  const headers = normHeaders(req?.headers);
  const hasBody = Object.prototype.hasOwnProperty.call(req || {}, "body");
  const body = hasBody && req.body != null ? String(req.body) : undefined;

  const ac = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timer = ac ? setTimeout(() => { try { ac.abort(); } catch {} }, timeoutMs) : 0;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "follow",
      signal: ac ? ac.signal : undefined,
    });
    const text = await res.text();
    return {
      ok: true,
      status: Number(res.status || 0),
      statusText: String(res.statusText || ""),
      responseText: String(text || ""),
      finalUrl: String(res.url || url),
      responseURL: String(res.url || url),
      method,
      url,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: String(err && (err.stack || err.message || err)),
      method,
      url,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === MSG_FETCH_TEXT && typeof msg.url === "string") {
    (async () => {
      const r = await httpRequest({
        method: "GET",
        url: String(msg.url),
        timeoutMs: 15000,
      });
      if (!r.ok) {
        sendResponse({
          ok: false,
          status: Number(r.status || 0),
          error: String(r.error || "request failed"),
          url: String(msg.url),
        });
        return;
      }
      sendResponse({
        ok: Number(r.status || 0) >= 200 && Number(r.status || 0) < 300,
        status: Number(r.status || 0),
        text: String(r.responseText || ""),
        url: String(msg.url),
      });
    })();
    return true;
  }

  if (msg.type === MSG_HTTP && msg.req && typeof msg.req.url === "string") {
    (async () => {
      const r = await httpRequest(msg.req);
      sendResponse(r);
    })();
    return true;
  }
});

console.log(TAG, "background ready");
