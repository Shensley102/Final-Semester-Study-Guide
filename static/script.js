/* -----------------------------------------------------------
   Final Semester Study Guide - Module Frontend
   - Pretty module titles:
       Pharm_Quiz_1..4                   -> Pharm Quiz 1..4
       Learning_Questions_Module_1_2     -> Learning Questions Module 1 and 2
       Learning_Questions_Module_3_4     -> Learning Questions Module 3 and 4
       CCRN_Test_1_Combined_QA           -> CCRN Test 1
       CCRN_Test_2_Combined_QA           -> CCRN Test 2
       ...also tolerates variants/typos (spaces, underscores, "Moduele", etc.)
   - Single action button: Submit (green) ➜ Next (blue)
   - Full-width hashed progress bar; reduced jitter (snap to quiz top)
   - Open Sans question font (normal weight, slightly smaller)
   - Auto-detect "Select all that apply" and use checkboxes
   - Mouse click and keyboard toggle selection/deselection
   - Summary sorted by most-wrong questions first
   - Quiz continues until all questions are correct
   - Shows wrong count in review with color coding
   - Supports CCRN test files
   - Start Another Run button on same line as title
   - Smart hover behavior for answer options
   - Enter key works with both mouse and keyboard selections
   - Full-width submit button for mobile
   - Total questions answered counter
   - Color-coded wrong attempts (green/yellow/orange/red)
   - Question counter runs continuously beyond selected number
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

/* ---------- Pretty names for modules (UPDATED & ROBUST) ---------- */
function prettifyModuleName(name) {
  const raw = String(name || '');

  // Normalize common typos/variants before matching
  const normalized = raw
    .replace(/moduele/gi, 'module')     // typo tolerance
    .replace(/question(?!s)/gi, 'Questions') // pluralize if needed
    .replace(/__/g, '_')
    .trim();

  // Direct map for exact known IDs
  const map = {
    // Pharm Quiz series
    'Pharm_Quiz_1': 'Pharm Quiz 1',
    'Pharm_Quiz_2': 'Pharm Quiz 2',
    'Pharm_Quiz_3': 'Pharm Quiz 3',
    'Pharm_Quiz_4': 'Pharm Quiz 4',

    // Learning Questions canonical names (and trailing-underscore variants)
    'Learning_Questions_Module_1_2': 'Learning Questions Module 1 and 2',
    'Learning_Questions_Module_1_2_': 'Learning Questions Module 1 and 2',
    'Learning_Questions_Module_3_4': 'Learning Questions Module 3 and 4',
    'Learning_Questions_Module_3_4_': 'Learning Questions Module 3 and 4',

    // Common misspellings seen in filenames
    'Learning_Question_Moduele_1_2': 'Learning Questions Module 1 and 2',
    'Learning_Question_Moduele_3_4': 'Learning Questions Module 3 and 4',
    'Learning_Question_Module_1_2':  'Learning Questions Module 1 and 2',
    'Learning_Question_Module_3_4':  'Learning Questions Module 3 and 4',
  };
  if (map[normalized]) return map[normalized];

  // Pharm Quiz generic pattern (underscores or spaces)
  {
    const m = /^(?:Pharm[_\s]+Quiz[_\s]+)(\d+)$/i.exec(normalized.replace(/_/g, ' '));
    if (m) return `Pharm Quiz ${m[1]}`;
  }

  // Learning Questions generic pattern, tolerant of underscores/spaces & minor typos
  {
    const cleaned = normalized.replace(/_/g, ' ');
    const m = /^Learning\s+Questions?\s+Module\s+(\d+)\s+(\d+)$/i.exec(cleaned);
    if (m) return `Learning Questions Module ${m[1]} and ${m[2]}`;
  }

  // CCRN Test pattern (e.g., CCRN_Test_1_Combined_QA -> CCRN Test 1)
  {
    const m = /^CCRN[_\s]+Test[_\s]+(\d+)/i.exec(normalized.replace(/_/g, ' '));
    if (m) return `CCRN Test ${m[1]}`;
  }

  // Fallback: replace underscores with spaces
  return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
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
/* Snap to quiz card top before rendering next Q to avoid jitter */
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
  displayName: '',      // human-facing label
  order: [],
  masterPool: [],
  i: 0,
  answered: new Map(),
  uniqueSeen: new Set(),
  thresholdWrong: 0,
  wrongSinceLast: [],
  totalQuestionsAnswered: 0,  // Track total questions presented (including repeats)
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
    totalQuestionsAnswered: run.totalQuestionsAnswered,
    title: pageTitle?.textContent || defaultTitle,
  });
}
function saveRunState() { try { const s = serializeRun(); if (s) localStorage.setItem(STORAGE_KEY, s); } catch {} }
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
      totalQuestionsAnswered: Math.max(0, parseInt(data.totalQuestionsAnswered||0,10)),
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

