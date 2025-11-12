from __future__ import annotations
import os
import re
from pathlib import Path
from typing import List
from flask import Flask, jsonify, send_from_directory, abort, request

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_url_path="/static", static_folder="static")

# Directories where quiz-bank JSON files may live
SEARCH_DIRS: List[Path] = [BASE_DIR, BASE_DIR / "template", BASE_DIR / "templates"]

SAFE_RE = re.compile(r"^(?!\.)[A-Za-z0-9_\-\.]+\.json$")

def list_json_banks() -> list[str]:
    """Return a deduped, sorted list of *.json files from SEARCH_DIRS."""
    found = []
    for d in SEARCH_DIRS:
        if d.exists():
            found.extend(p.name for p in d.glob("*.json"))
    deduped = list(dict((name.lower(), name) for name in found).values())
    return sorted(deduped, key=str.lower)

def serve_json_file(filename: str):
    """Serve filename.json from any SEARCH_DIRS if present."""
    safe = os.path.basename(filename)
    if not SAFE_RE.fullmatch(safe):
        abort(404)
    for d in SEARCH_DIRS:
        if (d / safe).exists():
            return send_from_directory(d, safe, mimetype="application/json", conditional=True)
    abort(404)

def is_mobile(ua: str) -> bool:
    """Detect mobile UAs (simple heuristic)."""
    if not ua:
        return False
    ua = ua.lower()
    return bool(re.search(r"iphone|ipod|windows phone|mobile|android(?!.*tablet)", ua))

@app.route("/")
def root():
    """Serve the appropriate index page based on device type."""
    ua = request.headers.get("User-Agent", "") or ""
    if is_mobile(ua):
        return send_from_directory(os.path.join(app.static_folder, "mobile"), "mobile_index.html")
    else:
        return send_from_directory(os.path.join(app.static_folder, "desktop"), "desktop_index.html")

@app.route("/modules")
def modules():
    """Return the list of available quiz-bank JSON filenames."""
    try:
        return jsonify(list_json_banks())
    except Exception:
        return jsonify([])

@app.route("/<path:filename>")
def json_bank(filename: str):
    """Serve /name.json only (no subpaths)."""
    if "/" in filename or not filename.lower().endswith(".json"):
        abort(404)
    return serve_json_file(filename)

@app.route("/favicon.ico")
def favicon():
    return ("", 204)

if __name__ == "__main__":
    app.run(debug=True, port=8000)
