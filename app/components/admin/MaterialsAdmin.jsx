"use client";

// 자재·견적 처리 — 지급완료(자재)/견적발행·승인·자재지급완료(견적) 액션 포함.
// 입력이 필요 없는 전환(견적발행·승인)은 행에서 바로 처리하고, 사진·담당기사·금액처럼
// 입력이 필요한 전환(자재 지급완료, 견적 자재지급완료)만 모달을 쓴다 (하이브리드 설계 —
// docs/superpowers/specs/2026-07-21-materials-admin-actions-design.md).
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadPhoto } from "@/lib/photos";
import { unitIdFor, addDays, shortDate } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { locOf, personOf, StatusBadge, AdminTable, FilterPills, inputCls, Modal, PhotoGrid, DateTextInput } from "@/app/components/admin/adminShared";

const MATERIAL_TONE = { 승인대기: "blue", 지급완료: "green", 반려: "red", 교체완료: "indigo" };
const QUOTE_TONE = { 요청접수: "blue", 견적발행: "amber", 승인: "amber", 지급완료: "green", 교체완료: "indigo" };

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
  const linked = todos.filter((t) => t[key] === requestId);
  return linked.length > 0 && linked.every((t) => t.done);
}

// 지급완료 처리 시 만들어지는 연결 할 일(todos)의 담당자 — 요청 자체엔 담당기사 컬럼이 없고
// todos.assignee(_id)에만 있어서(견적은 담당 기사 여러 명 가능) 여기서 조인해 이름을 뽑는다.
function assigneeNames(data, key, requestId) {
  const linked = (data.todos ?? []).filter((t) => t[key] === requestId);
  if (!linked.length) return null;
  return linked.map((t) => personOf(data, t.assigneeId, t.assignee)).join(", ");
}

