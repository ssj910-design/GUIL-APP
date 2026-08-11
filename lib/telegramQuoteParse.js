// lib/telegramQuoteParse.js
// "태영하이빌 김담당자 도어레일 SUS304 2개 EA 12만원 견적" 같은 문장에서 관리자웹
// QuoteItemsModal.jsx의 품목 필드(name/spec/unit/qty/unitPrice)와 1:1로 맞춘 8개 필드를 뽑는다.
// 구조화 추출 1회 호출이라 저비용 모델(Haiku)로 충분 — docs/RAG.md 컨벤션과 동일.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCHEMA = {
  type: "object",
  properties: {
    siteQuery: { type: "string", description: "문장에 언급된 현장명(부분 명칭이어도 됨). 필수." },
    managerName: { type: "string", description: "받는사람으로 지정한 담당자 이름. 없으면 빈 문자열." },
    quoteTitle: { type: "string", description: "견적명(품명과 별개로 명시했을 때만). 없으면 빈 문자열." },
    itemName: { type: "string", description: "품명. 필수." },
    spec: { type: "string", description: "규격. 없으면 빈 문자열." },
    qty: { type: "integer", description: "수량. 없으면 1." },
    unit: { type: "string", enum: ["EA", "SET", "식", ""], description: "단위. 없으면 빈 문자열." },
    unitPrice: { type: "integer", description: "단가(원). 필수, 0 초과." },
  },
  required: ["siteQuery", "managerName", "quoteTitle", "itemName", "spec", "qty", "unit", "unitPrice"],
  additionalProperties: false,
};

export async function parseQuoteMessage(text) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{
      role: "user",
      content: `승강기 부품 견적 요청 문장에서 현장명·담당자·견적명·품명·규격·수량·단위·단가를 추출해줘. ` +
        `문장에 없는 항목은 빈 문자열(수량은 1, 단가는 0)로 채워줘.\n\n"${text}"`,
    }],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block) return null;

  let parsed;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return null;
  }
  if (!parsed.siteQuery?.trim() || !parsed.itemName?.trim() || !parsed.unitPrice) return null;
  return parsed;
}
