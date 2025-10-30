/* -----------------------------------------------------------
   Final-Semester-Study-Guide - Quiz Frontend
   - SATA answers on separate lines
   - Auto-scroll after submit & on next question
   - Dynamic page title / H1 per selected module
   - Adaptive buffer: 5% for Full, 15% otherwise
   - FULL runs are fully shuffled
   - Summary shows % correct on first try (robust)
----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

// Top bars
const runCounter        = $('runCounter');
const remainingCounter  = $('remainingCounter');

// Launcher
const launcher    = $('launcher');
const moduleSel   = $('moduleSel');
const lengthBtns  = $('lengthBtns');
const startBtn    = $('startBtn');

// Quiz
const quiz          = $('quiz');
const questionText  = $('questionText');
const optionsForm   = $('optionsForm');
const submitBtn     = $('submitBtn');
const nextBtn       = $('nextBtn');
const feedback      = $('feedback');
const answerLine    = $('answerLine');
const rationale     = $('rationale');

// Title
const pageTitleEl = $('pageTitle');
const defaultTitleText = pageTitleEl?.textContent || document.title;
const defaultDocTitle  = document.title;

// Summary + review
const summary        = $('summary');
const reviewEl       = $('review');
const reviewList     = $('reviewList');
const firstTryWrap   = $('firstTrySummary');
const firstTryPctEl  = $('firstTryPct');
const firstTryCntEl  = $('firstTryCount');
const firstTryTotEl  = $('firstTryTotal');

// -------------------- App state --------------------
let state = null;  // null when no quiz is running
let currentInputsByLetter = {};
let pickedLength = 10;

const EXACT_SATA = /\(Select all that apply\.\)/i;

// -------------------- Module discovery --------------------
async function discoverModules(){
  try {
    const res = await fetch(`/modules?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('modules endpoint not available');
    const data = await res.json();
    const mods = (data.modules || []).filter(Boolean);
    if (mods.length) {
      moduleSel.innerHTML = mods.map(m => `<option value="${m}">${m}</option>`).join('');
    }
  } catch {
    // Fallback probe for a likely bank under the new naming
    fetch('/Final-Semester-Study-Guide_Pharm_Quiz_HESI.json', { method: 'HEAD' })
      .then(r => { if (r.ok) moduleSel.add(new Option('Final-Semester-Study-Guide_Pharm_Quiz_HESI', 'Final-Semester-Study-Guide_Pharm_Quiz_HESI')); })
      .catch(() => {});
  }
}
discoverModules();

// -------------------- Length selection --------------------
lengthBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-len]');
  if (!btn) return;
  [...lengthBtns.querySelectorAll('.seg-btn')].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  pickedLength = btn.dataset.len === 'full' ? 'full' : parseInt(btn.dataset.len, 10);
});

// -------------------- Sampling helpers --------------------
function randomInt(max){
  if (max <= 0) return 0;
  if (window.crypto && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleQuestions(arr, requested){
  const copy = arr.slice();
  if (requested === 'full' || requested >= copy.length) {
    return shuffleInPlace(copy); // FULL: fully randomized
  }
  const k = Math.max(0, requested | 0);
  for (let i = 0; i < k; i++) {
    const j = i + randomInt(copy.length - i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

// -------------------- Normalization --------------------
function normalizeQuestions(raw){
  const items = Array.isArray(raw) ? raw : (raw.questions || raw.Questions || []);
  let idCounter = 1;

  return items.map((item) => {
    const q = {};
    q.id = item.id || `q${idCounter++}`;

    // Stem
    q.question = (item.question || item.stem || item.prompt || '').toString().trim();

    // Options can be object {A:"",B:""} or array
    let options = item.options || item.choices || item.answers || item.Options || null;

    if (Array.isArray(options)) {
      const obj = {};
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      options.forEach((opt, i) => {
        const text = typeof opt === 'string' ? opt : (opt.text || opt.label || opt.value || '');
        obj[letters[i]] = text;
      });
      q.options = obj;
    } else if (options && typeof options === 'object') {
      const obj = {};
      for (const [k,v] of Object.entries(options)) {
        const letter = (k.match(/[A-Z]/i) ? k.toUpperCase() : null);
        if (letter) obj[letter] = typeof v === 'string' ? v : (v && (v.text || v.value || '')) || '';
      }
      q.options = obj;
    } else {
      q.options = { A: 'Option 1', B: 'Option 2', C: 'Option 3', D: 'Option 4' };
    }

    // Correct answers -> array of letters
    const corr = item.correct ?? item.answer ?? item.answers ?? item.Correct ?? item.correct_answer ?? item.correctAnswers;
    q.correctLetters = toLetterArray(corr, q.options);

    // Rationale / explanation
    q.rationale = (item.rationale || item.explanation || item.reason || '').toString();

    // Keep type if provided; fallback to SATA detection later
    q.type = item.type || null;

    return q;
  }).filter(q => q.question && Object.keys(q.options).length);
}

function toLetterArray(val, optionsObj){
  if (!val) return [];
  const letters = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));

  if (Array.isArray(val)) {
    const arr = [];
    for (const v of val) {
      if (typeof v === 'string' && letters.has(v.toUpperCase())) {
        arr.push(v.toUpperCase());
      } else if (typeof v === 'number') {
        const idx = v|0;
        const letter = indexToLetter(idx);
        if (optionsObj[letter]) arr.push(letter);
      } else if (typeof v === 'string') {
        const letter = findLetterByText(v, optionsObj);
        if (letter) arr.push(letter);
      }
    }
    return [...new Set(arr)];
  }

  if (typeof val === 'string') {
    const s = val.toUpperCase();
    const found = s.match(/[A-Z]/g);
    if (found) return [...new Set(found)];
    const byText = findLetterByText(val, optionsObj);
    return byText ? [byText] : [];
  }

  if (typeof val === 'number') {
    const letter = indexToLetter(val|0);
    return optionsObj[letter] ? [letter] : [];
  }

  return [];
}

function indexToLetter(i){
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return letters[i] || 'A';
}

function findLetterByText(text, optionsObj){
  const norm = (''+text).trim().toLowerCase();
  for (const [L, t] of Object.entries(optionsObj)) {
    if ((t||'').toString().trim().toLowerCase() === norm) return L;
  }
  return null;
}

// -------------------- Adaptive wrong buffer --------------------
let wrongBuffer = [];
let wrongBufferSet = new Set();
let wrongSinceInjection = 0;
let reinjectThreshold = 1;

function initAdaptiveBufferForQuiz(){
  wrongBuffer = [];
  wrongBufferSet = new Set();
  wrongSinceInjection = 0;

  const n = state.totalRequested || 0;
  const pct = state.isFullRun ? 0.05 : 0.15;   // 5% for Full, 15% otherwise
  reinjectThreshold = Math.max(1, Math.ceil(n * pct));
}

function addToWrongBuffer(q){
  if (!wrongBufferSet.has(q.id)) {
    wrongBuffer.push(q);
    wrongBufferSet.add(q.id);
  }
}

function removeFromWrongBufferById(id){
  if (wrongBufferSet.has(id)) {
    wrongBuffer = wrongBuffer.filter(x => x.id !== id);
    wrongBufferSet.delete(id);
  }
}

function maybeInjectWrongBuffer(){
  if ((wrongSinceInjection >= reinjectThreshold && wrongBuffer.length) ||
      (state.queue.length === 0 && wrongBuffer.length)) {
    state.queue = wrongBuffer.splice(0).concat(state.queue);
    wrongBufferSet.clear();
    wrongSinceInjection = 0;
    updateCounters();
  }
}

// -------------------- Rendering & interactions --------------------
function renderQuestion(q){
  const isMulti = q.type === 'multi_select' || EXACT_SATA.test(q.question);
  const type = isMulti ? 'checkbox' : 'radio';

  questionText.textContent = q.question;
  optionsForm.innerHTML = '';
  currentInputsByLetter = {};

  const letters = Object.keys(q.options);
  letters.forEach(letter => {
    const id = `opt-${letter}`;
    const label = document.createElement('label');
    label.className = 'opt';
    label.setAttribute('for', id);

    const input = document.createElement('input');
    input.type = type;
    input.name = 'opt';
    input.id = id;
    input.value = letter;

    const text = document.createElement('span');
    text.innerHTML = `<span class="letter">${letter}.</span> ${escapeHTML(q.options[letter])}`;

    currentInputsByLetter[letter] = input;

    label.append(input, text);
    optionsForm.appendChild(label);
  });

  optionsForm.addEventListener('change', updateSubmitEnabled);

  submitBtn.disabled = true;
  nextBtn.disabled = true;

  feedback.textContent = '';
  feedback.className = 'feedback';
  answerLine.innerHTML = '';

  // Hide rationale until submit
  rationale.textContent = '';
  rationale.classList.add('hidden');

  // Scroll the card to the top when a question is presented
  requestAnimationFrame(() => {
    quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function updateSubmitEnabled(){
  const anyChecked = optionsForm.querySelector('input:checked') !== null;
  submitBtn.disabled = !anyChecked;
}

function formatCorrectAnswers(q){
  const letters = q.correctLetters?.length ? q.correctLetters : [];
  const parts = letters.map(L => `${L}. ${q.options[L] ?? ''}`);

  // SATA (multi) -> each on its own line; single -> inline
  const isMulti = (q.type === 'multi_select') || EXACT_SATA.test(q.question) || (letters.length > 1);
  return isMulti ? parts.join('<br>') : parts.join('  •  ');
}

function setsEqual(aSet, bSet){
  if (aSet.size !== bSet.size) return false;
  for (const v of aSet) if (!bSet.has(v)) return false;
  return true;
}

function loadNext(){
  maybeInjectWrongBuffer();

  if (state.queue.length === 0) {
    quiz.classList.add('hidden');
    summary.classList.remove('hidden');

    // Robust first-try stats computed from final pool
    const total = state.totalRequested || 0;
    const first = (state.pool || []).filter(q => q.firstTryCorrect).length;
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
  state.pool[state.idx] = q;
  state.idx = 0;
  state.shownCount += 1;

  renderQuestion(q);
  updateCounters();
}

function buildReviewItemHTML(entry){
  const q = entry.q;
  const correct = entry.correctLetters || [];
  const user = entry.userLetters || [];
  const isCorrect = entry.wasCorrect;

  const correctText = correct.map(L => `${L}. ${escapeHTML(q.options[L] || '')}`).join('<br>');
  const userText = user.map(L => `${L}. ${escapeHTML(q.options[L] || '')}`).join('<br>');

  const rationaleHTML = q.rationale ? `<div class="rev-rationale"><strong>Rationale:</strong> ${escapeHTML(q.rationale)}</div>` : '';

  return `
    <div class="rev-item ${isCorrect ? 'ok' : 'bad'}">
      <div class="rev-q">${escapeHTML(q.question)}</div>
      <div class="rev-ans"><strong>Correct:</strong><br>${correctText || '(none provided)'}</div>
      <div class="rev-user"><strong>Your answer:</strong><br>${userText || '(none)'}</div>
      ${rationaleHTML}
    </div>
  `;
}

// -------------------- Handlers --------------------
async function startQuiz(){
  startBtn.disabled = true;

  try {
    const selected = moduleSel.value;
    if (!selected) throw new Error('Select a module first.');
    const bankName = `${selected}.json`;

    const res = await fetch(`/${bankName}?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch ${bankName}`);

    const text = await res.text();
    const data = JSON.parse(text);

    const all = normalizeQuestions(data);
    const chosen = sampleQuestions(all, pickedLength);

    state = {
      pool: chosen.map(q => ({ ...q, attempts: 0, mastered: false, firstTryCorrect: false })),
      queue: chosen.slice(),
      idx: 0,
      shownCount: 0,
      review: [],
      totalRequested: chosen.length,
      isFullRun: (pickedLength === 'full') || (chosen.length === all.length)
    };

    // Dynamic page title/H1
    document.title = selected;
    if (pageTitleEl) pageTitleEl.textContent = selected;

    initAdaptiveBufferForQuiz();

    launcher.classList.add('hidden');
    summary.classList.add('hidden');
    quiz.classList.remove('hidden');

    updateCounters();
    nextBtn.disabled = true;
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
  const q = state?.pool[state?.idx];
  if (!q) return;

  const picked = [...optionsForm.querySelectorAll('input:checked')].map(i => i.value);
  if (picked.length === 0) return;

  q.attempts += 1;

  const correctSet = new Set((q.correctLetters || []).map(s => s.toUpperCase()));
  const pickedSet = new Set(picked.map(s => s.toUpperCase()));
  const isCorrect = setsEqual(correctSet, pickedSet);

  const fullCorrectText = formatCorrectAnswers(q);

  if (isCorrect) {
    if (q.attempts === 1) q.firstTryCorrect = true; // <-- critical fix
    q.mastered = true;

    feedback.textContent = 'Correct!';
    feedback.className = 'feedback ok';
    answerLine.innerHTML = `<div class="answerText">${fullCorrectText}</div>`;

    removeFromWrongBufferById(q.id);
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

  // Show rationale only after submit
  if (q.rationale && q.rationale.trim()) {
    rationale.textContent = q.rationale;
    rationale.classList.remove('hidden');
  } else {
    rationale.textContent = '';
    rationale.classList.add('hidden');
  }

  // Auto-scroll to show the complete answer + rationale
  requestAnimationFrame(() => {
    (rationale.textContent ? rationale : answerLine).scrollIntoView({ behavior: 'smooth', block: 'end' });
  });

  // Record latest outcome for review
  const correctLettersCopy = [...correctSet];
  const pickedLettersCopy  = [...pickedSet];
  const existing = state.review.find(r => r.q.id === q.id);
  if (existing) {
    existing.userLetters = pickedLettersCopy;
    existing.wasCorrect  = isCorrect;
  } else {
    state.review.push({ q, correctLetters: correctLettersCopy, userLetters: pickedLettersCopy, wasCorrect: isCorrect });
  }

  submitBtn.disabled = true;
  nextBtn.disabled = false;

  updateCounters();
}

function resetQuiz(){
  // Clear state
  state = null;

  // Clear adaptive buffer
  wrongBuffer = [];
  wrongBufferSet = new Set();
  wrongSinceInjection = 0;

  // Restore titles
  document.title = defaultDocTitle;
  if (pageTitleEl) pageTitleEl.textContent = defaultTitleText;

  // Hide quiz UI, show launcher
  quiz.classList.add('hidden');
  summary.classList.add('hidden');
  launcher.classList.remove('hidden');

  // Reset UI pieces
  runCounter.textContent = '';
  remainingCounter.textContent = '';
  optionsForm.innerHTML = '';
  feedback.textContent = '';
  feedback.className = 'feedback';
  answerLine.innerHTML = '';

  // Hide rationale
  rationale.textContent = '';
  rationale.classList.add('hidden');

  // Hide summary stat values
  if (firstTryWrap) firstTryWrap.classList.add('hidden');
  if (firstTryPctEl) firstTryPctEl.textContent = '0%';
  if (firstTryCntEl) firstTryCntEl.textContent = '0';
  if (firstTryTotEl) firstTryTotEl.textContent = '0';

  submitBtn.disabled = true;
  nextBtn.disabled = true;

  currentInputsByLetter = {};
}

// -------------------- Counters --------------------
function updateCounters(){
  if (!state) { runCounter.textContent=''; remainingCounter.textContent=''; return; }
  const shown = state.shownCount || 0;
  const total = state.totalRequested || 0;

  const remaining = (state.queue.length) + wrongBuffer.length;
  // Show real current index starting at 1
  const currentNumber = Math.min(shown + 0, total) || 1; // shown increments when question loads
  runCounter.textContent = `Question: ${currentNumber}`;
  remainingCounter.textContent = `Remaining to master: ${remaining}`;
}

// -------------------- Keyboard --------------------
document.addEventListener('keydown', (e) => {
  if (quiz.classList.contains('hidden')) return;

  if (e.key === 'Enter') {
    const canSubmit = !submitBtn.disabled;
    const canNext = !nextBtn.disabled;
    if (canSubmit) {
      e.preventDefault();
      handleSubmit();
    } else if (canNext) {
      e.preventDefault();
      loadNext();
      requestAnimationFrame(() => {
        quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    return;
  }

  const letter = (e.key && e.key.length === 1) ? e.key.toUpperCase() : '';
  if (letter && currentInputsByLetter[letter]) {
    e.preventDefault();
    const input = currentInputsByLetter[letter];

    if (input.type === 'checkbox') {
      input.checked = !input.checked;
    } else if (input.type === 'radio') {
      if (input.checked) {
        input.checked = false;
      } else {
        input.checked = true;
      }
      if (input.checked) {
        [...optionsForm.querySelectorAll('input[type="radio"]')].forEach(r => {
          if (r !== input) r.checked = false;
        });
      }
    }
    updateSubmitEnabled();
  }
});

// -------------------- Event wiring --------------------
startBtn.addEventListener('click', startQuiz);
submitBtn.addEventListener('click', handleSubmit);
nextBtn.addEventListener('click', () => {
  loadNext();
  requestAnimationFrame(() => {
    quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// Bind to ANY plausible reset trigger
const resetCandidates = [
  document.getElementById('restartBtn'),
  document.getElementById('resetBtn'),
  document.querySelector('[data-reset]'),
  document.querySelector('.reset-quiz')
].filter(Boolean);

resetCandidates.forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    resetQuiz();
  });
});

// Delegated safety net for dynamically-rendered reset buttons
document.addEventListener('click', (e) => {
  const t = e.target.closest('#restartBtn, #resetBtn, [data-reset], .reset-quiz');
  if (!t) return;
  e.preventDefault();
  resetQuiz();
});

// -------------------- Utils --------------------
function escapeHTML(s=''){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
