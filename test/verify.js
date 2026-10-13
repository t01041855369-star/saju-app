'use strict';
const assert = require('assert');
const S = require('../lib/saju');

const kst = (ms) => { const d = new Date(ms + 9 * 3600000); const p = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
const toMs = (s) => Date.parse(s.replace(' ', 'T') + ':00+09:00');

let fail = 0;
const ok = (cond, msg) => { if (cond) console.log('  OK  ', msg); else { console.log('  FAIL', msg); fail++; } };

console.log('[1] 절기 시각 오차 (공표 KST 값 대비)');
const known = [
  [2023, 315, '2023-02-04 11:42'], [2024, 315, '2024-02-04 17:27'], [2025, 315, '2025-02-03 23:10'],
  [2024, 0, '2024-03-20 12:06'], [2024, 90, '2024-06-21 05:51'], [2024, 180, '2024-09-22 21:44'], [2024, 270, '2024-12-21 18:21'],
];
let maxErr = 0;
for (const [y, lon, exp] of known) {
  const got = S.termTime(y, lon);
  const err = (got - toMs(exp)) / 60000;
  console.log(`   ${y} λ=${lon}: 계산 ${kst(got)} / 기준 ${exp} / 오차 ${err.toFixed(1)}분`);
  maxErr = Math.max(maxErr, Math.abs(err));
}
console.log(`   최대 오차 ${maxErr.toFixed(1)}분 (허용 12분)`);
ok(maxErr <= 12, '절입시각 오차 12분 이내');

console.log('[2] 일주 기준일');
const day = (y, m, d) => S.computeSaju({ year: y, month: m, day: d, hour: 12, minute: 0, gender: 'M' }).pillars.day.hj;
ok(day(1900, 1, 1) === '甲戌', '1900-01-01 = 甲戌일');
ok(day(2000, 1, 1) === '戊午', '2000-01-01 = 戊午일');
ok(day(2000, 1, 2) === '己未', '2000-01-02 = 己未일');

console.log('[3] 연주/월주 입춘 경계');
const yp = (y, m, d, h, mi) => S.computeSaju({ year: y, month: m, day: d, hour: h, minute: mi, gender: 'M' }).pillars;
ok(yp(2024, 2, 4, 10, 0).year.hj === '癸卯', '2024-02-04 10:00 (입춘 전) 연주 癸卯');
ok(yp(2024, 2, 4, 18, 0).year.hj === '甲辰', '2024-02-04 18:00 (입춘 후) 연주 甲辰');
ok(yp(2024, 2, 4, 18, 0).month.hj === '丙寅', '2024-02-04 18:00 월주 丙寅 (갑년 인월=병인)');
ok(yp(2024, 2, 4, 10, 0).month.hj === '乙丑', '2024-02-04 10:00 월주 乙丑');
ok(yp(1984, 6, 1, 12, 0).year.hj === '甲子', '1984년 연주 甲子');

console.log('[4] 시주 / 자시');
const base = { year: 2000, month: 1, day: 1, gender: 'M' };
// 戊午일: 시두법 戊일 → 子시 壬子
ok(S.computeSaju({ ...base, hour: 0, minute: 40, kstCorrection: false }).pillars.hour.hj === '壬子', '戊일 00:40 = 壬子시');
ok(S.computeSaju({ ...base, hour: 12, minute: 0, kstCorrection: false }).pillars.hour.hj === '戊午', '戊일 12:00 = 戊午시');
const lz1 = S.computeSaju({ ...base, hour: 23, minute: 40, kstCorrection: false, ziMode: 'next' });
const lz2 = S.computeSaju({ ...base, hour: 23, minute: 40, kstCorrection: false, ziMode: 'same' });
ok(lz1.pillars.day.hj === '己未', '23:40 자시처리=다음날 → 己未일');
ok(lz2.pillars.day.hj === '戊午', '23:40 야자시 → 戊午일 유지');
const c1 = S.computeSaju({ ...base, hour: 23, minute: 10, ziMode: 'next', kstCorrection: true });
ok(c1.pillars.day.hj === '戊午' && c1.pillars.hour.branchHj === '亥', '23:10 + 동경시보정(-30분) → 22:40 亥시, 일주 유지');

console.log('[5] 음력/윤달 변환');
const L = S.lunarToSolar(2023, 2, 1, true);
ok(L.year === 2023 && L.month === 3 && L.day === 22, '2023 윤2월 1일 = 양력 2023-03-22');
const L2 = S.lunarToSolar(2000, 1, 1, false);
ok(L2.year === 2000 && L2.month === 2 && L2.day === 5, '2000 음력 1월 1일 = 양력 2000-02-05');
let threw = false; try { S.lunarToSolar(2024, 2, 1, true); } catch { threw = true; }
ok(threw, '윤달 아닌 달을 윤달로 입력하면 오류');

console.log('[6] 대운 방향/시작나이');
const m = S.computeSaju({ year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M', now: new Date('2026-10-13T09:00:00Z') });
console.log('   1990-05-15 14:30 남:', ['year', 'month', 'day', 'hour'].map((k) => m.pillars[k].hj).join(' '), '| 대운', m.daeun.forward ? '순행' : '역행', '시작', m.daeun.startAge + '세', '|', m.daeun.list.slice(0, 3).map((d) => d.ko + '(' + d.startAge + ')').join(' '));
ok(m.pillars.year.hj === '庚午' && m.daeun.forward === true, '1990년 庚午(양) 남자 → 순행');
const f = S.computeSaju({ year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'F', now: new Date('2026-10-13T09:00:00Z') });
ok(f.daeun.forward === false, '1990년 庚午(양) 여자 → 역행');

console.log(fail ? `\n실패 ${fail}건` : '\n전체 통과');
process.exit(fail ? 1 : 0);
