"use client";

// 자재·견적 처리 — 지급완료(자재)/작성·승인·자재지급완료(견적) 액션 포함.
// 입력이 필요 없는 전환(작성·승인)은 행에서 바로 처리하고, 사진·담당기사·금액처럼
// 입력이 필요한 전환(자재 지급완료, 견적 자재지급완료)만 모달을 쓴다 (하이브리드 설계 —
// docs/superpowers/specs/2026-07-21-materials-admin-actions-design.md).
import { useContext, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { notify } from "@/lib/push";
import { mapQuoteRequest } from "@/lib/mappers";
import { uploadPhoto } from "@/lib/photos";
import { unitIdFor, addDays, shortDate, parsePartQty, formatUnitLabel, labelToSeq } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { recordQuoteSupplyStockOut } from "@/lib/inventoryStock";
import { locOf, addressOf, personOf, StatusBadge, AdminTable, FilterPills, inputCls, Modal, PhotoGrid, DateTextInput, lastSentDate, SentHistory, AdminAuthContext } from "@/app/components/admin/adminShared";
import QuoteItemsModal from "@/app/components/admin/QuoteItemsModal";
import QuoteSendModal from "@/app/components/admin/QuoteSendModal";
import QuotePdfPreview from "@/app/components/admin/QuotePdfPreview";

const MATERIAL_TONE = { 승인대기: "blue", 지급완료: "green", 반려: "red", 교체완료: "indigo" };
const QUOTE_TONE = { 요청접수: "blue", 작성: "amber", 승인: "amber", 지급완료: "green", 교체완료: "indigo" };

// 할 일 제목에 쓸 호기 — v2 unit_id가 있으면 그걸 우선하고(관리자 콘솔은 v2 네이티브),
// 없으면 견적 요청 자체의 elevatorNo, 그것도 없으면(관리자가 새로 작성한 견적) 품목에
// 적어둔 호기로 대신한다 — 품목마다 호기가 다르면 특정할 수 없으니 표시하지 않는다.
function quoteUnitLabel(data, quote, unitId) {
  if (quote.elevatorNos?.length) return formatUnitLabel(quote.elevatorNos);
  const u = (data.units ?? []).find((x) => x.id === unitId);
  if (u) return formatUnitLabel(u.unitNo);
  const fromRequest = formatUnitLabel(quote.elevatorNo);
  if (fromRequest) return fromRequest;
  // 관리자가 기사 요청 없이 새로 작성한 견적은 elevatorNo/unitId가 없다 — 품목마다 적어둔
  // 호기(quoteItems[].unitNo, "1"처럼 접미사 없는 숫자도 formatUnitLabel이 "1호기"로 정규화)
  // 전체를 대신 보여준다.
  const uniqueUnits = [...new Set((quote.quoteItems ?? []).map((it) => it.unitNo?.trim()).filter(Boolean))];
  return formatUnitLabel(uniqueUnits);
}

// "현장 · 호기" 표시 — 호기는 quoteUnitLabel과 같은 기준(요청 elevatorNos/elevatorNo →
// 품목별 unitNo)으로 정한다.
function quoteLocLabel(data, q) {
  const siteName = data.sites.find((s) => s.id === q.siteId)?.name ?? q.siteName ?? "-";
  const unit = quoteUnitLabel(data, q, q.unitId);
  return unit ? `${siteName} · ${unit}` : siteName;
}

// 견적 자동생성 할일 내용에 "교체품목" 목록을 기본으로 넣는다 — 견적 작성 때 적은 품목
// 그대로(품명 수량단위)라 담당 기사가 뭘 챙겨야 하는지 할일만 봐도 알 수 있다. 관리자가
// 지급완료 처리 때 따로 적은 전달내용이 있으면 그 아래에 이어붙인다.
// 할일내용(자동생성) 미리보기 — 인건비/운반비/안전관리비및기타/이윤/할인은 빼고 자재비 품목만.
// (운반비 등 4가지는 애초에 quoteItems가 아니라 별도 컬럼이라 원래도 안 섞였고, 자재비만
// 남기려면 인건비 카테고리 품목만 걸러내면 된다.)
function quotePartsSummary(items) {
  const rows = (items ?? []).filter((it) => it.name?.trim() && it.category === "자재비");
  if (!rows.length) return "";
  const fmt = (it) => `${it.name.trim()} ${it.qty || 1}${(it.unit || "EA").toLowerCase()}`;
  // 품목마다 호기가 다르면(다호기 견적) 호기별로 묶어서 "N호기 교체품목"으로 나눠 보여준다 —
  // 단일 호기(또는 호기 미입력)면 기존처럼 통으로 나열한다.
  const groups = new Map();
  for (const it of rows) {
    const label = formatUnitLabel(it.unitNo?.trim()) || "";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(fmt(it));
  }
  if (groups.size <= 1) return "교체품목\n" + rows.map(fmt).join("\n");
  return [...groups.entries()]
    .sort((a, b) => (labelToSeq(a[0]) ?? Infinity) - (labelToSeq(b[0]) ?? Infinity))
    .map(([label, lines]) => `${label || "호기 미상"} 교체품목\n` + lines.join("\n"))
    .join("\n\n");
}

// 부품별 금액 필수 입력값을 지급 문자열("부품명(₩1,000)")에서 되찾아 수정 모달 기본값으로 쓴다.
function parseAmountFromBillingPart(billingPart, part) {
  if (!billingPart) return "";
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = billingPart.match(new RegExp(`${escaped}\\(₩([0-9,]+)\\)`));
  return m ? m[1].replace(/,/g, "") : "";
}

// 자재/견적 완료 후 실제 "교체완료" 여부 — 정상 완료 경로인 기사 비용청구가 들어오면
// 연결된 할 일(todos)의 done이 true가 된다(TodosAdmin.jsx 참고). 담당자가 여러 명인
// 견적은 전원이 청구를 마쳐야 교체완료로 본다.
function billingCompleteFor(todos, key, requestId) {
  const linked = todos.filter((t) => t[key] === requestId && t.source !== "waste_return");
  return linked.length > 0 && linked.every((t) => t.done);
}

// 견적요청 목록의 "상태"·"발행/승인/지급/발송" 두 컬럼을 하나로 합친 진행상태 표시.
// 요청접수 → 작성(미발송="작성"/발송함="발송") → 승인 → 자재지급완료(미교체="출하"/교체="교체")
// 6단계를 한 줄에 나열하고, 현재 해당하는 한 단계만 그 단계 고유 색으로, 나머지는 흑백(slate)
// 으로 보여준다. 각 단계 밑에는 그 단계에 실제로 도달했을 때의 날짜를 표시한다(교체는 별도
// 완료일 컬럼이 없어 자재지급일을 그대로 재사용).
const QUOTE_STAGES = ["요청", "작성", "발송", "승인", "출하", "교체"];
// 단계 색은 **진행 흐름대로** 간다: 빨강(할 일) → 주황(진행) → 파랑(나감) → 남색(확정) → 청록(출하) → 초록(끝).
// 발송이 보라였는데 흐름에서 혼자 튀어 보였다 — 앞뒤 색과 이어지는 파랑으로 바꿨다.
const QUOTE_STAGE_TONES = { 요청: "red", 작성: "amber", 발송: "blue", 승인: "indigo", 출하: "cyan", 교체: "green" };
function quoteStageInfo(q, todos) {
  const billingDone = q.status === "자재지급완료" && billingCompleteFor(todos, "quoteRequestId", q.id);
  const sent = !!(q.emailSentAt || q.kakaoSentAt);

  let stage = null;
  if (q.status === "요청접수") stage = "요청";
  else if (q.status === "작성") stage = sent ? "발송" : "작성";
  else if (q.status === "승인") stage = "승인";
  else if (q.status === "자재지급완료") stage = billingDone ? "교체" : "출하";

  const dates = {
    요청: shortDate(q.requestedDate),
    작성: q.quoteIssuedDate ? shortDate(q.quoteIssuedDate) : "-",
    발송: sent ? lastSentDate(q) : "-",
    승인: q.approvedDate ? shortDate(q.approvedDate) : "-",
    출하: q.suppliedDate ? shortDate(q.suppliedDate) : "-",
    교체: billingDone && q.suppliedDate ? shortDate(q.suppliedDate) : "-",
  };

  return { stage, dates };
}

// 지급완료 처리 시 만들어지는 연결 할 일(todos)의 담당자 — 요청 자체엔 담당기사 컬럼이 없고
// todos.assignee(_id)에만 있어서(견적은 담당 기사 여러 명 가능) 여기서 조인해 이름을 뽑는다.
function assigneeNames(data, key, requestId) {
  const linked = (data.todos ?? []).filter((t) => t[key] === requestId && t.source !== "waste_return");
  if (!linked.length) return null;
  return linked.map((t) => personOf(data, t.assigneeId, t.assignee)).join(", ");
}

// ── 견적 발송 현황 ──────────────────────────────────────────
// 발송 API 응답은 "접수"까지라 실제 도착 여부는 send_log의 status(웹훅이 채움)에만 있다.
// 여기서는 그걸 날짜 단위로 넘겨보게 한다: 패널 = 하루치 최대 3건 + ←→ 날짜 이동,
// 달력 모달 = 월별로 언제 몇 건 보냈는지 + 날짜 클릭 시 그날 전체 목록.

const kstDay = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const todayKst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

function dayLabel(day) {
  const today = todayKst();
  if (day === today) return "오늘";
  const y = new Date(`${today}T12:00:00`); y.setDate(y.getDate() - 1);
  if (day === y.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })) return "어제";
  return shortDate(day);
}

