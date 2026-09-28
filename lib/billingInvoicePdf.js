// lib/billingInvoicePdf.js
// 청구서 PDF — 청구방식이 "무자료"인 건을 고객에게 보내는 결제 요청 문서.
// lib/replacementCertificatePdf.js와 같은 방식(pdf-lib 직접 드로잉 + NanumGothic 임베드)을
// 쓰되, 이 문서는 "무엇을 교체했는지 증빙"이 아니라 "얼마를 언제까지 어디로 입금할지"가
// 핵심이라 레이아웃은 별도로 짰다(사진·승인 섹션 없음, 결제기한·입금계좌 강조).
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { BRAND, COMPANY, BANK_ACCOUNT } from "./company.js";

const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN_X = 39.69; // 14mm
const MARGIN_TOP = 34.02;
const MARGIN_BOTTOM = 28;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const INK = rgb(0.063, 0.106, 0.188); // #101B30
const INK_SOFT = rgb(0.239, 0.278, 0.349);
const MUTED = rgb(0.486, 0.525, 0.596);
const LINE = rgb(0.894, 0.906, 0.933);
const LINE_STRONG = rgb(0.780, 0.804, 0.855);
const BRAND_BLUE = rgb(0.114, 0.306, 0.847); // #1D4ED8
const WHITE = rgb(1, 1, 1);
const AMBER = rgb(0.961, 0.620, 0.043); // #F59E0B — 결제기한 강조

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
    try {
      return await pdfDoc.embedJpg(bytes);
    } catch {
      return await pdfDoc.embedPng(bytes);
    }
  } catch {
    return null;
  }
}

// 폰트 파일을 요청마다 디스크에서 다시 읽지 않도록 모듈 스코프에 캐싱한다
// (lib/replacementCertificatePdf.js와 동일한 이유 — Regular 하나만 쓰고 강조는 크기·색으로 대신).
let cachedFontRegular = null;
function fontBytes(name) {
  return fs.readFileSync(path.join(process.cwd(), `public/fonts/NanumGothic-${name}.ttf`));
}

