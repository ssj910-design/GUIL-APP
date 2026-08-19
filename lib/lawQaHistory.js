// 검사기준 Q&A 채팅 기록 — **기기에만 남긴다.**
//
// 서버(law_qa_logs)는 누가 물었는지를 저장하지 않는다(마이그 123). 통계는 익명이어야 하고,
// 개인별로 쌓는 순간 개선 도구가 아니라 감시 도구가 되기 때문이다.
// 그래서 "내 기록"은 서버에서 만들 수 없고, 본인 폰에만 둔다. 기기를 바꾸면 사라진다 —
// 의도한 절충이다.
//
// 날짜별로 묶는 이유: 기사는 "대화 세션"을 만들지 않는다. 현장에서 한두 개 묻고 끝내고,
// 나중에 "지난주에 물어본 그거"를 찾는다. 그래서 세션이 아니라 날짜가 찾는 단위다.
const KEY = "guilLawQaHistoryV1";
const KEEP_DAYS = 30;      // 그 이상은 안 찾는다. 무한정 쌓으면 저장 용량만 먹는다.
const MAX_PER_DAY = 50;

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });   // YYYY-MM-DD

function read() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { /* 용량 초과 등 — 기록은 부가기능이라 실패해도 조용히 넘긴다 */ }
}

/** 문답 한 쌍을 오늘 날짜에 붙인다. */
export function addHistory({ question, answer, sources }) {
  if (typeof window === "undefined" || !question) return;
  const data = read();
  const d = today();
  const list = data[d] ?? [];
  list.push({
    q: question,
    a: answer ?? "",
    // 근거 전문은 안 담는다 — 목록에서 조항만 보이면 충분하고, 담으면 저장 용량이 금방 찬다.
    s: (sources ?? []).slice(0, 5).map((x) => ({ clause: x.clause, title: x.title })),
    t: Date.now(),
  });
  data[d] = list.slice(-MAX_PER_DAY);

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  for (const key of Object.keys(data)) if (key < cutoff) delete data[key];   // YYYY-MM-DD는 문자열 비교로 날짜 비교가 된다
  write(data);
}

/** 최근 날짜부터 [{ date, items }] 로 준다. */
export function getHistory() {
  const data = read();
  return Object.keys(data).sort().reverse().map((date) => ({ date, items: [...data[date]].reverse() }));
}

export function clearHistory() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
