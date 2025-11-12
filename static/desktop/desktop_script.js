/* ===============================================================
   Final Semester Study Guide — Shared Quiz Engine (Desktop & Mobile)
   UNTIL-MASTERY RUN (recycle on miss; finish when all mastered)
=============================================================== */

const $ = (id) => document.getElementById(id);

// Header & progress
const runCounter       = $('runCounter');
const remainingCounter = $('remainingCounter');
const countersBox      = $('countersBox');
const progressBar      = $('progressBar');
const progressFill     = $('progressFill');
const progressLabel    = $('progressLabel');

// Launcher
const launcher   = $('launcher');
const moduleSel  = $('moduleSel');
const lengthBtns = $('lengthBtns');
const startBtn   = $('startBtn');

// Quiz UI
const quiz         = $('quiz');
const questionText = $('questionText');
const optionsForm  = $('optionsForm');
const submitBtn    = $('submitBtn');
const nextBtn      = $('nextBtn');
const feedback     = $('feedback');
const answerLine   = $('answerLine');
const rationaleEl  = $('rationale');

// Summary UI
const summary         = $('summary');
const firstTryPct     = $('firstTryPct');
const firstTryCount   = $('firstTryCount');
const firstTryTotal   = $('firstTryTotal');
const restartBtnTop   = $('restartBtnSummary');

// Reset
const resetAll = $('resetAll');

/* ---------- Utils ---------- */
const escapeHTML = (s='') =>
  String(s).replaceAll('&','&amp;').replaceAll('<','&lt;')
           .replaceAll('>','&gt;').replaceAll('"','&quot;')
           .replaceAll("'",'&#39;');

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const percent = (num, den) => den ? Math.round((num/den)*100) : 0;

function prettyTitle(raw) {
  if (!raw) return '';
  const base = raw.replace(/\.(json)$/i,'').replace(/_/g,' ').trim();
  return base.replace(/\s+/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
}

/* ---------- Data/API ---------- */
async function fetchJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function loadModules() {
  moduleSel.innerHTML = `<option disabled selected>Loading…</option>`;
  try {
    const list = await fetchJSON('/modules');
    if (!Array.isArray(list) || list.length === 0) throw new Error('Empty module list');
    moduleSel.innerHTML = list.map(name =>
      `<option value="${name}">${escapeHTML(prettyTitle(name))}</option>`
    ).join('');
    // Ensure something is definitely selected (prevents empty value edge-cases)
    moduleSel.selectedIndex = 0;
  } catch (err) {
    console.error(err);
    moduleSel.innerHTML = `<option value="" disabled selected>Unable to load modules</option>`;
  }
}

async function loadBank(name) {
  return fetchJSON(`/${encodeURIComponent(name)}`);
}

/* ---------- State ---------- */
let bank = [];
let runSet = [];
let queue = [];
let recycle = [];
let mastered = new Set();
let firstTryCorrect = new Set();
let attempts = new Map();

let current = null;
let runNumber = 0;
let selectedLength = '10';

function itemId(it) {
  const stem = (it.question || it.stem || '').trim();
  const opts = (it.options || it.choices || []).join('|');
  let h = 2166136261 >>> 0;
  const s = stem + '::' + opts;
  for (let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i); h += (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24);
  }
  return (h >>> 0).toString(36);
}

/* ---------- Selection ---------- */
function sampleRunSet(fullBank, len) {
  const pool = fullBank.slice();
  const count = (len === 'full') ? pool.length : Math.min(pool.length, Number(len));
  return shuffle(pool).slice(0, count);
}

function resetRunDerivedState() {
  queue = shuffle(runSet.slice());
  recycle = [];
  mastered = new Set();
  firstTryCorrect = new Set();
  attempts = new Map();
  current = null;
  runNumber = 0;
}

