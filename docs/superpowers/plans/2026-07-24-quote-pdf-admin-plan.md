# 견적요청 품목화 + 견적서 PDF 생성(관리자웹) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 견적요청을 검토해 세부 품목(자재비/인건비)·단가·기타 비용을 입력하고 "발행 확정"을 누르면, 회사 견적서 양식과 같은 디자인의 PDF가 생성되어 Supabase Storage에 저장되고 그 URL이 견적요청에 남는다.

**Architecture:** `quote_requests`에 품목(jsonb)·기타비용·상단정보·PDF URL 컬럼을 추가한다. PDF 생성 로직은 순수 함수(`lib/quotePdf.js`)로 분리해 pdf-lib로 레이아웃을 코드에서 직접 그린다(품목 줄 수 제한 없음, 자동 페이지분할). 이 함수를 감싸는 서버 API 라우트가 Storage 업로드까지 처리한다. 관리자 화면에는 품목편집 모달을 새로 만들어 기존 "견적발행 처리" 버튼에 연결한다.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase(JS client), pdf-lib + @pdf-lib/fontkit(한글 폰트 임베드용), 나눔고딕 TTF(OFL 라이선스, 무료 임베드 가능).

## Global Constraints

- Supabase는 실운영 DB(RLS 꺼짐) — 마이그레이션은 DRAFT SQL 파일만 작성하고 직접 실행하지 않는다. 사용자 확인 후 실행, curl로 컬럼 존재 검증.
- 테스트/DB 쓰기 검증은 반드시 처분 가능한(disposable) 데이터로 하고, 검증 후 즉시 원복해 실DB에 흔적을 남기지 않는다.
- `main` 푸시 전 `npm run build` 통과 필수.
- 이 프로젝트엔 jest/vitest 같은 테스트 러너가 없다(package.json 확인됨) — "테스트" 단계는 순수 함수는 `node -e` assert 스크립트로, UI/API는 브라우저 프리뷰 + curl로 검증한다(이 저장소의 기존 검증 방식과 동일).
- 이번 범위는 **품목편집 + PDF 생성까지**. 이메일/카카오 알림톡 발송은 범위 밖(다음 단계).
- 품목 줄 수 제한 없음(레이아웃을 코드로 직접 그리므로 자재비 5줄/인건비 6줄 같은 원본 양식의 고정 칸 제약은 적용되지 않는다).
- 스펙 문서: `docs/superpowers/specs/2026-07-24-quote-pdf-admin-design.md`

---

### Task 1: DB 마이그레이션 작성

**Files:**
- Create: `supabase/migrations/064_quote_items_DRAFT.sql`

**Interfaces:**
- Produces: `quote_requests` 테이블에 아래 컬럼들이 생긴다(전부 nullable, 기존 데이터 영향 없음):
  `quote_items jsonb`, `transport_cost numeric`, `safety_cost numeric`, `profit numeric`,
  `quote_number text`, `recipient_name text`, `quote_title text`, `quote_pdf_url text`.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 064: 견적요청 품목화 + 견적서 PDF (2026-07-24)
-- 관리자가 견적요청(부품명·수량만 있던 것)을 세부 품목(자재비/인건비 구분·규격·단가 등)으로
-- 확장해 실제 견적서 PDF를 생성하는 기능. 품목은 배열이라 jsonb로 저장하고,
-- 금액(수량*단가)은 저장하지 않는다 — 표시/PDF 생성 시마다 계산해서 저장값과
-- 어긋나는 일이 없게 한다.
alter table public.quote_requests add column if not exists quote_items jsonb;
alter table public.quote_requests add column if not exists transport_cost numeric;
alter table public.quote_requests add column if not exists safety_cost numeric;
alter table public.quote_requests add column if not exists profit numeric;
alter table public.quote_requests add column if not exists quote_number text;
alter table public.quote_requests add column if not exists recipient_name text;
alter table public.quote_requests add column if not exists quote_title text;
alter table public.quote_requests add column if not exists quote_pdf_url text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quote_requests'
  and column_name in ('quote_items', 'transport_cost', 'safety_cost', 'profit',
                       'quote_number', 'recipient_name', 'quote_title', 'quote_pdf_url')
