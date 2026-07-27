// 견적서 이메일 발송 — 네이버 SMTP(회사 계정, guil2020@naver.com)로 직접 보낸다. 별도
// 이메일 API 서비스(Resend 등)는 도메인 인증 전엔 발신자 본인 이메일로만 테스트 발송이
// 가능해서, 도메인을 새로 사지 않기로 한 이번 결정에서는 실제 고객 발송이 불가능하다 —
// 네이버 SMTP는 도메인 인증 없이 바로 실제 수신자에게 발송 가능해서 이걸 쓴다.
import nodemailer from "nodemailer";

function buildBody(quote) {
  return `안녕하세요, ${quote.siteName ?? ""} 담당자님.
안전하고 원활한 승강기 운행을 위해 아래 부품 교체 관련 견적서를 보내드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}

첨부된 PDF 파일에서 견적서를 확인해주세요. 확인 후 승인(회신)해 주시면 부품 수급 및 일정을
조율하여 신속하고 안전하게 교체 공사를 진행하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당: 신석주 차장(010-2939-2431)`;
}

export async function sendQuoteEmail({ to, quote, pdfUrl }) {
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

  await transporter.sendMail({
    from: `"구일엘리베이터(주)" <${process.env.NAVER_SMTP_USER}>`,
    to,
    subject: `[구일엘리베이터] 견적서 안내 - ${quote.siteName ?? ""}`,
    text: buildBody(quote),
    attachments: [{ filename: "견적서.pdf", content: pdfBuffer }],
  });
}
