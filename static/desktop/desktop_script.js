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

  // Helpers to safely pull text from varied shapes
  const TEXT_KEYS = [
    "question", "Question", "question_text", "questionText",
    "Stem", "stem", "prompt", "Prompt", "Q", "text", "Text",
    "title", "Title"
  ];
  const RATIONALE_KEYS = [
    "rationale","Rationale","rationale_text","RationaleText",
    "explanation","Explanation","reason","Reason","why","Why",
    "Rational","Rationales","Rationale(s)"
  ];

  function firstDefined(obj, keys) {
    for (const k of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) {
        return obj[k];
      }
    }
    return undefined;
  }
  function resolveText(val) {
    if (val == null) return "";
    if (typeof val === "string") return val;
    if (typeof val === "number") return String(val);
    if (typeof val === "object") {
      const nested = firstDefined(val, ["text","Text","stem","Stem","title","Title","prompt","Prompt"]);
      return nested != null ? resolveText(nested) : "";
    }
    return String(val ?? "");
  }
  function mapToLetter(v) {
    if (typeof v === "string") {
      const s = v.trim();
      if (/^[ABCD]$/i.test(s)) return s[0].toUpperCase();
      // things like "C and D", "C,D" etc.
      if (/[A-D]/i.test(s) && /[,/& ]/.test(s)) {
        // caller splits elsewhere; here just return raw upper
        return s.toUpperCase();
      }
    }
    if (typeof v === "number") {
      return ["A","B","C","D"][Math.max(0, v - 1)] ?? "A";
    }
    return String(v).toUpperCase();
  }
  function letterForIndex(i) { return ["A","B","C","D"][i] ?? "?"; }
  function percent(n, d) { return d ? Math.round((n / d) * 100) : 0; }

  // Try flexible mapping from many JSON shapes to a uniform one.
  function normalizeItem(raw, i) {
    // --- stem / question text ---
    let stemSource = firstDefined(raw, TEXT_KEYS);
    if (typeof stemSource === "object") {
      // e.g., { question: { text: "..." } } or similar
      stemSource = resolveText(stemSource);
    }
    const stem = resolveText(stemSource);

    // --- options / choices ---
    let choices = [];

    // arrays under common names
    const arr = raw.options ?? raw.choices ?? raw.answers ?? raw.Answers ?? raw.Options;
    if (Array.isArray(arr)) {
      choices = arr.slice(0, 4).map(resolveText);
    }

    // if not found, look for keyed options
    if (!choices.length) {
      const keyGroups = [
        ["A","B","C","D"],
        ["a","b","c","d"],
        ["optionA","optionB","optionC","optionD"],
        ["OptionA","OptionB","OptionC","OptionD"],
        ["option1","option2","option3","option4"],
        ["Option1","Option2","Option3","Option4"],
        ["1","2","3","4"]
      ];
      for (const group of keyGroups) {
        const groupVals = group.map(k => raw[k]).filter(v => v != null);
        if (groupVals.length >= 2) {
          choices = groupVals.slice(0,4).map(resolveText);
          break;
        }
      }
    }

    // --- correct set ---
    let correct =
      raw.correct ??
      raw.Correct ??
      raw.correct_answer ??
      raw.correctAnswer ??
      raw["Correct_Answer"] ??
      raw["Correct Answer"] ??
      raw.correctOptions ??
      raw.correctLetters ??
      raw.correct_index ??
      raw.Answer ??
      raw.answer ??
      null;

    // Normalize to Set of 'A'..'D'
    const correctSet = new Set();
    if (Array.isArray(correct)) {
      correct.forEach(v => {
        const mapped = mapToLetter(v);
        if (/^[ABCD]$/.test(mapped)) correctSet.add(mapped);
      });
    } else if (typeof correct === "string") {
      const parts = correct
        .replace(/and/gi, ",")
        .split(/[,\s/]+/)
        .map(s => s.trim())
        .filter(Boolean);
      parts.forEach(p => {
        const mapped = mapToLetter(p);
        if (/^[ABCD]$/.test(mapped)) correctSet.add(mapped);
      });
    } else if (typeof correct === "number") {
      correctSet.add(["A","B","C","D"][Math.max(0, correct - 1)]);
    }

    // --- rationale ---
    const rationale = resolveText(firstDefined(raw, RATIONALE_KEYS));

    const id = raw.id ?? `q_${i}`;
    return {
      id,
      stem: String(stem || "").trim(),
      choices,
      correctSet,
      rationale: String(rationale || "").trim(),
      misses: 0,
      mastered: false
    };
  }

  // --- Data loading ----------------------------------------
  async function loadModuleBank(modulePath) {
    const res = await fetch(modulePath, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load module: ${modulePath} (${res.status})`);
    const data = await res.json();

    // common shapes: array OR { items: [...] } OR { questions: [...] }
    const items = Array.isArray(data)
      ? data
      : (data.items ?? data.questions ?? data.data ?? []);

    if (!items.length) throw new Error("This module appears empty.");
    return items.map(normalizeItem);
  }

  async function fetchModuleList() {
    try {
      const r = await fetch("/modules", { cache: "no-store" });
      if (r.ok) {
        const list = await r.json();
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
  function pathFromMaybe(p) { return p.startsWith("/") ? p : `/${p}`; }

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
      if (e.key === "Enter") { e.preventDefault(); submitBtn.click(); return; }
      const k = e.key.toUpperCase();
      const idx = "ABCD".indexOf(k);
      if (idx >= 0) {
        const target = optsForm.querySelectorAll("input")[idx];
        if (!target) return;
        target.checked = target.type === "radio" ? true : !target.checked;
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

    showQuiz();
    renderCounters();
    nextQuestion();
  }

  function nextQuestion() {
    idx += 1;
    if (idx >= QUEUE.length) {
      if (remainToMaster > 0) {
        const rest = shuffle(SAMPLE.filter(q => !q.mastered));
        QUEUE = QUEUE.concat(rest);
      } else {
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

    let correct = false;
    if (showing.correctSet.size) {
      // Compare letter sets
      correct =
        chosenLetters.size === showing.correctSet.size &&
        [...chosenLetters].every(l => showing.correctSet.has(l));
    } else {
      // No declared key in bank — avoid dead-ends
      correct = chosenLetters.has("A");
    }

    if (correct) {
      if (!showing.mastered) { showing.mastered = true; remainToMaster -= 1; }
    } else {
      showing.misses += 1;
      QUEUE.push(showing);
    }

    renderFeedback(showing, correct, chosenLetters);
    renderCounters();
    submitBtn.textContent = "Next";
  }

  // --- Events ----------------------------------------------
  submitBtn.addEventListener("click", () => {
    if (!showing) return;
    if (submitBtn.textContent === "Submit") gradeCurrent();
    else nextQuestion();
  });

  resetBtn.addEventListener("click", () => { showLauncher(); });
  restartBtn.addEventListener("click", () => { showLauncher(); });

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
    const path = opt.value;
    currentModule = { label: opt.textContent, path };

    try {
      BANK = await loadModuleBank(path);
    } catch (err) {
      alert(err.message || String(err));
      return;
    }
    if (!BANK.length) { alert("This module appears empty."); return; }

    const deck = shuffle(BANK);
    const size = sampleSize === "full" ? deck.length : Math.min(deck.length, sampleSize || 10);
    SAMPLE = deck.slice(0, size);

    beginRun();
  });

  // --- Init -------------------------------------------------
  async function init() {
    moduleSel.innerHTML = "";
    const mods = await fetchModuleList();
    if (!mods.length) {
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
