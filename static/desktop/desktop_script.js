/* ==========================================================
   Final-Semester Study Guide — Desktop
   Robust quiz runner with “until-mastery”, resilient JSON shapes,
   and a deterministic DOM structure so rendering never breaks.
   ========================================================== */

(() => {
  // --- DOM ----------
  const $ = (sel) => document.querySelector(sel);

  const pageTitle     = $("#pageTitle");
  const metricRow     = $("#metricRow");
  const runCounterEl  = $("#runCounter");
  const remainingEl   = $("#remainingCounter");
  const resetBtn      = $("#resetAll");
  const pbarWrap      = $("#pbarWrap");
  const pbarFill      = $("#progressFill");
  const masteredPctEl = $("#masteredPct");

  const launcher      = $("#launcher");
  const moduleSel     = $("#moduleSel");
  const lengthBtnsBox = $("#lengthBtns");
  const startBtn      = $("#startBtn");

  const quizSection   = $("#quiz");
  const qEl           = $("#question");
  const optsForm      = $("#options");
  const submitBtn     = $("#submitBtn");
  const feedbackBox   = $("#feedback");
  const resultFlag    = $("#resultFlag");
  const correctAnsEl  = $("#correctAnswer");
  const rationaleEl   = $("#rationale");

  const resultsSec    = $("#results");
  const resultsTitle  = $("#resultsTitle");
  const firsttryEl    = $("#firstTry");
  const missList      = $("#missList");
  const restartBtn    = $("#restartBtn");

  // --- State ----------
  let BANK = [];          // normalized questions (full module)
  let SAMPLE = [];        // selected subset for this run
  let QUEUE = [];         // work queue (with repeats appended on miss)
  let idx = -1;           // current index in QUEUE
  let showing = null;     // current item
  let runCount = 0;       // how many questions presented this run
  let remainToMaster = 0; // how many unique items left to get correct
  let sampleSize = 10;    // requested initial length
  let currentModule = null;

  // --- Utilities -------------------------------------------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Try flexible mapping from many JSON shapes to a uniform one.
  function normalizeItem(raw, i) {
    const stem =
      raw.question ?? raw.Question ?? raw.Stem ?? raw.prompt ?? raw.Q ?? "";

    // options: array or A/B/C/D keys
    let choices = [];
    if (Array.isArray(raw.options)) {
      choices = raw.options.slice(0, 4);
    } else {
      const A = raw.A ?? raw.a ?? raw.optionA ?? raw.OptionA;
      const B = raw.B ?? raw.b ?? raw.optionB ?? raw.OptionB;
      const C = raw.C ?? raw.c ?? raw.optionC ?? raw.OptionC;
      const D = raw.D ?? raw.d ?? raw.optionD ?? raw.OptionD;
      choices = [A, B, C, D].filter(Boolean);
    }

    // correct: letter, index, text, or array of letters for SATA
    let correct =
      raw.correct ??
      raw.Correct ??
      raw.correct_answer ??
      raw.correctAnswer ??
      raw["Correct_Answer"] ??
      raw["Correct Answer"] ??
      raw.Answer ??
      raw.answer ??
      null;

    // Normalize correct to a Set of letters: 'A','B','C','D'
    let correctSet = new Set();
    if (Array.isArray(correct)) {
      correct.forEach(v => correctSet.add(mapToLetter(v)));
    } else if (typeof correct === "string") {
      correct.split(/[,\s]+/).filter(Boolean).forEach(v => correctSet.add(mapToLetter(v)));
    } else if (typeof correct === "number") {
      // 1-based index or 0-based index; assume 1-based common in banks
      correctSet.add(["A","B","C","D"][Math.max(0, correct - 1)]);
    }

    const rationale =
      raw.rationale ?? raw.Rationale ?? raw.explanation ?? raw.Explanation ?? "";

    const id = raw.id ?? `q_${i}`;
    return {
      id,
      stem: String(stem || "").trim(),
      choices,
      correctSet: correctSet.size ? correctSet : new Set(), // empty => unknown
      rationale: String(rationale || "").trim(),
      misses: 0,
      mastered: false
    };
  }

  function mapToLetter(v) {
    if (typeof v === "string") {
      const s = v.trim();
      if (/^[ABCD]$/i.test(s)) return s[0].toUpperCase();
      // If the string equals the full choice text, we cannot map without context here.
      // Caller will compare both letter and text later.
    }
    // fallback
    return String(v).toUpperCase();
  }

  function letterForIndex(i) { return ["A","B","C","D"][i] ?? "?"; }

  function percent(n, d) {
    if (!d) return 0;
    return Math.round((n / d) * 100);
  }

  // --- Data loading ----------------------------------------
  async function loadModuleBank(modulePath) {
    // modulePath should be a full path like "/template/Module_4.json"
    const res = await fetch(modulePath, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load module: ${modulePath} (${res.status})`);
    }
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items ?? data.questions ?? [];
    if (!items.length) {
      throw new Error("This module appears empty.");
    }
    return items.map(normalizeItem);
  }

  async function fetchModuleList() {
    // Preferred: Flask endpoint /modules -> [{label, path}] or ["template/Module_1.json", ...]
    try {
      const r = await fetch("/modules", { cache: "no-store" });
      if (r.ok) {
        const list = await r.json();
        // normalize shape into {label, path}
        const norm = [];
        if (Array.isArray(list)) {
          for (const item of list) {
            if (typeof item === "string") {
              norm.push({ label: labelFromPath(item), path: pathFromMaybe(item) });
            } else if (item && item.path) {
              norm.push({ label: item.label ?? labelFromPath(item.path), path: pathFromMaybe(item.path) });
            }
          }
        }
        if (norm.length) return norm;
      }
    } catch (_) {}

    // Fallback to common set in /template
    const fallback = [
      "template/Module_1.json",
      "template/Module_2.json",
      "template/Module_3.json",
      "template/Module_4.json",
      "template/Learning_Questions_Module_1_2.json",
      "template/Learning_Questions_Module_3_4.json",
      "template/Pharm_Quiz_1.json",
      "template/Pharm_Quiz_2.json",
      "template/Pharm_Quiz_3.json",
      "template/Pharm_Quiz_4.json"
    ];
    return fallback.map(p => ({ label: labelFromPath(p), path: `/${p}` }));
  }

  function labelFromPath(p) {
    const base = p.split("/").pop() || p;
    return base.replace(/_/g, " ").replace(/\.json$/i, "");
  }
  function pathFromMaybe(p) {
    return p.startsWith("/") ? p : `/${p}`;
  }

  // --- Render helpers --------------------------------------
  function showLauncher() {
    launcher.hidden = false;
    quizSection.hidden = true;
    resultsSec.hidden = true;
    metricRow.hidden = true;
    pbarWrap.hidden = true;
    pageTitle.textContent = "Final Semester Study Guide";
  }

  function showQuiz() {
    launcher.hidden = true;
    resultsSec.hidden = true;
    quizSection.hidden = false;
    metricRow.hidden = false;
    pbarWrap.hidden = false;
  }

  function showResults() {
    launcher.hidden = true;
    quizSection.hidden = true;
    resultsSec.hidden = false;
    metricRow.hidden = true;
    pbarWrap.hidden = true;
  }

  function renderQuestion(item) {
    pageTitle.textContent = currentModule.label ?? "Module";
    qEl.textContent = item.stem || "(No question text found)";
    optsForm.innerHTML = "";
    feedbackBox.hidden = true;

    const isMulti = item.correctSet.size > 1;
    const inputType = isMulti ? "checkbox" : "radio";
    optsForm.setAttribute("data-multi", isMulti ? "1" : "0");

    item.choices.forEach((txt, i) => {
      const id = `opt_${i}`;
      const wrap = document.createElement("label");
      wrap.className = "opt";
      wrap.htmlFor = id;

      const input = document.createElement("input");
      input.type = inputType;
      input.name = "choice";
      input.id = id;
      input.value = letterForIndex(i);
      input.dataset.text = txt ?? "";

      const span = document.createElement("div");
      span.className = "txt";
      span.innerHTML = `<b>${letterForIndex(i)}.</b> ${txt ?? ""}`;

      wrap.appendChild(input);
      wrap.appendChild(span);
      optsForm.appendChild(wrap);
    });

    // Keyboard shortcuts A-D, Enter
    window.onkeydown = (e) => {
      if (["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        submitBtn.click();
        return;
      }
      const k = e.key.toUpperCase();
      const idx = "ABCD".indexOf(k);
      if (idx >= 0) {
        const target = optsForm.querySelectorAll("input")[idx];
        if (!target) return;
        if (target.type === "radio") {
          target.checked = true;
        } else {
          target.checked = !target.checked;
        }
      }
    };
  }

  function renderFeedback(item, isCorrect, chosenLetters) {
    feedbackBox.hidden = false;
    resultFlag.className = "flag " + (isCorrect ? "ok" : "bad");
    resultFlag.textContent = isCorrect ? "Correct" : "Incorrect";

    const caLetters = Array.from(item.correctSet).join(", ");
    correctAnsEl.textContent = caLetters || "(not specified)";
    rationaleEl.textContent = item.rationale || "";

    // outline choices
    const inputs = [...optsForm.querySelectorAll("input")];
    inputs.forEach((inp) => {
      const letter = inp.value;
      const opt = inp.closest(".opt");
      opt.classList.remove("correct", "incorrect");
      if (item.correctSet.has(letter)) opt.classList.add("correct");
      if (chosenLetters.has(letter) && !item.correctSet.has(letter)) opt.classList.add("incorrect");
    });
  }

  function renderCounters() {
    runCounterEl.textContent  = String(runCount);
    remainingEl.textContent   = String(remainToMaster);

    const masteredSoFar = SAMPLE.filter(q => q.mastered).length;
    const pct = percent(masteredSoFar, SAMPLE.length);
    pbarFill.style.width = `${pct}%`;
    masteredPctEl.textContent = `${pct}%`;
  }

  function renderResults() {
    resultsTitle.textContent = currentModule.label ?? "Module";
    const firstTryRight = SAMPLE.length - SAMPLE.reduce((acc, q) => acc + (q.misses > 0 ? 1 : 0), 0);
    const ftPct = percent(firstTryRight, SAMPLE.length);
    firsttryEl.textContent = `First-try mastery: ${ftPct}%  ( ${firstTryRight} / ${SAMPLE.length} )`;

    missList.innerHTML = "";
    const sorted = SAMPLE.slice().sort((a,b) => b.misses - a.misses);
    for (const q of sorted) {
      const item = document.createElement("div");
      item.className = "miss-item";
      item.innerHTML = `
        <div class="miss-head">${q.stem}</div>
        <div class="muted">Missed <b>${q.misses}</b> time${q.misses === 1 ? "" : "s"}</div>
        ${q.rationale ? `<div class="rat" style="margin-top:6px">${q.rationale}</div>` : ""}
      `;
      missList.appendChild(item);
    }
  }

  // --- Run control -----------------------------------------
  function beginRun() {
    runCount = 0;
    remainToMaster = SAMPLE.length;
    SAMPLE.forEach(q => { q.misses = 0; q.mastered = false; });
    QUEUE = shuffle(SAMPLE).slice(); // start queue
    idx = -1;

    // UI
    showQuiz();
    renderCounters();
    nextQuestion();
  }

  function nextQuestion() {
    idx += 1;
    if (idx >= QUEUE.length) {
      // If we exhausted current queue but still have unmastered items, continue
      if (remainToMaster > 0) {
        // continue cycling: append unmastered at the end (shuffled)
        const rest = shuffle(SAMPLE.filter(q => !q.mastered));
        QUEUE = QUEUE.concat(rest);
      } else {
        // Done — results
        showResults();
        renderResults();
        return;
      }
    }

    showing = QUEUE[idx];
    runCount += 1;
    renderQuestion(showing);
    renderCounters();
    submitBtn.textContent = "Submit";
  }

  function gradeCurrent() {
    if (!showing) return;

    const inputs = [...optsForm.querySelectorAll("input")];
    const selected = inputs.filter(i => i.checked);
    if (!selected.length) return alert("Choose an answer.");

    const chosenLetters = new Set(selected.map(i => i.value));

    // Accept match by letter OR if the text equals the correct text (for modules that encode text instead of letters).
    const isMulti = showing.correctSet.size > 1;
    let correct = false;

    if (showing.correctSet.size) {
      // Compare letters exactly
      if (chosenLetters.size === showing.correctSet.size) {
        correct = [...chosenLetters].every(l => showing.correctSet.has(l));
      } else {
        correct = false;
      }
    } else {
      // As a last resort (no correctSet), treat first option as correct to avoid dead-ends.
      correct = chosenLetters.has("A");
    }

    if (correct) {
      if (!showing.mastered) {
        showing.mastered = true;
        remainToMaster -= 1;
      }
    } else {
      showing.misses += 1;
      // Append a repeat later in the queue if not already mastered
      QUEUE.push(showing);
    }

    renderFeedback(showing, correct, chosenLetters);
    renderCounters();

    submitBtn.textContent = "Next";
  }

  // --- Events ----------------------------------------------
  submitBtn.addEventListener("click", () => {
    if (!showing) return;
    if (submitBtn.textContent === "Submit") {
      gradeCurrent();
    } else {
      nextQuestion();
    }
  });

  resetBtn.addEventListener("click", () => {
    // Abort run and go back to launcher
    showLauncher();
  });

  restartBtn.addEventListener("click", () => {
    // Back to launcher
    showLauncher();
  });

  // length chips
  lengthBtnsBox.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    lengthBtnsBox.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    b.classList.add("active");
    sampleSize = b.dataset.len === "full" ? "full" : parseInt(b.dataset.len, 10);
  });

  startBtn.addEventListener("click", async () => {
    const opt = moduleSel.selectedOptions[0];
    if (!opt) return alert("Choose a module.");
    const path = opt.value; // absolute path
    currentModule = { label: opt.textContent, path };

    try {
      BANK = await loadModuleBank(path);
    } catch (err) {
      alert(err.message || String(err));
      return;
    }
    if (!BANK.length) {
      alert("This module appears empty.");
      return;
    }

    // build sample
    const deck = shuffle(BANK);
    const size = sampleSize === "full" ? deck.length : Math.min(deck.length, sampleSize || 10);
    SAMPLE = deck.slice(0, size);

    beginRun();
  });

  // --- Init -------------------------------------------------
  async function init() {
    // Populate module list
    moduleSel.innerHTML = "";
    const mods = await fetchModuleList();
    if (!mods.length) {
      // minimal fallback
      moduleSel.innerHTML = `<option value="/template/Module_1.json">Module 1</option>`;
    } else {
      for (const m of mods) {
        const opt = document.createElement("option");
        opt.value = m.path.startsWith("/") ? m.path : `/${m.path}`;
        opt.textContent = m.label;
        moduleSel.appendChild(opt);
      }
    }

    showLauncher();
  }

  init();
})();
