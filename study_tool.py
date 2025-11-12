from __future__ import annotations
import os
import re
from pathlib import Path
from typing import List
from flask import Flask, jsonify, send_from_directory, abort, request, render_template

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_url_path="/static", static_folder="static", template_folder="templates")

# Directories where quiz-bank JSON files may live
SEARCH_DIRS: List[Path] = [BASE_DIR, BASE_DIR / "template", BASE_DIR / "templates"]

SAFE_RE = re.compile(r"^(?!\\.)[A-Za-z0-9_\\-\\.]+\\.json$")

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

@app.route("/")
def root():
    """Render desktop or mobile index instead of 'OK'."""
    ua = request.headers.get("User-Agent", "")
    # Mobile detection
    if is_mobile(ua):
        try:
            return render_template("mobile/mobile_index.html")
        except Exception:
            pass
    # Default to desktop
    try:
        return render_template("desktop/desktop_index.html")
    except Exception:
        # Legacy fallback if templates missing
        if (BASE_DIR / "index.html").exists():
            return send_from_directory(BASE_DIR, "index.html")
        return "Final Semester Study Guide application is missing templates.", 500

@app.route("/favicon.ico")
def favicon():
    """Quietly ignore favicon requests."""
    return ("", 204)

if __name__ == "__main__":
    app.run(debug=True, port=8000)
