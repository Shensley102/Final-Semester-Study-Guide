/* ===============================================================
   Final Semester Study Guide — Shared Quiz Engine (Desktop & Mobile)
   - Restores vertical quiz layout and “How it works” on landing
   - Adds keyboard hotkeys (A–Z to pick, Enter to submit/next)
   - Final overview sorts by “most missed” with a label
=============================================================== */

const $ = (id) => document.getElementById(id);

// Header & progress elements
const runCounter       = $('runCounter');
const remainingCounter = $('remainingCounter');
const countersBox      = $('countersBox');
const progressBar      = $('progressBar');
const progressFill     = $('progressFill');
const progressLabel    = $('progressLabel');

// Title
const pageTitle    = $('pageTitle');
const defaultTitle = pageTitle?.textContent || 'Final Semester Study Guide';
const setHeaderTitle = (t) => { if (pageTitle) pageTitle.textContent = t; };

// Launcher
const launcher   = $('launcher');
const moduleSel  = $('moduleSel');
const lengthBtns = $('lengthBtns');
const startBtn   = $('startBtn');
const resumeBtn  = $('resumeBtn');

// Quiz
const quiz         = $('quiz');
const qText        = $('questionText');
const form         = $('optionsForm');
const submitBtn    = $('submitBtn');
const nextBtn      = $('nextBtn');
const feedback     = $('feedback');
const answerLine   = $('answerLine');
const rationaleBox = $('rationale');

// Summary
const summary         = $('summary');
const firstTrySummary = $('firstTrySummary');
const firstTryPct     = $('firstTryPct');
const firstTryCount   = $('firstTryCount');
const firstTryTotal   = $('firstTryTotal');
const reviewList      = $('reviewList');
const restartBtn2     = $('restartBtnSummary');
const resetAll        = $('resetAll');

// Utilities
function escapeHTML(s = '') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

const randomInt = (n) => Math.floor(Math.random() * n);

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Normalize question bank
function normalizeQuestions(raw) {
  const questions = Array.isArray(raw?.questions) ? raw.questions : [];
  const norm = [];
  for (const q of questions) {
    const id    = String(q.id ?? (crypto.randomUUID?.() || Math.random().toString(36).slice(2)));
    const stem  = String(q.stem ?? '');
    const type  = String(q.type ?? 'single_select');
    const opts  = Array.isArray(q.options) ? q.options.map(String) : [];
    const correctLetters = Array.isArray(q.correct) ? q.correct.map(String) : [];
    const rationale = String(q.rationale ?? '');

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, opts.length);
    const options = {};
    letters.forEach((L, i) => { options[L] = opts[i] ?? ''; });

    norm.push({ id, stem, options, correctLetters, rationale, type });
  }
  return norm;
}

// Deterministic option shuffle per question
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleQuestionOptions(q) {
  const pairs = Object.entries(q.options).map(([letter, text]) => ({ letter, text }));
  const shuffled = seededShuffle(pairs, q.id);
  const newOptions = {};
  const oldToNew = {};
  shuffled.forEach((item, idx) => {
    const L = String.fromCharCode(65 + idx);
    newOptions[L] = item.text;
    oldToNew[item.letter] = L;
  });
  const newCorrectLetters = (q.correctLetters || [])
    .map(oldL => oldToNew[oldL])
    .filter(Boolean)
    .sort();
  return { ...q, options: newOptions, correctLetters: newCorrectLetters };
}

