// 1단계 — 검사기준 챗봇에 넣을 문서를 고른다.
//
// 원본: koelsa_elevator_laws_full_text.json (공단 법령자료 게시판 크롤링, 149건/2,100만 자)
// 그대로 넣으면 안 되는 이유: 2015~2016년 자료가 절반 이상인데 승강기시설안전관리법은
// 2019년에 폐지·전면개편됐다. 폐지된 법으로 답하는 챗봇은 현장 사고로 이어진다.
//
// 규칙
//  1) 카테고리는 "승강기 관련 법령 및 검사기준"만 (산업안전 법령 56건 제외 — 목적 밖)
//  2) 2019-03-28(현행 승강기안전관리법 시행) 이후 게시물만
//  3) 법·시행령·시행규칙처럼 개정판이 여러 개인 것은 **최신 시행본 1개만** (구버전은 오답의 원천)
//  4) 전부개정 당시 "설명회 자료"는 제외 — 과도기 설명이라 지금 기준과 어긋난다
//
// 출력: scripts/rag/selected.json  { docs: [{ docId, title, docType, effectiveDate, source, content }] }
import fs from "fs";
import path from "path";

const SRC = path.resolve(import.meta.dirname, "../../../koelsa_elevator_laws_full_text.json");
const OUT = path.resolve(import.meta.dirname, "selected.json");
const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));

const posts = raw.posts.filter(
  (p) => p.category === "승강기 관련 법령 및 검사기준" && p.date >= "2019-03-28"
);

// 문서 종류 — 답변에서 "무엇에 근거했는지" 보여주고, 같은 종류의 구버전을 걸러내는 기준.
function docTypeOf(title) {
  if (/FAQ/i.test(title)) return "FAQ";                       // "안전관리법령 FAQ"가 법률로 잡히지 않게 먼저
  if (/시행규칙/.test(title)) return "시행규칙";
  if (/시행령/.test(title)) return "시행령";
  // 본법 — 제목에 "(시행일 …)"이 붙는 게 보통이라 '시행' 제외 조건을 두면 안 된다(과거 버그).
  if (/안전관리법/.test(title)) return "법률";
  if (/별표\s*2[2-7]|안전기준/.test(title)) return "안전기준";
  if (/검사방법 표준화/.test(title)) return "검사방법표준화";
  if (/해설서/.test(title)) return "해설서";
  if (/수수료|표준유지관리비/.test(title)) return "고시";
  if (/운영규정/.test(title)) return "운영규정";
  if (/설명회|발표자료|박람회/.test(title)) return "설명회";  // → 제외 대상
  return "기타";
}

// 제목에 적힌 시행일을 뽑는다 ("시행일 2025. 1. 31.", "(2026. 2. 1. 시행)").
function effectiveDateOf(title, fallback) {
  const m = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(?:시행)?/.exec(title);
  if (!m) return fallback;
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

const docs = [];
for (const p of posts) {
  const docType = docTypeOf(p.title);
  if (docType === "설명회") continue; // 규칙 4
  for (const a of p.attachments ?? []) {
    if (a.extraction !== "ok" || !a.content?.trim()) continue;
    docs.push({
      docId: `${p.bIdx}-${a.name}`,
      title: p.title,
      fileName: a.name,
      docType,
      postedAt: p.date,
      effectiveDate: effectiveDateOf(p.title, p.date),
      source: p.url,
      content: a.content,
    });
  }
}

// 규칙 3 — 법률/시행령/시행규칙은 시행일이 가장 늦은 것만 남긴다.
const SINGLE_LATEST = new Set(["법률", "시행령", "시행규칙"]);
const latest = new Map();
const kept = [];
for (const d of docs) {
  if (!SINGLE_LATEST.has(d.docType)) { kept.push(d); continue; }
  const prev = latest.get(d.docType);
  if (!prev || d.effectiveDate > prev.effectiveDate) latest.set(d.docType, d);
}
kept.push(...latest.values());
kept.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

const chars = kept.reduce((s, d) => s + d.content.length, 0);
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), docs: kept }, null, 1));

const byType = {};
for (const d of kept) byType[d.docType] = (byType[d.docType] ?? 0) + 1;
console.log(`선별 ${kept.length}개 문서 / ${chars.toLocaleString()}자`);
console.log("종류별:", byType);
console.log("\n제외된 구버전 법령:");
for (const d of docs) {
  if (SINGLE_LATEST.has(d.docType) && latest.get(d.docType)?.docId !== d.docId) {
    console.log(`  ✗ ${d.effectiveDate} ${d.title.slice(0, 50)}`);
  }
}
