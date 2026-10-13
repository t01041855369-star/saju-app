'use strict';
// OPENAI_API_KEY가 없을 때 사용하는 데모 리포트 생성기.
// 엔진이 계산한 오행·십성·대운 데이터로 규칙 기반 풀이를 만들며, LLM 풀이보다 단순합니다.

const STEM_TRAIT = {
  갑: '곧게 뻗는 큰 나무처럼 추진력과 자존심이 강하고 리더 기질이 있는',
  을: '바람에 휘어도 꺾이지 않는 풀과 덩굴처럼 유연하고 적응력이 좋은',
  병: '모두를 비추는 태양처럼 밝고 열정적이며 표현이 시원한',
  정: '어둠을 밝히는 촛불처럼 섬세하고 따뜻하며 집중력이 좋은',
  무: '큰 산처럼 묵직하고 신뢰감 있으며 중심을 잡는',
  기: '곡식을 길러내는 논밭처럼 포용력이 있고 실속을 챙기는',
  경: '단단한 바위와 무쇠처럼 결단력과 의리가 강한',
  신: '잘 연마된 보석처럼 예민하고 완성도에 집착하는',
  임: '넓은 바다와 큰 강처럼 스케일이 크고 지혜로우며 흐름을 읽는',
  계: '이슬과 빗물처럼 감수성이 깊고 직관이 뛰어난',
};
const EL_TRAIT = {
  목: '성장·계획·시작의 기운', 화: '표현·열정·확산의 기운', 토: '안정·신뢰·중재의 기운', 금: '결단·원칙·정리의 기운', 수: '지혜·유연·저장의 기운',
};
const EL_LACK = {
  목: '새로운 시작과 추진, 계획을 밀고 나가는 힘', 화: '자기표현과 열정을 드러내는 힘', 토: '중심을 잡고 꾸준히 쌓아가는 힘', 금: '맺고 끊는 결단과 마무리하는 힘', 수: '쉬어가며 지혜를 충전하는 힘',
};
const GOD_MEAN = {
  비견: '나와 같은 힘을 가진 동료·경쟁자', 겁재: '재물과 사람을 두고 다투게 되는 경쟁의 기운',
  식신: '여유롭게 표현하고 즐기는 재능', 상관: '틀을 깨는 표현력과 비판적 감각',
  편재: '크게 벌고 크게 쓰는 유동적 재물', 정재: '꾸준하고 안정적인 재물',
  편관: '압박과 도전을 동반한 책임·권력', 정관: '규범 안에서 인정받는 명예와 직장',
  편인: '독특한 학문·직관·비정형 사고', 정인: '배움·보호·안정을 주는 후원',
};

const G = (saju) => {
  const t = saju.tenGods;
  const s = (...k) => k.reduce((a, x) => a + (t[x] || 0), 0);
  return { bi: s('비견', '겁재'), sik: s('식신', '상관'), jae: s('편재', '정재'), gwan: s('편관', '정관'), in: s('편인', '정인') };
};

