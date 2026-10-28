#!/usr/bin/env python3
"""Local authenticated streaming gateway in front of the SSH-only LLM port."""
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import urllib.request

# Generated credentials are consumed in-process and never printed.
CONFIG = json.loads((Path(__file__).resolve().parents[1] / '.vast-private/runtime.json').read_text())


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass

    def do_GET(self):
        self.forward()

    def do_POST(self):
        self.forward()

    def forward(self):
        if self.path != '/health' and not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer '+CONFIG['api_key']):
            self.send_error(401)
            return
        body = self.rfile.read(int(self.headers.get('Content-Length', '0'))) if self.command == 'POST' else None
        req = urllib.request.Request('http://127.0.0.1:'+os.environ.get('VAST_LLM_UPSTREAM_PORT', '58080')+self.path, data=body,
            headers={'Content-Type': self.headers.get('Content-Type', 'application/json')}, method=self.command)
        try:
            with urllib.request.urlopen(req, timeout=180) as response:
                self.send_response(response.status)
                self.send_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Connection', 'close')
                self.end_headers()
                while chunk := response.read1(8192):
                    self.wfile.write(chunk)
                    self.wfile.flush()
                self.close_connection = True
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except Exception:
            self.close_connection = True


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('VAST_LLM_GATEWAY_PORT', '58081'))), Handler).serve_forever()