export default function MaterialsAdmin({ data, setData }) {
  const { materialRequests: allMaterialRequests, quoteRequests: allQuoteRequests } = data;
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [payTarget, setPayTarget] = useState(null); // 지급완료 처리 중인 자재신청
  const [quoteSupplyTarget, setQuoteSupplyTarget] = useState(null); // 자재지급완료 처리 중인 견적요청
  const [detailTarget, setDetailTarget] = useState(null); // 상세내역 보는 중인 신청 { type, data }

  const query = search.trim();
  const materialRequests = allMaterialRequests.filter((m) =>
    !query || locOf(data, m.unitId, m.siteName, m.elevatorNo).includes(query) || (m.part ?? "").includes(query) || personOf(data, m.requesterId, m.engineer).includes(query)
  );
  const quoteRequests = allQuoteRequests.filter((q) =>
    !query || locOf(data, q.unitId, q.siteName, q.elevatorNo).includes(query) || (q.constructionType ?? "").includes(query) || personOf(data, q.requesterId, q.engineer).includes(query)
  );

  async function handleMaterialSupplyComplete(request, { assigneeId, billingPart, billingAmount, photoUrls }) {
    const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
    const assigneeName = engineer?.name ?? request.engineer;

    const todoId = "todo-" + request.id;
    const dueDate = addDays(TODAY_STR, 30);
    const unitId = request.unitId ?? unitIdFor(data.units, request.siteId, request.elevatorNo);
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
          unitId, assigneeId: assigneeId || null, billingPart, billingAmount,
        },
        ...prev.todos,
      ],
    }));
  }

  // 지급완료된 자재신청 수정 — 상태/지급일은 그대로 두고 사진·담당기사·금액만 바꾼다
  // (연결된 할 일은 이미 있으므로 새로 만들지 않고 그 자리에서 update).
  async function handleMaterialEdit(request, { assigneeId, billingPart, billingAmount, photoUrls }) {
    const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
    const assigneeName = engineer?.name ?? request.engineer;

    const patch = {
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("material_requests").update(patch).eq("id", request.id);
    if (error) { alert("수정 실패: " + error.message); return; }

    const todoId = "todo-" + request.id;
    const todoPatch = { assignee: assigneeName, assignee_id: assigneeId || null, billing_part: billingPart, billing_amount: billingAmount };
    const { error: todoError } = await supabase.from("todos").update(todoPatch).eq("id", todoId);
    if (todoError) { alert("할 일 수정 실패: " + todoError.message); return; }

    setData((prev) => ({
      ...prev,
      materialRequests: prev.materialRequests.map((r) =>
        r.id === request.id ? { ...r, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls } : r
      ),
      todos: prev.todos.map((t) =>
        t.id === todoId ? { ...t, assignee: assigneeName, assigneeId: assigneeId || null, billingPart, billingAmount } : t
      ),
    }));
  }

  async function handleQuoteAdvance(quote) {
    const isIssue = quote.status === "요청접수";
    const patch = isIssue
      ? { status: "견적발행", quote_issued_date: TODAY_STR }
      : { status: "승인", approved_date: TODAY_STR };
    const { error } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (error) { alert("처리 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      quoteRequests: prev.quoteRequests.map((x) => {
        if (x.id !== quote.id) return x;
        return isIssue
          ? { ...x, status: "견적발행", quoteIssuedDate: TODAY_STR }
          : { ...x, status: "승인", approvedDate: TODAY_STR };
      }),
    }));
  }

  async function handleQuoteSupplyComplete(quote, { assigneeIds, photoUrls, dueDate, description }) {
    const unitId = quote.unitId ?? unitIdFor(data.units, quote.siteId, quote.elevatorNo);
    const newTodos = assigneeIds.map((assigneeId, idx) => {
      const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
      return {
        id: `todo-quote-${quote.id}-${idx}`,
        quoteRequestId: quote.id,
        materialRequestId: null,
        source: "quote",
        title: `${quote.siteName} ${quote.constructionType} 시공 확인 및 서류 제출`,
        siteName: quote.siteName,
        elevatorNo: quote.elevatorNo,
        part: quote.constructionType,
        assignee: engineer?.name ?? quote.engineer,
        assignedDate: TODAY_STR,
        dueDate,
        done: false,
        unitId,
        assigneeId,
        description: description || null,
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
  async function handleQuoteEdit(quote, { assigneeIds, photoUrls, dueDate, description }) {
    const patch = {
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (error) { alert("수정 실패: " + error.message); return; }

    const existingTodos = (data.todos ?? []).filter((t) => t.quoteRequestId === quote.id);
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
        .update({ due_date: dueDate, description: description || null })
        .in("id", kept.map((t) => t.id));
      if (keepError) { alert("할 일 수정 실패: " + keepError.message); return; }
    }

    const unitId = quote.unitId ?? unitIdFor(data.units, quote.siteId, quote.elevatorNo);
    const startIdx = existingTodos.length;
    const newTodos = toAddIds.map((assigneeId, i) => {
      const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
      return {
        id: `todo-quote-${quote.id}-${startIdx + i}`,
        quoteRequestId: quote.id,
        materialRequestId: null,
        source: "quote",
        title: `${quote.siteName} ${quote.constructionType} 시공 확인 및 서류 제출`,
        siteName: quote.siteName,
        elevatorNo: quote.elevatorNo,
        part: quote.constructionType,
        assignee: engineer?.name ?? "",
        assignedDate: TODAY_STR,
        dueDate,
        done: false,
        unitId,
        assigneeId,
        description: description || null,
      };
    });
    if (newTodos.length) {
      const { error: todoError } = await supabase.from("todos").upsert(
        newTodos.map((t) => ({
          id: t.id, quote_request_id: t.quoteRequestId, source: t.source, title: t.title,
          site_name: t.siteName, elevator_no: t.elevatorNo, part: t.part,
          assignee: t.assignee, assigned_date: t.assignedDate, due_date: t.dueDate, done: t.done,
          unit_id: t.unitId, assignee_id: t.assigneeId, description: t.description,
        }))
      );
      if (todoError) { alert("할 일 생성 실패: " + todoError.message); return; }
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
          .map((t) => (kept.some((k) => k.id === t.id) ? { ...t, dueDate, description: description || null } : t)),
      ],
    }));
  }

  return (
    <div className="max-w-6xl">
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
        <div className="relative max-w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-8`} placeholder="현장·부품·기사명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <AdminTable head={["신청일", "현장 · 호기", "공사 내용", "신청 기사", "발행/승인/지급", "상태", "처리"]}>
          {quoteRequests.map((q) => (
            <tr
              key={q.id}
              className="border-b border-slate-50 cursor-pointer hover:bg-slate-50"
              onClick={() => setDetailTarget({ type: "quote", data: q })}
            >
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{shortDate(q.requestedDate)}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, q.unitId, q.siteName, q.elevatorNo)}</td>
              <td className="px-3 py-2.5 text-slate-600">{q.constructionType}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, q.requesterId, q.engineer)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                {shortDate(q.quoteIssuedDate)} / {shortDate(q.approvedDate)} / {shortDate(q.suppliedDate)}
              </td>
              <td className="px-3 py-2.5">
                {(() => {
                  const displayStatus =
                    q.status === "자재지급완료"
                      ? billingCompleteFor(data.todos ?? [], "quoteRequestId", q.id) ? "교체완료" : "지급완료"
                      : q.status;
                  return <StatusBadge tone={QUOTE_TONE[displayStatus] ?? "slate"}>{displayStatus}</StatusBadge>;
                })()}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {q.status === "요청접수" && (
                  <button onClick={(e) => { e.stopPropagation(); handleQuoteAdvance(q); }} className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                    견적발행 처리
                  </button>
                )}
                {q.status === "견적발행" && (
                  <button onClick={(e) => { e.stopPropagation(); handleQuoteAdvance(q); }} className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg">
                    승인 처리
                  </button>
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
          ))}
        </AdminTable>
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

      {detailTarget && (
        <RequestDetailModal target={detailTarget} data={data} onClose={() => setDetailTarget(null)} />
      )}
    </div>
  );
}

