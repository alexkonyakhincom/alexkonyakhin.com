#!/usr/bin/env python3
"""Stage the public static files and run a loopback-only preview."""

import argparse
import shutil
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PUBLIC_FILES = (
    "index.html",
    "styles.css",
    "ava_alex_konyakhin.png",
    "llms.txt",
    "robots.txt",
    "CNAME",
)
OUTPUT = ROOT / "dist"


def build():
    if OUTPUT.is_symlink():
        raise RuntimeError("The public output directory must not be a symlink.")
    OUTPUT.mkdir(exist_ok=True)
    unexpected = [p.name for p in OUTPUT.iterdir() if p.name not in PUBLIC_FILES]
    if unexpected:
        raise RuntimeError("Unexpected files in dist; review them before staging: " + ", ".join(unexpected))
    for name in PUBLIC_FILES:
        source, destination = ROOT / name, OUTPUT / name
        if source.is_symlink() or destination.is_symlink():
            raise RuntimeError("Public files must not be symlinks: " + name)
        shutil.copy2(source, destination)
    return OUTPUT


class PreviewHandler(SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(404)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "preview"))
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    directory = build()
    if args.command == "build":
        print(f"Prepared {len(PUBLIC_FILES)} public files in {directory}")
        return
    handler = partial(PreviewHandler, directory=str(directory))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Local preview: http://127.0.0.1:{args.port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
