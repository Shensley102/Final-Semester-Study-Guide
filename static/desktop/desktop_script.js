/* Final Semester Study Guide – Desktop bootstrap with robust init
   - Boots launcher reliably (now/DOMContentLoaded/load)
   - Falls back to a built-in module list if /modules is unavailable
   - Normalizes question/rationale across JSON variants
   - Shows quiz header only during runs
*/

(() => {
  let booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    try { init(); } catch (err) { renderFatal(err); }
  }

  // Robust: run now if DOM is ready, also subscribe to both events (once)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
    window.addEventListener('load', boot, { once: true });
  } else {
    // DOM is already parsed
    boot();
    // still add a safety to run on load if something deferred blocked earlier
    window.addEventListener('load', boot, { once: true });
  }

  // ---------- App state ----------
  const els = {};
  const state = {
    moduleMeta: null,
    questions: [],
    queue: [],
    index: 0,
    correctSoFar: 0,
    totalToMaster: 0,
    allowMulti: false, // set per-question
  };

  // ---------- Init ----------
  function init() {
    // Cache header/slots
    els.app = document.getElementById('appRoot');
    els.header = document.getElementById('quizHeader');
    els.pageTitle = document.getElementById('pageTitle');
    els.reset = document.getElementById('resetAll');
    els.runCounter = document.getElementById('runCounter');
    els.remainingCounter = document.getElementById('remainingCounter');
    els.progressFill = document.getElementById('progressFill');
    els.progressPct = document.getElementById('progressPct');

    els.reset.addEventListener('click', () => {
      showLauncher();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    showLauncher(); // always render launcher first
  }

  // ---------- UI: Launcher ----------
  function showLauncher() {
    hideHeader();
    els.app.innerHTML = `
      <section class="launcher card">
        <h1 class="home-title">Final Semester Study Guide</h1>

        <div class="launch-row">
          <label for="modSelect" class="lbl">Module Choice</label>
          <select id="modSelect" class="select"></select>
        </div>

        <div class="launch-row">
          <div class="lbl">Length</div>
          <div class="lengths" role="group" aria-label="Quiz length">
            ${[10,25,50,100,'Full'].map(v => `
              <button class="len-btn" data-len="${v}">${v}</button>
            `).join('')}
          </div>
        </div>

        <div class="launch-actions">
          <button id="startBtn" class="btn start-btn">Start Quiz</button>
        </div>

        <section class="howto">
          <h2>How it works & hotkeys</h2>
          <ul>
            <li><strong>Start:</strong> Pick a <em>Module</em>, choose a <em>Length</em>, then click <em>Start Quiz</em>.</li>
            <li><strong>Answer:</strong> Click an option or use letter keys (A–Z).</li>
            <li><strong>Submit / Next:</strong> Press <kbd>Enter</kbd> or click the green/blue button.</li>
            <li><strong>After submit:</strong> You’ll see Correct/Incorrect, the Correct Answer, and the Rationale.</li>
            <li><strong>Until-mastery:</strong> Missed questions come back until you’ve answered every one correctly.</li>
            <li><strong>Results:</strong> End page lists your most-missed items first.</li>
          </ul>
        </section>
      </section>
    `;

    // lengths
    let chosenLen = 10;
    els.app.querySelectorAll('.len-btn').forEach(btn => {
      if (btn.dataset.len === '10') btn.classList.add('active');
      btn.addEventListener('click', () => {
        els.app.querySelectorAll('.len-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        chosenLen = btn.dataset.len;
      });
    });

    const modSelect = els.app.querySelector('#modSelect');
    const startBtn = els.app.querySelector('#startBtn');

    // fill modules (backend then fallback)
    populateModules(modSelect).then(() => {
      startBtn.addEventListener('click', async () => {
        const file = modSelect.value;
        if (!file) return alert('Please choose a module.');
        const limit = chosenLen === 'Full' ? 'Full' : Number(chosenLen);
        try {
          await startRun({ file, limit });
        } catch (e) {
          renderFatal(e, `Failed to start module "${file}".`);
        }
      });
    });
  }

  async function populateModules(selectEl) {
    let list = [];
    try {
      const res = await fetch('/modules', { headers: { 'accept': 'application/json' } });
      if (res.ok) list = await res.json();
    } catch { /* ignore */ }

    // If the backend isn’t present, default to common filenames in this repo.
    if (!Array.isArray(list) || list.length === 0) {
      list = [
        { label: 'Module 1', file: 'Module_1.json' },
        { label: 'Module 2', file: 'Module_2.json' },
        { label: 'Module 3', file: 'Module_3.json' },
        { label: 'Module 4', file: 'Module_4.json' },
        { label: 'Learning Questions Module 1 2', file: 'Learning_Questions_Module_1_2.json' },
        { label: 'Learning Questions Module 3 4', file: 'Learning_Questions_Module_3_4.json' }
      ];
    } else {
      // normalize {label,file}
      list = list.map(it => typeof it === 'string'
        ? { label: it.replace(/\.json$/,'').replace(/_/g,' '), file: it }
        : it);
    }

    selectEl.innerHTML = list.map(m => `<option value="${m.file}">${m.label}</option>`).join('');
  }

  // ---------- Run quiz ----------
  async function startRun({ file, limit }) {
    const data = await loadModule(file);
    const normalized = normalizeModule(data);

    if (!normalized.questions || normalized.questions.length === 0) {
      alert('This module appears empty.');
      return;
    }

    state.moduleMeta = { title: normalized.title || toTitle(file), file };
    state.questions = normalized.questions;
    state.totalToMaster = (limit === 'Full')
      ? state.questions.length
      : Math.min(Number(limit), state.questions.length);

    // queue: copy first N
    state.queue = state.questions.slice(0, state.totalToMaster);
    state.index = 0;
    state.correctSoFar = 0;

    // reveal header, set title
    els.pageTitle.textContent = state.moduleMeta.title;
    showHeader();
    renderCurrent();
  }

  function toTitle(file) {
    return file.replace(/\.json$/,'')
               .replace(/_/g,' ')
               .replace(/\s+/g,' ')
               .trim();
  }

  async function loadModule(file) {
    // modules are at the repo root (e.g. /Module_3.json)
    const res = await fetch(`/${file}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.status}`);
    return await res.json();
  }

  // Accept multiple shapes:
  // { questions: [...] } or an array directly
  function normalizeModule(data) {
    const list = Array.isArray(data) ? data : (data.questions || data.items || data.data || []);
    const questions = list.map(normalizeQuestion).filter(Boolean);
    return {
      title: data.title || data.module || '',
      questions
    };
  }

  // Accept many key variants
  function normalizeQuestion(raw) {
    if (!raw) return null;

    const qText =
      raw.question || raw.Question || raw.prompt || raw.text || raw.stem || raw['Question Text'] ||
      '(No question text found)';

    // choices can be in multiple places
    let choices = raw.options || raw.choices || raw.answers || raw.Options || raw.Answers;
    if (!Array.isArray(choices)) {
      const ABCD = ['A','B','C','D','E','F','G'];
      choices = ABCD.map((key, i) => raw[key] || raw[key.toLowerCase()] || null)
                    .filter(v => v != null)
                    .map((txt, i) => ({ key: String.fromCharCode(65 + i), text: String(txt) }));
    } else {
      choices = choices.map((txt, i) => ({ key: String.fromCharCode(65 + i), text: String(txt) }));
    }

    const rationale =
      raw.rationale || raw.Rationale || raw.explanation || raw.Explanation ||
      raw.reason || raw.notes || '';

    // correct could be:
    // - "C" or "C, D" or ["C","D"] or index/indices or the text itself
    let correct = raw.correct || raw['Correct Answer'] || raw.answer || raw.correctAnswer ||
                  raw.correct_answers || raw.correctOptions || raw.correctLetters;

    const correctSet = new Set();
    if (Array.isArray(correct)) {
      correct.forEach(v => addCorrect(correctSet, v, choices));
    } else if (typeof correct === 'string') {
      correct.split(/[,\s]+/).filter(Boolean).forEach(v => addCorrect(correctSet, v, choices));
    } else if (typeof correct === 'number') {
      const c = choices[correct];
      if (c) correctSet.add(c.key);
    }

    // fallback: some sources store boolean flags on choices
    if (correctSet.size === 0 && Array.isArray(raw.choices)) {
      raw.choices.forEach((c, i) => {
        if (c && (c.correct || c.isCorrect)) correctSet.add(String.fromCharCode(65 + i));
      });
    }

    return {
      text: String(qText),
      choices,
      correct: [...correctSet],
      rationale: String(rationale || ''),
      multi: (correctSet.size > 1) || !!raw.multi || !!raw.multiple
    };
  }

  function addCorrect(set, v, choices) {
    if (typeof v === 'string') {
      const letter = v.trim().toUpperCase();
      if (/^[A-Z]$/.test(letter)) return set.add(letter);
      // maybe they provided the text of the answer
      const hit = choices.find(c => c.text.trim().toLowerCase() === v.trim().toLowerCase());
      if (hit) return set.add(hit.key);
    } else if (typeof v === 'number') {
      const c = choices[v];
      if (c) set.add(c.key);
    }
  }

  // ---------- Render current question ----------
  function renderCurrent() {
    const q = state.queue[state.index];
    if (!q) return renderResults();

    updateHeader();

    const card = document.createElement('section');
    card.className = 'card qcard';

    const isMulti = q.multi === true || q.correct.length > 1;
    const typeLabel = isMulti ? 'checkbox' : 'radio';
    const name = `q-${state.index}`;

    card.innerHTML = `
      <h2 class="question-text">${escapeHtml(q.text)}</h2>
      <form class="choices" id="qForm">
        ${q.choices.map((c, i) => `
          <label class="choice">
            <input type="${typeLabel}" name="${name}" value="${c.key}" />
            <span class="letter">${c.key}.</span>
            <span class="opt">${escapeHtml(c.text)}</span>
          </label>
        `).join('')}
        <div class="actions">
          <button type="submit" class="btn submit">Submit</button>
        </div>
      </form>
      <div class="feedback" id="feedback" hidden></div>
    `;

    els.app.innerHTML = '';
    els.app.appendChild(card);

    // keyboard shortcuts (A–Z, Enter)
    const keyHandler = (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        form.requestSubmit();
        return;
      }
      const L = ev.key.toUpperCase();
      if (L.length === 1 && L >= 'A' && L <= 'Z') {
        const input = card.querySelector(`input[value="${L}"]`);
        if (input) { input.checked = !isMulti ? true : !input.checked; }
      }
    };
    document.addEventListener('keydown', keyHandler, { once: false });

    const form = card.querySelector('#qForm');
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const picked = [...form.querySelectorAll('input:checked')].map(i => i.value);
      grade(q, picked, keyHandler);
    }, { once: true });
  }

  function grade(q, picked, keyHandler) {
    document.removeEventListener('keydown', keyHandler, { once: false });

    const correctSet = new Set(q.correct);
    const pickedSet = new Set(picked);
    const isCorrect = setsEqual(correctSet, pickedSet);

    // show feedback
    const fb = document.getElementById('feedback');
    fb.hidden = false;
    fb.className = 'feedback ' + (isCorrect ? 'ok' : 'bad');

    const correctLetters = [...correctSet].sort().join(', ');
    fb.innerHTML = `
      <div class="fb-title">${isCorrect ? 'Correct!' : 'Incorrect'}</div>
      <div class="fb-line"><strong>Correct Answer:</strong> ${escapeHtml(correctLetters)}</div>
      ${q.rationale ? `<div class="fb-rationale"><strong>Rationale:</strong> ${escapeHtml(q.rationale)}</div>` : ''}
      <div class="actions">
        <button class="btn next">${isCorrect ? 'Next' : 'Next'}</button>
      </div>
    `;

    // queue management (until mastery)
    const current = state.queue[state.index];
    const atEnd = state.index >= state.queue.length - 1;

    if (isCorrect) {
      state.correctSoFar++;
      // remove this item from queue
      state.queue.splice(state.index, 1);
    } else {
      // move this item to the end (so it comes back later)
      state.queue.splice(state.index, 1);
      state.queue.push(current);
    }

    fb.querySelector('.next').addEventListener('click', () => {
      if (state.queue.length === 0) renderResults();
      else {
        if (!atEnd) { /* index points to next original item */ }
        else { state.index = 0; }
        renderCurrent();
      }
    });
    updateHeader();
  }

  function updateHeader() {
    els.runCounter.textContent = String( (state.questions.length - state.queue.length) + 1 );
    els.remainingCounter.textContent = String(state.queue.length);
    const mastered = Math.round( (state.correctSoFar / state.totalToMaster) * 100 );
    els.progressFill.style.width = `${mastered}%`;
    els.progressPct.textContent = `${mastered}%`;
  }

  function renderResults() {
    els.app.innerHTML = `
      <section class="card results">
        <div class="results-header">
          <h2>All done! 🎉</h2>
          <p>You mastered ${state.totalToMaster} / ${state.totalToMaster}.</p>
        </div>
        <div class="actions">
          <button id="startOver" class="btn start-btn">Start New Quiz</button>
        </div>
      </section>
    `;
    document.getElementById('startOver').addEventListener('click', () => {
      showLauncher();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ---------- Helpers ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }

  function showHeader() { els.header.classList.remove('hidden'); }
  function hideHeader() { els.header.classList.add('hidden'); }

  function renderFatal(err, msg = 'Unexpected error') {
    console.error(err);
    hideHeader();
    els.app.innerHTML = `
      <section class="card error">
        <h2>Something went wrong</h2>
        <p>${escapeHtml(msg)}</p>
        <pre class="err">${escapeHtml(err && err.message ? err.message : String(err))}</pre>
        <div class="actions">
          <button class="btn start-btn" id="backHome">Back</button>
        </div>
      </section>
    `;
    document.getElementById('backHome').addEventListener('click', showLauncher);
  }
})();
