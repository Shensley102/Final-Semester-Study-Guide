/* -----------------------------------------------------------
   Study Quiz - frontend
   - Discovers available banks from /modules
   - Fetches <name>.json and normalizes into internal format
   - Random sampling (10/25/50/100/Full)
   - Mastery loop + adaptive "wrong buffer" reinjection
   - Keyboard support: Enter (submit/next), A–Z toggle
   - Rationale is hidden until AFTER submit
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

// Summary + review
const summary     = $('summary');
const restartBtn  = $('restartBtn');
const reviewEl    = $('review');
const reviewList  = $('reviewList');

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
    // Fallback: let any options in the HTML remain, and try a light probe
    fetch('/Pharm_Quiz_HESI.json', { method: 'HEAD' })
      .then(r => { if (r.ok) moduleSel.add(new Option('Pharm_Quiz_HESI', 'Pharm_Quiz_HESI')); })
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

function sampleQuestions(arr, requested){
  const copy = arr.slice();
  if (requested === 'full' || requested >= copy.length) return copy;

  const k = Math.max(0, requested | 0);
  // partial Fisher–Yates
  for (let i = 0; i < k; i++) {
    const j = i + randomInt(copy.length - i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

// -------------------- Normalization --------------------
function normalizeQuestions(raw){
  // Some banks use { questions: [...] }, others are already arrays.
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
      // Convert array -> letters
      const obj = {};
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      options.forEach((opt, i) => {
        const text = typeof opt === 'string' ? opt
                   : (opt.text || opt.label || opt.value || '');
        obj[letters[i]] = text;
      });
      q.options = obj;
    } else if (options && typeof options === 'object') {
      // Normalize keys to letters A, B, C...
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

  // If already array
  if (Array.isArray(val)) {
    const arr = [];
    for (const v of val) {
      if (typeof v === 'string' && letters.has(v.toUpperCase())) {
        arr.push(v.toUpperCase());
      } else if (typeof v === 'number') {
        // index -> letter
        const idx = v|0;
        const letter = indexToLetter(idx);
        if (optionsObj[letter]) arr.push(letter);
      } else if (typeof v === 'string') {
        // try to match by option text
        const letter = findLetterByText(v, optionsObj);
        if (letter) arr.push(letter);
      }
    }
    return [...new Set(arr)];
  }

  if (typeof val === 'string') {
    // Handle "B", "AC", "A, C", "B and D", etc.
    const s = val.toUpperCase();
    const found = s.match(/[A-Z]/g);
    if (found) return [...new Set(found)];
    // Maybe it's full text
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
  reinjectThreshold = Math.max(1, Math.ceil(n * 0.15));
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
  // Inject if threshold met OR when queue drained but buffer still has items
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

  // Enable/disable submit whenever selection changes
  optionsForm.addEventListener('change', updateSubmitEnabled);

  submitBtn.disabled = true;
  nextBtn.disabled = true;

  feedback.textContent = '';
  feedback.className = 'feedback';
  answerLine.innerHTML = '';

  // Hide rationale until submit
  rationale.textContent = '';
  rationale.classList.add('hidden');
}

function updateSubmitEnabled(){
  const anyChecked = optionsForm.querySelector('input:checked') !== null;
  submitBtn.disabled = !anyChecked;
}

function formatCorrectAnswers(q){
  const letters = q.correctLetters?.length ? q.correctLetters : [];
  const parts = letters.map(L => `${L}. ${q.options[L] ?? ''}`);
  return parts.join('  •  ');
}

function setsEqual(aSet, bSet){
  if (aSet.size !== bSet.size) return false;
  for (const v of aSet) if (!bSet.has(v)) return false;
  return true;
}

function loadNext(){
  // If queue empty, try to inject wrong buffer
  maybeInjectWrongBuffer();

  if (state.queue.length === 0) {
    // End of run
    quiz.classList.add('hidden');
    summary.classList.remove('hidden');

    const total = state.totalRequested;
    const firstTry = state.totalFirstTry;
    const firstPct = total ? Math.round((firstTry / total) * 100) : 0;

    reviewEl.open = false;
    reviewList.innerHTML = state.review.map(buildReviewItemHTML).join('');

    runCounter.textContent = `Run complete — ${total} questions`;
    remainingCounter.textContent = '';
    summary.querySelector('[data-first-try]')?.remove?.();
    // If your HTML has a summary block, you can inject stats here.
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

  const correctText = correct.map(L => `${L}. ${escapeHTML(q.options[L] || '')}`).join('  •  ');
  const userText = user.map(L => `${L}. ${escapeHTML(q.options[L] || '')}`).join('  •  ');

  const rationaleHTML = q.rationale ? `<div class="rev-rationale"><strong>Rationale:</strong> ${escapeHTML(q.rationale)}</div>` : '';

  return `
    <div class="rev-item ${isCorrect ? 'ok' : 'bad'}">
      <div class="rev-q">${escapeHTML(q.question)}</div>
      <div class="rev-ans"><strong>Correct:</strong> ${correctText || '(none provided)'}</div>
      <div class="rev-user"><strong>Your answer:</strong> ${userText || '(none)'}</div>
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
    const data = await res.json();

    const all = normalizeQuestions(data);
    const chosen = sampleQuestions(all, pickedLength);

    state = {
      pool: chosen.map(q => ({ ...q, attempts: 0, mastered: false })),
      queue: chosen.slice(),
      idx: 0,
      shownCount: 0,
      review: [],
      totalFirstTry: 0,
      totalRequested: chosen.length,
      totalSubmissions: 0
    };

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

  state.totalSubmissions += 1;
  q.attempts += 1;

  const correctSet = new Set((q.correctLetters || []).map(s => s.toUpperCase()));
  const pickedSet = new Set(picked.map(s => s.toUpperCase()));
  const isCorrect = setsEqual(correctSet, pickedSet);

  const fullCorrectText = formatCorrectAnswers(q);

  if (isCorrect) {
    if (q.attempts === 1) state.totalFirstTry += 1;
    q.mastered = true;

    feedback.textContent = 'Correct!';
    feedback.className = 'feedback ok';
    answerLine.innerHTML = `<div class="answerText">${escapeHTML(fullCorrectText)}</div>`;

    removeFromWrongBufferById(q.id);
  } else {
    feedback.textContent = 'Incorrect.';
    feedback.className = 'feedback bad';
    answerLine.innerHTML = `
      <div class="answerLabel">Correct Answer:</div>
      <div class="answerText">${escapeHTML(fullCorrectText)}</div>
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

  // Record for review
  const correctLettersCopy = [...correctSet];
  const pickedLettersCopy  = [...pickedSet];
  if (isCorrect && !state.review.find(r => r.q.id === q.id)) {
    state.review.push({ q, correctLetters: correctLettersCopy, userLetters: pickedLettersCopy, wasCorrect: true });
  } else if (!isCorrect) {
    const existing = state.review.find(r => r.q.id === q.id);
    if (existing) {
      existing.userLetters = pickedLettersCopy;
      existing.wasCorrect  = false;
    } else {
      state.review.push({ q, correctLetters: correctLettersCopy, userLetters: pickedLettersCopy, wasCorrect: false });
    }
  }

  submitBtn.disabled = true;
  nextBtn.disabled = false;

  updateCounters();
}

function loadFirstQuestion(){
  state.idx = 0;
  loadNext();
}

function resetQuiz(){
  state = null;
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
  runCounter.textContent = `Question: ${Math.min(shown+1, total)}`;
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
      // allow unselecting the same radio by pressing again
      if (input.checked) {
        input.checked = false;
      } else {
        input.checked = true;
      }
      // ensure only one radio remains selected
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
nextBtn.addEventListener('click', loadNext);
restartBtn.addEventListener('click', resetQuiz);

// -------------------- Utils --------------------
function escapeHTML(s=''){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
