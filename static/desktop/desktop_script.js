/* Desktop quiz engine (Open Sans, until-mastery loop) */

(() => {
  // ---- DOM ----
  const launcher = document.getElementById('launcher');
  const quiz = document.getElementById('quiz');
  const results = document.getElementById('results');

  const moduleSelect = document.getElementById('moduleSelect');
  const lengthGroup = document.getElementById('lengthGroup');
  const startBtn = document.getElementById('startBtn');

  const runCounter = document.getElementById('runCounter');
  const remainingCounter = document.getElementById('remainingCounter');
  const progressBarFill = document.getElementById('progressFill');
  const resetAll = document.getElementById('resetAll');

  const questionText = document.getElementById('questionText');
  const choicesList = document.getElementById('choicesList');
  const submitBtn = document.getElementById('submitBtn');

  const feedback = document.getElementById('feedback');
  const resultBadge = document.getElementById('resultBadge');
  const correctAnswerLabel = document.getElementById('correctAnswerLabel');
  const rationaleBox = document.getElementById('rationaleBox');

  const newQuizBtn = document.getElementById('newQuizBtn');
  const resultsTitle = document.getElementById('resultsTitle');
  const firstTryPct = document.getElementById('firstTryPct');
  const firstTryCounts = document.getElementById('firstTryCounts');
  const reviewList = document.getElementById('reviewList');

  // ---- Modules list (value = json file) ----
  const MODULES = [
    ['Module 1', 'Module_1.json'],
    ['Module 2', 'Module_2.json'],
    ['Module 3', 'Module_3.json'],
    ['Module 4', 'Module_4.json'],
    ['Learning Questions Module 1 & 2', 'Learning_Questions_Module_1_2.json'],
    ['Learning Questions Module 3 and 4', 'Learning_Questions_Module_3_4.json'],
    ['Pharm Quiz 1', 'Pharm_Quiz_1.json'],
    ['Pharm Quiz 2', 'Pharm_Quiz_2.json']
  ];

  // ---- State ----
  let selectedLen = 10;                  // number or 'full'
  let bank = [];                         // full question bank
  let order = [];                        // array of indices (until-mastery queue)
  let pos = 0;                           // pointer into order (CRITICAL: start at 0; only ++ after "Next")
  let mastered = new Set();              // index => mastered
  let misses = new Map();                // index => miss count
  let firstTryRight = 0;                 // first-try corrects
  let firstTryTotal = 0;                 // first-try attempts (unique questions)

  let mode = 'submit';                   // 'submit' or 'next'

  // ---- Helpers ----
  const $ = (sel, root=document) => root.querySelector(sel);
  const byId = (id) => document.getElementById(id);

  function hide(el){ el.classList.add('hidden'); }
  function show(el){ el.classList.remove('hidden'); }

  function setActiveLen(targetBtn) {
    [...lengthGroup.querySelectorAll('.pill')].forEach(b => b.classList.remove('active'));
    targetBtn.classList.add('active');
    const v = targetBtn.dataset.len;
    selectedLen = (v === 'full') ? 'full' : parseInt(v, 10);
  }

  function showLauncher() {
    // reset everything and go to launcher
    hide(quiz);
    hide(results);
    show(launcher);

    // Reset core state
    bank = [];
    order = [];
    pos = 0;
    mastered.clear();
    misses.clear();
    firstTryRight = 0;
    firstTryTotal = 0;

    // UI reset
    runCounter.textContent = '1';
    remainingCounter.textContent = '0';
    progressBarFill.style.width = '0%';
    feedback.classList.add('hidden');
    submitBtn.textContent = 'Submit';
    mode = 'submit';
  }

  function normalizeItem(raw, idx) {
    // Expect structure:
    // {
    //   "question": "...",
    //   "options": ["A...", "B...", "C...", "D..."],
    //   "answer": "A" | "B" | "C" | "D",
    //   "rationale": "..."
    // }
    // Be resilient to minor name differences.
    const q = raw.question || raw.Question || raw.prompt || '';
    const opts = raw.options || raw.choices || [raw.A, raw.B, raw.C, raw.D].filter(Boolean);
    const ans = (raw.answer || raw.correct || '').toString().trim().toUpperCase();
    const rat = raw.rationale || raw.explanation || raw.reason || '';

    return {
      id: idx,
      question: q,
      options: opts,
      answer: ans,   // letter A-D
      rationale: rat
    };
  }

  function renderChoices(item) {
    choicesList.innerHTML = '';
    const letters = ['A','B','C','D'];
    item.options.forEach((text, i) => {
      const id = `opt_${letters[i]}`;
      const li = document.createElement('li');
      li.className = 'choice';

      li.innerHTML = `
        <label class="opt">
          <input type="radio" name="choice" id="${id}" value="${letters[i]}">
          <span class="letter">${letters[i]}.</span>
          <span class="txt">${text}</span>
        </label>
      `;
      choicesList.appendChild(li);
    });
  }

  function updateCounters() {
    // pos is zero-based; display as 1-based
    runCounter.textContent = String(pos + 1);
    const targetUnique = firstTryTotal || (selectedLen === 'full' ? bank.length : selectedLen);
    const remaining = Math.max(targetUnique - mastered.size, 0);
    remainingCounter.textContent = String(remaining);

    const progress = Math.min((mastered.size / targetUnique) * 100, 100);
    progressBarFill.style.width = `${progress}%`;
  }

  function renderQuestion() {
    const idx = order[pos];
    const item = bank[idx];
    if (!item) {
      // Finished – show results
      return showResults();
    }

    questionText.textContent = item.question;
    renderChoices(item);

    feedback.classList.add('hidden');
    resultBadge.className = 'badge';
    resultBadge.textContent = '';
    correctAnswerLabel.textContent = '';
    rationaleBox.textContent = '';

    submitBtn.textContent = 'Submit';
    mode = 'submit';

    updateCounters();
  }

  function selectedLetter() {
    const el = choicesList.querySelector('input[name="choice"]:checked');
    return el ? el.value : null;
  }

  function onSubmit() {
    const idx = order[pos];
    const item = bank[idx];
    const choice = selectedLetter();
    if (!choice) return;

    // first-try accounting
    if (!misses.has(idx) && !mastered.has(idx)) {
      firstTryTotal += 1;
      if (choice === item.answer) firstTryRight += 1;
    }

    // mark feedback
    const correct = (choice === item.answer);
    feedback.classList.remove('hidden');
    resultBadge.className = `badge ${correct ? 'ok' : 'err'}`;
    resultBadge.textContent = correct ? 'Correct' : 'Incorrect';
    correctAnswerLabel.textContent = `${item.answer}. ${item.options['ABCD'.indexOf(item.answer)] || ''}`;
    rationaleBox.textContent = item.rationale || '';

    if (correct) {
      mastered.add(idx);
    } else {
      misses.set(idx, (misses.get(idx) || 0) + 1);
      // push this index to the end so it comes back later
      order.push(idx);
    }

    submitBtn.textContent = 'Next';
    mode = 'next';
    updateCounters();
  }

  function onNext() {
    // Only advance pointer here (this was the bug that made it start at Q2)
    pos += 1;

    if (pos >= order.length) {
      return showResults();
    }
    renderQuestion();
  }

  function showResults() {
    hide(quiz);
    show(results);

    // Header info
    const prettyName = moduleSelect.options[moduleSelect.selectedIndex]?.text || 'Module';
    resultsTitle.textContent = prettyName;

    // First-try % and counts
    const pct = firstTryTotal ? Math.round((firstTryRight / firstTryTotal) * 100) : 0;
    firstTryPct.textContent = `${pct}%`;
    firstTryCounts.textContent = ` ( ${firstTryRight} / ${firstTryTotal} )`;

    // Sort questions by miss count (desc), then id
    const missPairs = [...misses.entries()].sort((a,b) => (b[1] - a[1]) || (a[0] - b[0]));

    reviewList.innerHTML = '';
    missPairs.forEach(([idx, count]) => {
      const it = bank[idx];
      const block = document.createElement('div');
      block.className = 'review-block';
      block.innerHTML = `
        <div class="review-head">
          <div class="chip">Missed ${count} time${count>1?'s':''}</div>
        </div>
        <div class="review-q">${it.question}</div>
        <div class="review-a"><b>Correct Answer:</b> ${it.answer}. ${it.options['ABCD'.indexOf(it.answer)] || ''}</div>
        <div class="review-rat">${it.rationale || ''}</div>
      `;
      reviewList.appendChild(block);
    });
  }

  async function loadModule(jsonFile) {
    const res = await fetch(`/${jsonFile}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch ${jsonFile}`);
    const data = await res.json();

    // Normalize
    bank = (Array.isArray(data) ? data : (data.questions || [])).map((q, i) => normalizeItem(q, i));
  }

  function pickOrder() {
    const allIdx = bank.map((_, i) => i);
    let pick;
    if (selectedLen === 'full' || selectedLen >= bank.length) {
      pick = allIdx.slice();
    } else {
      // random unique
      pick = [];
      const used = new Set();
      while (pick.length < selectedLen && used.size < bank.length) {
        const r = Math.floor(Math.random() * bank.length);
        if (!used.has(r)) { used.add(r); pick.push(r); }
      }
    }
    return pick;
  }

  async function startQuiz() {
    const opt = moduleSelect.value;
    if (!opt) { alert('Please pick a module.'); return; }

    await loadModule(opt);
    if (!bank.length) { alert('This module appears empty.'); return; }

    // RESET STATE
    order = pickOrder();
    pos = 0;                            // <-- start at 0 (fix)
    mastered.clear();
    misses.clear();
    firstTryRight = 0;
    firstTryTotal = 0;

    // UI
    hide(launcher);
    show(quiz);
    hide(results);

    renderQuestion();
  }

  // ---- wiring ----
  // Populate module select
  moduleSelect.innerHTML = MODULES.map(([label, file]) => `<option value="${file}">${label}</option>`).join('');

  // Length pills
  lengthGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    setActiveLen(btn);
  });

  // Start, reset, submit/next, new quiz
  startBtn.addEventListener('click', startQuiz);
  resetAll.addEventListener('click', showLauncher);

  submitBtn.addEventListener('click', () => (mode === 'submit' ? onSubmit() : onNext()));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (mode === 'submit' ? onSubmit() : onNext());
    }
  });

  newQuizBtn.addEventListener('click', showLauncher);

  // default active length
  setActiveLen(lengthGroup.querySelector('.pill.active') || lengthGroup.querySelector('.pill'));

  // show launcher initially
  showLauncher();
})();