function MaterialSupplyModal({ request, profiles, todos, onClose, onSubmit }) {
  const isEdit = request.status === "지급완료";
  const existingTodo = todos.find((t) => t.materialRequestId === request.id);
  const engineers = profiles.filter((p) => p.role === "engineer");
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
    await onSubmit({ assigneeId, billingPart: billingPartText || null, billingAmount: total || null, photoUrls: photos });
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
  const engineers = profiles.filter((p) => p.role === "engineer");
  const existingTodosForQuote = todos.filter((t) => t.quoteRequestId === quote.id);
  const existingAssigneeIds = existingTodosForQuote.map((t) => t.assigneeId);
  const defaultId = quote.requesterId || engineers.find((p) => p.name === quote.engineer)?.id || "";
  const [assigneeIds, setAssigneeIds] = useState(existingAssigneeIds.length ? existingAssigneeIds : (defaultId ? [defaultId] : []));
  const [dueDate, setDueDate] = useState(existingTodosForQuote[0]?.dueDate ?? addDays(TODAY_STR, 30));
  const [description, setDescription] = useState(existingTodosForQuote[0]?.description ?? "");
  const [photos, setPhotos] = useState(quote.supplyPhotoUrls ?? []);
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
    setSaving(true);
    await onSubmit({ assigneeIds, photoUrls: photos, dueDate, description });
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
          disabled={saving || uploading || assigneeIds.length === 0}
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
  const assignee = assigneeNames(data, isMaterial ? "materialRequestId" : "quoteRequestId", r.id);
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
    <Modal title={isMaterial ? "자재신청 상세내역" : "견적요청 상세내역"} onClose={onClose} wide>
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 · 호기</p><p className="font-semibold text-slate-800">{locOf(data, r.unitId, r.siteName, r.elevatorNo)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">{isMaterial ? "부품 내역" : "공사 내용"}</p><p className="font-semibold text-slate-800">{isMaterial ? r.part : r.constructionType}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">{isMaterial ? "긴급도" : "현장 담당자 연락처"}</p><p className="font-semibold text-slate-800">{isMaterial ? r.urgency : (r.contactPhone || "-")}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">신청일</p><p className="font-semibold text-slate-800">{shortDate(r.requestedDate)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">신청 기사</p><p className="font-semibold text-slate-800">{personOf(data, r.requesterId, r.engineer)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">담당 기사</p><p className="font-semibold text-slate-800">{assignee ?? "미배정"}</p></div>
          <div><StatusBadge tone={tone}>{displayStatus}</StatusBadge></div>
        </div>

        {!isMaterial && (
          <div><p className="text-xs font-bold text-slate-400 mb-1">발행일 / 승인일 / 지급일</p><p className="font-semibold text-slate-800">{shortDate(r.quoteIssuedDate)} / {shortDate(r.approvedDate)} / {shortDate(r.suppliedDate)}</p></div>
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

      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">사진 ({photos.length}장)</p>
        <PhotoGrid urls={photos} />
      </div>
    </Modal>
  );
}
