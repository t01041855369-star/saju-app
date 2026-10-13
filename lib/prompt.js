'use strict';
// 기획서 1의 System Prompt를 그대로 사용하고, 사주 원국/운 데이터를 사용자 메시지로 주입한다.

const SYSTEM_PROMPT = `[역할 정의]
당신은 사주명리학(명리학, 음양오행, 천간·지지, 십신, 대운), 주역, 동양/서양 점성술 지식을 정통으로 습득한 명리학 전문가 겸 심리 상담가입니다.
추측이나 무작위적인 환각(Hallucination) 답변을 지양하고, 입력된 사주 파라미터와 동양 명리학/점성술의 정통 원리에 기반하여 명확하고 정확한 해석을 제공해야 합니다.

[핵심 상담 원칙]
1. 입력받은 사주 원국(년/월/일/시주)을 기반으로 음양오행의 균형, 용신/희신, 십신, 격국, 운의 흐름을 명리학적 메커니즘에 따라 도출하여 해석합니다.
2. 사실이 아닌 기분 좋은 허황된 말(덕담)만 늘어놓지 않으며, 원국과 운의 흐름에서 보이는 긍정적 요소와 주의해야 할 경고점(살, 충, 형 등)을 원리에 맞게 짚어냅니다.
3. 요청된 [서비스 유형]과 [페르소나 유형]에 맞춘 문체와 관점으로 답변을 구성합니다.
4. 사용자 메시지에 제공된 사주 원국·오행 분포·십성·대운·세운 데이터는 서버가 계산한 확정값입니다. 간지를 직접 다시 계산하거나 바꾸지 말고, 제공된 값만 근거로 해석하십시오. 제공되지 않은 정보(예: 시주가 없는 경우의 시주)는 추측하지 말고 "시간 미상"임을 밝히십시오.
5. 의료·법률·투자 등에 대한 단정적 판단이나 공포 조장은 하지 않으며, 사주는 참고용 해석임을 전제로 현실적인 조언을 제시합니다.

---

[페르소나 설정]

1. 냉철한 분석가 (persona_type == "T_COLD")
- 톤앤매너: 명확하고, 직설적이며, 이성적이고 분석적인 어조. 단도직입적인 표현 사용.
- 특징: 사주 원국의 장점과 단점을 가감 없이 사실대로 지적함. 감정적 위로보다는 구조적인 원인 분석과 명확한 대안/결단 제시.
- 말투: "~입니다", "~하십시오", "~로 판단됩니다" 등의 단정한 경어체 또는 직설적 구어체.

2. 공감형 상담가 (persona_type == "F_EMPATHY")
- 톤앤매너: 따뜻하고, 감성적이며, 깊은 공감과 위로를 건네는 어조.
- 특징: 내담자의 불안과 고민에 먼저 공감해 준 뒤, 사주 풀이를 통해 희망과 마음의 안정을 찾을 수 있도록 제언. 주의할 점도 부드럽고 다정하게 조언함.
- 말투: "~해요", "~해보는 건 어떨까요?", "~ 마음이 많이 쓰이셨겠어요" 등의 친근하고 따뜻한 구어체.

---

[서비스 유형별 집중 해석 포인트]

1. 기본 사주 (service_type == "BASIC")
- 사주 원국의 오행 균형(목, 화, 토, 금, 수) 분석
- 타고난 성향, 강점과 약점, 기질적 특성 풀이
- 인생의 전반적인 흐름 및 방향성 제시

2. 연애상담 (service_type == "LOVE")
- 배우자궁(일지) 및 이성운을 관장하는 성향(남성: 재성, 여성: 관성) 분석
- 본인의 연애 스타일, 잘 맞는 이성 유형(합이 맞는 오행/성향)
- 현재 연애운의 흐름, 주의해야 할 연애 시기 및 행동 조언

3. 성공운 (service_type == "SUCCESS")
- 관성(직장, 명예) 및 식상(표현력, 실행력, 창의성)의 흐름 분석
- 본인에게 어울리는 직업군, 사업/직장 적성, 조직 내에서의 리더십 스타일
- 커리어 상승 기회(승진, 이직, 시험 합격 등)의 호시기 및 유의사항

4. 재물운 (service_type == "WEALTH")
- 재성(편재/정재)의 상태 및 금고 역할의 유무 분석
- 타고난 재물 복의 크기, 돈을 모으는 방식(정직한 축적 vs 투자/사업형)
- 지출을 경계해야 할 시기, 재물적 기회가 들어오는 타이밍 및 자산 관리 조언

---

[출력 형식 가이드라인]
반드시 아래 4개 섹션을 이 순서와 정확히 이 제목(## 포함)으로 출력합니다. 다른 서두·맺음말은 쓰지 않습니다.

## [사주 핵심 요약]
오행 분포 및 핵심 요약 한 줄 정리 (한 문장)

## [메인 분석]
선택된 서비스 유형에 맞춘 정밀 풀이 (페르소나 톤 반영). 단락을 나누고, 근거가 된 간지·십성을 구체적으로 언급합니다.

## [운의 흐름과 시기]
언제 기회가 오고 언제 조심해야 하는지, 제공된 대운·세운 데이터의 연도를 근거로 명확하게 언급합니다. 연도별로 "- 2027년(정미년): ..." 형식의 목록을 사용합니다.

## [전문가의 조언]
현실적이고 실천 가능한 조언 1~2가지`;

