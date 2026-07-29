// 견적서 이메일 발송 — 네이버 SMTP(회사 계정, guil2020@naver.com)로 직접 보낸다. 별도
// 이메일 API 서비스(Resend 등)는 도메인 인증 전엔 발신자 본인 이메일로만 테스트 발송이
// 가능해서, 도메인을 새로 사지 않기로 한 이번 결정에서는 실제 고객 발송이 불가능하다 —
// 네이버 SMTP는 도메인 인증 없이 바로 실제 수신자에게 발송 가능해서 이걸 쓴다.
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

// html 이메일에 삽입할 때만 esc(escapeHtml)를 넘긴다 — text/plain 파트(buildBody 기본 호출)는
// 이스케이프하면 "&amp;" 같은 문자가 그대로 보이므로 escapeHtml 없이 원문 그대로 써야 한다.
function buildBody(quote, supplierName, supplierPhone, noticeMessage, esc = (s) => s ?? "") {
  const siteName = esc(quote.siteName);
  const quoteTitle = esc(quote.quoteTitle);
  const quoteDate = esc(quote.quoteDate);
  const contact = supplierName && supplierPhone ? `${esc(supplierName)}(${esc(supplierPhone)})` : "신석주 차장(010-2939-2431)";
  const notice = noticeMessage ? `\n\n${esc(noticeMessage)}` : "";
  return `안녕하세요, ${siteName} 승강기 담당자/대표님.
안전하고 원활한 승강기 운행을 위해 부품 교체 견적서를 보내드립니다.

■ 견적명: ${quoteTitle}
■ 견적일: ${quoteDate}

첨부된 PDF 파일에서 견적서를 확인해주세요.
확인 후 승인(회신)해 주시면 부품 수급 및 일정을 조율하여 신속하고 안전하게 교체 공사를 진행하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당: ${contact}${notice}`;
}

// 견적명/현장명/안내메시지 등은 관리자가 입력하는 값이라도, 이메일 HTML에 그대로 들어가면
// 우연히 <, & 같은 문자가 섞였을 때 레이아웃이 깨지거나 의도치 않은 태그가 삽입될 수 있어 이스케이프한다.
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 첨부 PDF 파일명 — "현장명 견적명 견적서 YYMMDD.pdf" (예: "(주)서울제약 조건부 검사내역 부품교체 견적서 260728.pdf")
function pdfFilename(quote) {
  const digits = String(quote.quoteDate ?? "").replace(/-/g, "");
  const shortDate = digits.length === 8 ? digits.slice(2) : digits; // YYYYMMDD -> YYMMDD
  return [quote.siteName, quote.quoteTitle, "견적서", shortDate].filter(Boolean).join(" ") + ".pdf";
}

// 명함 이미지는 첨부파일이 아니라 메일 본문 맨 아래 인라인 이미지로 넣는다(서명처럼 보이게).
// cid로 참조하고 contentDisposition:"inline"을 줘야 대부분의 메일 클라이언트에서 첨부파일
// 목록에 안 뜨고 본문에 바로 그려진다. 파일이 없어도 본문/PDF 발송 자체는 그대로 되게 한다.
function buildHtml(quote, hasCard, supplierName, supplierPhone, noticeMessage) {
  const bodyHtml = buildBody(quote, supplierName, supplierPhone, noticeMessage, escapeHtml).replace(/\n/g, "<br>");
  const cardHtml = hasCard
    ? `<br><br><img src="cid:guilcard" alt="구일엘리베이터 명함" style="max-width:420px;width:100%;height:auto;display:block;" />`
    : "";
  return `<div style="font-family:'Malgun Gothic',sans-serif;font-size:14px;line-height:1.7;color:#222;">${bodyHtml}${cardHtml}</div>`;
}

export async function sendQuoteEmail({ to, cc, quote, pdfUrl, supplierName, supplierPhone, noticeMessage, attachmentUrls }) {
  if (!to) throw new Error("수신 이메일이 없습니다");

  const transporter = nodemailer.createTransport({
    host: "smtp.naver.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.NAVER_SMTP_USER,
      pass: process.env.NAVER_SMTP_APP_PASSWORD,
    },
  });

  const pdfRes = await fetch(pdfUrl);
  if (!pdfRes.ok) throw new Error(`PDF 다운로드 실패: ${pdfRes.status}`);
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  const cardPath = path.join(process.cwd(), "public/guil-card.jpg");
  const hasCard = fs.existsSync(cardPath);

  const attachments = [{ filename: pdfFilename(quote), content: pdfBuffer }];
  if (hasCard) {
    attachments.push({
      filename: "guil-card.jpg",
      content: fs.readFileSync(cardPath),
      cid: "guilcard",
      contentDisposition: "inline",
    });
  }
  for (const att of attachmentUrls ?? []) {
    const attRes = await fetch(att.url);
    if (attRes.ok) {
      attachments.push({ filename: att.name, content: Buffer.from(await attRes.arrayBuffer()) });
    }
  }

  await transporter.sendMail({
    from: `"구일엘리베이터(주)" <${process.env.NAVER_SMTP_USER}>`,
    to,
    cc: cc && cc.length ? cc.join(",") : undefined,
    subject: `[구일엘리베이터] 견적서 안내 - ${quote.siteName ?? ""}`,
    text: buildBody(quote, supplierName, supplierPhone, noticeMessage),
    html: buildHtml(quote, hasCard, supplierName, supplierPhone, noticeMessage),
    attachments,
  });
}
