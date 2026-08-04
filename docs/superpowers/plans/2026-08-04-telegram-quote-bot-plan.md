# 텔레그램 견적발송 봇 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 텔레그램에 "OO현장 도어레일 12만원 견적 보내줘" 한 문장을 보내면, 현장을 찾아 견적
초안을 만들고 PDF를 생성해 미리보기로 보낸 뒤, [발송]/[취소] 버튼 확인을 거쳐 실제 이메일·카카오
알림톡으로 발송한다. 설계 근거: `docs/superpowers/specs/2026-08-04-telegram-quote-bot-design.md`.

**Architecture:** 새 API 라우트 `app/api/telegram-webhook/route.js` 하나가 텔레그램의 모든 업데이트
(메시지, 버튼 클릭)를 받는다. PDF 생성(`lib/quotePdf.js`)과 발송(`lib/email.js`, `lib/alimtalk.js`)은
기존 함수를 **직접 import해서 호출**하고(불필요한 self-HTTP 호출 없음), 대화 상태는 별도로 저장하지
않는다 — 텔레그램 인라인 버튼의 `callback_data`에 `quote_requests.id`를 실어서 버튼 클릭 시 DB를
다시 조회하는 방식으로 대체한다.

**Tech Stack:** `@anthropic-ai/sdk`(신규 의존성, 문장 파싱용), Telegram Bot API(REST, SDK 없이 fetch),
Next.js API Route, Supabase.

## Global Constraints

- v1은 **단일 품목 견적만** 지원한다. 다품목·운반비 등 세부비용은 관리자웹으로 넘긴다(설계 문서 "범위 밖").
- 봇은 항상 **새 견적 초안**을 만든다 — 기사가 이미 올린 자재/견적 요청과 병합하지 않는다.
- 대화 상태 저장용 새 테이블을 만들지 않는다 — 콜백 식별자는 `callback_data`에 `quote_requests.id`를
  실어서 전달한다.
- 웹훅은 반드시 시크릿 토큰을 검증한다(`X-Telegram-Bot-Api-Secret-Token` 헤더). 발신자는
  `profiles.telegram_user_id` + `role === 'admin'`으로만 허용한다. 둘 중 하나라도 실패하면 응답 없이
  조용히 무시한다(봇 존재 자체를 굳이 알려줄 필요 없음).
- Claude API 파싱 모델은 `claude-haiku-4-5`를 쓴다 — `docs/RAG.md`에서 이미 "생성 모델: Claude Haiku 4.5
  (추천 답변·요약, 저비용)"로 못박은 프로젝트 컨벤션이고, 이 기능 설계 논의 중 사용자에게 제시한 비용
  견적도 이 모델 기준이었다(단순 문장 하나에서 현장명/품목/가격만 뽑는 추출 작업이라 저비용 모델로 충분).
- 이메일/카카오 채널은 서로 독립적으로 시도한다(기존 `/api/send-quote`와 동일 원칙) — 하나 실패해도
  다른 하나는 그대로 진행하고, 결과를 텔레그램 메시지에 채널별로 그대로 보여준다.
- 취소 시 빈 초안 삭제 조건은 `app/components/admin/MaterialsAdmin.jsx:596-619`(품목편집 취소 시
  정리 로직)와 동일: `status === "요청접수"` AND `requester_id`/`engineer` 둘 다 없을 때만 삭제.

---

### Task 1: 마이그레이션 — profiles.telegram_user_id

**Files:**
- Create: `supabase/migrations/101_telegram_admin_link_DRAFT.sql`

