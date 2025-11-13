# Flask app for Vercel: serves desktop at '/', mobile at '/mobile',
# and provides a '/modules' API to list & fetch JSON banks.
import os, json, glob
from flask import Flask, send_from_directory, send_file, jsonify, abort, request, Response

app = Flask(__name__, static_folder="static", static_url_path="/static")

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_GLOBS = ["Module_*.json", "Learning_*.json", "Pharm_*.json", "*_Quiz_*.json"]

def find_all_data_files():
    files = []
    for pattern in DATA_GLOBS:
        files.extend(glob.glob(os.path.join(REPO_ROOT, pattern)))
    # Deduplicate & sort
    files = sorted({os.path.basename(p) for p in files})
    return files

@app.after_request
def add_headers(resp):
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp

@app.get("/")
def home():
    # Serve desktop by default
    return send_file(os.path.join(REPO_ROOT, "static", "desktop", "desktop_index.html"))

@app.get("/mobile")
def mobile_home():
    return send_file(os.path.join(REPO_ROOT, "static", "mobile", "mobile_index.html"))

@app.get("/modules")
def list_modules():
    files = find_all_data_files()
    # Make a friendlier label
    def label(fn):
        name = os.path.splitext(fn)[0]
        return name.replace("_", " ")
    return jsonify([{"file": f, "label": label(f)} for f in files])

@app.get("/modules/<path:filename>")
def serve_module(filename):
    # Only allow expected files
    safe = os.path.basename(filename)
    if safe not in find_all_data_files():
        abort(404)
    return send_from_directory(REPO_ROOT, safe, mimetype="application/json")

# Compatibility: allow /Something.json direct fetches
@app.get("/<path:filename>.json")
def serve_json_direct(filename):
    safe = os.path.basename(filename + ".json")
    if safe not in find_all_data_files():
        abort(404)
    return send_from_directory(REPO_ROOT, safe, mimetype="application/json")

# Health check
@app.get("/api/ok")
def ok():
    return {"ok": True}

if __name__ == "__main__":
    app.run(debug=True)
