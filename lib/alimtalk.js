// 카카오 알림톡 발송 — 솔라피(SOLAPI) API. (2026-08-05 알리고에서 전환)
//
// 전환 이유: 알리고는 발송 서버 고정 IP 등록이 필수라 Vercel(서버리스, 유동 IP)에서
// 직접 호출이 불가능해 중계 서버(relay-server/)가 필요했다. 솔라피는 API 키+HMAC 서명
// 인증이라 IP 무관 — Vercel에서 바로 쏘고, 중계 서버가 통째로 필요 없다.
//
// 알리고와 다른 점: 솔라피는 변수 치환을 API가 해준다 — 템플릿에 #{변수}로 등록해두고
// variables로 값만 넘긴다(치환된 최종 문구를 보내는 알리고 방식과 반대).
// 실패 시(카카오톡 미가입/차단 등) SMS 자동 대체발송: text+from을 함께 주면 솔라피가
// 알림톡 실패 시 그 문구로 문자를 보낸다(건당 SMS 비용 별도 — 알리고 때 확인받은 사항 동일.
// 단, 대체발송을 쓰려면 솔라피 콘솔에 발신번호(SOLAPI_SENDER_PHONE) 등록이 돼 있어야 한다).
import crypto from "crypto";

const SOLAPI_ENDPOINT = "https://api.solapi.com/messages/v4/send";

// 솔라피 HMAC-SHA256 인증 헤더 — date+salt를 시크릿으로 서명한다.
function authHeader() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("SOLAPI_API_KEY / SOLAPI_API_SECRET 환경변수가 없습니다");
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 특이사항 정리 — 이메일 안내메시지 칸과 공유하는 값이라 "■ 특이사항: " 라벨이 이미
// 붙어 있을 수 있다. 템플릿엔 라벨이 고정 텍스트로 있으므로 내용만 쓰고, 없으면 "없음".
function noticeContent(noticeMessage) {
  const stripped = String(noticeMessage ?? "").replace(/^\s*■?\s*특이사항\s*[:：]\s*/, "").trim();
  return stripped || "없음";
}

// SMS 대체발송용 최종 문구 — 솔라피 템플릿(docs/SOLAPI-SETUP.md)과 같은 내용을 직접 치환.
function buildFallbackText(quote, noticeMessage, linkUrl) {
  return `【승강기 부품 교체 견적 안내】

안녕하세요, ${quote.siteName ?? ""} 고객님.
안전하고 원활한 승강기 운행을 위해 아래 부품 교체 관련 견적서를 발송해 드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}
■ 총금액: ${quote.totalAmount != null ? Number(quote.totalAmount).toLocaleString() + "원" : ""}
■ 특이사항: ${noticeContent(noticeMessage)}

견적서 확인 후 승인(회신)해 주시면, 부품 수급 및 일정을 조율하여 신속하고 안전하게 교체 공사를 진행하도록 하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당:
신석주 차장(010-2939-2431)

견적서 확인: ${linkUrl}`;
}

export async function sendQuoteAlimtalk({ to, quote, pdfUrl, noticeMessage }) {
  if (!to) throw new Error("수신 전화번호가 없습니다");
  if (!pdfUrl) throw new Error("PDF 링크가 없습니다");
  const pfId = process.env.SOLAPI_PF_ID;
  const templateId = process.env.SOLAPI_TEMPLATE_ID;
  if (!pfId || !templateId) throw new Error("SOLAPI_PF_ID / SOLAPI_TEMPLATE_ID 환경변수가 없습니다 (채널 연동·템플릿 승인 후 콘솔에서 확인)");

  const receiver = String(to).replace(/[^0-9]/g, "");
  const link = String(pdfUrl).replace(/^https?:\/\//, ""); // 템플릿 버튼이 https://#{link} 형태
  const linkUrl = `https://${link}`;
  const sender = process.env.SOLAPI_SENDER_PHONE?.replace(/[^0-9]/g, "");

  const message = {
    to: receiver,
    // from + text가 있으면 알림톡 실패 시 SMS(LMS)로 자동 대체발송된다.
    ...(sender ? { from: sender, text: buildFallbackText(quote, noticeMessage, linkUrl), subject: "견적서 발송 안내" } : {}),
    kakaoOptions: {
      pfId,
      templateId,
      // 템플릿의 #{변수}들 — docs/SOLAPI-SETUP.md의 등록 문안과 이름이 정확히 일치해야 한다.
      variables: {
        "#{현장명}": quote.siteName ?? "",
        "#{견적명}": quote.quoteTitle ?? "",
        "#{견적일}": quote.quoteDate ?? "",
        "#{총금액}": quote.totalAmount != null ? Number(quote.totalAmount).toLocaleString() + "원" : "",
        "#{특이사항}": noticeContent(noticeMessage),
        "#{link}": link,
      },
      ...(sender ? {} : { disableSms: true }),
    },
  };

  const res = await fetch(SOLAPI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({ message }),
  });
  const json = await res.json().catch(() => null);
  // 성공 시 groupId 등이 오고, 실패 시 errorCode/errorMessage 또는 HTTP 에러.
  if (!res.ok || json?.errorCode) {
    throw new Error(json?.errorMessage || json?.message || `알림톡 발송 실패 (HTTP ${res.status})`);
  }
}
