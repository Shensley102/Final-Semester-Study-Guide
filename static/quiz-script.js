/* -----------------------------------------------------------
   Nurse Success Study Hub - Quiz Application
   - Complete quiz functionality with module selection
   - Category-specific module filtering
   - Keyboard shortcuts support
   - Progress tracking and mastery system
   - Detailed performance review
   - LocalStorage persistence for resuming quizzes
   - Resume only works with Full Module Question Bank
   - Shows remaining questions count on resume button
   - Subcategory filtering for grouped modules
   - Retry missed questions feature
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
const defaultTitle = pageTitle?.textContent || 'Quiz - Nurse Success Study Hub';
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
const feedback     = $('feedback');
const answerLine   = $('answerLine');
const rationaleBox = $('rationale');

// Summary
const summary          = $('summary');
const firstTrySummary  = $('firstTrySummary');
const reviewList       = $('reviewList');
const restartBtn2      = $('restartBtnSummary');
const resetAll         = $('resetAll');
const retryMissedBtn   = $('retryMissedBtn');

/* ---------- Pretty names for modules ---------- */
function prettifyModuleName(name) {
  const raw = String(name || '');

  const normalized = raw
    .replace(/moduele/gi, 'module')
    .replace(/question(?!s)/gi, 'Questions')
    .replace(/__/g, '_')
    .trim();

  const map = {
    'Pharm_Quiz_1': 'Pharm Quiz 1',
    'Pharm_Quiz_2': 'Pharm Quiz 2',
    'Pharm_Quiz_3': 'Pharm Quiz 3',
    'Pharm_Quiz_4': 'Pharm Quiz 4',
    'Learning_Questions_Module_1_2': 'Learning Questions Module 1 and 2',
    'Learning_Questions_Module_1_2_': 'Learning Questions Module 1 and 2',
    'Learning_Questions_Module_3_4': 'Learning Questions Module 3 and 4',
    'Learning_Questions_Module_3_4_': 'Learning Questions Module 3 and 4',
    'Module_1': 'Module 1',
    'Module_2': 'Module 2',
    'Module_3': 'Module 3',
    'Module_4': 'Module 4',
    'CCRN_Test_1_Combined_QA': 'CCRN Test 1',
    'CCRN_Test_2_Combined_QA': 'CCRN Test 2',
    'CCRN_Test_3_Combined_QA': 'CCRN Test 3',
    'HESI_Delegating': 'HESI Delegating',
    'HESI_Leadership': 'HESI Leadership',
    'Hesi_Management': 'HESI Management',
    'HESI_Comprehensive': 'HESI Comprehensive',
  };
  if (map[normalized]) return map[normalized];

  const m = /^(?:Pharm[_\s]+Quiz[_\s]+)(\d+)$/i.exec(normalized.replace(/_/g, ' '));
  if (m) return `Pharm Quiz ${m[1]}`;

  {
    const cleaned = normalized.replace(/_/g, ' ');
    const m = /^Learning\s+Questions?\s+Module\s+(\d+)\s+(\d+)$/i.exec(cleaned);
    if (m) return `Learning Questions Module ${m[1]} and ${m[2]}`;
  }

  {
    const m = /^CCRN[_\s]+Test[_\s]+(\d+)/i.exec(normalized.replace(/_/g, ' '));
    if (m) return `CCRN Test ${m[1]}`;
  }

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
  displayName: '',
  order: [],
  masterPool: [],
  i: 0,
  answered: new Map(),
  uniqueSeen: new Set(),
  thresholdWrong: 0,
  wrongSinceLast: [],
  totalQuestionsAnswered: 0,
  isFullBank: false,
  isRetry: false,
};

// Store missed questions from last completed quiz
let lastQuizMissedQuestions = [];

/* ---------- Persistence ---------- */
const STORAGE_KEY = 'quizRunState_v1';

