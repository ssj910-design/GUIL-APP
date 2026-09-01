import { useState, useContext, useEffect, useRef } from "react";
import { ListTodo, Check, CheckCircle2, Search, Lock, Plus, Repeat, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { addDays, formatShortDate, formatYyMmDd } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { PrimaryButton, Sheet, Field, inputCls, PhotoGrid } from "@/app/components/ui";
import { SitesContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload } from "@/app/components/formWidgets";
import { confirmAsync } from "@/app/components/ConfirmHost";


/* ------------------------------------------------------------------ */
/* TODO (할일관리)                                                       */
/* ------------------------------------------------------------------ */


// 자재/견적 신청 시점의 신청자 이름을 찾아옵니다. 지급완료 시 실제 담당자를 신청자와
// 다르게 지정할 수 있어(★ 담당자 재배정 기능), 요청자와 담당자가 다를 수 있습니다.
export function getRequesterName(todo, materialRequests, quoteRequests) {
  if (todo.source === "material") return materialRequests?.find((r) => r.id === todo.materialRequestId)?.engineer ?? null;
  if (todo.source === "quote") return quoteRequests?.find((q) => q.id === todo.quoteRequestId)?.engineer ?? null;
  // 수동 등록 할일 — 097 마이그레이션 이전 행(requestedByName 없음)은 "관리자"로 표시.
  return todo.requestedByName ?? "관리자";
}

// 자재/견적 연동 할일은 담당자 수만큼 각자 별도 행으로 저장돼 있다(요청 하나당 여러 건) —
// 목록에는 같은 요청을 공유하는 행을 한 건으로 묶어서 보여준다(펼치면 기존처럼 전체
// 담당자가 보인다). 관리자 부여·검사보완 등 요청 연결이 없는 할일은 원래도 1건뿐이라 그대로 둔다.
function groupKeyOf(t) {
  if (t.source === "quote" && t.quoteRequestId) return `quote:${t.quoteRequestId}`;
  if (t.source === "material" && t.materialRequestId) return `material:${t.materialRequestId}`;
  return `solo:${t.id}`;
}

// 같은 견적/자재 요청에 연결된 다른 담당자의 할 일(공동 담당)을 찾습니다.
export function getCoAssignees(todo, todos) {
  if (!todo.quoteRequestId && !todo.materialRequestId) return [];
  return todos
    .filter(
      (t) =>
        t.id !== todo.id &&
        ((todo.quoteRequestId && t.quoteRequestId === todo.quoteRequestId) ||
          (todo.materialRequestId && t.materialRequestId === todo.materialRequestId))
    )
    .map((t) => t.assignee);
}

// 연결된 자재/견적 신청에 자재 담당자가 등록한 지급 사진을 찾아옵니다.
export function getSupplyPhotos(todo, materialRequests, quoteRequests) {
  if (todo.source === "material") return materialRequests?.find((r) => r.id === todo.materialRequestId)?.supplyPhotoUrls ?? [];
  if (todo.source === "quote") return quoteRequests?.find((q) => q.id === todo.quoteRequestId)?.supplyPhotoUrls ?? [];
  return [];
}

// 자재/견적 연동 할 일은 제목에 이미 현장명이 들어있어("OO빌딩 부품 교체 및..." 등) 상세에서는
// 현장명 대신 주소를 보여준다. 관리자 부여 할 일은 제목에 현장명이 없으므로 그대로 현장명을 쓴다.
export function getTodoSiteAddress(todo, materialRequests, quoteRequests, sites) {
  if (todo.source === "manual" || todo.source === "inspection" || todo.source === "selfcheck") return null;
  const req = todo.source === "material"
    ? materialRequests?.find((r) => r.id === todo.materialRequestId)
    : quoteRequests?.find((q) => q.id === todo.quoteRequestId);
  return sites?.find((s) => s.id === req?.siteId)?.address ?? null;
}

function TodoCheckbox({ done, locked, onClick }) {
  if (done) {
    if (!onClick) return <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />;
    return (
      <button type="button" onClick={onClick} className="shrink-0">
        <CheckCircle2 size={20} className="text-emerald-500" />
      </button>
    );
  }
  if (locked) {
    if (!onClick) {
      return (
        <div className="w-5 h-5 rounded-full border-2 border-slate-200 flex items-center justify-center shrink-0 text-slate-300">
          <Lock size={10} />
        </div>
      );
    }
    return (
      <button type="button" onClick={onClick} className="w-5 h-5 rounded-full border-2 border-slate-200 flex items-center justify-center shrink-0 text-slate-300">
        <Lock size={10} />
      </button>
    );
  }
  return <button type="button" onClick={onClick} className="w-5 h-5 rounded-full border-2 border-slate-300 shrink-0" />;
}

export function TodoTab({ todos, setTodos, onReassignTodo, onUpdateTodoDescription, onUpdateTodoDueDate, onExtendTodoDueDate, onRequestReassignTodo, onClearReassignRequest, onAssignTodo, onAdminToggle, onDeleteTodo, materialRequests, quoteRequests, focusTodoId, onFocusHandled }) {
  const { name: CURRENT_ENGINEER, engineerNames, role } = useContext(AuthContext);
  const sites = useContext(SitesContext);
  const [showDone, setShowDone] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  // 반납사진을 여러 장 연달아 올릴 때 setTodos만으로는 React 렌더 타이밍상 아직 반영 안 된
  // todo.photoUrls를 기준으로 계산될 수 있어(경쟁 상태 — 마지막 한 장만 저장되는 버그) —
  // ElevatorFieldApp의 supplyPhotoUrlsRef와 동일한 패턴으로 ref에 최신 배열을 동기적으로 보관한다.
  const photoUrlsRef = useRef({});
  // 알림/푸시로 특정 할일을 지목해 열 때 쓴다 — 사용자가 아코디언을 직접 조작하면(펼치기/접기)
  // 그 시점부터는 로컬 expandedId가 우선하고 focusTodoId는 해제한다(RoomTab의 focusPostId와 동일 패턴).
  const shownExpandedId = expandedId ?? focusTodoId;
  function setExpanded(id) {
    setExpandedId(id);
    if (focusTodoId) onFocusHandled?.();
  }
  useEffect(() => {
    if (!focusTodoId) return;
    document.getElementById(`todo-row-${focusTodoId}`)?.scrollIntoView({ block: "center" });
  }, [focusTodoId]);
  // 관리자는 본인 담당 할일이 아니라 전체 기사의 할일을 본다.
  const mine = role === "admin" ? todos : todos.filter((t) => t.assignee === CURRENT_ENGINEER);

  async function toggleManualTodo(id) {
    const current = todos.find((x) => x.id === id);
    if (!current) return;
    const done = !current.done;
    // 자체점검 지적사항(B/C)은 담당기사 전원에게 같은 selfCheckItemId로 할 일이 하나씩 생긴다.
    // 청구 화면(BillingTab)은 이미 형제 할일을 함께 완료 처리하는데, 이 체크박스 경로(청구 없이
    // 완료)는 그걸 안 해서 동료 할일이 영영 안 지워지는 문제가 있었다 — BillingTab의 idsToComplete와
    // 같은 패턴으로 형제도 같이 완료한다. 자체점검이 아닌 일반 수동 할일은 형제가 없어 그대로 단건 토글.
    const idsToComplete = (done && current.selfCheckItemId)
      ? todos.filter((t) => !t.done && t.selfCheckItemId === current.selfCheckItemId).map((t) => t.id)
      : [id];
    const { error } = await supabase.from("todos").update({ done }).in("id", idsToComplete);
    if (error) {
      alert(`할 일 완료 처리에 실패했습니다.\n${error.message ?? ""}\n다시 시도해주세요.`);
      return;
    }
    setTodos((prev) => prev.map((x) => (idsToComplete.includes(x.id) ? { ...x, done } : x)));
  }

  // 폐자재/여유부품 반납 할일의 반납사진 등록/삭제. 완료 조건(사진 1장 이상, 재오픈 후엔 기준선보다
  // 증가)은 TodoCheckbox·TodoDetailBody의 locked 계산에서 t.photoUrls/t.photoCount로 판정한다.
  async function writeTodoPhotos(id, urls) {
    photoUrlsRef.current[id] = urls;
    await supabase.from("todos").update({ photo_urls: urls }).eq("id", id);
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, photoUrls: urls } : x)));
  }
  async function addTodoPhoto(id, url) {
    const base = photoUrlsRef.current[id] ?? todos.find((x) => x.id === id)?.photoUrls ?? [];
    await writeTodoPhotos(id, [...base, url]);
  }
  async function removeTodoPhoto(id, idx) {
    const base = photoUrlsRef.current[id] ?? todos.find((x) => x.id === id)?.photoUrls ?? [];
    await writeTodoPhotos(id, base.filter((_, i) => i !== idx));
  }

  if (mine.length === 0 && role !== "admin") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <ListTodo size={32} className="text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-500">할 일이 없습니다</p>
        <p className="text-xs text-slate-400 mt-1.5">자재 담당자가 [자재 지급 완료] 처리를 하거나<br />관리자가 할 일을 부여하면 이곳에 표시됩니다</p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = mine
    .filter((t) => showDone || !t.done || t.id === focusTodoId)
    .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.siteName ?? "").toLowerCase().includes(q));
  // 같은 요청을 공유하는 행끼리 묶는다 — 기사 본인 화면은 어차피 자기 몫 1건만 남아 있어
  // 묶어도 그대로다. focusTodoId가 그룹 안에 있으면 그 행을 대표로 써서 딥링크 스크롤이 맞게 한다.
  const groupsMap = new Map();
  for (const t of filtered) {
    const key = groupKeyOf(t);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(t);
  }
  const visible = [...groupsMap.values()]
    .map((group) => ({ t: group.find((m) => m.id === focusTodoId) ?? group[0], group }))
    .sort((a, b) => new Date(a.t.dueDate) - new Date(b.t.dueDate));

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="flex items-center gap-2 px-5 pt-4">
        {role === "admin" && (
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            aria-label="할 일 추가"
            className="shrink-0 w-7 h-7 rounded-full bg-blue-700 text-white flex items-center justify-center active:bg-blue-800"
          >
            <Plus size={15} />
          </button>
        )}
        <div className="relative flex-1 min-w-0">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
            placeholder="검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-1 text-xs font-bold text-slate-500 shrink-0 whitespace-nowrap">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="w-3.5 h-3.5" />
          완료된 항목 보기
        </label>
      </div>
      <div className="px-3 pt-2 space-y-0.5">
        {visible.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-10">완료되지 않은 할 일이 없습니다</p>
        )}
        {visible.map(({ t, group }, i) => {
          // 자재/견적 연동 할 일은 비용청구가 완료되어야 자동으로 끝나지만, 관리자가 직접 부여한
          // 할 일과 정기검사 보완조치·자체점검 지적사항 할 일은 그런 연결고리가 없어 본인이 직접 완료 처리해야 한다.
          const isManual = t.source === "manual" || t.source === "inspection" || t.source === "selfcheck" || t.source === "waste_return";
          // 반납 할일은 기사가 직접 완료 처리하되(=isManual), 반납사진을 최소 1장 올려야만 잠금이 풀린다.
          // 재오픈 후에는 기존 사진이 누적 보존되므로(관리자 화면 감사이력용), "사진이 있으면"이 아니라
          // "재오픈 시점 기준선(photoCount)보다 사진이 늘었으면"으로 판정 — 새 사진을 추가해야 잠금이 풀린다.
          const wasteReturnLocked = t.source === "waste_return" && !((t.photoUrls?.length ?? 0) > (t.photoCount ?? 0));
          const groupDone = group.every((m) => m.done);
          const overdue = !groupDone && new Date(t.dueDate) < new Date(TODAY_STR);
          const requester = getRequesterName(t, materialRequests, quoteRequests);
          const expanded = shownExpandedId === t.id;
          // 지브라 스트라이프 — 짝수줄만 살짝 톤(bg-slate-50), 펼친 행은 제목·내용을 한 박스로 묶어 흰 배경
          return (
            <div key={t.id} id={`todo-row-${t.id}`} className={`rounded-xl px-2 ${expanded ? "bg-white" : i % 2 === 1 ? "bg-slate-50" : ""}`}>
              <div className="flex items-start gap-2.5 py-2">
                <div className="pt-0.5">
                  <TodoCheckbox
                    done={groupDone}
                    locked={role !== "admin" && (!isManual || wasteReturnLocked)}
                    onClick={
                      role === "admin"
                        ? () => { const target = !groupDone; group.forEach((m) => { if (m.done !== target) onAdminToggle(m.id); }); }
                        : isManual && !wasteReturnLocked
                          ? () => toggleManualTodo(t.id)
                          : undefined
                    }
                  />
                </div>
                {/* 행 클릭 = 아코디언 펼침/접힘 (바텀시트 대신 인라인) */}
                <button type="button" onClick={() => setExpanded(expanded ? null : t.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    {overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                    <p className={`text-sm font-bold min-w-0 ${expanded ? "" : "truncate"} ${groupDone ? "line-through text-slate-400" : "text-slate-800"}`}>{t.title}</p>
                    {t.reassignRequested && <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full"><Repeat size={9} strokeWidth={2.8} />재배정 요청</span>}
                    <ChevronDown size={15} className={`shrink-0 text-slate-300 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[11px] text-slate-400 truncate">
                      {role === "admin" ? `담당: ${group.length > 1 ? group.map((m) => m.assignee).join(", ") : t.assignee} · ` : ""}기한: {formatShortDate(t.dueDate)}{requester ? ` · 요청자: ${requester}` : ""}
                    </p>
                    {!isManual && !groupDone && <p className="text-[10px] text-slate-300 shrink-0 whitespace-nowrap">비용청구 시 자동완료</p>}
                  </div>
                </button>
              </div>
              {expanded && (
                <div className="pl-8 pr-0.5 pb-3 pt-1">
                  <TodoDetailBody
                    todo={t}
                    requester={requester}
                    coAssignees={getCoAssignees(t, todos)}
                    supplyPhotoUrls={getSupplyPhotos(t, materialRequests, quoteRequests)}
                    siteAddress={getTodoSiteAddress(t, materialRequests, quoteRequests, sites)}
                    onToggle={role === "admin" ? onAdminToggle : isManual ? toggleManualTodo : null}
                    onAddPhoto={addTodoPhoto}
                    onRemovePhoto={removeTodoPhoto}
                    onReassign={role === "admin" ? onReassignTodo : null}
                    engineerNames={engineerNames}
                    onUpdateDescription={role === "admin" ? onUpdateTodoDescription : null}
                    onUpdateDueDate={role === "admin" ? onUpdateTodoDueDate : null}
                    onDelete={role === "admin" ? onDeleteTodo : null}
                    onExtendDueDate={role !== "admin" ? onExtendTodoDueDate : null}
                    onRequestReassign={role !== "admin" ? onRequestReassignTodo : null}
                    onClearReassignRequest={onClearReassignRequest}
                    role={role}
                    onClose={() => setExpanded(null)}
                    hideTitleBlock
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {assignOpen && (
        <TodoAssignSheet engineerNames={engineerNames} onSubmit={onAssignTodo} onClose={() => setAssignOpen(false)} />
      )}
    </div>
  );
}


// 할 일 상세 본문 (시트/아코디언 공용). role: 'admin'이면 편집·재배정, 기사면 기한연장·재배정 요청.
export function TodoDetailBody({ todo, requester, coAssignees = [], supplyPhotoUrls = [], siteAddress, onToggle, onAddPhoto, onRemovePhoto, onReassign, engineerNames, onUpdateDescription, onUpdateDueDate, onDelete, onExtendDueDate, onRequestReassign, onClearReassignRequest, role, onClose, hideTitleBlock = false }) {
  const [descDraft, setDescDraft] = useState(todo.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignReason, setReassignReason] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [extending, setExtending] = useState(false);
  const [extendDate, setExtendDate] = useState(todo.dueDate ?? "");
  const [extendReason, setExtendReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteClick() {
    if (!(await confirmAsync("이 할 일을 삭제하시겠습니까?"))) return;
    setDeleting(true);
    await onDelete(todo.id);
    setDeleting(false);
    onClose();
  }
  const sourceLabel = todo.source === "manual" ? "관리자 부여" : todo.source === "quote" ? "견적 연동" : todo.source === "inspection" ? "검사 보완" : todo.source === "selfcheck" ? "자체점검 지적" : todo.source === "waste_return" ? "폐자재·여유부품 반납" : "자재 연동";
  const allAssignees = [todo.assignee, ...coAssignees];
  // 반납 할일은 기사가 반납사진을 최소 1장 올리기 전까지 완료 처리 버튼을 잠근다 (관리자는 예외).
  // 재오픈 시 사진은 누적 보존되므로, 재오픈 시점 기준선(photoCount)보다 늘어난 경우에만 잠금 해제.
  const photoLockedForEngineer = role !== "admin" && todo.source === "waste_return" && !((todo.photoUrls?.length ?? 0) > (todo.photoCount ?? 0));

  return (
    <>
      {!hideTitleBlock && (
        <>
          <span
            className={`inline-block text-[11px] font-bold px-2 py-1 rounded-md mb-2 ${
              todo.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {todo.done ? "완료된 할 일" : "미완료된 할 일"}
          </span>
          <div className="bg-slate-100 rounded-xl p-3 mb-3">
            <p className="font-bold text-slate-800">{todo.title}</p>
          </div>
        </>
      )}

      {/* 재배정 요청 — 기사: 넘기기 요청 / 관리자: 요청 확인·반려 */}
      {todo.reassignRequested && role === "admin" ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
          <p className="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1"><Repeat size={13} strokeWidth={2.5} /> 재배정 요청됨</p>
          {todo.reassignReason && <p className="text-[13px] text-slate-700">사유: {todo.reassignReason}</p>}
          {todo.reassignTo && <p className="text-[13px] text-slate-700">희망 담당자: <b>{todo.reassignTo}</b></p>}
          <p className="text-[11px] text-slate-400 mt-1">아래 담당자에서 변경하면 요청이 자동 해제됩니다.</p>
          {onClearReassignRequest && (
            <button type="button" onClick={() => onClearReassignRequest(todo.id)} className="mt-2 text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 active:bg-slate-50">요청 반려</button>
          )}
        </div>
      ) : null}
      {onRequestReassign && !todo.done && role !== "admin" && (
        todo.reassignRequested ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
            <p className="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1"><Repeat size={13} strokeWidth={2.5} /> 재배정 요청됨 · 관리자 확인 중</p>
            {todo.reassignTo && <p className="text-[13px] text-slate-700">희망 담당자: <b>{todo.reassignTo}</b></p>}
            {onClearReassignRequest && (
              <button type="button" onClick={() => onClearReassignRequest(todo.id)} className="mt-2 text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 active:bg-slate-50">요청 취소</button>
            )}
          </div>
        ) : reassignOpen ? (
          <div className="border border-slate-200 rounded-xl p-3 mb-3">
            <p className="text-xs font-bold text-slate-600 mb-2">담당자 재배정 요청</p>
            <select className={`${inputCls} mb-2`} value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
              <option value="">희망 담당자 (선택 안 함 가능)</option>
              {engineerNames?.filter((n) => n !== todo.assignee).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <textarea className={inputCls} rows={2} placeholder="사유 (예: 오늘 다른 현장 처리 중)" value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} />
            <div className="flex gap-1.5 mt-2">
              <button type="button" onClick={() => setReassignOpen(false)} className="flex-1 text-xs font-bold py-2 rounded-lg bg-slate-100 text-slate-500 active:bg-slate-200">취소</button>
              <button type="button" onClick={() => { onRequestReassign(todo.id, reassignReason.trim(), reassignTo); setReassignOpen(false); }} className="flex-1 text-xs font-bold py-2 rounded-lg bg-blue-700 text-white active:bg-blue-800">요청 보내기</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setReassignReason(""); setReassignTo(""); setReassignOpen(true); }} className="w-full mb-3 text-xs font-bold text-blue-700 border border-blue-200 rounded-xl py-2.5 active:bg-blue-50 flex items-center justify-center gap-1.5">
            <Repeat size={13} strokeWidth={2.5} /> 담당자 재배정 요청
          </button>
        )
      )}

      {(todo.description || onUpdateDescription) && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold text-slate-500">내용</p>
            {onUpdateDescription && !editingDesc && (
              <button type="button" onClick={() => setEditingDesc(true)} className="text-[11px] font-bold text-blue-600">
                {todo.description ? "수정" : "내용 추가"}
              </button>
            )}
          </div>
          {editingDesc ? (
            <div>
              <textarea
                className={inputCls}
                rows={3}
                placeholder="예: 7만원, 교체확인서 부탁드립니다"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
              />
              <div className="flex gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateDescription(todo.id, descDraft.trim());
                    setEditingDesc(false);
                  }}
                  className="flex-1 text-xs font-bold py-2 rounded-lg bg-blue-700 text-white active:bg-blue-800"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDescDraft(todo.description ?? "");
                    setEditingDesc(false);
                  }}
                  className="flex-1 text-xs font-bold py-2 rounded-lg bg-slate-100 text-slate-500 active:bg-slate-200"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{todo.description || "등록된 내용이 없습니다"}</p>
          )}
        </div>
      )}

      <div className="space-y-2.5 mb-4">
        {requester && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">요청자</span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-900 text-white">{requester}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">담당자</span>
          {onReassign ? (
            <select
              className="text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg px-2 py-1"
              value={todo.assignee}
              onChange={async (e) => {
                const target = e.target;
                const next = target.value;
                if (next === todo.assignee) return;
                if (await confirmAsync(`담당자를 ${next}(으)로 변경하시겠습니까?`)) {
                  onReassign(todo.id, next);
                } else {
                  target.value = todo.assignee; // 취소 시 원래 값으로 되돌림 — 안 그러면 select가 리렌더 전까지 바뀐 값으로 남아있어 취소가 안 먹힌 것처럼 보인다
                }
              }}
            >
              {engineerNames?.includes(todo.assignee) ? null : <option value={todo.assignee}>{todo.assignee}</option>}
              {engineerNames?.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : (
            <span className="font-semibold text-slate-700">{todo.assignee}</span>
          )}
        </div>
        {coAssignees.length > 0 && (
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-slate-400">전체 담당자</span>
              <span className="text-xs text-slate-400">전체 {allAssignees.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allAssignees.map((name) => (
                <span key={name} className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
        {todo.source !== "manual" && todo.source !== "waste_return" && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">완료 조건</span>
            <span className="font-semibold text-slate-700">
              {coAssignees.length > 0 ? "담당자 중 1명 비용청구" : "비용청구 시 자동완료"}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm gap-3">
          <span className="text-slate-400 shrink-0">현장</span>
          <span className="font-semibold text-slate-700 text-right">{siteAddress || todo.siteName}</span>
        </div>
        {todo.billingAmount != null && (
          <div className="flex items-center justify-between text-sm gap-3">
            <span className="text-slate-400 shrink-0">청구 부품·금액</span>
            <span className="font-bold text-blue-700 text-right">
              {todo.billingPart ? `${todo.billingPart} · ` : ""}합계 ₩{Number(todo.billingAmount).toLocaleString()}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">출처</span>
          <span className="font-semibold text-slate-700">{sourceLabel}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">부여일</span>
          <span className="font-semibold text-slate-700">{formatYyMmDd(todo.assignedDate)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">마감일</span>
          {onUpdateDueDate ? (
            <input
              type="date"
              className="text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg px-2 py-1"
              value={todo.dueDate ?? ""}
              onChange={(e) => { if (e.target.value) onUpdateDueDate(todo.id, e.target.value); }}
            />
          ) : (
            <span className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">{formatYyMmDd(todo.dueDate)}</span>
              {onExtendDueDate && (
                <button
                  type="button"
                  onClick={() => { setExtendDate(todo.dueDate ?? ""); setExtendReason(""); setExtending(true); }}
                  className="text-sm font-semibold text-blue-600"
                >
                  연장
                </button>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">상태</span>
          <span className={`font-semibold ${todo.done ? "text-emerald-600" : "text-amber-600"}`}>{todo.done ? "완료" : "미완료"}</span>
        </div>
      </div>
      {supplyPhotoUrls.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-slate-500 mb-2">지급된 자재 사진 ({supplyPhotoUrls.length})</p>
          <PhotoGrid urls={supplyPhotoUrls} cols={3} />
        </div>
      )}
      {todo.source !== "waste_return" && todo.photoUrls?.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-slate-500 mb-2">첨부파일 ({todo.photoUrls.length})</p>
          <PhotoGrid urls={todo.photoUrls} cols={3} />
        </div>
      )}
      {todo.source === "waste_return" && (
        <div className="mb-4">
          {todo.wasteReturnRows?.length > 0 && (
            <p className="text-[11px] font-bold text-slate-500 mb-1">
              반납 항목: {todo.wasteReturnRows.map((r) => `${r.name} ${r.qtyRequired}EA`).join(", ")}
            </p>
          )}
          <MultiPhotoUpload
            photos={(todo.photoUrls ?? []).map((url) => ({ url }))}
            onUploaded={(url) => onAddPhoto(todo.id, url)}
            onRemove={(idx) => onRemovePhoto(todo.id, idx)}
            label="반납 사진"
            uploadFolder={`todos/${todo.id}`}
          />
        </div>
      )}
      {onToggle && !photoLockedForEngineer ? (
        <PrimaryButton onClick={() => { onToggle(todo.id); onClose(); }}>
          {todo.done ? "완료 취소" : "완료 처리"}
        </PrimaryButton>
      ) : todo.done ? (
        <div className="text-xs font-bold px-3 py-2.5 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center gap-1">
          <Check size={14} /> 완료됨
        </div>
      ) : photoLockedForEngineer ? (
        <div className="text-[11px] font-bold px-3 py-2.5 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center gap-1">
          <Lock size={12} /> 반납 사진 업로드 후 완료 가능
        </div>
      ) : (
        <div className="text-[11px] font-bold px-3 py-2.5 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center gap-1">
          <Lock size={12} /> 비용청구 시 자동완료
        </div>
      )}
      {onDelete && (
        <button
          type="button"
          disabled={deleting}
          onClick={handleDeleteClick}
          className="w-full mt-2 text-xs font-bold text-red-600 border border-red-200 rounded-xl py-2.5 active:bg-red-50 disabled:opacity-50"
        >
          {deleting ? "삭제 중..." : "할 일 삭제"}
        </button>
      )}
      {extending && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center px-8" onClick={() => setExtending(false)}>
          <div className="bg-white rounded-2xl w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-slate-800 mb-3">마감일 연장</p>
            <input
              type="date"
              className={`${inputCls} mb-2`}
              value={extendDate}
              onChange={(e) => setExtendDate(e.target.value)}
            />
            <textarea
              className={inputCls}
              rows={2}
              placeholder="연장 사유를 입력하세요"
              value={extendReason}
              onChange={(e) => setExtendReason(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setExtending(false)} className="flex-1 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl py-2.5 active:bg-slate-200">
                취소
              </button>
              <button
                type="button"
                disabled={!extendDate || !extendReason.trim()}
                onClick={() => { onExtendDueDate(todo.id, extendDate, extendReason.trim()); setExtending(false); }}
                className="flex-1 text-sm font-bold text-white bg-blue-700 rounded-xl py-2.5 active:bg-blue-800 disabled:bg-slate-300"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


export function TodoAssignSheet({ engineerNames, onSubmit, onClose }) {
  const sites = useContext(SitesContext);
  const [uploadSession] = useState(() => Date.now());
  const [form, setForm] = useState({ assignees: [], siteId: "", title: "", dueDate: addDays(TODAY_STR, 7), photos: [] });
  // 사진 업로드가 끝나기 전에 부여 버튼을 누르면 그 사진이 빠진 채로 저장될 수 있어 막는다.
  const [photosUploading, setPhotosUploading] = useState(false);

  function toggleAssignee(name) {
    setForm((f) => ({
      ...f,
      assignees: f.assignees.includes(name) ? f.assignees.filter((a) => a !== name) : [...f.assignees, name],
    }));
  }

  const site = sites.find((s) => s.id === form.siteId);
  const canSubmit = form.assignees.length > 0 && !!site && form.title.trim().length > 0 && !photosUploading;

  return (
    <Sheet title="할 일 부여" onClose={onClose}>
      <Field label="담당자 (1명 이상 선택)">
        <div className="flex flex-wrap gap-1.5">
          {engineerNames.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => toggleAssignee(e)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border ${form.assignees.includes(e) ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-500 border-slate-300"}`}
            >
              {e}
            </button>
          ))}
          {engineerNames.length === 0 && <p className="text-xs text-slate-400">등록된 기사 계정이 없습니다</p>}
        </div>
      </Field>
      <Field label="현장">
        <SiteSearchSelect value={form.siteId} onChange={(id) => setForm({ ...form, siteId: id })} />
      </Field>
      <Field label="할 일 내용">
        <textarea
          className={inputCls}
          rows={3}
          placeholder="예: 소방연동 점검 서류 제출"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <Field label="마감일">
        <input type="date" className={inputCls} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
      </Field>
      <Field label="첨부 사진">
        <MultiPhotoUpload
          required={false}
          photos={form.photos}
          uploadFolder={`todos/${uploadSession}`}
          onUploaded={(url) => setForm((f) => ({ ...f, photos: [...f.photos, { url }] }))}
          onRemove={(idx) => setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }))}
          onUploadingChange={setPhotosUploading}
          label="작업 관련 참고 사진 (선택)"
        />
      </Field>
      <PrimaryButton
        disabled={!canSubmit}
        onClick={() => {
          onSubmit({
            assignees: form.assignees,
            siteName: site.name,
            title: form.title.trim(),
            dueDate: form.dueDate,
            photoCount: form.photos.length,
            photoUrls: form.photos.map((p) => p.url),
          });
          onClose();
        }}
      >
        할 일 부여하기
      </PrimaryButton>
    </Sheet>
  );
}


