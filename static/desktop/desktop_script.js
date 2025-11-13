(() => {
  const appRoot = document.getElementById('appRoot');
  const quizHeader = document.getElementById('quizHeader');
  const pageTitle = document.getElementById('pageTitle');
  const runCounter = document.getElementById('runCounter');
  const remainingCounter = document.getElementById('remainingCounter');
  const progressFill = document.getElementById('progressFill');
  const progressPct = document.getElementById('progressPct');
  const resetBtn = document.getElementById('resetAll');

  // --- Data state
  let bank = [];
  let queue = [];
  let mastered = new Set();
  let seen = new Set();
  let currentIdx = -1;
  let run = 0;
  let targetLen = 10;
  let currentQuestionObj = null;

  resetBtn.addEventListener('click', () => startLauncher());

  // Utilities
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  const html = (strings, ...vals) => strings.map((s,i)=>s+(vals[i]??"")).join("");

  function labelFromFile(fn){
    return fn.replace(/_/g,' ').replace(/\.json$/,'')
  }

  async function fetchJSON(url){
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok) throw new Error(`Fetch failed: ${url}`);
    return res.json();
  }

  async function loadModules(){
    // Ask server for list
    try{
      const list = await fetchJSON('/modules');
      return list;
    }catch(e){
      console.error(e);
      return [];
    }
  }

  function normalize(raw){
    // Try to be robust to many shapes
    const get = (obj, keys) => {
      for(const k of keys){
        if(obj[k] != null) return obj[k];
        const lower = Object.keys(obj).find(x=>x.toLowerCase()===k.toLowerCase());
        if(lower) return obj[lower];
      }
      return undefined;
    }
    const text = get(raw, ['question','Question','stem','q']) || '(No question text found)';
    const rationale = get(raw, ['rationale','Rationale','rational','explanation']) || '';
    // Choices
    const choices = [];
    const letters = ['A','B','C','D','E','F'];
    if(get(raw, ['A','a']) || get(raw, ['B','b'])){
      for(const L of letters){
        const t = get(raw, [L,L.toLowerCase()]);
        if(t) choices.push({key:L, text:String(t)});
      }
    } else if(Array.isArray(get(raw, ['choices','options']))){
      const arr = get(raw, ['choices','options']);
      arr.forEach((t,i)=>choices.push({key:letters[i]||String(i+1), text:String(t.text??t)}));
    }
    // Correct
    let corrRaw = get(raw, ['correct','Correct','answer','Answer','answers']);
    let corrSet = new Set();
    if(typeof corrRaw === 'string'){
      corrRaw.split(/[,\s]+/).filter(Boolean).forEach(x=>corrSet.add(x.trim().toUpperCase()));
    }else if(Array.isArray(corrRaw)){
      corrRaw.forEach(x=>corrSet.add(String(x).trim().toUpperCase()));
    }else if(typeof corrRaw === 'number'){
      corrSet.add(letters[corrRaw]||String(corrRaw));
    }
    const multi = corrSet.size > 1;
    return { text, choices, correct: corrSet, rationale, multi };
  }

  function renderLauncher(modules){
    clearKeyboardShortcuts();
    quizHeader.classList.add('hidden');
    appRoot.innerHTML = html`
      <section class="card">
        <h2 style="margin:0 0 8px 0">Final Semester Study Guide</h2>
        <div class="meta">How it works & hotkeys</div>
        <ul class="meta">
          <li>Pick a <b>Module</b> and a <b>Length</b>, then click <b>Start Quiz</b>.</li>
          <li>Click an option or use letter keys (A–Z).</li>
          <li>Press <b>Enter</b> to submit/next.</li>
          <li>Missed questions come back until you answer every one correctly.</li>
        </ul>

        <div style="display:grid; gap:14px; margin-top:12px">
          <label><b>Module Choice</b><br/>
            <select id="moduleSel" class="btn" style="width:100%">
              ${modules.map(m=>`<option value="${escapeHtml(m.file)}">${escapeHtml(m.label)}</option>`).join('')}
            </select>
          </label>

          <label><b>Length</b><br/>
            <div style="display:flex; gap:8px; flex-wrap:wrap">
              ${[10,25,50,100].map(n=>`<button class="btn len" data-n="${n}">${n}</button>`).join('')}
              <button class="btn len" data-n="-1">Full</button>
            </div>
          </label>

          <div><button id="startBtn" class="btn primary">Start Quiz</button></div>
        </div>
      </section>
    `;
    const lenBtns = [...appRoot.querySelectorAll('.len')];
    lenBtns.forEach(b=>b.addEventListener('click', (e)=>{
      e.preventDefault();
      targetLen = Number(b.dataset.n);
      lenBtns.forEach(x=>x.classList.remove('primary'));
      b.classList.add('primary');
    }));
    // default
    targetLen = 10;
    lenBtns[0].classList.add('primary');

    appRoot.querySelector('#startBtn').addEventListener('click', async ()=>{
      const sel = appRoot.querySelector('#moduleSel').value;
      await startQuiz(sel);
    });
  }

  function updateHeader(){
    runCounter.textContent = String(run);
    const remaining = queue.filter(id=>!mastered.has(id)).length;
    remainingCounter.textContent = String(remaining);
    const total = mastered.size + remaining;
    const pct = total>0 ? Math.round((mastered.size/total)*100) : 0;
    progressFill.style.width = pct + '%';
    progressPct.textContent = pct + '%';
  }

  function clearKeyboardShortcuts(){
    window.onkeydown = null;
  }
