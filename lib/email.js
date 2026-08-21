// 견적서 이메일 발송 — 네이버 SMTP(회사 계정, guil2020@naver.com)로 직접 보낸다. 별도
// 이메일 API 서비스(Resend 등)는 도메인 인증 전엔 발신자 본인 이메일로만 테스트 발송이
// 가능해서, 도메인을 새로 사지 않기로 한 이번 결정에서는 실제 고객 발송이 불가능하다 —
// 네이버 SMTP는 도메인 인증 없이 바로 실제 수신자에게 발송 가능해서 이걸 쓴다.
import nodemailer from "nodemailer";
import { BRAND } from "./company.js";

// html 이메일에 삽입할 때만 esc(escapeHtml)를 넘긴다 — text/plain 파트(buildBody 기본 호출)는
// 이스케이프하면 "&amp;" 같은 문자가 그대로 보이므로 escapeHtml 없이 원문 그대로 써야 한다.
function buildMessage(quote, noticeMessage, esc = (s) => s ?? "") {
  const siteName = esc(quote.siteName);
  const quoteTitle = esc(quote.quoteTitle);
  const quoteDate = esc(quote.quoteDate);
  const noticeLine = noticeMessage ? `\n■ 특이사항: ${esc(noticeMessage)}` : "";
  return `안녕하세요, ${siteName} 승강기 담당자/대표님.
안전하고 원활한 승강기 운행을 위해 부품 교체 견적서를 보내드립니다.

■ 견적명: ${quoteTitle}
■ 견적일: ${quoteDate}${noticeLine}

첨부된 PDF 파일에서 견적서를 확인해주세요.
확인 후 승인(회신)해 주시면 부품 수급 및 일정을 조율하여 신속하고 안전하게 교체 공사를 진행하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.`;
}

// 메일 하단 서명 — 일반 텍스트 클라이언트용(TEXT_SIGNATURE)과 회사 로고·연락처가 들어간
// HTML 표(HTML_SIGNATURE) 두 가지를 따로 둔다. HTML 서명은 buildMessage의 이스케이프·개행
// 치환 파이프라인을 거치면 태그가 깨지므로 buildHtml에서 별도로 이어붙인다.
const TEXT_SIGNATURE = `구일엘리베이터 / 신석주
E-Mail : guil2020@naver.com
Tel : 02-588-2384 / Phone : 010-2939-2431 / Fax : 02-525-2475
서울시 금천구 가산디지털1로 75-24 아이에스비즈타워 909호`;

const HTML_SIGNATURE = `<table><tbody><tr><td width="50"><img width="50" height="75" style="width: 50px; height: 75px;" src="https://postfiles.pstatic.net/MjAyMDAyMTdfMTg1/MDAxNTgxOTIxMzE4MjEz.MW6PUo6WZq9agAQXa8fm821Z119EbX-vlwsrmFUzqXsg.ajT1qwDMY-nAYIj1YcdxOACvft1H-xuKj4CvkRgExyog.PNG.guil2020/ì œëª©_ì—†ìŒ.png?type=w966" loading="lazy"></td><td width="403"><table width="95%" height="58" border="0" cellspacing="0" cellpadding="0"><tbody><tr><td align="left" width="48%" style="color: rgb(0, 102, 51); font-family: A048견명조,arial,simsun,MS Gothic; font-size: 14px; font-weight: bold;"><p><span> </span> </p><p><span>구일엘리베이터 / 신석주</span> </p></td></tr><tr><td align="left" style="color: rgb(102, 102, 102); font-family: Gulim,arial,simsun,MS Gothic; font-size: 11px;">E-Mail : <a href="mailto:guil2020@naver.com" rel="noreferrer noopener" target="_blank">guil2020@naver.com</a></td></tr><tr><td align="left" style="color: rgb(102, 102, 102); font-family: Gulim,arial,simsun,MS Gothic; font-size: 11px;">Tel : 02-588-2384 / Phone : 010-2939-2431 / Fax : 02-525-2475</td></tr><tr><td align="left" style="color: rgb(102, 102, 102); font-family: Gulim,arial,simsun,MS Gothic; font-size: 11px;">서울시 금천구 가산디지털1로 75-24 아이에스비즈타워 909호</td></tr><tr><td align="left" style="color: rgb(102, 102, 102); font-family: Gulim,arial,simsun,MS Gothic; font-size: 11px;"> </td></tr></tbody></table></td></tr></tbody></table>`;

function buildBody(quote, noticeMessage) {
  return `${buildMessage(quote, noticeMessage)}\n\n${TEXT_SIGNATURE}`;
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

function buildHtml(quote, noticeMessage) {
  const bodyHtml = buildMessage(quote, noticeMessage, escapeHtml).replace(/\n/g, "<br>");
  return `<div style="font-family:'Malgun Gothic',sans-serif;font-size:14px;line-height:1.7;color:#222;">${bodyHtml}<br><br>${HTML_SIGNATURE}</div>`;
}

export async function sendQuoteEmail({ to, cc, quote, pdfUrl, noticeMessage, attachmentUrls }) {
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

  const attachments = [{ filename: pdfFilename(quote), content: pdfBuffer }];
  for (const att of attachmentUrls ?? []) {
    const attRes = await fetch(att.url);
    if (attRes.ok) {
      attachments.push({ filename: att.name, content: Buffer.from(await attRes.arrayBuffer()) });
    }
  }

  await transporter.sendMail({
    from: `"${BRAND.name}" <${process.env.NAVER_SMTP_USER}>`,
    to,
    cc: cc && cc.length ? cc.join(",") : undefined,
    subject: `[${BRAND.short}] 견적서 안내 - ${quote.siteName ?? ""}`,
    text: buildBody(quote, noticeMessage),
    html: buildHtml(quote, noticeMessage),
    attachments,
  });
}