/* ---------- Render ---------- */
function setCounters() {
  const masteredCount = mastered.size;
  const total = runSet.length;
  const remain = Math.max(total - masteredCount, 0);

  runCounter.textContent = `Question: ${runNumber + (current ? 1 : 0)}`;
  remainingCounter.textContent = `Remaining to master: ${remain}`;

  const pct = percent(masteredCount, total);
  progressFill.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', pct);
  progressLabel.textContent = `${pct}% mastered`;
}

function renderItem(it) {
  const q = (it.question || it.stem || '').trim();
  const opts = (it.options || it.choices || []).map(String);

  questionText.innerHTML = escapeHTML(q);
  optionsForm.innerHTML = opts.map((txt, idx) => {
    const letter = String.fromCharCode(65 + idx);
    const id = `opt_${idx}`;
    const multi = isMultiCorrect(it);
    return `
      <div class="opt">
        <input id="${id}" name="opt" type="${multi ? 'checkbox':'radio'}" value="${idx}" />
        <label for="${id}">
          <span class="k">${letter}.</span>
          <span class="ans">${escapeHTML(txt)}</span>
        </label>
      </div>`;
  }).join('');

  submitBtn.disabled = true;
  nextBtn.classList.add('hidden');
  feedback.textContent = '';
  answerLine.textContent = '';
  rationaleEl.classList.add('hidden');
  rationaleEl.innerHTML = '';

  optionsForm.onchange = () => {
    const any = optionsForm.querySelector('input:checked');
    submitBtn.disabled = !any;
  };
}

function normalizeCorrect(it) {
  const raw = it.correct ?? it.answer ?? it.answers ?? it.correct_index ?? it.correct_indices;
  if (Array.isArray(raw)) return raw.map(x => (typeof x === 'string' ? letterToIdx(x) : Number(x)));
  if (typeof raw === 'string') return [letterToIdx(raw)];
  return [Number(raw)];
}

function letterToIdx(s) {
  const m = /^[A-Za-z]$/.exec(String(s).trim());
  if (m) return m[0].toUpperCase().charCodeAt(0) - 65;
  return Number(s);
}

function isMultiCorrect(it) {
  const c = normalizeCorrect(it);
  return c.length > 1;
}

function getUserSelection() {
  return [...optionsForm.querySelectorAll('input:checked')].map(i => Number(i.value)).sort((a,b)=>a-b);
}

function arraysEqual(a,b) {
  if (a.length !== b.length) return false;
  for (let i=0;i<a.length;i++) if (a[i] !== b[i]) return false;
  return true;
}

/* ---------- Flow ---------- */
function nextQuestion() {
  if (!current) setCounters();

  if (queue.length === 0) {
    if (mastered.size < runSet.length && recycle.length) {
      queue = shuffle(recycle);
      recycle = [];
    }
  }
  if (queue.length === 0) return showSummary();

  current = queue.shift();
  runNumber++;
  renderItem(current);
  setCounters();
}

function showSummary() {
  quiz.classList.add('hidden');
  summary.classList.remove('hidden');
  countersBox.classList.add('hidden');

  const total = runSet.length;
  const first = firstTryCorrect.size;
  firstTryTotal.textContent = total;
  firstTryCount.textContent = first;
  firstTryPct.textContent = `${percent(first, total)}%`;

  const review = $('reviewList');
  const scored = [...attempts.entries()].map(([id, n]) => {
    const itm = runSet.find(x => itemId(x) === id) || bank.find(x => itemId(x) === id);
    const missed = Math.max(n - 1, 0);
    return { item: itm, attempts: n, missed };
  });
  scored.sort((a,b) => (b.missed - a.missed) || (b.attempts - a.attempts));

  review.innerHTML = scored.map(({ item, attempts, missed }) => {
    const q = escapeHTML((item.question || item.stem || '').trim());
    const corr = normalizeCorrect(item);
    const letters = corr.map(i => String.fromCharCode(65+i)).join(', ');
    const rationale = escapeHTML(item.rationale || item.explanation || '');
    return `
      <div class="card rev-item ${missed>0?'bad':'ok'}">
        <div class="rev-q">${q}</div>
        <div class="rev-aux">Missed ${missed} time${missed===1?'':'s'} • ${attempts} attempt${attempts===1?'':'s'}</div>
        <div class="rev-ans"><strong>Correct Answer:</strong> ${letters}</div>
        ${rationale ? `<div class="rev-rationale"><strong>Rationale:</strong> ${rationale}</div>` : ''}
      </div>`;
  }).join('');

  restartBtnTop?.classList.remove('hidden');
}

