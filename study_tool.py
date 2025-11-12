from __future__ import annotations
import os
import re
from pathlib import Path
from typing import List
from flask import Flask, jsonify, send_from_directory, abort, request, render_template

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_url_path="/static", static_folder="static", template_folder="templates")

# Directories where JSON banks can live
SEARCH_DIRS: List[Path] = [BASE_DIR, BASE_DIR / "template", BASE_DIR / "templates"]

SAFE_RE = re.compile(r"^(?!\\.)[A-Za-z0-9_\\-\\.]+\\.json$")

def list_json_banks() -> list[str]:
    """Return a deduped, sorted list of .json files."""
    found = []
    for d in SEARCH_DIRS:
        if d.exists():
            for p in d.glob("*.json"):
                found.append(p.name)
    deduped = list(dict((n.lower(), n) for n in found).values())
    return sorted(deduped, key=str.lower)

def serve_json_file(filename: str):
    safe = os.path.basename(filename)
    if not SAFE_RE.fullmatch(safe):
        abort(404)
    for d in SEARCH_DIRS:
        p = d / safe
        if p.exists():
            return send_from_directory(d, safe, mimetype="application/json", conditional=True)
    abort(404)

def is_mobile(ua: str) -> bool:
    ua = ua.lower() if ua else ""
    return bool(re.search(r"iphone|ipod|windows phone|mobile|android(?!.*tablet)", ua))

@app.route("/modules")
def modules():
    try:
        return jsonify(list_json_banks())
    except Exception:
        # fallback: return empty list instead of 500
        return jsonify([])

@app.route("/<path:filename>")
def json_bank(filename: str):
    if "/" in filename or not filename.lower().endswith(".json"):
        abort(404)
    return serve_json_file(filename)

@app.route("/")
def root():
    # Detect desktop vs mobile
    ua = request.headers.get("User-Agent", "")
    if is_mobile(ua):
        # render mobile index template if exists
        try:
            return render_template("mobile/mobile_index.html")
        except Exception:
            pass
    # default to desktop index
    try:
        return render_template("desktop/desktop_index.html")
    except Exception:
        # fallback to legacy index.html if template missing
        if (BASE_DIR / "index.html").exists():
            return send_from_directory(BASE_DIR, "index.html")
        return "Final Semester Study Guide application is missing templates.", 500

@app.route("/favicon.ico")
def favicon():
    return ("", 204)

if __name__ == "__main__":
    app.run(debug=True, port=8000)
