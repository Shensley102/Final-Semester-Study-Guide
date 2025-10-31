/* -----------------------------------------------------------
   Final-Semester-Study-Guide - Quiz Frontend
   One-button flow:
     - Submit ➜ Next (same size, green) after submission
   Counting & grading:
     - Question counts every attempt (retries included)
     - Remaining only drops on correct submission
     - First-try % = (# first-try correct / total unique)
   Plus: SATA line breaks, scroll-to-bottom after submit,
         dynamic title, 5%/15% reinforcement, keyboard shortcuts.
   Results page: "Your answer" REMOVED.
----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

// Top info
const runCounter       = $('runCounter');
const remainingCounter = $('remainingCounter');

// Launcher
const launcher   = $('launcher');
const moduleSel  = $('moduleSel');
const lengthBtns = $('lengthBtns');
const startBtn   = $('startBtn');

// Quiz UI
const quiz          = $('quiz');
const questionText  = $('questionText');
const optionsForm   = $('optionsForm');
const submitBtn     = $('submitBtn');   // morphs from Submit ➜ Next
const nextBtn       = $('nextBtn');     // hidden via CSS
const feedback      = $('feedback');
const answerLine    = $('answerLine');
const rationale     = $('rationale');

// Titles
const pageTitleEl      = $('pageTitle');
const defaultTitleText = pageTitleEl?.textContent || document.title;
const defaultDocTitle  = document.title;

// Results
const summary       = $('summary');
const reviewEl      = $('review');
const reviewList    = $('reviewList');
const firstTryWrap  = $('firstTrySummary');
const firstTryPctEl = $('firstTryPct');
const firstTryCntEl = $('firstTryCount');
const firstTryTotEl = $('firstTryTotal');

// State
let state = null;
let currentInputsByLetter = {};
let pickedLength = 10;
let btnMode = 'submit';  // 'submit' | 'next'

const EXACT_SATA = /\(Select all that apply\.\)/i;

/* ---------- Module discovery ---------- */
async function discoverModules() {
  try {
    const res = await fetch(`/modules?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const mods = (data.modules || []).filter(Boolean);
    if (mods.length) {
      moduleSel.innerHTML = mods.map(m => `<option value="${m}">${m}</option>`).join('');
    }
  } catch {
    fetch('/Final-Semester-Study-Guide_Pharm_Quiz_HESI.json', { method: 'HEAD' })
      .then(r => { if (r.ok) moduleSel.add(new Option('Final-Semester-Study-Guide_Pharm_Quiz_HESI', 'Final-Semester-Study-Guide_Pharm_Quiz_HESI')); })
      .catch(() => {});
  }
}
discoverModules();

/* ---------- Length selection ---------- */
lengthBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-len]');
  if (!btn) return;
  [...lengthBtns.querySelectorAll('.seg-btn')].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  pickedLength = btn.dataset.len === 'full' ? 'full' : parseInt(btn.dataset.len, 10);
});

/* ---------- Helpers ---------- */
function randomInt(max){
  if (max <= 0) return 0;
  if (crypto?.getRandomValues) { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % max; }
  return Math.floor(Math.random() * max);
}
function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--) { const j = randomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function sampleQuestions(all, req){
  const a = all.slice();
  if (req === 'full' || req >= a.length) return shuffleInPlace(a);
  const k = Math.max(0, req|0);
  for (let i = 0; i < k; i++) { const j = i + randomInt(a.length - i); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}

/* ---------- Normalize banks ---------- */
function normalizeQuestions(raw){
  const items = Array.isArray(raw) ? raw : (raw.questions || raw.Questions || []);
  let idCounter = 1;
  return items.map((item) => {
    const q = {};
    q.id = item.id || `q${idCounter++}`;
    q.question = (item.question || item.stem || item.prompt || '').toString().trim();

    let options = item.options || item.choices || item.answers || item.Options || null;
    if (Array.isArray(options)) {
      const obj = {}, L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      options.forEach((opt, i) => {
        const t = typeof opt === 'string' ? opt : (opt?.text ?? opt?.label ?? opt?.value ?? '');
        obj[L[i]] = t;
      });
      q.options = obj;
    } else if (options && typeof options === 'object') {
      const obj = {};
      for (const [k,v] of Object.entries(options)) {
        const letter = (k.match(/[A-Z]/i) ? k.toUpperCase() : null);
        if (letter) obj[letter] = typeof v === 'string' ? v : (v?.text ?? v?.value ?? '');
      }
      q.options = obj;
    } else {
      q.options = { A:'Option 1', B:'Option 2', C:'Option 3', D:'Option 4' };
    }

    const corr = item.correct ?? item.answer ?? item.answers ?? item.Correct ?? item.correct_answer ?? item.correctAnswers;
    q.correctLetters = toLetterArray(corr, q.options);

    q.rationale = (item.rationale || item.explanation || item.reason || '').toString();
    q.type = item.type || null;

    // runtime
    q.attempts = 0;            // submissions of THIS question
    q.firstTryCorrect = null;  // set true/false on first submission; never changed later
    q.mastered = false;        // first correct ➜ mastered

    return q;
  }).filter(q => q.question && Object.keys(q.options).length);
}
function toLetterArray(val, optionsObj){
  if (!val) return [];
  const letters = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
  if (Array.isArray(val)) {
    const out = [];
    for (const v of val) {
      if (typeof v === 'string' && letters.has(v.toUpperCase())) out.push(v.toUpperCase());
      else if (typeof v === 'number') { const L = indexToLetter(v|0); if (optionsObj[L]) out.push(L); }
      else if (typeof v === 'string') { const L = findLetterByText(v, optionsObj); if (L) out.push(L); }
    }
    return [...new Set(out)];
  }
  if (typeof val === 'string') {
    const s = val.toUpperCase(), found = s.match(/[A-Z]/g);
    if (found) return [...new Set(found)];
    const L = findLetterByText(val, optionsObj);
    return L ? [L] : [];
  }
  if (typeof val === 'number') { const L = indexToLetter(val|0); return optionsObj[L] ? [L] : []; }
  return [];
}
function indexToLetter(i){ return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i] || 'A'; }
function findLetterByText(text, optionsObj){
  const norm = (''+text).trim().toLowerCase();
  for (const [L,t] of Object.entries(optionsObj)) if ((t||'').toString().trim().toLowerCase() === norm) return L;
  return null;
}

/* ---------- Adaptive "wrong buffer" ---------- */
let wrongBuffer = [];
let wrongBufferSet = new Set();
let wrongSinceInjection = 0;
let reinjectThreshold = 1;

function initAdaptiveBufferForQuiz(){
  wrongBuffer = []; wrongBufferSet = new Set(); wrongSinceInjection = 0;
  const n = state.totalRequested || 0;
  const pct = state.isFullRun ? 0.05 : 0.15;            // 5% for full, 15% otherwise
  reinjectThreshold = Math.max(1, Math.ceil(n * pct));
}
function addToWrongBuffer(q){ if (!wrongBufferSet.has(q.id)) { wrongBuffer.push(q); wrongBufferSet.add(q.id); } }
function removeFromWrongBufferById(id){
  if (wrongBufferSet.has(id)) { wrongBuffer = wrongBuffer.filter(x => x.id !== id); wrongBufferSet.delete(id); }
}
function maybeInjectWrongBuffer(){
  if ((wrongSinceInjection >= reinjectThreshold && wrongBuffer.length) ||
      (state.queue.length === 0 && wrongBuffer.length)) {
    state.queue = wrongBuffer.splice(0).concat(state.queue);
    wrongBufferSet.clear();
    wrongSinceInjection = 0;
  }
}

/* ---------- One-button mode ---------- */
function setButtonMode(mode){
  btnMode = mode;
  if (mode === 'submit') {
    submitBtn.textContent = 'Submit';
    submitBtn.classList.remove('success'); // blue (default)
    submitBtn.disabled = true;             // enabled once an option is chosen
  } else {
    submitBtn.textContent = 'Next';
    submitBtn.classList.add('success');    // green
    submitBtn.disabled = false;
  }
}

// Single handler for both actions
submitBtn.addEventListener('click', () => {
  if (btnMode === 'submit') {
    if (!submitBtn.disabled) handleSubmit();
  } else {
    goNext();
  }
});

/* ---------- Rendering & flow ---------- */
function renderQuestion(q){
  const isMulti = q.type === 'multi_select' || EXACT_SATA.test(q.question);
  const type = isMulti ? 'checkbox' : 'radio';

  questionText.textContent = q.question;
  optionsForm.innerHTML = '';
  currentInputsByLetter = {};

  for (const letter of Object.keys(q.options)) {
    const id = `opt-${letter}`;
    const label = document.createElement('label');
    label.className = 'opt';
    label.setAttribute('for', id);

    const input = document.createElement('input');
    input.type = type; input.name = 'opt'; input.id = id; input.value = letter;

    const span = document.createElement('span');
    span.innerHTML = `<span class="letter">${letter}.</span> ${escapeHTML(q.options[letter])}`;

    currentInputsByLetter[letter] = input;
    label.append(input, span);
    optionsForm.appendChild(label);
  }

  optionsForm.addEventListener('change', updateSubmitEnabled);

  feedback.textContent = '';
  feedback.className = 'feedback';
  answerLine.innerHTML = '';

  rationale.textContent = '';
  rationale.classList.add('hidden');

  setButtonMode('submit'); // reset for new question

  updateCounters();        // show attempts+1
  requestAnimationFrame(() => { quiz.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
function updateSubmitEnabled(){
  if (btnMode === 'submit') submitBtn.disabled = !optionsForm.querySelector('input:checked');
}
function setsEqual(aSet, bSet){
  if (aSet.size !== bSet.size) return false;
  for (const v of aSet) if (!bSet.has(v)) return false;
  return true;
}
function formatCorrectAnswers(q){
  const letters = q.correctLetters ?? [];
  const parts = letters.map(L => `${L}. ${q.options[L] ?? ''}`);
  const multi = (q.type === 'multi_select') || EXACT_SATA.test(q.question) || (letters.length > 1);
  return multi ? parts.join('<br>') : parts.join('  •  ');
}

function loadNext(){
  maybeInjectWrongBuffer();

  if (state.queue.length === 0) {
    // End of run
    quiz.classList.add('hidden');
    summary.classList.remove('hidden');

    const total = state.totalRequested || 0;
    const first = state.questions.filter(q => q.firstTryCorrect === true).length;
    const pct = total ? Math.round((first / total) * 100) : 0;

    if (firstTryPctEl) firstTryPctEl.textContent = `${pct}%`;
    if (firstTryCntEl) firstTryCntEl.textContent = String(first);
    if (firstTryTotEl) firstTryTotEl.textContent = String(total);
    if (firstTryWrap) firstTryWrap.classList.remove('hidden');

    reviewEl.open = false;
    reviewList.innerHTML = state.review.map(buildReviewItemHTML).join('');

    runCounter.textContent = `Run complete — ${total} questions`;
    remainingCounter.textContent = '';
    return;
  }

  const q = state.queue.shift();
  state.current = q;
  renderQuestion(q);
}
function goNext(){
  loadNext();
  requestAnimationFrame(() => {
    quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* --------- Review list item (NO "Your answer" block) --------- */
function buildReviewItemHTML(entry){
  const q = entry.q;
  const correct = entry.correctLetters || [];
  const isCorrect = entry.wasCorrect;

  const correctText = correct.map(L => `${L}. ${escapeHTML(q.options[L] || '')}`).join('<br>');
  const rationaleHTML = q.rationale ? `<div class="rev-rationale"><strong>Rationale:</strong> ${escapeHTML(q.rationale)}</div>` : '';

  return `
    <div class="rev-item ${isCorrect ? 'ok' : 'bad'}">
      <div class="rev-q">${escapeHTML(q.question)}</div>
      <div class="rev-ans"><strong>Correct:</strong><br>${correctText || '(none provided)'}</div>
      ${rationaleHTML}
    </div>
  `;
}

/* ---------- Start / Submit / Reset ---------- */
async function startQuiz(){
  startBtn.disabled = true;
  try {
    const selected = moduleSel.value;
    if (!selected) throw new Error('Select a module first.');
    const bankName = `${selected}.json`;

    const res = await fetch(`/${bankName}?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch ${bankName}`);
    const data = await res.json();

    const all = normalizeQuestions(data);
    const chosen = sampleQuestions(all, pickedLength);

    state = {
      questions: chosen,
      queue: chosen.slice(),
      review: [],
      attemptedCount: 0,      // all attempts (retries included)
      masteredCount: 0,       // unique mastered
      totalRequested: chosen.length,
      current: null,
      isFullRun: (pickedLength === 'full') || (chosen.length === all.length)
    };

    document.title = selected;
    if (pageTitleEl) pageTitleEl.textContent = selected;

    initAdaptiveBufferForQuiz();

    launcher.classList.add('hidden');
    summary.classList.add('hidden');
    quiz.classList.remove('hidden');

    feedback.textContent = '';
    feedback.className = 'feedback';
    answerLine.innerHTML = '';
    rationale.textContent = '';
    rationale.classList.add('hidden');

    loadNext();
  } catch (err) {
    alert(err.message || 'Could not load questions.');
  } finally {
    startBtn.disabled = false;
  }
}

function handleSubmit(){
  const q = state?.current;
  if (!q) return;

  const picked = [...optionsForm.querySelectorAll('input:checked')].map(i => i.value);
  if (picked.length === 0) return;

  // Count every attempt
  state.attemptedCount += 1;
  const firstSubmission = (q.attempts === 0);
  q.attempts += 1;

  const correctSet = new Set((q.correctLetters || []).map(s => s.toUpperCase()));
  const pickedSet  = new Set(picked.map(s => s.toUpperCase()));
  const isCorrect  = setsEqual(correctSet, pickedSet);

  const fullCorrectText = formatCorrectAnswers(q);

  // Record first-try outcome exactly once
  if (firstSubmission) q.firstTryCorrect = !!isCorrect;

  if (isCorrect) {
    if (!q.mastered) {
      q.mastered = true;
      state.masteredCount += 1;     // Remaining only drops here
      removeFromWrongBufferById(q.id);
    }
    feedback.textContent = 'Correct!';
    feedback.className = 'feedback ok';
    answerLine.innerHTML = `<div class="answerText">${fullCorrectText}</div>`;
  } else {
    feedback.textContent = 'Incorrect.';
    feedback.className = 'feedback bad';
    answerLine.innerHTML = `
      <div class="answerLabel">Correct Answer:</div>
      <div class="answerText">${fullCorrectText}</div>
    `;
    addToWrongBuffer(q);
    wrongSinceInjection += 1;
  }

  // Rationale only after submit
  if (q.rationale && q.rationale.trim()) {
    rationale.textContent = q.rationale;
    rationale.classList.remove('hidden');
  } else {
    rationale.textContent = '';
    rationale.classList.add('hidden');
  }

  // Review log (latest outcome wins) — still track correctness internally
  const correctLettersCopy = [...correctSet];
  const pickedLettersCopy  = [...pickedSet];
  const existing = state.review.find(r => r.q.id === q.id);
  if (existing) { existing.userLetters = pickedLettersCopy; existing.wasCorrect = isCorrect; }
  else { state.review.push({ q, correctLetters: correctLettersCopy, userLetters: pickedLettersCopy, wasCorrect: isCorrect }); }

  // Scroll entire page to bottom so the rationale is fully visible
  scrollToBottomSmooth();

  // Switch to "Next" mode (green)
  setButtonMode('next');

  // Update counters for the upcoming attempt (attempts + 1)
  updateCounters();
}

function resetQuiz(){
  state = null;

  wrongBuffer = []; wrongBufferSet = new Set(); wrongSinceInjection = 0;

  document.title = defaultDocTitle;
  if (pageTitleEl) pageTitleEl.textContent = defaultTitleText;

  quiz.classList.add('hidden');
  summary.classList.add('hidden');
  launcher.classList.remove('hidden');

  runCounter.textContent = '';
  remainingCounter.textContent = '';
  optionsForm.innerHTML = '';
  feedback.textContent = '';
  feedback.className = 'feedback';
  answerLine.innerHTML = '';
  rationale.textContent = '';
  rationale.classList.add('hidden');

  if (firstTryWrap) firstTryWrap.classList.add('hidden');
  if (firstTryPctEl) firstTryPctEl.textContent = '0%';
  if (firstTryCntEl) firstTryCntEl.textContent = '0';
  if (firstTryTotEl) firstTryTotEl.textContent = '0';

  setButtonMode('submit');
  currentInputsByLetter = {};
}

/* ---------- Counters ---------- */
function updateCounters(){
  if (!state) { runCounter.textContent=''; remainingCounter.textContent=''; return; }
  const currentAttemptNumber = state.attemptedCount + 1;     // keeps rising with repeats
  runCounter.textContent = `Question: ${currentAttemptNumber}`;

  const remaining = Math.max(0, (state.totalRequested || 0) - (state.masteredCount || 0));
  remainingCounter.textContent = `Remaining to master: ${remaining}`;
}

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  if (quiz.classList.contains('hidden')) return;

  if (e.key === 'Enter') {
    if (btnMode === 'submit') {
      if (!submitBtn.disabled) { e.preventDefault(); handleSubmit(); }
    } else {
      e.preventDefault(); goNext();
    }
    return;
  }

  // Letter shortcuts A..Z
  const L = (e.key && e.key.length === 1) ? e.key.toUpperCase() : '';
  if (L && currentInputsByLetter[L]) {
    e.preventDefault();
    const input = currentInputsByLetter[L];
    if (input.type === 'checkbox') input.checked = !input.checked;
    else if (input.type === 'radio') {
      input.checked = !input.checked ? true : false;
      if (input.checked) [...optionsForm.querySelectorAll('input[type="radio"]')].forEach(r => { if (r !== input) r.checked = false; });
    }
    updateSubmitEnabled();
  }
});

/* ---------- Events ---------- */
startBtn.addEventListener('click', startQuiz);

// Reset (quiz + results)
[
  document.getElementById('restartBtn'),
  document.getElementById('restartBtnSummary'),
  document.getElementById('resetBtn'),
  document.querySelector('[data-reset]'),
  document.querySelector('.reset-quiz')
].filter(Boolean).forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); resetQuiz(); }));

document.addEventListener('click', (e) => {
  const t = e.target.closest('#restartBtn, #restartBtnSummary, #resetBtn, [data-reset], .reset-quiz');
  if (!t) return; e.preventDefault(); resetQuiz();
});

/* ---------- Utils ---------- */
function escapeHTML(s=''){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

/* Smoothly scroll the entire page to the very bottom AFTER rationale paints */
function scrollToBottomSmooth() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    });
  });
}
