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
function renderQuestion(qObj){
    const { text, choices, multi } = qObj;
    quizHeader.classList.remove('hidden');
    updateHeader();
    const type = multi ? 'checkbox' : 'radio';

    appRoot.innerHTML = html`
      <section class="card">
        <div class="question">${escapeHtml(text)}</div>
        <div class="choices" role="group" aria-label="choices">
          ${choices.map((c,i)=>`
            <label class="choice" data-k="${escapeHtml(c.key)}">
              <input name="opt" type="${type}" value="${escapeHtml(c.key)}" />
              <span class="label">${escapeHtml(c.key)}.</span>
              <span class="text">${escapeHtml(c.text)}</span>
            </label>
          `).join('')}
        </div>
        <div class="actions">
          <button id="submitBtn" class="btn primary">Submit</button>
        </div>
        <div id="feedback"></div>
      </section>
    `;

    // Click the whole row on desktop - prevent default to avoid double-toggle
    appRoot.querySelectorAll('.choice').forEach(row=>{
      row.addEventListener('click', (e)=>{
        e.preventDefault();
        const input = row.querySelector('input');
        input.checked = !input.checked;
      });
    });

    // keyboard shortcuts
    window.onkeydown = (e) => {
      const k = e.key.toUpperCase();
      const row = [...appRoot.querySelectorAll('.choice')].find(r=>r.dataset.k===k);
      if(row){ 
        e.preventDefault();
        row.click(); 
      }
      if(e.key === 'Enter'){
        e.preventDefault();
        appRoot.querySelector('#submitBtn')?.click();
      }
    }

    appRoot.querySelector('#submitBtn').addEventListener('click', ()=>{
      const selected = [...appRoot.querySelectorAll('input[name="opt"]:checked')].map(i=>i.value.toUpperCase());
      grade(selected);
    });
  }

  function grade(selected){
    const fb = appRoot.querySelector('#feedback');
    const corr = [...currentQuestionObj.correct];
    const isCorrect = selected.length===corr.length && selected.every(x=>currentQuestionObj.correct.has(x));
    const correctText = corr.join(', ');
    if(isCorrect){
      mastered.add(currentIdx);
      fb.innerHTML = `<div class="feedback ok">Correct!</div>`;
    }else{
      fb.innerHTML = `<div class="feedback err">Incorrect</div>`;
      // push back for repetition
      queue.push(currentIdx);
    }
    // Rationale
    if(currentQuestionObj.rationale){
      const text = escapeHtml(currentQuestionObj.rationale);
      const ca = correctText ? `<div><b>Correct Answer:</b> ${escapeHtml(correctText)}</div>` : '';
      fb.innerHTML += `<div class="answer-block">${ca}<div><b>Rationale:</b> ${text}</div></div>`;
    }
    // Next button
    const btn = appRoot.querySelector('#submitBtn');
    btn.textContent = 'Next';
    btn.onclick = next;
  }

  function next(){
    // Pop until find a not-mastered or run end
    while(queue.length && mastered.has(queue[0])) queue.shift();
    if(queue.length === 0){
      // finished
      renderResults();
      return;
    }
    run += 1;
    currentIdx = queue.shift();
    seen.add(currentIdx);
    currentQuestionObj = normalize(bank[currentIdx]);
    renderQuestion(currentQuestionObj);
  }

  function renderResults(){
    clearKeyboardShortcuts();
    const misses = [...seen].filter(i=>!mastered.has(i)).map(i=>normalize(bank[i]));
    appRoot.innerHTML = html`
      <section class="card">
        <h2 style="margin:0 0 8px 0">Most-Missed First</h2>
        <div class="meta">We bubble up your toughest questions; the farther you scroll, the fewer misses.</div>
        <div style="height:8px"></div>
        ${misses.map(q=>`
          <article class="card" style="margin:10px 0">
            <div class="question">${escapeHtml(q.text)}</div>
            ${q.rationale?`<div class="answer-block"><b>Rationale:</b> ${escapeHtml(q.rationale)}</div>`:''}
          </article>
        `).join('')}
        <div style="margin-top:12px">
          <button class="btn primary" id="newQuiz">Start New Quiz</button>
        </div>
      </section>
    `;
    document.getElementById('newQuiz').addEventListener('click', startLauncher);
  }

  async function startQuiz(file){
    try {
      // Load the bank
      const url = `/modules/${encodeURIComponent(file)}`;
      bank = await fetchJSON(url);
      if(!Array.isArray(bank) || bank.length===0){
        alert('This module appears empty.');
        startLauncher();
        return;
      }
      pageTitle.textContent = labelFromFile(file);
      mastered = new Set();
      seen = new Set();
      run = 0;
      // Build initial queue (sample)
      const N = bank.length;
      let indices = [...Array(N).keys()];
      // shuffle
      for (let i = N-1; i>0; i--){
        const j = Math.floor(Math.random()*(i+1));
        [indices[i],indices[j]]=[indices[j],indices[i]];
      }
      if(targetLen>0) indices = indices.slice(0, Math.min(targetLen, N));
      queue = indices.slice();
      // Ensure until-mastery (we keep queue dynamic)
      next();
    } catch(e) {
      console.error(e);
      alert('Failed to load module: ' + e.message);
      startLauncher();
    }
  }

  async function startLauncher(){
    const modules = await loadModules();
    if(modules.length === 0) {
      appRoot.innerHTML = html`
        <section class="card">
          <h2 style="margin:0 0 8px 0">No Modules Found</h2>
          <p class="meta">No quiz modules were found. Please add JSON files to your repository following these patterns:</p>
          <ul class="meta">
            <li>Module_*.json</li>
            <li>Learning_*.json</li>
            <li>Pharm_*.json</li>
            <li>*_Quiz_*.json</li>
          </ul>
        </section>
      `;
      return;
    }
    renderLauncher(modules);
  }

  // init
  startLauncher();
})();