function serializeRun() {
  if (!run || !run.order?.length) return null;
  return JSON.stringify({
    bank: run.bank,
    displayName: run.displayName,
    order: run.order.map(q => ({ id:q.id, stem:q.stem, options:q.options, correctLetters:q.correctLetters, rationale:q.rationale, type:q.type })),
    masterPool: run.masterPool.map(q => q.id),
    i: run.i,
    answered: Array.from(run.answered.entries()),
    uniqueSeen: Array.from(run.uniqueSeen),
    thresholdWrong: run.thresholdWrong,
    wrongSinceLast: run.wrongSinceLast.map(q => q.id),
    totalQuestionsAnswered: run.totalQuestionsAnswered,
    isFullBank: run.isFullBank,
    isRetry: run.isRetry,
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
      isFullBank: Boolean(data.isFullBank),
      isRetry: Boolean(data.isRetry),
    };
    return { run: restored, title: data.title || defaultTitle };
  } catch { return null; }
}
function clearSavedState(){ try { localStorage.removeItem(STORAGE_KEY); } catch {} }

function getNotMasteredFromRun(runData) {
  return runData.masterPool.filter(q => !runData.answered.get(q.id)?.correct).length;
}

function showResumeIfAny(){
  const s = loadRunState();
  const resumeContainer = document.getElementById('resumeContainer');
  
  if (!resumeContainer) return;
  
  if (!s || !s.run?.order?.length || !s.run?.isFullBank || s.run?.isRetry) {
    resumeContainer.classList.add('hidden');
    return;
  }
  
  resumeContainer.classList.remove('hidden');
  
  const remainingQuestions = getNotMasteredFromRun(s.run);
  const remainingCountEl = document.getElementById('remainingQuestionsCount');
  if (remainingCountEl) {
    remainingCountEl.textContent = `${remainingQuestions} questions remaining`;
  }
  
  if (resumeBtn) {
    resumeBtn.onclick = () => {
      run = s.run;
      setHeaderTitle(run.displayName || run.bank || defaultTitle);
      document.title = run.displayName ? `${run.displayName} - Nurse Success Study Hub` :
                     (run.bank ? `${run.bank} - Nurse Success Study Hub` : 'Quiz - Nurse Success Study Hub');

      if (launcher) launcher.classList.add('hidden');
      if (summary) summary.classList.add('hidden');
      if (quiz) quiz.classList.remove('hidden');
      if (countersBox) countersBox.classList.remove('hidden');
      if (resetAll) resetAll.classList.remove('hidden');

      const q = currentQuestion();
      if (q) {
        run.uniqueSeen.add(q.id);
        renderQuestion(q);
        updateCounters();
      }
    };
  }
}

