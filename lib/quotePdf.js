// lib/quotePdf.js
// 견적서 PDF를 코드로 직접 그린다 (기존 엑셀/PDF 양식은 배경으로 쓰지 않음 — 품목 줄
// 수가 원본 양식의 고정 칸(자재비 5줄/인건비 6줄)을 넘는 경우가 잦아서, 대신 레이아웃을
// 코드로 재현해 줄 수 제한 없이 자동 페이지분할되게 한다).
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { numberToKoreanWon } from "./koreanNumber.js";

const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN_X = 40;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 50;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const ACCENT = rgb(0.80, 0.22, 0.10); // 로고의 오렌지-레드 톤에 맞춤
const HEADER_BG = rgb(0.95, 0.95, 0.96);
const TOTAL_BG = rgb(0.98, 0.93, 0.90); // ACCENT 톤을 옅게

const COMPANY = {
  name: "구일엘리베이터㈜",
  regNo: "등록번호. 119-86-31892",
  bizType: "업태. 서비스업  종목. 승강기유지관리,보수,설치공사",
  address: "서울특별시 금천구 가산디지털1로 75-24 아이에스비즈타워 909호",
  contact: "T. 02-588-2384  P. 010-2939-2431  F. 02-588-2384",
  email: "E. guil2020@naver.com   E. guil2383@naver.com",
  ceo: "대표이사 신 석 주",
};

const NOTES = [
  "1) 교체된 부품 보증기간은 1년입니다.",
  "2) 폐기물처리관리법에 의거해 교체된 불량 PCB류, 로프, 벨트, 풀리, 쉬브, 모터ASSY 등은 환경보호 및",
  "   임의 수리 재사용시 품질 신뢰성 등 안전상의 목적으로 전량 회수를 원칙으로 하고 있으며, 본",
  "   견적서에 동의함으로써 구일E/L의 폐부품 무상수거에 동의합니다.",
  "3) 작업은 당사의 평일 근무시간(월~금, 09:00~17:30)에 실시하며, 근무시간 외 작업 요청시 구간 별",
  "   인건비(평일근무시간 인건비*1.5)가 가산됩니다.",
];

// ponytail: 품명이 칸보다 길면 줄바꿈하지 않고 잘라낸다(말줄임). 실제로 자주 넘치면
// 그때 wrapText 로 업그레이드.
const COLS = [
  { key: "name", label: "품명", width: 155, align: "left" },
  { key: "unitNo", label: "호기", width: 45, align: "center" },
  { key: "spec", label: "규격", width: 85, align: "left" },
  { key: "unit", label: "단위", width: 40, align: "center" },
  { key: "qty", label: "수량", width: 40, align: "right" },
  { key: "unitPrice", label: "단가", width: 75, align: "right" },
  { key: "amount", label: "금액", width: 75, align: "right" },
];
const ROW_H = 18;
const HEADER_H = 20;

function fmtMoney(n) {
  return Math.round(Number(n) || 0).toLocaleString("ko-KR");
}

function truncateToWidth(font, size, text, maxWidth) {
  let str = String(text ?? "");
  while (str.length > 0 && font.widthOfTextAtSize(str, size) > maxWidth) {
    str = str.slice(0, -1);
  }
  return str;
}

