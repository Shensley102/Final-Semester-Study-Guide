import os
import re
from pathlib import Path
from flask import (
    Flask, render_template, render_template_string,
    send_from_directory, abort, jsonify, request
)

BASE_DIR = Path(__file__).resolve().parent

app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(BASE_DIR / "static"),
    template_folder=str(BASE_DIR / "templates"),
)

# Only allow simple *.json names (no paths) and exclude vercel.json
SAFE_JSON_RE = re.compile(r"^(?!\.)[A-Za-z0-9_\-\.]+\.json$")

# Directories to search for quiz-bank JSONs
JSON_DIRS = [BASE_DIR, BASE_DIR / "template", BASE_DIR / "templates"]

def list_banks():
    """List quiz banks (without .json) across JSON_DIRS."""
    seen = set()
    result = []
    for d in JSON_DIRS:
        if not d.exists():
            continue
        for p in d.glob("*.json"):
            name = p.name
            if name.lower() == "vercel.json":
                continue
            if SAFE_JSON_RE.fullmatch(name) and name not in seen:
                seen.add(name)
                result.append(name[:-5])  # strip .json
    # Put "pharm" first if present, then alpha sort
    result.sort(key=lambda n: (0 if n.lower().startswith("pharm") else 1, n.lower()))
    return result

def resolve_json(filename: str):
    """Find 'filename.json' in JSON_DIRS (returns Path or None)."""
    safe_name = os.path.basename(filename)
    if not SAFE_JSON_RE.fullmatch(safe_name):
        return None
    for d in JSON_DIRS:
        p = d / safe_name
        if p.exists() and p.is_file():
            return p
    return None

def is_mobile_ua(ua: str) -> bool:
    """Heuristic UA check for phones (Android non-tablet, iPhone, Windows Phone, generic 'mobile')."""
    if not ua:
        return False
    ua = ua.lower()
    return bool(re.search(r"iphone|ipod|windows phone|mobile|android(?!.*tablet)", ua))

def exists(*parts: str) -> bool:
    return (BASE_DIR.joinpath(*parts)).exists()

# Pick which CSS/JS paths to load. Falls back to old single bundle if new files absent.
def desktop_css_path():
    return "static/desktop/desktop_style.css" if exists("static", "desktop", "desktop_style.css") else "static/style.css"
def desktop_js_path():
    return "static/desktop/desktop_script.js" if exists("static", "desktop", "desktop_script.js") else "static/script.js"
def mobile_css_path():
    return "static/mobile/mobile_style.css" if exists("static", "mobile", "mobile_style.css") else "static/style.css"
def mobile_js_path():
    # Always load the desktop engine for mobile (works the same)
    return desktop_js_path()

def build_inline_page(css_href, js_href, title):
    """Inline fallback page if real template files are missing."""
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/{css_href}">
</head>
<body>
  <div class="container">
    <h1 id="pageTitle">Final Semester Study Guide</h1>
    <div id="countersBox" class="counters hidden" aria-live="polite">
      <div class="count-row">
        <div id="runCounter">Question: 0</div>
        <div id="remainingCounter">Remaining to master: 0</div>
        <button id="resetAll" class="btn danger hidden">Reset</button>
      </div>
      <div class="pbar-wrap">
        <div id="progressBar" class="pbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div id="progressFill" class="pbar-fill"></div>
        </div>
        <div id="progressLabel" class="pbar-label">0% mastered</div>
      </div>
    </div>
    <section id="launcher" class="card">
      <div class="field">
        <label for="moduleSel">Module Choice</label>
        <select id="moduleSel"></select>
      </div>
      <div class="field">
        <label id="lengthLegend">Length</label>
        <div id="lengthBtns" class="seg" role="group">
          <button type="button" class="seg-btn" data-len="10">10</button>
          <button type="button" class="seg-btn" data-len="25">25</button>
          <button type="button" class="seg-btn" data-len="50">50</button>
          <button type="button" class="seg-btn" data-len="100">100</button>
          <button type="button" class="seg-btn" data-len="full">Full</button>
        </div>
      </div>
      <div class="actions">
        <button id="startBtn" class="btn primary">Start Quiz</button>
        <button id="resumeBtn" class="btn hidden">Resume</button>
      </div>
    </section>
    <section id="quiz" class="card hidden" aria-live="polite">
      <div id="questionText" class="question"></div>
      <form id="optionsForm" class="options"></form>
      <div class="actions">
        <button id="submitBtn" class="btn primary" disabled>Submit</button>
        <button id="nextBtn" class="btn btn-blue hidden">Next</button>
      </div>
      <div id="feedback" class="feedback"></div>
      <div id="answerLine" class="answer-line"></div>
      <div id="rationale" class="rationale hidden"></div>
    </section>
    <section id="summary" class="card hidden">
      <div id="firstTrySummary" class="first-try">
        <strong>First-try mastery:</strong>
        <span id="firstTryPct">0%</span>
        (<span id="firstTryCount">0</span> / <span id="firstTryTotal">0</span>)
      </div>
      <button id="restartBtnSummary" class="btn primary hidden">Start New Quiz</button>
      <div id="reviewList" class="review-list"></div>
    </section>
  </div>
  <script src="/{js_href}" defer></script>
</body>
</html>"""

@app.route("/healthz")
def healthz():
    return "ok", 200

@app.route("/modules")
def modules():
    return jsonify({"modules": list_banks()})

@app.route("/<path:filename>.json")
def json_bank(filename):
    path = resolve_json(filename + ".json")
    if not path:
        abort(404)
    return send_from_directory(path.parent, path.name, mimetype="application/json")

# Renderers for desktop/mobile
def render_desktop():
    if exists("templates", "desktop", "desktop_index.html"):
        return render_template("desktop/desktop_index.html")
    return render_template_string(build_inline_page(desktop_css_path(), desktop_js_path(), "Final Semester Study Guide — Desktop"))

def render_mobile():
    if exists("templates", "mobile", "mobile_index.html"):
        return render_template("mobile/mobile_index.html")
    return render_template_string(build_inline_page(mobile_css_path(), mobile_js_path(), "Final Semester Study Guide — Mobile"))

@app.route("/desktop")
def desktop():
    return render_desktop()

@app.route("/m")
def mobile():
    return render_mobile()

@app.route("/")
def root():
    ua = request.headers.get("user-agent", "")
    return render_mobile() if is_mobile_ua(ua) else render_desktop()

@app.route("/favicon.ico")
@app.route("/favicon.png")
def favicon():
    return ("", 204)

@app.errorhandler(Exception)
def handle_exception(e):
    # Hide stack traces; logs will show them in Vercel
    return "Internal Server Error", 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
