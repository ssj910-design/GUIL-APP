// 답변 품질 확인용 수동 도구 — DB 없이 로컬 청크로 route.js 흐름을 재현한다.
//   OPENAI_API_KEY=... node scripts/rag/qa-test.mjs "정기검사 주기는?" "문이 안 닫혀요"
//
// 왜 있나: 적재 전에는 /api/law-qa를 실제로 못 돌려본다. 이걸로 "검색어가 구(句)로 뽑혀
// 0건이 되는" 문제와 "엉뚱한 조항으로 지어내는" 문제를 잡았다.
// ⚠️ 프롬프트를 route.js와 복사해 쓰므로, route.js를 고치면 여기도 같이 고칠 것.
import OpenAI from "openai";
import fs from "node:fs";

const MODEL = "gpt-4.1-mini";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chunks = JSON.parse(fs.readFileSync(new URL("./chunks.json", import.meta.url), "utf8")).chunks;
console.log(`청크 ${chunks.length}개 로드`);

const KEYWORD_SCHEMA = { type:"object", properties:{ keywords:{ type:"array", items:{type:"string"},
  description: "법령 원문에 그대로 등장할 단일 용어 2~4개 (구체적인 것부터)", } },
  required:["keywords"], additionalProperties:false };

// search_knowledge RPC 대체: 키워드 전부 포함 → 없으면 줄여가며
function search(keywords) {
  for (let n = keywords.length; n >= 1; n--) {
    const ks = keywords.slice(0, n);
    const hit = chunks.filter((c) => ks.every((k) => c.content.includes(k))).slice(0, 8);
    if (hit.length) return hit;
  }
  return [];
}
const buildContext = (rows) => rows.map((r,i) => {
  const m = r;
  return `[${i+1}] ${[m.clause, m.title, m.effectiveDate && `${m.effectiveDate} 시행`].filter(Boolean).join(" · ")}\n${r.content}`;
}).join("\n\n---\n\n");

for (const q of process.argv.slice(2)) {
  const t0 = Date.now();
  const kr = await client.chat.completions.create({ model: MODEL, max_completion_tokens: 200,
    response_format: { type:"json_schema", json_schema:{ name:"keywords", schema:KEYWORD_SCHEMA, strict:true } },
    messages: [{ role:"user", content: `승강기 법령·안전기준 원문을 검색하려 한다. 아래 질문에서 검색어를 뽑아줘.

규칙:
1) 각 항목은 띄어쓰기 없는 단일 용어. 구(句)를 넣으면 원문과 안 맞아 0건이 된다.
2) 가장 구체적인 용어를 앞에 둔다 (뒤쪽부터 버리며 재검색한다).
3) 구어체는 법령 용어로 바꾼다. 엘베 문 → 승강장문, 안 닫힘 → 닫힘
4) 승강기·검사·기준·법령처럼 어디에나 나오는 말은 넣지 않는다.

예) "정기검사 주기는 몇 년인가요" → ["정기검사", "주기"]

질문: "${q}"` }] });
  const keywords = JSON.parse(kr.choices[0].message.content).keywords;
  const rows = search(keywords);
  console.log(`\n${"=".repeat(70)}\nQ: ${q}\n검색어: ${keywords.join(", ")} → 근거 ${rows.length}건`);
  if (!rows.length) { console.log("→ 못 찾음"); continue; }
  const ar = await client.chat.completions.create({ model: MODEL, max_completion_tokens: 1200,
    messages: [{ role:"system", content:
      "너는 승강기 유지보수 기사를 돕는 검사기준 안내자다. 아래 '근거 자료'에 있는 내용만으로 답한다.\n" +
      "- 근거에 없는 내용은 절대 추측하지 말고 '자료에서 확인되지 않습니다'라고 말한다.\n" +
      "- 답변 문장 뒤에 근거 번호를 [1] 형태로 붙인다.\n" +
      "- 근거 자료가 질문과 동떨어져 있으면(검색이 엉뚱한 조항을 물어온 경우) 억지로 답하지 말고 '질문과 관련된 규정을 찾지 못했습니다'라고만 답한다. 어설픈 답이 답 없음보다 위험하다.\n" +
      "- 현장 기사가 읽는 글이다. 짧고 실무적으로, 조항 번호와 수치(주기·치수·기한)를 정확히 옮긴다.\n" +
      "- 마지막에 '⚠️ 최종 판단은 관할 검사기관 확인이 필요합니다' 같은 과한 면책은 붙이지 않는다. 대신 근거를 정확히 제시한다." },
      { role:"user", content:`질문: ${q}\n\n근거 자료:\n\n${buildContext(rows)}` }] });
  console.log(`\n${ar.choices[0].message.content}\n\n[근거] ${rows.map((r,i)=>`[${i+1}] ${r.clause ?? ""} ${r.title ?? ""}`).join(" / ")}`);
  console.log(`(${((Date.now()-t0)/1000).toFixed(1)}초, 토큰 ${kr.usage.total_tokens + ar.usage.total_tokens})`);
}