order by column_name;
```

- [ ] **Step 2: 커밋 (마이그레이션 파일만 — 아직 실행하지 않음)**

```bash
git add supabase/migrations/064_quote_items_DRAFT.sql
git commit -m "마이그레이션: 견적요청 품목화 + PDF URL 컬럼 (실행 전 DRAFT)"
```

**⚠️ 컨트롤러 액션 (다음 태스크로 넘어가기 전 필수):** 이 SQL을 사용자에게 보여주고 Supabase
대시보드 SQL Editor에서 실행해달라고 요청한다. 실행 확인("했어" 등) 후, curl로 컬럼이 실제
생겼는지 검증하고 나서 Task 2 이후로 진행한다:

```bash
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/quote_requests?select=quote_items,transport_cost,safety_cost,profit,quote_number,recipient_name,quote_title,quote_pdf_url&limit=1" -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
```

---

### Task 2: 한글 금액 표기 유틸

**Files:**
- Create: `lib/koreanNumber.js`

**Interfaces:**
- Produces: `numberToKoreanWon(amount: number): string` — 예: `numberToKoreanWon(3500000)` → `"일금 삼백오십만원정"`. 다른 태스크(Task 4)에서 이 함수를 그대로 가져다 쓴다.

- [ ] **Step 1: 구현**

```js
// lib/koreanNumber.js
// 견적서의 "일금 OOO원정" 표기를 위한 숫자 → 한글 금액 변환.
const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL_UNITS = ["", "십", "백", "천"];
const BIG_UNITS = ["", "만", "억", "조"];

function fourDigitsToKorean(n) {
  if (n === 0) return "";
  const digits = String(n).padStart(4, "0").split("").map(Number);
  let str = "";
  digits.forEach((d, i) => {
    if (d === 0) return;
    str += DIGITS[d] + SMALL_UNITS[3 - i];
  });
  return str;
}

