from __future__ import annotations

import os
from pathlib import Path
from typing import List

from flask import Flask, jsonify, send_from_directory, abort

# ------------------------------------------------------------------------------
# App setup
# ------------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent

# Where we’ll look for quiz-bank JSON files
SEARCH_DIRS: List[Path] = [
    BASE_DIR,                  # repo root
    BASE_DIR / "template",     # some repos use "template"
    BASE_DIR / "templates",    # some repos use "templates"
]

app = Flask(
    __name__,
    static_url_path="/static",
    static_folder="static",
)

# ------------------------------------------------------------------------------
# Utilities
# ------------------------------------------------------------------------------

def _list_json_files() -> list[str]:
    """Find every *.json in our known locations, de-dupe, and sort."""
    found: list[str] = []
    for d in SEARCH_DIRS:
        if d.exists():
            for p in d.glob("*.json"):
                found.append(p.name)
    # de-dupe (preserve last occurrence), then sort case-insensitively
    # using a dict preserves insertion order (py3.7+)
    deduped = list(dict((name.lower(), name) for name in found).values())
    return sorted(deduped, key=lambda s: s.lower())

def _send_json_from_anywhere(filename: str):
    """Serve <filename>.json from one of SEARCH_DIRS if present."""
    # prevent path traversal and subpaths; we only accept the base name
    safe = os.path.basename(filename)
    if not safe.lower().endswith(".json"):
        abort(404)

    for d in SEARCH_DIRS:
        candidate = d / safe
        if candidate.exists():
            # Rely on send_from_directory to set the correct mimetype
            return send_from_directory(d, safe, mimetype="application/json", conditional=True)

    abort(404)

# ------------------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------------------

@app.get("/")
def root_index():
    """Serve the desktop UI by default. Adjust if you want mobile by default."""
    # If you prefer a single index.html, change the filename here.
    index_name = "desktop_index.html"
    if (BASE_DIR / index_name).exists():
        return send_from_directory(BASE_DIR, index_name)
    # Fallback to a generic index.html if present
    if (BASE_DIR / "index.html").exists():
        return send_from_directory(BASE_DIR, "index.html")
    # Nothing to serve
    return "OK", 200

@app.get("/modules")
def modules():
    """Return the list of available quiz-bank JSON filenames."""
    files = _list_json_files()
    return jsonify(files)

@app.get("/favicon.ico")
def favicon():
    # Vercel/Flask may probe this; keep it quiet if you don't have a favicon
    return ("", 204)

# Serve any bank at /<name>.json (e.g., /Module_1.json).
# NOTE: This will NOT serve nested paths (only bare filenames).
@app.get("/<path:filename>")
def json_bank(filename: str):
    # We only serve top-level *.json files; avoid shadowing /static/<...>
    if "/" in filename:
        abort(404)
    if not filename.lower().endswith(".json"):
        abort(404)
    return _send_json_from_anywhere(filename)

# ------------------------------------------------------------------------------
# Local dev
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    # For local testing: python study_tool.py
    # Visit http://127.0.0.1:8000/
    app.run(host="0.0.0.0", port=8000, debug=True)
