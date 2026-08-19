// 5단계 — 추천 질문을 법령 자료에서 생성한다.
//
// 실행:  node --env-file=.env.local scripts/rag/gen-suggestions.mjs
//        결과를 lib/lawQaSuggestions.js 에 덮어쓴다.
//
// 왜 자동 생성인가: 손으로 30개를 쓰면 우리가 아는 것만 나온다. 조항 자체가 주제 목록이라
// 거기서 뽑으면 **자료 구조를 그대로 반영**하고, 자료에 없는 걸 추천해 실패하는 일도 없다.
//
// 3단계:
//   1) 제목 붙은 법조문 → 질문. 행정 조항(위원 제척·권한 위임·과태료)은 모델이 걸러낸다
//   2) 안전기준 본문 샘플 → 그 조항으로 답이 되는 질문 (번호만 있고 제목이 없는 계열이라 본문을 읽힌다)
//   3) 중복 정리 후 전부 검색해 근거가 나오는지 확인
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { chunks } = JSON.parse(fs.readFileSync(new URL("./chunks.json", import.meta.url), "utf8"));

const MODEL = "gpt-4.1-mini";
const ask = async (sys, user, max = 2000) => {
  const res = await ai.chat.completions.create({
    model: MODEL, max_completion_tokens: max,
    // 질문 문자열만 받는다 — 조항까지 돌려받게 했더니 모델이 거기에 본문을 복사해 응답이 잘렸다.
    response_format: { type: "json_schema", json_schema: { name: "questions", strict: true, schema: {
      type: "object", properties: { items: { type: "array", items: { type: "string" } } },
      required: ["items"], additionalProperties: false } } },
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
  });
  return (JSON.parse(res.choices[0].message.content).items ?? []).map((q) => String(q).trim()).filter(Boolean);
};

const RULES = `구어체로 짧게, 20자 안팎. 조항 번호는 넣지 마라 (기사는 번호를 모른 채 묻는다).
현장에서 쓰는 부품명을 살려라 — 카, 승강장문, 조속기, 완충기.
물을 게 없는 조항은 아예 빼라. 개수를 맞추려 억지로 만들지 마라.`;

// ── 1) 법조문
const clauses = [...new Set(chunks.map((c) => c.clause).filter((c) => c && /^제\d+조(의\d+)?\(/.test(c)))];
const out = [];
for (let i = 0; i < clauses.length; i += 40) {
  out.push(...await ask(
    `승강기 유지보수 기사가 쓰는 법령 검색 챗봇의 추천 질문을 만든다.\n조항 제목을 기사가 물어볼 질문 한 문장으로 바꿔라.\n\n넣을 것: 검사 주기·방법, 점검 기준, 수치 기준, 신고·제출 기한, 자격, 안전장치\n뺄 것: 위원회 구성, 위원 제척·기피, 권한 위임, 벌칙·과태료, 수수료 산정, 규제 재검토, 행정처분 절차\n\n${RULES}`,
    clauses.slice(i, i + 40).join("\n"), 3000));
  process.stdout.write(`\r[1/3] 법조문 ${Math.min(i + 40, clauses.length)}/${clauses.length} → ${out.length}개`);
}

// ── 2) 안전기준 본문 (제목이 없어 본문에서 주제를 뽑는다)
const pool = chunks.filter((c) => (/안전기준|검사방법/.test(c.title)) && c.content.length > 200 && c.content.length < 1200 && /^\d+(\.\d+)+$/.test(c.clause ?? ""));
const step = Math.max(1, Math.floor(pool.length / 320));      // 고르게 훑는다 (난수는 재현이 안 된다)
const sample = pool.filter((_, i) => i % step === 0).slice(0, 320);
for (let i = 0; i < sample.length; i += 25) {
  out.push(...await ask(
    `승강기 기사용 법령 검색 챗봇의 추천 질문을 만든다. 안전기준 조항 본문을 보고 질문 한 문장으로 바꿔라.\n\n그 조항으로 **답이 되는** 질문이어야 한다. 본문에 없는 걸 묻지 마라.\n점검·검사에 쓸모 있는 것만 — 수치 기준·설치 기준·점검 방법·안전장치 동작.\n정의문·적용범위·표 머리말처럼 물을 게 없는 조항은 빼라.\n\n${RULES}`,
    sample.slice(i, i + 25).map((r) => `[${r.clause}] ${r.content.slice(0, 260)}`).join("\n---\n")));
  process.stdout.write(`\r[2/3] 안전기준 ${Math.min(i + 25, sample.length)}/${sample.length} → ${out.length}개`);
}

// ── 3) 정리 + 검색 검증
const seen = new Set();
const merged = out.filter((q) => {
  const k = q.replace(/[\s?!.]/g, "");
  if (!k || seen.has(k) || q.length < 6 || q.length > 34) return false;
  seen.add(k); return true;
});

const ok = [];
for (let i = 0; i < merged.length; i += 100) {
  const slice = merged.slice(i, i + 100);
  const emb = await ai.embeddings.create({ model: "text-embedding-3-small", input: slice });
  await Promise.all(slice.map(async (q, j) => {
    const kw = q.replace(/[?!.]/g, "").split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
    const { data } = await db.rpc("search_knowledge_hybrid", {
      keywords: kw.length ? kw : [q.slice(0, 4)], query_embedding: emb.data[j].embedding, match_count: 5,
    });
    if (data?.length) ok.push(q);
  }));
  process.stdout.write(`\r[3/3] 검증 ${Math.min(i + 100, merged.length)}/${merged.length} → 통과 ${ok.length}`);
}
// ⚠️ 이 검증은 "0건이 아니다"만 본다. 하이브리드는 벡터가 늘 가장 가까운 걸 주므로 대부분 통과한다.
//    답변 품질까지 보려면 실제로 물어봐야 한다(질문당 2.6원) — 표본으로만 확인했다.

const dst = path.resolve(import.meta.dirname, "../../lib/lawQaSuggestions.js");
const head = fs.readFileSync(dst, "utf8").split("export const SUGGESTIONS")[0];
fs.writeFileSync(dst, `${head}export const SUGGESTIONS = [\n${ok.sort().map((q) => `  ${JSON.stringify(q)},`).join("\n")}\n];\n${fs.readFileSync(dst, "utf8").split("];\n")[1] ?? ""}`);
console.log(`\n완료 — ${ok.length}개를 lib/lawQaSuggestions.js에 썼다`);
