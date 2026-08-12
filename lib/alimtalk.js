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

// 총금액 표기 — 견적서 PDF와 같은 계산 결과(quote.totalAmount, 천단위 절사)를 "1,234,000원" 형태로.
function formatTotal(quote) {
  const n = Number(quote.totalAmount);
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString()}원 (VAT별도)` : "견적서 참조";
}

// SMS 대체발송용 최종 문구 — 솔라피에 실제 등록된 템플릿(2026-08-05, "견적 발송")과 같은 내용을 직접 치환.
function buildFallbackText(quote, noticeMessage, linkUrl) {
  return `안녕하세요, ${quote.siteName ?? ""} 고객님.
원활한 승강기 운행을 위해 관련 부품 교체 견적서를 발송드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}
■ 총금액: ${formatTotal(quote)}
■ 특이사항: ${noticeContent(noticeMessage)}

견적서를 확인 후 승인(회신)해 주시면, 부품 수급 및 일정을 조율하여 신속하고 안전하게 교체 공사를 진행하도록 하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

■견적 담당:
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
  // 2026-08-12: 템플릿 버튼을 "https://guil-app-pi.vercel.app/quote-view?url=#{link}"
  // 형태(우리 도메인 고정, app/quote-view/page.js가 구글 문서뷰어로 PDF를 임베드해 보여줌)로
  // 다시 등록해 재심사 요청함 — 카카오 인앱브라우저가 원래 도메인 밖(구 뷰어 시도들)은
  // "정체 불명 응답"으로 막던 문제를 이걸로 피하려는 시도. #{link}에는 quote-view가 받는
  // url= 값(PDF 전체 URL, 인코딩)을 그대로 넣는다.
  //
  // ⚠️ 이 재심사 템플릿이 실제로 승인되고 SOLAPI_TEMPLATE_ID가 새 템플릿 ID로 바뀌기 전까지는
  // 이 변경을 배포하면 안 된다 — 지금 승인돼 있는 구 템플릿(도메인이 supabase.co로 고정된
  // "https://kdptzotxnzpuwzdguzgh.supabase.co/#{link}")은 #{link}에 PDF의 경로만 기대하므로,
  // 여기서 전체 URL을 넣으면 구 템플릿에서는 오히려 링크가 깨진다.
  const linkUrl = pdfUrl;
  const link = encodeURIComponent(pdfUrl);
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
        "#{총금액}": formatTotal(quote),
        "#{특이사항}": noticeContent(noticeMessage),
        // 버튼 링크가 "https://…supabase.co/#{link}" 형태라 경로만 넘긴다.
        // (구 템플릿 KA01TP2608050809…는 버튼이 도메인 고정이라 이 변수가 없었다 — 그 템플릿을
        //  쓰면 "변수 불일치"로 발송이 거부되므로 SOLAPI_TEMPLATE_ID가 사본 쪽인지 확인할 것)
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
  // 여기까지는 "솔라피가 접수함"일 뿐 — 고객 폰 도착 여부는 나중에 웹훅(SINGLE-REPORT)이 알려준다.
  // 그때 이 messageId로 발송 이력을 찾아 상태를 갱신한다 (app/api/solapi-webhook).
  return { messageId: json?.messageId ?? null, groupId: json?.groupId ?? null };
}
