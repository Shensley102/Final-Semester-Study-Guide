(() => {
  const appRoot = document.getElementById('appRoot');
  const quizHeader = document.getElementById('quizHeader');
  const pageTitle = document.getElementById('pageTitle');
  const runCounter = document.getElementById('runCounter');
  const remainingCounter = document.getElementById('remainingCounter');
  const progressFill = document.getElementById('progressFill');
  const progressPct = document.getElementById('progressPct');
  const resetBtn = document.getElementById('resetAll');

  let bank = [];
  let queue = [];
  let mastered = new Set();
  let seen = new Set();
  let currentIdx = -1;
  let run = 0;
  let targetLen = 10;
  let currentQuestionObj = null;

  resetBtn.addEventListener('click', () => startLauncher());

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  const html = (strings, ...vals) => strings.map((s,i)=>s+(vals[i]??"")).join("");

  function labelFromFile(fn){ return fn.replace(/_/g,' ').replace(/\.json$/,'') }

  async function fetchJSON(url){
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok) throw new Error(`Fetch failed: ${url}`);
    return res.json();
  }

  async function loadModules(){
    try{
      return await fetchJSON('/modules');
    }catch(e){
      console.error(e);
      return [];
    }
  }

  function normalize(raw){
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
    const choices = [];
    const letters = ['A','B','C','D','E','F'];
    if(get(raw, ['A','a']) || get(raw, ['B','b'])){
      for(const L of letters){
        const t = get(raw, [L,L.toLowerCase()]); if(t) choices.push({key:L, text:String(t)});
      }
    } else if(Array.isArray(get(raw, ['choices','options']))){
      const arr = get(raw, ['choices','options']);
      arr.forEach((t,i)=>choices.push({key:letters[i]||String(i+1), text:String(t.text??t)}));
    }
    let corrRaw = get(raw, ['correct','Correct','answer','Answer','answers']);
    const corrSet = new Set();
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
    quizHeader.classList.add('hidden');
    appRoot.innerHTML = html`
      <section class="card">
        <h2 style="margin:0 0 8px 0">Final Semester Study Guide</h2>
        <div class="meta">How it works</div>
        <ul class="meta">
          <li>Pick a <b>Module</b> and <b>Length</b>, then tap <b>Start Quiz</b>.</li>
          <li>Tap anywhere on an answer to select it.</li>
          <li>Missed questions will repeat until mastered.</li>
        </ul>

        <div style="display:grid; gap:12px; margin-top:10px">
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

          <button id="startBtn" class="btn primary">Start Quiz</button>
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
   function renderQuestion(qObj){
    const { text, choices, multi } = qObj;
    quizHeader.classList.remove('hidden');
    updateHeader();
    const type = multi ? 'checkbox' : 'radio';
    appRoot.innerHTML = html`
      <section class="card">
        <div class="question">${escapeHtml(text)}</div>
        <div class="choices" role="group" aria-label="choices">
          ${choices.map(c=>`
            <label class="choice" data-k="${escapeHtml(c.key)}">
              <input name="opt" type="${type}" value="${escapeHtml(c.key)}" />
              <span class="label">${escapeHtml(c.key)}.</span>
              <span class="text">${escapeHtml(c.text)}</span>
            </label>
          `).join('')}
        </div>
        <button id="submitBtn" class="btn primary">Submit</button>
        <div id="feedback"></div>
      </section>
    `;
    // whole-row tap - prevent default to avoid double-toggle
    appRoot.querySelectorAll('.choice').forEach(row=>{
      row.addEventListener('click', (e)=>{
        e.preventDefault();
        const input = row.querySelector('input');
        input.checked = !input.checked;
      });
    });
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
      queue.push(currentIdx);
    }
    if(currentQuestionObj.rationale){
      fb.innerHTML += `<div class="answer-block"><b>Correct Answer:</b> ${escapeHtml(correctText)}<br/><b>Rationale:</b> ${escapeHtml(currentQuestionObj.rationale)}</div>`;
    }
    const btn = appRoot.querySelector('#submitBtn');
    btn.textContent = 'Next';
    btn.onclick = next;
  }

  function next(){
    while(queue.length && mastered.has(queue[0])) queue.shift();
    if(queue.length === 0){
      renderResults(); return;
    }
    run += 1;
    currentIdx = queue.shift();
    seen.add(currentIdx);
    currentQuestionObj = normalize(bank[currentIdx]);
    renderQuestion(currentQuestionObj);
  }

  function renderResults(){
    const misses = [...seen].filter(i=>!mastered.has(i)).map(i=>normalize(bank[i]));
    appRoot.innerHTML = html`
      <section class="card">
        <h2 style="margin:0 0 8px 0">Most-Missed First</h2>
        <div class="meta">We bubble up your toughest questions; the farther you scroll, the fewer misses.</div>
        <div style="height:8px"></div>
        ${misses.map(q=>`
          <article class="card" style="margin:10px 0">
            <div class="question">${escapeHtml(q.text)}</div>
            ${q.rationale?`<div class="answer-block"><b>Rat
