// 3단계 — 청크를 knowledge_chunks에 적재한다.
//
// RLS가 켜져 있어서(마이그 105·106) anon 키로는 못 넣는다 → service_role 키 필요.
// 실행:  SUPABASE_SERVICE_ROLE_KEY=... node --env-file=.env.local scripts/rag/load.mjs
//   재적재하면 source_type='law' 기존 행을 지우고 새로 넣는다(문서 갱신 시 그대로 다시 실행).
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error("SUPABASE_SERVICE_ROLE_KEY 가 없습니다.");
  console.error("Supabase 대시보드 → Project Settings → API → service_role 키를 .env.local에 넣고 다시 실행하세요.");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });

const { chunks } = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "chunks.json"), "utf8"));
console.log(`적재 대상 ${chunks.length.toLocaleString()}개`);

const { error: delErr, count } = await db.from("knowledge_chunks").delete({ count: "exact" }).eq("source_type", "law");
if (delErr) { console.error("기존 삭제 실패:", delErr.message); process.exit(1); }
console.log(`기존 law 청크 ${count ?? 0}개 삭제`);

const rows = chunks.map((c) => ({
  source_type: "law",
  source_id: c.docId,
  content: c.content,
  metadata: {
    title: c.title,
    docType: c.docType,
    effectiveDate: c.effectiveDate,
    clause: c.clause,
    part: c.part,
    source: c.source,
  },
}));

const SIZE = 500;
for (let i = 0; i < rows.length; i += SIZE) {
  const slice = rows.slice(i, i + SIZE);
  const { error } = await db.from("knowledge_chunks").insert(slice);
  if (error) { console.error(`실패 (${i}~):`, error.message); process.exit(1); }
  process.stdout.write(`\r적재 ${Math.min(i + SIZE, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
}
console.log("\n완료");