// Friendly labels
function prettifyModuleName(name) {
  const raw = String(name || '');
  const map = {
    'Pharm_Quiz_1': 'Pharm Quiz 1',
    'Pharm_Quiz_2': 'Pharm Quiz 2',
    'Pharm_Quiz_3': 'Pharm Quiz 3',
    'Pharm_Quiz_4': 'Pharm Quiz 4',
    'Learning_Questions_Module_1_2':  'Learning Questions Module 1 and 2',
    'Learning_Questions_Module_3_4_': 'Learning Questions Module 3 and 4'
  };
  return map[raw] || raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

// Storage (minimal)
const STORAGE_KEY = 'quizRunState_v1';
function saveRunState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ bank: run.bank, i: run.i })); } catch {}
}
function clearSavedState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// State
let allQuestions = [];
let run = {
  bank: '',
  displayName: '',
  order: [],
  masterPool: [],
  i: 0,
  answered: new Map(),
  uniqueSeen: new Set(),
  stats: new Map(), // qId -> { attempts, wrongs }
};

// Rendering
function renderQuestion(q) {
  qText.textContent = q.stem;

  form.innerHTML = '';
  feedback.textContent = '';
  feedback.classList.remove('ok', 'bad');
  answerLine.textContent = '';
  rationaleBox.textContent = '';
  rationaleBox.classList.add('hidden');

  const isMulti = q.type === 'multi_select';
  form.setAttribute('role', isMulti ? 'group' : 'radiogroup');

  Object.entries(q.options).forEach(([L, text]) => {
    const wrap = document.createElement('div');
    wrap.className = 'opt';

    const input = document.createElement('input');
    input.type = isMulti ? 'checkbox' : 'radio';
    input.name = 'opt';
    input.value = L;
    input.id = `opt-${L}`;

    const lab = document.createElement('label');
    lab.htmlFor = input.id;
    lab.innerHTML = `<span class="k">${L}.</span> <span class="ans">${escapeHTML(text || '')}</span>`;

    wrap.appendChild(input);
    wrap.appendChild(lab);
    form.appendChild(wrap);
  });

  submitBtn.textContent = 'Submit';
  submitBtn.disabled = true;
  submitBtn.dataset.mode = 'submit';

  form.onchange = () => {
    if (submitBtn.dataset.mode === 'submit') {
      submitBtn.disabled = !form.querySelector('input:checked');
    }
  };
}

