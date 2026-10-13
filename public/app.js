'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const BR = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
  const SERVICE = { BASIC: '기본 사주', LOVE: '연애상담', SUCCESS: '성공운', WEALTH: '재물운' };
  const PERSONA = { T_COLD: '냉철한 분석가', F_EMPATHY: '공감형 상담가' };
  const SECTIONS = [
    { key: '사주 핵심 요약', cls: 'hl' },
    { key: '메인 분석' },
    { key: '운의 흐름과 시기', timeline: true },
    { key: '전문가의 조언', bubble: true },
  ];
  const PIC = {
    T_COLD: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="2"/><path d="M24 9l5 15-5 15-5-15z" fill="currentColor" opacity=".9"/><circle cx="24" cy="24" r="2.5" fill="#0F172A"/></svg>',
    F_EMPATHY: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M33 31A14 14 0 0 1 17 11a14 14 0 1 0 16 20z" fill="currentColor"/><path d="M36 9l1.6 3.6L41 14l-3.4 1.4L36 19l-1.6-3.6L31 14l3.4-1.4z" fill="currentColor"/></svg>',
  };

  const form = $('#form');
  const el = { landing: $('#landing'), wizard: $('#wizard'), loading: $('#loading'), result: $('#result') };
  let step = 1;
  let busy = false;
  let state = null; // 현재 결과 상태

  // ───────── 초기화: 셀렉트 채우기 ─────────
  const thisYear = new Date().getFullYear();
  const opt = (v, t) => `<option value="${v}">${t}</option>`;
  $('#year').innerHTML = opt('', '년') + Array.from({ length: thisYear - 1900 + 1 }, (_, i) => thisYear - i).map((y) => opt(y, `${y}년`)).join('');
  $('#month').innerHTML = opt('', '월') + Array.from({ length: 12 }, (_, i) => opt(i + 1, `${i + 1}월`)).join('');
  $('#hour').innerHTML = opt('', '시간 모름') + Array.from({ length: 24 }, (_, h) => opt(h, `${String(h).padStart(2, '0')}시 · ${BR[Math.floor(((h + 1) % 24) / 2)]}시`)).join('');
  $('#minute').innerHTML = Array.from({ length: 60 }, (_, m) => opt(m, `${String(m).padStart(2, '0')}분`)).join('');
  $('#minute').disabled = true;

  const calValue = () => form.elements.cal.value;
  function refreshDays() {
    const y = Number($('#year').value) || 2000, m = Number($('#month').value) || 1;
    const max = calValue() === 'solar' ? new Date(y, m, 0).getDate() : 30;
    const cur = $('#day').value;
    $('#day').innerHTML = opt('', '일') + Array.from({ length: max }, (_, i) => opt(i + 1, `${i + 1}일`)).join('');
    if (cur && Number(cur) <= max) $('#day').value = cur;
  }
  refreshDays();
  ['year', 'month', 'day'].forEach((id) => $('#' + id).addEventListener('change', () => { $('#err1').hidden = true; }));
  ['year', 'month'].forEach((id) => $('#' + id).addEventListener('change', refreshDays));
  $$('input[name=cal]').forEach((r) => r.addEventListener('change', () => {
    refreshDays();
    $('#calHint').textContent = calValue() === 'solar' ? '윤달은 음력 윤달에 태어난 경우에만 선택하세요.'
      : calValue() === 'lunar' ? '음력 날짜로 입력하세요. 서버가 양력으로 변환해 계산해요.' : '음력 윤달에 태어난 경우입니다. 예) 2023년 윤2월';
  }));
  $('#hour').addEventListener('change', () => {
    const none = $('#hour').value === '';
    $('#minute').disabled = none;
    $('#timeHint').textContent = none ? '정확한 시각을 모르면 ‘시간 모름’을 선택하세요. 시주 없이 풀이해요.' : '출생 시각은 분 단위까지 입력하면 더 정확해요.';
  });

  fetch('/api/config').then((r) => r.json()).then((c) => {
    if (c.mode === 'demo') { const b = $('#modeBadge'); b.textContent = '데모 모드'; b.title = '서버에 OPENAI_API_KEY가 없어 규칙 기반 데모 풀이를 사용합니다.'; b.hidden = false; }
  }).catch(() => {});

  // ───────── 화면 전환 ─────────
  const show = (name) => { Object.entries(el).forEach(([k, n]) => { n.hidden = k !== name; }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('#startBtn').addEventListener('click', () => { show('wizard'); $('#name').focus({ preventScroll: true }); });

  function setStep(n) {
    step = n;
    $$('.panel').forEach((p) => { p.hidden = Number(p.dataset.panel) !== n; });
    $$('.steps li').forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('on', s === n); li.classList.toggle('done', s < n);
      if (s === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateStep1() {
    const e = $('#err1'); e.hidden = true;
    const miss = [];
    if (!$('#year').value) miss.push('년');
    if (!$('#month').value) miss.push('월');
    if (!$('#day').value) miss.push('일');
    if (miss.length) { e.textContent = `생년월일을 모두 선택해 주세요. (미선택: ${miss.join(', ')})`; e.hidden = false; return false; }
    return true;
  }
  $$('[data-next]').forEach((b) => b.addEventListener('click', () => { if (step === 1 && !validateStep1()) return; setStep(step + 1); }));
  $$('[data-prev]').forEach((b) => b.addEventListener('click', () => setStep(step - 1)));

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (step < 3) { if (step === 1 && !validateStep1()) return; setStep(step + 1); return; }
    analyze();
  });

  // ───────── 분석 요청 ─────────
  function collect() {
    const cal = calValue();
    const hourVal = $('#hour').value;
    return {
      name: $('#name').value.trim(),
      gender: form.elements.gender.value,
      calendar: cal === 'solar' ? 'solar' : 'lunar',
      leap: cal === 'leap',
      year: Number($('#year').value), month: Number($('#month').value), day: Number($('#day').value),
      hourKnown: hourVal !== '',
      hour: hourVal === '' ? null : Number(hourVal),
      minute: hourVal === '' ? null : Number($('#minute').value),
      ziMode: $('#ziMode').value,
      kstCorrection: $('#kst').checked,
      service_type: form.elements.service.value,
      persona_type: form.elements.persona.value,
    };
  }

  const LOAD_MSGS = ['사주 원국을 분석 중입니다...', '오행의 균형을 들여다보고 있습니다...', '십성과 지장간을 살펴보고 있습니다...', '대운과 세운의 흐름을 읽고 있습니다...', '상담가가 풀이를 정리하고 있습니다...'];
  let loadTimer;
  function startLoading() {
    let i = 0; $('#loadMsg').textContent = LOAD_MSGS[0];
    clearInterval(loadTimer);
    loadTimer = setInterval(() => { i = (i + 1) % LOAD_MSGS.length; $('#loadMsg').textContent = LOAD_MSGS[i]; }, 1500);
    show('loading');
  }
  const stopLoading = () => clearInterval(loadTimer);

  async function analyze() {
    if (busy) return;
    busy = true; $('#analyzeBtn').disabled = true; $('#err3').hidden = true;
    const payload = collect();
    state = { payload, text: '', saju: null, shown: false, minDelay: new Promise((r) => setTimeout(r, 3000)) };
    startLoading();
    let gotAny = false;
    try {
      const res = await fetch('/api/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        let msg = '요청을 처리하지 못했어요.';
        try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const ev = /^event: (.+)$/m.exec(block), dt = /^data: (.+)$/m.exec(block);
          if (!ev || !dt) continue;
          const data = JSON.parse(dt[1]);
          if (ev[1] === 'saju') state.saju = data;
          else if (ev[1] === 'delta') { gotAny = true; state.text += data.text; await ensureResult(); renderReport(); }
          else if (ev[1] === 'error') throw new Error(data.message);
          else if (ev[1] === 'done') { await ensureResult(); renderReport(true); }
        }
      }
    } catch (e) {
      stopLoading();
      if (state.shown) { const s = $('#streamErr'); s.textContent = `풀이를 끝까지 받지 못했어요: ${e.message}`; s.hidden = false; renderReport(true); }
      else { show('wizard'); setStep(3); const er = $('#err3'); er.textContent = e.message; er.hidden = false; }
    } finally {
      busy = false; $('#analyzeBtn').disabled = false;
    }
    void gotAny;
  }

  async function ensureResult() {
    if (state.shown) return;
    await state.minDelay;
    if (state.shown) return;
    state.shown = true; stopLoading();
    buildResult();
    show('result');
  }

  // ───────── 결과 렌더 ─────────
  function elClass(k) { return 'el-' + k; }

  function buildResult() {
    const s = state.saju, inp = s.input, p = state.payload;
    $('#streamErr').hidden = true;
    $('#personaPic').className = 'persona-badge ' + (p.persona_type === 'T_COLD' ? 't' : 'f');
    $('#personaPic').innerHTML = PIC[p.persona_type];
    $('#whoName').textContent = `${inp.name || '내담자'}님 · ${PERSONA[p.persona_type]}`;
    const cal = inp.calendar === 'lunar'
      ? `음력 ${inp.lunar.year}.${inp.lunar.month}.${inp.lunar.day}${inp.lunar.leap ? ' 윤달' : ''} (양력 ${inp.solar.year}.${inp.solar.month}.${inp.solar.day})`
      : `양력 ${inp.solar.year}.${inp.solar.month}.${inp.solar.day}`;
    const time = inp.hourKnown ? `${String(inp.hour).padStart(2, '0')}:${String(inp.minute).padStart(2, '0')}` : '시간 모름';
    $('#whoMeta').textContent = `${SERVICE[p.service_type]} · ${inp.gender === 'M' ? '남성' : '여성'} · ${cal} ${time}`;

    const order = [['hour', '시주'], ['day', '일주'], ['month', '월주'], ['year', '년주']];
    $('#pillars').innerHTML = order.map(([k, lab]) => {
      const pl = s.pillars[k];
      if (!pl) return `<div class="pil none"><div class="lab">${lab}</div><div class="god">미상</div><div class="ch">?<br>?</div><div class="ko">시간 모름</div></div>`;
      return `<div class="pil ${k === 'day' ? 'day' : ''}" title="${esc(pl.ko)}">
        <div class="lab">${lab}</div>
        <div class="god">${esc(pl.tenGodStem)}</div>
        <div class="ch"><span class="${elClass(pl.stemElKey)}">${pl.stemHj}</span><br><span class="${elClass(pl.branchElKey)}">${pl.branchHj}</span></div>
        <div class="ko">${esc(pl.ko)}</div>
        <div class="god">${esc(pl.tenGodBranch)}</div>
      </div>`;
    }).join('');

    const max = Math.max(...s.elements.map((e) => e.count), 1);
    $('#elements').innerHTML = s.elements.map((e) => `<div class="elrow"><span class="${elClass(e.key)}">${e.hj} ${e.ko}</span><div class="bar ${elClass(e.key)}"><i style="width:0" data-w="${(e.count / max) * 100}"></i></div><span class="n">${e.count}</span></div>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#elements i').forEach((i) => { i.style.width = i.dataset.w + '%'; })));

    const notes = [];
    notes.push(`<b>일간</b> ${s.dayMaster.hj}(${s.dayMaster.element}${s.dayMaster.yin ? '·음' : '·양'})`);
    notes.push(`<b>부족 오행</b> ${s.lacking.length ? s.lacking.join('·') : '없음'}`);
    notes.push(`<b>${esc(s.strength.label)}</b> (비겁·인성 ${s.strength.ratio}%)`);
    if (s.relations.length) notes.push(`<b>지지 관계</b> ${esc(s.relations.join(', '))}`);
    $('#notes').innerHTML = notes.join(' · ') + (s.meta.warnings.length ? `<br><br>⚠ ${s.meta.warnings.map(esc).join('<br>⚠ ')}` : '');

    // 리포트 골격
    $('#report').innerHTML = SECTIONS.map((sec, i) => `
      <details class="sec ${sec.cls || ''} wait" data-i="${i}" ${i < 2 ? 'open' : ''}>
        <summary><span class="num">${i + 1}</span>${esc(sec.key)}</summary>
        <div class="body">${sec.timeline ? '<div class="tlwrap"></div>' : ''}<div class="txt${sec.bubble ? ' advice-bubble' : ''}">풀이를 기다리는 중...</div></div>
      </details>`).join('');
    buildTimeline(s);
  }

  function buildTimeline(s) {
    const d = s.daeun;
    const html = `<p class="tl-title">대운 흐름 — ${d.forward ? '순행' : '역행'}, 약 ${d.startAge}세에 시작</p>
      <div class="tl">${d.list.map((x) => `<div class="it ${x.current ? 'cur' : ''}"><div class="age">${x.startAge}세</div><div class="gz"><span class="${elClass(keyOf(x.stemEl))}">${x.hj[0]}</span><span class="${elClass(keyOf(x.branchEl))}">${x.hj[1]}</span></div><div class="tg">${esc(x.tenGodStem)}·${esc(x.tenGodBranch)}</div><div class="age">${String(x.startYear).slice(2)}~${String(x.endYear).slice(2)}년</div></div>`).join('')}</div>
      <p class="tl-title">앞으로의 세운</p>
      <ul class="seun">${s.seun.map((x) => {
        const bad = x.relations.some((r) => r.includes('충'));
        return `<li class="${x.current ? 'cur' : ''}"><span class="y">${x.year}</span><span class="gz">${x.hj}</span><span class="tg">${esc(x.tenGodStem)}·${esc(x.tenGodBranch)}</span>${x.relations.map((r) => `<span class="chip ${r.includes('충') ? '' : 'ok'}">${esc(r)}</span>`).join('')}${bad ? '' : ''}</li>`;
      }).join('')}</ul>`;
    $('.tlwrap').innerHTML = html;
  }
  const keyOf = (ko) => ({ 목: 'wood', 화: 'fire', 토: 'earth', 금: 'metal', 수: 'water' }[ko]);

  // 최소 마크다운 렌더러
  function md(src) {
    const lines = src.replace(/\r/g, '').split('\n');
    const out = []; let list = null, para = [];
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const flushP = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
    const flushL = () => { if (list) { out.push(`<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.t}>`); list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flushP(); flushL(); continue; }
      if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
      flushL(); para.push(line.replace(/^#+\s*/, ''));
    }
    flushP(); flushL();
    return out.join('');
  }

  function splitSections(text) {
    const res = {}; let cur = null;
    for (const line of text.split('\n')) {
      const m = /^\s*#{1,3}\s*\[(.+?)\]\s*$/.exec(line);
      if (m) { cur = m[1].trim(); res[cur] = ''; continue; }
      if (cur) res[cur] += line + '\n';
    }
    return res;
  }

  function renderReport(final) {
    if (!state || !state.shown) return;
    const parts = splitSections(state.text);
    const keys = SECTIONS.map((s) => s.key);
    let lastIdx = -1;
    keys.forEach((k, i) => { if (parts[k] !== undefined) lastIdx = i; });
    SECTIONS.forEach((sec, i) => {
      const box = $(`.sec[data-i="${i}"]`);
      const txt = $('.txt', box);
      const body = parts[sec.key];
      if (body === undefined || !body.trim()) return;
      box.classList.remove('wait');
      if (i >= 2 && !box.dataset.opened) { box.open = true; box.dataset.opened = '1'; }
      const html = sec.cls === 'hl' ? `<p class="oneline">${esc(body.trim())}</p>` : md(body);
      txt.innerHTML = html;
      txt.classList.toggle('caret', !final && i === lastIdx);
    });
    if (final) $$('.caret').forEach((n) => n.classList.remove('caret'));
  }

  // ───────── 액션 ─────────
  $('#againBtn').addEventListener('click', () => { show('wizard'); setStep(2); });

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200);
  }
  $('#shareBtn').addEventListener('click', async () => {
    if (!state || !state.saju) return;
    const s = state.saju, P = s.pillars;
    const head = `[달빛 사주] ${state.payload.name || '내담자'}님 · ${SERVICE[state.payload.service_type]} · ${PERSONA[state.payload.persona_type]}\n`
      + `사주: ${['year', 'month', 'day', 'hour'].map((k) => (P[k] ? P[k].hj : '??')).join(' ')} (년·월·일·시)\n`
      + `오행: ${s.elements.map((e) => `${e.ko}${e.count}`).join(' ')}\n\n`;
    const body = state.text.replace(/^#{1,3}\s*/gm, '').trim();
    const text = head + body;
    try {
      if (navigator.share) { await navigator.share({ title: '달빛 사주 결과', text }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('결과를 복사했어요'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('결과를 복사했어요'); } catch { toast('복사에 실패했어요. 직접 선택해 복사해 주세요.'); }
      ta.remove();
    }
  });
})();
