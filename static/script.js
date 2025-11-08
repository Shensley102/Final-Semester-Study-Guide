/* -----------------------------------------------------------
   Show counters only during an active quiz.
----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

// Top info
const runCounter       = $('runCounter');
const remainingCounter = $('remainingCounter');
const countersBox      = $('countersBox');  // <— wrapper we’ll show/hide

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
const submitBtn    = $('submitBtn');   // single action button now (Submit/Next)
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
const resetAll         = $('resetAll');          // hidden initially

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
  order: [],
  i: 0,
  answered: new Map(),
  uniqueSeen: new Set(),
  wrongBuffer: [],
};

// ---------- Module loading ----------
async function fetchModules(){
  try {
    const res = await fetch(`/modules?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('modules failed');
    const data = await res.json();
    return Array.isArray(data.modules) ? data.modules : [];
  } catch {
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
  moduleSel.innerHTML = '';
  const mods = await fetchModules();
  for (const m of mods) ensureOption(moduleSel, m, m);
  if (mods.length) moduleSel.value = mods[0];
}
async function addModuleToList(name){
  let v = (name || '').trim();
  if (!v) return;
  if (!/\.json$/i.test(v)) v += '.json';
  const base = v.replace(/\.json$/i, '');
  try {
    const res = await fetch(`/${encodeURIComponent(base)}.json`, { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) throw new Error(`not found: ${base}.json`);
  } catch {
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

// ---------- Single-action button helpers ----------
function setActionState(state){
  if (state === 'submit') {
    submitBtn.dataset.mode = 'submit';
    submitBtn.textContent = 'Submit';
    submitBtn.classList.remove('btn-blue');
    submitBtn.disabled = true;
  } else {
    submitBtn.dataset.mode = 'next';
    submitBtn.textContent = 'Next';
    submitBtn.classList.add('btn-blue');
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

  const isMulti = q.type === 'multi_select';
  form.setAttribute('role', isMulti ? 'group' : 'radiogroup');

  Object.entries(q.options).forEach(([L, text]) => {
    const wrap = document.createElement('div'); wrap.className = 'opt';
    const input = document.createElement('input');
    input.type = isMulti ? 'checkbox' : 'radio';
    input.name = 'opt'; input.value = L; input.id = `opt-${L}`;
    const lab = document.createElement('label');
    lab.htmlFor = input.id;
    lab.innerHTML = `<span class="k">${L}.</span> <span class="ans">${escapeHTML(text || '')}</span>`;
    wrap.appendChild(input); wrap.appendChild(lab);
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
  const chance = wasCorrect ? 0.05 : 0.15;
  if (Math.random() < chance) run.wrongBuffer.push(q);
}
function nextIndex(){
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
  if (!res.ok) { alert(`Could not load ${bank}.json`); startBtn.disabled = false; return; }
  const raw = await res.json();
  allQuestions = normalizeQuestions(raw);

  run = { bank, order: sampleQuestions(allQuestions, qty), i: 0,
          answered: new Map(), uniqueSeen: new Set(), wrongBuffer: [] };

  launcher.classList.add('hidden');
  summary.classList.add('hidden');
  quiz.classList.remove('hidden');

  // SHOW counters & reset only once quiz starts
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

  // HIDE counters again when the quiz is not open
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

  const q = currentQuestion(); if (!q) return;
  const userLetters = getUserLetters();
  const correctLetters = (q.correctLetters || []).slice().sort();
  const isCorrect = JSON.stringify(userLetters) === JSON.stringify(correctLetters);

  recordAnswer(q, userLetters, isCorrect);
  pushReinforcement(q, isCorrect);

  feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
  answerLine.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrectAnswers(q)}`;
  rationaleBox.textContent = q.rationale || '';
  rationaleBox.classList.remove('hidden');

  form.querySelectorAll('input').forEach(i => i.disabled = true);
  setActionState('next');

  scrollToBottomSmooth();
  updateCounters();
});

// Reset
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

  if (key === 'Enter') {
    e.preventDefault();
    if (!submitBtn.disabled || submitBtn.dataset.mode === 'next') submitBtn.click();
    return;
  }

  if (/^[A-Z]$/.test(upper) && submitBtn.dataset.mode === 'submit') {
    const input = document.getElementById(`opt-${upper}`);
    if (!input || input.disabled) return;
    e.preventDefault();
    input.checked = !input.checked;
    onSelectionChanged();
  }
});

// ---------- Init ----------
initModules();
