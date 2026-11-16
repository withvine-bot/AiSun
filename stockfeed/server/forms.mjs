// SEC 서식 분류와 한국어 설명. 외부 호출 없이 규칙만으로 동작한다.

export const CATEGORIES = {
  event: '주요사건',
  earnings: '실적보고',
  offering: '증권발행',
  ownership: '지분변동',
  insider: '내부자거래',
  proxy: '주총·위임장',
  other: '기타',
};

// EDGAR 전문검색에 요청할 서식 묶음. 기본형만 적는다 — 기본형이 정정본(/A)까지 포함하며,
// 목록에 "/A" 를 섞으면 검색이 정정본만 돌려준다.
export const WATCH_GROUPS = {
  event: ['8-K', '6-K'],
  earnings: ['10-Q', '10-K', '20-F', '40-F', 'NT 10-Q', 'NT 10-K'],
  offering: ['S-1', 'S-3', 'S-3ASR', 'F-1', 'F-3', '424B1', '424B2', '424B3', '424B4', '424B5', 'FWP', 'POS AM', 'S-8'],
  ownership: ['SCHEDULE 13D', 'SCHEDULE 13G', 'SC 13D', 'SC 13G', '13F-HR', 'SC TO-T', 'SC TO-I'],
  insider: ['3', '4', '5', '144'],
  other: ['DEF 14A', 'DEFA14A', 'PRE 14A', '25', '25-NSE', '15-12G'],
};

const FORM_INFO = [
  [/^8-K/, 'event', '수시보고서(8-K)', '회사에 중요한 일이 생겼을 때 내는 수시 보고서입니다.'],
  [/^6-K/, 'event', '외국기업 수시보고서(6-K)', '미국에 상장한 외국 기업이 본국에서 공개한 중요 정보를 알리는 보고서입니다.'],
  [/^10-Q/, 'earnings', '분기보고서(10-Q)', '분기 결산 보고서입니다. 이번 분기의 매출과 이익, 현금 흐름을 담고 있습니다.'],
  [/^10-K/, 'earnings', '연간보고서(10-K)', '연간 결산 보고서입니다. 한 해 실적과 사업 위험 요인을 종합해 담고 있습니다.'],
  [/^(20-F|40-F)/, 'earnings', '외국기업 연간보고서', '미국에 상장한 외국 기업의 연간 결산 보고서입니다.'],
  [/^NT 10-/, 'earnings', '제출 지연 통지(NT)', '정기 보고서를 기한 안에 내지 못한다고 알리는 통지입니다. 결산 지연 사유를 확인하세요.'],
  [/^(S-1|F-1)/, 'offering', '증권신고서(S-1/F-1)', '신규 상장이나 주식 발행을 위해 내는 증권신고서입니다.'],
  [/^(S-3|F-3)/, 'offering', '일괄 증권신고서(S-3/F-3)', '필요할 때 나눠서 증권을 발행할 수 있도록 미리 등록해 두는 신고서입니다. 향후 증자 가능성을 뜻합니다.'],
  [/^424B/, 'offering', '투자설명서(424B)', '증권 발행 조건을 확정하거나 기존 투자설명서에 내용을 덧붙인 문서입니다.'],
  [/^FWP/, 'offering', '자유서면 투자설명서(FWP)', '증권 발행과 관련해 투자자에게 제공하는 안내 자료입니다.'],
  [/^POS AM/, 'offering', '효력발생 후 정정(POS AM)', '이미 효력이 발생한 증권신고서를 고친 정정 신고서입니다.'],
  [/^S-8/, 'offering', '임직원 주식보상 등록(S-8)', '임직원 보상용 주식을 등록하는 신고서입니다.'],
  [/^(SC|SCHEDULE) 13D/, 'ownership', '대량보유 보고(13D)', '지분 5% 이상을 보유하고 경영에 영향을 줄 의도가 있을 수 있는 투자자의 보고서입니다.'],
  [/^(SC|SCHEDULE) 13G/, 'ownership', '대량보유 보고(13G)', '지분 5% 이상을 단순 투자 목적으로 보유한 투자자의 보고서입니다.'],
  [/^13F/, 'ownership', '기관 보유내역(13F)', '기관투자자가 분기 말 기준 보유 종목을 공개하는 보고서입니다.'],
  [/^SC TO/, 'ownership', '공개매수(TO)', '주식 공개매수와 관련된 신고서입니다.'],
  [/^3$/, 'insider', '내부자 최초 보유 신고(Form 3)', '임원·주요주주가 된 사람이 보유 지분을 처음 신고한 문서입니다.'],
  [/^4/, 'insider', '내부자 거래 신고(Form 4)', '임원·주요주주가 자사 주식을 사고판 내역을 신고한 문서입니다.'],
  [/^5$/, 'insider', '내부자 연간 신고(Form 5)', '임원·주요주주의 연간 지분 변동 신고입니다.'],
  [/^144/, 'insider', '내부자 매도 예정 신고(Form 144)', '내부자가 제한 주식을 팔겠다고 미리 알리는 신고입니다.'],
  [/14A/, 'proxy', '위임장 설명서(14A)', '주주총회 안건과 의결권 위임에 관한 문서입니다.'],
  [/^25/, 'other', '상장폐지 신고(Form 25)', '거래소 상장을 폐지한다는 신고입니다.'],
  [/^15-/, 'other', '등록 종료 신고(Form 15)', '증권 등록과 공시 의무를 끝내겠다는 신고입니다.'],
];