// invoice 형태는 app/components/admin/BillingsAdmin.jsx의 buildBillingInvoiceData()를 따른다.
export async function buildBillingInvoicePdfBytes(invoice) {
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

  // 품목별 교체 전/후 사진을 미리 내려받아 임베드해둔다 — lib/replacementCertificatePdf.js와
  // 동일한 이유(그리는 도중에 await가 섞이면 페이지 커서 계산이 꼬이기 쉬움).
  const items0 = invoice.items ?? [];
  const itemPhotos = await Promise.all(
    items0.map(async (it) => ({
      before: await Promise.all((it.beforeUrls ?? []).map((u) => embedPhoto(pdfDoc, u))),
      after: await Promise.all((it.afterUrls ?? []).map((u) => embedPhoto(pdfDoc, u))),
    }))
  );

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
  text("청구서", MARGIN_X, y - 15, titleSize, { bold: true });
  const metaSize = 8.25;
  const docMetaText = `문서번호 ${invoice.docNumber}   발급일자 ${invoice.issuedDate}`;
  text(docMetaText, MARGIN_X, y - 15 - 15, metaSize, { color: MUTED });

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
    ["청구처", invoice.siteUnit],
    ["주소", invoice.address],
    ["청구일자", invoice.billingDate],
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

  // -------------------------------------------------------------------- 청구 내역
  function sectionLabel(label) {
    ensureSpace(20);
    const dotSize = 5.5;
    page.drawRectangle({ x: MARGIN_X, y: y - dotSize, width: dotSize, height: dotSize, color: BRAND_BLUE });
    text(label, MARGIN_X + dotSize + 6, y - dotSize + 0.5, 9, { bold: true, color: INK_SOFT });
    y -= 18;
  }
  sectionLabel("청구 내역");

  const items = invoice.items ?? [];
  const COLS = [
    { key: "name", label: "부품명", width: CONTENT_W - 60 - 70 - 75 - 75, align: "left" },
    { key: "unit", label: "호기", width: 60, align: "left" },
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
    const qtyNum = parseInt(it.qty, 10) || 1;
    COLS.forEach((col) => {
      const raw = col.key === "amount" ? (it.amount != null ? fmtWon(it.amount) : "-")
        : col.key === "unitPrice" ? (it.amount != null ? fmtWon(it.amount / qtyNum) : "-")
        : col.key === "qty" ? it.qty
        : col.key === "unit" ? (it.unit || "-")
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
  const totalLabel = "합계";
  const totalValue = fmtWon(invoice.totalCost);
  const totalValueW = fontBold.widthOfTextAtSize(totalValue, 12.5);
  text(totalLabel, MARGIN_X, y, 9.75, { bold: true, color: INK_SOFT });
  text(totalValue, MARGIN_X + CONTENT_W - totalValueW, y - 1, 12.5, { bold: true, color: BRAND_BLUE });
  y -= 30;

  // -------------------------------------------------------------------- 결제 안내
  sectionLabel("결제 안내");
  ensureSpace(70);
  const boxH = 64;
  rect(MARGIN_X, y, CONTENT_W, boxH, { color: rgb(0.984, 0.976, 0.949), borderColor: rgb(0.984, 0.843, 0.596), borderWidth: 1 });
  const halfW = CONTENT_W / 2;
  const padX = 16;
  const rowLabelSize = 8.25, rowValueSize = 12;
  // 좌: 결제기한
  text("결제기한", MARGIN_X + padX, y - 20, rowLabelSize, { color: MUTED, bold: true });
  text(invoice.paymentDueDate || "-", MARGIN_X + padX, y - 40, rowValueSize + 3, { bold: true, color: AMBER });
  // 우: 입금계좌
  const rightX = MARGIN_X + halfW + padX;
  text("입금계좌", rightX, y - 20, rowLabelSize, { color: MUTED, bold: true });
  text(`${invoice.bank.bank} ${invoice.bank.number}`, rightX, y - 38, rowValueSize, { bold: true });
  text(`예금주 ${invoice.bank.holder}`, rightX, y - 53, factLabelSize + 0.5, { color: INK_SOFT });
  y -= boxH + 20;

  // ------------------------------------------------------------------------ 푸터
  ensureSpace(50);
  line(MARGIN_X, MARGIN_X + CONTENT_W, y, 0.75, LINE);
  y -= 13;
  const footerLines = [COMPANY.name, COMPANY.regNo, COMPANY.address, COMPANY.contact];
  footerLines.forEach((ln) => {
    text(ln, MARGIN_X, y, 7.5, { color: MUTED });
    y -= 11;
  });
  const docIdW = font.widthOfTextAtSize(invoice.docNumber, 7.5);
  text(invoice.docNumber, MARGIN_X + CONTENT_W - docIdW, y + 11 * footerLines.length - 11, 7.5, { color: MUTED });

  // -------------------------------------------------------------------- 교체 전후 사진 (다음 장)
  // 교체확인서(lib/replacementCertificatePdf.js)와 동일한 증빙 사진 — 1페이지 청구서 내용과
  // 안 섞이게 항상 새 페이지에서 시작한다.
  if (items0.some((it) => (it.beforeUrls?.length || it.afterUrls?.length))) {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
    sectionLabel("교체 전후 사진");

    const captionSize = 8.25;
    const tileGap = 8;
    const cols = 3;
    const tileSize = (CONTENT_W - tileGap * (cols - 1)) / cols;
    const captionH = 16;

    function drawTile(px, py, img) {
      rect(px, py, tileSize, tileSize, { borderColor: LINE_STRONG, borderWidth: 0.75 });
      if (img) {
        const scale = Math.min(tileSize / img.width, tileSize / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        page.drawImage(img, { x: px + (tileSize - dw) / 2, y: py - tileSize + (tileSize - dh) / 2, width: dw, height: dh });
      } else {
        const msg = "사진 없음";
        const w = font.widthOfTextAtSize(msg, 7.5);
        text(msg, px + (tileSize - w) / 2, py - tileSize / 2, 7.5, { color: MUTED });
      }
    }

    function drawPhotoStrip(images, label) {
      const count = images.length;
      const rows = count > 0 ? Math.ceil(count / cols) : 1;
      ensureSpace(captionH + tileSize + 10);
      text(`${label}${count ? ` (${count}장)` : ""}`, MARGIN_X, y - 7, captionSize, { bold: true, color: INK_SOFT });
      y -= captionH;
      for (let r = 0; r < rows; r++) {
        if (r > 0) ensureSpace(tileSize + 10);
        const rowImages = count > 0 ? images.slice(r * cols, (r + 1) * cols) : [null];
        rowImages.forEach((img, c) => drawTile(MARGIN_X + c * (tileSize + tileGap), y, img));
        y -= tileSize + (r < rows - 1 ? tileGap : 10);
      }
    }

    function drawBeforeAfterPair(beforeImg, afterImg) {
      ensureSpace(captionH + tileSize + 10);
      const col2X = MARGIN_X + tileSize + tileGap;
      text("교체 전 (1장)", MARGIN_X, y - 7, captionSize, { bold: true, color: INK_SOFT });
      text("교체 후 (1장)", col2X, y - 7, captionSize, { bold: true, color: INK_SOFT });
      y -= captionH;
      drawTile(MARGIN_X, y, beforeImg);
      drawTile(col2X, y, afterImg);
      y -= tileSize + 10;
    }

    items0.forEach((it, i) => {
      const beforeImgs = itemPhotos[i]?.before ?? [];
      const afterImgs = itemPhotos[i]?.after ?? [];
      if (!beforeImgs.length && !afterImgs.length) return;
      ensureSpace(20 + captionH + tileSize + 10);
      // 호기가 하나뿐인 현장은 "1호기 도어모터"라고 찍어봐야 정보가 없으니 접두사를 생략한다.
      const unitPrefix = !invoice.singleUnitSite && it.unit ? `${it.unit} ` : "";
      text(`${unitPrefix}${it.name}${it.qty ? ` ${it.qty}` : ""}`, MARGIN_X, y - 9, 9.75, { heavy: true });
      y -= 20;
      if (beforeImgs.length === 1 && afterImgs.length === 1) {
        drawBeforeAfterPair(beforeImgs[0], afterImgs[0]);
      } else {
        if (beforeImgs.length) drawPhotoStrip(beforeImgs, "교체 전");
        if (afterImgs.length) drawPhotoStrip(afterImgs, "교체 후");
      }
      y -= 6;
    });
  }

  return pdfDoc.save();
}
