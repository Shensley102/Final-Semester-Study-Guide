/* -----------------------------------------------------------
   Final-Semester-Study-Guide - Quiz Frontend
   - Pretty module titles: Pharm_Quiz_1..4 -> Pharm Quiz 1..4
   - Single action button: Submit (green) ➜ Next (blue)
   - Full-width hashed progress bar; reduced jitter (snap to quiz top)
   - Open Sans question font (normal weight, slightly smaller)
----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

// Top info
const runCounter       = $('runCounter');
const remainingCounter = $('remainingCounter');
const countersBox      = $('countersBox');

// Progress bar
const progressBar   = $('progressBar');
const progressFill  = $('progressFill');
const progressLabel = $('progressLabel');

// Page title handling
const pageTitle    = $('pageTitle');
const defaultTitle = pageTitle?.textContent || 'Final Semester Study Guide';
const setHeaderTitle = (t) => { if (pageTitle) pageTitle.textContent = t; };

// Launcher
const launcher   = $('launcher');
const moduleSel  = $('moduleSel');
const lengthBtns = $('lengthBtns');
const startBtn   = $('startBtn');
const resumeBtn  = $('resumeBtn');

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
const restartBtn2      = $('restartBtnSummary');
const resetAll         = $('resetAll');

/* ---------- Pretty names for modules ---------- */
function prettifyModuleName(name) {
  const map = {
    'Pharm_Quiz_1': 'Pharm Quiz 1',
    'Pharm_Quiz_2': 'Pharm Quiz 2',
    'Pharm_Quiz_3': 'Pharm Quiz 3',
    'Pharm_Quiz_4': 'Pharm Quiz 4',
  };
  if (map[name]) return map[name];
  // Fallback: replace underscores with spaces
  return String(name || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ---------- Utilities ---------- */
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
function scrollToQuizTop() {
  if (!quiz) return;
  quiz.scrollIntoView({ behavior: 'auto', block: 'start' });
}
function isTextEditingTarget(el){
  return el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/* ---------- State ---------- */
let allQuestions = [];
let run = {
  bank: '',
  displayName: '',      // NEW: human-facing label
  order: [],
  masterPool: [],
  i: 0,
  answered: new Map(),
  uniqueSeen: new Set(),
  thresholdWrong: 0,
  wrongSinceLast: [],
};

/* ---------- Persistence ---------- */
const STORAGE_KEY = 'quizRunState_v1';

function serializeRun() {
  if (!run || !run.order?.length) return null;
  return JSON.stringify({
    bank: run.bank,
    displayName: run.displayName,   // persist pretty name
    order: run.order.map(q => ({ id:q.id, stem:q.stem, options:q.options, correctLetters:q.correctLetters, rationale:q.rationale, type:q.type })),
    masterPool: run.masterPool.map(q => q.id),
    i: run.i,
    answered: Array.from(run.answered.entries()),
    uniqueSeen: Array.from(run.uniqueSeen),
    thresholdWrong: run.thresholdWrong,
    wrongSinceLast: run.wrongSinceLast.map(q => q.id),
    title: pageTitle?.textContent || defaultTitle,
  });
}
function saveRunState() {
  try { const s = serializeRun(); if (s) localStorage.setItem(STORAGE_KEY, s); } catch {}
}
function loadRunState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    const qById = new Map();
    const restoredOrder = (data.order || []).map(q => {
      const qq = { id:String(q.id), stem:String(q.stem||''), options:q.options||{}, correctLetters:(q.correctLetters||[]), rationale:String(q.rationale||''), type:String(q.type||'single_select') };
      qById.set(qq.id, qq);
      return qq;
    });
    const idToQ = (id) => qById.get(id) || null;

    const restored = {
      bank: String(data.bank||''),
      displayName: String(data.displayName || prettifyModuleName(data.bank || '')),
      order: restoredOrder,
      masterPool: (data.masterPool||[]).map(idToQ).filter(Boolean),
      i: Math.max(0, parseInt(data.i||0,10)),
      answered: new Map(Array.isArray(data.answered)?data.answered:[]),
      uniqueSeen: new Set(Array.isArray(data.uniqueSeen)?data.uniqueSeen:[]),
      thresholdWrong: Math.max(1, parseInt(data.thresholdWrong||1,10)),
      wrongSinceLast: (data.wrongSinceLast||[]).map(idToQ).filter(Boolean),
    };
    return { run: restored, title: data.title || defaultTitle };
  } catch { return null; }
}
function clearSavedState(){ try { localStorage.removeItem(STORAGE_KEY); } catch {} }

function showResumeIfAny(){
  const s = loadRunState();
  if (!s || !s.run?.order?.length) {
    resumeBtn.classList.add('hidden');
    return;
  }
  resumeBtn.classList.remove('hidden');
  resumeBtn.onclick = () => {
    run = s.run;
    setHeaderTitle(run.displayName || run.bank || defaultTitle);
    document.title = run.displayName ? `Final Semester Study Guide — ${run.displayName}` :
                   (run.bank ? `Final Semester Study Guide — ${run.bank}` : 'Final Semester Study Guide');

    launcher.classList.add('hidden');
    summary.classList.add('hidden');
    quiz.classList.remove('hidden');
    countersBox.classList.remove('hidden');
    resetAll.classList.remove('hidden');

    const q = currentQuestion();
    if (q) {
      run.uniqueSeen.add(q.id);
      renderQuestion(q);
      updateCounters();
    }
  };
}

/* ---------- Module loading ---------- */
async function fetchModules(){
  try {
    const res = await fetch(`/modules?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('modules failed');
    const data = await res.json();
    const mods = Array.isArray(data.modules) ? data.modules : [];
    return mods.filter(m => m.toLowerCase() !== 'vercel');
  } catch {
    return ["Module_1","Module_2","Module_3","Module_4","Pharm_Quiz_HESI",
            "Learning_Questions_Module_1_2","Learning_Questions_Module_3_4_",
            "Pharmacology_1","Pharmacology_2","Pharmacology_3",
            "Pharm_Quiz_1","Pharm_Quiz_2","Pharm_Quiz_3","Pharm_Quiz_4"];
  }
}
function ensureOption(sel, value, label){
  if (![...sel.options].some(o => o.value === value)){
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label ?? value;
    sel.appendChild(opt);
  }
}
async function initModules(){
  try{
    moduleSel.innerHTML = '';
    const mods = await fetchModules();
    for (const m of mods) ensureOption(moduleSel, m, prettifyModuleName(m));
    if (mods.length) moduleSel.value = mods[0];
  }catch(e){
    console.error('Failed to init modules:', e);
  }
}

/* ---------- Parse/normalize ---------- */
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

/* ---------- Deterministic per-question shuffle ---------- */
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = 0; for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function shuffleQuestionOptions(q) {
  const pairs = Object.entries(q.options).map(([letter, text]) => ({ letter, text }));
  const shuffled = seededShuffle(pairs, q.id);
  const newOptions = {}; const oldToNew = {};
  shuffled.forEach((item, idx) => { const L = String.fromCharCode(65 + idx); newOptions[L] = item.text; oldToNew[item.letter] = L; });
  const newCorrectLetters = (q.correctLetters || []).map(oldL => oldToNew[oldL]).filter(Boolean).sort();
  return { ...q, options: newOptions, correctLetters: newCorrectLetters };
}

/* ---------- Single-action button helpers ---------- */
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

/* ---------- Rendering ---------- */
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

  setActionState('submit');
}

/* ---------- Current info ---------- */
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

/* ---------- Progress ---------- */
function updateProgressBar(){
  if (!progressBar) return;
  const total = run.masterPool.length || 0;
  const mastered = run.masterPool.filter(q => run.answered.get(q.id)?.correct).length;
  const pct = total ? Math.round((mastered/total)*100) : 0;
  progressFill.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', String(pct));
  if (progressLabel) progressLabel.textContent = `${pct}% mastered`;
}

/* ---------- Flow ---------- */
function updateCounters(){
  const uniqueTotal = run.uniqueSeen.size;
  runCounter.textContent = `Question: ${uniqueTotal}`;
  const remaining = run.masterPool.filter(q => !run.answered.get(q.id)?.correct).length;
  remainingCounter.textContent = `Remaining to master: ${remaining}`;
  updateProgressBar();
  saveRunState();
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
  const nextIdx = (run.i ?? 0) + 1;
  if (nextIdx < run.order.length) {
    run.i = nextIdx;
    return { fromBuffer: false, q: run.order[run.i] };
  }
  const notMastered = getNotMastered();
  if (notMastered.length > 0) {
    run.wrongSinceLast = [];
    run.order.push(...notMastered);
    run.i = nextIdx;
    return { fromBuffer: true, q: run.order[run.i] };
  }
  return { fromBuffer: false, q: null };
}

/* ---------- Start / End ---------- */
async function startQuiz(){
  const lenBtn = lengthBtns.querySelector('.seg-btn.active');
  if (!lenBtn) {
    alert('Pick Length Of Quiz Before Starting');
    lengthBtns.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const bank = moduleSel.value;                    // raw filename
  const displayName = prettifyModuleName(bank);    // pretty label to show
  const qty  = (lenBtn.dataset.len === 'full' ? 'full' : parseInt(lenBtn.dataset.len, 10));

  setHeaderTitle(displayName);
  document.title = `Final Semester Study Guide — ${displayName}`;

  startBtn.disabled = true;

  const res = await fetch(`/${encodeURIComponent(bank)}.json`, { cache: 'no-store' });
  if (!res.ok) {
    alert(`Could not load ${bank}.json`);
    startBtn.disabled = false;
    setHeaderTitle(defaultTitle);
    document.title = 'Final Semester Study Guide';
    return;
  }
  const raw = await res.json();
  allQuestions = normalizeQuestions(raw);

  const sampled = sampleQuestions(allQuestions, qty);
  const shuffledQuestions = sampled.map((q) => shuffleQuestionOptions(q));

  run = {
    bank,
    displayName,                 // store pretty name
    order: [...shuffledQuestions],
    masterPool: [...shuffledQuestions],
    i: 0,
    answered: new Map(),
    uniqueSeen: new Set(),
    thresholdWrong: 0,
    wrongSinceLast: [],
  };

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

  setHeaderTitle(run.displayName || run.bank || defaultTitle);
  document.title = run.displayName || run.bank || 'Final Semester Study Guide';

  window.scrollTo({ top: 0, behavior: 'smooth' });

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

  clearSavedState();
}

/* ---------- Event wiring ---------- */
lengthBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn'); if (!btn) return;
  lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-pressed', b.classList.contains('active')?'true':'false'));
});
startBtn.addEventListener('click', startQuiz);
form.addEventListener('change', onSelectionChanged);

/* Single action button (Submit or Next) */
submitBtn.addEventListener('click', () => {
  if (submitBtn.dataset.mode === 'next') {
    scrollToQuizTop();
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

  feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
  feedback.classList.remove('ok','bad');
  feedback.classList.add(isCorrect ? 'ok' : 'bad');

  answerLine.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrectAnswers(q)}`;
  rationaleBox.textContent = q.rationale || '';
  rationaleBox.classList.remove('hidden');

  form.querySelectorAll('input').forEach(i => i.disabled = true);
  setActionState('next');

  scrollToBottomSmooth();
  updateCounters();
});

/* Reset (visible only during quiz) */
resetAll.addEventListener('click', () => { clearSavedState(); location.reload(); });

/* Summary “Start Another Run” */
restartBtn2.addEventListener('click', () => { location.reload(); });

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  if (quiz.classList.contains('hidden')) return;
  if (isTextEditingTarget(e.target)) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  const key = e.key || '';
  const upper = key.toUpperCase();

  if (key === 'Enter') {
    e.preventDefault();
    if (!submitBtn.disabled || submitBtn.dataset.mode === 'next') {
      submitBtn.click();
    }
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

/* ---------- Init ---------- */
initModules();
showResumeIfAny();
