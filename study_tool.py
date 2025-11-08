import os
import re
from pathlib import Path
from flask import Flask, render_template, send_from_directory, abort, jsonify

# ---------- Paths ----------
BASE_DIR = Path(__file__).resolve().parent
# Support either "templates" or "template"
TEMPLATES_DIR = BASE_DIR / ("templates" if (BASE_DIR / "templates").exists() else "template")
STATIC_DIR = BASE_DIR / "static"

# ---------- Flask ----------
app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(STATIC_DIR),
    template_folder=str(TEMPLATES_DIR),
)

# Safe JSON filename pattern (root-only .json, no traversal)
SAFE_JSON_RE = re.compile(r"^(?!\.)[A-Za-z0-9_\-\.]+\.json$")

def list_banks():
    """
    Return all *.json files in the repo root that match SAFE_JSON_RE (names without .json),
    excluding ONLY vercel.json (case-insensitive).
    """
    banks = []
    for p in BASE_DIR.glob("*.json"):
        name = p.name
        if name.lower() == "vercel.json":
            continue  # exclude only vercel.json
        if SAFE_JSON_RE.fullmatch(name):
            banks.append(name[:-5])  # strip .json
    # Prefer Pharmacology_* first, then alphabetical
    def sort_key(n):
        return (0 if n.lower().startswith("pharmacology_") else 1, n.lower())
    banks.sort(key=sort_key)
    return banks

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

@app.route("/healthz", methods=["GET"])
def healthz():
    return "ok", 200

@app.route("/modules", methods=["GET"])
def modules():
    """List available quiz modules (filenames without .json)."""
    return jsonify({"modules": list_banks()})

@app.route("/<string:filename>.json", methods=["GET", "HEAD"])
def serve_bank(filename: str):
    """Serve a JSON bank by basename from the repo root with strict name checks."""
    safe_name = os.path.basename(f"{filename}.json")
    if not SAFE_JSON_RE.fullmatch(safe_name):
        abort(404)
    path = BASE_DIR / safe_name
    if not (path.exists() and path.is_file()):
        abort(404)
    return send_from_directory(BASE_DIR, safe_name, mimetype="application/json")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
