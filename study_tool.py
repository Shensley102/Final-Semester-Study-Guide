import os
import re
from pathlib import Path
from flask import Flask, render_template, send_from_directory, abort, jsonify

# --- Paths ---
BASE_DIR = Path(__file__).resolve().parent
# Support either "templates" or "template" (your repo screenshot showed "template")
TEMPLATES_DIR = BASE_DIR / ("templates" if (BASE_DIR / "templates").exists() else "template")
STATIC_DIR = BASE_DIR / "static"

# --- Flask app ---
app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(STATIC_DIR),
    template_folder=str(TEMPLATES_DIR),
)

# NEW naming convention: only allow banks that start with "Final-Semester-Study-Guide_"
ALLOWED_JSON = re.compile(
    r"^Final-Semester-Study-Guide_[\w-]+\.json$",
    re.IGNORECASE,
)

@app.get("/healthz")
def healthz():
    return "ok", 200

@app.get("/")
def index():
    # Expects templates/index.html or template/index.html
    return render_template("index.html")

@app.get("/modules")
def list_modules():
    """
    Return available banks as: { "modules": ["Final-Semester-Study-Guide_Module_1", ...] }
    """
    banks = []
    for p in BASE_DIR.glob("*.json"):
        name = p.name
        if ALLOWED_JSON.fullmatch(name):
            banks.append(p.stem)
    banks.sort(key=str.lower)
    return jsonify({"modules": banks})

# Serve only root-level "<name>.json" files that pass the whitelist.
@app.route("/<string:filename>.json", methods=["GET", "HEAD"])
def serve_bank(filename: str):
    """
    Serve whitelisted JSON banks from the repo root.
    """
    safe_name = os.path.basename(f"{filename}.json")
    if not ALLOWED_JSON.fullmatch(safe_name):
        abort(404)

    path = BASE_DIR / safe_name
    if not (path.exists() and path.is_file()):
        abort(404)

    return send_from_directory(BASE_DIR, safe_name, mimetype="application/json")

if __name__ == "__main__":
    # Local dev: python study_tool.py
    app.run(host="0.0.0.0", port=5000, debug=True)
