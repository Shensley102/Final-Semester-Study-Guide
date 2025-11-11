/* Final Semester Study Guide - Shared Quiz Engine (desktop & mobile) */
const $ = (id) => document.getElementById(id);

/* --- DOM refs --- */
const runCounter=$('runCounter'),remainingCounter=$('remainingCounter'),countersBox=$('countersBox');
const progressBar=$('progressBar'),progressFill=$('progressFill'),progressLabel=$('progressLabel');
const pageTitle=$('pageTitle'),defaultTitle=pageTitle?.textContent||'Final Semester Study Guide';
const launcher=$('launcher'),moduleSel=$('moduleSel'),lengthBtns=$('lengthBtns'),startBtn=$('startBtn'),resumeBtn=$('resumeBtn');
const quiz=$('quiz'),qText=$('questionText'),form=$('optionsForm'),submitBtn=$('submitBtn'),nextBtn=$('nextBtn');
const feedback=$('feedback'),answerLine=$('answerLine'),rationaleBox=$('rationale');
const summary=$('summary'),firstTrySummary=$('firstTrySummary'),firstTryPct=$('firstTryPct'),firstTryCount=$('firstTryCount'),firstTryTotal=$('firstTryTotal'),reviewList=$('reviewList'),restartBtn2=$('restartBtnSummary'),resetAll=$('resetAll');

/* --- Helpers --- */
const escapeHTML=(s='')=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const randomInt=(n)=>Math.floor(Math.random()*n);
function shuffleInPlace(a){for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a;}

/* --- Normalize questions --- */
function normalizeQuestions(raw){
  const qs=Array.isArray(raw?.questions)?raw.questions:[];const norm=[];
  for(const q of qs){
    const id=String(q.id??(crypto.randomUUID?.()||Math.random().toString(36).slice(2)));
    const stem=String(q.stem??''),type=String(q.type??'single_select');
    const opts=Array.isArray(q.options)?q.options.map(String):[];
    const correctLetters=Array.isArray(q.correct)?q.correct.map(String):[];
    const rationale=String(q.rationale??'');
    const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0,opts.length);
    const options={};letters.forEach((L,i)=>options[L]=opts[i]??'');
    norm.push({id,stem,options,correctLetters,rationale,type});
  } return norm;
}

/* --- Pretty names --- */
function prettifyModuleName(name){
  const raw=String(name||''); const map={
    'Pharm_Quiz_1':'Pharm Quiz 1','Pharm_Quiz_2':'Pharm Quiz 2','Pharm_Quiz_3':'Pharm Quiz 3','Pharm_Quiz_4':'Pharm Quiz 4',
    'Learning_Questions_Module_1_2':'Learning Questions Module 1 and 2',
    'Learning_Questions_Module_3_4_':'Learning Questions Module 3 and 4'
  };
  return map[raw] || raw.replace(/_/g,' ').replace(/\s+/g,' ').trim();
}

/* --- Storage --- */
const STORAGE_KEY='quizRunState_v1';
function saveRunState(){try{localStorage.setItem(STORAGE_KEY, JSON.stringify({ bank:run.bank, i:run.i }))}catch{}}
function clearSavedState(){try{localStorage.removeItem(STORAGE_KEY)}catch{}}

/* --- State --- */
let allQuestions=[];
let run={ bank:'', displayName:'', order:[], masterPool:[], i:0, answered:new Map(), uniqueSeen:new Set(), stats:new Map() };

/* --- Rendering --- */
function renderQuestion(q){
  qText.textContent=q.stem; form.innerHTML=''; feedback.textContent=''; feedback.classList.remove('ok','bad');
  answerLine.textContent=''; rationaleBox.textContent=''; rationaleBox.classList.add('hidden');
  const isMulti=q.type==='multi_select'; form.setAttribute('role', isMulti?'group':'radiogroup');
  Object.entries(q.options).forEach(([L,text])=>{
    const wrap=document.createElement('div'); wrap.className='opt';
    const input=document.createElement('input'); input.type=isMulti?'checkbox':'radio'; input.name='opt'; input.value=L; input.id=`opt-${L}`;
    const lab=document.createElement('label'); lab.htmlFor=input.id; lab.innerHTML=`<span class="k">${L}.</span> <span class="ans">${escapeHTML(text||'')}</span>`;
    wrap.appendChild(input); wrap.appendChild(lab); form.appendChild(wrap);
  });
  submitBtn.textContent='Submit'; submitBtn.disabled=true; submitBtn.dataset.mode='submit';
  form.onchange=()=>{ if(submitBtn.dataset.mode==='submit'){ submitBtn.disabled=!form.querySelector('input:checked'); } };
}

/* --- Counters/Progress --- */
function updateCounters(){
  runCounter.textContent=`Question: ${run.uniqueSeen.size}`;
  const remaining=run.masterPool.filter(q=>!(run.answered.get(q.id)?.correct)).length;
  remainingCounter.textContent=`Remaining to master: ${remaining}`;
}

