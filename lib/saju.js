'use strict';
/**
 * 사주팔자(四柱八字) 계산 엔진 — 외부 의존성 없음
 *
 * 기술문서 기준 구현:
 *  - 연주: 입춘(태양황경 315°) 기준, (Y-4) mod 10 / mod 12
 *  - 월주: 12절 절입시각(태양황경) 기준, 연두법
 *  - 일주: 율리우스일수(JDN) 기준 60갑자 순환
 *  - 시주: 2시간 단위 12지지, 시두법
 *  - 절입시각: 태양 겉보기 황경(Meeus) 천문 계산 → 별도 절기표 DB 불필요
 *  - 음력/윤달: Intl 중국력(ICU)으로 양력 변환
 *  - 옵션: 동경시 보정(-30분), 자시 처리(조자시/야자시)
 */

const STEMS_KO = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const STEMS_HJ = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES_KO = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const BRANCHES_HJ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ANIMALS = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];
const EL_KO = ['목', '화', '토', '금', '수'];
const EL_HJ = ['木', '火', '土', '金', '水'];
const EL_KEYS = ['wood', 'fire', 'earth', 'metal', 'water'];

// 지지 → 오행 (기술문서 3장)
const BRANCH_EL = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
// 지장간 (여기→중기→본기), 마지막 원소가 본기
const HIDDEN = [
  [8, 9], [9, 7, 5], [4, 2, 0], [0, 1], [1, 9, 4], [4, 6, 2],
  [2, 5, 3], [3, 1, 5], [4, 8, 6], [6, 7], [7, 3, 4], [4, 0, 8],
];

const SOLAR_TERMS = {
  315: '입춘', 345: '경칩', 15: '청명', 45: '입하', 75: '망종', 105: '소서',
  135: '입추', 165: '백로', 195: '한로', 225: '입동', 255: '대설', 285: '소한',
};

const mod = (a, n) => ((a % n) + n) % n;
const rad = (d) => (d * Math.PI) / 180;
const MS_DAY = 86400000;
const KST_MS = 9 * 3600000;

// ───────────────────────────── 천문 계산 (절입시각) ─────────────────────────────

function deltaT(year) {
  const y = year;
  let t;
  if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y < 1941) { t = y - 1920; return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3; }
  if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547; }
  if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718; }
  if (y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t ** 2; }
  return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
}

