// 4단계 — 적재된 청크에 임베딩을 채운다.
//
// 실행:  node --env-file=.env.local scripts/rag/embed.mjs
//        node --env-file=.env.local scripts/rag/embed.mjs --limit 50   (일부만 시험)
//
// 왜: 키워드 검색은 글자가 겹쳐야 찾는다. "도어대기타임"과 "대기시간"이 같은 뜻인 걸 몰라서
// 검색어를 한 번 잘못 뽑으면 0건이 된다. 임베딩은 의미로 찾으니 그 실패가 크게 준다.
//
// **끊겨도 다시 돌리면 이어서 한다** (embedding is null 인 것만 처리). 5천 건을 한 번에
// 끝내야 하는 작업이 아니라, 중간에 죽어도 손해가 없어야 한다.
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const MODEL = "text-embedding-3-small";   // 1536차원. 마이그 119에서 이 차원으로 고정했다.
const BATCH = 100;                        // 한 번에 임베딩할 청크 수 (API 한도 여유 있게)

const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || !process.env.OPENAI_API_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY 가 .env.local에 있어야 합니다.");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

// 조항 라벨·문서명을 본문 앞에 붙여서 임베딩한다 — "제54조 정기검사의 검사주기"라는 맥락이
// 본문에 없는 청크가 많아서, 이걸 붙이면 "정기검사 주기가 언제냐"는 질문과 훨씬 가까워진다.
const textOf = (r) => {
  const m = r.metadata ?? {};
  const head = [m.clause, m.title].filter(Boolean).join(" · ");
  return (head ? `${head}\n` : "") + r.content;
};

let done = 0, spentTokens = 0;
for (;;) {
  const { data: rows, error } = await db
    .from("knowledge_chunks")
    .select("id, content, metadata")
    .eq("source_type", "law")
    .is("embedding", null)
    .limit(Math.min(BATCH, LIMIT - done));
  if (error) { console.error("조회 실패:", error.message); process.exit(1); }
  if (!rows?.length || done >= LIMIT) break;

  const res = await ai.embeddings.create({ model: MODEL, input: rows.map(textOf) });
  spentTokens += res.usage?.total_tokens ?? 0;

  // 한 건씩 update — upsert로 묶으면 not-null 컬럼(content 등)을 다시 보내야 해서 오히려 번거롭다.
  await Promise.all(res.data.map((e, i) =>
    db.from("knowledge_chunks").update({ embedding: e.embedding }).eq("id", rows[i].id)
  ));

  done += rows.length;
  process.stdout.write(`\r임베딩 ${done.toLocaleString()}건 (토큰 ${(spentTokens / 1000).toFixed(0)}K, 약 ${Math.round(spentTokens / 1_000_000 * 0.02 * 1450)}원)`);
}

const { count } = await db.from("knowledge_chunks")
  .select("id", { count: "exact", head: true })
  .eq("source_type", "law").is("embedding", null);
console.log(`\n완료 — 이번에 ${done.toLocaleString()}건, 남은 미임베딩 ${count ?? 0}건`);
