#!/usr/bin/env python3
"""H2O dev server with CORS + no-cache headers.

Drop-in replacement for `python3 -m http.server 5500` for the chrome-live
dev workflow. The vanilla SimpleHTTPRequestHandler does NOT send
`Access-Control-Allow-Origin` or no-cache headers, which produces two bugs:

  1. The chatgpt.com loader cannot fetch the proxy pack via the page-context
     fallback path. CORS blocks the read; the loader silently degrades to
     a catalog-only fallback that the user never sees as an error.
  2. Once the loader serves a script via its catalog-only URLs (no `?v=`
     token before this fix), the browser HTTP cache holds it forever.
     Edits to script files don't propagate until the user manually clears
     cache, even after a full red-task rebuild.

CORS + no-cache headers together close both holes.

Usage:
    cd h2o-dev-server
    python3 serve.py 5500
"""
import http.server
import socketserver
import sys


class H2ODevHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), H2ODevHandler) as httpd:
        print(f"H2O dev server (CORS + no-cache) on http://127.0.0.1:{port}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
