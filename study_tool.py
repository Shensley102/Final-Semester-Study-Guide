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

# Safe JSON filename pattern (no path traversal, only simple names)
SAFE_JSON_RE = re.compile(r"^(?!\.)[A-Za-z0-9_\-\.]+\.json$")

def list_banks():
    """Return all *.json files in the repo root that match SAFE_JSON_RE."""
    banks = []
    for p in BASE_DIR.glob("*.json"):
        name = p.name
        if SAFE_JSON_RE.fullmatch(name):
            # strip the extension for the client (client re-adds .json)
            banks.append(name[:-5])
    # Stable + friendly order: show Pharmacology banks first if present
    def sort_key(n):
        # prioritize "Pharmacology_*", then others alphabetically
        return (0 if n.lower().startswith("pharmacology_") else 1, n.lower())
    banks.sort(key=sort_key)
    return banks

@app.route("/", methods=["GET"])
def index():
    # Renders /template/index.html (or /templates/index.html)
    return render_template("index.html")

@app.route("/healthz", methods=["GET"])
def healthz():
    return "ok", 200

@app.route("/modules", methods=["GET"])
def modules():
    """
    Returns a JSON payload of available quiz modules (filenames without .json).
    The frontend can also add custom names manually; this endpoint is for convenience.
    """
    return jsonify({"modules": list_banks()})

@app.route("/<string:filename>.json", methods=["GET", "HEAD"])
def serve_bank(filename: str):
    """
    Serve a JSON bank by basename. We only allow files that:
      - live in the repo root,
      - match SAFE_JSON_RE,
      - actually exist.
    """
    safe_name = os.path.basename(f"{filename}.json")
    if not SAFE_JSON_RE.fullmatch(safe_name):
        abort(404)

    path = BASE_DIR / safe_name
    if not (path.exists() and path.is_file()):
        abort(404)

    return send_from_directory(BASE_DIR, safe_name, mimetype="application/json")

if __name__ == "__main__":
    # Local dev
    app.run(host="0.0.0.0", port=5000, debug=True)
