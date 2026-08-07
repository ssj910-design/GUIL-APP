// lib/quotePdf.js
// 견적서 PDF를 코드로 직접 그린다 (기존 엑셀/PDF 양식은 배경으로 쓰지 않음 — 품목 줄
// 수가 원본 양식의 고정 칸을 넘는 경우가 잦아서, 대신 레이아웃을 코드로 재현해 줄 수
// 제한 없이 자동 페이지분할되게 한다).
//
// 2026-08-07 리디자인: quote_redesign.html 시안을 pdf-lib로 재현했다. 그 시안은
// Playwright로 만든 HTML/CSS 프로토타입이었고, 거기 쓰인 CSS px 값은 실측(Playwright로
// 뽑은 PDF의 실제 글자 크기 pt를 PyMuPDF로 역산)해 보니 1px = 0.75pt로 정확히 대응돼서
// (예: font-size:12px → 실제 9pt), 아래 숫자들은 전부 "그 CSS px * 0.75"로 환산한 값이다.
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { numberToKoreanWon } from "./koreanNumber.js";
import { COMPANY } from "./company.js";

const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN_X = 39.69; // 14mm
const MARGIN_TOP = 34.02; // 12mm
const MARGIN_BOTTOM = 22.68; // 8mm
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const INK = rgb(0.078, 0.094, 0.122);
const AMBER = rgb(1, 0.690, 0.125);
const AMBER_TINT = rgb(1, 0.965, 0.902);
const AMBER_TINT_BORDER = rgb(0.949, 0.875, 0.722);
const RED = rgb(0.831, 0.180, 0.149);
const STEEL = rgb(0.337, 0.365, 0.408);
const STEEL_SOFT = rgb(0.541, 0.565, 0.608);
const LINE = rgb(0.863, 0.867, 0.847);
const WHITE = rgb(1, 1, 1);
const VAT_GRAY = rgb(0.667, 0.690, 0.733); // #aab0bb, 금액바 "VAT 별도"

// 2번만 강조 표시(폐부품 무상수거 동의 조항이라 눈에 띄어야 함) — 원 배지 색은 항상 amber.
const NOTES = [
  { text: "교체된 부품 보증기간은 1년입니다.", emphasis: false },
  {
    text: "폐기물처리관리법에 의거해 교체된 불량 PCB류, 로프, 벨트, 풀리, 쉬브, 모터ASSY 등은 환경보호 및 임의 수리 재사용 시 품질 신뢰성 등 안전상의 목적으로 전량 회수를 원칙으로 하며, 본 견적서에 동의함으로써 구일E/L의 폐부품 무상수거에 동의합니다.",
    emphasis: true,
  },
  {
    text: "작업은 당사의 평일 근무시간(월~금, 09:00~17:30)에 실시하며, 근무시간 외 작업 요청 시 구간별 인건비(평일근무시간 인건비×1.5)가 가산됩니다.",
    emphasis: false,
  },
];

// ponytail: 품명이 칸보다 길면 줄바꿈하지 않고 잘라낸다(말줄임). 실제로 자주 넘치면
// 그때 wrapText 로 업그레이드.
const COLS = [
  { key: "name", label: "품명", width: 140, align: "left" },
  { key: "unitNo", label: "호기", width: 28, align: "center" },
  { key: "spec", label: "규격", width: 130, align: "center" },
  { key: "unit", label: "단위", width: 30, align: "center" },
  { key: "qty", label: "수량", width: 37, align: "right" },
  { key: "unitPrice", label: "단가", width: 75, align: "right" },
  { key: "amount", label: "금액", width: 75, align: "right" },
];
const ROW_H = 23;
const HEADER_H = 22;

function fmtMoney(n) {
  return Math.round(Number(n) || 0).toLocaleString("ko-KR");
}

