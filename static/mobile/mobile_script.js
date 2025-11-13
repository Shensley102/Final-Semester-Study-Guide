/* ==========================================================
   Final-Semester Study Guide — Mobile
   Shared logic with desktop, but keeps mobile UI intact.
   ========================================================== */

(() => {
  const $ = (s) => document.querySelector(s);

  // Hook up to your mobile DOM ids/classes
  const moduleSel     = $("#moduleSel");
  const lengthBtnsBox = $("#lengthBtns");
  const startBtn      = $("#startBtn");

  const qEl           = $("#question");
  const optsForm      = $("#options");
  const submitBtn     = $("#submitBtn");
  const feedbackBox   = $("#feedback");
  const resultFlag    = $("#resultFlag");
  const correctAnsEl  = $("#correctAnswer");
  const rationaleEl   = $("#rationale");

  const runCounterEl  = $("#runCounter");
  const remainingEl   = $("#remainingCounter");
  const pbarFill      = $("#progressFill");
  const masteredPctEl = $("#masteredPct");

  let BANK=[], SAMPLE=[], QUEUE=[], idx=-1, showing=null;
  let runCount=0, remainToMaster=0, sampleSize=10, currentModule=null;

  // ---------- same helpers as desktop ----------
  const TEXT_KEYS = ["question","Question","question_text","questionText","Stem","stem","prompt","Prompt","Q","text","Text","title","Title"];
  const RATIONALE_KEYS = ["rationale","Rationale","rationale_text","RationaleText","explanation","Explanation","reason","Reason","why","Why","Rational","Rationales","Rationale(s)"];

  function firstDefined(obj, keys){ for(const k of keys){ if(obj && Object.prototype.hasOwnProperty.call(obj,k) && obj[k]!=null){return obj[k];}}}
  function resolveText(val){ if(val==null) return ""; if(typeof val==="string") return val; if(typeof val==="number") return String(val); if(typeof val==="object"){ const n=firstDefined(val,["text","Text","stem","Stem","title","Title","prompt","Prompt"]); return n!=null?resolveText(n):"";} return String(val??"");}
  function mapToLetter(v){ if(typeof v==="string"){const s=v.trim(); if(/^[ABCD]$/i.test(s)) return s[0].toUpperCase(); if(/[A-D]/i.test(s) && /[,/& ]/.test(s)) return s.toUpperCase();} if(typeof v==="number"){ return ["A","B","C","D"][Math.max(0,v-1)] ?? "A";} return String(v).toUpperCase();}
  function letterForIndex(i){ return ["A","B","C","D"][i] ?? "?"; }
  function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr;}
  function percent(n,d){ return d?Math.round((n/d)*100):0;}

  function normalizeItem(raw,i){
    let stemSource = firstDefined(raw, TEXT_KEYS);
    if (typeof stemSource === "object") stemSource = resolveText(stemSource);
    const stem = resolveText(stemSource);

    let choices=[];
    const arr = raw.options ?? raw.choices ?? raw.answers ?? raw.Answers ?? raw.Options;
    if (Array.isArray(arr)) choices = arr.slice(0,4).map(resolveText);
    if(!choices.length){
      const groups=[["A","B","C","D"],["a","b","c","d"],["optionA","optionB","optionC","optionD"],["OptionA","OptionB","OptionC","OptionD"],["option1","option2","option3","option4"],["Option1","Option2","Option3","Option4"],["1","2","3","4"]];
      for(const g of groups){ const vals=g.map(k=>raw[k]).filter(v=>v!=null); if(vals.length>=2){ choices=vals.slice(0,4).map(resolveText); break;}}
    }

    let correct = raw.correct ?? raw.Correct ?? raw.correct_answer ?? raw.correctAnswer ?? raw["Correct_Answer"] ?? raw["Correct Answer"] ?? raw.correctOptions ?? raw.correctLetters ?? raw.correct_index ?? raw.Answer ?? raw.answer ?? null;
    const correctSet=new Set();
    if(Array.isArray(correct)){ correct.forEach(v=>{ const m=mapToLetter(v); if(/^[ABCD]$/.test(m)) correctSet.add(m);});}
    else if(typeof correct==="string"){ correct.replace(/and/gi,",").split(/[,\s/]+/).map(s=>s.trim()).filter(Boolean).forEach(p=>{ const m=mapToLetter(p); if(/^[ABCD]$/.test(m)) correctSet.add(m);});}
    else if(typeof correct==="number"){ correctSet.add(["A","B","C","D"][Math.max(0,correct-1)]);}

    const rationale = resolveText(firstDefined(raw, RATIONALE_KEYS));
    const id = raw.id ?? `q_${i}`;
    return { id, stem:String(stem||"").trim(), choices, correctSet, rationale:String(rationale||"").trim(), misses:0, mastered:false };
  }

  async function loadModuleBank(modulePath){
    const r = await fetch(modulePath, {cache:"no-store"});
    if(!r.ok) throw new Error(`Failed to load module: ${modulePath} (${r.status})`);
    const data = await r.json();
    const items = Array.isArray(data) ? data : (data.items ?? data.questions ?? data.data ?? []);
    if(!items.length) throw new Error("This module appears empty.");
    return items.map(normalizeItem);
  }

  async function fetchModuleList(){
    try{
      const r=await fetch("/modules",{cache:"no-store"});
      if(r.ok){
        const list=await r.json(); const out=[];
        if(Array.isArray(list)){
          for(const it of list){
            if(typeof it==="string") out.push({label:it.split("/").pop().replace(/_/g," ").replace(/\.json$/i,""), path: it.startsWith("/")?it:`/${it}`});
            else if(it && it.path) out.push({label: it.label ?? it.path.split("/").pop().replace(/_/g," ").replace(/\.json$/i,""), path: it.path.startsWith("/")?it.path:`/${it.path}`});
          }
        }
        if(out.length) return out;
      }
    }catch(_){}
    const fb=["template/Module_1.json","template/Module_2.json","template/Module_3.json","template/Module_4.json","template/Learning_Questions_Module_1_2.json","template/Learning_Questions_Module_3_4.json","template/Pharm_Quiz_1.json","template/Pharm_Quiz_2.json","template/Pharm_Quiz_3.json","template/Pharm_Quiz_4.json"];
    return fb.map(p=>({label:p.split("/").pop().replace(/_/g," ").replace(/\.json$/i,""), path:`/${p}`}));
  }

  function renderCounters(){
    runCounterEl && (runCounterEl.textContent=String(runCount));
    remainingEl && (remainingEl.textContent=String(remainToMaster));
    if (pbarFill && masteredPctEl) {
      const masteredSoFar = SAMPLE.filter(q=>q.mastered).length;
      const pct = percent(masteredSoFar, SAMPLE.length);
      pbarFill.style.width = `${pct}%`;
      masteredPctEl.textContent = `${pct}%`;
    }
  }

  function renderQuestion(item){
    qEl.textContent = item.stem || "(No question text found)";
    optsForm.innerHTML="";
    feedbackBox.hidden=true;

    const isMulti = item.correctSet.size > 1;
    const type = isMulti ? "checkbox" : "radio";
    optsForm.setAttribute("data-multi", isMulti ? "1" : "0");

    item.choices.forEach((txt,i)=>{
      const id=`opt_${i}`;
      const wrap=document.createElement("label");
      wrap.className="opt"; wrap.htmlFor=id;

      const input=document.createElement("input");
      input.type=type; input.name="choice"; input.id=id; input.value=letterForIndex(i); input.dataset.text=txt??"";

      const span=document.createElement("div");
      span.className="txt"; span.innerHTML=`<b>${letterForIndex(i)}.</b> ${txt??""}`;

      wrap.appendChild(input); wrap.appendChild(span);
      optsForm.appendChild(wrap);
    });

    window.onkeydown=(e)=>{
      if(["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) return;
      if(e.key==="Enter"){ e.preventDefault(); submitBtn.click(); return;}
      const k=e.key.toUpperCase(); const ix="ABCD".indexOf(k);
      if(ix>=0){ const target=optsForm.querySelectorAll("input")[ix]; if(!target) return; target.checked = target.type==="radio" ? true : !target.checked; }
    };
  }

  function renderFeedback(item,isCorrect,chosenLetters){
    feedbackBox.hidden=false;
    resultFlag.className="flag " + (isCorrect ? "ok":"bad");
    resultFlag.textContent = isCorrect ? "Correct" : "Incorrect";
    correctAnsEl.textContent = Array.from(item.correctSet).join(", ") || "(not specified)";
    rationaleEl.textContent = item.rationale || "";

    const inputs=[...optsForm.querySelectorAll("input")];
    inputs.forEach(inp=>{
      const opt=inp.closest(".opt"); const L=inp.value;
      opt.classList.remove("correct","incorrect");
      if(item.correctSet.has(L)) opt.classList.add("correct");
      if(chosenLetters.has(L) && !item.correctSet.has(L)) opt.classList.add("incorrect");
    });
  }

  function nextQuestion(){
    idx+=1;
    if(idx>=QUEUE.length){
      if(remainToMaster>0){ const rest=shuffle(SAMPLE.filter(q=>!q.mastered)); QUEUE=QUEUE.concat(rest); }
      else { /* mobile results page if you have one; otherwise do nothing */ return; }
    }
    showing=QUEUE[idx]; runCount+=1;
    renderQuestion(showing); renderCounters(); submitBtn.textContent="Submit";
  }

  function gradeCurrent(){
    if(!showing) return;
    const inputs=[...optsForm.querySelectorAll("input")];
    const selected=inputs.filter(i=>i.checked);
    if(!selected.length) return alert("Choose an answer.");

    const chosenLetters=new Set(selected.map(i=>i.value));
    let correct=false;
    if(showing.correctSet.size){
      correct = chosenLetters.size===showing.correctSet.size &&
                [...chosenLetters].every(l=>showing.correctSet.has(l));
    }else{
      correct = chosenLetters.has("A");
    }

    if(correct){ if(!showing.mastered){ showing.mastered=true; remainToMaster-=1; } }
    else { showing.misses+=1; QUEUE.push(showing); }

    renderFeedback(showing,correct,chosenLetters); renderCounters();
    submitBtn.textContent="Next";
  }

  submitBtn.addEventListener("click",()=>{ if(!showing) return; if(submitBtn.textContent==="Submit") gradeCurrent(); else nextQuestion(); });

  lengthBtnsBox && lengthBtnsBox.addEventListener("click",(e)=>{
    const b=e.target.closest(".chip"); if(!b) return;
    lengthBtnsBox.querySelectorAll(".chip").forEach(c=>c.classList.remove("active"));
    b.classList.add("active");
    sampleSize = b.dataset.len==="full" ? "full" : parseInt(b.dataset.len,10);
  });

  startBtn.addEventListener("click", async ()=>{
    const opt=moduleSel.selectedOptions[0]; if(!opt) return alert("Choose a module.");
    const path=opt.value; currentModule={label:opt.textContent, path};

    try{ BANK=await loadModuleBank(path); }catch(err){ alert(err.message||String(err)); return; }
    if(!BANK.length){ alert("This module appears empty."); return; }

    const deck=shuffle(BANK); const size=sampleSize==="full"?deck.length:Math.min(deck.length,sampleSize||10);
    SAMPLE=deck.slice(0,size); runCount=0; remainToMaster=SAMPLE.length; SAMPLE.forEach(q=>{q.misses=0;q.mastered=false;});
    QUEUE=shuffle(SAMPLE).slice(); idx=-1; nextQuestion();
  });

  (async function init(){
    moduleSel.innerHTML="";
    const mods=await fetchModuleList();
    if(!mods.length){ moduleSel.innerHTML=`<option value="/template/Module_1.json">Module 1</option>`; }
    else{
      for(const m of mods){
        const o=document.createElement("option"); o.value=m.path.startsWith("/")?m.path:`/${m.path}`; o.textContent=m.label; moduleSel.appendChild(o);
      }
    }
  })();
})();