/* --- Start --- */
async function startQuiz(){
  const lenBtn=lengthBtns.querySelector('.seg-btn.active');
  if(!lenBtn){ alert('Pick Length Of Quiz Before Starting'); return; }
  const bank=moduleSel.value; const qty=lenBtn.dataset.len==='full'?'full':parseInt(lenBtn.dataset.len,10);
  const res=await fetch(`/${encodeURIComponent(bank)}.json`,{cache:'no-store'});
  if(!res.ok){ alert(`Could not load ${bank}.json`); return; }
  const raw=await res.json(); allQuestions=normalizeQuestions(raw);
  const sampled = qty==='full'? shuffleInPlace(allQuestions.slice()) : shuffleInPlace(allQuestions.slice()).slice(0,qty);
  run={ bank, displayName: prettifyModuleName(bank), order:sampled, masterPool:sampled.slice(), i:0, answered:new Map(), uniqueSeen:new Set(), stats:new Map() };
  launcher.classList.add('hidden'); summary.classList.add('hidden'); quiz.classList.remove('hidden'); countersBox.classList.remove('hidden'); resetAll.classList.remove('hidden');
  const q0=run.order[0]; run.uniqueSeen.add(q0.id); renderQuestion(q0); updateCounters();
}

/* --- Answering --- */
function getUserLetters(){ return [...form.querySelectorAll('input')].filter(i=>i.checked).map(i=>i.value).sort(); }
function formatCorrect(q){ return (q.correctLetters||[]).map(L=>`${L}. ${q.options[L]||''}`).join('<br>'); }

submitBtn?.addEventListener('click',()=>{
  if(submitBtn.dataset.mode==='next'){
    const next = (++run.i < run.order.length) ? run.order[run.i] : null;
    if(!next){ return endRun(); }
    run.uniqueSeen.add(next.id); renderQuestion(next); updateCounters(); return;
  }
  const q=run.order[run.i]; const user=getUserLetters();
  const corr=(q.correctLetters||[]).slice().sort(); const ok=JSON.stringify(user)===JSON.stringify(corr);
  run.answered.set(q.id,{correct:ok,user});
  feedback.textContent= ok?'Correct!':'Incorrect'; feedback.classList.add(ok?'ok':'bad');
  answerLine.innerHTML=`<strong>Correct Answer:</strong><br>${formatCorrect(q)}`;
  rationaleBox.textContent=q.rationale||''; rationaleBox.classList.remove('hidden');
  form.querySelectorAll('input').forEach(i=>i.disabled=true);
  submitBtn.dataset.mode='next'; submitBtn.textContent='Next'; submitBtn.disabled=false;
});

/* --- End --- */
function endRun(){
  quiz.classList.add('hidden'); summary.classList.remove('hidden'); countersBox.classList.add('hidden');
  if(restartBtn2){ restartBtn2.textContent='Start New Quiz'; summary.insertBefore(restartBtn2, summary.firstChild); }
  if(!document.getElementById('sortNote')){
    const n=document.createElement('div'); n.id='sortNote'; n.className='sorted-note';
    n.innerHTML='<span class="icon">🧭</span><span><strong>Most-Missed First</strong> — we bubble up your toughest questions; the farther you scroll, the fewer misses.</span>';
    summary.insertBefore(n, restartBtn2.nextSibling);
  }
  reviewList.innerHTML='';
  const scored=[];
  for(const q of run.masterPool){
    const a=run.answered.get(q.id); if(!a) continue;
    const wrongs = a.correct?0:1; const attempts=1;
    scored.push({q,wrongs,attempts});
  }
  scored.sort((A,B)=>B.wrongs-A.wrongs || B.attempts-A.attempts || String(A.q.stem).localeCompare(B.q.stem));
  for(const {q,wrongs,attempts} of scored){
    const row=document.createElement('div'); row.className='rev-item '+((run.answered.get(q.id)?.correct)?'ok':'bad');
    const aux=document.createElement('div'); aux.className='rev-aux'; aux.textContent = `${wrongs} misses • ${attempts} attempt${attempts===1?'':'s'}`;
    const qEl=document.createElement('div'); qEl.className='rev-q'; qEl.textContent=q.stem;
    const ca=document.createElement('div'); ca.className='rev-ans'; ca.innerHTML=`<strong>Correct Answer:</strong><br>${formatCorrect(q)}`;
    const r=document.createElement('div'); r.className='rev-rationale'; r.innerHTML=`<strong>Rationale:</strong> ${q.rationale||''}`;
    row.appendChild(qEl); row.appendChild(aux); row.appendChild(ca); row.appendChild(r); reviewList.appendChild(row);
  }
  clearSavedState();
}
resetAll?.addEventListener('click',()=>{ clearSavedState(); location.reload(); });
restartBtn2?.addEventListener('click',()=>location.reload());

/* --- Init --- */
lengthBtns?.addEventListener('click',(e)=>{
  const b=e.target.closest('.seg-btn'); if(!b) return;
  lengthBtns.querySelectorAll('.seg-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
});
startBtn?.addEventListener('click', startQuiz);

/* modules list */
async function fetchModules(){
  try{const r=await fetch(`/modules?_=${Date.now()}`,{cache:'no-store'});
  if(!r.ok) throw 0; const data=await r.json(); return Array.isArray(data.modules)?data.modules:[];}catch{return["Pharm_Quiz_1","Pharm_Quiz_2","Pharm_Quiz_3","Pharm_Quiz_4"]}
}
(async function initModules(){
  try{ moduleSel.innerHTML=''; const mods=await fetchModules();
    for(const m of mods){ const o=document.createElement('option'); o.value=m; o.textContent=prettifyModuleName(m); moduleSel.appendChild(o); }
    if(mods.length) moduleSel.value=mods[0];
  }catch{}
})();