// "1호기"처럼 뒤에 "호기"가 붙어 있으면 떼고 숫자만 남긴다 — 칸이 좁아서 그대로 넣으면
// "1"이 아니라 "1호기"라 자리를 더 차지한다. 입력값 자체는 안 건드리고 PDF 표시만 줄인다.
function shortUnitNo(v) {
  return String(v ?? "").replace(/\s*호기\s*$/, "");
}

function truncateToWidth(font, size, text, maxWidth) {
  let str = String(text ?? "");
  while (str.length > 0 && font.widthOfTextAtSize(str, size) > maxWidth) {
    str = str.slice(0, -1);
  }
  return str;
}

// 실제 가로 폭(maxWidth)에 맞춰 공백 기준으로 줄바꿈한다.
function wrapText(font, size, str, maxWidth) {
  const words = str.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(trial, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// 둥근 모서리 사각형 — pdf-lib에 전용 API가 없어 SVG path로 그린다. (x,yTop)은 박스의
// 좌상단 모서리이고, 실측해보니 drawSvgPath는 y가 아래로 증가하는 SVG 좌표계를 그대로
// 따른다(뒤집히지 않음) — 그래서 이 프로젝트의 "y가 아래로 갈수록 작아지는" 커서와
// 방향이 반대라, 내부적으로 y: yTop - h를 anchor로 넘겨 위→아래로 그려지게 맞춘다.
function roundedRectPath(w, h, r) {
  return `M ${r},0 H ${w - r} Q ${w},0 ${w},${r} V ${h - r} Q ${w},${h} ${w - r},${h} H ${r} Q 0,${h} 0,${h - r} V ${r} Q 0,0 ${r},0 Z`;
}
function drawRoundedRect(page, { x, yTop, w, h, r = 8, color, borderColor, borderWidth }) {
  page.drawSvgPath(roundedRectPath(w, h, r), { x, y: yTop, color, borderColor, borderWidth });
}

export async function buildQuotePdfBytes(quote) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontPath = path.join(process.cwd(), "public/fonts/NanumGothic-Regular.ttf");
  const fontBoldPath = path.join(process.cwd(), "public/fonts/NanumGothic-Bold.ttf");
  const font = await pdfDoc.embedFont(fs.readFileSync(fontPath));
  const fontBold = await pdfDoc.embedFont(fs.readFileSync(fontBoldPath));

  // 로고는 아이콘 마크만(회사명 워드마크 없이) 쓴다 — public/guil-icon.png, 원본
  // 로고(public/guil-logo.pdf, 아이콘+영문 워드마크+한글 회사명 통짜 벡터)에서 아이콘
  // 부분만 잘라낸 별도 자산이다. 회사명은 이미지가 아니라 실제 텍스트로 옆에 그린다.
  let iconImage = null;
  const iconPath = path.join(process.cwd(), "public/guil-icon.png");
  if (fs.existsSync(iconPath)) {
    try {
      iconImage = await pdfDoc.embedPng(fs.readFileSync(iconPath));
    } catch {
      iconImage = null;
    }
  }

  // 사용인감(대표이사 직인) — 있으면 서명란 옆에 찍는다. 없어도 그냥 생략.
  let sealImage = null;
  const sealPath = path.join(process.cwd(), "public/guil-seal.png");
  if (fs.existsSync(sealPath)) {
    try {
      sealImage = await pdfDoc.embedPng(fs.readFileSync(sealPath));
    } catch {
      sealImage = null;
    }
  }

  const totalItems = (quote.items ?? []).reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
  const subtotal = totalItems + Number(quote.transportCost || 0) + Number(quote.safetyCost || 0) + Number(quote.profit || 0);
  const grandTotal = Math.floor(subtotal / 1000) * 1000;

  function renderLayout() {
    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN_TOP;

    function ensureSpace(needed) {
      if (y - needed < MARGIN_BOTTOM) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN_TOP;
      }
    }
    function text(str, x, yPos, size, opts = {}) {
      page.drawText(String(str ?? ""), {
        x, y: yPos, size, font: opts.bold ? fontBold : font,
        color: opts.color ?? INK,
      });
    }
    function line(fromX, toX, atY, thickness, color) {
      page.drawLine({ start: { x: fromX, y: atY }, end: { x: toX, y: atY }, thickness, color });
    }
    // 자간(letter-spacing)을 준 텍스트 — "견 적 서" 타이틀 전용. 오른쪽 끝(rightEdge)에
    // 맞춰 그리기 위해 먼저 전체 폭을 구해 시작 x를 역산한다.
    function letterSpacedWidth(str, size, spacing) {
      return [...str].reduce((w, ch) => w + fontBold.widthOfTextAtSize(ch, size), 0) + spacing * (str.length - 1);
    }
    function drawLetterSpaced(str, rightEdge, atY, size, spacing, color) {
      let cx = rightEdge - letterSpacedWidth(str, size, spacing);
      for (const ch of str) {
        page.drawText(ch, { x: cx, y: atY, size, font: fontBold, color });
        cx += fontBold.widthOfTextAtSize(ch, size) + spacing;
      }
    }

    // ---------------------------------------------------------------- 헤더
    ensureSpace(40);
    const iconH = 30;
    const iconW = iconImage ? (iconImage.width / iconImage.height) * iconH : 0;
    const headerRowH = Math.max(iconH, 16.5 * 1.2);
    const headerTopY = y;
    const iconY = headerTopY - headerRowH / 2 - iconH / 2;
    if (iconImage) page.drawImage(iconImage, { x: MARGIN_X, y: iconY, width: iconW, height: iconH });
    const nameSize = 16.5;
    const nameAscent = fontBold.heightAtSize(nameSize, { descender: false });
    text("구일엘리베이터(주)", MARGIN_X + iconW + 9, headerTopY - headerRowH / 2 - nameAscent / 2, nameSize, { bold: true });

    const titleSize = 25.5;
    const titleAscent = fontBold.heightAtSize(titleSize, { descender: false });
    drawLetterSpaced("견적서".split("").join(" "), MARGIN_X + CONTENT_W, headerTopY - headerRowH / 2 - titleAscent / 2, titleSize, 3.2, INK);
    y = headerTopY - headerRowH - 10.5;
    line(MARGIN_X, MARGIN_X + CONTENT_W, y, 2.25, INK);
    y -= 12;

    // ---------------------------------------------------------- 정보란 (좌우)
    const ISSUER_W = 213.75;
    const ISSUER_H = 156;
    const leftX = MARGIN_X;
    const leftW = CONTENT_W - ISSUER_W - 18;
    const issuerX = MARGIN_X + leftW + 18;
    ensureSpace(ISSUER_H);
    const blockTopY = y;

    // 좌: No./수신자/견적명/견적일/유효기간 — 5줄을 블록 높이에 고르게 나눠 배치해서
    // 우측 공급자 박스와 세로 높이가 항상 맞게 한다.
    const metaRowH = ISSUER_H / 5;
    const metaRows = [
      ["No.", quote.quoteNumber || "-"],
      ["수신자", quote.recipientName || "귀중"],
      ["견적명", quote.quoteTitle || ""],
      ["견적일", quote.quoteDate || ""],
      ["유효기간", "견적일로부터 1개월"],
    ];
    const kSize = 9, vSize = 9.75;
    const vAscent = font.heightAtSize(vSize, { descender: false });
    metaRows.forEach(([label, value], i) => {
      const rowTop = blockTopY - i * metaRowH;
      const baseline = rowTop - metaRowH / 2 - vAscent / 2;
      text(label, leftX, baseline, kSize, { bold: true, color: INK });
      text(truncateToWidth(font, vSize, value, leftW - 55), leftX + 55, baseline, vSize, { bold: true });
      if (i < metaRows.length - 1) line(leftX, leftX + leftW, rowTop - metaRowH, 0.75, LINE);
    });

    // 우: 공급자 정보 박스 (둥근 테두리)
    drawRoundedRect(page, { x: issuerX, yTop: blockTopY, w: ISSUER_W, h: ISSUER_H, r: 7.5, borderColor: LINE, borderWidth: 0.75 });
    let iy = blockTopY - 12;
    const coSize = 10.125;
    const coAscent = fontBold.heightAtSize(coSize, { descender: false });
    iy -= coAscent;
    const coText = "구일엘리베이터 주식회사";
    text(coText, issuerX + (ISSUER_W - fontBold.widthOfTextAtSize(coText, coSize)) / 2, iy, coSize, { bold: true });
    iy -= 4.5;
    const addrSize = 7.875;
    const addrLineH = 12.6;
    const addrAscent = font.heightAtSize(addrSize, { descender: false });
    // 주소는 박스 폭에 못 들어가서 "…75-24"와 "아이에스비즈타워 909호"를 줄바꿈한다.
    const [addrLine1, addrLine2] = COMPANY.address.split(/\s+(?=아이에스비즈타워)/);
    const addrLines = [
      COMPANY.regNo,
      COMPANY.bizType,
      addrLine1,
      addrLine2 ?? "",
      COMPANY.contact,
      COMPANY.email,
    ].filter(Boolean);
    addrLines.forEach((ln) => {
      iy -= addrLineH;
      const w = font.widthOfTextAtSize(ln, addrSize);
      text(ln, issuerX + (ISSUER_W - w) / 2, iy + (addrLineH - addrAscent) / 2, addrSize, { color: STEEL });
    });
    iy -= 9; // sign margin-top
    const whoSize = 9, capSize = 6.75;
    const signImgH = 30;
    const signTextH = font.heightAtSize(whoSize, { descender: false }) + 2 + font.heightAtSize(capSize, { descender: false });
    const signRowH = Math.max(signTextH, signImgH);
    const whoText = COMPANY.ceo;
    const capText = "(Confirmed and Signed by)";
    const signBlockW = Math.max(fontBold.widthOfTextAtSize(whoText, whoSize), font.widthOfTextAtSize(capText, capSize));
    const gap = sealImage ? 7.5 : 0;
    const signTotalW = signBlockW + gap + (sealImage ? signImgH : 0);
    const signStartX = issuerX + (ISSUER_W - signTotalW) / 2;
    const whoY = iy - (signRowH - signTextH) / 2 - fontBold.heightAtSize(whoSize, { descender: false });
    text(whoText, signStartX + (signBlockW - fontBold.widthOfTextAtSize(whoText, whoSize)) / 2, whoY, whoSize, { bold: true });
    const capY = whoY - 2 - font.heightAtSize(capSize, { descender: false });
    text(capText, signStartX + (signBlockW - font.widthOfTextAtSize(capText, capSize)) / 2, capY, capSize, { color: STEEL_SOFT });
    if (sealImage) {
      const sealY = iy - (signRowH + signImgH) / 2;
      page.drawImage(sealImage, { x: signStartX + signBlockW + gap, y: sealY, width: signImgH, height: signImgH });
    }

    y = blockTopY - ISSUER_H - 12;

    // ---------------------------------------------------------------- 금액 바
    ensureSpace(50);
    const barH = 42;
    drawRoundedRect(page, { x: MARGIN_X, yTop: y, w: CONTENT_W, h: barH, r: 7.5, color: INK });
    const wordsSize = 11.25, figureSize = 14.25, vatSize = 8.25;
    const wordsAscent = fontBold.heightAtSize(wordsSize, { descender: false });
    text(numberToKoreanWon(grandTotal), MARGIN_X + 15, y - barH / 2 - wordsAscent / 2, wordsSize, { bold: true, color: WHITE });
    const vatText = "VAT 별도";
    const vatW = font.widthOfTextAtSize(vatText, vatSize);
    const figureText = `₩${fmtMoney(grandTotal)}`;
    const figureW = fontBold.widthOfTextAtSize(figureText, figureSize);
    const rightBlockX = MARGIN_X + CONTENT_W - 15 - vatW - 8 - figureW;
    const figureAscent = fontBold.heightAtSize(figureSize, { descender: false });
    text(figureText, rightBlockX, y - barH / 2 - figureAscent / 2, figureSize, { bold: true, color: AMBER });
    const vatAscent = font.heightAtSize(vatSize, { descender: false });
    text(vatText, rightBlockX + figureW + 8, y - barH / 2 - vatAscent / 2, vatSize, { color: VAT_GRAY });
    y -= barH + 12;

    // -------------------------------------------------------------- 섹션 라벨
    function sectionLabel(label) {
      ensureSpace(20);
      const dotSize = 6.75;
      const labelSize = 9.375;
      const rowH = 14;
      page.drawRectangle({ x: MARGIN_X, y: y - rowH / 2 - dotSize / 2, width: dotSize, height: dotSize, color: AMBER });
      const ascent = fontBold.heightAtSize(labelSize, { descender: false });
      text(label, MARGIN_X + dotSize + 5.25, y - rowH / 2 - ascent / 2, labelSize, { bold: true });
      y -= rowH + 6;
    }
    sectionLabel("견적 내역");

    // ------------------------------------------------------------------ 표
    const thSize = 7.875;
    const thAscent = font.heightAtSize(thSize, { descender: false });
    function cellX(col, x, w, align) {
      return align === "right" ? x + col.width - 6 - w : align === "center" ? x + col.width / 2 - w / 2 : x + 4;
    }
    function drawTableHeader() {
      ensureSpace(HEADER_H + ROW_H);
      let x = MARGIN_X;
      COLS.forEach((col) => {
        const w = font.widthOfTextAtSize(col.label, thSize);
        text(col.label, cellX(col, x, w, col.align), y - HEADER_H / 2 - thAscent / 2, thSize, { color: STEEL });
        x += col.width;
      });
      y -= HEADER_H;
      line(MARGIN_X, MARGIN_X + CONTENT_W, y, 1.125, INK);
    }
    drawTableHeader();

    const cellSize = 8.625;
    const cellAscent = font.heightAtSize(cellSize, { descender: false });
    function drawRow(cells, opts = {}) {
      ensureSpace(ROW_H);
      if (opts.tint) {
        page.drawRectangle({ x: MARGIN_X, y: y - ROW_H, width: CONTENT_W, height: ROW_H, color: AMBER_TINT });
      }
      let x = MARGIN_X;
      COLS.forEach((col) => {
        const raw = cells[col.key] ?? "";
        const bold = opts.bold || opts.tint;
        const f = bold ? fontBold : font;
        const pad = col.key === "name" ? (opts.indent ? 18 : 4) : 4;
        const maxW = col.width - pad - 4;
        const str = truncateToWidth(f, cellSize, raw, maxW);
        const w = f.widthOfTextAtSize(str, cellSize);
        const cx = col.align === "right" ? x + col.width - 6 - w : col.align === "center" ? x + col.width / 2 - w / 2 : x + pad;
        text(str, cx, y - ROW_H / 2 - cellAscent / 2, cellSize, { bold, color: opts.color });
        x += col.width;
      });
      if (!opts.noBorder) line(MARGIN_X, MARGIN_X + CONTENT_W, y - ROW_H, 0.75, opts.tint ? AMBER_TINT_BORDER : LINE);
      y -= ROW_H;
    }

    ["자재비", "인건비"].forEach((category, idx) => {
      const rows = (quote.items ?? []).filter((it) => it.category === category);
      const catTotal = rows.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
      drawRow({ name: `${idx + 1}. ${category}`, amount: fmtMoney(catTotal) }, { tint: true });
      rows.forEach((it) => {
        const amount = Number(it.qty || 0) * Number(it.unitPrice || 0);
        drawRow({
          name: it.name, unitNo: shortUnitNo(it.unitNo), spec: it.spec || "–", unit: it.unit,
          qty: it.qty, unitPrice: fmtMoney(it.unitPrice), amount: fmtMoney(amount),
        }, { indent: true });
      });
    });
    drawRow({ name: "3. 운반비", spec: "운반비 및 폐자재수거", amount: fmtMoney(quote.transportCost) }, { tint: true });
    drawRow({ name: "4. 안전관리비 및 기타", amount: fmtMoney(quote.safetyCost) }, { tint: true });
    drawRow({ name: "5. 이윤", amount: fmtMoney(quote.profit) }, { tint: true });

    y -= 10; // padding-top:10px
    drawRow({ name: "소계 (1+2+3+4+5)", amount: fmtMoney(subtotal) }, { bold: true, noBorder: true });
    drawRow({ name: "합계 (VAT 별도)", spec: "천단위 절사", amount: fmtMoney(grandTotal) }, { bold: true, color: RED, noBorder: true });
    line(MARGIN_X, MARGIN_X + CONTENT_W, y, 0.75, LINE);
    y -= 6;

    // -------------------------------------------------------------- 특이사항
    sectionLabel("특이사항");
    const noteSize = 7.875;
    const noteLineH = 12.2;
    const noteMaxW = CONTENT_W - 21 - 10.5 * 2 - 12;
    const noteBadgeD = 12;
    const preparedNotes = NOTES.map((note, idx) => {
      const f = note.emphasis ? fontBold : font;
      const lines = wrapText(f, noteSize, note.text, noteMaxW);
      return { idx, lines, emphasis: note.emphasis };
    });
    const rowGap = 3.75 * 2; // padding: 5px 0 (위+아래)
    const noteBoxContentH = preparedNotes.reduce((h, n) => h + Math.max(noteBadgeD, n.lines.length * noteLineH) + rowGap, 0);
    const noteBoxH = noteBoxContentH + 9 * 2; // box padding 12px→9pt 위/아래
    ensureSpace(noteBoxH);
    drawRoundedRect(page, { x: MARGIN_X, yTop: y, w: CONTENT_W, h: noteBoxH, r: 7.5, color: AMBER_TINT, borderColor: AMBER_TINT_BORDER, borderWidth: 0.75 });
    let ny = y - 9;
    const noteAscent = font.heightAtSize(noteSize, { descender: false });
    preparedNotes.forEach((n) => {
      const rowH = Math.max(noteBadgeD, n.lines.length * noteLineH);
      ny -= rowGap / 2;
      const badgeCx = MARGIN_X + 10.5 + noteBadgeD / 2;
      const badgeCy = ny - rowH / 2;
      page.drawCircle({ x: badgeCx, y: badgeCy, size: noteBadgeD / 2, color: AMBER });
      const numStr = String(n.idx + 1);
      const numW = fontBold.widthOfTextAtSize(numStr, 7.125);
      const numAscent = fontBold.heightAtSize(7.125, { descender: false });
      page.drawText(numStr, { x: badgeCx - numW / 2, y: badgeCy - numAscent / 2, size: 7.125, font: fontBold, color: WHITE });
      const textX = MARGIN_X + 10.5 + noteBadgeD + 7.5;
      const opts = n.emphasis ? { bold: true, color: RED } : {};
      n.lines.forEach((lineStr, li) => {
        text(lineStr, textX, ny - li * noteLineH - (noteLineH + noteAscent) / 2, noteSize, opts);
      });
      ny -= rowH + rowGap / 2;
    });
    y -= noteBoxH + 10.5;

    // ------------------------------------------------------------------ 푸터
    ensureSpace(24);
    line(MARGIN_X, MARGIN_X + CONTENT_W, y, 0.75, LINE);
    y -= 7.5;
    const footText = "본 견적서는 유효기간 내에서만 유효합니다 · 구일엘리베이터(주)";
    const footSize = 7.125;
    const footW = font.widthOfTextAtSize(footText, footSize);
    const footAscent = font.heightAtSize(footSize, { descender: false });
    text(footText, MARGIN_X + (CONTENT_W - footW) / 2, y - footAscent, footSize, { color: STEEL_SOFT });
  }

  renderLayout();

  return pdfDoc.save();
}
