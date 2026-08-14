// 2단계 — 선별 문서를 검색 단위(청크)로 자른다.
//
// 법령 문서는 아무 데서나 자르면 안 된다. "제12조 ①…"이 반쪽으로 잘리면 검색은 걸려도
// 답변 근거로 못 쓴다. 그래서 **조항 경계**를 우선 경계로 삼고, 그 안에서만 길이로 나눈다.
//   · 법률/시행령/시행규칙 → "제N조(제목)" 단위
//   · 안전기준(별표22~27)  → "7.5.3.2" 같은 항목번호 단위 (검사 현장에서 이 번호로 대화한다)
//   · 그 외(표준화 안내·FAQ·해설서) → 문단 묶음
//
// 각 청크는 자기 출처를 들고 다닌다(문서명·시행일·조항). 답변에 근거를 붙이기 위해서다.
import fs from "fs";
import path from "path";

const IN = path.resolve(import.meta.dirname, "selected.json");
const OUT = path.resolve(import.meta.dirname, "chunks.json");
const { docs } = JSON.parse(fs.readFileSync(IN, "utf8"));

const MAX = 1200;   // 청크 최대 길이(자) — 임베딩 품질과 답변 컨텍스트 사이의 절충
const MIN = 80;     // 이보다 짧으면 앞 청크에 붙인다 (조각 청크는 검색 노이즈)

// "제12조(안전검사)" 같은 조 제목을 만나면 거기서 끊는다.
const ARTICLE = /^\s*(제\s?\d+조(?:의\s?\d+)?)\s*\(([^)]{1,40})\)/;
// 안전기준 항목번호: 줄 시작의 "5", "5.2", "5.2.1.3" (뒤에 공백이나 내용)
const CLAUSE = /^\s*(\d+(?:\.\d+){0,4})\s+(?=\S)/;

function splitByPattern(text, re, labelOf) {
  const lines = text.split("\n");
  const out = [];
  let cur = { label: null, lines: [] };
  for (const line of lines) {
    const m = re.exec(line);
    if (m) {
      if (cur.lines.join("").trim()) out.push({ label: cur.label, text: cur.lines.join("\n").trim() });
      cur = { label: labelOf(m), lines: [line] };
    } else {
      cur.lines.push(line);
    }
  }
  if (cur.lines.join("").trim()) out.push({ label: cur.label, text: cur.lines.join("\n").trim() });
  return out;
}

// 긴 덩어리는 문단 경계에서 MAX 이하로 다시 나눈다 (문장 중간에서 자르지 않는다).
function splitLong(text, max = MAX) {
  if (text.length <= max) return [text];
  const parts = [];
  let buf = "";
  for (const para of text.split(/\n\s*\n/)) {
    if (buf && (buf + "\n\n" + para).length > max) { parts.push(buf); buf = para; }
    else buf = buf ? `${buf}\n\n${para}` : para;
    while (buf.length > max) { parts.push(buf.slice(0, max)); buf = buf.slice(max); } // 문단 자체가 길 때
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}

const chunks = [];
for (const d of docs) {
  const isLaw = ["법률", "시행령", "시행규칙"].includes(d.docType);
  const isStandard = d.docType === "안전기준";
  let pieces;
  if (isLaw) pieces = splitByPattern(d.content, ARTICLE, (m) => `${m[1]}(${m[2]})`);
  else if (isStandard) pieces = splitByPattern(d.content, CLAUSE, (m) => m[1]);
  else pieces = [{ label: null, text: d.content }];

  // 너무 짧은 조각은 앞에 합쳐 노이즈를 줄인다.
  const merged = [];
  for (const p of pieces) {
    const prev = merged[merged.length - 1];
    if (prev && p.text.length < MIN) { prev.text += "\n" + p.text; continue; }
    merged.push({ ...p });
  }

  for (const p of merged) {
    for (const [i, body] of splitLong(p.text).entries()) {
      if (body.trim().length < 20) continue;
      chunks.push({
        docId: d.docId,
        title: d.title,
        docType: d.docType,
        effectiveDate: d.effectiveDate,
        source: d.source,
        clause: p.label ?? null,          // "제12조(안전검사)" 또는 "7.5.3.2"
        part: i > 0 ? i + 1 : null,       // 한 조항이 길어 나뉜 경우
        content: body.trim(),
      });
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), chunks }, null, 1));
const chars = chunks.reduce((s, c) => s + c.content.length, 0);
const withClause = chunks.filter((c) => c.clause).length;
console.log(`청크 ${chunks.length.toLocaleString()}개 / ${chars.toLocaleString()}자 (평균 ${Math.round(chars / chunks.length)}자)`);
console.log(`조항 라벨 있음: ${withClause.toLocaleString()}개 (${Math.round((withClause / chunks.length) * 100)}%)`);
