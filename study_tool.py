import os
import re
from pathlib import Path
from flask import Flask, render_template, send_from_directory, abort, jsonify

# ---------- Paths ----------
BASE_DIR = Path(__file__).resolve().parent

# ---------- Flask ----------
# Configure Flask to look in the correct folders for static assets
# and HTML templates. Our HTML file lives in the “template” folder.
app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(BASE_DIR / "static"),
    template_folder=str(BASE_DIR / "template"),
)

# Allow only simple names with .json extension for modules
SAFE_JSON_RE = re.compile(r"^(?!\.)[A-Za-z0-9_\-\.]+\.json$")

def list_banks() -> list[str]:
    """
    Return base names (without extension) of JSON files in the repo root,
    excluding vercel.json. Modules are sorted with Pharmacology* items first.
    """
    items = []
    for p in BASE_DIR.glob("*.json"):
        name = p.name
        if name.lower() == "vercel.json":
            continue
        if SAFE_JSON_RE.fullmatch(name):
            items.append(name[:-5])  # strip .json
    items.sort(key=lambda n: (0 if n.lower().startswith("pharmacology_") else 1, n.lower()))
    return items

# ---------- Routes ----------

@app.route("/", methods=["GET"])
def index():
    """Render the main quiz page."""
    return render_template("index.html")

@app.route("/healthz", methods=["GET"])
def healthz():
    """Simple health check endpoint."""
    return "ok", 200

@app.route("/modules", methods=["GET"])
def modules():
    """Return a JSON listing of available modules (question banks)."""
    return jsonify({"modules": list_banks()})

@app.route("/<string:filename>.json", methods=["GET", "HEAD"])
def serve_bank(filename: str):
    """
    Serve a JSON bank by its base filename from the repo root.
    Only allows names matching SAFE_JSON_RE.
    """
    safe_name = os.path.basename(f"{filename}.json")
    if not SAFE_JSON_RE.fullmatch(safe_name):
        abort(404)
    path = BASE_DIR / safe_name
    if not path.exists() or not path.is_file():
        abort(404)
    return send_from_directory(BASE_DIR, safe_name, mimetype="application/json")

@app.route("/favicon.ico")
@app.route("/favicon.png")
def favicon():
    """Return an empty 204 for favicon requests (no actual file)."""
    return ("", 204)

# ---------- Local run ----------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
