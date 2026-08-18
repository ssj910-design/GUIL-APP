// 검사기준 Q&A — 승강기 법령·안전기준을 근거와 함께 답한다.
//
// 흐름: 질문 → (AI가 검색어 추출) → knowledge_chunks 키워드 검색 → (AI가 근거 기반 답변)
// 임베딩 없이 키워드로 시작한다 — 검사기준 질문은 용어가 명확해서 상당히 맞고, 키 발급 없이
// 바로 쓸 수 있다. 나중에 임베딩을 붙이면 검색 단계만 하이브리드로 바꾸면 된다(docs/RAG.md).
//
// ⚠️ 법령 답변 원칙: **근거 없는 답을 만들지 않는다.** 검색 결과가 없으면 모른다고 답하고,
// 답할 때는 반드시 조항·문서명·시행일을 함께 준다. 기사가 잘못된 기준으로 검사하면 사고가 난다.
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// 답변 생성은 GPT를 쓴다 (텔레그램 견적봇은 Claude — 벤더가 둘이니 키도 둘이다).
// 추론 모델(o시리즈·gpt-5)이 아니라 mini를 쓰는 이유: 이 챗봇은 찾아준 조항을 정확히 옮기는
// 일이라 추론이 필요 없고, 현장에서는 응답 속도가 정확도만큼 중요하다.
const MODEL = "gpt-4.1-mini";

// ⚠️ 클라이언트는 모듈 최상단이 아니라 요청 안에서 만든다. OpenAI SDK는 키가 없으면
// **생성 시점에 throw**하는데(Anthropic SDK는 안 그랬다), 빌드 중 Next가 이 라우트를
// 로드하면서 터져 배포가 통째로 실패한다. 키가 아직 안 꽂힌 환경에서도 빌드는 돼야 한다.

const KEYWORD_SCHEMA = {
  type: "object",
  properties: {
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "법령 원문에 그대로 등장할 단일 용어 2~4개 (구체적인 것부터)",
    },
  },
  required: ["keywords"],
  additionalProperties: false,
};

// 사용 로그 — 어디서 열었고 무엇을 물었고 답을 찾았는지. 실패해도 답변에는 영향 없게 조용히 넘긴다.
// (진입점 3곳 비교 + 자주 묻는 질문 파악 용도 — 마이그 123)
async function log(question, entryPoint, keywords, sourceCount) {
  try {
    await supabaseAdmin.from("law_qa_logs").insert({
      question, entry_point: entryPoint ?? null, keywords, source_count: sourceCount,
    });
  } catch { /* 로그 실패는 무시 */ }
}

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
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ ok: false, reason: "OPENAI_API_KEY 미설정" }, { status: 200 });
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { question, entryPoint } = await request.json().catch(() => ({}));
  const q = (question ?? "").trim();
  if (!q) return Response.json({ ok: false, reason: "질문을 입력해주세요" }, { status: 200 });

  // 1) 구어체 질문에서 법령 용어를 뽑는다 ("문이 안 닫혀요" → 승강장문, 닫힘)
  let keywords = [];
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 200,
      response_format: { type: "json_schema", json_schema: { name: "keywords", schema: KEYWORD_SCHEMA, strict: true } },
      messages: [{
        role: "user",
        content: `승강기 법령·안전기준 원문을 검색하려 한다. 아래 질문에서 검색어를 뽑아줘.

규칙:
1) 각 항목은 띄어쓰기 없는 단일 용어. 구(句)를 넣으면 원문과 안 맞아 0건이 된다.
2) 가장 구체적인 용어를 앞에 둔다 (뒤쪽부터 버리며 재검색한다).
3) 구어체는 법령 용어로 바꾼다. 엘베 문 → 승강장문, 안 닫힘 → 닫힘
4) 승강기·검사·기준·법령처럼 어디에나 나오는 말은 넣지 않는다.

예) "정기검사 주기는 몇 년인가요" → ["정기검사", "주기"]

질문: "${q}"`,
      }],
    });
    keywords = JSON.parse(res.choices[0]?.message?.content ?? "{}").keywords ?? [];
  } catch {
    keywords = q.split(/\s+/).filter((w) => w.length > 1).slice(0, 3); // AI 실패 시 단순 분리
  }
  if (!keywords.length) return Response.json({ ok: true, answer: "질문을 조금 더 구체적으로 적어주세요.", sources: [] });

  // 2) 키워드 전부를 포함하는 청크부터 찾고, 없으면 키워드를 줄여가며 재시도한다.
  //
  // ⚠️ 검색 실패(함수 없음·권한 없음)와 "자료에 정말 없음"을 반드시 구분해서 알린다.
  //    예전엔 둘 다 "관련 규정을 찾지 못했습니다"로 나와서, 마이그 115를 안 돌린 상태인지
  //    질문이 자료 밖인지 아무도 알 수 없었다(실제로 그 상태로 한참 헤맸다).
  let rows = [];
  for (let n = keywords.length; n >= 1 && rows.length === 0; n--) {
    const { data, error } = await supabaseAdmin.rpc("search_knowledge", {
      keywords: keywords.slice(0, n),
      match_count: 8,
    });
    if (error) {
      console.error("[law-qa] search_knowledge 실패:", error.message);
      return Response.json({
        ok: false,
        reason: "검사기준 검색이 아직 준비되지 않았습니다 (관리자: 마이그레이션 115 실행 + 청크 적재 필요)",
      });
    }
    rows = data ?? [];
  }
  if (!rows.length) {
    await log(q, entryPoint, keywords, 0);
    return Response.json({
      ok: true,
      answer: "관련 규정을 찾지 못했습니다. 다른 표현으로 다시 물어보시거나, 공단 법령자료를 직접 확인해주세요.",
      keywords, sources: [],
    });
  }

  // 3) 찾은 조항만 근거로 답한다 — 모르면 모른다고 하게 못박는다.
  const answerRes = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 1200,
    messages: [{
      role: "system",
      content:
      "너는 승강기 유지보수 기사를 돕는 검사기준 안내자다. 아래 '근거 자료'에 있는 내용만으로 답한다.\n" +
      "- 근거에 없는 내용은 절대 추측하지 말고 '자료에서 확인되지 않습니다'라고 말한다.\n" +
      "- 답변 문장 뒤에 근거 번호를 [1] 형태로 붙인다.\n" +
      "- 근거 자료가 질문과 동떨어져 있으면(검색이 엉뚱한 조항을 물어온 경우) 억지로 답하지 말고 '질문과 관련된 규정을 찾지 못했습니다'라고만 답한다. 어설픈 답이 답 없음보다 위험하다.\n" +
      "- 현장 기사가 읽는 글이다. 짧고 실무적으로, 조항 번호와 수치(주기·치수·기한)를 정확히 옮긴다.\n" +
      "- 마지막에 '⚠️ 최종 판단은 관할 검사기관 확인이 필요합니다' 같은 과한 면책은 붙이지 않는다. 대신 근거를 정확히 제시한다.",
    }, {
      role: "user",
      content: `질문: ${q}\n\n근거 자료:\n\n${buildContext(rows)}`,
    }],
  });

  const answer = answerRes.choices[0]?.message?.content ?? "";
  await log(q, entryPoint, keywords, rows.length);
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