**Interfaces:**
- Produces: `profiles`에 `telegram_user_id bigint unique` 컬럼. Task 5(발신자 인가)가 이 컬럼으로 조회한다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 101: 관리자 프로필 ↔ 텔레그램 계정 연결 (2026-08-04)
-- 자체점검 CNFIRM처럼 자유 입력 컬럼 하나 — 화이트리스트 겸 텔레그램 견적봇 발신자 인가에 쓴다.
alter table public.profiles add column if not exists telegram_user_id bigint unique;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name = 'telegram_user_id';
```

- [ ] **Step 2: 사용자에게 실행 요청**

Supabase 대시보드 SQL Editor에서 직접 실행 요청(`supabase/CLAUDE.md` 관례 — 마이그레이션 자동 실행
도구 없음). 실행 후 검증 쿼리로 컬럼이 보이는지 확인받는다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/101_telegram_admin_link_DRAFT.sql
git commit -m "마이그레이션: 프로필-텔레그램 계정 연결 컬럼 (실행 전 DRAFT)"
```

---

### Task 2: 의존성 설치 — @anthropic-ai/sdk

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: 설치**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "chore: @anthropic-ai/sdk 의존성 추가(텔레그램 견적봇 문장 파싱용)"
```

---

### Task 3: 텔레그램 Bot API 유틸 (`lib/telegram.js`)

**Files:**
- Create: `lib/telegram.js`

**Interfaces:**
- Produces: `sendTelegramMessage({chatId, text, replyMarkup})`, `sendTelegramDocument({chatId, buffer, filename, caption, replyMarkup})`, `answerTelegramCallback({callbackQueryId, text})`. Task 5·6이 그대로 가져다 쓴다.

- [ ] **Step 1: 구현**

```js
// lib/telegram.js
// 텔레그램 Bot API 얇은 래퍼 — SDK 없이 REST 그대로 호출한다(공식 SDK 없는 플랫폼).
const API_BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function callTelegram(method, body, { multipart } = {}) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    ...(multipart
      ? { body }
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const json = await res.json().catch(() => null);
  if (!json?.ok) throw new Error(`텔레그램 ${method} 실패: ${json?.description || res.status}`);
  return json.result;
}

export async function sendTelegramMessage({ chatId, text, replyMarkup }) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  });
}

export async function sendTelegramDocument({ chatId, buffer, filename, caption, replyMarkup }) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (caption) form.set("caption", caption);
  if (replyMarkup) form.set("reply_markup", JSON.stringify(replyMarkup));
  form.set("document", new Blob([buffer], { type: "application/pdf" }), filename);
  return callTelegram("sendDocument", form, { multipart: true });
}

