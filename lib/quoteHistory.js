// 과거 견적 이력 활용 — 견적 작성 화면(QuoteItemsModal)의 "이전 견적 불러오기"와 품명 자동완성이
// 같은 이력에서 나온 값을 쓰도록 색인·검색을 한곳에 모았다. 순수 함수만 두어 화면은 호출만 한다.

// 띄어쓰기·괄호·기호만 다른 같은 부품(예: "SMPS (REPAIR)"와 "smps(repair)")을 한 품목으로 묶는다.
export const normName = (s) => String(s ?? "").toLowerCase().replace(/[\s()[\]'"·\-_,./]/g, "");

const EXCLUDED_STATUS = new Set(["요청접수", "반려", "취소"]);

// 이력으로 쓸 견적 — 품목이 실제로 작성된 것만(요청접수=초안, 반려·취소=쓰이지 않은 가격 제외).
// 현재 편집 중인 견적(excludeId)은 자기 자신을 참고하지 않도록 뺀다.
export function historyQuotes(quoteRequests, excludeId) {
  return (quoteRequests ?? []).filter(
    (q) => q.id !== excludeId && !EXCLUDED_STATUS.has(q.status) && (q.quoteItems ?? []).some((it) => it.name?.trim())
  );
}

const dateOf = (q) => q.quoteIssuedDate || q.requestedDate || "";
export const shortDateLabel = (d) => (d ? `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}` : "");

// 품목 색인 — 품명(정규화)별 사용 횟수·단가 범위·가장 최근 값. 가장 많이 쓴 표기를 대표 이름으로 쓴다.
export function buildItemIndex(quotes) {
  const map = new Map();
  for (const q of quotes) {
    const date = dateOf(q);
    for (const it of q.quoteItems ?? []) {
      const name = it.name?.trim();
      if (!name) continue;
      const category = it.category ?? "자재비";
      const spec = (it.spec ?? "").trim();
      // 같은 품명이어도 규격이 다르면 단가가 다르므로(마그네트 45,900~119,000원 등) 규격별로 따로 센다.
      const key = `${category}|${normName(name)}|${normName(spec)}`;
      const price = Number(it.unitPrice) || 0;
      let e = map.get(key);
      if (!e) { e = { key, category, spellings: new Map(), specs: new Map(), count: 0, prices: [], lastDate: "", last: null }; map.set(key, e); }
      e.spellings.set(name, (e.spellings.get(name) ?? 0) + 1);
      if (spec) e.specs.set(spec, (e.specs.get(spec) ?? 0) + 1);
      e.count += 1;
      if (price > 0) e.prices.push(price);
      if (!e.last || date >= e.lastDate) {
        e.lastDate = date;
        e.last = { unitPrice: price, unit: it.unit ?? "", spec: it.spec ?? "" };
      }
    }
  }
  return [...map.values()].map((e) => ({
    key: e.key,
    norm: e.key.split("|")[1],
    normSpec: e.key.split("|")[2] ?? "",
    category: e.category,
    name: [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
    spec: e.specs.size ? [...e.specs.entries()].sort((a, b) => b[1] - a[1])[0][0] : "",
    count: e.count,
    minPrice: e.prices.length ? Math.min(...e.prices) : 0,
    maxPrice: e.prices.length ? Math.max(...e.prices) : 0,
    lastDate: e.lastDate,
    last: e.last,
  }));
}

// 품명 입력 중 후보 — 입력한 글자가 들어간 것만, 앞부분 일치 → 많이 쓴 순 → 최근 순.
export function suggestItems(index, text, category, limit = 6) {
  const q = normName(text);
  if (!q) return [];
  return index
    .filter((e) => e.category === category && (e.norm + e.normSpec).includes(q))
    .sort((a, b) => (b.norm.startsWith(q) - a.norm.startsWith(q)) || (b.count - a.count) || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
}

// 후보에 붙이는 "과거 견적 7회 · 45,900~119,000원" — 마지막 값 하나만 보여주면 들쭉날쭉한 가격을
// 그대로 믿게 되므로 범위를 같이 보여준다.
export function priceRangeLabel(e) {
  if (!e.maxPrice) return `${e.count}회`;
  const won = (n) => n.toLocaleString("ko-KR");
  return `${e.count}회 · ${e.minPrice === e.maxPrice ? won(e.minPrice) : `${won(e.minPrice)}~${won(e.maxPrice)}`}원`;
}

// 이전 견적 목록 정렬 — 같은 호기 → 같은 현장 → 요청문구·견적명 단어가 겹치는 순, 같으면 최근 순.
export function rankPastQuotes(quotes, { siteId, unitId, text }) {
  const words = String(text ?? "").toLowerCase().split(/[\s,()/·]+/).map(normName).filter((w) => w.length >= 2);
  return quotes
    .map((q) => {
      const hay = normName(`${q.quoteTitle ?? ""} ${(q.quoteItems ?? []).map((it) => it.name).join(" ")} ${q.constructionType ?? ""}`);
      const matched = words.filter((w) => hay.includes(w)).length;
      const score = (unitId && q.unitId === unitId ? 100 : 0) + (siteId && q.siteId === siteId ? 50 : 0) + matched * 10;
      return { q, score, sameSite: !!siteId && q.siteId === siteId, matched };
    })
    .sort((a, b) => (b.score - a.score) || dateOf(b.q).localeCompare(dateOf(a.q)));
}

export const quoteDate = dateOf;
