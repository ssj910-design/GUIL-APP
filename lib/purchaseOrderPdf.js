// lib/purchaseOrderPdf.js
// 발주서 PDF — 고객이 승인 페이지(app/quote-approve)에서 금액 확인 후 서명하면 그 순간에만
// 한 번 생성되는 문서. 견적서(lib/quotePdf.js)는 "제안"으로 그대로 두고, 이 문서가 "고객이
// 실제로 승인했다"는 증빙(승인금액·서명·일시)을 담는다 — lib/billingInvoicePdf.js와 같은
// 가벼운 구성(사진·직인 없음, pdf-lib 직접 드로잉).
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { BRAND } from "./company.js";

const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN_X = 39.69; // 14mm
const MARGIN_TOP = 34.02;
const MARGIN_BOTTOM = 28;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const INK = rgb(0.063, 0.106, 0.188);
const INK_SOFT = rgb(0.239, 0.278, 0.349);
const MUTED = rgb(0.486, 0.525, 0.596);
const LINE = rgb(0.894, 0.906, 0.933);
const LINE_STRONG = rgb(0.780, 0.804, 0.855);
const BRAND_BLUE = rgb(0.114, 0.306, 0.847);
const SUCCESS = rgb(0.020, 0.588, 0.412); // #059669 — 승인 확정 강조

function fmtWon(n) {
  return `₩${Math.round(Number(n) || 0).toLocaleString("ko-KR")}`;
}

function truncateToWidth(font, size, text, maxWidth) {
  let str = String(text ?? "");
  while (str.length > 0 && font.widthOfTextAtSize(str, size) > maxWidth) str = str.slice(0, -1);
  return str;
}

async function embedPhoto(pdfDoc, url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    try { return await pdfDoc.embedJpg(bytes); } catch { return await pdfDoc.embedPng(bytes); }
  } catch {
    return null;
  }
}

let cachedFontRegular = null;
function fontBytes(name) {
  return fs.readFileSync(path.join(process.cwd(), `public/fonts/NanumGothic-${name}.ttf`));
}