// 8-K 항목 번호 → [한국어 뜻, 신호(+1 호재성 / -1 악재성 / 0 중립)]
export const ITEMS_8K = {
  '1.01': ['중요 계약 체결', 0],
  '1.02': ['중요 계약 해지', -1],
  '1.03': ['파산·법정관리', -1],
  '1.05': ['중대한 사이버보안 사고', -1],
  '2.01': ['자산 인수·처분 완료', 0],
  '2.02': ['실적 발표', 0],
  '2.03': ['신규 채무·재무적 의무 발생', 0],
  '2.04': ['채무 조기상환 사유 발생', -1],
  '2.05': ['구조조정·사업 철수 비용', -1],
  '2.06': ['자산 손상차손', -1],
  '3.01': ['상장유지 요건 미달 통지·상장 이전', -1],
  '3.02': ['미등록 주식 발행(사모)', 0],
  '3.03': ['주주 권리 변경', 0],
  '4.01': ['감사인 변경', 0],
  '4.02': ['기존 재무제표 신뢰 불가', -1],
  '5.01': ['경영권 변동', 0],
  '5.02': ['임원·이사 선임 및 사임', 0],
  '5.03': ['정관·회계연도 변경', 0],
  '5.07': ['주주총회 표결 결과', 0],
  '5.08': ['주주 이사 후보 추천', 0],
  '7.01': ['공정공시(Reg FD)', 0],
  '8.01': ['기타 중요 사항', 0],
  '9.01': ['재무제표·첨부서류', 0],
};

export function classify(form) {
  const f = String(form || '').toUpperCase().trim();
  for (const [re, cat, label, desc] of FORM_INFO) {
    if (re.test(f)) return { cat, label, desc, amended: /\/A$/.test(f) };
  }
  return { cat: 'other', label: f, desc: `${f} 공시가 제출되었습니다.`, amended: /\/A$/.test(f) };
}

// 받침 유무에 따라 조사 선택. 한글이 아니면 '이(가)' 형태로 병기.
export function josa(word, withBatchim, without) {
  const ch = String(word).trim().slice(-1).charCodeAt(0);
  if (ch >= 0xac00 && ch <= 0xd7a3) return (ch - 0xac00) % 28 ? withBatchim : without;
  return `${withBatchim}(${without})`;
}

// 규칙 기반 한국어 요약. AI 요약이 없을 때 카드에 보인다.
export function describe({ form, name, reporter, items = [] }) {
  const info = classify(form);
  const tags = [];
  let signal = 0;
  for (const it of items) {
    const hit = ITEMS_8K[it];
    if (!hit || it === '9.01') continue;
    tags.push(hit[0]);
    signal += hit[1];
  }
  let text;
  if (info.cat === 'event' && tags.length) {
    text = `${name}${josa(name, '이', '가')} ${info.label}를 제출했습니다. 보고 항목: ${tags.join(', ')}.`;
  } else if (info.cat === 'insider' && reporter) {
    text = `${reporter}${josa(reporter, '이', '가')} ${name} 주식에 대한 ${info.label}를 제출했습니다. ${info.desc}`;
  } else if (info.cat === 'ownership' && reporter) {
    text = `${reporter}${josa(reporter, '이', '가')} ${name} 지분과 관련해 ${info.label}를 제출했습니다. ${info.desc}`;
  } else {
    text = `${name}${josa(name, '이', '가')} ${info.label}를 제출했습니다. ${info.desc}`;
  }
  if (info.amended) text += ' (정정 공시)';
  return { text, tags, signal: Math.sign(signal), cat: info.cat, label: info.label };
}