export async function buildQuotePdfBytes(quote) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontPath = path.join(process.cwd(), "public/fonts/NanumGothic-Regular.ttf");
  const fontBoldPath = path.join(process.cwd(), "public/fonts/NanumGothic-Bold.ttf");
  const font = await pdfDoc.embedFont(fs.readFileSync(fontPath));
  const fontBold = await pdfDoc.embedFont(fs.readFileSync(fontBoldPath));

  // 로고는 PNG가 아니라 회사 원본 벡터(PDF, 재단선 제거된 크롭본)를 그대로 삽입한다 —
  // 래스터 변환 없이 어떤 크기로 그려도 해상도 손실이 없다.
  let logoPage = null;
  const logoPath = path.join(process.cwd(), "public/guil-logo.pdf");
  if (fs.existsSync(logoPath)) {
    try {
      const logoDoc = await PDFDocument.load(fs.readFileSync(logoPath));
      [logoPage] = await pdfDoc.embedPdf(logoDoc);
    } catch {
      logoPage = null; // 임베드 실패하면 텍스트로 대체(아래에서 처리)
    }
  }

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  function ensureSpace(needed) {
    if (y - needed < MARGIN_BOTTOM) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
    }
  }

  function text(str, x, size, opts = {}) {
    page.drawText(String(str ?? ""), {
      x, y, size, font: opts.bold ? fontBold : font,
      color: opts.color ?? rgb(0, 0, 0),
    });
  }

  function line(fromX, toX, thickness = 1) {
    page.drawLine({ start: { x: fromX, y }, end: { x: toX, y }, thickness, color: rgb(0.2, 0.2, 0.2) });
  }

  // --- 헤더: 로고 + 타이틀 (같은 가로줄에 정렬) ---
  ensureSpace(70);
  const logoH = 34;
  if (logoPage) {
    const logoW = (logoPage.width / logoPage.height) * logoH;
    page.drawPage(logoPage, { x: MARGIN_X, y: y - logoH, width: logoW, height: logoH });
  } else {
    page.drawText("GUIL ELEVATOR", { x: MARGIN_X, y: y - logoH / 2 - 7, size: 20, font: fontBold, color: ACCENT });
  }
  // 로고 박스(y ~ y-logoH)의 세로 중앙에 타이틀 글자의 시각적 중앙이 오도록 baseline 보정
  page.drawText("견   적   서", { x: MARGIN_X + CONTENT_W - 130, y: y - logoH / 2 - 9, size: 24, font: fontBold, color: ACCENT });
  y -= 44;
  page.drawRectangle({ x: MARGIN_X, y: y - 2, width: CONTENT_W, height: 2.5, color: ACCENT });
  y -= 18;

  // --- No. / 수신자 / 견적명 / 견적일 / 유효기간 (좌) + 공급자 정보(우) ---
  ensureSpace(110);
  const leftX = MARGIN_X;
  const rightX = MARGIN_X + 230;
  const rightW = CONTENT_W - 230;
  const infoRows = [
    ["No.", quote.quoteNumber || "-"],
    ["수신자", quote.recipientName || "귀중"],
    ["견적명", quote.quoteTitle || ""],
    ["견적일", quote.quoteDate || ""],
    ["유효기간", "견적일로부터 1개월"],
  ];
  const infoValueW = rightX - (leftX + 55) - 10; // 견적명처럼 긴 값이 우측 공급자 정보란을 침범하지 않도록 제한
  const infoStartY = y;
  infoRows.forEach(([label, value]) => {
    text(label, leftX, 9, { bold: true });
    text(truncateToWidth(font, 9, value, infoValueW), leftX + 55, 9);
    y -= 14;
  });
  y = infoStartY;
  [
    `공급자 ${COMPANY.name}  ${COMPANY.regNo}`,
    COMPANY.bizType,
    COMPANY.address,
    COMPANY.contact,
    COMPANY.email,
  ].forEach((line2) => {
    text(truncateToWidth(font, 8, line2, rightW), rightX, 8);
    y -= 13;
  });
  y = infoStartY - 5 * 14 - 10;
  text(COMPANY.ceo + " (Confirmed and Signed by)", rightX, 8);
  y -= 20;

  // --- 일금 OOO원정 ---
  ensureSpace(30);
  const totalItems = (quote.items ?? []).reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
  const subtotal = totalItems + Number(quote.transportCost || 0) + Number(quote.safetyCost || 0) + Number(quote.profit || 0);
  const grandTotal = Math.floor(subtotal / 1000) * 1000;
  text(numberToKoreanWon(grandTotal), MARGIN_X, 11, { bold: true });
  y -= 16;
  text(`(￦ ${fmtMoney(grandTotal)}원정), VAT별도`, MARGIN_X, 9);
  y -= 24;

  // --- 품목 테이블 헤더 ---
  function drawTableHeader() {
    ensureSpace(HEADER_H + ROW_H);
    page.drawRectangle({ x: MARGIN_X, y: y - HEADER_H, width: CONTENT_W, height: HEADER_H, color: HEADER_BG });
    let x = MARGIN_X;
    y -= 7; // 9pt 글자 상단이 회색 박스 위 경계를 넘지 않도록(전엔 4pt라 살짝 삐져나왔음)
    // 헤더 라벨도 각 열의 정렬(align)을 그대로 따른다 — drawRow의 cellX 계산과 동일한 규칙.
    // 예전엔 헤더가 항상 왼쪽 정렬이라 수량/단가/금액처럼 우측 정렬되는 열은 데이터와
    // 어긋나 보였다(칸이 안 맞는 것처럼 보이는 원인).
    COLS.forEach((col) => {
      const w = fontBold.widthOfTextAtSize(col.label, 9);
      const cellX = col.align === "right" ? x + col.width - 6 - w : col.align === "center" ? x + col.width / 2 - w / 2 : x + 4;
      text(col.label, cellX, 9, { bold: true });
      x += col.width;
    });
    y -= HEADER_H - 7;
    line(MARGIN_X, MARGIN_X + CONTENT_W, 1);
    y -= 10; // 4pt였을 땐 다음 줄(예: "1.자재비") 글자 위쪽이 이 선과 겹쳐 취소선처럼 보였음
  }
  drawTableHeader();

  function drawRow(cells, opts = {}) {
    ensureSpace(ROW_H);
    let x = MARGIN_X;
    COLS.forEach((col) => {
      const raw = cells[col.key] ?? "";
      const str = truncateToWidth(opts.bold ? fontBold : font, 9, raw, col.width - 8);
      const w = (opts.bold ? fontBold : font).widthOfTextAtSize(str, 9);
      const cellX = col.align === "right" ? x + col.width - 6 - w : col.align === "center" ? x + col.width / 2 - w / 2 : x + 4;
      text(str, cellX, 9, { bold: opts.bold, color: opts.color });
      x += col.width;
    });
    y -= ROW_H;
  }

  function drawSectionLabel(label) {
    ensureSpace(ROW_H);
    text(label, MARGIN_X + 4, 9, { bold: true, color: ACCENT });
    y -= ROW_H;
  }

  ["자재비", "인건비"].forEach((category, idx) => {
    drawSectionLabel(`${idx + 1}.${category}`);
    const rows = (quote.items ?? []).filter((it) => it.category === category);
    rows.forEach((it) => {
      const amount = Number(it.qty || 0) * Number(it.unitPrice || 0);
      drawRow({
        name: it.name, unitNo: it.unitNo, spec: it.spec, unit: it.unit,
        qty: it.qty, unitPrice: fmtMoney(it.unitPrice), amount: fmtMoney(amount),
      });
    });
  });

  drawRow({ name: "3.운반비", spec: "운반비 및 폐자재수거", amount: fmtMoney(quote.transportCost) });
  drawRow({ name: "4.안전관리비 및 기타", spec: "", amount: fmtMoney(quote.safetyCost) });
  drawRow({ name: "5.이윤", amount: fmtMoney(quote.profit) });

  ensureSpace(ROW_H * 2 + 10);
  line(MARGIN_X, MARGIN_X + CONTENT_W, 1);
  y -= 10; // 위와 동일한 이유로 4pt → 10pt (선이 "소계" 글자와 겹치던 문제)
  // 위쪽에 여유를 더 둬서(+4 → +8) "소계" 글자 상단이 박스 밖으로 삐져나오지 않게 함
  page.drawRectangle({ x: MARGIN_X, y: y - ROW_H * 2, width: CONTENT_W, height: ROW_H * 2 + 8, color: TOTAL_BG });
  drawRow({ name: "소계(1+2+3+4+5)", amount: fmtMoney(subtotal) }, { bold: true });
  drawRow({ name: "합계(VAT별도)", spec: "천단위 절사", amount: fmtMoney(grandTotal) }, { bold: true, color: ACCENT });
  line(MARGIN_X, MARGIN_X + CONTENT_W, 1);
  y -= 16;

  // --- 특이사항 ---
  ensureSpace(14 * (NOTES.length + 1));
  text("특이사항", MARGIN_X, 9, { bold: true });
  y -= 14;
  NOTES.forEach((n) => {
    ensureSpace(14);
    text(n, MARGIN_X, 8);
    y -= 13;
  });

  return pdfDoc.save();
}