// 발송 한 건 = 한 줄. 패널과 달력 모달이 같은 줄을 쓴다.
function SendLogRow({ e, onOpen }) {
  const isKakao = e.channel === "kakao";
  // "확인 중"이 계속 남아 있으면 이 화면을 만든 이유가 없다. 결과가 나온 건 또렷하게,
  // 아직 안 나온 건 **얼마나 지났는지**까지 보여줘서 "언제까지 기다려야 하나"를 알 수 있게 한다.
  // 알림톡은 보통 몇 초~1분이면 결과가 오므로, 10분이 넘으면 정상이 아니다.
  const mins = Math.floor((Date.now() - new Date(e.sentAt).getTime()) / 60000);
  const stale = !isKakao ? false : mins >= 10 && e.status !== "delivered" && e.status !== "failed";
  const tone = !isKakao ? "slate"
    : e.status === "delivered" ? "green"
    : e.status === "failed" ? "red"
    : stale ? "red" : "amber";
  const label = !isKakao ? "발송됨"
    : e.status === "delivered" ? "발송 완료"
    : e.status === "failed" ? "발송 거부"
    : stale ? "결과 없음" : "확인 중";
  return (
    <button onClick={() => onOpen(e.quote)} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 text-left">
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${isKakao ? "bg-yellow-50 text-yellow-700" : "bg-slate-100 text-slate-500"}`}>
        {isKakao ? "알림톡" : "이메일"}
      </span>
      <span className="text-sm font-bold text-slate-800 truncate flex-1 min-w-0">
        {e.quote.siteName ?? "-"}
        <span className="ml-2 text-xs font-medium text-slate-400">{e.quote.quoteTitle ?? e.quote.constructionType ?? ""}</span>
      </span>
      <span className="text-xs text-slate-500 shrink-0">{e.target}</span>
      <span className="text-[11px] text-slate-400 shrink-0">{e.sentAt.slice(11, 16)}</span>
      <StatusBadge tone={tone}>{label}</StatusBadge>
      {e.status === "failed" && e.statusMessage && (
        <span className="text-[11px] text-red-500 shrink-0 max-w-40 truncate">{e.statusMessage}</span>
      )}
      {stale && (
        // 카카오에서 결과가 안 오는 경우다 — 보통 웹훅/조회 설정 문제라 사람이 알아야 한다.
        <span className="text-[11px] text-red-500 shrink-0">{mins}분째</span>
      )}
    </button>
  );
}

function SendStatusPanel({ quotes, onOpen }) {
  const [dayIdx, setDayIdx] = useState(0); // 0 = 오늘, 1 = 어제 — 그 이전은 달력에서만
  const [calOpen, setCalOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [fresh, setFresh] = useState({});   // { quoteId: send_log } — 방금 조회로 갱신된 것

  // 결과가 아직 안 온 건이 있으면 **솔라피에 직접 물어본다**(웹훅을 기다리지 않는다).
  // 웹훅은 콘솔 설정·토큰에 의존해 조용히 안 올 수 있고, 그러면 "확인 중"만 남아
  // 이 화면을 만든 이유가 사라진다. 조회는 API 키만 있으면 되니 발송이 되면 조회도 된다.
  async function refreshStatus() {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/alimtalk-status", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (d.updated > 0) setFresh((prev) => ({ ...prev, ...d.changedRows }));
    } catch { /* 조회 실패는 조용히 — 기존 표시가 남는다 */ }
    setChecking(false);
  }

  // 화면에 들어올 때 한 번. 미결 건이 없으면 서버가 바로 0을 돌려주므로 부담이 없다.
  useEffect(() => { refreshStatus(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const entries = quotes
    .flatMap((q) => (fresh[q.id] ?? q.sendLog ?? []).map((e) => ({ ...e, quote: q })))
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  if (!entries.length) return null;

  const byDay = new Map();
  for (const e of entries) {
    const d = kstDay(e.sentAt);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }
  // 패널은 오늘/어제 두 장만 — 과거는 "달력으로 보기"가 담당한다 (넘김이 끝없이 길어지는 걸 방지)
  const today = todayKst();
  const yest = new Date(`${today}T12:00:00`); yest.setDate(yest.getDate() - 1);
  const days = [today, yest.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })];
  const idx = Math.min(dayIdx, days.length - 1);
  const day = days[idx];
  const list = byDay.get(day) ?? [];
  const kakao = list.filter((e) => e.channel === "kakao");
  const failed = kakao.filter((e) => e.status === "failed").length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {/* ← 과거로 / 미래로 → : 발송이 있었던 날짜끼리만 이동 */}
          <button onClick={() => setDayIdx(Math.min(idx + 1, days.length - 1))} disabled={idx >= days.length - 1}
            className="w-6 h-6 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 flex items-center justify-center">‹</button>
          <p className="text-sm font-extrabold text-slate-800 w-40 text-center">
            {dayLabel(day)} 발송 {list.length}건
            {failed > 0 && <span className="ml-1.5 text-[11px] font-bold text-red-600">실패 {failed}</span>}
          </p>
          <button onClick={() => setDayIdx(Math.max(idx - 1, 0))} disabled={idx <= 0}
            className="w-6 h-6 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 flex items-center justify-center">›</button>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={refreshStatus} disabled={checking} className="text-[11px] font-bold text-slate-400 disabled:opacity-50 hover:text-blue-700">
            {checking ? "확인 중…" : "결과 새로고침"}
          </button>
          <button onClick={() => setCalOpen(true)} className="text-[11px] font-bold text-blue-700">달력으로 보기</button>
        </div>
      </div>
      <div className="divide-y divide-slate-50">
        {list.length === 0
          ? <p className="text-xs text-slate-400 text-center py-4">{dayLabel(day)} 보낸 견적이 없습니다</p>
          : list.slice(0, 3).map((e, i) => <SendLogRow key={i} e={e} onOpen={onOpen} />)}
      </div>
      {list.length > 3 && (
        <button onClick={() => setCalOpen(true)} className="w-full py-2 text-[11px] font-bold text-slate-400 hover:text-blue-700 border-t border-slate-50">
          +{list.length - 3}건 더 — 달력에서 보기
        </button>
      )}
      {calOpen && <SendCalendarModal byDay={byDay} initialDay={day} onOpen={onOpen} onClose={() => setCalOpen(false)} />}
    </div>
  );
}

// 달력 모달 — 월 단위로 날짜별 발송 건수를 보여주고, 날짜를 누르면 그날 전체 목록.
function SendCalendarModal({ byDay, initialDay, onOpen, onClose }) {
  const [month, setMonth] = useState(initialDay.slice(0, 7)); // "YYYY-MM"
  const [selected, setSelected] = useState(initialDay);
  const [y, m] = month.split("-").map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const moveMonth = (d) => {
    const nd = new Date(y, m - 1 + d, 1);
    setMonth(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`);
  };
  const list = byDay.get(selected) ?? [];

  return (
    <Modal title="견적 발송 이력" onClose={onClose} wide>
      <div className="flex items-center justify-center gap-3 mb-3">
        <button onClick={() => moveMonth(-1)} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500">‹</button>
        <p className="text-sm font-extrabold text-slate-800">{y}년 {m}월</p>
        <button onClick={() => moveMonth(1)} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-4">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <p key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</p>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dstr = `${month}-${String(i + 1).padStart(2, "0")}`;
          const cnt = byDay.get(dstr)?.length ?? 0;
          const hasFail = (byDay.get(dstr) ?? []).some((e) => e.status === "failed");
          const isSel = dstr === selected;
          return (
            <button key={dstr} onClick={() => cnt && setSelected(dstr)} disabled={!cnt}
              className={`h-12 rounded-lg border text-center flex flex-col items-center justify-center gap-0.5
                ${isSel ? "border-blue-600 bg-blue-50" : cnt ? "border-slate-200 hover:bg-slate-50" : "border-transparent"}`}>
              <span className={`text-[11px] ${cnt ? "font-bold text-slate-700" : "text-slate-300"}`}>{i + 1}</span>
              {cnt > 0 && (
                <span className={`text-[10px] font-extrabold px-1.5 rounded-full ${hasFail ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-700"}`}>{cnt}</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs font-bold text-slate-500 mb-1">{dayLabel(selected)} · {list.length}건</p>
      <div className="border border-slate-100 rounded-xl divide-y divide-slate-50 max-h-72 overflow-y-auto">
        {list.length === 0
          ? <p className="text-xs text-slate-400 text-center py-6">이 날짜엔 발송이 없습니다</p>
          : list.map((e, i) => <SendLogRow key={i} e={e} onOpen={onOpen} />)}
      </div>
    </Modal>
  );
}

export default function MaterialsAdmin({ data, setData, initialTab }) {
  const { id: meId } = useContext(AdminAuthContext);
  const { materialRequests: allMaterialRequests, quoteRequests: allQuoteRequests } = data;
  const [tab, setTab] = useState(initialTab ?? "all");
  const [search, setSearch] = useState("");
  const [quoteStageFilter, setQuoteStageFilter] = useState("all");
  const [payTarget, setPayTarget] = useState(null); // 지급완료 처리 중인 자재신청
  const [quoteSupplyTarget, setQuoteSupplyTarget] = useState(null); // 자재지급완료 처리 중인 견적요청
  const [detailTarget, setDetailTarget] = useState(null); // 상세내역 보는 중인 신청 { type, data }
  const [itemsTarget, setItemsTarget] = useState(null); // 품목편집 중인 견적요청
  const [sendTarget, setSendTarget] = useState(null); // 발송 중인 견적요청
  const [pickingSite, setPickingSite] = useState(false); // 새 견적 발행 — 현장선택 모달
  // todos.billing_part_rows 컬럼 존재 여부 — 마이그레이션 112 실행 전엔 컬럼이 없어, 있을 때만
  // 부품별 구조화 행(이름·수량·금액)을 같이 쓴다.
  const billingPartRowsReady = (data.todos ?? []).some((t) => t.billingPartRows !== undefined);
  // todos.is_outsourced 컬럼 존재 여부 — 마이그레이션 121 실행 전엔 컬럼이 없다.
  const todoOutsourcedReady = (data.todos ?? []).some((t) => t.isOutsourced !== undefined);
  // todos.elevator_nos 컬럼 존재 여부 — 마이그레이션 131 실행 전엔 컬럼이 없어, 있을 때만
  // 한 견적이 다루는 호기 전체 목록을 할 일에도 같이 담는다.
  const todoElevatorNosReady = (data.todos ?? []).some((t) => t.elevatorNos !== undefined);

  const query = search.trim().toLowerCase();
  // 기사가 요청 후 취소한 건은 견적요청과 동일하게 목록에서 뺀다 — 삭제하지 않고 데이터는
  // 그대로 남겨(cancelled_at/cancelled_by로 감사 기록 보존) 화면에만 안 보이게 한다.
  const materialRequests = allMaterialRequests.filter((m) =>
    m.status !== "취소" &&
    (!query || locOf(data, m.unitId, m.siteName, m.elevatorNo).toLowerCase().includes(query) || (m.part ?? "").toLowerCase().includes(query) || personOf(data, m.requesterId, m.engineer).toLowerCase().includes(query))
  );
  const quoteRequestsSearched = allQuoteRequests.filter((q) =>
    !query || locOf(data, q.unitId, q.siteName, q.elevatorNo).toLowerCase().includes(query) || (q.constructionType ?? "").toLowerCase().includes(query) || personOf(data, q.requesterId, q.engineer).toLowerCase().includes(query)
      || (q.quoteItems ?? []).some((it) => (it.spec ?? "").toLowerCase().includes(query))
  );
  const quoteRequests = quoteRequestsSearched.filter((q) =>
    quoteStageFilter === "all" || quoteStageInfo(q, data.todos ?? []).stage === quoteStageFilter
  );
  // 아직 견적서를 만들기 전(요청만 들어온 건)과 이미 작성을 시작한 건을 목록에서 바로 구분해 보여준다.
  const pendingQuoteRequests = quoteRequests.filter((q) => q.status === "요청접수");
  // 기사가 요청 후 취소한 건은 목록에서 뺀다 — 삭제하지 않고 데이터는 그대로 남겨(cancelled_at/
  // cancelled_by로 감사 기록 보존) 화면에만 안 보이게 한다. quoteStageInfo가 '취소' 상태를
  // 처리하지 않아(stage: null) 어차피 단계 표시도 못 하고 처리 버튼도 없는 죽은 행이었다.
  const draftedQuoteRequests = quoteRequests.filter((q) => q.status !== "요청접수" && q.status !== "취소");

  async function handleMaterialSupplyComplete(request, { assigneeId, billingPart, billingAmount, billingPartRows, photoUrls }) {
    const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
    const assigneeName = engineer?.name ?? request.engineer;

    const todoId = "todo-" + request.id;
    const dueDate = addDays(TODAY_STR, 30);
    const unitId = request.unitId ?? unitIdFor(data.units, request.siteId, request.elevatorNo);
    const rowsToSave = billingPartRows?.length ? billingPartRows : null;
    const todoRow = {
      id: todoId,
      material_request_id: request.id,
      source: "material",
      title: `${request.siteName} ${request.part} 교체 및 확인서 제출`,
      site_name: request.siteName,
      elevator_no: request.elevatorNo,
      part: request.part,
      assignee: assigneeName,
      assigned_date: TODAY_STR,
      due_date: dueDate,
      done: false,
      unit_id: unitId,
      assignee_id: assigneeId || null,
      billing_part: billingPart,
      billing_amount: billingAmount,
      ...(billingPartRowsReady ? { billing_part_rows: rowsToSave } : {}),
    };
    // 할 일을 먼저 upsert(=재시도 시 같은 id로 다시 써도 안전)한 뒤 상태를 바꾼다 —
    // 반대 순서면 상태 변경 후 할 일 생성이 실패했을 때 DB(지급완료)와 화면(승인대기)이
    // 어긋나고, insert였다면 재시도 시 같은 id 충돌로 영구히 막히는 문제가 있었다.
    const { error: todoError } = await supabase.from("todos").upsert(todoRow);
    if (todoError) { alert("할 일 생성 실패: " + todoError.message); return; }

    const patch = {
      status: "지급완료",
      supplied_date: TODAY_STR,
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("material_requests").update(patch).eq("id", request.id);
    if (error) { alert("지급완료 처리 실패: " + error.message); return; }
    if (assigneeId) notify("supply_ready", { profileIds: [assigneeId], title: "자재 지급 완료 — 수령 확인해주세요", body: `${request.siteName}${request.elevatorNo ? ` · ${request.elevatorNo}` : ""} · ${request.part}`, url: `/?openTodo=${todoId}` });

    setData((prev) => ({
      ...prev,
      materialRequests: prev.materialRequests.map((r) =>
        r.id === request.id
          ? { ...r, status: "지급완료", suppliedDate: TODAY_STR, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls }
          : r
      ),
      todos: [
        {
          id: todoId, materialRequestId: request.id, quoteRequestId: null, source: "material", title: todoRow.title,
          siteName: request.siteName, elevatorNo: request.elevatorNo, part: request.part,
          assignee: assigneeName, assignedDate: TODAY_STR, dueDate, done: false,
          unitId, assigneeId: assigneeId || null, billingPart, billingAmount, billingPartRows: rowsToSave,
        },
        ...prev.todos,
      ],
    }));
  }

  // 지급완료된 자재신청 수정 — 상태/지급일은 그대로 두고 사진·담당기사·금액만 바꾼다
  // (연결된 할 일은 이미 있으므로 새로 만들지 않고 그 자리에서 update).
  async function handleMaterialEdit(request, { assigneeId, billingPart, billingAmount, billingPartRows, photoUrls }) {
    const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
    const assigneeName = engineer?.name ?? request.engineer;

    const patch = {
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("material_requests").update(patch).eq("id", request.id);
    if (error) { alert("수정 실패: " + error.message); return; }

    const todoId = "todo-" + request.id;
    // 담당기사가 바뀌었는지는 여기서 고쳐 쓰기 전 할 일에 남아있던 담당자와 비교해서 판단한다 —
    // material_requests엔 담당기사 컬럼이 없어 할 일이 유일한 기준이다.
    const prevAssigneeId = (data.todos ?? []).find((t) => t.id === todoId)?.assigneeId;
    const assigneeChanged = assigneeId && assigneeId !== prevAssigneeId;
    const rowsToSave = billingPartRows?.length ? billingPartRows : null;
    const todoPatch = {
      assignee: assigneeName, assignee_id: assigneeId || null, billing_part: billingPart, billing_amount: billingAmount,
      ...(billingPartRowsReady ? { billing_part_rows: rowsToSave } : {}),
    };
    const { error: todoError } = await supabase.from("todos").update(todoPatch).eq("id", todoId);
    if (todoError) { alert("할 일 수정 실패: " + todoError.message); return; }
    if (assigneeChanged) {
      notify("supply_ready", { profileIds: [assigneeId], title: "자재 지급 담당자로 변경됨 — 수령 확인해주세요", body: `${request.siteName}${request.elevatorNo ? ` · ${request.elevatorNo}` : ""} · ${request.part}`, url: `/?openTodo=${todoId}` });
    }

    setData((prev) => ({
      ...prev,
      materialRequests: prev.materialRequests.map((r) =>
        r.id === request.id ? { ...r, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls } : r
      ),
      todos: prev.todos.map((t) =>
        t.id === todoId ? { ...t, assignee: assigneeName, assigneeId: assigneeId || null, billingPart, billingAmount, billingPartRows: rowsToSave } : t
      ),
    }));
  }

  async function handleQuoteAdvance(quote) {
    const isIssue = quote.status === "요청접수";
    const patch = isIssue
      ? { status: "작성", quote_issued_date: TODAY_STR }
      : { status: "승인", approved_date: TODAY_STR };
    const { error } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (error) { alert("처리 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      quoteRequests: prev.quoteRequests.map((x) => {
        if (x.id !== quote.id) return x;
        return isIssue
          ? { ...x, status: "작성", quoteIssuedDate: TODAY_STR }
          : { ...x, status: "승인", approvedDate: TODAY_STR };
      }),
    }));
  }

  async function handleQuoteSupplyComplete(quote, { assigneeIds, photoUrls, dueDate, description, isOutsourced, vendorName }) {
    const unitId = quote.unitId ?? unitIdFor(data.units, quote.siteId, quote.elevatorNo);
    const finalVendorName = isOutsourced ? (vendorName || null) : null;
    const newTodos = assigneeIds.map((assigneeId, idx) => {
      const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
      return {
        id: `todo-quote-${quote.id}-${idx}`,
        quoteRequestId: quote.id,
        materialRequestId: null,
        source: "quote",
        title: `${quote.siteName}${quoteUnitLabel(data, quote, unitId) ? ` ${quoteUnitLabel(data, quote, unitId)}` : ""} ${quote.quoteTitle || quote.constructionType}`,
        siteName: quote.siteName,
        elevatorNo: quote.elevatorNo,
        elevatorNos: quote.elevatorNos ?? null,
        // 부품교체·공사내역 목록엔 공사구분(카테고리)보다 실제 작성한 견적명이 더 구체적이라 그걸 쓴다.
        part: quote.quoteTitle || quote.constructionType,
        assignee: engineer?.name ?? quote.engineer,
        assignedDate: TODAY_STR,
        dueDate,
        done: false,
        unitId,
        assigneeId,
        description: (description || null),
        isOutsourced: !!isOutsourced,
        vendorName: finalVendorName,
      };
    });
    // 할 일을 먼저 upsert(=재시도 시 같은 id로 다시 써도 안전)한 뒤 상태를 바꾼다 — 자재
    // 지급완료와 동일한 이유(순서 반대면 부분 실패 시 DB/화면 불일치 및 재시도 충돌 발생).
    const { error: todoError } = await supabase.from("todos").upsert(
      newTodos.map((t) => ({
        id: t.id, quote_request_id: t.quoteRequestId, source: t.source, title: t.title,
        site_name: t.siteName, elevator_no: t.elevatorNo, part: t.part,
        assignee: t.assignee, assigned_date: t.assignedDate, due_date: t.dueDate, done: t.done,
        unit_id: t.unitId, assignee_id: t.assigneeId, description: t.description,
        ...(todoOutsourcedReady ? { is_outsourced: t.isOutsourced, vendor_name: t.vendorName } : {}),
        ...(todoElevatorNosReady ? { elevator_nos: t.elevatorNos } : {}),
      }))
    );
    if (todoError) { alert("할 일 생성 실패: " + todoError.message); return; }

    const patch = {
      status: "자재지급완료",
      supplied_date: TODAY_STR,
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (error) { alert("자재지급완료 처리 실패: " + error.message); return; }
    // 자재지급완료가 실제로 부품이 창고에서 나가는 시점이라 여기서 재고 'out' 반영
    // (모바일 앱의 handleCompleteQuoteSupply와 동일 로직 공유 — lib/inventoryStock.js).
    await recordQuoteSupplyStockOut(supabase, {
      quoteItems: quote.quoteItems,
      quoteId: quote.id,
      siteName: quote.siteName,
      createdBy: meId,
    });
    // 각자 다른 할일 id를 받으므로(assignees 수만큼 별도 행), 딥링크 url이 정확하도록 한 명씩 보낸다.
    for (const t of newTodos) {
      if (!t.assigneeId) continue;
      notify("supply_ready", { profileIds: [t.assigneeId], title: "견적 자재 지급 완료 — 수령 확인해주세요", body: `${quote.siteName}${quoteUnitLabel(data, quote, unitId) ? ` · ${quoteUnitLabel(data, quote, unitId)}` : ""} · ${quote.constructionType}`, url: `/?openTodo=${t.id}` });
    }

    setData((prev) => ({
      ...prev,
      quoteRequests: prev.quoteRequests.map((x) =>
        x.id === quote.id
          ? { ...x, status: "자재지급완료", suppliedDate: TODAY_STR, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls }
          : x
      ),
      todos: [...newTodos, ...prev.todos],
    }));
  }

  // 자재지급완료(표시상 지급완료)된 견적요청 수정 — 사진과 담당 기사 구성을 바꾼다.
  // 담당 기사가 빠지면 그 사람 할 일은 삭제하고, 새로 추가되면 할 일을 새로 만들고,
  // 그대로 남는 담당자는 새로 입력한 기한/내용으로 갱신한다.
  async function handleQuoteEdit(quote, { assigneeIds, photoUrls, dueDate, description, isOutsourced, vendorName }) {
    const finalVendorName = isOutsourced ? (vendorName || null) : null;
    const patch = {
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (error) { alert("수정 실패: " + error.message); return; }

    const existingTodos = (data.todos ?? []).filter((t) => t.quoteRequestId === quote.id && t.source === "quote");
    const kept = existingTodos.filter((t) => assigneeIds.includes(t.assigneeId));
    const toRemove = existingTodos.filter((t) => !assigneeIds.includes(t.assigneeId));
    const toAddIds = assigneeIds.filter((id) => !existingTodos.some((t) => t.assigneeId === id));

    if (toRemove.length) {
      const { error: delError } = await supabase.from("todos").delete().in("id", toRemove.map((t) => t.id));
      if (delError) { alert("할 일 정리 실패: " + delError.message); return; }
    }

    if (kept.length) {
      const { error: keepError } = await supabase
        .from("todos")
        .update({
          due_date: dueDate, description: (description || null),
          ...(todoOutsourcedReady ? { is_outsourced: !!isOutsourced, vendor_name: finalVendorName } : {}),
        })
        .in("id", kept.map((t) => t.id));
      if (keepError) { alert("할 일 수정 실패: " + keepError.message); return; }
    }

    const unitId = quote.unitId ?? unitIdFor(data.units, quote.siteId, quote.elevatorNo);
    const newTodos = toAddIds.map((assigneeId) => {
      const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
      return {
        // 위치인덱스(existingTodos.length) id는 담당자 add/remove 반복 시 살아있는 할일과 충돌해 덮어썼다 → 고유 id (P1-5)
        id: `todo-quote-${quote.id}-${crypto.randomUUID()}`,
        quoteRequestId: quote.id,
        materialRequestId: null,
        source: "quote",
        title: `${quote.siteName}${quoteUnitLabel(data, quote, unitId) ? ` ${quoteUnitLabel(data, quote, unitId)}` : ""} ${quote.quoteTitle || quote.constructionType}`,
        siteName: quote.siteName,
        elevatorNo: quote.elevatorNo,
        elevatorNos: quote.elevatorNos ?? null,
        // 부품교체·공사내역 목록엔 공사구분(카테고리)보다 실제 작성한 견적명이 더 구체적이라 그걸 쓴다.
        part: quote.quoteTitle || quote.constructionType,
        assignee: engineer?.name ?? "",
        assignedDate: TODAY_STR,
        dueDate,
        done: false,
        unitId,
        assigneeId,
        description: (description || null),
        isOutsourced: !!isOutsourced,
        vendorName: finalVendorName,
      };
    });
    if (newTodos.length) {
      const { error: todoError } = await supabase.from("todos").upsert(
        newTodos.map((t) => ({
          id: t.id, quote_request_id: t.quoteRequestId, source: t.source, title: t.title,
          site_name: t.siteName, elevator_no: t.elevatorNo, part: t.part,
          assignee: t.assignee, assigned_date: t.assignedDate, due_date: t.dueDate, done: t.done,
          unit_id: t.unitId, assignee_id: t.assigneeId, description: t.description,
          ...(todoOutsourcedReady ? { is_outsourced: t.isOutsourced, vendor_name: t.vendorName } : {}),
          ...(todoElevatorNosReady ? { elevator_nos: t.elevatorNos } : {}),
        }))
      );
      if (todoError) { alert("할 일 생성 실패: " + todoError.message); return; }
    }
    // 각자 다른 할일 id를 받으므로(assignees 수만큼 별도 행), 딥링크 url이 정확하도록 한 명씩 보낸다.
    for (const t of newTodos) {
      notify("supply_ready", { profileIds: [t.assigneeId], title: "견적 자재 지급 담당자로 지정됨 — 수령 확인해주세요", body: `${quote.siteName}${quoteUnitLabel(data, quote, unitId) ? ` · ${quoteUnitLabel(data, quote, unitId)}` : ""} · ${quote.constructionType}`, url: `/?openTodo=${t.id}` });
    }

    setData((prev) => ({
      ...prev,
      quoteRequests: prev.quoteRequests.map((x) =>
        x.id === quote.id ? { ...x, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls } : x
      ),
      todos: [
        ...newTodos,
        ...prev.todos
          .filter((t) => !toRemove.some((r) => r.id === t.id))
          .map((t) => (kept.some((k) => k.id === t.id) ? { ...t, dueDate, description: (description || null), isOutsourced: !!isOutsourced, vendorName: finalVendorName } : t)),
      ],
    }));
  }

  async function handleCreateQuote(siteId) {
    const site = (data.sites ?? []).find((s) => s.id === siteId);
    if (!site) return;
    const row = {
      id: "q" + Date.now(),
      site_id: siteId,
      site_name: site.name,
      elevator_no: null,
      unit_id: null,
      construction_type: "관리자 발행",
      contact_phone: null,
      note: null,
      engineer: null,
      requester_id: null,
      requested_date: TODAY_STR,
      status: "요청접수",
    };
    const { error } = await supabase.from("quote_requests").insert(row);
    if (error) { alert("견적 생성 실패: " + error.message); return; }
    const created = mapQuoteRequest(row);
    setData((prev) => ({ ...prev, quoteRequests: [created, ...prev.quoteRequests] }));
    setPickingSite(false);
    setItemsTarget(created);
  }

  return (
    <div className="max-w-[100rem] mx-auto">
      <h1 className="text-xl font-extrabold mb-4">자재·견적 신청내역</h1>
      <div className="flex items-center justify-between gap-3 mb-3">
        <FilterPills
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: "전체", count: allMaterialRequests.length + allQuoteRequests.length },
            { value: "material", label: "자재신청", count: allMaterialRequests.length },
            { value: "quote", label: "견적요청", count: allQuoteRequests.length },
          ]}
        />
        <div className="flex items-center gap-2">
          {(tab === "quote" || tab === "all") && (
            <button
              onClick={() => setPickingSite(true)}
              className="text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 transition-colors px-3 py-1.5 rounded-lg whitespace-nowrap"
            >
              + 새 견적서
            </button>
          )}
          <div className="relative max-w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-8`} placeholder="현장·부품·규격·기사명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {(tab === "material" || tab === "all") && (
        <>
        {tab === "all" && <h2 className="text-xs font-bold text-slate-400 mb-2">자재신청</h2>}
        <AdminTable head={["신청일", "현장 · 호기", "자재", "긴급도", "신청 기사", "지급사진", "상태", "처리"]}>
          {materialRequests.map((m) => (
            <tr
              key={m.id}
              className="border-b border-slate-50 cursor-pointer hover:bg-slate-50"
              onClick={() => setDetailTarget({ type: "material", data: m })}
            >
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{shortDate(m.requestedDate)}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, m.unitId, m.siteName, m.elevatorNo)}</td>
              <td className="px-3 py-2.5 text-slate-600">{m.part}</td>
              <td className="px-3 py-2.5">
                {m.urgency === "긴급" ? <StatusBadge tone="red">긴급</StatusBadge> : <span className="text-slate-500 text-xs">{m.urgency}</span>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, m.requesterId, m.engineer)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{m.supplyPhotoUrls?.length ? `${m.supplyPhotoUrls.length}장` : "-"}</td>
              <td className="px-3 py-2.5">
                {(() => {
                  const displayStatus =
                    m.status === "지급완료" && billingCompleteFor(data.todos ?? [], "materialRequestId", m.id)
                      ? "교체완료"
                      : m.status;
                  return <StatusBadge tone={MATERIAL_TONE[displayStatus] ?? "slate"}>{displayStatus}</StatusBadge>;
                })()}
                {m.status === "반려" && m.rejectReason && <p className="text-[10px] text-red-500 mt-1">{m.rejectReason}</p>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {m.status === "승인대기" ? (
                  <button onClick={(e) => { e.stopPropagation(); setPayTarget(m); }} className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors px-2.5 py-1.5 rounded-lg">
                    지급하기
                  </button>
                ) : m.status === "지급완료" ? (
                  <button onClick={(e) => { e.stopPropagation(); setPayTarget(m); }} className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors px-2.5 py-1.5 rounded-lg">
                    수정
                  </button>
                ) : (
                  <span className="text-xs text-slate-300">-</span>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
        </>
      )}

      {(tab === "quote" || tab === "all") && (
        <>
        {tab === "all" && <h2 className="text-xs font-bold text-slate-400 mb-2 mt-6">견적요청</h2>}
        <SendStatusPanel quotes={allQuoteRequests} onOpen={(q) => setDetailTarget({ type: "quote", data: q })} />
        {(() => {
          const stages = quoteRequestsSearched.map((q) => quoteStageInfo(q, data.todos ?? []).stage);
          const stageCounts = QUOTE_STAGES.reduce((acc, s) => ({ ...acc, [s]: stages.filter((x) => x === s).length }), {});
          return (
            <div className="mb-3">
              <FilterPills
                value={quoteStageFilter}
                onChange={setQuoteStageFilter}
                options={[
                  { value: "all", label: "전체", count: quoteRequestsSearched.length },
                  ...QUOTE_STAGES.map((s) => ({ value: s, label: s, count: stageCounts[s] })),
                ]}
              />
            </div>
          );
        })()}
        {(() => {
          const renderQuoteRow = (q, drafted) => (
            <tr
              key={q.id}
              className="border-b border-slate-50 cursor-pointer hover:bg-slate-50"
              onClick={() => setDetailTarget({ type: "quote", data: q })}
            >
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{shortDate(drafted ? q.quoteIssuedDate : q.requestedDate)}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{quoteLocLabel(data, q)}</td>
              <td className="px-3 py-2.5 text-slate-600">{drafted ? (q.quoteTitle || "-") : q.constructionType}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {!q.requesterId && !q.engineer
                  ? <StatusBadge tone="slate">관리자발행</StatusBadge>
                  : personOf(data, q.requesterId, q.engineer)}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {(() => {
                  const { stage, dates } = quoteStageInfo(q, data.todos ?? []);
                  return (
                    <div className="flex gap-1">
                      {QUOTE_STAGES.map((s) => (
                        <div key={s} className="flex flex-col items-center">
                          <StatusBadge tone={s === stage ? QUOTE_STAGE_TONES[s] : "slate"}>{s}</StatusBadge>
                          <span className="text-[9px] text-slate-400 mt-0.5">{dates[s]}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {q.status === "요청접수" && (
                  <button onClick={(e) => { e.stopPropagation(); setItemsTarget(q); }} className="text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 transition-colors px-3 py-1.5 rounded-lg whitespace-nowrap">
                    + 새 견적서
                  </button>
                )}
                {q.status === "작성" && (
                  <div className="flex gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); handleQuoteAdvance(q); }} className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg">
                      승인 처리
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setItemsTarget(q); }} className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                      견적서 수정
                    </button>
                    {q.quotePdfUrl && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); setSendTarget(q); }} className="text-xs font-bold text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg">
                          {q.emailSentAt || q.kakaoSentAt ? "재발송" : "발송"}
                        </button>
                        <a href={q.quotePdfUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-bold text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-lg">
                          PDF 보기
                        </a>
                      </>
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
            </tr>
          );
          const pendingHead = ["신청일", "현장 · 호기", "공사 내용", "신청 기사", "진행상태", "처리"];
          const draftedHead = ["작성일", "현장 · 호기", "견적명", "신청 기사", "진행상태", "처리"];
          return (
            <>
              <h3 className="text-xs font-bold text-red-600 mb-2">견적요청만 들어옴 ({pendingQuoteRequests.length})</h3>
              <AdminTable head={pendingHead}>{pendingQuoteRequests.map((q) => renderQuoteRow(q, false))}</AdminTable>
              {pendingQuoteRequests.length === 0 && <p className="text-xs text-slate-400 text-center py-6">해당하는 건이 없습니다</p>}

              <h3 className="text-xs font-bold text-slate-400 mb-2 mt-6">견적작성 이후 ({draftedQuoteRequests.length})</h3>
              <AdminTable head={draftedHead}>{draftedQuoteRequests.map((q) => renderQuoteRow(q, true))}</AdminTable>
              {draftedQuoteRequests.length === 0 && <p className="text-xs text-slate-400 text-center py-6">해당하는 건이 없습니다</p>}
            </>
          );
        })()}
        </>
      )}
      <p className="text-[10px] text-slate-400 mt-2">* 반려 처리는 기사 전용 기능으로, 모바일 관리자 모드에서 진행합니다.</p>

      {payTarget && (
        <MaterialSupplyModal
          request={payTarget}
          profiles={data.profiles ?? []}
          todos={data.todos ?? []}
          onClose={() => setPayTarget(null)}
          onSubmit={async (input) => {
            if (payTarget.status === "지급완료") await handleMaterialEdit(payTarget, input);
            else await handleMaterialSupplyComplete(payTarget, input);
            setPayTarget(null);
          }}
        />
      )}

      {quoteSupplyTarget && (
        <QuoteSupplyModal
          quote={quoteSupplyTarget}
          profiles={data.profiles ?? []}
          todos={data.todos ?? []}
          onClose={() => setQuoteSupplyTarget(null)}
          onSubmit={async (input) => {
            if (quoteSupplyTarget.status === "자재지급완료") await handleQuoteEdit(quoteSupplyTarget, input);
            else await handleQuoteSupplyComplete(quoteSupplyTarget, input);
            setQuoteSupplyTarget(null);
          }}
        />
      )}

      {sendTarget && (
        <QuoteSendModal
          quote={sendTarget}
          site={(data.sites ?? []).find((s) => s.id === sendTarget.siteId)}
          siteManagers={(data.siteManagers ?? []).filter((m) => m.siteId === sendTarget.siteId)}
          profiles={data.profiles ?? []}
          onClose={() => setSendTarget(null)}
          onSaved={(patch) => {
            setData((prev) => ({
              ...prev,
              quoteRequests: prev.quoteRequests.map((x) => (x.id === sendTarget.id ? { ...x, ...patch } : x)),
            }));
          }}
        />
      )}

      {itemsTarget && (
        <QuoteItemsModal
          quote={itemsTarget}
          site={(data.sites ?? []).find((s) => s.id === itemsTarget.siteId)}
          siteManagers={(data.siteManagers ?? []).filter((m) => m.siteId === itemsTarget.siteId)}
          profiles={data.profiles ?? []}
          inventoryProducts={data.inventoryProducts ?? []}
          inventoryStockMovements={data.inventoryStockMovements ?? []}
          onClose={async () => {
            // 관리자가 새 견적 발행에서 현장만 고르고 품목편집을 취소하면, 기사 요청도 없이
            // 만들어진 빈 초안(요청접수 상태, 담당 기사 없음)만 남는다 — 그건 내역에 남기지 않고
            // 바로 삭제한다. 기사 요청건이나 이미 발행된 견적을 다시 열었다가 취소하는 경우는
            // (requesterId/engineer가 있거나 상태가 이미 넘어갔으므로) 이 조건에 안 걸려 그대로 둔다.
            // "저장"은 성공하면 모달이 스스로 이 onClose를 호출한다 — 그 순간 itemsTarget도
            // data.quoteRequests도 아직 "요청접수"인 옛 스냅샷 그대로다(onSaved의 setData가
            // 아직 리렌더로 반영되기 전에 같은 틱에서 onClose가 바로 호출되기 때문 — React
            // state는 비동기 배치라 클라이언트 state를 다시 찾아봐도 최신값이 아니다). 그래서
            // 클라이언트 state 대신 DB에서 방금 값을 직접 다시 읽어 판단한다. 이 재조회 자체가
            // 실패하면(네트워크 문제 등) 옛 스냅샷으로 되돌아가지 않는다 — 옛 스냅샷은 항상
            // "요청접수"라 재조회 실패 시 그걸 믿으면 방금 발행·발송한 견적을 오삭제하는
            // 원래 버그가 그대로 재현되기 때문. 확인이 안 되면 삭제하지 않고 넘어간다.
            const { data: row, error: rowError } = await supabase
              .from("quote_requests")
              .select("status, requester_id, engineer")
              .eq("id", itemsTarget.id)
              .maybeSingle();
            if (rowError) {
              console.error(`onClose: quote_requests 재조회 실패(id=${itemsTarget.id}), 삭제 판단을 건너뜁니다:`, rowError.message);
            } else if (row && row.status === "요청접수" && !row.requester_id && !row.engineer) {
              await supabase.from("quote_requests").delete().eq("id", itemsTarget.id);
              setData((prev) => ({ ...prev, quoteRequests: prev.quoteRequests.filter((x) => x.id !== itemsTarget.id) }));
            }
            setItemsTarget(null);
          }}
          onSaved={(patch) => {
            setData((prev) => ({
              ...prev,
              quoteRequests: prev.quoteRequests.map((x) => (x.id === itemsTarget.id ? { ...x, ...patch } : x)),
            }));
          }}
        />
      )}

      {pickingSite && (
        <QuoteNewSiteModal
          sites={data.sites ?? []}
          onClose={() => setPickingSite(false)}
          onSelect={handleCreateQuote}
        />
      )}

      {detailTarget && (
        <RequestDetailModal target={detailTarget} data={data} onClose={() => setDetailTarget(null)} />
      )}
    </div>
  );
}

function MaterialSupplyModal({ request, profiles, todos, onClose, onSubmit }) {
  const isEdit = request.status === "지급완료";
  const existingTodo = todos.find((t) => t.materialRequestId === request.id);
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 배정할 수 있어야 한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false); // 제외된 기사는 배정 목록에서 뺀다
  const defaultAssigneeId = existingTodo?.assigneeId || request.requesterId || engineers.find((p) => p.name === request.engineer)?.id || "";
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId);
  const [photos, setPhotos] = useState(request.supplyPhotoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const parts = (request.part ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const [amounts, setAmounts] = useState(() => {
    const initial = {};
    parts.forEach((part, i) => {
      const found = parseAmountFromBillingPart(existingTodo?.billingPart, part);
      if (found) initial[i] = found;
    });
    return initial;
  });
  const total = parts.reduce((sum, _, i) => sum + (Number(amounts[i]) || 0), 0);
  const billingPartText = parts
    .map((part, i) => (amounts[i] ? `${part}(₩${Number(amounts[i]).toLocaleString()})` : part))
    .join(", ");
  const allAmountsFilled = parts.every((_, i) => Number(amounts[i]) > 0);
  const billingPartRows = parts.map((part, i) => {
    const { name, qty } = parsePartQty(part);
    return { name: name || part, qty: qty || null, amount: Number(amounts[i]) || 0 };
  });

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPhoto(f, `materials/${request.id}/supply`)));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    setSaving(true);
    await onSubmit({ assigneeId, billingPart: billingPartText || null, billingAmount: total || null, billingPartRows, photoUrls: photos });
    setSaving(false);
  }

  return (
    <Modal title={`${request.siteName ?? "-"} · ${request.part} — ${isEdit ? "지급 내역 수정" : "지급완료 처리"}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">지급 사진 (선택)</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {photos.map((url, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                <button
                  onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer">
            사진 추가
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          </label>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">담당 기사</label>
          <select className={inputCls} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">담당자 선택 (기본 {request.engineer})</option>
            {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">부품별 금액 (필수)</label>
          <div className="space-y-1.5">
            {parts.map((part, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-xs text-slate-700 flex-1 truncate">{part}</span>
                <input
                  type="number"
                  className={`${inputCls} w-28`}
                  placeholder="금액"
                  value={amounts[i] ?? ""}
                  onChange={(e) => setAmounts((m) => ({ ...m, [i]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {parts.length > 1 && <p className="text-[10px] text-slate-400 text-right mt-1">합계 ₩{total.toLocaleString()}</p>}
          {!allAmountsFilled && <p className="text-[10px] text-red-500 mt-1">모든 부품의 금액을 입력해주세요</p>}
        </div>

        <button
          onClick={submit}
          disabled={saving || uploading || !allAmountsFilled}
          className="w-full bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg"
        >
          {saving ? "처리 중..." : isEdit ? "수정 저장" : "지급완료 처리"}
        </button>
      </div>
    </Modal>
  );
}

function QuoteSupplyModal({ quote, profiles, todos, onClose, onSubmit }) {
  const isEdit = quote.status === "자재지급완료";
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 배정할 수 있어야 한다.
  // 견적(외주 처리 포함) 건은 대표(신석주)가 직접 처리하는 경우가 있어 명단에 추가로 포함한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material" || p.name === "신석주") && p.is_active !== false); // 제외된 기사는 배정 목록에서 뺀다
  const existingTodosForQuote = todos.filter((t) => t.quoteRequestId === quote.id && t.source === "quote");
  const existingAssigneeIds = existingTodosForQuote.map((t) => t.assigneeId);
  const defaultId = quote.requesterId || engineers.find((p) => p.name === quote.engineer)?.id || "";
  const [assigneeIds, setAssigneeIds] = useState(existingAssigneeIds.length ? existingAssigneeIds : (defaultId ? [defaultId] : []));
  const [dueDate, setDueDate] = useState(existingTodosForQuote[0]?.dueDate ?? addDays(TODAY_STR, 30));
  // 처음 지급완료 처리하는 경우엔 자재비 품목 목록을 미리 채워서 보여준다 — 그래야 할일에
  // 뭐가 자동으로 들어가는지 여기서 바로 보고 고칠 수 있다(수정 시엔 기존 저장값을 그대로).
  const [description, setDescription] = useState(existingTodosForQuote[0]?.description ?? quotePartsSummary(quote.quoteItems));
  const [photos, setPhotos] = useState(quote.supplyPhotoUrls ?? []);
  const [outsourced, setOutsourced] = useState(!!existingTodosForQuote[0]?.isOutsourced);
  const [vendorName, setVendorName] = useState(existingTodosForQuote[0]?.vendorName ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggle(id) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPhoto(f, `quotes/${quote.id}/supply`)));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    if (assigneeIds.length === 0) return;
    if (outsourced && !vendorName.trim()) return;
    setSaving(true);
    await onSubmit({ assigneeIds, photoUrls: photos, dueDate, description, isOutsourced: outsourced, vendorName: vendorName.trim() });
    setSaving(false);
  }

  return (
    <Modal title={`${quote.siteName ?? "-"} · ${quote.constructionType} — ${isEdit ? "지급 내역 수정" : "지급완료 처리"}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">지급 사진 (선택)</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {photos.map((url, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                <button
                  onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer">
            사진 추가
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          </label>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">담당 기사 (2명 이상 가능)</label>
          <div className="space-y-1">
            {engineers.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={assigneeIds.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
              </label>
            ))}
          </div>
          {assigneeIds.length === 0 && <p className="text-[10px] text-red-500 mt-1">담당 기사를 1명 이상 선택해주세요</p>}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={outsourced} onChange={(e) => setOutsourced(e.target.checked)} />
          외주 처리 (작업 업체에 의뢰)
        </label>
        {outsourced && (
          <div>
            <label className="text-xs font-bold text-slate-400 block mb-1">작업 업체명</label>
            <input className={inputCls} placeholder="예: OO엘리베이터설비" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
            {!vendorName.trim() && <p className="text-[10px] text-red-500 mt-1">작업 업체명을 입력해주세요</p>}
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">할 일 기한</label>
          <DateTextInput key={dueDate} value={dueDate} onChange={setDueDate} />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">내용</label>
          <textarea
            className={inputCls}
            rows={3}
            placeholder="담당 기사에게 전달할 내용을 입력하세요"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <button
          onClick={submit}
          disabled={saving || uploading || assigneeIds.length === 0 || (outsourced && !vendorName.trim())}
          className="w-full bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg"
        >
          {saving ? "처리 중..." : isEdit ? "수정 저장" : "자재 지급 완료 체크"}
        </button>
      </div>
    </Modal>
  );
}

// 청구내역(BillingsAdmin.jsx의 BillingDetailModal)과 동일한 구성 —
// 라벨/값 그리드 + 사진 그리드. 실제 수정(담당기사/금액/사진)은 목록의
// "지급완료 처리"/"수정" 버튼이 여는 전용 모달에서 하므로 여기는 읽기 전용이다.
function RequestDetailModal({ target, data, onClose }) {
  const { type, data: r } = target;
  const isMaterial = type === "material";
  // 견적요청은 아직 견적서를 만들기 전(요청접수)과 이미 작성한 이후로 상세내역 구성이 달라진다 —
  // 작성 이후엔 공사내용 대신 견적명, 신청일 대신 작성일, 사진 대신 PDF 미리보기를 보여준다.
  const isDraftedQuote = !isMaterial && r.status !== "요청접수";
  const assignee = assigneeNames(data, isMaterial ? "materialRequestId" : "quoteRequestId", r.id);
  const hasRequester = !!(r.requesterId || r.engineer);
  // 견적요청서에 기사가 적어둔 연락처가 비어있는 경우가 많아, 현장 대표 담당자 연락처로 대체한다.
  const primaryManager = !isMaterial
    ? (data.siteManagers ?? []).filter((m) => m.siteId === r.siteId).find((m) => m.isPrimary)
      ?? (data.siteManagers ?? []).find((m) => m.siteId === r.siteId)
    : null;
  const otherManagers = !isMaterial ? (data.siteManagers ?? []).filter((m) => m.siteId === r.siteId && m.id !== primaryManager?.id) : [];
  const displayStatus = isMaterial
    ? r.status === "지급완료"
      ? (billingCompleteFor(data.todos ?? [], "materialRequestId", r.id) ? "교체완료" : "지급완료")
      : r.status
    : r.status === "자재지급완료"
      ? (billingCompleteFor(data.todos ?? [], "quoteRequestId", r.id) ? "교체완료" : "지급완료")
      : r.status;
  const tone = (isMaterial ? MATERIAL_TONE : QUOTE_TONE)[displayStatus] ?? "slate";
  const photos = [...(r.photoUrls ?? []), ...(r.supplyPhotoUrls ?? [])];

  return (
    <Modal title={isMaterial ? "자재신청 상세내역" : isDraftedQuote ? "견적 상세내역" : "견적요청 상세내역"} onClose={onClose} wide="2xl">
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 · 호기</p><p className="font-semibold text-slate-800">{isMaterial ? locOf(data, r.unitId, r.siteName, r.elevatorNo) : quoteLocLabel(data, r)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 주소</p><p className="font-semibold text-slate-800">{addressOf(data, r.unitId, r.siteName)}</p></div>
          {isMaterial ? (
            <div><p className="text-xs font-bold text-slate-400 mb-1">부품 내역</p><p className="font-semibold text-slate-800">{r.part}</p></div>
          ) : isDraftedQuote ? (
            <div><p className="text-xs font-bold text-slate-400 mb-1">견적명</p><p className="font-semibold text-slate-800">{r.quoteTitle || "-"}</p></div>
          ) : (
            <div><p className="text-xs font-bold text-slate-400 mb-1">공사 내용</p><p className="font-semibold text-slate-800">{r.constructionType}</p></div>
          )}
          <div><p className="text-xs font-bold text-slate-400 mb-1">{isMaterial ? "긴급도" : "현장 담당자 연락처"}</p><p className="font-semibold text-slate-800">{isMaterial ? r.urgency : (r.contactPhone || (primaryManager?.phone ? `${primaryManager.phone}${otherManagers.length ? ` 외 ${otherManagers.length}명` : ""}` : "-"))}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">{isDraftedQuote ? "작성일" : "신청일"}</p><p className="font-semibold text-slate-800">{shortDate(isDraftedQuote ? r.quoteIssuedDate : r.requestedDate)}</p></div>
          {(isMaterial || hasRequester) && (
            <div><p className="text-xs font-bold text-slate-400 mb-1">신청 기사</p><p className="font-semibold text-slate-800">{personOf(data, r.requesterId, r.engineer)}</p></div>
          )}
          {assignee && (
            <div><p className="text-xs font-bold text-slate-400 mb-1">담당 기사</p><p className="font-semibold text-slate-800">{assignee}</p></div>
          )}
          {isMaterial && (
            <div><StatusBadge tone={tone}>{displayStatus}</StatusBadge></div>
          )}
        </div>

        {!isMaterial && (
          <>
            <div>
              <p className="text-xs font-bold text-slate-400 mb-1">발송일</p>
              <SentHistory log={r} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 mb-1">진행상태</p>
              {(() => {
                const { stage, dates } = quoteStageInfo(r, data.todos ?? []);
                return (
                  <div className="flex gap-1">
                    {QUOTE_STAGES.map((s) => (
                      <div key={s} className="flex flex-col items-center">
                        <StatusBadge tone={s === stage ? QUOTE_STAGE_TONES[s] : "slate"}>{s}</StatusBadge>
                        <span className="text-[9px] text-slate-400 mt-0.5">{dates[s]}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {r.note && (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기사 의견</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.note}</p>
          </div>
        )}

        {isMaterial && r.status === "반려" && r.rejectReason && (
          <div>
            <p className="text-xs font-bold text-red-500 mb-1">반려 사유</p>
            <p className="text-sm text-red-700">{r.rejectReason}</p>
          </div>
        )}
      </div>

      {isDraftedQuote && r.quotePdfUrl ? (
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">견적서 PDF 미리보기</p>
          <QuotePdfPreview url={r.quotePdfUrl} />
        </div>
      ) : photos.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">사진 ({photos.length}장)</p>
          <PhotoGrid urls={photos} />
        </div>
      ) : null}
    </Modal>
  );
}

// 관리자가 기사 요청 없이 새 견적을 발행할 때 현장을 고르는 팝업.
// formWidgets.jsx의 SiteSearchSelect는 SitesContext(모바일 트리 전용)로 현장을 읽어서
// 관리자 콘솔에서는 목록이 비어 보인다 — 그래서 sites를 prop으로 받는 버전을 따로 둔다.
function QuoteNewSiteModal({ sites, onClose, onSelect }) {
  const [query, setQuery] = useState("");
  const filtered = sites.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal title="새 견적 발행 — 현장 선택" onClose={onClose}>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className={`${inputCls} pl-8`}
          placeholder="현장명을 검색하세요"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="h-72 overflow-y-auto space-y-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">검색 결과가 없습니다</p>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0 rounded-lg"
            >
              {s.name}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
