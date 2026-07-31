"use client";

// 엑셀 검증 업로드 — "정리 안 된 내부 관리 엑셀"을 DB에 넣기 전에 검사하는 프로그램.
// (현장 일괄등록 ImportSites 옆의 별도 도구 — 여기서는 DB에 아무것도 쓰지 않는다)
//
// 흐름: ① 내부 엑셀 업로드 → 이미 등록된 DB 현장(현장정보)과 자동 대조
//      ② 자동 검증 — 행마다 문제를 빨강(막아야 함)/노랑(확인 필요)으로 표시
//      ③ 한 건씩 클릭해 원본 vs 해석값을 보고 "검토 완료" 체크
//      ④ 정리본 엑셀 다운로드 → 손보고 나서 일괄등록으로 진행 (DB 반영은 다음 단계)
//
// 검증 규칙은 실제 구일 관리 엑셀(승강기정보1.xlsx, 779행)을 분석해 만들었다:
// 병합셀 잔재(현장명 빈 행), 한 셀에 전화 여러 개, 연락처 셀의 비밀번호·열쇠 메모,
// 사업자번호 열의 주민번호, 서술형 계약일("16년…/20년… 재계약"), 연도 없는 검사만료("3. 28") 등.
import { useMemo, useState } from "react";
import { Upload, Download, AlertTriangle, CheckCircle2, DatabaseZap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/app/components/admin/adminShared";
import { confirmAsync } from "@/app/components/ConfirmHost";
import { nameSimilarity } from "@/lib/siteMatch";

// 실데이터(1,088개) 분석으로 확장: 0시작 정식번호 + 대표번호(15XX·16XX·18XX) + 지역번호 생략 유선(303-4040 등, 02 생략 관행)
const PHONE_RE = /(?:0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})|(?:1[5-9]\d{2}[-.\s]?\d{4})|(?:(?<![\d-])\d{3,4}-\d{4}(?![\d-]))/g;
// 직함 사전 — 긴 것 먼저(관리소장이 소장보다 앞). 이름+직함 붙은 라벨("유철기사장님")에서 직함을 찾아 이름과 분리한다.
const ROLE_RE = /(관리소장|입주자대표|승강기담당|관리담당자|관리담당|담당과장|담당자|센터장|사무장|주무관|건물주|관리인|관리자|사무실|관리실|경비실|본사|사장|대표|회장|소장|경비|총무|반장|담당|부장|차장|과장|대리|주임|실장|팀장|국장|목사|사모|이사|기사|원장|장로|집사)/;
// 라벨 → { name, role, paren } 구조 분리. 직함 사전에 없으면(아들·딸 등) 원문 그대로 = 기타.
function labelParts(raw) {
  if (!raw) return { name: "", role: "", paren: "" };
  const paren = (/\(([^)]+)\)/.exec(raw) ?? [])[1] ?? "";
  const base = raw.replace(/\([^)]*\)/g, "").replace(/님$/, "").trim();
  // 직함은 보통 라벨 끝에 붙는다("유철기사장") — 끝 우선으로 찾아야 "기사"를 먼저 잡는 오류가 없다
  const m = new RegExp(ROLE_RE.source + "$").exec(base) ?? ROLE_RE.exec(base);
  return { name: m ? base.replace(m[1], "").trim() : base, role: m?.[1] ?? "", paren };
}
const labelInfo = (raw) => { const p = labelParts(raw); return [p.name, p.role, p.paren && `(${p.paren})`].filter(Boolean).join(" "); };
// 직함 사전 → 앱의 현장 담당자 역할(SitesAdmin CONTACT_ROLES) 매핑. 없는 직함·관계(아들 등)는 "기타".
const ROLE_MAP = {
  사장: "대표", 대표: "대표", 회장: "대표", 목사: "대표",
  건물주: "건물주",
  관리소장: "관리소장", 소장: "관리소장", 관리인: "관리소장", 관리자: "관리소장",
  경비: "경비실", 경비실: "경비실",
  입주자대표: "입주민 대표", 총무: "총무",
  담당자: "담당자", 담당: "담당자", 담당과장: "담당자", 승강기담당: "담당자", 관리담당자: "담당자", 관리담당: "담당자", 대리: "담당자", 주임: "담당자", 사원: "담당자",
  부장: "담당자", 차장: "담당자", 과장: "담당자", 실장: "담당자", 팀장: "담당자", 국장: "담당자", 주무관: "담당자",
  사무장: "담당자", 센터장: "담당자", 기사: "담당자", 이사: "담당자", 원장: "담당자",
};
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

// "12년9월1일" / "2016.10.26" / "20111213" → ISO 날짜. 못 읽으면 null.
function parseKoreanDate(v) {
  const s = norm(v);
  if (!s) return null;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
  let m = /(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/.exec(s);
  if (m) {
    const y = m[1].length === 2 ? `20${m[1]}` : m[1];
    return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  }
  m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return null;
}

// 계약일 열은 실제로는 "계약 이력 메모"다 — 재계약·건물주 변경 이력이 한 칸에 줄줄이 적혀 있다.
//   "16년10월26일(1년계약) / 20년11월26일 (FM으로 변경 재계약)" → 최신 20-11-26이 현재 계약
//   "15년11월"처럼 일(日)이 없으면 1일로 본다.
// 반환: { date: 최신 계약일(ISO|null), history: 원문(여러 날짜·설명이 있을 때만) }
// 달력에 실제로 있는 날짜인지 — 원본에 "18년3월34일" 같은 오타가 있어 DB가 거부한다(2018-03-34).
const isRealDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m > 12 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

function parseContractCell(v) {
  const s = norm(v);
  if (!s) return { date: null, history: null };
  const dates = [];
  for (const m of s.matchAll(/(\d{2,4})\s*년\s*(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일?)?/g)) {
    const y = m[1].length === 2 ? `20${m[1]}` : m[1];
    dates.push(`${y}-${String(m[2]).padStart(2, "0")}-${String(m[3] ?? 1).padStart(2, "0")}`);
  }
  for (const m of s.matchAll(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/g)) dates.push(`${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`);
  // "20111213", "19850101 19880101"(공백으로 여러 개 나열)
  for (const m of s.matchAll(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/g)) dates.push(`${m[1]}-${m[2]}-${m[3]}`);
  const ok = dates.filter(isRealDate);                                 // 달력에 없는 날짜(3월 34일)는 버린다
  const date = ok.length ? ok.sort().at(-1) : null;                    // 최신 = 현재 유효한 계약
  const plain = ok.length === 1 && dates.length === 1 && /^[\d년월일.\s/-]+$/.test(s); // 날짜 하나에 설명 없으면 이력 아님
  return { date, history: plain ? null : s };
}

// 주요 포털 이메일 도메인 — 오탈자가 명백하므로 조용히 교정한다(확인 요청 없이).
// 실데이터에서 실제로 나온 것: "naver,com"(쉼표), "hanmaill.net"(중복 글자), "naver.com,"(끝 쉼표).
const PORTALS = ["naver.com", "hanmail.net", "daum.net", "gmail.com", "nate.com", "kakao.com", "hotmail.com", "yahoo.com", "yahoo.co.kr", "outlook.com", "icloud.com"];
const PORTAL_RE = new RegExp(`@(${PORTALS.map((d) => d.replace(/\./g, "\\.")).join("|")})$`, "i");
// 글자 하나 빠짐·중복·바뀜, 또는 이웃 글자 자리바꿈(gmial→gmail)이면 그 포털의 오타로 본다.
// 회사·기관 도메인(guil.co.kr, kpetro.or.kr)은 어느 포털과도 안 가까워 그대로 남는다.
function closePortal(dom) {
  const d = dom.toLowerCase();
  for (const p of PORTALS) {
    if (d === p) return p;
    if (Math.abs(d.length - p.length) > 1) continue;
    // 자리바꿈: 한 쌍만 서로 뒤집혀 있으면 오타로 본다
    if (d.length === p.length) {
      const diffIdx = [...d].map((ch, k) => (ch === p[k] ? -1 : k)).filter((k) => k >= 0);
      if (diffIdx.length === 2 && diffIdx[1] === diffIdx[0] + 1 && d[diffIdx[0]] === p[diffIdx[1]] && d[diffIdx[1]] === p[diffIdx[0]]) return p;
    }
    let i = 0, j = 0, diff = 0;
    while (i < d.length && j < p.length) {
      if (d[i] === p[j]) { i++; j++; continue; }
      if (++diff > 1) break;
      if (d.length > p.length) i++; else if (d.length < p.length) j++; else { i++; j++; }
    }
    if (diff + (d.length - i) + (p.length - j) <= 1) return p;
  }
  return null;
}
// "abc@naver,com" / "abc@hanmaill.net" / "abc@naver.com," → "abc@naver.com"
function fixEmail(e) {
  const cleaned = e.replace(/[.,;]+$/, "");                  // 끝의 문장부호
  const at = cleaned.lastIndexOf("@");
  if (at < 0) return cleaned;
  const local = cleaned.slice(0, at);
  const dom = cleaned.slice(at + 1).replace(/,/g, ".");      // "naver,com" → "naver.com"
  return `${local}@${closePortal(dom) ?? dom}`;
}

const toMoney = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && String(v).trim() !== "" ? n : null;
};