/** 태양 겉보기 황경(도). ms = UT 기준 epoch ms */
function sunLongitude(ms) {
  const year = new Date(ms).getUTCFullYear() + 0.5;
  const jde = ms / MS_DAY + 2440587.5 + deltaT(year) / 86400;
  const T = (jde - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mr = rad(M);
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
    + 0.000289 * Math.sin(3 * Mr);
  const omega = 125.04 - 1934.136 * T;
  // Meeus Ch.25 저정밀식 (황경 오차 ≈0.01° → 절입시각 오차 약 ±10분)
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  return mod(lambda, 360);
}

/** 해당 양력 연도 안에서 태양황경이 lon이 되는 시각(UT epoch ms) */
function termTime(year, lon) {
  const span = lon >= 285 ? lon - 360 : lon;
  let t = Date.UTC(year, 2, 20, 12) + (span / 360) * 365.2422 * MS_DAY;
  for (let i = 0; i < 8; i++) {
    let d = lon - sunLongitude(t);
    d = ((d + 540) % 360) - 180;
    t += (d / 0.9856474) * MS_DAY;
    if (Math.abs(d) < 1e-7) break;
  }
  return t;
}

/** 12절(월 시작 절기) 시각 목록: year-1 ~ year+1 */
function monthTerms(year) {
  const list = [];
  for (let y = year - 1; y <= year + 1; y++) {
    for (let k = 0; k < 12; k++) {
      const lon = mod(315 + 30 * k, 360);
      list.push({ lon, name: SOLAR_TERMS[lon], ms: termTime(y, lon) });
    }
  }
  return list.sort((a, b) => a.ms - b.ms);
}

// ───────────────────────────── 음력 ↔ 양력 ─────────────────────────────

const lunarFmt = new Intl.DateTimeFormat('en-u-ca-chinese', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
const lunarCache = new Map();

function solarToLunar(y, m, d) {
  const parts = lunarFmt.formatToParts(new Date(Date.UTC(y, m - 1, d)));
  const get = (t) => parts.find((p) => p.type === t).value;
  const mv = get('month');
  return { year: Number(get('relatedYear')), month: parseInt(mv, 10), leap: /bis/.test(mv), day: Number(get('day')) };
}

function lunarToSolar(ly, lm, ld, leap) {
  const key = ly;
  if (!lunarCache.has(key)) {
    const map = new Map();
    const start = Date.UTC(ly, 0, 15);
    for (let i = 0; i < 430; i++) {
      const dt = new Date(start + i * MS_DAY);
      const l = solarToLunar(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      if (l.year === ly) map.set(`${l.month}-${l.leap ? 1 : 0}-${l.day}`, dt);
    }
    lunarCache.set(key, map);
  }
  const hit = lunarCache.get(key).get(`${lm}-${leap ? 1 : 0}-${ld}`);
  if (!hit) {
    throw new Error(leap
      ? `${ly}년 음력 ${lm}월 ${ld}일(윤달)은 존재하지 않습니다. 윤달이 아닌 달이거나 날짜가 맞지 않습니다.`
      : `${ly}년 음력 ${lm}월 ${ld}일이 존재하지 않습니다. (해당 월은 29일까지일 수 있습니다)`);
  }
  return { year: hit.getUTCFullYear(), month: hit.getUTCMonth() + 1, day: hit.getUTCDate() };
}

// ───────────────────────────── 십성 / 오행 ─────────────────────────────

const stemEl = (s) => Math.floor(s / 2);
const stemYang = (s) => s % 2 === 0;
const mainStem = (b) => HIDDEN[b][HIDDEN[b].length - 1];

/** 일간(dm) 기준 다른 천간(s)의 십성 */
function tenGod(dm, s) {
  const de = stemEl(dm), se = stemEl(s);
  const same = stemYang(dm) === stemYang(s);
  const rel = mod(se - de, 5); // 0 동일, 1 내가 생함, 2 내가 극함, 3 나를 극함, 4 나를 생함
  switch (rel) {
    case 0: return same ? '비견' : '겁재';
    case 1: return same ? '식신' : '상관';
    case 2: return same ? '편재' : '정재';
    case 3: return same ? '편관' : '정관';
    default: return same ? '편인' : '정인';
  }
}
const SUPPORT = new Set(['비견', '겁재', '편인', '정인']);

function pillar(stem, branch) {
  return {
    stem, branch,
    ko: STEMS_KO[stem] + BRANCHES_KO[branch],
    hj: STEMS_HJ[stem] + BRANCHES_HJ[branch],
    stemKo: STEMS_KO[stem], stemHj: STEMS_HJ[stem], stemEl: EL_KO[stemEl(stem)], stemElKey: EL_KEYS[stemEl(stem)],
    branchKo: BRANCHES_KO[branch], branchHj: BRANCHES_HJ[branch], branchEl: EL_KO[BRANCH_EL[branch]], branchElKey: EL_KEYS[BRANCH_EL[branch]],
    animal: ANIMALS[branch],
  };
}
const pillarFromIdx = (i) => pillar(mod(i, 10), mod(i, 12));
const idx60 = (stem, branch) => { for (let i = 0; i < 60; i++) if (i % 10 === stem && i % 12 === branch) return i; return -1; };

// 지지 충·합
const CHUNG = [[0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]];
const YUKHAP = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]];
const SAMHAP = [[[8, 0, 4], '수'], [[11, 3, 7], '목'], [[2, 6, 10], '화'], [[5, 9, 1], '금']];
const hasPair = (list, a, b) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

function branchRelations(branches) {
  // branches: [{pos, b}]
  const out = [];
  for (let i = 0; i < branches.length; i++) {
    for (let j = i + 1; j < branches.length; j++) {
      const a = branches[i], c = branches[j];
      if (hasPair(CHUNG, a.b, c.b)) out.push(`${a.pos}지(${BRANCHES_KO[a.b]})–${c.pos}지(${BRANCHES_KO[c.b]}) 충`);
      if (hasPair(YUKHAP, a.b, c.b)) out.push(`${a.pos}지(${BRANCHES_KO[a.b]})–${c.pos}지(${BRANCHES_KO[c.b]}) 육합`);
    }
  }
  for (const [grp, el] of SAMHAP) {
    const present = grp.filter((g) => branches.some((x) => x.b === g));
    if (present.length === 3) out.push(`${grp.map((g) => BRANCHES_KO[g]).join('')} 삼합(${el}국)`);
  }
  return out;
}

// ───────────────────────────── 메인 계산 ─────────────────────────────

/**
 * @param {object} i
 *  year, month, day: 생년월일 / calendar: 'solar'|'lunar' / leap: boolean(음력 윤달)
 *  hour, minute: 출생시 (hour가 null이면 시간 모름)
 *  gender: 'M'|'F'
 *  ziMode: 'next'(23:00 이후 다음 날 일주, 기본) | 'same'(야자시: 일주 유지)
 *  kstCorrection: true면 -30분 보정 (시주·일주 판정에 적용)
 *  now: 현재 시각(Date) — 세운/대운 현재 표시용
 */
function computeSaju(i) {
  const calendar = i.calendar === 'lunar' ? 'lunar' : 'solar';
  const ziMode = i.ziMode === 'same' ? 'same' : 'next';
  const kstCorrection = i.kstCorrection !== false;
  const now = i.now instanceof Date ? i.now : new Date();
  const hourKnown = i.hour !== null && i.hour !== undefined && i.hour !== '';

  let { year, month, day } = i;
  year = Number(year); month = Number(month); day = Number(day);
  if (![year, month, day].every(Number.isInteger)) throw new Error('생년월일을 정확히 입력해 주세요.');
  if (year < 1900 || year > 2100) throw new Error('지원 범위는 1900~2100년입니다.');

  let solar = { year, month, day };
  let lunarInfo;
  if (calendar === 'lunar') {
    if (month < 1 || month > 12 || day < 1 || day > 30) throw new Error('음력 월/일 값이 올바르지 않습니다.');
    solar = lunarToSolar(year, month, day, !!i.leap);
    lunarInfo = { year, month, day, leap: !!i.leap };
  } else {
    const chk = new Date(Date.UTC(year, month - 1, day));
    if (chk.getUTCFullYear() !== year || chk.getUTCMonth() !== month - 1 || chk.getUTCDate() !== day) throw new Error('존재하지 않는 양력 날짜입니다.');
    lunarInfo = solarToLunar(year, month, day);
  }

  const hh = hourKnown ? Number(i.hour) : 12;
  const mm = hourKnown ? Number(i.minute || 0) : 0;
  if (hourKnown && (!(hh >= 0 && hh <= 23) || !(mm >= 0 && mm <= 59))) throw new Error('출생 시각이 올바르지 않습니다.');

  const clockWall = Date.UTC(solar.year, solar.month - 1, solar.day, hh, mm); // 달력 시계 그대로
  const clockUT = clockWall - KST_MS; // 절입 비교용 UT

  // 연주 (입춘 기준)
  const lichun = termTime(solar.year, 315);
  const sajuYear = clockUT < lichun ? solar.year - 1 : solar.year;
  const yStem = mod(sajuYear - 4, 10), yBranch = mod(sajuYear - 4, 12);

  // 월주 (절입 기준: 황경으로 월 판정)
  const lon = sunLongitude(clockUT);
  const mIdx = Math.floor(mod(lon - 315, 360) / 30); // 0=寅월
  const mBranch = mod(2 + mIdx, 12);
  const mStem = mod((yStem % 5) * 2 + 2 + mIdx, 10);

  // 월 경계가 당일 내에 있는데 시간을 모르는 경우 경고
  const warnings = [];
  const dayStartUT = Date.UTC(solar.year, solar.month - 1, solar.day) - KST_MS;
  const terms = monthTerms(solar.year);
  const nearTerm = terms.find((t) => t.ms >= dayStartUT && t.ms < dayStartUT + MS_DAY);
  if (nearTerm) {
    const k = new Date(nearTerm.ms + KST_MS);
    const hhmm = `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
    if (!hourKnown) warnings.push(`출생일에 절기(${nearTerm.name}, 약 ${hhmm})가 있어 월주/연주가 출생 시각에 따라 달라질 수 있습니다. 시간을 알면 입력해 주세요.`);
    else if (Math.abs(nearTerm.ms - clockUT) < 30 * 60000) warnings.push(`출생 시각이 절입(${nearTerm.name}, 약 ${hhmm})과 30분 이내입니다. 천문 계산 오차 범위라 절기표로 한 번 더 확인하시길 권합니다.`);
  }

  // 일주 / 시주 (동경시 보정 적용)
  const adj = clockWall - (hourKnown && kstCorrection ? 30 * 60000 : 0);
  const ad = new Date(adj);
  const adjMin = ad.getUTCHours() * 60 + ad.getUTCMinutes();
  let jdn = Math.floor(Date.UTC(ad.getUTCFullYear(), ad.getUTCMonth(), ad.getUTCDate()) / MS_DAY) + 2440588;
  const lateZi = hourKnown && adjMin >= 23 * 60;
  if (lateZi && ziMode === 'next') jdn += 1;
  const dIdx = mod(jdn + 49, 60); // 1900-01-01(甲戌)=10 검증
  const dStem = dIdx % 10, dBranch = dIdx % 12;

  let hPillar = null;
  if (hourKnown) {
    const hBranch = Math.floor(mod(adjMin + 60, 1440) / 120);
    const hStem = mod((dStem % 5) * 2 + hBranch, 10);
    hPillar = pillar(hStem, hBranch);
  }

  const P = { year: pillar(yStem, yBranch), month: pillar(mStem, mBranch), day: pillar(dStem, dBranch), hour: hPillar };
  const dm = dStem;

  // 십성 + 지장간
  const decorate = (p, key) => {
    if (!p) return p;
    p.tenGodStem = key === 'day' ? '일간(나)' : tenGod(dm, p.stem);
    p.tenGodBranch = tenGod(dm, mainStem(p.branch));
    p.hidden = HIDDEN[p.branch].map((s) => ({ ko: STEMS_KO[s], hj: STEMS_HJ[s], el: EL_KO[stemEl(s)], tenGod: tenGod(dm, s) }));
    return p;
  };
  Object.keys(P).forEach((k) => decorate(P[k], k));

  // 오행 분포 (천간 + 지지)
  const counts = [0, 0, 0, 0, 0];
  Object.values(P).filter(Boolean).forEach((p) => { counts[stemEl(p.stem)]++; counts[BRANCH_EL[p.branch]]++; });
  const total = counts.reduce((a, b) => a + b, 0);
  const elements = EL_KO.map((ko, k) => ({ key: EL_KEYS[k], ko, hj: EL_HJ[k], count: counts[k], percent: Math.round((counts[k] / total) * 1000) / 10 }));
  const lacking = elements.filter((e) => e.count === 0).map((e) => e.ko);
  const dominant = [...elements].sort((a, b) => b.count - a.count)[0];

  // 십성 분포 및 신강/신약 참고 지표 (월지 가중 2배)
  const gods = {};
  let sup = 0, wsum = 0;
  const addGod = (g, w) => { gods[g] = (gods[g] || 0) + w; wsum += w; if (SUPPORT.has(g)) sup += w; };
  ['year', 'month', 'hour'].forEach((k) => { if (P[k]) addGod(P[k].tenGodStem, 1); });
  ['year', 'month', 'day', 'hour'].forEach((k) => { if (P[k]) addGod(P[k].tenGodBranch, k === 'month' ? 2 : 1); });
  const strengthRatio = Math.round((sup / wsum) * 100);
  const strength = { ratio: strengthRatio, label: strengthRatio >= 50 ? '신강 경향' : '신약 경향', note: '비겁·인성 비중(월지 가중) 기반의 단순 참고 지표이며 정식 용신 판정이 아닙니다.' };

  // 원국 충합
  const brList = [{ pos: '년', b: yBranch }, { pos: '월', b: mBranch }, { pos: '일', b: dBranch }];
  if (hPillar) brList.push({ pos: '시', b: hPillar.branch });
  const relations = branchRelations(brList);

  // 대운
  const gender = i.gender === 'F' ? 'F' : 'M';
  const forward = (stemYang(yStem) && gender === 'M') || (!stemYang(yStem) && gender === 'F');
  const nowUT = now.getTime();
  let startAge = null, daeun = [];
  {
    let ref;
    if (forward) ref = terms.find((t) => t.ms > clockUT);
    else ref = [...terms].reverse().find((t) => t.ms <= clockUT);
    const days = Math.abs(ref.ms - clockUT) / MS_DAY;
    startAge = Math.round((days / 3) * 10) / 10; // 3일 = 1년
    const base = idx60(mStem, mBranch);
    const birthYear = solar.year;
    for (let n = 1; n <= 9; n++) {
      const p = pillarFromIdx(base + (forward ? n : -n));
      const from = Math.round(startAge) + 10 * (n - 1);
      const sY = birthYear + from, eY = sY + 9;
      daeun.push({
        order: n, ko: p.ko, hj: p.hj, stemEl: p.stemEl, branchEl: p.branchEl,
        tenGodStem: tenGod(dm, p.stem), tenGodBranch: tenGod(dm, mainStem(p.branch)),
        startAge: from, startYear: sY, endYear: eY,
      });
    }
  }
  const nowKST = new Date(nowUT + KST_MS);
  const curYear = nowKST.getUTCFullYear();
  daeun.forEach((d) => { d.current = curYear >= d.startYear && curYear <= d.endYear; });

  // 세운 (올해부터 5년)
  const seun = [];
  const natal = brList;
  for (let y = curYear; y < curYear + 5; y++) {
    const p = pillar(mod(y - 4, 10), mod(y - 4, 12));
    const rel = [];
    natal.forEach((n) => {
      if (hasPair(CHUNG, p.branch, n.b)) rel.push(`${n.pos}지 충`);
      if (hasPair(YUKHAP, p.branch, n.b)) rel.push(`${n.pos}지 육합`);
    });
    seun.push({ year: y, ko: p.ko, hj: p.hj, animal: p.animal, stemEl: p.stemEl, branchEl: p.branchEl, tenGodStem: tenGod(dm, p.stem), tenGodBranch: tenGod(dm, mainStem(p.branch)), relations: rel, current: y === curYear });
  }

  const fmtTerm = (ms) => { const k = new Date(ms + KST_MS); return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`; };

  return {
    input: { name: i.name || '', gender, calendar, leap: !!i.leap, solar, lunar: lunarInfo, hourKnown, hour: hourKnown ? hh : null, minute: hourKnown ? mm : null, ziMode, kstCorrection },
    pillars: P,
    dayMaster: { ko: STEMS_KO[dm], hj: STEMS_HJ[dm], element: EL_KO[stemEl(dm)], elementKey: EL_KEYS[stemEl(dm)], yin: !stemYang(dm) },
    elements, lacking, dominant: dominant.ko,
    tenGods: gods, strength, relations,
    daeun: { forward, startAge, list: daeun },
    seun,
    meta: { sajuYear, lichun: fmtTerm(lichun + 0), lateZi, warnings, nowYear: curYear },
  };
}

module.exports = { computeSaju, sunLongitude, termTime, monthTerms, solarToLunar, lunarToSolar, tenGod, STEMS_KO, BRANCHES_KO, EL_KO };