/* ---------- Normalize & shuffle ---------- */
function normalizeQuestions(data){
  const arr = Array.isArray(data) ? data : (data?.questions || []);
  return arr.map(q => {
    // Handle options: convert array to object with letter keys, or use existing object
    let optionsObj = {};
    if (Array.isArray(q.options)) {
      // Convert array to object: ["A text", "B text", ...] -> { "A": "A text", "B": "B text", ... }
      q.options.forEach((text, idx) => {
        optionsObj[String.fromCharCode(65 + idx)] = String(text || '');
      });
    } else if (q.options && typeof q.options === 'object') {
      // Already an object, make a copy
      optionsObj = { ...q.options };
    }

    // Check for correct answer in multiple possible field names
    let correctLetters = [];
    if (Array.isArray(q.correctLetters)) {
      correctLetters = q.correctLetters.slice();
    } else if (Array.isArray(q.correct)) {
      // Check for "correct" field (used in your JSON files)
      correctLetters = q.correct.slice();
    } else if (q.correctAnswer) {
      correctLetters = [q.correctAnswer];
    }

    // Detect "Select all that apply" in the stem and auto-set to multiple_select
    const stemText = String(q.question || q.stem || '');
    const isSelectAll = /select all that apply/i.test(stemText);

    const newQ = {
      id: String(q.id || Math.random()),
      stem: stemText,
      options: optionsObj,
      correctLetters: correctLetters.length > 0 ? correctLetters : ['A'],
      rationale: String(q.rationale || ''),
      type: (isSelectAll || q.type === 'multiple_select') ? 'multiple_select' : 'single_select',
    };
    return newQ;
  });
}
function shuffleQuestionOptions(q){
  const letters = Object.keys(q.options).sort();
  const shuffled = shuffleInPlace([...letters]);
  const newOpts = {}; const oldToNew = {};
  shuffled.forEach((oldLetter, idx) => {
    const newLetter = String.fromCharCode(65 + idx);
    oldToNew[oldLetter] = newLetter;
    newOpts[newLetter] = q.options[oldLetter];
  });
  return {
    ...q,
    options: newOpts,
    correctLetters: q.correctLetters.map(l => oldToNew[l] || l).sort(),
  };
}

/* ---------- Update hover classes based on selection state ---------- */
function updateHoverClasses(){
  const hasSelection = getUserLetters().length > 0;
  const isMultiSelect = form.querySelector('input[type="checkbox"]') !== null;
  
  if (hasSelection && !isMultiSelect) {
    form.classList.add('has-selection');
    form.classList.remove('is-multi-select');
  } else if (isMultiSelect) {
    form.classList.add('is-multi-select');
    form.classList.remove('has-selection');
  } else {
    form.classList.remove('has-selection');
    form.classList.remove('is-multi-select');
  }
}

/* ---------- Get color class for wrong count ---------- */
function getColorClass(wrongCount, maxWrong) {
  if (wrongCount === 0) return ''; // green (default)
  if (wrongCount <= maxWrong * 0.33) return 'yellow';
  if (wrongCount <= maxWrong * 0.66) return 'orange';
  return 'red';
}

