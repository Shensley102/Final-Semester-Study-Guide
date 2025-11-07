/* -----------------------------------------------------------
   Final-Semester-Study-Guide - Quiz Frontend

   Fixes in this version:
   - Template path now /template/index.html (server supports both).
   - Safer rendering (escapeHTML everywhere; safe "Correct answer" line).
   - Module picker auto-discovers *.json + lets you add filenames.
   - Consistent keyboard + one-button flow (Submit ➜ Next).
----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

// Top info
const runCounter       = $('runCounter');
const remainingCounter = $('remainingCounter');

// Launcher
const launcher     = $('launcher');
const moduleSel    = $('moduleSel');
const customModule = $('customModule');
const addModuleBtn = $('addModuleBtn');
const lengthBtns   = $('lengthBtns');
const startBtn     = $('startBtn');

// Quiz UI
const quiz         = $('quiz');
const qText        = $('questionText');
const form         = $('optionsForm');
const submitBtn    = $('submitBtn');
const nextBtn      = $('nextBtn');
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
const restartBtn       = $('restartBtn');
const restartBtn2      = $('restartBtnSummary');
const resetAll         = $('resetAll');

// ---------- Utilities ----------
function escapeHTML(s=''){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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

// ---------- State ----------
let allQuestions = [];
let run = {
  bank: '',
  order: [],
  i: 0,
  answered: new Map(),  // id -> { firstTryCorrect: bool, correct: bool, userLetters: [] }
  uniqueSeen: new Set(),
  wrongBuffer: [],      // queue for reinforcement
};

// ---------- Module loading ----------
async function fetchModules(){
  try {
    const res = await fetch(`/modules?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('modules failed');
    const data = await res.json();
    return Array.isArray(data.modules) ? data.modules : [];
  } catch {
    // Fallback (in case /modules not available)
    return ["Module_1", "Module_2", "Module_3", "Module_4", "Pharm_Quiz_HESI",
            "Learning_Questions_Module_1_2", "Learning_Questions_Module_3_4_",
            "Pharmacology_1", "Pharmacology_2", "Pharmacology_3"];
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
  moduleSel.innerHTML = '';
  const mods = await fetchModules();
  for (const m of mods) ensureOption(moduleSel, m, m);
  if (mods.length) moduleSel.value = mods[0];
}

// Allow user to add any *.json present in repo root
async function addModuleToList(name){
  let v = (name || '').trim();
  if (!v) return;
  if (!/\.json$/i.test(v)) v += '.json';
  const base = v.replace(/\.json$/i, '');

  // Quick HEAD to ensure it exists & is allowed server-side
  try {
    const res = await fetch(`/${encodeURIComponent(base)}.json`, { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) throw new Error(`not found: ${base}.json`);
  } catch (e) {
    alert(`Could not find ${base}.json in the repo root.\n\nTip: Commit the file to the root of Final-Semester-Study-Guide and try again.`);
    return;
  }
  ensureOption(moduleSel, base, base);
  moduleSel.value = base;
  customModule.value = '';
}

addModuleBtn.addEventListener('click', () => addModuleToList(customModule.value));

// ---------- Parse/normalize ----------
function normalizeQuestions(raw){
  // Accept the provided JSON schema:
  // { module: "Name", questions: [ { id, stem, options:[], correct:["A"...], rationale, type:"single_select"|"multi_select" } ] }
  const questions = Array.isArray(raw?.questions) ? raw.questions : [];
  const norm = [];

  for (const q of questions){
    const id   = String(q.id ?? crypto.randomUUID());
    const stem = String(q.stem ?? '');
    const type = String(q.type ?? 'single_select');
    const opts = Array.isArray(q.options) ? q.options.map(String) : [];
    const correctLetters = Array.isArray(q.correct) ? q.correct.map(String) : [];
    const rationale = String(q.rationale ?? '');

    // Build A, B, C... map
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, opts.length);
    const options = {};
    letters.forEach((L, i) => { options[L] = opts[i] ?? ''; });

    norm.push({ id, stem, options, correctLetters, rationale, type });
  }
  return norm;
}

// ---------- Rendering ----------
function renderQuestion(q){
  qText.textContent = q.stem;

  // Clear
  form.innerHTML = '';
  answerLine.textContent = '';
  rationaleBox.textContent = '';
  rationaleBox.classList.add('hidden');
  feedback.textContent = '';

  const isMulti = q.type === 'multi_select';
  form.setAttribute('role', isMulti ? 'group' : 'radiogroup');

  // Render stable A,B,C,D... (no shuffling)
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

  submitBtn.disabled = true;
  nextBtn.disabled = true;
}

function currentQuestion(){
  return run.order[run.i] || null;
}

function getUserLetters(){
  const isMulti = currentQuestion().type === 'multi_select';
  const inputs = [...form.querySelectorAll('input')];
  const picked = inputs.filter(i => i.checked).map(i => i.value);
  return isMulti ? picked.sort() : picked.slice(0, 1);
}

function formatCorrectAnswers(q){
  // Safer answer line (escape each option, then join with <br>)
  const letters = q.correctLetters || [];
  const parts = letters.map(L => `${L}. ${escapeHTML(q.options[L] || '')}`);
  return parts.join('<br>');
}

// ---------- Flow ----------
function updateCounters(){
  const uniqueTotal = run.uniqueSeen.size;
  runCounter.textContent = `Question: ${uniqueTotal}`;
  const remaining = run.order.filter(q => !run.answered.get(q.id)?.correct).length;
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

function pushReinforcement(q, wasCorrect){
  // 5% if correct, 15% if incorrect
  const chance = wasCorrect ? 0.05 : 0.15;
  if (Math.random() < chance) run.wrongBuffer.push(q);
}

function nextIndex(){
  // If there are pending reinforcement questions, pop one occasionally
  if (run.wrongBuffer.length && Math.random() < 0.4) {
    return { fromBuffer: true, q: run.wrongBuffer.shift() };
  }
  return { fromBuffer: false, q: run.order[++run.i] || null };
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

  // Build run
  run = {
    bank,
    order: sampleQuestions(allQuestions, qty),
    i: 0,
    answered: new Map(),
    uniqueSeen: new Set(),
    wrongBuffer: [],
  };

  // First question
  launcher.classList.add('hidden');
  summary.classList.add('hidden');
  quiz.classList.remove('hidden');

  const q0 = run.order[0];
  run.uniqueSeen.add(q0.id);
  renderQuestion(q0);
  updateCounters();

  startBtn.disabled = false;
}

function endRun(){
  quiz.classList.add('hidden');
  summary.classList.remove('hidden');

  // First-try stat
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

  // Review (no "Your answer" line by design)
  reviewList.innerHTML = '';
  run.order.forEach(q => {
    const row = document.createElement('div');
    const ans = run.answered.get(q.id);
    row.className = 'rev-item ' + (ans?.correct ? 'ok' : 'bad');

    const qEl = document.createElement('div');
    qEl.className = 'rev-q';
    qEl.textContent = q.stem;

    const caEl = document.createElement('div');
    caEl.className = 'rev-ans';
    caEl.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrectAnswers(q)}`;

    const rEl = document.createElement('div');
    rEl.className = 'rev-rationale';
    rEl.innerHTML = `<strong>Rationale:</strong> ${escapeHTML(q.rationale || '')}`;

    row.appendChild(qEl);
    row.appendChild(caEl);
    row.appendChild(rEl);
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

form.addEventListener('change', () => {
  // enable submit if at least one is selected
  const any = form.querySelector('input:checked');
  submitBtn.disabled = !any;
});

submitBtn.addEventListener('click', async () => {
  const q = currentQuestion();
  if (!q) return;

  const userLetters = getUserLetters();
  const correctLetters = (q.correctLetters || []).slice().sort();
  const isCorrect = JSON.stringify(userLetters) === JSON.stringify(correctLetters);

  recordAnswer(q, userLetters, isCorrect);
  pushReinforcement(q, isCorrect);

  // Visuals
  feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
  answerLine.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrectAnswers(q)}`;
  rationaleBox.textContent = q.rationale || '';
  rationaleBox.classList.remove('hidden');

  // Lock inputs
  form.querySelectorAll('input').forEach(i => i.disabled = true);

  submitBtn.disabled = true;
  nextBtn.disabled = false;

  scrollToBottomSmooth();
  updateCounters();
});

nextBtn.addEventListener('click', () => {
  const next = nextIndex();
  const q = next.q;
  if (!q) return endRun();

  run.uniqueSeen.add(q.id);
  renderQuestion(q);
  updateCounters();
});

restartBtn.addEventListener('click', () => { location.reload(); });
restartBtn2.addEventListener('click', () => { location.reload(); });
resetAll.addEventListener('click', () => { localStorage.clear(); location.reload(); });

// ---------- Init ----------
initModules();
