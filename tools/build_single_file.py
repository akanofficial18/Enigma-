#!/usr/bin/env python3
"""Inline the CSS and JS of index.html and watch.html into self-contained files.

    python3 tools/build_single_file.py            -> dist/index.html, dist/watch.html
    python3 tools/build_single_file.py --artifact -> same, but index.html has no <html>/<head>/<body>
                                                     wrapper (for hosts that add their own page shell)

The two output pages still sync with each other as long as they are served from the same origin.
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
artifact = "--artifact" in sys.argv
out = root / ("dist-artifact" if artifact else "dist")
out.mkdir(exist_ok=True)


def inline(html: str) -> str:
    html = re.sub(
        r'<link rel="stylesheet" href="(css/[^"]+)">',
        lambda m: "<style>\n" + (root / m.group(1)).read_text() + "\n</style>",
        html,
    )
    html = re.sub(
        r'<script src="(js/[^"]+)"></script>',
        lambda m: "<script>\n" + (root / m.group(1)).read_text() + "\n</script>",
        html,
    )
    return html


def strip_wrapper(html: str) -> str:
    head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
    head = re.sub(r"<meta[^>]*>\s*", "", head)          # host adds charset + viewport
    body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
    return head.strip() + "\n" + body.strip() + "\n"


for name in ("index.html", "watch.html"):
    html = inline((root / name).read_text())
    if artifact and name == "index.html":
        html = strip_wrapper(html)
    (out / name).write_text(html)
    print("wrote", (out / name).relative_to(root), f"{len(html)//1024} KB")