function build(saju, service, persona) {
  const T = persona === 'T_COLD';
  const pick = (t, f) => (T ? t : f);
  const name = saju.input.name || '내담자';
  const dm = saju.dayMaster;
  const P = saju.pillars;
  const g = G(saju);
  const male = saju.input.gender === 'M';
  const els = saju.elements;
  const top = [...els].sort((a, b) => b.count - a.count);
  const lack = saju.lacking;
  const warn = [];
  if (!saju.input.hourKnown) warn.push(pick('시주가 없어 해석에 한계가 있습니다.', '태어난 시간을 몰라 시주 이야기는 담지 못했어요.'));

  // 1. 요약
  const summary = pick(
    `${P.year.hj}·${P.month.hj}·${P.day.hj}${P.hour ? '·' + P.hour.hj : ''} 구조, 일간 ${dm.hj}(${dm.element}) — 오행은 ${top[0].ko}(${top[0].count})이 가장 강하고 ${lack.length ? lack.join('·') + ' 기운은 비어 있습니다' : '모든 오행이 갖춰져 있습니다'}.`,
    `${name}님은 ${dm.hj}(${dm.element}) 일간으로, ${top[0].ko}의 기운이 가장 두드러지고 ${lack.length ? lack.join('·') + '의 기운이 살짝 비어 있는' : '오행이 고루 갖춰진'} 사주예요.`,
  );

  // 2. 메인 분석
  const base = pick(
    `${name}님의 일간은 ${dm.hj}(${dm.ko})으로, ${STEM_TRAIT[dm.ko]} 유형입니다. 오행 분포는 ${els.map((e) => `${e.ko} ${e.count}`).join(' · ')}이며 ${saju.strength.label}(비겁·인성 ${saju.strength.ratio}%)으로 판단됩니다.`,
    `${name}님은 ${STEM_TRAIT[dm.ko]} 분이에요. 오행은 ${els.map((e) => `${e.ko} ${e.count}`).join(' · ')}로 나타나고, 전체적으로 ${saju.strength.label}을 보여요.`,
  );
  const balance = lack.length
    ? pick(`${lack.join('·')} 기운이 원국에 없습니다. 즉 ${lack.map((l) => EL_LACK[l]).join(', ')} 쪽이 약점이 될 수 있으니 의식적으로 보완하십시오.`,
      `${lack.join('·')} 기운이 비어 있어요. ${lack.map((l) => EL_LACK[l]).join(', ')} 쪽이 조금 아쉬울 수 있지만, 천천히 채워가면 충분히 괜찮아요.`)
    : pick('오행이 모두 존재하므로 구조적 결핍은 없으며, 과다한 오행의 치우침만 관리하면 됩니다.', '오행이 모두 갖춰져 있어서 기본 바탕이 균형 잡혀 있어요.');
  const strong = `${top[0].ko}(${EL_TRAIT[top[0].ko]})이 가장 강해 ${pick('성향이 한쪽으로 쏠리기 쉬우므로 과열 시점을 경계하십시오.', '그 기운이 넘칠 때는 한 템포 쉬어가 보면 좋아요.')}`;
  const rel = saju.relations.length ? pick(`원국 지지 관계: ${saju.relations.join(', ')}. 해당 궁위에서 변동성이 생기기 쉽습니다.`, `원국 지지에 ${saju.relations.join(', ')} 관계가 보여요. 그 부분에서는 변화가 잦을 수 있어요.`) : '';

  let theme = '';
  if (service === 'BASIC') {
    theme = pick(
      `일지 ${P.day.branchHj}의 본기 십성은 ${P.day.tenGodBranch}(${GOD_MEAN[P.day.tenGodBranch]})입니다. 월지 ${P.month.branchHj}는 ${P.month.tenGodBranch}로, 사회적으로 드러나는 성향의 바탕입니다.`,
      `일지 ${P.day.branchHj}는 ${P.day.tenGodBranch}(${GOD_MEAN[P.day.tenGodBranch]})의 기운이라, 가까운 관계에서의 마음결을 보여줘요. 월지 ${P.month.branchHj}는 ${P.month.tenGodBranch}로, 사회에서 드러나는 모습의 바탕이에요.`);
  } else if (service === 'LOVE') {
    const target = male ? g.jae : g.gwan;
    const tName = male ? '재성' : '관성';
    theme = pick(
      `배우자궁(일지 ${P.day.branchHj})의 본기 십성은 ${P.day.tenGodBranch}입니다. 이성운을 보는 ${tName}은 원국에서 ${target === 0 ? '드러나지 않아 인연이 늦게 오거나 수동적으로 흐르기 쉽습니다' : target >= 3 ? '강하게 드러나 인연은 많으나 선택 기준이 흔들릴 수 있습니다' : '적당히 있어 인연의 기회는 정상적으로 열려 있습니다'}.`,
      `배우자궁(일지 ${P.day.branchHj})은 ${P.day.tenGodBranch}의 기운이에요. 이성운을 보는 ${tName}은 ${target === 0 ? '원국에 보이지 않아서 인연이 천천히 오는 편이에요. 조급해하지 않아도 괜찮아요' : target >= 3 ? '꽤 강하게 있어서 설레는 만남은 많지만 마음이 흔들릴 때가 있을 수 있어요' : '알맞게 있어서 좋은 인연이 열릴 자리가 충분해요'}.`);
  } else if (service === 'SUCCESS') {
    theme = pick(
      `직업운을 보는 관성은 ${g.gwan}, 실행·표현력을 보는 식상은 ${g.sik}입니다. ${g.gwan > g.sik ? '조직·규범 안에서 평가받는 구조로, 안정적인 직장·공직·전문직과 궁합이 맞습니다' : g.sik > g.gwan ? '자기 표현과 결과물로 승부하는 구조로, 기획·창작·사업·프리랜서 영역이 유리합니다' : '조직과 표현이 균형을 이뤄 두 길 모두 가능하나, 선택 후 한 곳에 집중해야 합니다'}.`,
      `직업운을 보는 관성은 ${g.gwan}, 표현과 실행을 보는 식상은 ${g.sik}이에요. ${g.gwan > g.sik ? '조직 안에서 인정받을 때 힘이 나는 타입이라, 안정적인 환경이 잘 맞아요' : g.sik > g.gwan ? '내 이야기와 결과물로 빛나는 타입이라, 창의적인 일에서 힘을 얻어요' : '두 가지 길이 모두 열려 있어서 마음이 끌리는 쪽을 선택해도 좋아요'}.`);
  } else {
    const hasVault = [4, 10, 1, 7].some((b) => [P.year, P.month, P.day, P.hour].some((p) => p && p.branch === b));
    theme = pick(
      `재물운을 보는 재성은 ${g.jae}입니다. ${g.jae === 0 ? '재성이 드러나지 않아 재물은 능력·기술을 통해 간접적으로 형성되는 구조입니다' : g.jae >= 3 ? '재성이 강해 돈의 흐름은 활발하나 지출 통제가 관건입니다' : '재성이 적당해 꾸준한 소득 구조를 만들기 좋습니다'}. 금고 역할의 토(辰戌丑未)는 ${hasVault ? '원국에 있어 모으는 힘이 있습니다' : '원국에 없어 저축 시스템을 강제로 만들어야 합니다'}.`,
      `재물운을 보는 재성은 ${g.jae}예요. ${g.jae === 0 ? '재성이 눈에 띄지 않아서 돈은 실력과 경험을 쌓을수록 따라오는 구조예요' : g.jae >= 3 ? '재성이 강해 돈이 오가는 일이 많아요. 새는 곳만 잘 챙기면 든든해요' : '재성이 알맞아서 차근차근 모아가기 좋아요'}. 금고 역할을 하는 토(辰戌丑未)는 ${hasVault ? '있어서 모으는 힘이 받쳐줘요' : '없어서 자동이체 같은 장치를 만들어 두면 좋아요'}.`);
  }
  const main = [base, balance, strong, theme, rel, ...warn].filter(Boolean).join('\n\n');

  // 3. 운의 흐름
  const favor = (x) => {
    if (service === 'LOVE') return male ? ['편재', '정재'] : ['편관', '정관'];
    if (service === 'SUCCESS') return ['편관', '정관', '식신', '상관'];
    if (service === 'WEALTH') return ['편재', '정재'];
    return ['정인', '편인', '식신'];
  };
  const fav = favor();
  const lines = saju.seun.map((s) => {
    const goodStem = fav.includes(s.tenGodStem), goodBr = fav.includes(s.tenGodBranch);
    const bad = s.relations.some((r) => r.includes('충'));
    let tone;
    if ((goodStem || goodBr) && !bad) tone = pick('기회가 열리는 해', '좋은 기운이 들어오는 해예요');
    else if (bad) tone = pick('변동·충돌에 유의해야 하는 해', '변화가 생기기 쉬워서 마음의 준비가 필요한 해예요');
    else tone = pick('무리하지 않고 기반을 다지는 해', '차분히 다지면서 가는 해예요');
    const det = `${s.tenGodStem}/${s.tenGodBranch}${s.relations.length ? ', 원국과 ' + s.relations.join('·') : ''}`;
    return `- ${s.year}년(${s.ko}년): ${tone} (${det})`;
  });
  const cur = saju.daeun.list.find((d) => d.current);
  const flow = [cur ? pick(`현재 대운은 ${cur.hj}(${cur.ko}) ${cur.startYear}~${cur.endYear}년이며 ${cur.tenGodStem}·${cur.tenGodBranch}의 기운입니다.`, `지금은 ${cur.hj}(${cur.ko}) 대운(${cur.startYear}~${cur.endYear}년) 중이고, ${cur.tenGodStem}·${cur.tenGodBranch}의 기운이 함께해요.`) : '', lines.join('\n')].filter(Boolean).join('\n\n');

  // 4. 조언
  const adv1 = lack.length
    ? pick(`부족한 ${lack[0]} 기운을 생활에서 보완하십시오: ${lack[0]}에 해당하는 활동·환경을 주 단위 루틴으로 고정하는 것이 효과적입니다.`, `비어 있는 ${lack[0]} 기운은 일상 속 작은 루틴으로 채워보세요. 하루 10분이라도 꾸준하면 마음이 한결 든든해져요.`)
    : pick(`가장 강한 ${top[0].ko} 기운이 과열되지 않도록 의사결정 전 하루의 유예 시간을 두십시오.`, `가장 강한 ${top[0].ko} 기운이 넘치지 않게, 중요한 결정 전에는 하루만 쉬어가 보는 건 어떨까요?`);
  const adv2 = pick('충이 걸리는 해에는 이직·투자·계약 같은 큰 결정을 가급적 분산·보류하고 기록으로 근거를 남기십시오.', '변화가 많은 해에는 큰 결정을 서두르지 말고, 믿을 수 있는 사람과 충분히 이야기 나눠보세요.');
  const advice = `1. ${adv1}\n2. ${adv2}`;

  return `## [사주 핵심 요약]\n${summary}\n\n## [메인 분석]\n${main}\n\n## [운의 흐름과 시기]\n${flow}\n\n## [전문가의 조언]\n${advice}`;
}

module.exports = { buildDemoReport: build };