// order 형태는 lib/purchaseOrderData.js의 buildPurchaseOrderData()를 따른다.
export async function buildPurchaseOrderPdfBytes(order) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  cachedFontRegular ??= fontBytes("Regular");
  const font = await pdfDoc.embedFont(cachedFontRegular);
  const fontBold = font;

  let iconImage = null;
  const iconPath = path.join(process.cwd(), BRAND.assets.icon);
  if (fs.existsSync(iconPath)) {
    try { iconImage = await pdfDoc.embedPng(fs.readFileSync(iconPath)); } catch { iconImage = null; }
  }
  const signatureImage = await embedPhoto(pdfDoc, order.signatureUrl);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  function ensureSpace(needed) {
    if (y - needed < MARGIN_BOTTOM) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
    }
  }
  function text(str, x, yPos, size, opts = {}) {
    const o = { y: yPos, size, font: opts.bold ? fontBold : font, color: opts.color ?? INK };
    page.drawText(String(str ?? ""), { x, ...o });
    if (opts.heavy) page.drawText(String(str ?? ""), { x: x + size * 0.03, ...o });
  }
  function line(fromX, toX, atY, thickness, color) {
    page.drawLine({ start: { x: fromX, y: atY }, end: { x: toX, y: atY }, thickness, color });
  }
  function rect(x, yTop, w, h, opts = {}) {
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, ...opts });
  }

  // -------------------------------------------------------------- 레터헤드
  const titleSize = 20;
  text("발주서", MARGIN_X, y - 15, titleSize, { bold: true });
  const metaSize = 8.25;
  text(`문서번호 ${order.docNumber}   발급일자 ${order.issuedDate}`, MARGIN_X, y - 30, metaSize, { color: MUTED });

  const iconH = 26;
  const iconW = iconImage ? (iconImage.width / iconImage.height) * iconH : 0;
  const nameSize = 14.5;
  const nameW = fontBold.widthOfTextAtSize(BRAND.name, nameSize);
  const brandGap = iconImage ? 9 : 0;
  const brandX = MARGIN_X + CONTENT_W - iconW - brandGap - nameW;
  if (iconImage) page.drawImage(iconImage, { x: brandX, y: y - iconH, width: iconW, height: iconH });
  const nameAscent = fontBold.heightAtSize(nameSize, { descender: false });
  text(BRAND.name, brandX + iconW + brandGap, y - iconH / 2 - nameAscent / 2, nameSize, { bold: true });

  y -= Math.max(iconH, 32) + 10;
  line(MARGIN_X, MARGIN_X + CONTENT_W, y, 2, INK);
  y -= 16;

  // ------------------------------------------------------------------ 사실관계
  const facts = [
    ["발주처 · 호기", order.siteUnit],
    ["주소", order.address],
    ["견적명", order.quoteTitle],
    ["원 견적서 문서번호", order.quoteDocNumber],
  ];
  const factLabelSize = 7.5, factValueSize = 10.5;
  facts.forEach(([label, value]) => {
    ensureSpace(30);
    text(label, MARGIN_X, y, factLabelSize, { color: MUTED, bold: true });
    y -= 12;
    text(value || "-", MARGIN_X, y, factValueSize, { bold: true });
    y -= 15;
  });
  y -= 2;
  line(MARGIN_X, MARGIN_X + CONTENT_W, y, 1, LINE);
  y -= 16;

  // -------------------------------------------------------------------- 발주 내역
  function sectionLabel(label) {
    ensureSpace(20);
    const dotSize = 5.5;
    page.drawRectangle({ x: MARGIN_X, y: y - dotSize, width: dotSize, height: dotSize, color: BRAND_BLUE });
    text(label, MARGIN_X + dotSize + 6, y - dotSize + 0.5, 9, { bold: true, color: INK_SOFT });
    y -= 18;
  }
  sectionLabel("발주 내역");

  const items = order.items ?? [];
  const COLS = [
    { key: "name", label: "품목명", width: CONTENT_W - 70 - 75 - 75, align: "left" },
    { key: "qty", label: "수량", width: 70, align: "right" },
    { key: "unitPrice", label: "단가", width: 75, align: "right" },
    { key: "amount", label: "금액", width: 75, align: "right" },
  ];
  const thSize = 7.5, cellSize = 9;
  ensureSpace(22 + items.length * 20);
  let x = MARGIN_X;
  COLS.forEach((col) => {
    const w = font.widthOfTextAtSize(col.label, thSize);
    text(col.label, col.align === "right" ? x + col.width - w : x, y - 6, thSize, { color: MUTED });
    x += col.width;
  });
  y -= 14;
  line(MARGIN_X, MARGIN_X + CONTENT_W, y, 1, LINE_STRONG);
  y -= 15;
  items.forEach((it) => {
    ensureSpace(20);
    let cx = MARGIN_X;
    COLS.forEach((col) => {
      const raw = col.key === "amount" ? fmtWon(it.amount)
        : col.key === "unitPrice" ? (it.unitPrice != null ? fmtWon(it.unitPrice) : "-")
        : col.key === "qty" ? (it.qty ?? "-")
        : it.name;
      const str = truncateToWidth(font, cellSize, raw, col.width - 4);
      const w = font.widthOfTextAtSize(str, cellSize);
      text(str, col.align === "right" ? cx + col.width - w : cx, y, cellSize, {});
      cx += col.width;
    });
    y -= 6;
    line(MARGIN_X, MARGIN_X + CONTENT_W, y, 0.5, LINE);
    y -= 14;
  });
  y -= 2;
  const totalValue = fmtWon(order.totalCost);
  const totalValueW = fontBold.widthOfTextAtSize(totalValue, 12.5);
  text("합계", MARGIN_X, y, 9.75, { bold: true, color: INK_SOFT });
  text(totalValue, MARGIN_X + CONTENT_W - totalValueW, y - 1, 12.5, { bold: true, color: BRAND_BLUE });
  const vatText = order.vatIncluded ? "(VAT포함)" : "(VAT별도)";
  const vatW = font.widthOfTextAtSize(vatText, 7.5);
  text(vatText, MARGIN_X + CONTENT_W - totalValueW - vatW - 4, y, 7.5, { color: MUTED });
  y -= 30;

  // -------------------------------------------------------------------- 승인 정보
  sectionLabel("승인 정보");
  ensureSpace(130);
  const boxH = 120;
  rect(MARGIN_X, y, CONTENT_W, boxH, { color: rgb(0.945, 0.980, 0.961), borderColor: rgb(0.722, 0.902, 0.824), borderWidth: 1 });
  const padX = 16;
  text("승인 금액", MARGIN_X + padX, y - 20, 8.25, { heavy: true, color: INK });
  text(fmtWon(order.approvedAmount), MARGIN_X + padX, y - 38, 15, { bold: true, color: SUCCESS });
  text("승인 일시", MARGIN_X + padX, y - 56, 8.25, { heavy: true, color: INK });
  text(`${order.approvedAt} ${order.approvedTime}`, MARGIN_X + padX, y - 72, 10.5, { bold: true });

  const sigBoxX = MARGIN_X + CONTENT_W / 2 + padX;
  const sigBoxW = CONTENT_W / 2 - padX * 2;
  const sigBoxH = 64;
  text("고객 서명", sigBoxX, y - 20, 8.25, { heavy: true, color: INK });
  rect(sigBoxX, y - 28, sigBoxW, sigBoxH, { color: rgb(1, 1, 1), borderColor: LINE_STRONG, borderWidth: 0.75 });
  if (signatureImage) {
    const scale = Math.min((sigBoxW - 10) / signatureImage.width, (sigBoxH - 10) / signatureImage.height);
    const dw = signatureImage.width * scale, dh = signatureImage.height * scale;
    page.drawImage(signatureImage, { x: sigBoxX + (sigBoxW - dw) / 2, y: y - 28 - sigBoxH + (sigBoxH - dh) / 2, width: dw, height: dh });
  }
  if (order.approverName) {
    const nameText = `서명자: ${order.approverName}`;
    text(nameText, sigBoxX, y - 28 - sigBoxH - 12, 8.25, { color: INK_SOFT });
  }
  y -= boxH + 20;

  // ------------------------------------------------------------------------ 푸터
  ensureSpace(50);
  line(MARGIN_X, MARGIN_X + CONTENT_W, y, 0.75, LINE);
  y -= 13;
  const footerLines = [order.company.name, order.company.regNo, order.company.address, order.company.contact];
  footerLines.forEach((ln) => {
    text(ln, MARGIN_X, y, 7.5, { color: MUTED });
    y -= 11;
  });
  const docIdW = font.widthOfTextAtSize(order.docNumber, 7.5);
  text(order.docNumber, MARGIN_X + CONTENT_W - docIdW, y + 11 * footerLines.length - 11, 7.5, { color: MUTED });

  return pdfDoc.save();
}