function updateCounters() {
  runCounter.textContent = `Question: ${run.uniqueSeen.size}`;
  const remaining = run.masterPool.filter(q => !(run.answered.get(q.id)?.correct)).length;
  remainingCounter.textContent = `Remaining to master: ${remaining}`;

  const total = run.masterPool.length || 0;
  const mastered = run.masterPool.filter(q => run.answered.get(q.id)?.correct).length;
  const pct = total ? Math.round((mastered / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', String(pct));
  progressLabel.textContent = `${pct}% mastered`;

  saveRunState();
}

function getUserLetters() {
  const inputs = [...form.querySelectorAll('input')];
  const picked = inputs.filter(i => i.checked).map(i => i.value);
  const isMulti = (run.order[run.i] || {}).type === 'multi_select';
  return (isMulti ? picked.sort() : picked.slice(0, 1));
}

function formatCorrect(q) {
  return (q.correctLetters || [])
    .map(L => `${L}. ${escapeHTML(q.options[L] || '')}`)
    .join('<br>');
}

// Modules
async function fetchModules() {
  try {
    const res = await fetch(`/modules?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw 0;
    const data = await res.json();
    const mods = Array.isArray(data.modules) ? data.modules : [];
    return mods.filter(m => m.toLowerCase() !== 'vercel');
  } catch {
    // fallback demo list
    return ["Pharm_Quiz_1","Pharm_Quiz_2","Pharm_Quiz_3","Pharm_Quiz_4"];
  }
}

function ensureOption(sel, value, label) {
  if (![...sel.options].some(o => o.value === value)) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label ?? value;
    sel.appendChild(opt);
  }
}

async function initModules() {
  try {
    moduleSel.innerHTML = '';
    const mods = await fetchModules();
    for (const m of mods) ensureOption(moduleSel, m, prettifyModuleName(m));
    if (mods.length) moduleSel.value = mods[0];
  } catch {}
}

// Start quiz
async function startQuiz() {
  const lenBtn = lengthBtns.querySelector('.seg-btn.active');
  if (!lenBtn) { alert('Pick Length Of Quiz Before Starting'); return; }

  const bank = moduleSel.value;
  const displayName = prettifyModuleName(bank);
  const qty = lenBtn.dataset.len === 'full' ? 'full' : parseInt(lenBtn.dataset.len, 10);

  // hide “how to” once we begin
  const howTo = document.getElementById('howTo');
  if (howTo) howTo.classList.add('hidden');

  setHeaderTitle(displayName);
  document.title = `Final Semester Study Guide — ${displayName}`;

  startBtn.disabled = true;

  const res = await fetch(`/${encodeURIComponent(bank)}.json`, { cache:'no-store' });
  if (!res.ok) {
    alert(`Could not load ${bank}.json`);
    startBtn.disabled = false;
    setHeaderTitle(defaultTitle);
    document.title = 'Final Semester Study Guide';
    return;
  }
  const raw = await res.json();
  allQuestions = normalizeQuestions(raw);

  const sampled = (qty === 'full' || qty >= allQuestions.length)
    ? shuffleInPlace(allQuestions.slice())
    : shuffleInPlace(allQuestions.slice()).slice(0, Math.max(0, qty|0));

  const shuffledQuestions = sampled.map(q => shuffleQuestionOptions(q));

  run = {
    bank,
    displayName,
    order: [...shuffledQuestions],
    masterPool: [...shuffledQuestions],
    i: 0,
    answered: new Map(),
    uniqueSeen: new Set(),
    stats: new Map(),
  };

  launcher.classList.add('hidden');
  summary.classList.add('hidden');
  quiz.classList.remove('hidden');

  countersBox.classList.remove('hidden');
  resetAll.classList.remove('hidden');

  const q0 = run.order[0];
  run.uniqueSeen.add(q0.id);
  renderQuestion(q0);
  updateCounters();

  startBtn.disabled = false;
}

// Submit / Next
submitBtn?.addEventListener('click', () => {
  if (submitBtn.dataset.mode === 'next') {
    const nextIdx = run.i + 1;
    if (nextIdx < run.order.length) {
      run.i = nextIdx;
      const q = run.order[run.i];
      run.uniqueSeen.add(q.id);
      renderQuestion(q);
      updateCounters();
      return;
    }
    // Done
    return endRun();
  }

  const q = run.order[run.i];
  if (!q) return;

  const userLetters = getUserLetters();
  const correctLetters = (q.correctLetters || []).slice().sort();
  const isCorrect = JSON.stringify(userLetters) === JSON.stringify(correctLetters);

  const s = run.stats.get(q.id) || { attempts: 0, wrongs: 0 };
  s.attempts += 1;
  if (!isCorrect) s.wrongs += 1;
  run.stats.set(q.id, s);

  run.answered.set(q.id, { correct: isCorrect, user: userLetters });

  feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
  feedback.classList.remove('ok', 'bad');
  feedback.classList.add(isCorrect ? 'ok' : 'bad');

  answerLine.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrect(q)}`;
  rationaleBox.textContent = q.rationale || '';
  rationaleBox.classList.remove('hidden');

  form.querySelectorAll('input').forEach(i => i.disabled = true);

  submitBtn.dataset.mode = 'next';
  submitBtn.textContent = 'Next';
  submitBtn.disabled = false;

  updateCounters();
});

// End of run / Summary
function endRun() {
  quiz.classList.add('hidden');
  summary.classList.remove('hidden');
  countersBox.classList.add('hidden');

  setHeaderTitle(run.displayName || run.bank || defaultTitle);
  document.title = run.displayName || run.bank || 'Final Semester Study Guide';

  const uniq = [...run.answered.values()];
  const ftCorrect = uniq.filter(x => x.correct).length;
  const totalUnique = uniq.length;

  if (totalUnique > 0) {
    firstTrySummary.classList.remove('hidden');
    firstTryPct.textContent = `${Math.round((ftCorrect/totalUnique)*100)}%`;
    firstTryCount.textContent = ftCorrect;
    firstTryTotal.textContent = totalUnique;
  } else {
    firstTrySummary.classList.add('hidden');
  }

  // Start New Quiz button at the top
  if (restartBtn2) {
    restartBtn2.textContent = 'Start New Quiz';
    if (summary.firstChild !== restartBtn2) summary.insertBefore(restartBtn2, summary.firstChild);
  }

  // Clever label (only once)
  if (!document.getElementById('sortNote')) {
    const note = document.createElement('div');
    note.id = 'sortNote';
    note.className = 'sorted-note';
    note.innerHTML = `<span class="icon">🧭</span>
      <span><strong>Most-Missed First</strong> — we bubble up your toughest questions; the farther you scroll, the fewer misses.</span>`;
    summary.insertBefore(note, restartBtn2.nextSibling);
  }

  // Sort by most missed, then attempts, then alpha
  reviewList.innerHTML = '';
  const qById = new Map(run.masterPool.map(q => [q.id, q]));
  const scored = [];
  for (const [id, q] of qById.entries()) {
    const s = run.stats.get(id) || { attempts: 0, wrongs: 0 };
    if (s.attempts === 0) continue;
    scored.push({ q, attempts: s.attempts, wrongs: s.wrongs });
  }
  scored.sort((a, b) =>
    b.wrongs - a.wrongs ||
    b.attempts - a.attempts ||
    String(a.q.stem).localeCompare(String(b.q.stem))
  );

  scored.forEach(({ q, attempts, wrongs }) => {
    const ans = run.answered.get(q.id);
    const row = document.createElement('div');
    row.className = 'rev-item ' + (ans?.correct ? 'ok' : 'bad');

    const qEl = document.createElement('div'); qEl.className = 'rev-q'; qEl.textContent = q.stem;
    const aux = document.createElement('div'); aux.className = 'rev-aux';
    aux.textContent = wrongs > 0
      ? `Missed ${wrongs} time${wrongs === 1 ? '' : 's'} • ${attempts} attempt${attempts === 1 ? '' : 's'}`
      : `0 misses • ${attempts} attempt${attempts === 1 ? '' : 's'}`;

    const caEl = document.createElement('div'); caEl.className = 'rev-ans';
    caEl.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrect(q)}`;

    const rEl = document.createElement('div'); rEl.className = 'rev-rationale';
    rEl.innerHTML = `<strong>Rationale:</strong> ${escapeHTML(q.rationale || '')}`;

    row.appendChild(qEl);
    row.appendChild(aux);
    row.appendChild(caEl);
    row.appendChild(rEl);
    reviewList.appendChild(row);
  });

  clearSavedState();
}

// Controls
lengthBtns?.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  lengthBtns.querySelectorAll('.seg-btn').forEach(b =>
    b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false')
  );
});

startBtn?.addEventListener('click', startQuiz);
resetAll?.addEventListener('click', () => { clearSavedState(); location.reload(); });
restartBtn2?.addEventListener('click', () => { location.reload(); });

// Keyboard hotkeys: A–Z to toggle, Enter to submit/next
window.addEventListener('keydown', (e) => {
  if (quiz.classList.contains('hidden')) return;

  // Ignore if focus is in a control (no text inputs by default, but keep safe)
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (['input', 'select', 'textarea', 'button'].includes(tag)) return;

  // Enter for submit/next
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!submitBtn.disabled) submitBtn.click();
    return;
  }

  // Letter keys map to options
  const key = e.key.toUpperCase();
  if (key.length === 1 && key >= 'A' && key <= 'Z') {
    const input = document.getElementById(`opt-${key}`);
    if (input && !input.disabled) {
      // Toggle for multi, select for single
      if (input.type === 'checkbox') {
        input.checked = !input.checked;
      } else {
        // radio
        input.checked = true;
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
});

// Initialize module list
(async function init() {
  await initModules();
})();
