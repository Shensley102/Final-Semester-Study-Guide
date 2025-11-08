/* -----------------------------------------------------------
   Final-Semester-Study-Guide - Quiz Frontend
   - Single action button: Submit (green & wide) ➜ Next (blue)
   - Counters + Reset only visible during an active quiz
   - Keyboard: A–Z toggle options; Enter submits / next
   - Feedback bigger & colored (green for correct, red for incorrect)
----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

// Top info
const runCounter       = $('runCounter');
const remainingCounter = $('remainingCounter');
const countersBox      = $('countersBox');

// Launcher
const launcher   = $('launcher');
const moduleSel  = $('moduleSel');
const lengthBtns = $('lengthBtns');
const startBtn   = $('startBtn');

// Quiz UI
const quiz         = $('quiz');
const qText        = $('questionText');
const form         = $('optionsForm');
const submitBtn    = $('submitBtn');   // single action button (Submit/Next)
const nextBtn      = $('nextBtn');     // hidden/unused
const feedback     = $('feedback');
const answerLine   = $('answerLine');
const rationaleBox = $('rationale');

// Summary
const summary          = $('summary');
const firstTrySummary  = $('firstTrySummary');
const firstTryPct      = $('firstTryPct');
const firstTryCount    = $('firstTryCount');
const firstTryTotal    = $('firstTryTotal');
const reviewList       = $('reviewList');
const restartBtn2      = $('restartBtnSummary');
const resetAll         = $('resetAll'); // hidden until quiz starts

// ---------- Utilities ----------
function escapeHTML(s=''){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
const randomInt = (n) => Math.floor(Math.random() * n);
function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function sampleQuestions(all, req){
  const a = all.slice();
  if (req === 'full' || req >= a.length) return shuffleInPlace(a);
  const k = Math.max(0, req|0);
  for (let i = 0; i < k; i++) { const j = i + randomInt(a.length - i); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}
function scrollToBottomSmooth() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    });
  });
}
function isTextEditingTarget(el){
  return el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

// ---------- State ----------
let allQuestions = [];
let run = {
  bank: '',
  order: [],             // current queue of questions to present (may include redeployed duplicates)
  masterPool: [],        // unique set sampled at start; must all be mastered to finish
  i: 0,                  // index into run.order
  answered: new Map(),   // id -> { firstTryCorrect: bool, correct: bool, userLetters: [] }
  uniqueSeen: new Set(), // ids shown at least once (for the “Question: N” counter)

  // Thresholded wrong-question redeployments
  thresholdWrong: 0,     // batch size (15% for 10/25/50, 5% for 100/full)
  wrongSinceLast: [],    // questions answered wrong since last redeploy
};

// ---------- Module loading ----------
async function fetchModules(){
  try {
    const res = await fetch(`/modules?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('modules failed');
    const data = await res.json();
    const mods = Array.isArray(data.modules) ? data.modules : [];
    // Safety net: exclude ONLY 'vercel'
    return mods.filter(m => m.toLowerCase() !== 'vercel');
  } catch {
    // Fallback list if /modules endpoint isn’t available
    return ["Module_1","Module_2","Module_3","Module_4","Pharm_Quiz_HESI",
            "Learning_Questions_Module_1_2","Learning_Questions_Module_3_4_",
            "Pharmacology_1","Pharmacology_2","Pharmacology_3"];
  }
}
function ensureOption(sel, value, label){
  if (![...sel.options].some(o => o.value === value)){
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label ?? value;
    sel.appendChild(opt);
  }
}
async function initModules(){
  try{
    moduleSel.innerHTML = '';
    const mods = await fetchModules();
    for (const m of mods) ensureOption(moduleSel, m, m);
    if (mods.length) moduleSel.value = mods[0];
  }catch(e){
    console.error('Failed to init modules:', e);
  }
}

// ---------- Parse/normalize ----------
function normalizeQuestions(raw){
  // Expected schema:
  // { module: "Name",
  //   questions: [
  //     { id, stem, options:[], correct:["A"...], rationale, type:"single_select"|"multi_select" }
  //   ]
  // }
  const questions = Array.isArray(raw?.questions) ? raw.questions : [];
  const norm = [];
  for (const q of questions){
    const id   = String(q.id ?? crypto.randomUUID());
    const stem = String(q.stem ?? '');
    const type = String(q.type ?? 'single_select');
    const opts = Array.isArray(q.options) ? q.options.map(String) : [];
    const correctLetters = Array.isArray(q.correct) ? q.correct.map(String) : [];
    const rationale = String(q.rationale ?? '');

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, opts.length);
    const options = {};
    letters.forEach((L, i) => { options[L] = opts[i] ?? ''; });

    norm.push({ id, stem, options, correctLetters, rationale, type });
  }
  return norm;
}

// ---------- Deterministic per-question shuffle ----------
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = 0; for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function shuffleQuestionOptions(q) {
  const pairs = Object.entries(q.options).map(([letter, text]) => ({ letter, text }));
  const shuffled = seededShuffle(pairs, q.id); // stable by id
  const newOptions = {}; const oldToNew = {};
  shuffled.forEach((item, idx) => { const L = String.fromCharCode(65 + idx); newOptions[L] = item.text; oldToNew[item.letter] = L; });
  const newCorrectLetters = (q.correctLetters || []).map(oldL => oldToNew[oldL]).filter(Boolean).sort();
  return { ...q, options: newOptions, correctLetters: newCorrectLetters };
}

// ---------- Single-action button helpers ----------
function setActionState(state){
  if (state === 'submit') {
    submitBtn.dataset.mode = 'submit';
    submitBtn.textContent = 'Submit';
    submitBtn.classList.remove('btn-blue'); // green by default
    submitBtn.disabled = true;              // enables after selection
  } else {
    submitBtn.dataset.mode = 'next';
    submitBtn.textContent = 'Next';
    submitBtn.classList.add('btn-blue');    // blue for Next
    submitBtn.disabled = false;
  }
}
function onSelectionChanged(){
  if (submitBtn.dataset.mode === 'submit') {
    const any = form.querySelector('input:checked');
    submitBtn.disabled = !any;
  }
}

// ---------- Rendering ----------
function renderQuestion(q){
  qText.textContent = q.stem;

  form.innerHTML = '';
  answerLine.textContent = '';
  rationaleBox.textContent = '';
  rationaleBox.classList.add('hidden');

  feedback.textContent = '';
  feedback.classList.remove('ok','bad');

  const isMulti = q.type === 'multi_select';
  form.setAttribute('role', isMulti ? 'group' : 'radiogroup');

  // Render in the already-shuffled A, B, C, D order
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

  nextBtn?.classList.add('hidden');
  setActionState('submit');
}

// ---------- Current info ----------
function currentQuestion(){ return run.order[run.i] || null; }
function getUserLetters(){
  const isMulti = currentQuestion().type === 'multi_select';
  const inputs = [...form.querySelectorAll('input')];
  const picked = inputs.filter(i => i.checked).map(i => i.value);
  return isMulti ? picked.sort() : picked.slice(0, 1);
}
function formatCorrectAnswers(q){
  const letters = q.correctLetters || [];
  const parts = letters.map(L => `${L}. ${escapeHTML(q.options[L] || '')}`);
  return parts.join('<br>');
}

// ---------- Flow ----------
function updateCounters(){
  const uniqueTotal = run.uniqueSeen.size;
  runCounter.textContent = `Question: ${uniqueTotal}`;
  // Remaining to master: based on masterPool (unique), not the current queue
  const remaining = run.masterPool.filter(q => !run.answered.get(q.id)?.correct).length;
  remainingCounter.textContent = `Remaining to master: ${remaining}`;
}
function recordAnswer(q, userLetters, isCorrect){
  const firstTime = !run.answered.has(q.id);
  const entry = run.answered.get(q.id) || { firstTryCorrect: null, correct: false, userLetters: [] };
  if (firstTime) entry.firstTryCorrect = !!isCorrect;
  entry.correct = !!isCorrect;
  entry.userLetters = userLetters.slice();
  run.answered.set(q.id, entry);
}
function getNotMastered(){
  return run.masterPool.filter(q => !run.answered.get(q.id)?.correct);
}
function nextIndex(){
  const nextIdx = run.i + 1;
  if (nextIdx < run.order.length) {
    run.i = nextIdx;
    return { fromBuffer: false, q: run.order[run.i] };
  }
  // End of this pass: if any question is not yet mastered, append them and continue
  const notMastered = getNotMastered();
  if (notMastered.length > 0) {
    run.wrongSinceLast = []; // restart wrong counter on new pass
    run.order.push(...notMastered);
    run.i = nextIdx;
    return { fromBuffer: true, q: run.order[run.i] };
  }
  // Truly finished only when everything is mastered
  return { fromBuffer: false, q: null };
}

async function startQuiz(){
  const bank = moduleSel.value;
  const lenBtn = lengthBtns.querySelector('.seg-btn.active');
  const qty = lenBtn ? (lenBtn.dataset.len === 'full' ? 'full' : parseInt(lenBtn.dataset.len, 10)) : 'full';

  startBtn.disabled = true;

  const res = await fetch(`/${encodeURIComponent(bank)}.json`, { cache: 'no-store' });
  if (!res.ok) {
    alert(`Could not load ${bank}.json`);
    startBtn.disabled = false;
    return;
  }
  const raw = await res.json();
  allQuestions = normalizeQuestions(raw);

  // Sample and deterministically shuffle options ONCE per question for this run
  const sampled = sampleQuestions(allQuestions, qty);
  const shuffledQuestions = sampled.map((q) => shuffleQuestionOptions(q));

  run = {
    bank,
    order: [...shuffledQuestions],
    masterPool: [...shuffledQuestions],
    i: 0,
    answered: new Map(),
    uniqueSeen: new Set(),
    thresholdWrong: 0,
    wrongSinceLast: [],
  };

  // Thresholds: 15% for 10/25/50; 5% for 100/full
  const total = run.masterPool.length;
  const frac = (qty === 'full' || (typeof qty === 'number' && qty >= 100)) ? 0.05 : 0.15;
  run.thresholdWrong = Math.max(1, Math.ceil(total * frac));

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

function endRun(){
  quiz.classList.add('hidden');
  summary.classList.remove('hidden');

  countersBox.classList.add('hidden');

  const uniq = [...run.answered.values()];
  const ftCorrect = uniq.filter(x => x.firstTryCorrect).length;
  const totalUnique = uniq.length;
  if (totalUnique > 0){
    firstTrySummary.classList.remove('hidden');
    firstTryPct.textContent = `${Math.round((ftCorrect / totalUnique) * 100)}%`;
    firstTryCount.textContent = ftCorrect;
    firstTryTotal.textContent = totalUnique;
  } else {
    firstTrySummary.classList.add('hidden');
  }

  reviewList.innerHTML = '';
  run.order.forEach(q => {
    const row = document.createElement('div');
    const ans = run.answered.get(q.id);
    row.className = 'rev-item ' + (ans?.correct ? 'ok' : 'bad');

    const qEl = document.createElement('div'); qEl.className = 'rev-q'; qEl.textContent = q.stem;
    const caEl = document.createElement('div'); caEl.className = 'rev-ans';
    caEl.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrectAnswers(q)}`;
    const rEl = document.createElement('div'); rEl.className = 'rev-rationale';
    rEl.innerHTML = `<strong>Rationale:</strong> ${escapeHTML(q.rationale || '')}`;

    row.appendChild(qEl); row.appendChild(caEl); row.appendChild(rEl);
    reviewList.appendChild(row);
  });
}

// ---------- Event wiring ----------
lengthBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn'); if (!btn) return;
  lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
});
startBtn.addEventListener('click', startQuiz);
form.addEventListener('change', onSelectionChanged);

// Single action button (Submit or Next)
submitBtn.addEventListener('click', () => {
  if (submitBtn.dataset.mode === 'next') {
    const next = nextIndex();
    const q = next.q;
    if (!q) return endRun();
    run.uniqueSeen.add(q.id);
    renderQuestion(q);
    updateCounters();
    return;
  }

  const q = currentQuestion();
  if (!q) return;

  const userLetters = getUserLetters();
  const correctLetters = (q.correctLetters || []).slice().sort();
  const isCorrect = JSON.stringify(userLetters) === JSON.stringify(correctLetters);

  recordAnswer(q, userLetters, isCorrect);

  // Threshold-based wrong question redeployment
  if (!isCorrect) {
    run.wrongSinceLast.push(q);
    if (run.wrongSinceLast.length >= run.thresholdWrong) {
      const seen = new Set(); const uniqueBatch = [];
      for (const item of run.wrongSinceLast) {
        if (!seen.has(item.id)) { seen.add(item.id); uniqueBatch.push(item); }
      }
      run.wrongSinceLast = [];
      if (uniqueBatch.length) {
        run.order.splice(run.i + 1, 0, ...uniqueBatch);
      }
    }
  }

  // Feedback + reveal
  feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
  feedback.classList.remove('ok','bad');
  feedback.classList.add(isCorrect ? 'ok' : 'bad');

  answerLine.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrectAnswers(q)}`;
  rationaleBox.textContent = q.rationale || '';
  rationaleBox.classList.remove('hidden');

  // Lock inputs
  form.querySelectorAll('input').forEach(i => i.disabled = true);

  // Switch button to Next
  setActionState('next');

  scrollToBottomSmooth();
  updateCounters();
});

// Reset (visible only during quiz)
resetAll.addEventListener('click', () => { localStorage.clear(); location.reload(); });

// Summary “Start Another Run”
restartBtn2.addEventListener('click', () => { location.reload(); });

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  if (quiz.classList.contains('hidden')) return;
  if (isTextEditingTarget(e.target)) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  const key = e.key || '';
  const upper = key.toUpperCase();

  // Enter submits or goes Next
  if (key === 'Enter') {
    e.preventDefault();
    if (!submitBtn.disabled || submitBtn.dataset.mode === 'next') {
      submitBtn.click();
    }
    return;
  }

  // A–Z toggles the corresponding option (before submit)
  if (/^[A-Z]$/.test(upper) && submitBtn.dataset.mode === 'submit') {
    const input = document.getElementById(`opt-${upper}`);
    if (!input || input.disabled) return;

    e.preventDefault();

    if (input.type === 'radio') {
      input.checked = !input.checked;
    } else {
      input.checked = !input.checked;
    }

    onSelectionChanged();
  }
});

// ---------- Init ----------
initModules();