// 헤더 행에서 열 위치를 찾는다 — 열 순서가 바뀌어도 동작하게 이름으로 찾는다.
function headerMap(header) {
  const find = (...names) => header.findIndex((h) => names.some((n) => norm(h).replace(/\s/g, "").includes(n)));
  return {
    name: find("현장", "건물명"), owner: find("대표"), contractType: find("계약종류", "계약구분"),
    engineer: find("점검자", "담당기사"), unitCount: find("대수"), address: find("주소", "소재지"),
    contractDate: find("계약일"), model: find("기종", "모델"), kind: find("종류"),
    inspExpire: find("검사만료"), installYear: find("설치년도", "설치일자"), bizNo: find("사업자번호"),
    cost: find("금액", "보수료"), billMethod: find("청구방식"), overdue: find("장기미납"),
    payer: find("입금자"), email: find("이메일"), balance: find("미수잔액"),
    contact: find("연락처", "전화번호"), note: find("비고"),
  };
}

// 한 행을 검사해 { parsed, issues } 를 만든다. issues: {level:'red'|'yellow', msg}
function validateRow(raw, col, monthCols) {
  const issues = [];
  const get = (k) => (col[k] >= 0 ? norm(raw[col[k]]) : "");
  const parsed = {
    name: get("name"), owner: get("owner"), contractType: get("contractType"),
    engineer: get("engineer"), unitCount: get("unitCount"), address: get("address"),
    model: get("model"), billMethod: get("billMethod"), payer: get("payer"),
    email: get("email"), note: get("note"),
  };

  // 주소
  if (parsed.name && !parsed.address) issues.push({ level: "yellow", msg: "주소 없음" });

  // 점검자 = 담당기사. "정건의, 최병현"처럼 둘이 나눠 맡는 현장이 있어 목록으로 둔다.
  parsed.engineers = parsed.engineer ? parsed.engineer.split(/[,·/]/).map(norm).filter(Boolean) : [];

  // 연락처 — 자유 메모 셀: 전화 추출(앞말=역할 라벨) + 유형 추정 + 보안 메모 감지
  // 010=담당자(사람) 휴대폰 / 지역번호(02 등)=현장(건물) 유선일 확률이 높다 — 추정만 하고 확정은 사람이.
  const contact = get("contact");
  // 1차 수집(두 번 훑는다 — 같은 셀의 정식 유선 국번을 알아야 "2186-1849"가 내선인지 판단 가능)
  const rawPhones = [];
  for (const m of contact.matchAll(PHONE_RE)) {
    const before = contact.slice(0, m.index).replace(/[\s,./·:-]+$/, "");
    // 라벨: 괄호 안 숫자 포함("총무(301호)")도 통째로 잡는다
    const label = (/([가-힣A-Za-z]{0,10}\([가-힣A-Za-z0-9]{1,10}\)|[가-힣A-Za-z]{2,10})$/.exec(before) ?? [])[1] ?? "";
    rawPhones.push({ num: m[0], label, before });
  }
  const phones = rawPhones.map(({ num, label, before }) => {
    const digits = num.replace(/\D/g, "");
    const nearFax = /fax|팩스/i.test(before.slice(-8)) || /팩스|fax/i.test(label);
    const type = nearFax ? "팩스"
      : digits.startsWith("01") ? "담당자(휴대폰) 추정"
      : /^1[5-9]/.test(digits) ? "현장(대표번호) 추정"
      : digits.startsWith("0") ? "현장(유선) 추정"
      : "현장(유선·02생략) 추정"; // 0 없는 3-4·4-4자리 전부 — 현장 확인 결과 02 생략 유선 관행으로 확정 (2026-07-30)
    return { num, label, disp: labelInfo(label), parts: labelParts(label), type };
  });
  parsed.phones = phones;
  parsed.contactMemo = contact;
  // 출입 정보(공동현관 비번·기계실 열쇠 위치) — 760곳 중 390곳에 있는 핵심 운영 정보.
  // 연락처 메모에서 이 부분만 뽑아 전용 칸(sites.access_info)으로 보낸다.
  // 문장 단위(공백 2칸 이상·쉼표·슬래시로 나뉨)로 잘라 관련 조각만 모은다.
  // "담당자 010-… 현관비번 - 종6060"처럼 한 덩어리에 전화와 섞여 있으므로, 출입 키워드가
  // 나오는 지점부터 잘라내고 앞쪽(사람·전화)은 버린다.
  const ACCESS_KW = /(공동현관|현관|기계실|옥상|경비실|비밀번호|비번|열쇠|열쇄|번호키|도어락|자물쇠)/;
  const accessParts = contact
    .split(/\s{2,}|\s*[/,]\s*/)
    .map(norm)
    .filter(Boolean)
    .map((p) => {
      const m = ACCESS_KW.exec(p);
      if (!m) return null;
      const seg = p.slice(m.index).trim();          // 키워드부터 끝까지
      return /비밀번호|비번|열쇠|열쇄|번호키|도어락|자물쇠|\d/.test(seg) ? seg : null; // 값이 있는 것만
    })
    .filter(Boolean);
  parsed.accessInfo = [...new Set(accessParts)].join(" / ") || null;

  // 사업자번호 — 주민번호가 섞여 있는 열. 개인과의 계약은 사업 특성상 있을 수 있으므로 막지 않고
  // 자동 마스킹(뒤 6자리)해서만 다룬다 — 원본 주민번호는 이 도구 어디에도 저장·출력되지 않는다.
  let biz = get("bizNo");
  if (/^[-–—.\s]*$/.test(biz)) biz = "";                                   // "-" 같은 자리표시는 빈 값으로
  if (/^\d{10}$/.test(biz)) biz = `${biz.slice(0, 3)}-${biz.slice(3, 5)}-${biz.slice(5)}`; // 하이픈 없는 10자리 자동 정규화
  // 이 열은 입금 방식 겸용이었다 — 은행명·CMS·지로·현금영수증은 형식 오류가 아니라 입금 메모 → 비고로 보낸다
  if (/은행|농협|새마을|신협|수협|씨티|CMS|지로|현금영수증|카드/i.test(biz)) { parsed.bizMemo = biz; biz = ""; }
  if (/^\d{6}-\d{7}$/.test(biz)) {
    parsed.bizNo = biz.replace(/^(\d{6}-\d)\d{6}$/, "$1******");
    issues.push({ level: "yellow", msg: `주민등록번호 감지 — 개인 계약으로 보임. 자동 마스킹(${parsed.bizNo})으로만 보관·출력` });
  } else {
    parsed.bizNo = biz;
    if (biz && !/^\d{3}-\d{2}-\d{5}$/.test(biz)) issues.push({ level: "yellow", msg: `사업자번호 형식 이상: "${biz}"` });
  }

  // 계약일 — 실제로는 계약 이력 메모장. 최신 날짜를 계약일로 쓰고, 이력 원문은 비고로 보존한다.
  const cd = get("contractDate");
  const contract = parseContractCell(cd);
  parsed.contractDate = contract.date;
  parsed.contractHistory = contract.history;
  if (cd && !contract.date) issues.push({ level: "yellow", msg: `계약일에서 날짜를 못 찾음: "${cd.slice(0, 30)}"` });

  // 검사만료 "3. 28" — 연도 없음 (key: 파일 전체 공통이면 파일 공지로 승격)
  const ie = get("inspExpire");
  parsed.inspExpire = ie;
  if (ie && !/\d{4}/.test(ie)) issues.push({ level: "yellow", key: "insp-no-year", msg: `검사만료에 연도 없음("${ie}") — 센터 데이터로 보완 필요` });

  // 설치년도 — "20111213" 외에 "2003.07.01"(점 표기), "최초설치 1991.06.01 / 설치 2020.12.21"(이력),
  // "19850101 19880101"(두 개 나열)이 섞여 있다. 계약일과 같은 방식으로 최신 날짜를 취한다.
  const iy = get("installYear");
  const inst = parseContractCell(iy);
  parsed.installDate = inst.date ?? (parseKoreanDate(iy) && isRealDate(parseKoreanDate(iy)) ? parseKoreanDate(iy) : null);
  parsed.installHistory = inst.history && inst.date ? inst.history : null;
  if (iy && !parsed.installDate) issues.push({ level: "yellow", msg: `설치년도에서 날짜를 못 찾음: "${iy}"` });

  // 승강기 종류 다중값 ("전망용,   장애/침대용")
  const kind = get("kind");
  parsed.kinds = kind ? kind.split(/[,·]/).map(norm).filter(Boolean) : [];

  // 금액·미수잔액
  const cost = get("cost");
  parsed.cost = toMoney(cost);
  if (cost && parsed.cost == null) issues.push({ level: "yellow", msg: `보수료가 숫자가 아님: "${cost}"` });
  const bal = get("balance");
  parsed.balance = toMoney(bal);
  if (bal && parsed.balance == null) issues.push({ level: "yellow", msg: `미수잔액이 숫자가 아님: "${bal}"` });

  // 월별 수금 열 — 값이 있는 달 수만 집계 (상세 검증은 반영 단계에서)
  parsed.paidMonths = monthCols.filter((c) => norm(raw[c.idx])).length;

  // 이메일 열은 실제로 "청구서 보내는 방법" 칸이었다 — 주소 여러 개(세금계산서용/대표용)와
  // 용도 메모("우편발송", "청구서 보내지 말것")가 섞여 있다.
  // 대표 주소 1개만 sites.email로 쓰고, 나머지 주소·메모는 비고로 보낸다. 오타(,com)는 자동 교정.
  const emailRaw = parsed.email;
  const EMAIL_RE = /[\w.+-]+@[\w-]+[.,][\w.,-]+/g;
  const rawFound = emailRaw.match(EMAIL_RE) ?? [];
  const fixed = rawFound.map(fixEmail);
  const okIdx = fixed.findIndex((e) => /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(e));
  const valid = fixed.filter((e) => /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(e));
  parsed.email = valid[0] ?? "";
  // 대표 주소를 뺀 나머지(추가 주소 + 설명 메모)를 비고용 메모로 — 교정 전 원문을 지워야 중복이 안 남는다
  let emailMemo = emailRaw;
  if (okIdx >= 0) emailMemo = emailMemo.replace(rawFound[okIdx], "").trim();
  emailMemo = norm(emailMemo).replace(/^[\/,·-]+|[\/,·-]+$/g, "").trim();
  parsed.emailMemo = emailMemo || null;
  if (emailRaw && !valid.length) {
    // 이메일이 아예 없는 칸 = 발송 방법 메모(우편·카톡·보내지 말것) — 이슈 아님, 비고로 보낸다
    parsed.emailMemo = norm(emailRaw);
  }
  // 주요 포털 오탈자는 명백해서 조용히 교정한다(노랑 안 띄움). 그 외 도메인 교정만 확인 요청.
  if (okIdx >= 0 && rawFound[okIdx] !== valid[0] && !PORTAL_RE.test(valid[0])) {
    issues.push({ level: "yellow", msg: `이메일 오타 자동교정: "${rawFound[okIdx]}" → "${valid[0]}" — 확인해주세요` });
  }

  return { parsed, issues };
}

