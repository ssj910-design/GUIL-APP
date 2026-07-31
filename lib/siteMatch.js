// 현장 이름·주소 매칭 유틸 — 엑셀 검증 업로드(VerifyImport)와 비상통화장치 업로드가 공유한다.
// 규칙은 전부 실제 구일 관리 엑셀을 분석해 만든 것: 법인기호(㈜) 정규화, 괄호 별칭·옛이름("구. …"),
// 영문↔한글 발음(Dream Castle=드림캐슬), 옛 표기(메디칼=메디컬), 건물 유형어(하우스·빌딩) 제거,
// 동 표기(A동·101동)·주소 접두어(사당동삼성아파트) 분리, 법정동·도로명 추출.
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
// 매칭 키: 괄호 별칭 제거 + 특수문자(점·앰퍼샌드·하이픈 등)·공백 전부 무시 + 영문 소문자화
// → "H.애비뉴호텔"="H애비뉴호텔", "J.J 빌딩"="JJ빌딩", "COSTORY TOWER"="costorytower" 전부 같은 키
// 법인 표기 제거 — "㈜동성엔지니어링"(합자 기호)과 "(주)동성엔지니어링"을 같은 이름으로 본다.
// 이걸 안 지우면 키가 "주동성…" vs "동성…"으로 갈려 매칭이 통째로 실패한다.
const stripCorp = (s) => String(s ?? "").replace(/[㈜㈐㈔]/g, "").replace(/\((주|유|재|사|학)\)/g, "");
// 첫 괄호 앞까지가 본명 — "(구.(주)에이알)"처럼 괄호가 중첩돼도 본명 키가 오염되지 않게 자른다
const nameKey = (s) => norm(stripCorp(s)).split("(")[0].replace(/[^가-힣A-Za-z0-9]/g, "").toLowerCase();
// 영문 상호 → 한글 발음 사전 — 센터엔 "Dream Castle", 내부엔 "드림캐슬"로 적히는 표기 차이를 흡수한다.
// 영문 조각이 사전 단어로 "완전히" 분해될 때만 변환한다(부분 치환으로 이름이 깨지는 오류 방지).
const ENG2KOR = [
  ["officetel", "오피스텔"], ["building", "빌딩"], ["mansion", "맨션"], ["palace", "팰리스"], ["centre", "센터"], ["center", "센터"],
  ["castle", "캐슬"], ["golden", "골든"], ["valley", "밸리"], ["dream", "드림"], ["tower", "타워"], ["house", "하우스"],
  ["hills", "힐스"], ["plaza", "플라자"], ["royal", "로얄"], ["grand", "그랜드"], ["white", "화이트"], ["black", "블랙"],
  ["green", "그린"], ["prime", "프라임"], ["villa", "빌라"], ["ville", "빌"], ["vill", "빌"], ["park", "파크"],
  ["view", "뷰"], ["city", "시티"], ["gold", "골드"], ["blue", "블루"], ["star", "스타"], ["sky", "스카이"],
  ["hill", "힐"], ["bldg", "빌딩"], ["the", "더"], ["new", "뉴"], ["hi", "하이"],
].sort((a, b) => b[0].length - a[0].length);
// 부분 변환 허용 — "costorytower"처럼 고유명+일반단어 조합도 "costory타워"로 바꿔
// 상대쪽 "코스토리타워"와 유사도가 잡히게 한다 (변형 키가 하나 늘 뿐이라 오매칭 위험 낮음)
const engToKorKey = (key) => {
  let out = key;
  for (const [e, ko] of ENG2KOR) out = out.split(e).join(ko);
  return out !== key ? out : null;
};
// 한글 옛 표기·발음 변형 — "공항메디칼센터"(어르신 표기)와 "공항메디컬센터"를 같은 키로
const KOR_VARIANTS = [["메디칼", "메디컬"], ["센타", "센터"], ["프라자", "플라자"], ["맨숀", "맨션"]];
const korVariantKey = (key) => {
  let out = key;
  for (const [a, b] of KOR_VARIANTS) out = out.split(a).join(b);
  return out !== key ? out : null;
};
// 건물 유형어(하우스·빌딩·타워…)는 붙였다 뗐다 하는 장식이다 — "더해피하우스"와 "더해피"를 잇기 위해
// 끝의 유형어를 벗긴 키를 하나 더 만든다. 남는 이름이 2자 이상일 때만(빌딩→"" 같은 붕괴 방지).
const BUILDING_SUFFIX = /(하우스|오피스텔|빌라트|빌리지|아파트|맨션|빌딩|타워|플라자|팰리스|캐슬|파크|센터|빌라|타운|힐스|스토어|사옥|본관|별관|빌|관)$/;
const stripSuffixKey = (key) => {
  const out = key.replace(BUILDING_SUFFIX, "");
  return out !== key && out.length >= 2 ? out : null;
};
// "비젼타워 (스타병원)" → ["비젼타워", "스타병원"] — 본명·별칭 + 영문의 한글 발음 변형까지 전부 매칭 키로 쓴다.
// "(구. P&P빌딩)"처럼 옛 이름 메모는 "구." 접두어를 벗겨야 상대쪽 "P&P빌딩"과 키가 맞는다.
const nameKeys = (s) => {
  // 법인 표기를 먼저 지워야 "(구.(주)에이알)" 같은 중첩 괄호에서 별칭이 제대로 나온다
  const s2 = stripCorp(s);
  const alias = [...s2.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].replace(/^\s*구[.\s]+/, ""));
  // "대진월드타워1,2"처럼 한 별칭에 여러 동을 합쳐 적은 경우 → 대진월드타워1 / 대진월드타워2로 분해
  const expanded = alias.flatMap((a) => {
    const m = /^(.*?)(\d+)\s*[,·/]\s*(\d+)$/.exec(norm(a));
    return m ? [a, `${m[1]}${m[2]}`, `${m[1]}${m[3]}`] : [a];
  });
  const base = [nameKey(s), ...expanded.map(nameKey)].filter(Boolean);
  const withEng = [...new Set([...base, ...base.map(engToKorKey).filter(Boolean)])];
  return [...new Set([...withEng, ...withEng.map(korVariantKey).filter(Boolean)])];
};
// 이름 끝의 동(棟) 표기를 꺼낸다 — "서연빌리지 A동"→"a", "이안휴빌101동"→"101".
// 같은 단지의 여러 동은 주소·좌표가 같아서 이걸로만 구분할 수 있다.
const unitTagOf = (s) => {
  const m = /([a-zA-Z]|\d{1,3})\s*동\s*$/.exec(norm(s)) ?? /\s([a-zA-Z])\s*$/.exec(norm(s));
  return m ? m[1].toLowerCase() : null;
};
// 동(棟) 표기 제거 — "예촌아파트B" "예촌아파트101동" "…A동"의 끝 동 표시를 뗀다.
// 같은 단지를 A·B·C나 101·102동으로 나눠 적은 경우를 하나로 모으기 위함.
const stripDongKey = (key) => {
  const out = key.replace(/(\d{1,3}동|[a-z]동|동$|[a-z])$/, "");
  return out !== key && out.length >= 2 ? out : null;
};
// 주소 조각(법정동)이 이름 앞에 붙은 경우 제거 — "사당동삼성아파트" → "삼성아파트"
const stripDongPrefix = (key, dong) => {
  if (!dong) return null;
  const d = nameKey(dong);
  if (!d || !key.startsWith(d)) return null;
  const out = key.slice(d.length);
  return out.length >= 2 ? out : null;
};
// 주소에서 법정동 추출 — 내부 구주소("반포동 701-16")와 DB 신주소 끝 "(반포동)" 모두 잡힌다
const dongOf = (addr) => (/([가-힣]{1,10}[동가리])(?=\s|\d|\)|$)/.exec(String(addr ?? "")) ?? [])[1] ?? null;
// 주소 끝에 건물 별칭이 붙는 경우가 있다 — "동작구 신대방동 385-1 태성대아파트", "…, 디모데관"
// 이름 없는 행에서 이걸 이름 대신 쓴다.
const buildingHintOf = (addr) => {
  const s = norm(addr);
  const m = /[,\s]([가-힣A-Za-z][가-힣A-Za-z0-9]{2,})\s*$/.exec(s);
  return m && !/^\d/.test(m[1]) && !/[동리가]$/.test(m[1]) ? m[1] : null;
};
// 유형어·동 표기까지 벗긴 "느슨한 키" — 더해피하우스=더해피, 예촌아파트B=예촌아파트.
// 오매칭(성진빌딩↔성진타워) 위험이 있어 통과 판정에는 쓰지 않고, 후보 제시(유사도)에만 쓴다.
const looseKeys = (s, addr) => {
  const base = nameKeys(s);
  const dongStripped = base.flatMap((k) => [k, stripSuffixKey(k), stripDongKey(k), stripDongPrefix(k, dongOf(addr))]).filter(Boolean);
  // 주소 조각을 뗀 뒤 유형어도 떼는 조합까지 (사당동삼성아파트 → 삼성아파트 → 삼성)
  return [...new Set([...dongStripped, ...dongStripped.map(stripSuffixKey).filter(Boolean)])];
};
// 도로명+번지 추출("이태원로 22" → "이태원로22") — 양쪽 다 신주소면 이걸로 정확히 맞춰볼 수 있다
const roadOf = (addr) => { const m = /([가-힣A-Za-z0-9]+(?:로|길)\s*\d+(?:-\d+)?)/.exec(String(addr ?? "")); return m ? m[1].replace(/\s/g, "") : null; };
// 싼 유사도: 2글자 조각(bigram) 겹침 비율 0~1 — 라이브러리 없이 이름 비슷함 판단용
function similarity(a, b) {
  const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const ga = grams(a), gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let hit = 0;
  ga.forEach((g) => { if (gb.has(g)) hit++; });
  return hit / Math.max(ga.size, gb.size);
}

