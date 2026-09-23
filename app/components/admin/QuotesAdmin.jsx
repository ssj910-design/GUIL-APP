"use client";

// 견적 처리 — 작성·승인·자재지급완료 액션 포함.
// 입력이 필요 없는 전환(작성·승인)은 행에서 바로 처리하고, 사진·담당기사·금액처럼
// 입력이 필요한 전환(견적 자재지급완료)만 모달을 쓴다 (하이브리드 설계 —
// docs/superpowers/specs/2026-07-21-materials-admin-actions-design.md).
import { useContext, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { notify } from "@/lib/push";
import { mapQuoteRequest } from "@/lib/mappers";
import { uploadPhoto } from "@/lib/photos";
import { inferQuoteUnitId, addDays, shortDate, formatUnitLabel, labelToSeq, quoteUnitLabel } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { recordQuoteSupplyStockOut } from "@/lib/inventoryStock";
import { rejectQuoteRequest, rejectLabelOf, QUOTE_REJECTABLE, QUOTE_REJECT_REASONS } from "@/lib/quoteReject";
import { locOf, addressOf, personOf, assigneeNames, billingCompleteFor, StatusBadge, AdminTable, FilterPills, inputCls, Modal, PhotoGrid, DateTextInput, lastSentDate, SentHistory, AdminAuthContext } from "@/app/components/admin/adminShared";
import QuoteItemsModal from "@/app/components/admin/QuoteItemsModal";
import QuoteSendModal from "@/app/components/admin/QuoteSendModal";
import QuotePdfPreview from "@/app/components/admin/QuotePdfPreview";

// 할 일 제목에 쓸 호기 — v2 unit_id가 있으면 그걸 우선하고(관리자 콘솔은 v2 네이티브),
// 없으면 견적 요청 자체의 elevatorNo, 그것도 없으면(관리자가 새로 작성한 견적) 품목에
// 적어둔 호기로 대신한다 — 품목마다 호기가 다르면 특정할 수 없으니 표시하지 않는다.
// "현장 · 호기" 표시 — 호기는 quoteUnitLabel과 같은 기준(요청 elevatorNos/elevatorNo →
// 품목별 unitNo)으로 정한다.
function quoteLocLabel(data, q) {
  const siteName = data.sites.find((s) => s.id === q.siteId)?.name ?? q.siteName ?? "-";
  const unit = quoteUnitLabel(data.units, q, q.unitId);
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
  else if (q.status === "반려") stage = "반려";

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

export default function QuotesAdmin({ data, setData }) {
  const { id: meId, name: meName, tier } = useContext(AdminAuthContext);
  const isSuper = tier === "super";
  const { quoteRequests: allQuoteRequests } = data;

  // 알림톡이 실제로 도착했는지 솔라피에 직접 물어봐 반영한다 — 웹훅 결과가 안 올 때가 있어서다.
  // 예전엔 견적 발송 현황 패널이 화면에 뜰 때 하던 일인데, 패널을 없애도 조회는 남긴다.
  // 화면을 열 때 한 번. 확인 중인 건이 없으면 서버가 바로 0을 돌려줘 부담이 없다.
  useEffect(() => {
    fetch("/api/alimtalk-status", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (!(d?.updated > 0) || !d.changedRows) return;
        setData((prev) => ({
          ...prev,
          quoteRequests: prev.quoteRequests.map((q) => (d.changedRows[q.id] ? { ...q, sendLog: d.changedRows[q.id] } : q)),
        }));
      })
      .catch(() => { /* 조회 실패는 조용히 — 기존 표시가 그대로 남는다 */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [search, setSearch] = useState("");
  const [quoteStageFilter, setQuoteStageFilter] = useState("all");
  const [quoteSupplyTarget, setQuoteSupplyTarget] = useState(null); // 자재지급완료 처리 중인 견적요청
  // 지급완료 체크는 모달이 닫히는 것 말고는 눈에 보이는 반응이 없어(목록 배지 변화는 필터에
  // 가려 안 보일 수 있음) "됐나?" 싶은 게 당연하다 — 처리 직후 잠깐 토스트를 띄운다.
  const [toast, setToast] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null); // 상세내역 보는 중인 견적요청
  const [rejectTarget, setRejectTarget] = useState(null); // 반려/취소 사유 입력 중인 견적요청
  const [itemsTarget, setItemsTarget] = useState(null); // 품목편집 중인 견적요청
  const [sendTarget, setSendTarget] = useState(null); // 발송 중인 견적요청
  const [pickingSite, setPickingSite] = useState(false); // 새 견적 발행 — 현장선택 모달
  // todos.is_outsourced 컬럼 존재 여부 — 마이그레이션 121 실행 전엔 컬럼이 없다.
  const todoOutsourcedReady = (data.todos ?? []).some((t) => t.isOutsourced !== undefined);
  // todos.elevator_nos 컬럼 존재 여부 — 마이그레이션 131 실행 전엔 컬럼이 없어, 있을 때만
  // 한 견적이 다루는 호기 전체 목록을 할 일에도 같이 담는다.
  const todoElevatorNosReady = (data.todos ?? []).some((t) => t.elevatorNos !== undefined);

  const query = search.trim().toLowerCase();
  const quoteRequestsSearched = allQuoteRequests.filter((q) =>
    !query || locOf(data, q.unitId, q.siteName, q.elevatorNo).toLowerCase().includes(query) || (q.constructionType ?? "").toLowerCase().includes(query) || personOf(data, q.requesterId, q.engineer).toLowerCase().includes(query)
      || (q.quoteItems ?? []).some((it) => (it.spec ?? "").toLowerCase().includes(query))
  );
  // 기사가 요청 후 취소한 건(취소)은 목록에서 뺀다 — 삭제하지 않고 데이터는 그대로 남겨(cancelled_at/
  // cancelled_by로 감사 기록 보존) 화면에만 안 보이게 한다. 관리자가 반려/취소한 건(반려)은 평소
  // 목록에서 빼고 "반려·취소" 필터에서만 본다.
  const liveSearched = quoteRequestsSearched.filter((q) => q.status !== "취소" && q.status !== "반려");
  const rejectedSearched = quoteRequestsSearched.filter((q) => q.status === "반려");
  const quoteRequests = quoteStageFilter === "반려"
    ? rejectedSearched
    : liveSearched.filter((q) => quoteStageFilter === "all" || quoteStageInfo(q, data.todos ?? []).stage === quoteStageFilter);
  // 아직 견적서를 만들기 전(요청만 들어온 건)과 이미 작성을 시작한 건을 목록에서 바로 구분해 보여준다.
  const pendingQuoteRequests = quoteRequests.filter((q) => q.status === "요청접수");
  const draftedQuoteRequests = quoteRequests.filter((q) => q.status !== "요청접수");

  async function handleQuoteReject(quote, { reason, restoreStock }) {
    const res = await rejectQuoteRequest(supabase, { quote, reason, restoreStock, rejectedBy: meName, createdBy: meId });
    if (res.error) { alert(res.error); return false; }
    if (res.warning) alert(res.warning);
    setData((prev) => ({
      ...prev,
      quoteRequests: prev.quoteRequests.map((x) => (x.id === quote.id ? { ...x, ...res.patch } : x)),
      todos: prev.todos.filter((t) => !res.removedTodoIds.includes(t.id)),
    }));
    return true;
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
    const unitId = inferQuoteUnitId(data.units, quote.siteId, quote);
    const finalVendorName = isOutsourced ? (vendorName || null) : null;
    const newTodos = assigneeIds.filter(Boolean).map((assigneeId, idx) => {
      const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
      return {
        id: `todo-quote-${quote.id}-${idx}`,
        quoteRequestId: quote.id,
        materialRequestId: null,
        source: "quote",
        title: `${quote.siteName}${quoteUnitLabel(data.units, quote, unitId) ? ` ${quoteUnitLabel(data.units, quote, unitId)}` : ""} ${quote.quoteTitle || quote.constructionType}`,
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
      notify("supply_ready", { profileIds: [t.assigneeId], title: "견적 자재 지급 완료 — 수령 확인해주세요", body: `${quote.siteName}${quoteUnitLabel(data.units, quote, unitId) ? ` · ${quoteUnitLabel(data.units, quote, unitId)}` : ""} · ${quote.constructionType}`, url: `/?openTodo=${t.id}` });
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
    const toAddIds = assigneeIds.filter((id) => id && !existingTodos.some((t) => t.assigneeId === id));

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

    const unitId = inferQuoteUnitId(data.units, quote.siteId, quote);
    const newTodos = toAddIds.map((assigneeId) => {
      const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
      return {
        // 위치인덱스(existingTodos.length) id는 담당자 add/remove 반복 시 살아있는 할일과 충돌해 덮어썼다 → 고유 id (P1-5)
        id: `todo-quote-${quote.id}-${crypto.randomUUID()}`,
        quoteRequestId: quote.id,
        materialRequestId: null,
        source: "quote",
        title: `${quote.siteName}${quoteUnitLabel(data.units, quote, unitId) ? ` ${quoteUnitLabel(data.units, quote, unitId)}` : ""} ${quote.quoteTitle || quote.constructionType}`,
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
      notify("supply_ready", { profileIds: [t.assigneeId], title: "견적 자재 지급 담당자로 지정됨 — 수령 확인해주세요", body: `${quote.siteName}${quoteUnitLabel(data.units, quote, unitId) ? ` · ${quoteUnitLabel(data.units, quote, unitId)}` : ""} · ${quote.constructionType}`, url: `/?openTodo=${t.id}` });
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

  async function handleCreateQuote(siteId, unitId) {
    const site = (data.sites ?? []).find((s) => s.id === siteId);
    if (!site) return;
    const unit = unitId ? (data.units ?? []).find((u) => u.id === unitId) : null;
    const row = {
      id: "q" + Date.now(),
      site_id: siteId,
      site_name: site.name,
      elevator_no: unit?.unitNo ?? null,
      unit_id: unit?.id ?? null,
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

  const renderQuoteRow = (q, drafted) => (
    <tr
      key={q.id}
      className="border-b border-slate-50 cursor-pointer hover:bg-slate-50"
      onClick={() => setDetailTarget(q)}
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
        {q.status === "반려" ? (
          <div className="flex items-center gap-1.5">
            <StatusBadge tone="red">{rejectLabelOf(q)}</StatusBadge>
            <span className="text-xs text-slate-500 truncate max-w-64">{q.rejectReason}</span>
            <span className="text-[10px] text-slate-400">{q.rejectedAt ? shortDate(q.rejectedAt.slice(0, 10)) : ""}</span>
          </div>
        ) : (() => {
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
          <div className="flex gap-1.5">
            <button onClick={(e) => { e.stopPropagation(); setQuoteSupplyTarget(q); }} className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors px-2.5 py-1.5 rounded-lg">
              지급하기
            </button>
            {/* 승인·자재지급완료 이후 견적서 정정은 재승인·재지급 절차가 다시 필요할 수 있어
                최고관리자만 — QuoteItemsModal은 이미 진행된 상태를 "작성"으로 되돌리지 않고
                품목·금액·PDF만 갱신한다. */}
            {isSuper && (
              <button onClick={(e) => { e.stopPropagation(); setItemsTarget(q); }} className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                견적서 수정
              </button>
            )}
            {q.quotePdfUrl && (
              <a href={q.quotePdfUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-bold text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-lg">
                PDF 보기
              </a>
            )}
          </div>
        )}
        {q.status === "자재지급완료" && (
          <div className="flex gap-1.5">
            <button onClick={(e) => { e.stopPropagation(); setQuoteSupplyTarget(q); }} className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors px-2.5 py-1.5 rounded-lg">
              수정
            </button>
            {isSuper && (
              <button onClick={(e) => { e.stopPropagation(); setItemsTarget(q); }} className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                견적서 수정
              </button>
            )}
            {q.quotePdfUrl && (
              <a href={q.quotePdfUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-bold text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-lg">
                PDF 보기
              </a>
            )}
          </div>
        )}
      </td>
    </tr>
  );
  // 요청접수(아직 견적서 없음)와 작성 이후를 한 표로 합치되, 요청건이 항상 맨 위에
  // 오게 한다 — 각 그룹 내부 정렬(quoteRequestsSearched에서 내려온 순서)은 그대로 유지.
  // 날짜·내용 칼럼 라벨은 두 케이스를 다 아우르는 공통 이름으로 통일(행 안의 실제 값은
  // renderQuoteRow가 drafted 여부에 따라 신청일/작성일, 공사내용/견적명 중 알맞게 보여줌).
  const quoteHead = ["날짜", "현장 · 호기", "내용", "신청 기사", "진행상태", "처리"];
  const mergedRows = [
    ...pendingQuoteRequests.map((q) => renderQuoteRow(q, false)),
    // 요청접수 단계에서 반려된 건은 작성일이 없어 신청일·공사내용으로 보여준다.
    ...draftedQuoteRequests.map((q) => renderQuoteRow(q, q.status !== "반려" || !!q.quoteIssuedDate)),
  ];

  const stages = liveSearched.map((q) => quoteStageInfo(q, data.todos ?? []).stage);
  const stageCounts = QUOTE_STAGES.reduce((acc, s) => ({ ...acc, [s]: stages.filter((x) => x === s).length }), {});

  return (
    <div className="max-w-[100rem] mx-auto">
      <h1 className="text-xl font-extrabold mb-4">견적관리</h1>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="relative max-w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-8`} placeholder="현장·부품·규격·기사명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          onClick={() => setPickingSite(true)}
          className="text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 transition-colors px-3 py-1.5 rounded-lg whitespace-nowrap"
        >
          + 새 견적서
        </button>
      </div>

      <div className="mb-3">
        <FilterPills
          value={quoteStageFilter}
          onChange={setQuoteStageFilter}
          options={[
            { value: "all", label: "전체", count: liveSearched.length },
            ...QUOTE_STAGES.map((s) => ({ value: s, label: s, count: stageCounts[s] })),
            { value: "반려", label: "반려·취소", count: rejectedSearched.length },
          ]}
        />
      </div>

      <AdminTable head={quoteHead}>{mergedRows}</AdminTable>
      {mergedRows.length === 0 && <p className="text-xs text-slate-400 text-center py-6">해당하는 건이 없습니다</p>}

      {quoteSupplyTarget && (
        <QuoteSupplyModal
          quote={quoteSupplyTarget}
          profiles={data.profiles ?? []}
          todos={data.todos ?? []}
          onClose={() => setQuoteSupplyTarget(null)}
          onSubmit={async (input) => {
            const isEdit = quoteSupplyTarget.status === "자재지급완료";
            if (isEdit) await handleQuoteEdit(quoteSupplyTarget, input);
            else await handleQuoteSupplyComplete(quoteSupplyTarget, input);
            setQuoteSupplyTarget(null);
            setToast(isEdit ? "수정했습니다." : "자재 지급 완료 처리했습니다.");
            setTimeout(() => setToast(null), 1800);
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
          units={data.units ?? []}
          onClose={() => setPickingSite(false)}
          onSelect={handleCreateQuote}
        />
      )}

      {detailTarget && (
        <QuoteDetailModal quote={detailTarget} data={data} onClose={() => setDetailTarget(null)} onReject={() => setRejectTarget(detailTarget)} />
      )}

      {rejectTarget && (
        <QuoteRejectModal
          quote={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSubmit={async (input) => {
            if (!(await handleQuoteReject(rejectTarget, input))) return;
            const label = rejectLabelOf(rejectTarget);
            setRejectTarget(null);
            setDetailTarget(null);
            setToast(`${label} 처리했습니다.`);
            setTimeout(() => setToast(null), 1800);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-slate-800/90 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function QuoteSupplyModal({ quote, profiles, todos, onClose, onSubmit }) {
  const isEdit = quote.status === "자재지급완료";
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 배정할 수 있어야 한다.
  // 견적(외주 처리 포함) 건은 대표(신석주)가 직접 처리하는 경우가 있어 명단에 추가로 포함한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material" || p.name === "신석주") && p.is_active !== false); // 제외된 기사는 배정 목록에서 뺀다
  const existingTodosForQuote = todos.filter((t) => t.quoteRequestId === quote.id && t.source === "quote");
  // 담당자 없이 만들어진 옛 할일 행(assigneeId null)이 섞여 있으면 그대로 다시 담겨
  // "담당자 -" 행이 계속 재생성된다 — 빈 값은 여기서 걸러낸다.
  const existingAssigneeIds = existingTodosForQuote.map((t) => t.assigneeId).filter(Boolean);
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
        {/* 자재를 챙기는 바로 이 화면에서 기사가 찍은 현장 사진(부품 규격·상태)을 같이 본다. */}
        {quote.photoUrls?.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-400 mb-1">기사 요청 사진 ({quote.photoUrls.length}장)</p>
            <PhotoGrid urls={quote.photoUrls} cols={6} />
          </div>
        )}
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
// 반려/취소 사유 입력 — 승인 전엔 "반려", 승인 후(고객 취소 등)엔 "견적 취소". 자재지급완료 건은
// 할일이 삭제되고, 부품마스터 연동 품목이 있으면 재고를 되돌릴지 고른다(자재가 실제로 돌아왔을 때만).
function QuoteRejectModal({ quote, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [restoreStock, setRestoreStock] = useState(false);
  const [saving, setSaving] = useState(false);
  const label = rejectLabelOf(quote);
  const supplied = quote.status === "자재지급완료";
  const hasStockItems = (quote.quoteItems ?? []).some((it) => it.partId);

  async function submit() {
    if (!reason.trim() || saving) return;
    setSaving(true);
    await onSubmit({ reason: reason.trim(), restoreStock: supplied && restoreStock });
    setSaving(false);
  }

  return (
    <Modal title={`${label} — ${quote.siteName ?? ""}`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">
        {supplied ? "담당 기사의 할 일이 삭제되고, 신청 기사·담당 기사에게 사유와 함께 알림이 갑니다." : "신청 기사에게 사유와 함께 알림이 갑니다."}
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {QUOTE_REJECT_REASONS.map((r) => (
          <button key={r} onClick={() => setReason(r)} className={`text-xs font-bold px-3 py-1.5 rounded-full border ${reason === r ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-500 border-slate-200"}`}>
            {r}
          </button>
        ))}
      </div>
      <textarea className={inputCls} rows={3} placeholder="사유 (직접 입력 가능)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {supplied && hasStockItems && (
        <label className="flex items-center gap-2 mt-3 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={restoreStock} onChange={(e) => setRestoreStock(e.target.checked)} />
          지급한 자재가 창고로 돌아옴 — 재고 되돌리기
        </label>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="text-sm font-bold text-slate-500 px-4 py-2 rounded-lg border border-slate-200">닫기</button>
        <button onClick={submit} disabled={!reason.trim() || saving} className="text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-300 px-4 py-2 rounded-lg">
          {saving ? "처리 중..." : `${label}하기`}
        </button>
      </div>
    </Modal>
  );
}

function QuoteDetailModal({ quote: r, data, onClose, onReject }) {
  // 청구까지 끝난 건은 견적이 아니라 청구 정리 문제라 반려/취소 버튼을 숨긴다(lib에서도 막음).
  const billed = (data.todos ?? []).some((t) => t.quoteRequestId === r.id && t.source === "quote" && t.done);
  const canReject = QUOTE_REJECTABLE.includes(r.status) && !billed;
  // 견적요청은 아직 견적서를 만들기 전(요청접수)과 이미 작성한 이후로 상세내역 구성이 달라진다 —
  // 작성 이후엔 공사내용 대신 견적명, 신청일 대신 작성일, 사진 대신 PDF 미리보기를 보여준다.
  const isDraftedQuote = r.status !== "요청접수";
  const assignee = assigneeNames(data, "quoteRequestId", r.id);
  const hasRequester = !!(r.requesterId || r.engineer);
  // 견적요청서에 기사가 적어둔 연락처가 비어있는 경우가 많아, 현장 대표 담당자 연락처로 대체한다.
  const primaryManager = (data.siteManagers ?? []).filter((m) => m.siteId === r.siteId).find((m) => m.isPrimary)
    ?? (data.siteManagers ?? []).find((m) => m.siteId === r.siteId);
  const otherManagers = (data.siteManagers ?? []).filter((m) => m.siteId === r.siteId && m.id !== primaryManager?.id);

  return (
    <Modal title={isDraftedQuote ? "견적 상세내역" : "견적요청 상세내역"} onClose={onClose} wide="2xl">
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 · 호기</p><p className="font-semibold text-slate-800">{quoteLocLabel(data, r)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 주소</p><p className="font-semibold text-slate-800">{addressOf(data, r.unitId, r.siteName)}</p></div>
          {isDraftedQuote ? (
            <div><p className="text-xs font-bold text-slate-400 mb-1">견적명</p><p className="font-semibold text-slate-800">{r.quoteTitle || "-"}</p></div>
          ) : (
            <div><p className="text-xs font-bold text-slate-400 mb-1">공사 내용</p><p className="font-semibold text-slate-800">{r.constructionType}</p></div>
          )}
          {/* 기사가 입력한 전화·이메일·팩스를 한 줄에 이어서 — 아무것도 없으면 현장 대표 담당자 연락처 */}
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 담당자 연락처</p><p className="font-semibold text-slate-800 break-all">
            {[r.contactPhone, r.contactEmail, r.contactFax ? `fax.${r.contactFax}` : null].filter(Boolean).join(", ")
              || (primaryManager?.phone ? `${primaryManager.phone}${otherManagers.length ? ` 외 ${otherManagers.length}명` : ""}` : "-")}
          </p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">{isDraftedQuote ? "작성일" : "신청일"}</p><p className="font-semibold text-slate-800">{shortDate(isDraftedQuote ? r.quoteIssuedDate : r.requestedDate)}</p></div>
          {hasRequester && (
            <div><p className="text-xs font-bold text-slate-400 mb-1">신청 기사</p><p className="font-semibold text-slate-800">{personOf(data, r.requesterId, r.engineer)}</p></div>
          )}
          {assignee && (
            <div><p className="text-xs font-bold text-slate-400 mb-1">담당 기사</p><p className="font-semibold text-slate-800">{assignee}</p></div>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 mb-1">발송일</p>
          <SentHistory log={r} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 mb-1">진행상태</p>
          {r.status === "반려" ? (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-xs font-bold text-red-600">
                {rejectLabelOf(r)}{r.rejectedAt ? ` · ${r.rejectedAt.slice(0, 10)}` : ""}{r.rejectedBy ? ` · ${r.rejectedBy}` : ""}
              </p>
              <p className="text-sm font-semibold text-red-700 mt-0.5 whitespace-pre-wrap">{r.rejectReason || "-"}</p>
            </div>
          ) : (() => {
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

        {/* 기사가 입력한 내용은 사진 바로 위에 모아 보여준다 — 작성 이후엔 위 칸이 견적명으로
            바뀌어 기사가 적은 요청 내역이 안 보였다(작성 전엔 위 "공사 내용"에 이미 있음). */}
        {isDraftedQuote && hasRequester && r.constructionType && (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기사 요청 내역</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.constructionType}</p>
          </div>
        )}
        {r.note && (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기사 의견</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.note}</p>
          </div>
        )}
      </div>

      {r.photoUrls?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-bold text-slate-500 mb-2">기사 요청 사진 ({r.photoUrls.length}장)</p>
          <PhotoGrid urls={r.photoUrls} cols={6} />
        </div>
      )}
      {r.supplyPhotoUrls?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-bold text-slate-500 mb-2">지급 사진 ({r.supplyPhotoUrls.length}장)</p>
          <PhotoGrid urls={r.supplyPhotoUrls} cols={6} />
        </div>
      )}
      {isDraftedQuote && r.quotePdfUrl && (
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">견적서 PDF 미리보기</p>
          <QuotePdfPreview url={r.quotePdfUrl} />
        </div>
      )}
      {canReject && (
        <div className="flex justify-end mt-4">
          <button onClick={onReject} className="text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg">
            {rejectLabelOf(r)}
          </button>
        </div>
      )}
    </Modal>
  );
}

// 관리자가 기사 요청 없이 새 견적을 발행할 때 현장을 고르는 팝업.
// formWidgets.jsx의 SiteSearchSelect는 SitesContext(모바일 트리 전용)로 현장을 읽어서
// 관리자 콘솔에서는 목록이 비어 보인다 — 그래서 sites를 prop으로 받는 버전을 따로 둔다.
function QuoteNewSiteModal({ sites, units, onClose, onSelect }) {
  const [query, setQuery] = useState("");
  const [site, setSite] = useState(null);
  const filtered = sites.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  if (site) {
    const siteUnits = (units ?? []).filter((u) => u.siteId === site.id);
    return (
      <Modal title={`새 견적 발행 — 호기 선택 (${site.name})`} onClose={onClose}>
        <div className="h-72 overflow-y-auto space-y-1">
          {siteUnits.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onSelect(site.id, u.id)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0 rounded-lg"
            >
              {formatUnitLabel(u.unitNo)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onSelect(site.id, null)}
            className="w-full text-left px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-50 rounded-lg"
          >
            호기 선택 안 함
          </button>
        </div>
      </Modal>
    );
  }

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
              onClick={() => setSite(s)}
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
