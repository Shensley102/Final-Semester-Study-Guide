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

# ---------- Helpers ----------

SAFE_JSON_RE = re.compile(r"^(?!\.)[A-Za-z0-9_\-\.]+\.json$)

def exists(*parts: str) -> bool:
    return (BASE_DIR.joinpath(*parts)).exists()

def fs(*parts: str) -> Path:
    return BASE_DIR.joinpath(*parts)

def find_first_existing(paths: list[str]) -> str | None:
    for p in paths:
        if exists(*p.strip("/").split("/")):
            return p
    return None

def is_mobile_ua(ua: str) -> bool:
    if not ua:
        return False
    ua = ua.lower()
    # iPhone/iPod/Windows Phone/generic mobile/Android not marked as tablet
    return bool(re.search(r"iphone|ipod|windows phone|mobile|android(?!.*tablet)", ua))

# Where to look for JSON banks (root, template/, templates/)
JSON_DIRS = [BASE_DIR, BASE_DIR / "template", BASE_DIR / "templates"]

def iter_banks():
    """Yield *.json filenames from supported directories (no path)."""
    seen = set()
    for d in JSON_DIRS:
        if not d.exists():
            continue
        for p in d.glob("*.json"):
            name = p.name
            if name.lower() == "vercel.json":
                continue
            if SAFE_JSON_RE.fullmatch(name) and name not in seen:
                seen.add(name)
                yield name

def list_banks():
    banks = [n[:-5] for n in iter_banks()]  # strip .json
    # keep pharm first, then alpha
    banks.sort(key=lambda n: (0 if n.lower().startswith("pharm") else 1, n.lower()))
    return banks

def resolve_json_path(filename: str) -> Path | None:
    """Find the first matching filename.json in JSON_DIRS."""
    safe = os.path.basename(filename)
    if not SAFE_JSON_RE.fullmatch(safe):
        return None
    for d in JSON_DIRS:
        p = d / safe
        if p.exists() and p.is_file():
            return p
    return None

# ---------- Inline template (fallback) ----------

def inline_page(css_href: str, js_href: str, title: str) -> str:
    """Return an inline HTML page equivalent to our external Jinja templates.
    Used only if the real template files are missing."""
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="{css_href}" />
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

  <script src="{js_href}" defer></script>
</body>
</html>"""

# ---------- Routes ----------

@app.route("/healthz")
def healthz():
    return "ok", 200

@app.route("/modules")
def modules():
    return jsonify({"modules": list_banks()})

@app.route("/<filename>.json")
def json_bank(filename: str):
    # /<bank>.json served from root OR template/ OR templates/
    safe = os.path.basename(f"{filename}.json")
    p = resolve_json_path(safe)
    if not p:
        abort(404)
    return send_from_directory(p.parent, p.name, mimetype="application/json")

def _render_desktop():
    # Prefer external desktop assets; otherwise fallback to legacy single bundle
    css = find_first_existing([
        "/static/desktop/desktop_style.css",
        "/static/style.css"
    ]) or "/static/style.css"

    js = find_first_existing([
        "/static/desktop/desktop_script.js",  # if you copied the split assets
        "/static/desktop/desktop_script.js",  # (same path; kept for clarity)
        "/static/script.js"                   # original single bundle
    ]) or "/static/script.js"

    # Prefer template file if present
    if exists("templates", "desktop", "desktop_index.html"):
        return render_template("desktop/desktop_index.html")
    # Fallback inline
    return render_template_string(inline_page(css, js, "Final Semester Study Guide — Desktop"))

def _render_mobile():
    css = find_first_existing([
        "/static/mobile/mobile_style.css",
        "/static/style.css"
    ]) or "/static/style.css"

    # On mobile we deliberately load the shared engine directly
    js = find_first_existing([
        "/static/desktop/desktop_script.js",
        "/static/script.js"
    ]) or "/static/script.js"

    if exists("templates", "mobile", "mobile_index.html"):
        return render_template("mobile/mobile_index.html")
    return render_template_string(inline_page(css, js, "Final Semester Study Guide — Mobile"))

@app.route("/desktop")
def desktop():
    return _render_desktop()

@app.route("/m")
def mobile():
    return _render_mobile()

@app.route("/")
def root():
    ua = request.headers.get("user-agent", "")
    if is_mobile_ua(ua):
        return _render_mobile()
    return _render_desktop()

# (Optional) Quietly ignore favicon requests
@app.route("/favicon.ico")
@app.route("/favicon.png")
def favicon():
    return ("", 204)

# ---------- Error handler (helps surface 500 root cause in logs) ----------
@app.errorhandler(Exception)
def on_error(e):
    # Return a short plaintext to users (500), but logs in Vercel contain stacktrace
    # You can temporarily switch to return str(e) for debugging if needed.
    return "Internal Server Error", 500

# ---------- Local debug ----------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
