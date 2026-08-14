// 검사기준 Q&A — 승강기 법령·안전기준을 근거와 함께 답한다.
//
// 흐름: 질문 → (Haiku가 검색어 추출) → knowledge_chunks 키워드 검색 → (Haiku가 근거 기반 답변)
// 임베딩 없이 키워드로 시작한다 — 검사기준 질문은 용어가 명확해서 상당히 맞고, 키 발급 없이
// 바로 쓸 수 있다. 나중에 임베딩을 붙이면 검색 단계만 하이브리드로 바꾸면 된다(docs/RAG.md).
//
// ⚠️ 법령 답변 원칙: **근거 없는 답을 만들지 않는다.** 검색 결과가 없으면 모른다고 답하고,
// 답할 때는 반드시 조항·문서명·시행일을 함께 준다. 기사가 잘못된 기준으로 검사하면 사고가 난다.
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const KEYWORD_SCHEMA = {
  type: "object",
  properties: {
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "법령 원문에서 그대로 쓰일 법한 핵심 명사 2~4개. 조사·구어체는 빼고 표준 용어로. 예: 엘베 문 안 닫힘 → [\"승강장문\", \"닫힘\"]",
    },
  },
  required: ["keywords"],
  additionalProperties: false,
};

// 검색 결과를 프롬프트에 넣을 형태로 — 각 근거에 번호를 붙여 답변이 인용할 수 있게 한다.
function buildContext(rows) {
  return rows
    .map((r, i) => {
      const m = r.metadata ?? {};
      const head = [m.clause, m.title, m.effectiveDate && `${m.effectiveDate} 시행`].filter(Boolean).join(" · ");
      return `[${i + 1}] ${head}\n${r.content}`;
    })
    .join("\n\n---\n\n");
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, reason: "ANTHROPIC_API_KEY 미설정" }, { status: 200 });
  }
  const { question } = await request.json().catch(() => ({}));
  const q = (question ?? "").trim();
  if (!q) return Response.json({ ok: false, reason: "질문을 입력해주세요" }, { status: 200 });

  // 1) 구어체 질문에서 법령 용어를 뽑는다 ("문이 안 닫혀요" → 승강장문, 닫힘)
  let keywords = [];
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      output_config: { format: { type: "json_schema", schema: KEYWORD_SCHEMA } },
      messages: [{
        role: "user",
        content: `승강기 검사기준·법령을 검색하려 한다. 아래 질문에서 검색어를 뽑아줘.\n\n"${q}"`,
      }],
    });
    const block = res.content.find((b) => b.type === "text");
    keywords = JSON.parse(block?.text ?? "{}").keywords ?? [];
  } catch {
    keywords = q.split(/\s+/).filter((w) => w.length > 1).slice(0, 3); // AI 실패 시 단순 분리
  }
  if (!keywords.length) return Response.json({ ok: true, answer: "질문을 조금 더 구체적으로 적어주세요.", sources: [] });

  // 2) 키워드 전부를 포함하는 청크부터 찾고, 없으면 키워드를 줄여가며 재시도한다.
  let rows = [];
  for (let n = keywords.length; n >= 1 && rows.length === 0; n--) {
    const { data } = await supabaseAdmin.rpc("search_knowledge", {
      keywords: keywords.slice(0, n),
      match_count: 8,
    });
    rows = data ?? [];
  }
  if (!rows.length) {
    return Response.json({
      ok: true,
      answer: "관련 규정을 찾지 못했습니다. 다른 표현으로 다시 물어보시거나, 공단 법령자료를 직접 확인해주세요.",
      keywords, sources: [],
    });
  }

  // 3) 찾은 조항만 근거로 답한다 — 모르면 모른다고 하게 못박는다.
  const answerRes = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1200,
    system:
      "너는 승강기 유지보수 기사를 돕는 검사기준 안내자다. 아래 '근거 자료'에 있는 내용만으로 답한다.\n" +
      "- 근거에 없는 내용은 절대 추측하지 말고 '자료에서 확인되지 않습니다'라고 말한다.\n" +
      "- 답변 문장 뒤에 근거 번호를 [1] 형태로 붙인다.\n" +
      "- 현장 기사가 읽는 글이다. 짧고 실무적으로, 조항 번호와 수치(주기·치수·기한)를 정확히 옮긴다.\n" +
      "- 마지막에 '⚠️ 최종 판단은 관할 검사기관 확인이 필요합니다' 같은 과한 면책은 붙이지 않는다. 대신 근거를 정확히 제시한다.",
    messages: [{ role: "user", content: `질문: ${q}\n\n근거 자료:\n\n${buildContext(rows)}` }],
  });

  const answer = answerRes.content.find((b) => b.type === "text")?.text ?? "";
  return Response.json({
    ok: true,
    answer,
    keywords,
    sources: rows.map((r, i) => ({
      n: i + 1,
      clause: r.metadata?.clause ?? null,
      title: r.metadata?.title ?? "",
      docType: r.metadata?.docType ?? "",
      effectiveDate: r.metadata?.effectiveDate ?? null,
      url: r.metadata?.source ?? null,
      excerpt: r.content.slice(0, 200),
    })),
  });
}
