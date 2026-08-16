// lib/replacementCertificatePdf.js
// 교체확인서 PDF — 관리자 콘솔 "부품교체·공사 내역"의 청구 건 하나를 지류 확인서 대신
// 코드로 그려서 만든다. lib/quotePdf.js와 같은 방식(pdf-lib 직접 드로잉 + NanumGothic
// 임베드)을 쓰되, 이 문서는 금액표가 아니라 "무엇을 언제 누가 교체했고 사진·서명으로
// 증빙됐는지"가 핵심이라 레이아웃은 별도로 짰다.
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

const INK = rgb(0.063, 0.106, 0.188); // #101B30
const INK_SOFT = rgb(0.239, 0.278, 0.349);
const MUTED = rgb(0.486, 0.525, 0.596);
const LINE = rgb(0.894, 0.906, 0.933);
const LINE_STRONG = rgb(0.780, 0.804, 0.855);
const BRAND_BLUE = rgb(0.114, 0.306, 0.847); // #1D4ED8
const WHITE = rgb(1, 1, 1);

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

// cert 형태는 app/components/admin/BillingsAdmin.jsx의 buildCertificateData()를 따른다.
// 폰트 파일(약 2MB)을 요청마다 디스크에서 다시 읽지 않도록 모듈 스코프에 캐싱해둔다 —
// 서버리스 함수가 warm 상태로 재사용될 때는 이 파일을 다시 읽지 않는다.
// ⚠️ Bold(약 2MB)는 일부러 안 쓴다 — 2MB짜리 한글 폰트를 pdf-lib+fontkit으로 PDF에
// 임베드하는 게 자체로 몇 초씩 걸려서(fontkit의 CJK 글리프 파싱 비용, Node는 싱글스레드라
// 두 폰트를 병렬로 임베드해도 이 비용은 그대로 더해진다), Regular 하나만 쓰고 강조는
// 크기·색으로 대신한다. 재생성 자체는 billings.certificate_pdf_url 캐싱으로도 줄였지만,
// 캐시가 없는 최초 1회 생성 속도 자체를 위한 조치.
let cachedFontRegular = null;
function fontBytes(name) {
  return fs.readFileSync(path.join(process.cwd(), `public/fonts/NanumGothic-${name}.ttf`));
}

