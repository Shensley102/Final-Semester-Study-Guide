import os
import re
from pathlib import Path
from flask import Flask, render_template, send_from_directory, abort, jsonify

# ----- Paths & Flask Setup -----
BASE_DIR = Path(__file__).resolve().parent
app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(BASE_DIR / "static"),
    template_folder=str(BASE_DIR / "templates"),
)

# Only allow simple names ending in .json
SAFE_JSON_RE = re.compile(r"^(?!\\.)[A-Za-z0-9_\\-\\.]+\\.json$")

def list_banks():
    """Return *.json file basenames (excluding vercel.json) in repo root."""
    banks = []
    for p in BASE_DIR.glob("*.json"):
        name = p.name
        if name.lower() == "vercel.json":
            continue
        if SAFE_JSON_RE.fullmatch(name):
            banks.append(name[:-5])
    banks.sort(key=lambda n: (0 if n.lower().startswith("pharmacology_") else 1, n.lower()))
    return banks

# ----- Routes -----
@app.route("/healthz")
def healthz():
    return "ok", 200

# List available modules
@app.route("/modules")
def modules():
    return jsonify({"modules": list_banks()})

# Serve JSON banks
@app.route("/<filename>.json")
def serve_bank(filename: str):
    safe_name = os.path.basename(f"{filename}.json")
    if not SAFE_JSON_RE.fullmatch(safe_name):
        abort(404)
    path = BASE_DIR / safe_name
    if not path.exists() or not path.is_file():
        abort(404)
    return send_from_directory(BASE_DIR, safe_name, mimetype="application/json")

# Desktop and mobile shell routes
@app.route("/desktop")
def desktop():
    return render_template("desktop/index.html")

@app.route("/m")
def mobile():
    return render_template("mobile/index.html")

# Fallback root: you can direct this to desktop or 404
@app.route("/")
def root():
    # We expect vercel.json to rewrite "/" to /desktop or /m,
    # but fallback to desktop if called directly.
    return render_template("desktop/index.html")

# Suppress favicon errors
@app.route("/favicon.ico")
@app.route("/favicon.png")
def favicon():
    return ("", 204)

# ----- Run (for local testing) -----
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
