import os
import re
from pathlib import Path
from flask import Flask, render_template, send_from_directory, abort, jsonify

# ---------- Paths ----------
BASE_DIR = Path(__file__).resolve().parent

# ---------- Flask ----------
app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(BASE_DIR / "static"),
    template_folder=str(BASE_DIR / "templates"),
)

# Allow only simple names and .json extension
SAFE_JSON_RE = re.compile(r"^(?!\.)[A-Za-z0-9_\-\.]+\.json$")

def list_banks():
    """
    Return *.json files in repo root (base names only), excluding ONLY vercel.json.
    """
    items = []
    for p in BASE_DIR.glob("*.json"):
        name = p.name
        if name.lower() == "vercel.json":
            continue  # exclude only vercel.json
        if SAFE_JSON_RE.fullmatch(name):
            items.append(name[:-5])  # strip .json
    items.sort(key=lambda n: (0 if n.lower().startswith("pharmacology_") else 1, n.lower()))
    return items

# ---------- Routes ----------

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

@app.route("/healthz", methods=["GET"])
def healthz():
    return "ok", 200

@app.route("/modules", methods=["GET"])
def modules():
    return jsonify({"modules": list_banks()})

@app.route("/<string:filename>.json", methods=["GET", "HEAD"])
def serve_bank(filename: str):
    """
    Serve a JSON bank by basename from the repo root with strict name checks.
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
    return ("", 204)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