// 인증(검토완료)·수동연결을 브라우저에 저장 — 파일을 다시 올려도 같은 현장(이름+주소)이면 마크가 유지된다.
const MARKS_KEY = "guilVerifyMarksV1";
const rowKeyOf = (r) => `${nameKey(r.parsed.name) || "row" + r.excelRow}|${norm(r.parsed.address)}`;
const loadMarks = () => { try { return JSON.parse(localStorage.getItem(MARKS_KEY) || "{}"); } catch { return {}; } };
const persistMark = (r, mutate) => {
  try {
    const s = loadMarks();
    const k = rowKeyOf(r);
    const obj = s[k] ?? {};
    mutate(obj);
    if (!obj.reviewed && !obj.link) delete s[k]; else s[k] = obj;
    localStorage.setItem(MARKS_KEY, JSON.stringify(s));
  } catch { /* 저장 실패해도 화면 동작엔 지장 없음 */ }
};

export default function VerifyImport({ data, setData, onClose }) {
  const [rows, setRows] = useState(null);        // [{idx, raw, parsed, issues, contIdx}]
  const [links, setLinks] = useState({});         // 수동 매칭: 행 idx → { siteId, siteName }
  // 대조 상대 = 이미 등록된 DB 현장(센터 엑셀로 일괄등록된 것) — 이름 본명+괄호 별칭 전부 키로
  const dbSites = useMemo(() => (data?.sites ?? []).filter((s) => s.name).map((s) => ({
    id: s.id, name: s.name, keys: nameKeys(s.name), loose: looseKeys(s.name, s.address), dong: dongOf(s.address), road: roadOf(s.address),
  })), [data]);
  const dbKeys = useMemo(() => new Set(dbSites.flatMap((s) => s.keys)), [dbSites]);
  // 호기 힌트 — 센터 데이터(units)의 설치일·모델이 내부 엑셀과 일치하면 같은 현장일 확률이 높다
  const unitsBySite = useMemo(() => {
    const m = new Map();
    for (const u of data?.units ?? []) {
      const e = m.get(u.siteId) ?? { dates: new Set(), models: new Set() };
      if (u.installDate) e.dates.add(String(u.installDate).slice(0, 10));
      if (u.model) e.models.add(nameKey(u.model));
      m.set(u.siteId, e);
    }
    return m;
  }, [data]);
  // 자동 매칭 실패 행에 보여줄 후보 — 이름 유사도 + 법정동·설치일·모델 일치 가산점, 상위 3곳
  function candidatesFor(r, fallbackName = "") {
    const myKeys = looseKeys(r.parsed.name || fallbackName, r.parsed.address); // 후보 탐색은 느슨한 키(유형어·동 표기·주소 조각 제거 포함)로
    const myDong = dongOf(r.parsed.address);
    const myDate = r.parsed.installDate;
    const myModel = r.parsed.model ? nameKey(r.parsed.model) : "";
    return dbSites
      .map((s) => {
        let score = Math.max(...myKeys.flatMap((a) => s.loose.map((b) => nameSimilarity(a, b))), 0);
        const tags = [];
        // 유형어를 벗기면 같은 이름(더해피하우스 ↔ 더해피) — 강한 신호로 본다
        if (myKeys.some((a) => a.length >= 3 && s.loose.includes(a))) { score = Math.max(score, 0.8); tags.push("이름 핵심 일치"); }
        // 한쪽 이름이 다른 쪽을 포함하면(국방부 ⊂ 국방부본부) 강한 신호
        else if (myKeys.some((a) => s.loose.some((b) => a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))))) { score = Math.max(score, 0.75); tags.push("이름 포함"); }
        if (myDong && s.dong && myDong === s.dong) { score += 0.25; tags.push("법정동 일치"); } // 구주소·신주소가 달라도 법정동은 같다
        const myRoad = roadOf(r.parsed.address);
        // 도로명+번지가 정확히 같으면 사실상 같은 건물 — 이름이 아예 달라도(COSTORY TOWER↔ABT타워) 후보에 확실히 올린다
        if (myRoad && s.road && myRoad === s.road) { score = Math.max(score + 0.25, 0.65); tags.push("주소 일치"); }
        const u = unitsBySite.get(s.id);
        if (u && myDate && u.dates.has(myDate)) { score += 0.2; tags.push("설치일 일치"); }
        if (u && myModel && u.models.has(myModel)) { score += 0.15; tags.push("모델 일치"); }
        return { ...s, score: Math.min(score, 1), tags }; // 가산점이 겹쳐도 100%를 넘기지 않게
      })
      .filter((s) => s.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }
  // 이름이 전혀 달라 후보가 없을 때(예: 경찰기마대 ↔ 74기동대) — 주소로 후보를 찾는다.
  // 도로명+번지가 같은 곳을 먼저, 없으면 같은 법정동 현장을.
  function sameDongFallback(r) {
    const myRoad = roadOf(r.parsed.address);
    const roadHits = myRoad ? dbSites.filter((s) => s.road === myRoad) : [];
    if (roadHits.length) return roadHits.slice(0, 3).map((s) => ({ ...s, score: 0, tags: ["주소 일치"] }));
    const myDong = dongOf(r.parsed.address);
    if (!myDong) return [];
    return dbSites.filter((s) => s.dong === myDong).slice(0, 5).map((s) => ({ ...s, score: 0, tags: ["같은 동"] }));
  }
  const [filter, setFilter] = useState("problem");
  const [fileNotices, setFileNotices] = useState([]); // 파일 전체 공통 형식 문제 (행 목록에서 승격)
  const [openIdx, setOpenIdx] = useState(null);
  const [reviewed, setReviewed] = useState({});   // idx → true
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // DB 반영 진행률 { done, total }
  const [linkQuery, setLinkQuery] = useState(""); // 수동 연결용 현장 검색어
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoProg, setGeoProg] = useState(null);   // 좌표 대조 진행 { done, total }
  const [geoResults, setGeoResults] = useState({}); // idx → { siteId, siteName, dist } (근처 후보, 자동 연결엔 못 미친 것)

  // 시트 값 + "병합으로 묶인 행 덩어리" 정보를 함께 읽는다.
  //
  // 이 파일은 한 계약 단위를 여러 행으로 쓰면서 계약일·대표 같은 열만 병합하고
  // 정작 현장명 열은 병합하지 않은 경우가 있다(예: 23~25행이 한 덩어리인데 이름은 24행에만).
  // 그래서 "현장명이 비면 윗 행의 연속"이라고 보면 틀린다 — 어느 열이든 병합된 범위를
  // 한 덩어리로 보고, 그 덩어리 안에 있는 이름을 그 덩어리 전체의 이름으로 쓴다.
  async function readSheet(file) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer());
    const ws = wb.Sheets[wb.SheetNames[0]];
    const values = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const groupOf = new Map(); // 0-based 시트 행 → 덩어리 시작 행
    for (const m of ws["!merges"] ?? []) {
      if (m.e.r === m.s.r) continue; // 세로 병합만 의미 있음
      for (let r = m.s.r; r <= m.e.r; r++) {
        const cur = groupOf.get(r);
        if (cur == null || m.s.r < cur) groupOf.set(r, m.s.r); // 가장 위에서 시작하는 덩어리 기준
      }
    }
    return { values, groupOf };
  }

  // ① 내부(정리 안 된) 엑셀
  async function pickInternal(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 골라도 onChange가 울리게 리셋 — 안 하면 두 번째 업로드가 조용히 무시된다
    if (!file) return;
    setBusy(true);
    try {
      const { values: all, groupOf } = await readSheet(file);
      const header = all[0] ?? [];
      const col = headerMap(header);
      if (col.name < 0) throw new Error("헤더에서 '현장(건물명)' 열을 못 찾았습니다 — 1행이 제목 행인지 확인");
      // 병합 덩어리별 대표 이름 — 덩어리 안 아무 행에나 적힌 현장명을 그 덩어리 전체의 이름으로 본다
      const groupName = new Map();
      all.forEach((raw, i) => {
        const start = groupOf.get(i);
        const nm = col.name >= 0 ? norm(raw[col.name]) : "";
        if (start != null && nm && !groupName.has(start)) groupName.set(start, nm);
      });
      // 월별 수금 열: "25년7월" ~ "8월" 같은 열들
      const monthCols = header.map((h, idx) => ({ h: norm(h), idx })).filter((c) => /^(\d{2}년)?\d{1,2}월$/.test(c.h.replace(/\s/g, "")));
      const out = [];
      let lastNamed = -1;
      all.slice(1).forEach((raw, i) => {
        if (!raw.some((c) => norm(c))) return; // 완전 빈 행 스킵
        const { parsed, issues } = validateRow(raw, col, monthCols);
        const idx = out.length;
        // 현장명이 비었을 때: 같은 병합 덩어리에 이름이 있으면 그 이름을 쓴다(공군항공안전단처럼
        // 이름 열만 병합을 안 한 경우). 덩어리가 없으면 이름을 안 적은 별개 현장으로 본다.
        let contIdx = null;
        if (!parsed.name) {
          // 승강기가 2대인 현장은 2호기 제원(기종·종류·검사만료)만 다음 줄에 적는다 — 현장 정보가
          // 아니라 호기 정보라서 검증 대상이 아니다. 주소·연락처·금액이 하나도 없으면 그런 행으로 본다.
          const hasSiteInfo = [parsed.address, parsed.contactMemo, parsed.email, parsed.owner, parsed.engineer, parsed.contractType, parsed.note].some((v) => norm(v))
            || parsed.cost != null || parsed.contractDate != null || parsed.balance != null;
          if (!hasSiteInfo) return; // 목록에서 제외
          const gname = groupName.get(groupOf.get(i + 1));
          if (gname) {
            parsed.groupName = gname;
            issues.unshift({ level: "yellow", msg: `현장명 칸이 비어 있음 — 같은 병합 묶음의 "${gname}" 건으로 해석` });
          } else {
            issues.unshift({ level: "yellow", msg: "현장명이 비어 있음 — 이름을 적거나, 아래 후보에서 DB 현장을 연결해주세요" });
          }
        } else lastNamed = idx;
        out.push({ idx, excelRow: i + 2, raw, parsed, issues, contIdx });
      });
      // 같은 종류(key) 문제가 전체의 40%를 넘으면 "행마다"가 아니라 "파일 전체의 형식 문제" —
      // 행 목록에서 빼고 파일 공지 하나로 승격한다 (안 그러면 노랑 수백 개가 소음이 됨).
      const keyCount = {};
      out.forEach((r) => r.issues.forEach((x) => { if (x.key) keyCount[x.key] = (keyCount[x.key] ?? 0) + 1; }));
      const fileLevel = Object.entries(keyCount).filter(([, n]) => n > out.length * 0.4).map(([k]) => k);
      const notices = [];
      if (fileLevel.length) {
        out.forEach((r) => { r.issues = r.issues.filter((x) => !fileLevel.includes(x.key)); });
        fileLevel.forEach((k) => {
          const n = keyCount[k];
          if (k === "insp-no-year") notices.push(`검사만료 열이 연도 없는 형식(예: "3. 28") — ${n}행 전체 공통. 센터 데이터로 보완 필요`);
        });
      }
      setFileNotices(notices);
      setRows(out);
      // 저장된 인증·연결 마크 복원 (같은 현장명+주소 기준)
      const stored = loadMarks();
      const rv = {}, lk = {};
      out.forEach((r) => {
        const m = stored[rowKeyOf(r)];
        if (m?.reviewed) rv[r.idx] = true;
        if (m?.link) lk[r.idx] = m.link;
      });
      // 고신뢰 자동 연결 — "누가 봐도 첫 번째" 케이스는 클릭 없이 연결한다:
      // 합산 점수(이름 유사+법정동·설치일·모델) 0.8 이상 + 2위와 0.1 이상 차이. 해제 가능, 브라우저 저장은 안 함(매번 재계산).
      out.forEach((r) => {
        if (lk[r.idx] || !r.parsed.name) return;
        if (nameKeys(r.parsed.name).some((k) => dbKeys.has(k))) return; // 이름으로 이미 매칭
        const cands = candidatesFor(r);
        if (cands.length && cands[0].score >= 0.8 && (cands.length === 1 || cands[0].score - cands[1].score >= 0.1)) {
          lk[r.idx] = { siteId: cands[0].id, siteName: cands[0].name, auto: true, score: cands[0].score };
        }
      });
      setReviewed(rv);
      setLinks(lk);
      setOpenIdx(null);
    } catch (err) {
      alert("파일을 읽지 못했습니다: " + err.message);
    }
    setBusy(false);
  }

  // DB 대조 결과를 이슈에 합친 최종 행 목록 — 별칭 포함 자동 매칭 + 수동 연결 반영
  const finalRows = useMemo(() => {
    if (!rows) return null;
    return rows.map((r) => {
      const issues = [...r.issues];
      // 이름이 같은 현장이 여러 곳일 수 있다("삼성아파트" 사당동·삼전동) — 이름으로 걸리는 DB 현장을
      // 다 모아, 2곳 이상이면 법정동으로 좁힌다. 그래도 못 좁히면 통과로 보지 않고 사람이 고르게 한다.
      // 이름이 없으면 주소 끝 건물 별칭("… 385-1 태성대아파트")을 이름 대신 써서 매칭을 시도한다
      // 이름 우선순위: 적힌 이름 → 같은 병합 묶음의 이름 → 주소 끝 건물 별칭
      const effName = r.parsed.name || r.parsed.groupName || buildingHintOf(r.parsed.address) || "";
      const myKeys = effName ? nameKeys(effName) : [];
      const myDong = dongOf(r.parsed.address);
      // 엄격 키 + 느슨한 키(유형어·동 표기·주소 접두어 제거)를 함께 모은다 — 이름이 비슷한 DB 현장이
      // 둘 이상일 수 있어(더나은 하우스 vs 더해피하우스 / 삼성아파트 vs 사당동삼성아파트),
      // 한쪽만 보고 먼저 걸린 곳을 택하면 엉뚱한 현장에 붙는다. 아래에서 법정동으로 고른다.
      const strictHits = myKeys.length ? dbSites.filter((s) => s.keys.some((k) => myKeys.includes(k))) : [];
      const myLoose = effName ? looseKeys(effName, r.parsed.address).filter((k) => k.length >= 3) : [];
      const looseHits = myLoose.length ? dbSites.filter((s) => s.loose.some((k) => k.length >= 3 && myLoose.includes(k))) : [];
      const hits = [...new Map([...strictHits, ...looseHits].map((s) => [s.id, s])).values()];
      // 후보 좁히기: 도로명+번지가 같은 곳 → 법정동이 같은 곳 순으로.
      // 병합 묶음(공군항공안전단 3행)은 이름이 같아도 행마다 주소가 달라 서로 다른 현장이므로
      // 주소로 갈라야 태성대아파트·디모데관 데이터가 엉뚱한 현장에 덮이지 않는다.
      const myRoadKey = roadOf(r.parsed.address);
      const sameRoad = myRoadKey ? hits.filter((s) => s.road === myRoadKey) : [];
      const sameDong = myDong ? hits.filter((s) => s.dong === myDong) : [];
      // 같은 단지의 A동/B동은 주소·좌표가 같아 주소로 못 가른다 — 이름 끝 동 표기로 정확히 맞춘다
      const myUnitTag = unitTagOf(effName);
      const sameUnit = myUnitTag ? hits.filter((s) => unitTagOf(s.name) === myUnitTag) : [];
      const narrowed = hits.length > 1
        ? (sameUnit.length ? sameUnit : sameRoad.length ? sameRoad : sameDong.length ? sameDong : hits)
        : hits;
      // 이름을 빌려온 행(병합 묶음·주소 힌트)은 주소로 확정되지 않으면 자동 매칭하지 않는다
      const borrowedName = !r.parsed.name;
      const autoMatched = narrowed.length === 1 && (!borrowedName || sameRoad.length === 1);
      if (hits.length > 1 && narrowed.length !== 1) {
        issues.push({ level: "yellow", msg: `이름이 같은 DB 현장이 ${hits.length}곳 — 아래 후보에서 맞는 곳을 골라주세요` });
      } else if (borrowedName && narrowed.length === 1 && !autoMatched) {
        issues.push({ level: "yellow", msg: `현장명이 비어 "${effName}"으로 추정 — 주소가 다르니 아래 후보에서 맞는 현장을 확인해주세요` });
      }
      if (dbKeys.size && r.parsed.name && !autoMatched && !links[r.idx] && hits.length === 0) {
        issues.push({ level: "yellow", msg: "등록된 현장(DB)에 없는 이름 — 아래 후보에서 연결하거나 미등록·해지인지 확인" });
      }
      const level = issues.some((x) => x.level === "red") ? "red" : issues.length ? "yellow" : "green";
      // hitIds = 이름으로 걸린 DB 현장 전부(동명이현장 포함) — "DB에만 있는 현장" 집계에 쓴다.
      // matchedSiteId는 유일하게 좁혀졌을 때만(데이터 반영은 확실할 때만 해야 하므로).
      return { ...r, issues, level, autoMatched, matchedSiteId: autoMatched ? narrowed[0].id : null, hitIds: hits.map((s) => s.id) };
    });
  }, [rows, dbKeys, dbSites, links]);

  const counts = useMemo(() => {
    if (!finalRows) return null;
    const c = { red: 0, yellow: 0, green: 0, reviewed: 0 };
    finalRows.forEach((r) => { c[r.level]++; if (reviewed[r.idx]) c.reviewed++; });
    return c;
  }, [finalRows, reviewed]);

  const visible = (finalRows ?? []).filter((r) =>
    filter === "all" ? true
    // "남은 문제"에서도 지금 열어 둔 행은 남긴다 — 인증완료를 누른 순간 화면에서 사라져
    // 무슨 일이 일어났는지 모르게 되는 걸 막는다(닫거나 다른 행을 열면 그때 목록에서 빠진다).
    : filter === "problem" ? (r.level !== "green" && !reviewed[r.idx]) || r.idx === openIdx
    : filter === "reviewed" ? reviewed[r.idx]
    : r.level === filter
  );

  // ④ 정리본 다운로드 — 해석값 + 남은 문제를 열로 붙여서

  // ── DB 빈칸 채우기 계획 ──────────────────────────────────────────
  // 대상: 빨강 아님 + (통과 or 검토완료) + DB 현장과 매칭(자동/수동)된 행.
  // 그 현장의 "비어 있는" 칸만 채운다 — 이미 값 있는 칸은 절대 덮지 않는다.
  // 반영 대상 현장 = 수동/자동 연결 우선, 없으면 이름으로 유일하게 좁혀진 현장(matchedSiteId)
  const matchedSiteIdOf = (r) => links[r.idx]?.siteId ?? r.matchedSiteId ?? null;

  // DB에만 있고 내부 엑셀엔 없는 현장 — "실제로 어느 현장에 붙었나"(matchedSiteId·수동연결)로 판정해야
  // 유형어·동 표기·주소 접두어 규칙으로 잡힌 것들이 목록에서 제대로 빠진다.
  const refOnly = useMemo(() => {
    if (!finalRows || !dbSites.length) return [];
    // 이름으로 걸린 현장(hitIds)까지 "엑셀에 있는 것"으로 본다 — 노랑이라 반영 대상이 아니어도 누락은 아니므로
    const used = new Set(finalRows.flatMap((r) => [matchedSiteIdOf(r), ...(r.hitIds ?? [])]).filter(Boolean));
    // 같은 단지의 형제 동도 다룬 것으로 본다 — 엑셀 1행("예촌아파트")이 DB의 A·B·C동을 함께 가리키는 경우.
    // 동 표기를 뗀 키가 같고 법정동도 같으면 형제로 간주.
    const usedSites = dbSites.filter((s) => used.has(s.id));
    const isSibling = (s) => usedSites.some((u) => u.dong === s.dong && (stripDongKey(nameKey(u.name)) ?? nameKey(u.name)) === (stripDongKey(nameKey(s.name)) ?? nameKey(s.name)));
    return dbSites.filter((s) => !used.has(s.id) && !isSibling(s)).map((s) => s.name);
  }, [finalRows, dbSites, links]);
  const FILL_FIELDS = [
    ["phone", "전화(현장 유선)", (p) => (p.phones.find((x) => x.type === "현장(유선) 추정") ?? p.phones.find((x) => x.type === "현장(대표번호) 추정") ?? p.phones.find((x) => x.type.startsWith("현장")))?.num ?? null],
    ["fax", "팩스", (p) => p.phones.find((x) => x.type === "팩스")?.num ?? null],
    ["email", "이메일", (p) => (/^\S+@\S+\.\S+$/.test(p.email) ? p.email : null)],
    ["maintenance_cost", "보수료", (p) => p.cost],
    ["contract_date", "계약일", (p) => p.contractDate],
    ["contract_type", "계약종류", (p) => p.contractType || null],
    // 연락처 원본 메모(담당자 라벨·출입 비번·열쇠 위치 등) → 비어 있는 현장 비고로.
    // 기사 앱 현장정보의 "비고(전달사항)"에 그대로 보인다 — 현장 가서 문 열 때 필요한 정보.
    ["notes", "비고(연락처·입금·계약이력·청구)", (p) => [p.contactMemo, p.bizMemo && `입금: ${p.bizMemo}`, p.contractHistory && `계약이력: ${p.contractHistory}`, p.installHistory && `설치이력: ${p.installHistory}`, p.emailMemo && `청구/메일: ${p.emailMemo}`].filter(Boolean).join("\n") || null],
    // 출입 정보는 기사가 현장에서 바로 쓰는 정보 — 비고에 묻히지 않게 전용 칸으로 (085 미실행이면 자동 스킵)
    ["access_info", "출입정보(비번·열쇠)", (p) => p.accessInfo],
  ];
  const fillPlan = useMemo(() => {
    if (!finalRows) return [];
    const siteById = new Map((data?.sites ?? []).map((s) => [s.id, s]));
    const camel = { phone: "phone", fax: "fax", email: "email", maintenance_cost: "maintenanceCost", contract_date: "contractDate", contract_type: "contractType", notes: "notes", access_info: "accessInfo" };
    const accessReady = (data?.sites ?? []).some((s) => s.accessInfo !== undefined); // 085 실행 여부
    const bySite = new Map();
    for (const r of finalRows) {
      if (r.level === "red") continue;
      if (r.level !== "green" && !reviewed[r.idx]) continue;
      const siteId = matchedSiteIdOf(r);
      const site = siteId ? siteById.get(siteId) : null;
      if (!site) continue;
      const entry = bySite.get(siteId) ?? { siteId, siteName: site.name, patch: {}, labels: [] };
      for (const [col, label, pick] of FILL_FIELDS) {
        if (col === "access_info" && !accessReady) continue; // 085 마이그 전이면 건너뜀
        const cur = site[camel[col]];
        const val = pick(r.parsed);
        if ((cur == null || cur === "") && val != null && val !== "" && entry.patch[col] === undefined) {
          entry.patch[col] = val;
          entry.labels.push(label);
        }
      }
      if (entry.labels.length) bySite.set(siteId, entry);
    }
    return [...bySite.values()];
  }, [finalRows, reviewed, links, data]);

  // 검증 상태 스냅샷 — 매칭된 현장마다: 띠 색(그 현장 행들 중 최악 레벨) + 인증 여부(전 행이 통과·인증완료).
  // sites.verify_level 컬럼이 아직 없으면(마이그 083 전) 건너뛴다.
  const verifyReady = useMemo(() => (data?.sites ?? []).some((s) => s.verifyLevel !== undefined), [data]);
  const statusPlan = useMemo(() => {
    if (!finalRows || !verifyReady) return [];
    const worst = { red: 3, yellow: 2, green: 1 };
    const issuesReady = (data?.sites ?? []).some((s) => s.verifyIssues !== undefined); // 084 실행 여부
    const bySite = new Map();
    for (const r of finalRows) {
      const siteId = matchedSiteIdOf(r);
      if (!siteId) continue;
      const e = bySite.get(siteId) ?? { siteId, level: "green", allOk: true, issues: [] };
      if (worst[r.level] > worst[e.level]) e.level = r.level;
      if (r.level !== "green" && !reviewed[r.idx]) e.allOk = false;
      if (r.level === "red") e.allOk = false;
      if (issuesReady) e.issues = [...new Set([...e.issues, ...r.issues.map((x) => x.msg)])].slice(0, 12);
      bySite.set(siteId, e);
    }
    return [...bySite.values()].map((e) => ({ ...e, issuesReady }));
  }, [finalRows, verifyReady, reviewed, links, data]);

  // 담당기사(점검자) 자동 배정 계획 — 엑셀의 "점검자"가 곧 담당기사다.
  // 현장의 담당기사가 비어 있을 때만 채운다(기존 배정은 안 덮음). 이름이 기사 명단에 있어야 하고,
  // 공동 담당("정건의, 최병현")이면 첫 번째를 대표 담당으로 둔다.
  const engineersByName = useMemo(() => {
    const m = new Map();
    for (const p of data?.profiles ?? []) {
      if (p.role === "engineer" && p.is_active !== false && p.name) m.set(nameKey(p.name), p);
    }
    return m;
  }, [data]);
  const techPlan = useMemo(() => {
    if (!finalRows) return [];
    const siteById = new Map((data?.sites ?? []).map((s) => [s.id, s]));
    const out = new Map();
    for (const r of finalRows) {
      if (r.level === "red") continue;
      if (r.level !== "green" && !reviewed[r.idx]) continue;
      const siteId = matchedSiteIdOf(r);
      const site = siteId ? siteById.get(siteId) : null;
      if (!site || site.assignedEngineer || out.has(siteId)) continue; // 이미 배정됐으면 건너뜀
      const tech = r.parsed.engineers.map((n) => engineersByName.get(nameKey(n))).find(Boolean);
      if (tech) out.set(siteId, { siteId, siteName: site.name, techId: tech.id, techName: tech.name });
    }
    return [...out.values()];
  }, [finalRows, reviewed, links, data, engineersByName]);

  // 현장 담당자 자동 추가 계획 — 추출한 사람(이름·직함 라벨 있는 휴대폰)을 매칭 현장의 담당자로.
  // 직함사전→역할 드롭다운(대표/담당자/관리소장/건물주/경비실/입주민 대표/총무/기타) 매핑, 같은 번호가 이미 있으면 스킵.
  const managersPlan = useMemo(() => {
    if (!finalRows) return [];
    const existing = new Set((data?.siteManagers ?? []).map((m) => `${m.siteId}|${String(m.phone ?? "").replace(/\D/g, "")}`));
    const out = [];
    for (const r of finalRows) {
      if (r.level === "red") continue;
      if (r.level !== "green" && !reviewed[r.idx]) continue;
      const siteId = matchedSiteIdOf(r);
      if (!siteId) continue;
      for (const p of r.parsed.phones) {
        if (!p.type.startsWith("담당자") || !p.label) continue; // 라벨 없는 번호는 누군지 몰라 안 만든다
        const key = `${siteId}|${p.num.replace(/\D/g, "")}`;
        if (existing.has(key)) continue;
        existing.add(key);
        const parenName = /^[가-힣]{2,4}$/.test(p.parts.paren) ? p.parts.paren : ""; // "소장님(방효순)"의 방효순
        out.push({
          siteId,
          name: p.parts.name || parenName || p.parts.role || p.label,
          phone: p.num,
          role: ROLE_MAP[p.parts.role] ?? "기타",
        });
      }
    }
    return out;
  }, [finalRows, reviewed, links, data]);

  // 최후의 매칭 수단 — 미매칭 행의 주소를 티맵으로 지오코딩해 DB 현장 좌표와 거리 비교.
  // 이름이 아무리 달라도(경찰기마대↔74기동대) 좌표가 60m 이내면 같은 건물로 보고 자동 연결한다.
  // ④ 정리본 다운로드 — 해석값 + "어느 DB 현장에 붙었는지"(매칭 결과·근거·채울 항목)까지 담는다.
  //   fillPlan/statusPlan 뒤에 두어야 채울 항목을 함께 쓸 수 있다.
  async function downloadClean() {
    const XLSX = await import("xlsx");
    const siteById = new Map((data?.sites ?? []).map((s) => [s.id, s]));
    const fillBySite = new Map(fillPlan.map((p) => [p.siteId, p.labels.join(", ")]));
    const techBySite = new Map(techPlan.map((t) => [t.siteId, t.techName]));
    const mgrCount = new Map();
    managersPlan.forEach((m) => mgrCount.set(m.siteId, (mgrCount.get(m.siteId) ?? 0) + 1));

    const header = [
      "원본행", "상태", "검토", "현장명", "묶음소속", "주소", "점검자", "대수",
      "매칭 현장(DB)", "매칭 주소(DB)", "매칭 방법", "채울 항목", "배정할 기사", "추가할 담당자수",
      "계약종류", "계약일(해석)", "보수료", "미수잔액", "수금기록달수",
      "전화(추출)", "이메일(대표)", "청구/메일 메모", "출입정보", "사업자번호", "승강기종류", "설치일(해석)", "남은 문제",
    ];
    const body = finalRows.map((r) => {
      const sid = matchedSiteIdOf(r);
      const site = sid ? siteById.get(sid) : null;
      const how = links[r.idx]
        ? (links[r.idx].auto ? (links[r.idx].geo != null ? `자동(좌표 ${links[r.idx].geo}m)` : `자동(이름 ${Math.round(links[r.idx].score * 100)}%)`) : "수동 연결")
        : sid ? "이름·주소 자동" : (geoResults[r.idx] ? `후보만(좌표 ${geoResults[r.idx].dist}m)` : "미매칭");
      return [
        r.excelRow, r.level === "red" ? "빨강" : r.level === "yellow" ? "노랑" : "통과",
        reviewed[r.idx] ? "완료" : "",
        r.parsed.name, r.parsed.groupName ?? "",
        r.parsed.address, r.parsed.engineer, r.parsed.unitCount,
        site?.name ?? (geoResults[r.idx]?.siteName ? `(후보) ${geoResults[r.idx].siteName}` : ""),
        site?.address ?? "", how,
        sid ? (fillBySite.get(sid) ?? "채울 빈칸 없음") : "",
        sid ? (techBySite.get(sid) ?? "") : "",
        sid ? (mgrCount.get(sid) ?? 0) : "",
        r.parsed.contractType, r.parsed.contractDate ?? "", r.parsed.cost ?? "", r.parsed.balance ?? "", r.parsed.paidMonths,
        r.parsed.phones.map((p) => `${p.disp ? p.disp + " " : ""}${p.num}[${p.type.replace(" 추정", "")}]`).join(", "),
        r.parsed.email, r.parsed.emailMemo ?? "", r.parsed.accessInfo ?? "", r.parsed.bizNo, r.parsed.kinds.join(", "),
        r.parsed.installDate ?? "", r.issues.map((x) => x.msg).join(" / "),
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws["!cols"] = header.map((h) => ({ wch: /현장명|주소|채울 항목|전화|남은 문제|출입정보|메모/.test(h) ? 28 : 12 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "검증결과");
    // 두 번째 시트: DB에만 있고 엑셀엔 없는 현장 — 누락 점검용
    if (refOnly.length) {
      const ws2 = XLSX.utils.aoa_to_sheet([["엑셀에 없는 DB 현장"], ...refOnly.map((n) => [n])]);
      XLSX.utils.book_append_sheet(wb, ws2, "엑셀에 없는 현장");
    }
    XLSX.writeFile(wb, "검증결과_정리본.xlsx");
  }

  async function geoMatch() {
    const targets = (finalRows ?? []).filter((r) => !r.autoMatched && !links[r.idx] && r.parsed.address && (r.parsed.name || r.contIdx != null));
    if (!targets.length) { alert("좌표 대조할 미매칭 행이 없습니다"); return; }
    const sitesWithCoord = (data?.sites ?? []).filter((s) => s.lat && s.lng);
    if (!sitesWithCoord.length) { alert("DB 현장에 좌표가 없어 대조할 수 없습니다"); return; }
    setGeoBusy(true);
    const distM = (la, lo, lb, ln) => { // 하버사인(m)
      const R = 6371000, rad = Math.PI / 180;
      const h = Math.sin(((lb - la) * rad) / 2) ** 2 + Math.cos(la * rad) * Math.cos(lb * rad) * Math.sin(((ln - lo) * rad) / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    let auto = 0, cand = 0, fail = 0;
    let firstFailReason = null;
    const newLinks = {}, newGeo = {};
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i];
      setGeoProg({ done: i, total: targets.length });
      // 지오코딩용 주소 정리 — 우리 주소 체계엔 콤마가 없다. 콤마 뒤는 두 번째 번지("616-8,9")나
      // 건물 별칭(", 디모데관")이라 지오코딩을 실패시키므로 자른다. 괄호 부기·"외 N필지"도 같이 제거.
      let a = r.parsed.address.split(",")[0].replace(/\([^)]*\)/g, "").replace(/외\s*\d+\s*필지?/g, "").trim();
      // 내부 엑셀 주소는 시/도가 생략됨 — 구로 시작하면 서울, 시로 시작하면 그대로(티맵이 알아서 찾음)
      const addr = /^[가-힣]{1,4}구\s/.test(a) ? `서울특별시 ${a}` : a;
      try {
        const j = await fetch(`/api/geocode?addr=${encodeURIComponent(addr)}`).then((x) => x.json());
        if (!j.ok) { fail++; firstFailReason ??= j.reason; continue; }
        let best = null;
        for (const s of sitesWithCoord) { const d = distM(j.lat, j.lng, s.lat, s.lng); if (!best || d < best.d) best = { s, d }; }
        if (best && best.d <= 60) { newLinks[r.idx] = { siteId: best.s.id, siteName: best.s.name, auto: true, score: 0.99, geo: Math.round(best.d) }; auto++; }
        else if (best && best.d <= 250) { newGeo[r.idx] = { siteId: best.s.id, siteName: best.s.name, dist: Math.round(best.d) }; cand++; }
        else fail++;
      } catch { fail++; }
    }
    setLinks((p) => ({ ...newLinks, ...p })); // 이미 연결된 건 안 덮음
    setGeoResults((p) => ({ ...p, ...newGeo }));
    setGeoProg(null);
    setGeoBusy(false);
    alert(`좌표 대조 완료 — 자동 연결 ${auto}곳 · 근처 후보 ${cand}곳(상세에서 확인) · 미확인 ${fail}곳${firstFailReason ? `\n(실패 사유 예: ${firstFailReason})` : ""}`);
  }

  async function applyFill() {
    const totalFields = fillPlan.reduce((n, p) => n + p.labels.length, 0);
    const counts = {};
    fillPlan.forEach((p) => p.labels.forEach((l) => { counts[l] = (counts[l] ?? 0) + 1; }));
    const detail = Object.entries(counts).map(([l, n]) => `${l} ${n}곳`).join(", ");
    const statusMsg = verifyReady ? `\n검증 상태(띠 색·인증마크)도 현장 ${statusPlan.length}곳에 저장됩니다.` : "\n(검증 상태 저장은 마이그레이션 083 실행 후 가능)";
    const mgrMsg = managersPlan.length ? `\n현장 담당자 ${managersPlan.length}명 추가(이름·직함·전화 — 역할 자동 매핑, 같은 번호 있으면 스킵).` : "";
    const techMsg = techPlan.length ? `\n담당기사(점검자) ${techPlan.length}곳 배정 — 담당기사가 비어 있는 현장만.` : "";
    if (!(await confirmAsync(`현장 ${fillPlan.length}곳의 비어 있는 칸 ${totalFields}개를 채웁니다.\n(${detail})${statusMsg}${techMsg}${mgrMsg}\n\n이미 값이 있는 칸은 건드리지 않습니다. 진행할까요?`))) return;
    setBusy(true);
    // 빈칸 채우기 + 검증 상태를 현장별로 합쳐 한 번에 update
    const now = new Date().toISOString();
    const merged = new Map();
    fillPlan.forEach((p) => merged.set(p.siteId, { siteName: p.siteName, patch: { ...p.patch } }));
    statusPlan.forEach((s) => {
      const e = merged.get(s.siteId) ?? { siteName: "", patch: {} };
      e.patch.verify_level = s.level;
      e.patch.verified_at = s.allOk ? now : null;
      if (s.issuesReady) e.patch.verify_issues = s.issues;
      merged.set(s.siteId, e);
    });
    // 담당기사(점검자) — sites.assigned_engineer(표시용)에 함께 넣는다. update 전에 patch를 채워야 반영된다.
    for (const t of techPlan) {
      const e = merged.get(t.siteId) ?? { siteName: t.siteName, patch: {} };
      e.patch.assigned_engineer = t.techName;
      merged.set(t.siteId, e);
    }
    let ok = 0;
    const failed = [];
    setProgress({ done: 0, total: merged.size });
    let i = 0;
    for (const [siteId, e] of merged) {
      const { error } = await supabase.from("sites").update(e.patch).eq("id", siteId);
      if (error) failed.push(`${e.siteName || siteId}: ${error.message}`);
      else ok++;
      setProgress({ done: ++i, total: merged.size });
    }
    // site_assignments(실제 배정 기준)에도 반영 — 둘 중 하나만 넣으면 자체점검 담당자 등에서 안 잡힌다
    let techOk = 0;
    if (techPlan.length) {
      const rows = techPlan.map((t) => ({ site_id: t.siteId, tech_id: t.techId, is_lead: true }));
      for (let n = 0; n < rows.length; n += 50) {
        const chunk = rows.slice(n, n + 50);
        const { error } = await supabase.from("site_assignments").upsert(chunk, { onConflict: "site_id,tech_id" });
        if (error) failed.push(`담당기사 배정 실패: ${error.message}`);
        else techOk += chunk.length;
      }
    }

    // 현장 담당자 추가 (50개씩 묶어서)
    let mgrOk = 0;
    if (managersPlan.length) {
      const stamp = Date.now();
      const mgrRows = managersPlan.map((m, n) => ({ id: `sm-vf-${stamp}-${n}`, site_id: m.siteId, name: m.name, phone: m.phone, role: m.role, is_primary: false }));
      for (let n = 0; n < mgrRows.length; n += 50) {
        const chunk = mgrRows.slice(n, n + 50);
        const { error } = await supabase.from("site_managers").insert(chunk);
        if (error) failed.push(`담당자 추가 실패: ${error.message}`);
        else mgrOk += chunk.length;
      }
      if (mgrOk && setData) {
        setData((prev) => ({
          ...prev,
          siteManagers: [...prev.siteManagers, ...mgrRows.map((x) => ({ id: x.id, siteId: x.site_id, name: x.name, phone: x.phone, role: x.role, isPrimary: false }))],
        }));
      }
    }
    setProgress(null);
    // 화면(콘솔 전체 데이터)에도 반영해 새로고침 없이 최신으로
    if (ok && setData) {
      const camel = { phone: "phone", fax: "fax", email: "email", maintenance_cost: "maintenanceCost", contract_date: "contractDate", contract_type: "contractType", notes: "notes", verify_level: "verifyLevel", verified_at: "verifiedAt", verify_issues: "verifyIssues", assigned_engineer: "assignedEngineer", access_info: "accessInfo" };
      setData((prev) => ({
        ...prev,
        sites: prev.sites.map((s) => {
          const e = merged.get(s.id);
          if (!e) return s;
          const mapped = {};
          for (const [col, v] of Object.entries(e.patch)) mapped[camel[col]] = v;
          return { ...s, ...mapped };
        }),
      }));
    }
    setBusy(false);
    alert(failed.length ? `현장 ${ok}곳 반영, 실패 ${failed.length}건:\n${failed.slice(0, 5).join("\n")}` : `완료 — 현장 ${ok}곳 반영 (빈칸 ${fillPlan.length} · 상태 ${statusPlan.length} · 담당기사 ${techOk} · 담당자 ${mgrOk}명 추가).`);
  }

  const open = openIdx != null ? finalRows?.[openIdx] : null;
  const LV = { red: "bg-red-50 text-red-600 border-red-200", yellow: "bg-amber-50 text-amber-700 border-amber-200", green: "bg-emerald-50 text-emerald-700 border-emerald-200" };

  return (
    <Modal title="엑셀 검증 업로드 — 정리 안 된 관리 엑셀 검사" onClose={onClose} wide="xl">
      <div className="p-5 overflow-y-auto space-y-4">
        {/* 업로드 2개 */}
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 cursor-pointer">
            <Upload size={15} /> 내부 관리 엑셀 올리기 {rows ? `(${rows.length}행 읽음)` : ""}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={pickInternal} disabled={busy} />
          </label>
          <span className="self-center text-xs font-semibold text-slate-500">등록된 현장 {dbKeys.size}곳과 자동 대조</span>
          {finalRows && (() => {
            const n = finalRows.filter((r) => !r.autoMatched && !links[r.idx] && r.parsed.address && (r.parsed.name || r.contIdx != null)).length;
            return n > 0 && (
              <button onClick={geoMatch} disabled={geoBusy || busy}
                className="flex items-center gap-1.5 text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                {geoBusy && geoProg ? `좌표 대조 중… ${geoProg.done}/${geoProg.total}` : `주소 좌표로 대조 (미매칭 ${n}곳)`}
              </button>
            );
          })()}
          {finalRows && (
            <div className="flex gap-2 ml-auto">
              <button onClick={downloadClean} className="flex items-center gap-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl px-4 py-2.5">
                <Download size={15} /> 정리본 다운로드
              </button>
              <button onClick={applyFill} disabled={busy || (!fillPlan.length && !statusPlan.length && !managersPlan.length && !techPlan.length)}
                className="flex items-center gap-2 text-sm font-bold text-white bg-emerald-600 disabled:bg-slate-300 rounded-xl px-4 py-2.5">
                <DatabaseZap size={15} /> {progress ? `반영 중… ${progress.done}/${progress.total}` : `DB 반영 (빈칸 ${fillPlan.length} · 상태 ${statusPlan.length} · 기사 ${techPlan.length} · 담당자 ${managersPlan.length})`}
              </button>
            </div>
          )}
        </div>
        {progress && (
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
        )}
        <p className="text-xs text-slate-400">
          저장은 <b>"DB 반영"을 눌러야만</b> 됩니다 — 대상은 통과(초록) + 인증완료한 노랑 중 DB 현장과 매칭된 행. 그 현장의 <b>비어 있는 칸만</b> 채우고, 이미 값 있는 칸은 절대 덮지 않습니다. (빨강은 반영 불가)
        </p>

        {/* 요약 + 필터 */}
        {counts && (
          <div className="flex flex-wrap gap-2">
            {[["problem", `남은 문제 ${counts.red + counts.yellow - counts.reviewed >= 0 ? "" : ""}`], ["red", `빨강 ${counts.red}`], ["yellow", `노랑 ${counts.yellow}`], ["green", `통과 ${counts.green}`], ["reviewed", `검토완료 ${counts.reviewed}`], ["all", `전체 ${finalRows.length}`]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`text-xs font-bold rounded-full px-3 py-1.5 border ${filter === k ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-600 border-slate-300"}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 파일 전체 공통 형식 문제 */}
        {fileNotices.map((n, i) => (
          <div key={i} className="text-xs bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-700"><b>파일 전체:</b> {n}</div>
        ))}

        {/* DB에만 있는 현장 */}
        {rows && refOnly.length > 0 && (
          <div className="text-xs bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-700">
            <b>등록된 현장(DB)에만 있고 이 엑셀엔 없는 현장 {refOnly.length}곳</b>: {refOnly.slice(0, 10).join(", ")}{refOnly.length > 10 ? ` 외 ${refOnly.length - 10}곳` : ""}
          </div>
        )}

        {/* 목록 */}
        {visible.length > 0 && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
            {visible.map((r) => (
              <button key={r.idx} onClick={() => { setOpenIdx(r.idx); setLinkQuery(""); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3">
                <span className={`shrink-0 text-[11px] font-bold rounded-full px-2 py-0.5 border ${LV[r.level]}`}>{r.level === "red" ? "빨강" : r.level === "yellow" ? "노랑" : "통과"}</span>
                <span className="text-sm font-bold text-slate-800 truncate">
                  {r.parsed.name
                    || (r.parsed.groupName ? `(${r.parsed.groupName} 묶음)` : `(이름 없음${buildingHintOf(r.parsed.address) ? ` · ${buildingHintOf(r.parsed.address)}?` : ""})`)}
                </span>
                <span className="text-xs text-slate-400 truncate">{r.parsed.address}</span>
                <span className="ml-auto shrink-0 flex items-center gap-1.5 text-xs text-slate-400">
                  {r.issues.length ? `문제 ${r.issues.length}` : ""}
                  {links[r.idx] && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-1.5">{links[r.idx].auto ? "자동연결" : "연결됨"}</span>}
                  {reviewed[r.idx] && <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5"><CheckCircle2 size={11} /> 인증완료</span>}
                </span>
              </button>
            ))}
          </div>
        )}
        {finalRows && visible.length === 0 && <p className="text-sm text-slate-400 text-center py-6">이 필터에 해당하는 행이 없습니다</p>}

        {/* 상세 — 원본 vs 해석 */}
        {open && (
          <div className="border-2 border-blue-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-slate-800">{open.parsed.name || "(현장명 없음)"} <span className="text-xs font-semibold text-slate-400">원본 {open.excelRow}행</span></p>
              <div className="flex gap-2">
                <button onClick={() => {
                    const next = !reviewed[open.idx];
                    setReviewed((p) => ({ ...p, [open.idx]: next }));
                    persistMark(open, (o) => { if (next) o.reviewed = true; else delete o.reviewed; });
                  }}
                  className={`flex items-center gap-1 text-xs font-bold rounded-lg px-3 py-1.5 border ${reviewed[open.idx] ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300"}`}>
                  <CheckCircle2 size={13} /> {reviewed[open.idx] ? "인증완료됨" : "인증완료로 표시"}
                </button>
                <button onClick={() => setOpenIdx(null)} className="text-xs font-bold text-slate-400 px-2">닫기</button>
              </div>
            </div>
            {open.issues.length > 0 && (
              <ul className="space-y-1">
                {open.issues.map((x, i) => (
                  <li key={i} className={`text-xs font-semibold flex items-start gap-1.5 ${x.level === "red" ? "text-red-600" : "text-amber-700"}`}>
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {x.msg}
                  </li>
                ))}
              </ul>
            )}
            {/* DB 매칭 — 자동 실패 시 비슷한 현장 후보를 제시, 사람이 클릭해서 연결 (구주소·별칭 문제 해소) */}
            {links[open.idx] ? (
              <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <span>
                  DB 현장과 연결됨: <b>{links[open.idx].siteName}</b>
                  {links[open.idx].auto && ` (자동 ${links[open.idx].geo != null ? `· 좌표 ${links[open.idx].geo}m` : Math.round(links[open.idx].score * 100) + "%"} — 아니면 해제)`}
                  <span className="block text-[11px] font-normal text-emerald-600/80 mt-0.5">그 현장의 빈 칸만 채웁니다 — 이미 있는 값은 덮어쓰지 않아요</span>
                </span>
                <button onClick={() => { setLinks((p) => { const n = { ...p }; delete n[open.idx]; return n; }); persistMark(open, (o) => { delete o.link; }); }} className="font-bold text-slate-400">연결 해제</button>
              </div>
            ) : (!open.autoMatched && dbSites.length > 0 && (
              (() => {
                // 이름이 없으면 주소 끝 건물 별칭(태성대아파트) → 병합 묶음 이름 순으로 빌려 후보를 찾는다.
                // 묶음이라도 행마다 주소가 다르면 다른 현장이므로 주소 후보(아래 fallback)가 결정적이다.
                let cands = candidatesFor(open, buildingHintOf(open.parsed.address) || open.parsed.groupName || "");
                // 좌표 대조에서 나온 근처 후보를 맨 앞에 (거리 표시)
                const geo = geoResults[open.idx];
                if (geo && !cands.some((c) => c.id === geo.siteId)) {
                  cands = [{ id: geo.siteId, name: geo.siteName, dong: null, score: 0, tags: [`좌표 ${geo.dist}m`] }, ...cands];
                }
                const fallback = cands.length === 0;
                if (fallback) cands = sameDongFallback(open);
                const qk = linkQuery.trim().length >= 2 ? nameKey(linkQuery) : "";
                const searched = qk ? dbSites.filter((s) => s.keys.some((k) => k.includes(qk))).slice(0, 5) : [];
                const pick = (c) => { setLinks((p) => ({ ...p, [open.idx]: { siteId: c.id, siteName: c.name } })); persistMark(open, (o) => { o.link = { siteId: c.id, siteName: c.name }; }); setLinkQuery(""); };
                return (
                  <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1.5">
                    <p className="font-bold text-slate-500">
                      {fallback ? "이름 비슷한 곳이 없어 같은 법정동 현장을 보여드려요 — 같은 곳이면 클릭해서 연결" : "비슷한 DB 현장 — 같은 곳이면 클릭해서 연결 (법정동·주소·설치일 가산점 반영)"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {cands.map((c) => (
                        <button key={c.id} onClick={() => pick(c)}
                          className="font-bold px-2.5 py-1 rounded-full bg-white border border-blue-200 text-blue-700 hover:bg-blue-50">
                          {c.name} {c.dong ? `(${c.dong})` : ""}{c.score > 0 ? ` · ${Math.round(c.score * 100)}%` : ""}{c.tags.length ? ` · ${c.tags.join("·")}` : ""}
                        </button>
                      ))}
                      {cands.length === 0 && <span className="text-slate-400">후보 없음 — 아래에서 직접 검색</span>}
                    </div>
                    <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200">
                      <input value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} placeholder="현장 이름으로 직접 검색해 연결 (2자 이상)"
                        className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white" />
                    </div>
                    {searched.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {searched.map((c) => (
                          <button key={c.id} onClick={() => pick(c)}
                            className="font-bold px-2.5 py-1 rounded-full bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                            {c.name} {c.dong ? `(${c.dong})` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            ))}
            <table className="w-full text-xs">
              <tbody>
                {[
                  ["주소", open.parsed.address], ["점검자", open.parsed.engineer], ["대수", open.parsed.unitCount],
                  ["계약종류", open.parsed.contractType], ["계약일(최신)", open.parsed.contractDate ?? "—"],
                  ["계약 이력(비고로 보존)", open.parsed.contractHistory || "—"],
                  ["보수료", open.parsed.cost != null ? open.parsed.cost.toLocaleString() + "원" : "—"],
                  ["미수잔액", open.parsed.balance != null ? open.parsed.balance.toLocaleString() + "원" : "—"],
                  ["수금 기록", `${open.parsed.paidMonths}개 달에 기록 있음`],
                  ["전화(추출)", open.parsed.phones.map((p) => `${p.disp ? p.disp + " · " : ""}${p.num} — ${p.type}`).join("  /  ") || "—"],
                  ["출입정보(전용 칸으로)", open.parsed.accessInfo || "—"],
                  ["연락처 원본 메모", open.parsed.contactMemo || "—"],
                  ["이메일(대표)", open.parsed.email || "—"],
                  ["청구/메일 메모(비고로)", open.parsed.emailMemo || "—"],
                  ["사업자번호", open.parsed.bizNo || "—"],
                  ["입금 방식(사업자번호 열)", open.parsed.bizMemo || "—"],
                  ["승강기 종류", open.parsed.kinds.join(", ") || "—"], ["설치일(해석)", open.parsed.installDate ?? "—"],
                  ["비고", open.parsed.note || "—"],
                ].map(([k, v]) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-bold text-slate-500 whitespace-nowrap w-28">{k}</td>
                    <td className="py-1.5 text-slate-700 break-all">{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