export async function buildReplacementCertificatePdfBytes(cert) {
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

  // 부품별로 등록된 사진을 전부(1장 제한 없이) 미리 내려받아 임베드해둔다 — 레이아웃을
  // 그리는 도중에 await가 섞이면 페이지 커서 계산이 꼬이기 쉬워, 그리기 전에 끝내둔다.
  const items = cert.items ?? [];
  const itemPhotos = await Promise.all(
    items.map(async (it) => ({
      before: await Promise.all((it.beforeUrls ?? []).map((u) => embedPhoto(pdfDoc, u))),
      after: await Promise.all((it.afterUrls ?? []).map((u) => embedPhoto(pdfDoc, u))),
    }))
  );
  const signatureImage = cert.approval?.method === "서명" ? await embedPhoto(pdfDoc, cert.approval.signatureUrl) : null;

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  function ensureSpace(needed) {
    if (y - needed < MARGIN_BOTTOM) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
    }
  }
  function text(str, x, yPos, size, opts = {}) {
    page.drawText(String(str ?? ""), { x, y: yPos, size, font: opts.bold ? fontBold : font, color: opts.color ?? INK });
  }
  function line(fromX, toX, atY, thickness, color) {
    page.drawLine({ start: { x: fromX, y: atY }, end: { x: toX, y: atY }, thickness, color });
  }
  function rect(x, yTop, w, h, opts = {}) {
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, ...opts });
  }

  // -------------------------------------------------------------- 레터헤드
  // 좌: 문서 제목 + 문서번호·발급일자 / 우: 회사 로고 + 회사명
  const titleSize = 20;
  text("부품 교체 확인서", MARGIN_X, y - 15, titleSize, { bold: true });
  const metaSize = 8.25;
  const docMetaText = `문서번호 ${cert.docNumber}   발급일자 ${cert.issuedDate}`;
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
    ["현장 · 호기", cert.siteUnit],
    ["작업자", cert.engineerName],
    ["주소", cert.address],
    ["교체일자", cert.replaceDate],
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

  // -------------------------------------------------------------------- 교체 내역
  function sectionLabel(label) {
    ensureSpace(20);
    const dotSize = 5.5;
    page.drawRectangle({ x: MARGIN_X, y: y - dotSize, width: dotSize, height: dotSize, color: BRAND_BLUE });
    text(label, MARGIN_X + dotSize + 6, y - dotSize + 0.5, 9, { bold: true, color: INK_SOFT });
    y -= 18;
  }
  sectionLabel("교체 내역");

  const hasAllAmounts = items.length > 0 && items.every((it) => it.amount != null);
  const COLS = hasAllAmounts
    ? [
        { key: "name", label: "부품명", width: CONTENT_W - 70 - 75 - 75, align: "left" },
        { key: "qty", label: "수량", width: 70, align: "right" },
        { key: "unitPrice", label: "단가", width: 75, align: "right" },
        { key: "amount", label: "금액", width: 75, align: "right" },
      ]
    : [
        { key: "name", label: "부품명", width: CONTENT_W - 90, align: "left" },
        { key: "qty", label: "수량", width: 90, align: "right" },
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
      const raw = col.key === "amount" ? fmtWon(it.amount)
        : col.key === "unitPrice" ? fmtWon(it.amount / qtyNum)
        : col.key === "qty" ? it.qty
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
  const totalValue = cert.isFree ? "무상" : cert.totalCost != null ? fmtWon(cert.totalCost) : "-";
  const totalValueW = fontBold.widthOfTextAtSize(totalValue, 12.5);
  text(totalLabel, MARGIN_X, y, 9.75, { bold: true, color: INK_SOFT });
  text(totalValue, MARGIN_X + CONTENT_W - totalValueW, y - 1, 12.5, { bold: true, color: BRAND_BLUE });
  if (!cert.isFree && cert.totalCost != null) {
    const vatText = "(VAT별도)";
    const vatW = font.widthOfTextAtSize(vatText, 7.5);
    text(vatText, MARGIN_X + CONTENT_W - totalValueW - vatW - 4, y, 7.5, { color: MUTED });
  }
  y -= 26;

  // -------------------------------------------------------------------- 증빙 사진
  // 부품 하나에 여러 장이 올라왔을 수 있어(교체 전/후 각각 1장 제한 없음), 정해진 타일
  // 크기로 격자를 짜서 한 줄에 들어가는 만큼 채우고 넘치면 다음 줄로 넘긴다.
  sectionLabel("증빙 사진");
  const captionSize = 8.25;
  const tileSize = 92, tileGap = 8;
  const cols = Math.max(1, Math.floor((CONTENT_W + tileGap) / (tileSize + tileGap)));

  function drawPhotoStrip(images, label) {
    const count = images.length;
    const rows = count > 0 ? Math.ceil(count / cols) : 1;
    ensureSpace(14 + rows * tileSize + (rows - 1) * tileGap + 8);
    text(`${label}${count ? ` (${count}장)` : ""}`, MARGIN_X, y - 7, captionSize, { bold: true, color: INK_SOFT });
    y -= 16;
    if (count === 0) {
      rect(MARGIN_X, y, tileSize, tileSize, { borderColor: LINE_STRONG, borderWidth: 0.75 });
      const msg = "사진 없음";
      const w = font.widthOfTextAtSize(msg, 7.5);
      text(msg, MARGIN_X + (tileSize - w) / 2, y - tileSize / 2, 7.5, { color: MUTED });
      y -= tileSize + 10;
      return;
    }
    images.forEach((img, idx) => {
      const col = idx % cols, row = Math.floor(idx / cols);
      const px = MARGIN_X + col * (tileSize + tileGap);
      const py = y - row * (tileSize + tileGap);
      rect(px, py, tileSize, tileSize, { borderColor: LINE_STRONG, borderWidth: 0.75 });
      if (img) {
        const scale = Math.min(tileSize / img.width, tileSize / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        page.drawImage(img, { x: px + (tileSize - dw) / 2, y: py - tileSize + (tileSize - dh) / 2, width: dw, height: dh });
      }
    });
    y -= rows * tileSize + (rows - 1) * tileGap + 10;
  }

  items.forEach((it, i) => {
    ensureSpace(28);
    text(`${it.name}${it.qty ? ` ${it.qty}` : ""}`, MARGIN_X, y - 9, 9.75, { bold: true });
    y -= 20;
    drawPhotoStrip(itemPhotos[i]?.before ?? [], "교체 전");
    drawPhotoStrip(itemPhotos[i]?.after ?? [], "교체 후");
    y -= 6;
  });

  // ------------------------------------------------------------------------ 승인
  if (cert.approval?.method) {
    sectionLabel("승인");
    const sigW = 220, sigH = 78;
    ensureSpace(sigH + 30);
    if (cert.approval.method === "서명") {
      rect(MARGIN_X, y, sigW, sigH, { borderColor: LINE_STRONG, borderWidth: 0.75 });
      if (signatureImage) {
        const scale = Math.min((sigW - 16) / signatureImage.width, (sigH - 16) / signatureImage.height);
        const dw = signatureImage.width * scale, dh = signatureImage.height * scale;
        page.drawImage(signatureImage, { x: MARGIN_X + (sigW - dw) / 2, y: y - sigH + (sigH - dh) / 2, width: dw, height: dh });
      }
      text("고객 서명", MARGIN_X, y - sigH - 12, captionSize, { bold: true, color: INK_SOFT });
      const infoX = MARGIN_X + sigW + 24;
      text("승인 일자", infoX, y - 9, factLabelSize, { color: MUTED, bold: true });
      text(cert.approval.approvedAt || "-", infoX, y - 21, factValueSize, { bold: true });
      text("서명자 성함", infoX, y - 40, factLabelSize, { color: MUTED, bold: true });
      text(cert.approval.approverName || "-", infoX, y - 52, factValueSize, { bold: true });
      text("서명자 연락처", infoX, y - 71, factLabelSize, { color: MUTED, bold: true });
      text(cert.approval.approverPhone || "-", infoX, y - 83, factValueSize, { bold: true });
      y -= sigH + 24;
    } else {
      text("승인 방식", MARGIN_X, y - 9, factLabelSize, { color: MUTED, bold: true });
      text("전화승인", MARGIN_X, y - 21, factValueSize, { bold: true });
      text("담당자", MARGIN_X + 160, y - 9, factLabelSize, { color: MUTED, bold: true });
      text(cert.approval.approverName || "-", MARGIN_X + 160, y - 21, factValueSize, { bold: true });
      text("연락처", MARGIN_X + 320, y - 9, factLabelSize, { color: MUTED, bold: true });
      text(cert.approval.approverPhone || "-", MARGIN_X + 320, y - 21, factValueSize, { bold: true });
      text("승인 일자", MARGIN_X, y - 42, factLabelSize, { color: MUTED, bold: true });
      text(cert.approval.approvedAt || "-", MARGIN_X, y - 54, factValueSize, { bold: true });
      y -= 68;
    }
  }

  // ------------------------------------------------------------------------ 푸터
  ensureSpace(24);
  line(MARGIN_X, MARGIN_X + CONTENT_W, y, 0.75, LINE);
  y -= 13;
  text(BRAND.name, MARGIN_X, y, 7.5, { color: MUTED });
  const docIdW = font.widthOfTextAtSize(cert.docNumber, 7.5);
  text(cert.docNumber, MARGIN_X + CONTENT_W - docIdW, y, 7.5, { color: MUTED });

  return pdfDoc.save();
}