/* ---------- Populate modules (dropdown) ---------- */
async function initModules(){
  try {
    const res = await fetch('/modules', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load modules');
    const json = await res.json();
    const modules = Array.isArray(json.modules) ? json.modules : [];

    moduleSel.innerHTML = '';
    if (!modules.length) {
      moduleSel.innerHTML = '<option value="">No modules available</option>';
      return;
    }

    modules.forEach(mod => {
      const opt = document.createElement('option');
      opt.value = mod;
      opt.textContent = prettifyModuleName(mod);
      moduleSel.appendChild(opt);
    });
  } catch {
    moduleSel.innerHTML = '<option value="">Error loading modules</option>';
  }
}

/* ---------- Render Question ---------- */
function renderQuestion(q){
  qText.textContent = q.stem;
  form.innerHTML = '';
  feedback.textContent = '';
  feedback.className = 'feedback';
  answerLine.textContent = '';
  rationaleBox.textContent = '';
  rationaleBox.classList.add('hidden');

  const isMulti = (q.type === 'multiple_select');
  const letters = Object.keys(q.options).sort();

  letters.forEach(letter => {
    const optDiv = document.createElement('div');
    optDiv.className = 'opt';

    const inp = document.createElement('input');
    inp.type = isMulti ? 'checkbox' : 'radio';
    inp.name = 'answer';
    inp.id = `opt-${letter}`;
    inp.value = letter;

    const lbl = document.createElement('label');
    lbl.setAttribute('for', `opt-${letter}`);

    const keySpan = document.createElement('span');
    keySpan.className = 'k';
    keySpan.textContent = letter;

    const answerSpan = document.createElement('span');
    answerSpan.className = 'ans';
    answerSpan.textContent = q.options[letter];

    lbl.appendChild(keySpan);
    lbl.appendChild(answerSpan);

    optDiv.appendChild(inp);
    optDiv.appendChild(lbl);
    form.appendChild(optDiv);

    // Add click handler to toggle on mouse click (select and deselect)
    optDiv.addEventListener('click', (e) => {
      // Don't double-toggle if clicking the label
      if (e.target === lbl || e.target === keySpan || e.target === answerSpan) {
        e.preventDefault();
        inp.checked = !inp.checked;
        onSelectionChanged();
      }
    });
  });

  setActionState('submit');
  updateHoverClasses();
}

function currentQuestion() {
  return run.order?.[run.i] || null;
}

function getUserLetters(){
  const checked = [...form.querySelectorAll('input:checked')];
  return checked.map(inp => inp.value).sort();
}

function onSelectionChanged(){
  const hasSelection = getUserLetters().length > 0;
  submitBtn.disabled = !hasSelection;
  updateHoverClasses();
}

function setActionState(mode){
  submitBtn.dataset.mode = mode;

  if (mode === 'submit') {
    submitBtn.textContent = 'Submit';
    submitBtn.classList.remove('btn-blue');
    submitBtn.classList.add('primary');
    submitBtn.disabled = getUserLetters().length === 0;
  } else {
    submitBtn.textContent = 'Next';
    submitBtn.classList.remove('primary');
    submitBtn.classList.add('btn-blue');
    submitBtn.disabled = false;
  }
}

function formatCorrectAnswers(q){
  const lettersHTML = (q.correctLetters || []).map(l =>
    `<strong>${escapeHTML(l)}</strong>. ${escapeHTML(q.options[l]||'')}`
  ).join('<br>');
  return lettersHTML;
}

/* ---------- Counters / Progress Bar ---------- */
function updateCounters(){
  const remaining = getNotMastered().length;
  const total = run.masterPool.length;

  runCounter.textContent = `Question: ${run.totalQuestionsAnswered}`;
  remainingCounter.textContent = `Remaining to master: ${remaining}`;

  const masteredCount = total - remaining;
  const percentage = total ? Math.floor((masteredCount / total) * 100) : 0;

  progressFill.style.width = `${percentage}%`;
  progressLabel.textContent = `${percentage}% mastered`;
  progressBar.setAttribute('aria-valuenow', percentage);

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
  
  // Check if all questions in masterPool are answered correctly
  const allCorrect = run.masterPool.every(q => run.answered.get(q.id)?.correct);
  
  if (!allCorrect) {
    // Get all questions that are not yet correct
    const notMastered = getNotMastered();
    if (notMastered.length > 0) {
      run.wrongSinceLast = [];
      run.order.push(...notMastered);
      run.i = nextIdx;
      return { fromBuffer: true, q: run.order[run.i] };
    }
  }
  
  // All questions are correct, end the quiz
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
    totalQuestionsAnswered: 1,
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

  // Show the restart button
  restartBtn2.classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  const uniq = [...run.answered.values()];
  const ftCorrect = uniq.filter(x => x.firstTryCorrect).length;
  const totalUnique = uniq.length;

  if (totalUnique > 0){
    firstTrySummary.classList.remove('hidden');
    const summaryHTML = `
      <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: center;">
        <div>
          <strong>First-try mastery:</strong>
          <span id="firstTryPct">0%</span>
          (<span id="firstTryCount">0</span> / <span id="firstTryTotal">0</span>)
        </div>
        <div>
          <strong>Total Questions Answered:</strong>
          <span>${run.totalQuestionsAnswered}</span>
        </div>
      </div>
    `;
    firstTrySummary.innerHTML = summaryHTML;
    firstTrySummary.querySelector('#firstTryPct').textContent = `${Math.round((ftCorrect / totalUnique) * 100)}%`;
    firstTrySummary.querySelector('#firstTryCount').textContent = ftCorrect;
    firstTrySummary.querySelector('#firstTryTotal').textContent = totalUnique;
  } else {
    firstTrySummary.classList.add('hidden');
  }

  reviewList.innerHTML = '';
  
  // Count how many times each question appears in run.order (indicates wrong attempts)
  const questionWrongCount = {};
  run.order.forEach(q => {
    questionWrongCount[q.id] = (questionWrongCount[q.id] || 0) + 1;
  });
  
  // Find max wrong count for color calculation
  const maxWrong = Math.max(...Object.values(questionWrongCount));
  
  // Sort questions: incorrect ones first (by number of wrong attempts), then correct ones
  const sortedQuestions = [...run.order].sort((a, b) => {
    const ansA = run.answered.get(a.id);
    const ansB = run.answered.get(b.id);
    
    // If one is correct and one is incorrect, incorrect comes first
    if (ansA?.correct !== ansB?.correct) {
      return ansA?.correct ? 1 : -1;
    }
    
    // Both incorrect or both correct: sort by number of wrong attempts (higher count first)
    const countA = questionWrongCount[a.id] || 1;
    const countB = questionWrongCount[b.id] || 1;
    return countB - countA;
  });
  
  // Track which questions we've already displayed
  const displayedIds = new Set();
  
  sortedQuestions.forEach(q => {
    // Only display each unique question once
    if (displayedIds.has(q.id)) return;
    displayedIds.add(q.id);
    
    const row = document.createElement('div');
    const ans = run.answered.get(q.id);
    row.className = 'rev-item ' + (ans?.correct ? 'ok' : 'bad');

    const qEl = document.createElement('div'); qEl.className = 'rev-q'; qEl.textContent = q.stem;
    
    // Add wrong count line with color coding
    const wrongCountEl = document.createElement('div'); 
    wrongCountEl.className = 'rev-wrong-count';
    const wrongCount = Math.max(0, questionWrongCount[q.id] - 1); // Subtract 1 because the correct attempt is also in the count
    wrongCountEl.textContent = `Times marked wrong: ${wrongCount}`;
    
    // Add color class based on wrong count
    const colorClass = getColorClass(wrongCount, maxWrong);
    if (colorClass) {
      wrongCountEl.classList.add(colorClass);
    }
    
    const caEl = document.createElement('div'); caEl.className = 'rev-ans';
    caEl.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrectAnswers(q)}`;
    const rEl = document.createElement('div'); rEl.className = 'rev-rationale';
    rEl.innerHTML = `<strong>Rationale:</strong> ${escapeHTML(q.rationale || '')}`;

    row.appendChild(qEl); 
    row.appendChild(wrongCountEl);
    row.appendChild(caEl); 
    row.appendChild(rEl);
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
submitBtn.addEventListener('click', handleSubmitClick);

function handleSubmitClick() {
  if (submitBtn.dataset.mode === 'next') {
    scrollToQuizTop();
    const next = nextIndex();
    const q = next.q;
    if (!q) return endRun();
    run.uniqueSeen.add(q.id);
    run.totalQuestionsAnswered++;
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
        if (!seen.has(item.id)) { seen.add(item); uniqueBatch.push(item); }
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
}

/* Reset (visible only during quiz) */
resetAll.addEventListener('click', () => { clearSavedState(); location.reload(); });

/* Summary "Start Another Run" */
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
    if (!submitBtn.disabled) {
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

/* ---------- Progress bar update ---------- */
function updateProgressBar() {
  const remaining = getNotMastered().length;
  const total = run.masterPool.length;
  const masteredCount = total - remaining;
  const percentage = total ? Math.floor((masteredCount / total) * 100) : 0;

  progressFill.style.width = `${percentage}%`;
  progressLabel.textContent = `${percentage}% mastered`;
  progressBar.setAttribute('aria-valuenow', percentage);
}

/* ---------- Init ---------- */
initModules();
showResumeIfAny();