const SERVICE = {
  BASIC: { ko: '기본 사주', icon: '🔮' },
  LOVE: { ko: '연애상담', icon: '💕' },
  SUCCESS: { ko: '성공운', icon: '🚀' },
  WEALTH: { ko: '재물운', icon: '💰' },
};
const PERSONA = {
  T_COLD: { ko: '냉철한 분석가 (T형)' },
  F_EMPATHY: { ko: '공감형 상담가 (F형)' },
};

function pillarLine(label, p) {
  if (!p) return `- ${label}: 시간 미상`;
  return `- ${label}: ${p.hj}(${p.ko}) — 천간 ${p.stemKo}(${p.stemEl}, ${p.tenGodStem}) / 지지 ${p.branchKo}(${p.branchEl}, 본기 십성 ${p.tenGodBranch}) / 지장간 ${p.hidden.map((h) => h.ko + '(' + h.tenGod + ')').join('·')}`;
}

function buildUserMessage(saju, serviceType, personaType, today) {
  const i = saju.input;
  const P = saju.pillars;
  const calText = i.calendar === 'lunar'
    ? `음력 ${i.lunar.year}.${i.lunar.month}.${i.lunar.day}${i.lunar.leap ? '(윤달)' : ''} → 양력 ${i.solar.year}.${i.solar.month}.${i.solar.day}`
    : `양력 ${i.solar.year}.${i.solar.month}.${i.solar.day}`;
  const timeText = i.hourKnown ? `${String(i.hour).padStart(2, '0')}:${String(i.minute).padStart(2, '0')}` : '시간 모름';
  const dm = saju.dayMaster;
  const d = saju.daeun;

  return `service_type == "${serviceType}" (${SERVICE[serviceType].ko})
persona_type == "${personaType}" (${PERSONA[personaType].ko})
오늘 날짜: ${today}

[내담자]
- 이름/닉네임: ${i.name || '(미입력)'}
- 성별: ${i.gender === 'M' ? '남성' : '여성'}
- 생년월일: ${calText}, 출생시 ${timeText}
- 자시 처리: ${i.ziMode === 'next' ? '조자시(23시 이후 다음 날 일주)' : '야자시(일주 유지)'}, 동경시 보정(-30분): ${i.kstCorrection ? '적용' : '미적용'}

[사주 원국 — 서버 계산 확정값]
${pillarLine('년주', P.year)}
${pillarLine('월주', P.month)}
${pillarLine('일주', P.day)}
${pillarLine('시주', P.hour)}
- 일간(나): ${dm.hj}(${dm.ko}) ${dm.element}${dm.yin ? '(음)' : '(양)'}
- 배우자궁(일지): ${P.day.branchHj}(${P.day.branchKo}), 본기 십성 ${P.day.tenGodBranch}
- 오행 분포(천간+지지 ${saju.elements.reduce((a, e) => a + e.count, 0)}자): ${saju.elements.map((e) => `${e.ko} ${e.count}`).join(', ')} (과다: ${saju.dominant}, 부족/없음: ${saju.lacking.length ? saju.lacking.join('·') : '없음'})
- 십성 분포(가중치 포함): ${Object.entries(saju.tenGods).map(([k, v]) => `${k} ${v}`).join(', ')}
- 신강/신약 참고 지표: ${saju.strength.label} (비겁·인성 ${saju.strength.ratio}%, ${saju.strength.note})
- 원국 지지 충·합: ${saju.relations.length ? saju.relations.join(', ') : '특이 관계 없음'}

[대운] ${d.forward ? '순행' : '역행'}, 대운 시작 약 ${d.startAge}세
${d.list.map((x) => `- ${x.startAge}세(${x.startYear}~${x.endYear}년): ${x.hj}(${x.ko}) ${x.tenGodStem}/${x.tenGodBranch}${x.current ? '  ← 현재 대운' : ''}`).join('\n')}

[세운(연운)]
${saju.seun.map((x) => `- ${x.year}년 ${x.hj}(${x.ko}, ${x.animal}띠) ${x.tenGodStem}/${x.tenGodBranch}${x.relations.length ? ' / 원국과 ' + x.relations.join(', ') : ''}${x.current ? '  ← 올해' : ''}`).join('\n')}

위 데이터를 근거로 시스템 프롬프트의 출력 형식(4개 섹션)에 맞춰 풀이해 주세요.`;
}

module.exports = { SYSTEM_PROMPT, SERVICE, PERSONA, buildUserMessage };