/* ---------- Normalize & shuffle ---------- */
function normalizeQuestions(data){
  const arr = Array.isArray(data) ? data : (data?.questions || []);
  return arr.map(q => {
    let optionsObj = {};
    if (Array.isArray(q.options)) {
      q.options.forEach((text, idx) => {
        optionsObj[String.fromCharCode(65 + idx)] = String(text || '');
      });
    } else if (q.options && typeof q.options === 'object') {
      optionsObj = { ...q.options };
    }

    let correctLetters = [];
    if (Array.isArray(q.correctLetters)) {
      correctLetters = q.correctLetters.slice();
    } else if (Array.isArray(q.correct)) {
      correctLetters = q.correct.slice();
    } else if (q.correctAnswer) {
      correctLetters = [q.correctAnswer];
    }

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

/* ---------- Update hover classes ---------- */
function updateHoverClasses(){
  if (!form) return;
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
  if (wrongCount === 0) return '';
  if (wrongCount <= maxWrong * 0.33) return 'yellow';
  if (wrongCount <= maxWrong * 0.66) return 'orange';
  return 'red';
}

/* ---------- Populate modules (Category-specific) ---------- */
async function initModules(){
  if (!moduleSel) return;
  
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const category = urlParams.get('category');
    const subcategory = urlParams.get('subcategory');
    
    let endpoint = '/modules';
    
    if (category) {
      endpoint = `/api/category/${encodeURIComponent(category)}/modules`;
      const categoryContext = document.getElementById('categoryContext');
      if (categoryContext) {
        categoryContext.textContent = category;
      }
    }
    
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load modules');
    const json = await res.json();
    let modules = Array.isArray(json.modules) ? json.modules : [];

    // Filter modules by subcategory if provided
    if (subcategory) {
      const moduleGroupings = {
        'Nursing Certifications': {
          'CCRN': ['CCRN_Test_1_Combined_QA', 'CCRN_Test_2_Combined_QA', 'CCRN_Test_3_Combined_QA']
        },
        'Pharmacology': {
          'Pharm Quizzes': ['Pharm_Quiz_1', 'Pharm_Quiz_2', 'Pharm_Quiz_3', 'Pharm_Quiz_4']
        }
      };
      
      if (moduleGroupings[category] && moduleGroupings[category][subcategory]) {
        const allowedModules = moduleGroupings[category][subcategory];
        modules = modules.filter(m => allowedModules.includes(m));
      }
    }

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
  } catch (err) {
    console.error('Error loading modules:', err);
    if (moduleSel) {
      moduleSel.innerHTML = '<option value="">Error loading modules</option>';
    }
  }
}

/* ---------- Category Display Setup ---------- */
function setupCategoryDisplay() {
  const urlParams = new URLSearchParams(window.location.search);
  const category = urlParams.get('category');
  
  const categoryIcons = {
    'Patient Care Management': '👥',
    'HESI': '📋',
    'Nursing Certifications': '🏆',
    'Pharmacology': '💊'
  };

  if (category) {
    const icon = categoryIcons[category] || '📚';
    
    const headerRight = document.getElementById('categoryHeader');
    if (headerRight) {
      const categoryIcon = document.getElementById('categoryIcon');
      const categoryTitle = document.getElementById('categoryTitle');
      if (categoryIcon) categoryIcon.textContent = icon;
      if (categoryTitle) categoryTitle.textContent = category;
    }
    
    const headerSummary = document.getElementById('categoryHeaderSummary');
    if (headerSummary) {
      const categoryIconSummary = document.getElementById('categoryIconSummary');
      const summaryTitle = document.getElementById('summaryTitle');
      if (categoryIconSummary) categoryIconSummary.textContent = icon;
      if (summaryTitle) summaryTitle.textContent = category;
    }
  }
}

/* ---------- Render Question ---------- */
function renderQuestion(q){
  if (!qText || !form) return;
  
  qText.textContent = q.stem;
  form.innerHTML = '';
  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'feedback';
  }
  if (answerLine) answerLine.textContent = '';
  if (rationaleBox) {
    rationaleBox.textContent = '';
    rationaleBox.classList.add('hidden');
  }

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

    optDiv.addEventListener('click', (e) => {
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
  if (!form) return [];
  const checked = [...form.querySelectorAll('input:checked')];
  return checked.map(inp => inp.value).sort();
}

function onSelectionChanged(){
  if (!submitBtn) return;
  const hasSelection = getUserLetters().length > 0;
  submitBtn.disabled = !hasSelection;
  updateHoverClasses();
}

function setActionState(mode){
  if (!submitBtn) return;
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

  if (runCounter) runCounter.textContent = `Question: ${run.totalQuestionsAnswered}`;
  if (remainingCounter) remainingCounter.textContent = `Remaining to master: ${remaining}`;

  const masteredCount = total - remaining;
  const percentage = total ? Math.floor((masteredCount / total) * 100) : 0;

  if (progressFill) progressFill.style.width = `${percentage}%`;
  if (progressLabel) progressLabel.textContent = `${percentage}% mastered`;
  if (progressBar) progressBar.setAttribute('aria-valuenow', percentage);

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
  
  const allCorrect = run.masterPool.every(q => run.answered.get(q.id)?.correct);
  
  if (!allCorrect) {
    const notMastered = getNotMastered();
    if (notMastered.length > 0) {
      run.wrongSinceLast = [];
      run.order.push(...notMastered);
      run.i = nextIdx;
      return { fromBuffer: true, q: run.order[run.i] };
    }
  }
  
  return { fromBuffer: false, q: null };
}

/* ---------- Start / End ---------- */
async function startQuiz(){
  if (!lengthBtns || !moduleSel || !startBtn) return;
  
  const lenBtn = lengthBtns.querySelector('.seg-btn.active');
  if (!lenBtn) {
    alert('Pick Length Of Quiz Before Starting');
    lengthBtns.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const bank = moduleSel.value;
  const displayName = prettifyModuleName(bank);
  const qty  = (lenBtn.dataset.len === 'full' ? 'full' : parseInt(lenBtn.dataset.len, 10));
  const isFullBank = (qty === 'full');

  setHeaderTitle(displayName);
  document.title = `${displayName} - Nurse Success Study Hub`;

  startBtn.disabled = true;

  const jsonUrl = `/${bank}.json`;
  
  try {
    const res = await fetch(jsonUrl, { cache: 'no-store' });
    if (!res.ok) {
      alert(`Could not load ${bank}.json`);
      startBtn.disabled = false;
      setHeaderTitle(defaultTitle);
      document.title = 'Quiz - Nurse Success Study Hub';
      return;
    }
    const raw = await res.json();
    allQuestions = normalizeQuestions(raw);

    const sampled = sampleQuestions(allQuestions, qty);
    const shuffledQuestions = sampled.map((q) => shuffleQuestionOptions(q));

    run = {
      bank,
      displayName,
      order: [...shuffledQuestions],
      masterPool: [...shuffledQuestions],
      i: 0,
      answered: new Map(),
      uniqueSeen: new Set(),
      thresholdWrong: 0,
      wrongSinceLast: [],
      totalQuestionsAnswered: 1,
      isFullBank: isFullBank,
      isRetry: false,
    };

    const total = run.masterPool.length;
    const frac = (qty === 'full' || (typeof qty === 'number' && qty >= 100)) ? 0.05 : 0.15;
    run.thresholdWrong = Math.max(1, Math.ceil(total * frac));

    if (launcher) launcher.classList.add('hidden');
    if (summary) summary.classList.add('hidden');
    if (quiz) quiz.classList.remove('hidden');

    if (countersBox) countersBox.classList.remove('hidden');
    if (resetAll) resetAll.classList.remove('hidden');

    const q0 = run.order[0];
    run.uniqueSeen.add(q0.id);
    renderQuestion(q0);
    updateCounters();

    startBtn.disabled = false;
  } catch (err) {
    console.error('Error starting quiz:', err);
    alert('Error loading quiz. Please try again.');
    if (startBtn) startBtn.disabled = false;
  }
}

async function startRetryQuiz(missedQuestions) {
  if (!missedQuestions || missedQuestions.length === 0) {
    alert('No missed questions to retry');
    return;
  }

  const displayName = `${run.displayName} - Retry Missed Questions`;
  setHeaderTitle(displayName);
  document.title = `${displayName} - Nurse Success Study Hub`;

  // Shuffle the missed questions and their options
  const shuffledQuestions = missedQuestions.map((q) => shuffleQuestionOptions(q));

  run = {
    bank: run.bank,
    displayName: displayName,
    order: [...shuffledQuestions],
    masterPool: [...shuffledQuestions],
    i: 0,
    answered: new Map(),
    uniqueSeen: new Set(),
    thresholdWrong: 0,
    wrongSinceLast: [],
    totalQuestionsAnswered: 1,
    isFullBank: false,
    isRetry: true,
  };

  const total = run.masterPool.length;
  run.thresholdWrong = Math.max(1, Math.ceil(total * 0.15));

  if (launcher) launcher.classList.add('hidden');
  if (summary) summary.classList.add('hidden');
  if (quiz) quiz.classList.remove('hidden');

  if (countersBox) countersBox.classList.remove('hidden');
  if (resetAll) resetAll.classList.remove('hidden');

  const q0 = run.order[0];
  run.uniqueSeen.add(q0.id);
  renderQuestion(q0);
  updateCounters();
}

function endRun(){
  if (quiz) quiz.classList.add('hidden');
  if (summary) summary.classList.remove('hidden');
  if (countersBox) countersBox.classList.add('hidden');

  setHeaderTitle(run.displayName || run.bank || defaultTitle);
  document.title = run.displayName || run.bank || 'Quiz - Nurse Success Study Hub';

  if (restartBtn2) restartBtn2.classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  const uniq = [...run.answered.values()];
  const ftCorrect = uniq.filter(x => x.firstTryCorrect).length;
  const totalUnique = uniq.length;

  // Collect missed questions (where firstTryCorrect is false)
  lastQuizMissedQuestions = run.masterPool.filter(q => {
    const ans = run.answered.get(q.id);
    return ans && ans.firstTryCorrect === false;
  });

  // Show or hide retry button based on whether there are missed questions
  if (retryMissedBtn) {
    if (lastQuizMissedQuestions.length > 0 && !run.isRetry) {
      retryMissedBtn.classList.remove('hidden');
      const missedCount = document.getElementById('missedCount');
      if (missedCount) {
        missedCount.textContent = lastQuizMissedQuestions.length;
      }
    } else {
      retryMissedBtn.classList.add('hidden');
    }
  }

  if (firstTrySummary) {
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
      const firstTryPct = document.getElementById('firstTryPct');
      const firstTryCount = document.getElementById('firstTryCount');
      const firstTryTotal = document.getElementById('firstTryTotal');
      if (firstTryPct) firstTryPct.textContent = `${Math.round((ftCorrect / totalUnique) * 100)}%`;
      if (firstTryCount) firstTryCount.textContent = ftCorrect;
      if (firstTryTotal) firstTryTotal.textContent = totalUnique;
    } else {
      firstTrySummary.classList.add('hidden');
    }
  }

  if (reviewList) {
    reviewList.innerHTML = '';
    
    const questionWrongCount = {};
    run.order.forEach(q => {
      questionWrongCount[q.id] = (questionWrongCount[q.id] || 0) + 1;
    });
    
    const maxWrong = Math.max(...Object.values(questionWrongCount));
    
    const sortedQuestions = [...run.order].sort((a, b) => {
      const ansA = run.answered.get(a.id);
      const ansB = run.answered.get(b.id);
      
      if (ansA?.correct !== ansB?.correct) {
        return ansA?.correct ? 1 : -1;
      }
      
      const countA = questionWrongCount[a.id] || 1;
      const countB = questionWrongCount[b.id] || 1;
      return countB - countA;
    });
    
    const displayedIds = new Set();
    
    sortedQuestions.forEach(q => {
      if (displayedIds.has(q.id)) return;
      displayedIds.add(q.id);
      
      const row = document.createElement('div');
      const ans = run.answered.get(q.id);
      row.className = 'rev-item ' + (ans?.correct ? 'ok' : 'bad');

      const qEl = document.createElement('div'); qEl.className = 'rev-q'; qEl.textContent = q.stem;
      
      const wrongCountEl = document.createElement('div'); 
      wrongCountEl.className = 'rev-wrong-count';
      const wrongCount = Math.max(0, questionWrongCount[q.id] - 1);
      wrongCountEl.textContent = `Times marked wrong: ${wrongCount}`;
      
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
  }

  clearSavedState();
}

/* ---------- Event wiring ---------- */
if (lengthBtns) {
  lengthBtns.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn'); if (!btn) return;
    lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-pressed', b.classList.contains('active')?'true':'false'));
  });
}

if (startBtn) {
  startBtn.addEventListener('click', startQuiz);
}

if (form) {
  form.addEventListener('change', onSelectionChanged);
}

if (submitBtn) {
  submitBtn.addEventListener('click', handleSubmitClick);
}

function handleSubmitClick() {
  if (!submitBtn) return;
  
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

  if (feedback) {
    feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
    feedback.classList.remove('ok','bad');
    feedback.classList.add(isCorrect ? 'ok' : 'bad');
  }

  if (answerLine) {
    answerLine.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrectAnswers(q)}`;
  }
  
  if (rationaleBox) {
    rationaleBox.textContent = q.rationale || '';
    rationaleBox.classList.remove('hidden');
  }

  if (form) {
    form.querySelectorAll('input').forEach(i => i.disabled = true);
  }
  
  setActionState('next');

  scrollToBottomSmooth();
  updateCounters();
}

if (resetAll) {
  resetAll.addEventListener('click', () => { clearSavedState(); location.reload(); });
}

if (restartBtn2) {
  restartBtn2.addEventListener('click', () => { location.reload(); });
}

if (retryMissedBtn) {
  retryMissedBtn.addEventListener('click', () => {
    startRetryQuiz(lastQuizMissedQuestions);
  });
}

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  if (!quiz || quiz.classList.contains('hidden')) return;
  if (isTextEditingTarget(e.target)) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  const key = e.key || '';
  const upper = key.toUpperCase();

  if (key === 'Enter') {
    e.preventDefault();
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.click();
    }
    return;
  }

  if (/^[A-Z]$/.test(upper) && submitBtn && submitBtn.dataset.mode === 'submit') {
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

  if (progressFill) progressFill.style.width = `${percentage}%`;
  if (progressLabel) progressLabel.textContent = `${percentage}% mastered`;
  if (progressBar) progressBar.setAttribute('aria-valuenow', percentage);
}

/* ---------- Init ---------- */
setupCategoryDisplay();
initModules();
showResumeIfAny();
