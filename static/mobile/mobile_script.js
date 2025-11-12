/* Mobile quiz engine: same logic as desktop, with full-width action button */

(() => {
  // DOM
  const launcher = document.getElementById('m-launcher');
  const quiz = document.getElementById('m-quiz');
  const results = document.getElementById('m-results');

  const moduleSel = document.getElementById('m-module');
  const lengthGroup = document.getElementById('m-lengths');
  const startBtn = document.getElementById('m-start');

  const run = document.getElementById('m-run');
  const rem = document.getElementById('m-rem');
  const fill = document.getElementById('m-fill');
  const reset = document.getElementById('m-reset');

  const qEl = document.getElementById('m-q');
  const choices = document.getElementById('m-choices');
  const action = document.getElementById('m-action');

  const feed = document.getElementById('m-feed');
  const badge = document.getElementById('m-badge');
  const ans = document.getElementById('m-ans');
  const rat = document.getElementById('m-rat');

  const newBtn = document.getElementById('m-new');
  const firstPct = document.getElementById('m-first');
  const firstCounts = document.getElementById('m-firstc');
  const review = document.getElementById('m-review');

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

  // state
  let selectedLen = 10;
  let bank = [];
  let order = [];
  let pos = 0;
  let mastered = new Set();
  let misses = new Map();
  let firstRight = 0;
  let firstTotal = 0;
  let mode = 'submit';

  const hide = el => el.classList.add('hidden');
  const show = el => el.classList.remove('hidden');

  function setLen(btn) {
    [...lengthGroup.querySelectorAll('.pill')].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const v = btn.dataset.len;
    selectedLen = (v === 'full') ? 'full' : parseInt(v, 10);
  }

  function showLauncher() {
    hide(quiz); hide(results); show(launcher);
    bank = []; order = []; pos = 0;
    mastered.clear(); misses.clear();
    firstRight = 0; firstTotal = 0;
    feed.classList.add('hidden');
    action.textContent = 'Submit';
    mode = 'submit';
    run.textContent = '1'; rem.textContent = '0'; fill.style.width = '0%';
  }

  function normalize(x, i) {
    const q = x.question || x.Question || x.prompt || '';
    const opts = x.options || x.choices || [x.A, x.B, x.C, x.D].filter(Boolean);
    const ans = (x.answer || x.correct || '').toString().trim().toUpperCase();
    const rat = x.rationale || x.explanation || x.reason || '';
    return { id:i, question:q, options:opts, answer:ans, rationale:rat };
  }

  function renderChoices(item) {
    choices.innerHTML = '';
    ['A','B','C','D'].forEach((L, idx) => {
      const text = item.options[idx] ?? '';
      const li = document.createElement('li');
      li.className = 'choice';
      li.innerHTML = `
        <label class="opt tapfill">
          <input type="radio" name="mchoice" value="${L}">
          <span class="letter">${L}.</span>
          <span class="txt">${text}</span>
        </label>
      `;
      li.addEventListener('click', () => {
        const inp = li.querySelector('input');
        inp.checked = true;
      });
      choices.appendChild(li);
    });
  }

  function selLetter() {
    const el = choices.querySelector('input[name="mchoice"]:checked');
    return el ? el.value : null;
  }

  function counters() {
    run.textContent = String(pos + 1);
    const target = firstTotal || (selectedLen === 'full' ? bank.length : selectedLen);
    rem.textContent = String(Math.max(target - mastered.size, 0));
    fill.style.width = `${Math.min((mastered.size / target) * 100, 100)}%`;
  }

  function renderQ() {
    const idx = order[pos];
    const it = bank[idx];
    if (!it) return showResults();

    qEl.textContent = it.question;
    renderChoices(it);
    feed.classList.add('hidden');
    badge.className = 'badge';
    badge.textContent = '';
    ans.textContent = '';
    rat.textContent = '';
    action.textContent = 'Submit';
    mode = 'submit';
    counters();
  }

  function submit() {
    const idx = order[pos];
    const it = bank[idx];
    const choice = selLetter();
    if (!choice) return;

    if (!misses.has(idx) && !mastered.has(idx)) {
      firstTotal += 1;
      if (choice === it.answer) firstRight += 1;
    }

    const ok = (choice === it.answer);
    feed.classList.remove('hidden');
    badge.className = `badge ${ok ? 'ok' : 'err'}`;
    badge.textContent = ok ? 'Correct' : 'Incorrect';
    ans.textContent = `${it.answer}. ${it.options['ABCD'.indexOf(it.answer)] || ''}`;
    rat.textContent = it.rationale || '';

    if (ok) mastered.add(idx);
    else {
      misses.set(idx, (misses.get(idx) || 0) + 1);
      order.push(idx);
    }

    action.textContent = 'Next';
    mode = 'next';
    counters();
  }

  function next() {
    pos += 1;               // <-- advance only here
    if (pos >= order.length) return showResults();
    renderQ();
  }

  function showResults() {
    hide(quiz); show(results);
    const pct = firstTotal ? Math.round((firstRight / firstTotal) * 100) : 0;
    firstPct.textContent = `${pct}%`;
    firstCounts.textContent = ` ( ${firstRight} / ${firstTotal} )`;

    const missPairs = [...misses.entries()].sort((a,b)=> (b[1]-a[1]) || (a[0]-b[0]));
    review.innerHTML = '';
    missPairs.forEach(([idx, count]) => {
      const it = bank[idx];
      const div = document.createElement('div');
      div.className = 'review-block';
      div.innerHTML = `
        <div class="chip">Missed ${count} time${count>1?'s':''}</div>
        <div class="review-q">${it.question}</div>
        <div class="review-a"><b>Answer:</b> ${it.answer}. ${it.options['ABCD'.indexOf(it.answer)] || ''}</div>
        <div class="review-r">${it.rationale || ''}</div>
      `;
      review.appendChild(div);
    });
  }

  async function loadModule(file) {
    const res = await fetch(`/${file}`, { cache:'no-store' });
    if (!res.ok) throw new Error('Module fetch failed');
    const data = await res.json();
    bank = (Array.isArray(data) ? data : (data.questions || [])).map((q,i)=>normalize(q,i));
  }

  function pickOrder() {
    const idxs = bank.map((_,i)=>i);
    if (selectedLen === 'full' || selectedLen >= bank.length) return idxs.slice();
    const out = [];
    const used = new Set();
    while (out.length < selectedLen && used.size < bank.length) {
      const r = Math.floor(Math.random()*bank.length);
      if (!used.has(r)) { used.add(r); out.push(r); }
    }
    return out;
  }

  async function startQuiz() {
    const file = moduleSel.value;
    if (!file) { alert('Pick a module.'); return; }
    await loadModule(file);
    if (!bank.length) { alert('This module appears empty.'); return; }

    order = pickOrder();
    pos = 0;                  // <-- start at 0
    mastered.clear(); misses.clear();
    firstRight = 0; firstTotal = 0;

    hide(launcher); show(quiz); hide(results);
    renderQ();
  }

  // Wiring
  moduleSel.innerHTML = MODULES.map(([label, file]) => `<option value="${file}">${label}</option>`).join('');
  lengthGroup.addEventListener('click', e => {
    const b = e.target.closest('.pill');
    if (!b) return;
    setLen(b);
  });

  startBtn.addEventListener('click', startQuiz);
  reset.addEventListener('click', showLauncher);
  action.addEventListener('click', () => (mode==='submit'? submit(): next()));
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter') {
      e.preventDefault();
      (mode==='submit'? submit(): next());
    }
  });
  newBtn.addEventListener('click', showLauncher);

  setLen(lengthGroup.querySelector('.pill.active') || lengthGroup.querySelector('.pill'));
  showLauncher();
})();
