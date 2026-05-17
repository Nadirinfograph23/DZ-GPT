"""Minimal HTTP server for background removal using rembg core (no gradio)."""
import sys, os, io, argparse
from http.server import HTTPServer, BaseHTTPRequestHandler

from rembg import remove
from PIL import Image

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # silence access logs

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'rembg ok')

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            input_img = Image.open(io.BytesIO(body)).convert('RGBA')
            output_img = remove(input_img)
            buf = io.BytesIO()
            output_img.save(buf, format='PNG')
            data = buf.getvalue()
            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            msg = str(e).encode()
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=7000)
    args = parser.parse_args()
    server = HTTPServer(('127.0.0.1', args.port), Handler)
    print(f'rembg server listening on port {args.port}', flush=True)
    server.serve_forever()