export function numberToKoreanWon(amount) {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return "일금 영원정";
  let remaining = n;
  const groups = [];
  while (remaining > 0) {
    groups.push(remaining % 10000);
    remaining = Math.floor(remaining / 10000);
  }
  let result = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    const groupStr = fourDigitsToKorean(groups[i]);
    if (groupStr) result += groupStr + BIG_UNITS[i];
  }
  return `일금 ${result}원정`;
}
```

- [ ] **Step 2: 자체 점검 스크립트로 확인**

Run:
```bash
node -e "
const { numberToKoreanWon } = require('./lib/koreanNumber.js');
const cases = [
  [0, '일금 영원정'],
  [1234, '일금 일천이백삼십사원정'],
  [350000, '일금 삼십오만원정'],
  [3500000, '일금 삼백오십만원정'],
  [100000000, '일금 일억원정'],
];
for (const [input, expected] of cases) {
  const got = numberToKoreanWon(input);
  if (got !== expected) throw new Error(\`FAIL numberToKoreanWon(\${input}) = \${got}, expected \${expected}\`);
}
console.log('OK: numberToKoreanWon 5/5 cases passed');
"
```

Expected: `OK: numberToKoreanWon 5/5 cases passed`

(이 프로젝트는 ESM(`import`/`export`) 기준이라 위 `require`가 그대로는 안 먹을 수 있다 — 안 되면
`node --input-type=module -e "import { numberToKoreanWon } from './lib/koreanNumber.js'; ..."` 형태로
같은 assert 블록을 ESM으로 바꿔 실행한다.)

- [ ] **Step 3: 커밋**

```bash
git add lib/koreanNumber.js
git commit -m "feat: 한글 금액 표기 유틸(numberToKoreanWon) 추가"
```

---

### Task 3: mapQuoteRequest 필드 확장

**Files:**
- Modify: `lib/mappers.js:165-187` (`mapQuoteRequest` 함수)

**Interfaces:**
- Consumes: Task 1의 DB 컬럼(`quote_items`, `transport_cost`, `safety_cost`, `profit`, `quote_number`, `recipient_name`, `quote_title`, `quote_pdf_url`)이 이미 존재해야 실제 값이 채워진다(컬럼 없어도 매핑 코드 자체는 에러 없이 동작 — 전부 `row.x ?? 기본값` 패턴).
- Produces: `mapQuoteRequest(row)`가 반환하는 객체에 `quoteItems`(배열, 기본 `[]`), `transportCost`, `safetyCost`, `profit`, `quoteNumber`, `recipientName`, `quoteTitle`, `quotePdfUrl` 필드 추가. 이후 태스크(6·7)가 이 camelCase 이름을 그대로 쓴다.

- [ ] **Step 1: 기존 함수 확인**

Read `lib/mappers.js:165-187` — 현재 마지막 필드가 `supplyPhotoUrls: row.supply_photo_urls ?? (row.supply_photo_url ? [row.supply_photo_url] : []),` 로 끝나는 것을 확인한다.

- [ ] **Step 2: 필드 추가**

`lib/mappers.js`의 `mapQuoteRequest` 함수를 다음과 같이 바꾼다 (마지막 줄 `supplyPhotoUrls: ...,` 다음에 아래를 추가):

```js
    supplyPhotoUrls: row.supply_photo_urls ?? (row.supply_photo_url ? [row.supply_photo_url] : []),
    quoteItems: row.quote_items ?? [],
    transportCost: row.transport_cost,
    safetyCost: row.safety_cost,
    profit: row.profit,
    quoteNumber: row.quote_number,
    recipientName: row.recipient_name,
    quoteTitle: row.quote_title,
    quotePdfUrl: row.quote_pdf_url,
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 4: 커밋**

```bash
git add lib/mappers.js
git commit -m "feat: mapQuoteRequest에 견적품목/발행정보 필드 추가"
```

---

### Task 4: 견적서 PDF 생성 로직 (순수 함수)

**Files:**
- Create: `lib/quotePdf.js`
- Create (자산, 코드 아님): `public/fonts/NanumGothic-Regular.ttf`, `public/fonts/NanumGothic-Bold.ttf`
- Create (자산, 있으면): `public/guil-logo.png`

**Interfaces:**
- Consumes: `numberToKoreanWon`(Task 2).
- Produces: `async function buildQuotePdfBytes(quote): Promise<Uint8Array>` — Task 5(API 라우트)가 그대로 호출한다. `quote` 파라미터 shape:
  ```
  {
    siteName, address, quoteNumber, recipientName, quoteTitle, quoteDate /* "YYYY-MM-DD" */,
    items: [{ category: "자재비"|"인건비", name, unitNo, spec, unit, qty, unitPrice }],
    transportCost, safetyCost, profit,
  }
  ```

**⚠️ 사전 준비 (컨트롤러/사용자가 코드 작성 전에 먼저 해야 함):**

1. 한글 폰트 — pdf-lib 기본 폰트(Helvetica 등)는 한글을 못 그린다. 무료(OFL 라이선스) 나눔고딕을
   내려받아 `public/fonts/NanumGothic-Regular.ttf`, `public/fonts/NanumGothic-Bold.ttf`로 저장한다
   (네이버 나눔글꼴 공식 배포 https://hangeul.naver.com/font 에서 "나눔고딕" TTF 다운로드).
2. 로고 — `D:\구일\스티커디자인\구일엘리베이터(주)-로고 (1).ai` 를 PNG(투명배경)로 내보내
   `public/guil-logo.png`로 저장한다(Illustrator/Photoshop에서 "다른 이름으로 내보내기" 또는 아무
   PDF/AI→PNG 온라인 변환기 사용 — 이 파일은 PDF 호환 저장이라 확장자만 `.pdf`로 바꿔도 열림).
   **없어도 코드는 동작한다** — 아래 구현이 파일 존재 여부를 확인해서 없으면 텍스트로 대체한다.

- [ ] **Step 1: 의존성 설치**

```bash
npm install pdf-lib @pdf-lib/fontkit
```

- [ ] **Step 2: 구현**

```js
// lib/quotePdf.js
// 견적서 PDF를 코드로 직접 그린다 (기존 엑셀/PDF 양식은 배경으로 쓰지 않음 — 품목 줄
// 수가 원본 양식의 고정 칸(자재비 5줄/인건비 6줄)을 넘는 경우가 잦아서, 대신 레이아웃을
// 코드로 재현해 줄 수 제한 없이 자동 페이지분할되게 한다).
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { numberToKoreanWon } from "./koreanNumber";

const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN_X = 40;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 50;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

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

  let logoImage = null;
  const logoPath = path.join(process.cwd(), "public/guil-logo.png");
  if (fs.existsSync(logoPath)) {
    try {
      logoImage = await pdfDoc.embedPng(fs.readFileSync(logoPath));
    } catch {
      logoImage = null; // 로고 파일이 있어도 임베드 실패하면 텍스트로 대체(아래에서 처리)
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

  // --- 헤더: 로고 + 타이틀 ---
  ensureSpace(60);
  if (logoImage) {
    const logoH = 40;
    const logoW = (logoImage.width / logoImage.height) * logoH;
    page.drawImage(logoImage, { x: MARGIN_X, y: y - logoH, width: logoW, height: logoH });
  } else {
    text("GUIL ELEVATOR", MARGIN_X, 20, { bold: true });
  }
  text("견 적 서", MARGIN_X + 180, 26, { bold: true });
  y -= 55;

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
  const infoStartY = y;
  infoRows.forEach(([label, value]) => {
    text(label, leftX, 9, { bold: true });
    text(value, leftX + 55, 9);
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
    let x = MARGIN_X;
    line(MARGIN_X, MARGIN_X + CONTENT_W, 1);
    y -= 2;
    COLS.forEach((col) => {
      text(col.label, x + 4, 9, { bold: true });
      x += col.width;
    });
    y -= HEADER_H;
    line(MARGIN_X, MARGIN_X + CONTENT_W, 0.5);
    y -= 4;
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
      text(str, cellX, 9, { bold: opts.bold });
      x += col.width;
    });
    y -= ROW_H;
  }

  function drawSectionLabel(label) {
    ensureSpace(ROW_H);
    text(label, MARGIN_X + 4, 9, { bold: true });
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
  y -= 4;
  drawRow({ name: "소계(1+2+3+4+5)", amount: fmtMoney(subtotal) }, { bold: true });
  drawRow({ name: "합계(VAT별도)", spec: "천단위 절사", amount: fmtMoney(grandTotal) }, { bold: true });
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
```

- [ ] **Step 3: 자체 점검 스크립트**

폰트 자산(Step 준비 1)이 없으면 이 스크립트는 파일을 못 찾아 에러가 난다 — 그건 정상이고,
폰트가 있어야 다음 단계로 넘어갈 수 있다는 뜻이다. 폰트가 있는 상태에서:

Run:
```bash
node -e "
const { buildQuotePdfBytes } = require('./lib/quotePdf.js');
(async () => {
  const bytes = await buildQuotePdfBytes({
    siteName: '테스트빌딩', quoteNumber: 'Q-0001', recipientName: '테스트 귀중',
    quoteTitle: '로프 교체 견적', quoteDate: '2026-07-24',
    items: [
      { category: '자재비', name: '와이어로프', unitNo: '1호기', spec: '8mm', unit: 'EA', qty: 4, unitPrice: 150000 },
      { category: '인건비', name: '교체작업', unitNo: '1호기', spec: '-', unit: '식', qty: 1, unitPrice: 500000 },
    ],
    transportCost: 50000, safetyCost: 120000, profit: 200000,
  });
  const isPdf = Buffer.from(bytes.slice(0, 5)).toString() === '%PDF-';
  if (!isPdf) throw new Error('FAIL: 생성된 바이트가 PDF 시그니처로 시작하지 않음');
  if (bytes.length < 1000) throw new Error('FAIL: PDF 크기가 비정상적으로 작음(' + bytes.length + 'B)');
  require('fs').writeFileSync('/tmp/test-quote.pdf', bytes);
  console.log('OK: PDF 생성됨,', bytes.length, 'bytes, /tmp/test-quote.pdf 저장');
})().catch((e) => { console.error(e); process.exit(1); });
"
```

Expected: `OK: PDF 생성됨, N bytes, /tmp/test-quote.pdf 저장` (require 문법이 이 프로젝트의 ESM 설정과
안 맞으면 Task 2의 Step 2와 같은 방식으로 `--input-type=module` + `import`로 바꿔 실행).

생성된 `/tmp/test-quote.pdf`를 Read 도구로 열어 레이아웃이 깨지지 않았는지(글자 겹침, 표 밖으로
튀어나가는 텍스트 없는지) 육안으로 확인한다. 좌표가 어색하면 이 단계에서 `MARGIN_X`/컬럼
`width`/`y -=` 값들을 조정한다.

- [ ] **Step 4: 커밋**

```bash
git add lib/quotePdf.js package.json package-lock.json public/fonts public/guil-logo.png
git commit -m "feat: 견적서 PDF 생성 로직(buildQuotePdfBytes) 추가"
```

(로고 파일이 아직 없으면 `public/guil-logo.png` 없이 커밋 — 코드가 자동으로 텍스트 대체 처리한다.)

---

### Task 5: PDF 생성 API 라우트

**Files:**
- Create: `app/api/generate-quote-pdf/route.js`

**Interfaces:**
- Consumes: `buildQuotePdfBytes`(Task 4), `supabase`(`lib/supabaseClient.js`).
- Produces: `POST /api/generate-quote-pdf` — 요청 바디는 Task 4의 `quote` shape + `quoteRequestId`.
  응답: `{ ok: true, url }` 또는 `{ ok: false, reason }`(다른 `/api/*` 라우트와 동일 패턴).

- [ ] **Step 1: 구현**

```js
// app/api/generate-quote-pdf/route.js
// 견적서 PDF를 생성해 Supabase Storage(photos 버킷, quotes/ 폴더)에 올리고 URL을 돌려준다.
// pdf-lib는 API 키가 필요 없지만, 파일시스템(폰트) 접근이 필요해 서버에서만 실행한다.
import { buildQuotePdfBytes } from "@/lib/quotePdf";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.quoteRequestId) {
    return Response.json({ ok: false, reason: "quoteRequestId 누락" }, { status: 200 });
  }

  let bytes;
  try {
    bytes = await buildQuotePdfBytes(body);
  } catch (err) {
    return Response.json({ ok: false, reason: `PDF 생성 실패: ${err.message}` }, { status: 200 });
  }

  const path = `quotes/${body.quoteRequestId}/${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("photos")
    .upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    return Response.json({ ok: false, reason: `업로드 실패: ${uploadError.message}` }, { status: 200 });
  }

  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return Response.json({ ok: true, url: data.publicUrl });
}
```

- [ ] **Step 2: 개발 서버로 확인**

Preview 도구로 `dev` 서버를 띄운 뒤(`preview_start` name: dev), curl로 직접 호출:

```bash
curl -s -X POST http://localhost:3000/api/generate-quote-pdf \
  -H "Content-Type: application/json" \
  -d '{"quoteRequestId":"test-verify-only","siteName":"테스트빌딩","quoteNumber":"Q-TEST","recipientName":"테스트 귀중","quoteTitle":"테스트 견적","quoteDate":"2026-07-24","items":[{"category":"자재비","name":"테스트품목","unitNo":"1호기","spec":"-","unit":"EA","qty":1,"unitPrice":10000}],"transportCost":0,"safetyCost":0,"profit":0}'
```

Expected: `{"ok":true,"url":"https://....supabase.co/storage/v1/object/public/photos/quotes/test-verify-only/....pdf"}`

응답의 URL을 브라우저로 열어 실제 PDF가 정상적으로 보이는지 확인한다.

**⚠️ 정리:** 이건 테스트용 업로드라 Storage에 흔적이 남는다. Supabase 대시보드 Storage에서
`photos/quotes/test-verify-only/` 폴더를 확인해 삭제하거나, 사용자에게 정리 여부를 확인받는다
(DB 테이블 데이터가 아니라 Storage 파일이라 REST로 직접 삭제가 번거로우면 대시보드에서 지운다).

- [ ] **Step 3: 커밋**

```bash
git add app/api/generate-quote-pdf/route.js
git commit -m "feat: 견적서 PDF 생성 API 라우트 추가"
```

---

### Task 6: 관리자 UI — 품목편집 모달

**Files:**
- Create: `app/components/admin/QuoteItemsModal.jsx`

**Interfaces:**
- Consumes: `Modal`, `inputCls`(`@/app/components/admin/adminShared`), `supabase`(`@/lib/supabaseClient`), `TODAY_STR`(`@/lib/constants`).
- Produces: `export default function QuoteItemsModal({ quote, site, onClose, onSaved })` — Task 7에서
  `import QuoteItemsModal from "@/app/components/admin/QuoteItemsModal";` 로 가져다 쓴다. `onSaved(patch)`
  콜백은 저장 성공 시 부모가 로컬 상태를 갱신할 수 있게 변경된 필드(camelCase)를 전달한다.

- [ ] **Step 1: 구현**

```jsx
// app/components/admin/QuoteItemsModal.jsx
"use client";

// 견적요청 품목편집 — 기사가 신청한 부품명/수량(원본, 읽기전용 참고)을 관리자가
// 세부 품목(자재비/인건비 구분·규격·단가 등)으로 확장해 "발행 확정"하면
// PDF까지 생성해서 견적요청을 "견적발행" 상태로 넘긴다.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { Modal, inputCls } from "@/app/components/admin/adminShared";

const CATEGORIES = ["자재비", "인건비"];

function emptyItem(category) {
  return { category, name: "", unitNo: "", spec: "", unit: "", qty: 1, unitPrice: 0 };
}

export default function QuoteItemsModal({ quote, site, onClose, onSaved }) {
  const [items, setItems] = useState(() => {
    if (quote.quoteItems?.length) return quote.quoteItems;
    // 처음 여는 경우 기사 원본(부품명+수량)을 자재비 1행에 프리필
    return quote.part ? [{ ...emptyItem("자재비"), name: quote.part, qty: quote.quantity || 1 }] : [];
  });
  const [recipientName, setRecipientName] = useState(quote.recipientName || "");
  const [quoteTitle, setQuoteTitle] = useState(quote.quoteTitle || quote.constructionType || "");
  const [quoteNumber, setQuoteNumber] = useState(quote.quoteNumber || "");
  const [quoteDate, setQuoteDate] = useState(quote.quoteIssuedDate || TODAY_STR);
  const [transportCost, setTransportCost] = useState(quote.transportCost || 0);
  const [safetyCost, setSafetyCost] = useState(quote.safetyCost || 0);
  const [profit, setProfit] = useState(quote.profit || 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addItem(category) {
    setItems((prev) => [...prev, emptyItem(category)]);
  }
  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const itemsSubtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
  const subtotal = itemsSubtotal + Number(transportCost || 0) + Number(safetyCost || 0) + Number(profit || 0);
  const grandTotal = Math.floor(subtotal / 1000) * 1000;

  async function handleConfirm() {
    if (items.length === 0) return;
    setSaving(true);
    setError("");

    const patch = {
      quote_items: items,
      transport_cost: Number(transportCost) || 0,
      safety_cost: Number(safetyCost) || 0,
      profit: Number(profit) || 0,
      quote_number: quoteNumber || null,
      recipient_name: recipientName || null,
      quote_title: quoteTitle || null,
      quote_issued_date: quoteDate,
    };

    const pdfRes = await fetch("/api/generate-quote-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRequestId: quote.id,
        siteName: site?.name ?? quote.siteName,
        quoteNumber, recipientName, quoteTitle, quoteDate,
        items, transportCost, safetyCost, profit,
      }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, reason: e.message }));

    if (!pdfRes.ok) {
      setError("PDF 생성 실패: " + pdfRes.reason);
      setSaving(false);
      return;
    }
    patch.quote_pdf_url = pdfRes.url;
    patch.status = "견적발행";

    const { error: dbError } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (dbError) {
      setError("저장 실패: " + dbError.message);
      setSaving(false);
      return;
    }

    onSaved({
      quoteItems: items, transportCost: Number(transportCost) || 0, safetyCost: Number(safetyCost) || 0,
      profit: Number(profit) || 0, quoteNumber, recipientName, quoteTitle,
      quoteIssuedDate: quoteDate, quotePdfUrl: pdfRes.url, status: "견적발행",
    });
    setSaving(false);
  }

  return (
    <Modal title={`${site?.name ?? quote.siteName} 견적 품목편집`} onClose={onClose} wide="2xl">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-sm">
        <p className="text-xs font-bold text-slate-500 mb-1">기사 요청 원본 (참고용)</p>
        <p className="font-semibold text-slate-700">{quote.part || quote.constructionType} · {quote.quantity ?? "-"}개</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div><p className="text-xs font-bold text-slate-500 mb-1">견적번호(No.)</p>
          <input className={inputCls} value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">수신자</p>
          <input className={inputCls} placeholder="OO 귀중" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} /></div>
        <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">견적명</p>
          <input className={inputCls} value={quoteTitle} onChange={(e) => setQuoteTitle(e.target.value)} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">견적일</p>
          <input type="date" className={inputCls} value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} /></div>
      </div>

      {CATEGORIES.map((category) => (
        <div key={category} className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-600">{category === "자재비" ? "1.자재비" : "2.인건비"}</p>
            <button onClick={() => addItem(category)} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1">
              <Plus size={12} /> 품목 추가
            </button>
          </div>
          <div className="space-y-1.5">
            {items.map((it, idx) => it.category !== category ? null : (
              <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                <input className={`${inputCls} col-span-3`} placeholder="품명" value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                <input className={`${inputCls} col-span-1`} placeholder="호기" value={it.unitNo} onChange={(e) => updateItem(idx, { unitNo: e.target.value })} />
                <input className={`${inputCls} col-span-2`} placeholder="규격" value={it.spec} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                <input className={`${inputCls} col-span-1`} placeholder="단위" value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                <input type="number" className={`${inputCls} col-span-1`} placeholder="수량" value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                <input type="number" className={`${inputCls} col-span-2`} placeholder="단가" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: e.target.value })} />
                <span className="col-span-1 text-xs text-slate-500 text-right">{(Number(it.qty || 0) * Number(it.unitPrice || 0)).toLocaleString()}</span>
                <button onClick={() => removeItem(idx)} className="col-span-1 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={14} /></button>
              </div>
            ))}
            {items.filter((it) => it.category === category).length === 0 && (
              <p className="text-xs text-slate-300 text-center py-2">품목 없음</p>
            )}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div><p className="text-xs font-bold text-slate-500 mb-1">운반비</p>
          <input type="number" className={inputCls} value={transportCost} onChange={(e) => setTransportCost(e.target.value)} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">안전관리비 및 기타</p>
          <input type="number" className={inputCls} value={safetyCost} onChange={(e) => setSafetyCost(e.target.value)} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">이윤</p>
          <input type="number" className={inputCls} value={profit} onChange={(e) => setProfit(e.target.value)} /></div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-slate-500">소계</span><span className="font-semibold">{subtotal.toLocaleString()}원</span></div>
        <div className="flex justify-between font-bold"><span>합계(VAT별도, 천단위 절사)</span><span>{grandTotal.toLocaleString()}원</span></div>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">취소</button>
        <button
          onClick={handleConfirm}
          disabled={items.length === 0 || saving}
          className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5"
        >
          {saving ? "생성 중..." : "발행 확정"}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과 (아직 어디서도 import 안 하므로 dead code지만 컴파일은 돼야 함).

- [ ] **Step 3: 커밋**

```bash
git add app/components/admin/QuoteItemsModal.jsx
git commit -m "feat: 견적 품목편집 모달(QuoteItemsModal) 추가"
```

---

### Task 7: MaterialsAdmin.jsx 연결

**Files:**
- Modify: `app/components/admin/MaterialsAdmin.jsx:1-16` (imports), `:42-48` (state), `:386-407` (행 버튼), `:429-441` 부근(모달 렌더 블록)

**Interfaces:**
- Consumes: `QuoteItemsModal`(Task 6).

- [ ] **Step 1: import 추가**

`app/components/admin/MaterialsAdmin.jsx:7` 부근, 기존 import 블록 마지막에 추가:

```js
import QuoteItemsModal from "@/app/components/admin/QuoteItemsModal";
```

- [ ] **Step 2: state 추가**

`app/components/admin/MaterialsAdmin.jsx:48` (`const [detailTarget, ...]` 다음 줄)에 추가:

```js
  const [itemsTarget, setItemsTarget] = useState(null); // 품목편집 중인 견적요청
```

- [ ] **Step 3: "견적발행 처리" 버튼을 모달 여는 것으로 변경, "품목 수정" 버튼 추가**

`app/components/admin/MaterialsAdmin.jsx:386-407`의 기존 블록을 아래로 교체:

```jsx
              <td className="px-3 py-2.5 whitespace-nowrap">
                {q.status === "요청접수" && (
                  <button onClick={(e) => { e.stopPropagation(); setItemsTarget(q); }} className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                    견적발행 처리
                  </button>
                )}
                {q.status === "견적발행" && (
                  <div className="flex gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); handleQuoteAdvance(q); }} className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg">
                      승인 처리
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setItemsTarget(q); }} className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                      품목 수정
                    </button>
                    {q.quotePdfUrl && (
                      <a href={q.quotePdfUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-bold text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-lg">
                        PDF 보기
                      </a>
                    )}
                  </div>
                )}
                {q.status === "승인" && (
                  <button onClick={(e) => { e.stopPropagation(); setQuoteSupplyTarget(q); }} className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors px-2.5 py-1.5 rounded-lg">
                    지급하기
                  </button>
                )}
                {q.status === "자재지급완료" && (
                  <button onClick={(e) => { e.stopPropagation(); setQuoteSupplyTarget(q); }} className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors px-2.5 py-1.5 rounded-lg">
                    수정
                  </button>
                )}
              </td>
```

- [ ] **Step 4: 모달 렌더 블록 추가**

`app/components/admin/MaterialsAdmin.jsx:441`(`)}`, `quoteSupplyTarget &&` 블록이 끝나는 곳) 바로
다음, `{detailTarget && (` 앞에 추가:

```jsx
      {itemsTarget && (
        <QuoteItemsModal
          quote={itemsTarget}
          site={(data.sites ?? []).find((s) => s.id === itemsTarget.siteId)}
          onClose={() => setItemsTarget(null)}
          onSaved={(patch) => {
            setData((prev) => ({
              ...prev,
              quoteRequests: prev.quoteRequests.map((x) => (x.id === itemsTarget.id ? { ...x, ...patch } : x)),
            }));
            setItemsTarget(null);
          }}
        />
      )}
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 6: 브라우저로 전체 흐름 검증 (처분 가능한 실데이터로, 검증 후 원복)**

1. `preview_start`로 dev 서버 열고 `/admin` → "자재·견적 신청내역" → 상태 "요청접수"인 견적요청 하나
   찾기(없으면 이 스텝은 스킵하고 컨트롤러가 사용자에게 테스트용 견적요청이 있는지 확인).
2. "견적발행 처리" 클릭 → `QuoteItemsModal` 열리는지 확인.
3. 기사 원본이 자재비 1행에 프리필돼 있는지 확인.
4. 품목 몇 개 추가/삭제, 단가 입력, 운반비 등 입력 → 소계/합계가 실시간으로 바뀌는지 확인.
5. "발행 확정" 클릭 → 성공 토스트 없이 모달이 닫히면 성공(에러 있으면 빨간 박스로 표시됨).
6. 목록에서 상태가 "견적발행"으로 바뀌고 "PDF 보기" 링크가 생겼는지 확인, 클릭해서 실제 PDF가
   올바르게 뜨는지 확인.
7. **원복**: REST로 해당 견적요청의 `status`, `quote_items`, `quote_pdf_url` 등을 테스트 전 값으로
   되돌린다(테스트 전 값을 미리 REST GET으로 기록해두고 진행). Storage에 올라간 테스트 PDF도
   대시보드에서 지운다.

- [ ] **Step 7: 커밋**

```bash
git add app/components/admin/MaterialsAdmin.jsx
git commit -m "feat: 견적발행 처리를 품목편집 모달로 연결, 품목수정/PDF보기 버튼 추가"
```

---

## Self-Review 결과 (계획 작성자 자체 점검)

- **스펙 커버리지**: 데이터모델(Task1,3) · 관리자 UI 흐름(Task6,7) · PDF 생성(Task4,5) · 마이그레이션(Task1)
  전부 태스크로 커버됨. 스펙의 "범위 밖" 항목(이메일/카카오/버전이력/청구금액 자동반영)은 의도적으로 제외.
- **플레이스홀더 스캔**: TBD/TODO 없음. 좌표값은 전부 구체적 숫자로 채움(리뷰·실행 중 시각 확인 후
  미세조정 여지는 있으나 시작값은 완전한 코드).
- **타입 일관성**: `quoteItems`/`transportCost`/`safetyCost`/`profit`/`quoteNumber`/`recipientName`/
  `quoteTitle`/`quotePdfUrl` 네이밍이 Task3(mapper) → Task6(모달) → Task7(연결) 전체에서 동일하게 유지됨.
  `buildQuotePdfBytes`가 받는 `quote` shape과 Task6에서 fetch로 보내는 바디도 필드명 일치 확인됨.
