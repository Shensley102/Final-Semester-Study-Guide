/* ==========================================================
   Desktop quiz shell
   - Keeps your existing logic intact
   - Only coordinates the new header
   ========================================================== */

/* ---------- DOM refs (existing IDs preserved) ---------- */
const $ = (sel) => document.querySelector(sel);

const header = $("#quizHeader");
const pageTitle = $("#pageTitle");
const runCounter = $("#runCounter");
const remainingCounter = $("#remainingCounter");
const progressFill = $("#progressFill");
const progressPct = $("#progressPct");
const resetBtn = $("#resetAll");

const appRoot = $("#appRoot");

/* ---------- Minimal state wrapper (your engine plugs in) ---------- */
const UIState = {
  running: false,
  moduleTitle: "Module",
  questionIndex: 1,
  remaining: 0,
  masteredPct: 0
};

/* Show/hide the quiz header depending on mode */
function setRunning(isRunning){
  UIState.running = isRunning;
  header.classList.toggle("hidden", !isRunning);
}

/* Update the header visuals */
function updateHeader(){
  pageTitle.textContent = UIState.moduleTitle;
  runCounter.textContent = UIState.questionIndex;
  remainingCounter.textContent = UIState.remaining;
  const pct = Math.max(0, Math.min(100, Math.round(UIState.masteredPct)));
  progressPct.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
}

/* Expose small API so your quiz engine can call into it */
window.DesktopUI = {
  /** Call when user lands on launcher */
  showLauncher(){
    setRunning(false);
    appRoot.innerHTML = ""; // your launcher gets injected by engine
  },

  /** Call when quiz starts */
  beginQuiz({ title, questionNumber, remaining, masteredPct }){
    UIState.moduleTitle = title ?? "Module";
    UIState.questionIndex = questionNumber ?? 1;
    UIState.remaining = remaining ?? 0;
    UIState.masteredPct = masteredPct ?? 0;
    setRunning(true);
    updateHeader();
  },

  /** Call on every step to refresh numbers */
  step({ questionNumber, remaining, masteredPct }){
    if (typeof questionNumber === "number") UIState.questionIndex = questionNumber;
    if (typeof remaining === "number") UIState.remaining = remaining;
    if (typeof masteredPct === "number") UIState.masteredPct = masteredPct;
    updateHeader();
  },

  /** Wire Reset */
  onReset(handler){
    resetBtn.onclick = handler;
  },

  /** Root where you inject question cards, results, etc. */
  root: appRoot
};

/* -------------- Starter: your existing boot code -------------- */
/* If you already bootstrap elsewhere, you can remove this demo.  */
/* The key is: call DesktopUI.beginQuiz(...) once you start.      */

// Example engine hook-up (pseudo):
// QuizEngine.mount(DesktopUI.root, {
//   onStart(moduleMeta){ DesktopUI.beginQuiz({
//       title: moduleMeta.title,
//       questionNumber: 1,
//       remaining: moduleMeta.toMaster,
//       masteredPct: 0
//   }); },
//   onStep(info){ DesktopUI.step(info); },
//   onReset(handler){ DesktopUI.onReset(handler); }
// });