export async function answerTelegramCallback({ callbackQueryId, text }) {
  return callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과(아직 아무 데서도 import 안 하므로 dead code지만 컴파일은 돼야 함).

- [ ] **Step 3: 커밋**

```bash
git add lib/telegram.js
git commit -m "feat: 텔레그램 Bot API 유틸(sendMessage/sendDocument/answerCallback) 추가"
```

---

### Task 4: 자연어 파싱 (`lib/telegramQuoteParse.js`)

**Files:**
- Create: `lib/telegramQuoteParse.js`

**Interfaces:**
- Produces: `async function parseQuoteMessage(text): Promise<{siteQuery, itemName, unitPrice} | null>` — 파싱 실패(스키마와 안 맞음, 필수값 비었음)면 `null`. Task 5가 `null`이면 재질문 메시지를 보낸다.

- [ ] **Step 1: 구현**

```js
// lib/telegramQuoteParse.js
// "OO현장 도어레일 12만원 견적 보내줘" 같은 한 문장에서 현장명/품목/단가를 뽑는다.
// 구조화 추출 1회 호출이라 저비용 모델(Haiku)로 충분 — docs/RAG.md 컨벤션과 동일.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCHEMA = {
  type: "object",
  properties: {
    siteQuery: { type: "string", description: "문장에 언급된 현장명(부분 명칭이어도 됨)" },
    itemName: { type: "string", description: "견적을 낼 부품/작업명" },
    unitPrice: { type: "integer", description: "원 단위 가격. 명시 안 됐으면 0" },
  },
  required: ["siteQuery", "itemName", "unitPrice"],
  additionalProperties: false,
};

export async function parseQuoteMessage(text) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{
      role: "user",
      content: `승강기 부품 견적 요청 문장에서 현장명·품목명·단가(원)를 추출해줘.\n\n"${text}"`,
    }],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block) return null;

  let parsed;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return null;
  }
  if (!parsed.siteQuery?.trim() || !parsed.itemName?.trim() || !parsed.unitPrice) return null;
  return parsed;
}
```

- [ ] **Step 2: 자체 점검 (환경변수 있을 때만)**

`.env.local`에 `ANTHROPIC_API_KEY`가 있으면:

```bash
node --input-type=module -e "
import { parseQuoteMessage } from './lib/telegramQuoteParse.js';
console.log(await parseQuoteMessage('태영하이빌 도어레일 12만원 견적 보내줘'));
"
```

Expected: `{ siteQuery: '태영하이빌', itemName: '도어레일', unitPrice: 120000 }` 형태 출력.
환경변수가 없으면 이 스텝은 스킵하고 보고한다.

- [ ] **Step 3: 커밋**

```bash
git add lib/telegramQuoteParse.js
git commit -m "feat: 텔레그램 견적 문장 파싱(parseQuoteMessage) 추가"
```

---

### Task 5: 웹훅 라우트 — 메시지 처리 (파싱 → 현장매칭 → 초안생성 → PDF → 미리보기)

**Files:**
- Create: `app/api/telegram-webhook/route.js`

**Interfaces:**
- Consumes: `sendTelegramMessage`, `sendTelegramDocument`(Task 3), `parseQuoteMessage`(Task 4),
  `buildQuotePdfBytes`(`@/lib/quotePdf`, 기존), `supabase`(`@/lib/supabaseClient`, 기존).
- Produces: `POST /api/telegram-webhook` — 이 태스크에서는 `update.message` 분기만 구현(`update.callback_query`는 Task 6).

- [ ] **Step 1: 구현**

```js
// app/api/telegram-webhook/route.js
// 텔레그램에서 오는 모든 업데이트(메시지, 버튼 클릭)를 받는 단일 진입점.
// PDF 생성·발송은 기존 lib 함수를 직접 호출한다 — 자체 API 라우트를 또 거치지 않는다.
import { sendTelegramMessage, sendTelegramDocument, answerTelegramCallback } from "@/lib/telegram";
import { parseQuoteMessage } from "@/lib/telegramQuoteParse";
import { buildQuotePdfBytes } from "@/lib/quotePdf";
import { sendQuoteEmail } from "@/lib/email";
import { sendQuoteAlimtalk } from "@/lib/alimtalk";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";

async function authorizedAdmin(telegramUserId) {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return data?.role === "admin" ? data : null;
}

// 현장명만 대상으로 한 단순 포함검사 — siteMatchesQuery(담당자·주소까지 포함하는 광범위 검색)는
// 여기선 오탐이 커서 안 쓴다.
function matchSites(sites, query) {
  const q = query.trim().toLowerCase();
  return sites.filter((s) => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase()));
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const admin = await authorizedAdmin(message.from.id);
  if (!admin) return Response.json({ ok: true }); // 미등록 발신자는 조용히 무시

  const parsed = await parseQuoteMessage(message.text ?? "");
  if (!parsed) {
    await sendTelegramMessage({ chatId, text: "현장·품목·가격을 한 문장에 알려주세요 — 예: 'OO현장 도어레일 12만원 견적'" });
    return Response.json({ ok: true });
  }

  const { data: sites } = await supabase.from("sites").select("id, name").eq("is_active", true);
  const candidates = matchSites(sites ?? [], parsed.siteQuery);
  if (candidates.length !== 1) {
    const text = candidates.length === 0
      ? `"${parsed.siteQuery}" 이름으로 현장을 못 찾았어요. 정확한 현장명으로 다시 알려주세요.`
      : `이름이 비슷한 현장이 여러 개예요: ${candidates.map((s) => s.name).join(", ")} — 정확한 이름으로 다시 말씀해주세요.`;
    await sendTelegramMessage({ chatId, text });
    return Response.json({ ok: true });
  }
  const site = candidates[0];

  const { data: managers } = await supabase.from("site_managers").select("*").eq("site_id", site.id);
  const primary = (managers ?? []).find((m) => m.is_primary) ?? (managers ?? [])[0];

  const items = [{ category: "부품", name: parsed.itemName, qty: 1, unitPrice: parsed.unitPrice }];
  const { data: draft, error: draftError } = await supabase
    .from("quote_requests")
    .insert({
      id: `q-tg-${Date.now()}`,
      site_id: site.id,
      status: "요청접수",
      quote_items: items,
      transport_cost: 0,
      safety_cost: 0,
      profit: 0,
      quote_title: parsed.itemName,
      quote_issued_date: TODAY_STR,
      recipient_name: primary?.name ?? null,
      created_by: admin.id,
    })
    .select()
    .single();
  if (draftError || !draft) {
    await sendTelegramMessage({ chatId, text: "견적 초안 생성에 실패했어요: " + (draftError?.message ?? "") });
    return Response.json({ ok: true });
  }

  let pdfBytes;
  try {
    pdfBytes = await buildQuotePdfBytes({
      siteName: site.name, quoteTitle: parsed.itemName, quoteDate: TODAY_STR,
      recipientName: primary?.name, items, transportCost: 0, safetyCost: 0, profit: 0,
    });
  } catch (err) {
    await sendTelegramMessage({ chatId, text: "PDF 생성에 실패했어요: " + err.message });
    return Response.json({ ok: true });
  }

  const path = `quotes/${draft.id}/${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("photos")
    .upload(path, Buffer.from(pdfBytes), { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    await sendTelegramMessage({ chatId, text: "PDF 업로드에 실패했어요: " + uploadError.message });
    return Response.json({ ok: true });
  }
  const { data: pub } = supabase.storage.from("photos").getPublicUrl(path);
  await supabase.from("quote_requests").update({ quote_pdf_url: pub.publicUrl, status: "견적발행" }).eq("id", draft.id);

  const recipientLine = primary
    ? `수신: ${primary.name ?? "-"} (${primary.email ?? "이메일 없음"} / ${primary.phone ?? "전화 없음"})`
    : "수신: 담당자 정보 없음 — 발송 전 관리자웹에서 채워주세요";

  await sendTelegramDocument({
    chatId,
    buffer: Buffer.from(pdfBytes),
    filename: `${site.name}_견적서.pdf`,
    caption: `${site.name} · ${parsed.itemName} ${parsed.unitPrice.toLocaleString()}원\n${recipientLine}\n\n이대로 발송할까요?`,
    replyMarkup: { inline_keyboard: [[
      { text: "✅ 발송", callback_data: `send:${draft.id}` },
      { text: "❌ 취소", callback_data: `cancel:${draft.id}` },
    ]] },
  });

  return Response.json({ ok: true });
}

export async function POST(request) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await request.json().catch(() => null);
  if (!update) return Response.json({ ok: true });
  if (update.message?.text) return handleMessage(update.message);
  return Response.json({ ok: true }); // callback_query는 Task 6에서 처리
}
```

- [ ] **Step 2: `quote_requests` 필수 컬럼 확인 (계획 작성 시점에 이미 확인됨)**

`created_by`(`lib/mappers.js:91`), `quote_issued_date`(`lib/mappers.js:191`), `recipient_name`
(`supabase/migrations/064_quote_items_DRAFT.sql:11`), `requester_id`/`engineer`
(`MaterialsAdmin.jsx:596-619`에서 실제 조회) 전부 이미 존재하는 컬럼임을 계획 작성 중 확인했다 —
구현 시작 전 재확인만 가볍게 하고 넘어가면 된다.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 4: 커밋**

```bash
git add app/api/telegram-webhook/route.js
git commit -m "feat: 텔레그램 웹훅 — 메시지 파싱→견적초안→PDF 미리보기 전송"
```

---

### Task 6: 웹훅 라우트 — 콜백 처리 (발송/취소)

**Files:**
- Modify: `app/api/telegram-webhook/route.js`

**Interfaces:**
- Consumes: `sendQuoteEmail`(`@/lib/email`, 기존), `sendQuoteAlimtalk`(`@/lib/alimtalk`, 기존), `answerTelegramCallback`(Task 3).

- [ ] **Step 1: `handleCallback` 함수 추가 + `POST`의 분기 연결**

`handleMessage` 함수 뒤, `export async function POST` 앞에 추가:

```js
async function handleCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const admin = await authorizedAdmin(callbackQuery.from.id);
  if (!admin) return Response.json({ ok: true });

  const [action, quoteRequestId] = (callbackQuery.data ?? "").split(":");
  const { data: draft } = await supabase.from("quote_requests").select("*").eq("id", quoteRequestId).maybeSingle();
  if (!draft) {
    await answerTelegramCallback({ callbackQueryId: callbackQuery.id, text: "이미 처리된 요청이에요" });
    return Response.json({ ok: true });
  }

  if (action === "cancel") {
    // MaterialsAdmin.jsx의 빈 초안 정리 조건과 동일 — 봇이 만든 초안은 항상 이 조건을 만족한다.
    if (draft.status === "요청접수" && !draft.requester_id && !draft.engineer) {
      await supabase.from("quote_requests").delete().eq("id", quoteRequestId);
    }
    await answerTelegramCallback({ callbackQueryId: callbackQuery.id, text: "취소했습니다" });
    await sendTelegramMessage({ chatId, text: "취소했습니다." });
    return Response.json({ ok: true });
  }

  if (action === "send") {
    const { data: managers } = await supabase.from("site_managers").select("*").eq("site_id", draft.site_id);
    const primary = (managers ?? []).find((m) => m.is_primary) ?? (managers ?? [])[0];
    const { data: site } = await supabase.from("sites").select("name").eq("id", draft.site_id).single();

    const quote = { siteName: site?.name, quoteTitle: draft.quote_title, quoteDate: draft.quote_issued_date };
    const results = {};
    const patch = {};

    if (primary?.email) {
      try {
        await sendQuoteEmail({ to: primary.email, cc: [], quote, pdfUrl: draft.quote_pdf_url });
        results.email = { ok: true };
        patch.email_sent_at = new Date().toISOString();
      } catch (err) {
        results.email = { ok: false, reason: err.message };
      }
    }
    if (primary?.phone) {
      try {
        await sendQuoteAlimtalk({ to: primary.phone, quote, pdfUrl: draft.quote_pdf_url });
        results.kakao = { ok: true };
        patch.kakao_sent_at = new Date().toISOString();
      } catch (err) {
        results.kakao = { ok: false, reason: err.message };
      }
    }

    if (Object.keys(patch).length) {
      await supabase.from("quote_requests").update({ ...patch, recipient_email: primary?.email ?? null, recipient_phone: primary?.phone ?? null }).eq("id", quoteRequestId);
    }

    const lines = [
      !primary?.email ? "📧 이메일 — 수신처 없음" : results.email?.ok ? "📧 이메일 — 성공" : `📧 이메일 — 실패 (${results.email?.reason})`,
      !primary?.phone ? "💬 카카오 알림톡 — 수신처 없음" : results.kakao?.ok ? "💬 카카오 알림톡 — 성공" : `💬 카카오 알림톡 — 실패 (${results.kakao?.reason})`,
    ];
    await answerTelegramCallback({ callbackQueryId: callbackQuery.id, text: "발송 처리 완료" });
    await sendTelegramMessage({ chatId, text: lines.join("\n") });
  }

  return Response.json({ ok: true });
}
```

`POST` 함수의 마지막 줄을 교체:

```js
  if (update.callback_query) return handleCallback(update.callback_query);
  return Response.json({ ok: true });
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 3: 커밋**