/* ---------- Grading ---------- */
function gradeCurrent() {
  if (!current) return;

  const id = itemId(current);
  const sel = getUserSelection();
  const corr = normalizeCorrect(current).slice().sort((a,b)=>a-b);

  const prevAttempts = attempts.get(id) || 0;
  attempts.set(id, prevAttempts + 1);

  const correct = arraysEqual(sel, corr);
  const letters = corr.map(i => String.fromCharCode(65+i)).join(', ');

  answerLine.innerHTML = `<strong>${correct ? 'Correct' : 'Correct Answer'}:</strong> ${letters}`;
  feedback.textContent = correct ? 'Correct!' : 'Incorrect';
  feedback.className = `feedback ${correct ? 'ok' : 'bad'}`;

  const rationale = escapeHTML(current.rationale || current.explanation || '');
  if (rationale) {
    rationaleEl.classList.remove('hidden');
    rationaleEl.innerHTML = rationale;
  } else {
    rationaleEl.classList.add('hidden');
    rationaleEl.innerHTML = '';
  }

  if (correct) {
    if (prevAttempts === 0) firstTryCorrect.add(id);
    mastered.add(id);
  } else {
    // ✅ Always recycle a miss (bug fix)
    recycle.push(current);
  }

  submitBtn.classList.add('hidden');
  nextBtn.classList.remove('hidden');
  submitBtn.disabled = true;

  setCounters();
}

/* ---------- Wiring ---------- */
function bindLengthButtons() {
  lengthBtns?.querySelectorAll('.seg-btn').forEach((b, i) => {
    if (i === 0) b.classList.add('active'); // default select "10"
    b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false');
  });

  lengthBtns?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    selectedLength = btn.dataset.len || '10';
    lengthBtns.querySelectorAll('.seg-btn').forEach(b => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });
}

function bindStart() {
  const handler = async () => {
    try {
      const chosenModuleName = moduleSel?.value || '';
      if (!chosenModuleName) {
        alert('Please choose a module.');
        return;
      }
      bank = await loadBank(chosenModuleName);
      if (!Array.isArray(bank) || bank.length === 0) {
        alert('This module appears empty.');
        return;
      }
      runSet = sampleRunSet(bank, selectedLength);
      resetRunDerivedState();

      launcher.classList.add('hidden');
      document.getElementById('howTo')?.classList.add('hidden');
      quiz.classList.remove('hidden');
      countersBox.classList.remove('hidden');

      const pageTitle = $('pageTitle');
      if (pageTitle) pageTitle.textContent = prettyTitle(chosenModuleName);

      nextQuestion();
    } catch (err) {
      console.error(err);
      alert('Unable to start quiz. See console for details.');
    }
  };

  // Bind both now and on DOMContentLoaded for robustness
  startBtn?.addEventListener('click', handler);
  document.addEventListener('DOMContentLoaded', () => {
    startBtn?.removeEventListener('click', handler);
    startBtn?.addEventListener('click', handler);
  });
}

submitBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  gradeCurrent();
});
nextBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  submitBtn.classList.remove('hidden');
  nextBtn.classList.add('hidden');
  nextQuestion();
});
resetAll?.addEventListener('click', () => location.reload());

/* Init */
(async function init() {
  bindLengthButtons();
  await loadModules(); // ensures a selectedIndex is set
  bindStart();
})();
