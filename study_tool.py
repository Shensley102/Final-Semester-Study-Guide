import os
import re
from pathlib import Path
from flask import Flask, render_template, send_from_directory, abort, jsonify

BASE_DIR = Path(__file__).resolve().parent

app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(BASE_DIR / "static"),
    template_folder=str(BASE_DIR / "templates"),
)

SAFE_JSON_RE = re.compile(r"^(?!\.)[A-Za-z0-9_\-\.]+\.json$")


def list_banks():
    """Return *.json quiz-bank basenames in repo root (excluding vercel.json)."""
    banks = []
    for p in BASE_DIR.glob("*.json"):
        name = p.name
        if name.lower() == "vercel.json":
            continue
        if SAFE_JSON_RE.fullmatch(name):
            banks.append(name[:-5])  # drop .json
    # keep pharmacology-first if you like that ordering; otherwise simple sort
    banks.sort(key=lambda n: (0 if n.lower().startswith("pharmacology_") else 1, n.lower()))
    return banks


@app.route("/healthz")
def healthz():
    return "ok", 200


@app.route("/modules")
def modules():
    """Return available quiz-bank module names (without .json)."""
    return jsonify({"modules": list_banks()})


@app.route("/<filename>.json")
def serve_bank(filename: str):
    """Serve quiz-bank JSON files at repo root."""
    safe_name = os.path.basename(f"{filename}.json")
    if not SAFE_JSON_RE.fullmatch(safe_name):
        abort(404)
    path = BASE_DIR / safe_name
    if not path.exists() or not path.is_file():
        abort(404)
    return send_from_directory(BASE_DIR, safe_name, mimetype="application/json")


@app.route("/desktop")
def desktop():
    return render_template("desktop/desktop_index.html")


@app.route("/m")
def mobile():
    return render_template("mobile/mobile_index.html")


@app.route("/")
def root():
    # Expect vercel.json rewrite "/" to /desktop or /m; fall back to desktop.
    return render_template("desktop/desktop_index.html")


@app.route("/favicon.ico")
@app.route("/favicon.png")
def favicon():
    return ("", 204)


if __name__ == "__main__":
    # Local dev
    app.run(host="0.0.0.0", port=5000, debug=True)
