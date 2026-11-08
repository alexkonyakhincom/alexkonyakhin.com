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
    "motion.js",
    "ava_alex_konyakhin.png",
    "llms.txt",
    "robots.txt",
    "CNAME",
    "sr/index.html",
    "fonts/instrument-sans-latin.woff2",
    "fonts/instrument-sans-latin-ext.woff2",
    "fonts/instrument-sans-OFL.txt",
)
OUTPUT = ROOT / "dist"


def build():
    if OUTPUT.is_symlink():
        raise RuntimeError("The public output directory must not be a symlink.")
    OUTPUT.mkdir(exist_ok=True)
    expected = set(PUBLIC_FILES)
    actual = {p.relative_to(OUTPUT).as_posix() for p in OUTPUT.rglob("*") if p.is_file() or p.is_symlink()}
    unexpected = sorted(actual - expected)
    if unexpected:
        raise RuntimeError("Unexpected files in dist; review them before staging: " + ", ".join(unexpected))
    for name in PUBLIC_FILES:
        source, destination = ROOT / name, OUTPUT / name
        if source.is_symlink() or destination.is_symlink():
            raise RuntimeError("Public files must not be symlinks: " + name)
        for folder in destination.parents:
            if folder == OUTPUT:
                break
            if folder.is_symlink():
                raise RuntimeError("Public folders must not be symlinks: " + folder.relative_to(OUTPUT).as_posix())
        destination.parent.mkdir(parents=True, exist_ok=True)
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
