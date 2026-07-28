// 카카오 알림톡 발송 — 알리고(Aligo) API. 실패 시(카카오톡 미가입/차단 등) SMS로 자동
// 대체발송되도록 failover=Y로 호출한다(건당 SMS 비용 별도 발생, 이미 확인받은 사항).
//
// 알리고는 변수 치환을 API가 하지 않는다 — message_1엔 #{현장명} 등 변수를
// 실제 값으로 이미 치환된 최종 문구를 그대로 넣어서 보내야 하고, 승인된 템플릿의 고정
// 텍스트와 정확히 일치해야 전송된다(안 맞으면 알리고가 거부).
const ALIGO_ENDPOINT = "https://kakaoapi.aligo.in/akv10/alimtalk/send/";

function buildMessage(quote, supplierName, supplierPhone) {
  const contact = supplierName && supplierPhone ? `${supplierName}(${supplierPhone})` : "신석주 차장(010-2939-2431)";
  return `【승강기 부품 교체 견적 안내】

안녕하세요, ${quote.siteName ?? ""} 담당자님.
안전하고 원활한 승강기 운행을 위해 아래 부품 교체 관련 견적서를 발송해 드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}

아래 버튼을 눌러 견적서 확인 후 승인(회신)해 주시면, 부품 수급 및 일정을 조율하여
신속하고 안전하게 교체 공사를 진행하도록 하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당: ${contact}`;
}

export async function sendQuoteAlimtalk({ to, quote, pdfUrl, supplierName, supplierPhone }) {
  if (!to) throw new Error("수신 전화번호가 없습니다");
  if (!pdfUrl) throw new Error("PDF 링크가 없습니다");

  // 전화번호를 숫자만 남기고 정규화 (Aligo API는 하이픈 없는 형식 요구)
  const receiver = String(to).replace(/[^0-9]/g, "");

  // 등록한 웹링크 버튼은 도메인(kdptzotxnzpuwzdguzgh.supabase.co)을 고정 등록했으므로,
  // 여기선 프로토콜을 뺀 나머지 전체 경로만 채운다.
  const link = String(pdfUrl).replace(/^https?:\/\//, "");
  const linkUrl = `https://${link}`;
  const message = buildMessage(quote, supplierName, supplierPhone);

  const body = new URLSearchParams({
    apikey: process.env.ALIGO_API_KEY,
    userid: process.env.ALIGO_USER_ID,
    senderkey: process.env.ALIGO_SENDER_KEY,
    tpl_code: process.env.ALIGO_TEMPLATE_CODE,
    sender: process.env.ALIGO_SENDER_PHONE,
    receiver_1: receiver,
    subject_1: "견적서 발송 안내",
    message_1: message,
    button_1: JSON.stringify({
      name: "견적서 확인하기",
      linkType: "WL",
      linkTypeName: "웹링크",
      linkMo: linkUrl,
      linkPc: linkUrl,
    }),
    failover: "Y",
    fsubject_1: "견적서 발송 안내",
    fmessage_1: `${message}\n\n견적서 확인: ${linkUrl}`,
  });

  const res = await fetch(ALIGO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => null);
  if (!json || json.code !== 0) {
    throw new Error(json?.message || `알림톡 발송 실패 (HTTP ${res.status})`);
  }
}