// 한글 이름을 로마자로 — "코킴"↔"kokim", "제이"↔"j" 같은 표기 차이를 잇는다.
// 완벽한 로마자 표기법이 아니라 매칭용 근사치다(초성+중성+종성을 소리나는 대로).
const CHO = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
const JUNG = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
const JONG = ["","k","k","k","n","n","n","t","l","l","l","l","l","l","l","l","m","p","p","t","t","ng","t","t","k","t","p","t"];
function romanize(s) {
  let out = "";
  for (const ch of String(s ?? "")) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const n = c - 0xac00;
      out += CHO[Math.floor(n / 588)] + JUNG[Math.floor((n % 588) / 28)] + JONG[n % 28];
    } else out += ch.toLowerCase();
  }
  return out.replace(/[^a-z0-9]/g, "");
}
// 이름 유사도 — 유형어("하우스")만 겹쳐서 점수가 나오는 걸 막고, 한글↔영문 표기도 잇는다.
// a·b는 이미 정규화된 키(nameKey 결과)라고 본다.
function nameSimilarity(a, b) {
  const direct = similarity(a, b);
  const ra = romanize(a), rb = romanize(b);
  const roman = ra && rb ? similarity(ra, rb) : 0;
  let score = Math.max(direct, roman);
  // 유형어를 뗀 핵심 이름끼리 전혀 안 닮았으면(코킴 vs 남강) 유형어 때문에 붙은 점수를 깎는다
  const ca = stripSuffixKey(a) ?? a, cb = stripSuffixKey(b) ?? b;
  if (ca !== a || cb !== b) {
    const core = Math.max(similarity(ca, cb), (romanize(ca) && romanize(cb)) ? similarity(romanize(ca), romanize(cb)) : 0);
    if (core < 0.3) score = Math.min(score, core + 0.15);
  }
  return score;
}

export { norm, stripCorp, nameKey, nameKeys, looseKeys, unitTagOf, stripDongKey, dongOf, roadOf, similarity, romanize, nameSimilarity };
