"""本地预览服务：与 python -m http.server 相同，但禁止浏览器缓存，改完代码刷新即生效。

用法：python3 serve.py [端口，默认 5173]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    handler = partial(NoCacheHandler, directory=str(Path(__file__).parent))
    print(f"ShaderMaker: http://127.0.0.1:{port}/")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