```bash
git add app/api/telegram-webhook/route.js
git commit -m "feat: 텔레그램 웹훅 — 발송/취소 버튼 콜백 처리"
```

---

### Task 7: 배포 후 웹훅 등록 (코드 아님 — 1회성 설정)

**사전 조건:** `TELEGRAM_BOT_TOKEN`(@BotFather에서 발급받은 값)을 Vercel 환경변수로 등록하고,
임의의 문자열을 `TELEGRAM_WEBHOOK_SECRET`으로 같이 등록한 뒤, `[deploy]` 커밋으로 운영에 반영돼
있어야 한다.

- [ ] **Step 1: 웹훅 등록 curl (배포 후 1회, 사람 또는 컨트롤러가 직접 실행)**

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://guil-app-pi.vercel.app/api/telegram-webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

Expected: `{"ok":true,"result":true,"description":"Webhook was set"}`.

- [ ] **Step 2: 관리자 프로필에 텔레그램 ID 채우기**

`profiles.telegram_user_id`에 실제 사용할 관리자의 텔레그램 숫자 ID를 채운다(설계 문서 "구현 전
준비 사항" 3번 — 봇에게 아무 말이나 보내면 웹훅 로그(Vercel 함수 로그)에 `message.from.id`로 찍힘).

- [ ] **Step 3: 실제 테스트**

텔레그램으로 실제 존재하는 현장 이름을 넣어 "OO현장 부품명 가격 견적 보내줘" 전송 → PDF+버튼 도착
확인 → [발송] 눌러 실제 이메일/카카오로 나가는지 확인(처분 가능한 테스트 현장으로, 실제 고객에게
잘못 나가지 않게 주의).

---

## Self-Review 결과 (계획 작성자 자체 점검)

- **스펙 커버리지**: 설계 문서의 흐름(파싱→현장매칭→초안생성→PDF→미리보기→발송/취소)이 Task 4~6에
  전부 매핑됨. 보안(웹훅 시크릿, 발신자 화이트리스트)은 Task 1(컬럼) + Task 5 Step 1(검증 로직)에서
  커버. "범위 밖"(다품목·기사요청 병합·현장명 유사도 랭킹)은 의도적으로 제외하고 코드에도 안 넣음.
- **재사용 확인**: PDF 생성은 `buildQuotePdfBytes`(기존 `lib/quotePdf.js`), 발송은 `sendQuoteEmail`/
  `sendQuoteAlimtalk`(기존 `lib/email.js`/`lib/alimtalk.js`)를 그대로 가져다 썼고, Storage 업로드
  경로(`quotes/{id}/{timestamp}.pdf`, `photos` 버킷)도 `app/api/generate-quote-pdf/route.js`와
  동일하게 맞춰서 기존 코드와 데이터 구조가 어긋나지 않게 함.
- **취소 안전장치**: `MaterialsAdmin.jsx:596-619`의 빈 초안 삭제 조건을 Task 6에 그대로 재현 —
  봇이 만든 초안은 이 조건을 항상 만족하므로 실수로 다른 건을 지울 위험 없음.
- **스키마 대조**: `quote_requests`가 요구하는 컬럼(`created_by`, `quote_issued_date`, `recipient_name`,
  `requester_id`, `engineer`, `quote_pdf_url`)을 전부 기존 코드에서 실제 사용처를 찾아 확인했다
  (Task 5 Step 2). 새로 추가해야 하는 컬럼은 Task 1의 `telegram_user_id` 하나뿐.
