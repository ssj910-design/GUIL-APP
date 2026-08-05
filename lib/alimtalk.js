// 카카오 알림톡 발송 — 알리고(Aligo) API. 실패 시(카카오톡 미가입/차단 등) SMS로 자동
// 대체발송되도록 failover=Y로 호출한다(건당 SMS 비용 별도 발생, 이미 확인받은 사항).
//
// 알리고는 변수 치환을 API가 하지 않는다 — message_1엔 #{현장명} 등 변수를
// 실제 값으로 이미 치환된 최종 문구를 그대로 넣어서 보내야 하고, 승인된 템플릿의 고정
// 텍스트와 정확히 일치해야 전송된다(안 맞으면 알리고가 거부).
const ALIGO_ENDPOINT = "https://kakaoapi.aligo.in/akv10/alimtalk/send/";

// 카카오 검수 반려 사유(다발성 메시지 — 신규 견적마다 반복 발송) 대응으로 특이사항 줄과
// 하단 고정 안내 문구를 추가해 재승인받은 템플릿(2026-07-31). 이 고정 텍스트는 승인된
// 알림톡 템플릿과 정확히 일치해야 하므로 동적으로 바꿀 수 없다(바꾸면 알리고가 템플릿
// 불일치로 발송을 거부함) — 이메일과 달리 여기선 항상 이 문구 그대로 보낸다.
// noticeMessage는 이메일 안내메시지 칸과 공유하는 값이라, 이미 "■ 특이사항: " 라벨이
// 붙어 있을 수 있다 — 템플릿엔 그 라벨이 고정 텍스트로 이미 있으므로 중복을 피하려고
// 앞의 라벨은 떼고 내용만 쓴다. 내용이 없으면 "없음"으로 채운다(템플릿 줄은 뺄 수 없음).
function noticeContent(noticeMessage) {
  const stripped = String(noticeMessage ?? "").replace(/^\s*■?\s*특이사항\s*[:：]\s*/, "").trim();
  return stripped || "없음";
}

function buildMessage(quote, noticeMessage) {
  return `【승강기 부품 교체 견적 안내】

안녕하세요, ${quote.siteName ?? ""} 고객님.
안전하고 원활한 승강기 운행을 위해 아래 부품 교체 관련 견적서를 발송해 드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}
■ 특이사항: ${noticeContent(noticeMessage)}

아래 버튼을 눌러 견적서 확인 후 승인(회신)해 주시면, 부품 수급 및 일정을 조율하여 신속하고 안전하게 교체 공사를 진행하도록 하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당:
신석주 차장(010-2939-2431)

※ 이 메시지는 승강기 유지보수 계약에 따라 부품 교체가 필요한 경우 발송됩니다.`;
}

export async function sendQuoteAlimtalk({ to, quote, pdfUrl, noticeMessage }) {
  if (!to) throw new Error("수신 전화번호가 없습니다");
  if (!pdfUrl) throw new Error("PDF 링크가 없습니다");

  // 전화번호를 숫자만 남기고 정규화 (Aligo API는 하이픈 없는 형식 요구)
  const receiver = String(to).replace(/[^0-9]/g, "");

  // 등록한 웹링크 버튼은 도메인(kdptzotxnzpuwzdguzgh.supabase.co)을 고정 등록했으므로,
  // 여기선 프로토콜을 뺀 나머지 전체 경로만 채운다.
  const link = String(pdfUrl).replace(/^https?:\/\//, "");
  const linkUrl = `https://${link}`;
  const message = buildMessage(quote, noticeMessage);

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

  // 알리고는 발송 서버 IP를 화이트리스트에 등록해야만 호출을 받아준다. Vercel은
  // 서버리스라 고정 IP가 없어서 직접 호출이 막히므로, 고정 IP를 가진 별도 서버
  // (relay-server/ 참고)를 거쳐서 보낸다. 그 서버 정보가 없으면(로컬 개발 등)
  // 알리고를 직접 호출한다 — 그땐 IP 인증 에러가 나는 게 정상이다.
  const relayUrl = process.env.ALIMTALK_RELAY_URL;
  const res = relayUrl
    ? await fetch(`${relayUrl.replace(/\/$/, "")}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Relay-Secret": process.env.ALIMTALK_RELAY_SECRET ?? "",
        },
        body,
      })
    : await fetch(ALIGO_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
  const json = await res.json().catch(() => null);
  if (!json || json.code !== 0) {
    throw new Error(json?.message || `알림톡 발송 실패 (HTTP ${res.status})`);
  }
}
