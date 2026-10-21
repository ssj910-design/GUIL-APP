import { useState, useContext, useEffect, useRef } from "react";
import { ListTodo, CheckCircle2, Search, Lock, Plus, Repeat, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { addDays, formatShortDate } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { PrimaryButton, Sheet, Field, inputCls, DDay } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload } from "@/app/components/formWidgets";
import { groupKeyOf, completionGroupIds } from "@/lib/todoEdit";
import { TodoDetailScreen } from "@/app/components/tabs/TodoDetailScreen";
import { billingSetupValid } from "@/app/components/BillingSetupFields";


/* ------------------------------------------------------------------ */
/* TODO (할일관리)                                                       */
/* ------------------------------------------------------------------ */


// 자재/견적 신청 시점의 신청자 이름을 찾아옵니다. 지급완료 시 실제 담당자를 신청자와
// 다르게 지정할 수 있어(★ 담당자 재배정 기능), 요청자와 담당자가 다를 수 있습니다.
export function getRequesterName(todo, materialRequests, quoteRequests) {
  if (todo.source === "material") {
    const req = materialRequests?.find((r) => r.id === todo.materialRequestId);
    // 관리자 직접 지급 건은 신청자가 기사가 아니라 지급한 관리자다
    return req?.createdByAdmin ? (todo.requestedByName ?? "관리자") : (req?.engineer ?? null);
  }
  if (todo.source === "quote") return quoteRequests?.find((q) => q.id === todo.quoteRequestId)?.engineer ?? null;
  // 수동 등록 할일 — 097 마이그레이션 이전 행(requestedByName 없음)은 "관리자"로 표시.
  return todo.requestedByName ?? "관리자";
}

// 연결된 자재/견적 신청에 자재 담당자가 등록한 지급 사진을 찾아옵니다.
export function getSupplyPhotos(todo, materialRequests, quoteRequests) {
  if (todo.source === "material") return materialRequests?.find((r) => r.id === todo.materialRequestId)?.supplyPhotoUrls ?? [];
  if (todo.source === "quote") return quoteRequests?.find((q) => q.id === todo.quoteRequestId)?.supplyPhotoUrls ?? [];
  return [];
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

export function TodoTab({ todos, setTodos, onExtendTodoDueDate, onRequestReassignTodo, onClearReassignRequest, onAssignTodo, onAdminToggle, onSaveTodoEdit, onDeleteTodoGroup, materialRequests, quoteRequests, focusTodoId, onFocusHandled }) {
  const { name: CURRENT_ENGINEER, engineerNames, role } = useContext(AuthContext);
  const [showDone, setShowDone] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [listNavDir, setListNavDir] = useState("fwd");
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  // 반납사진을 여러 장 연달아 올릴 때 setTodos만으로는 React 렌더 타이밍상 아직 반영 안 된
  // todo.photoUrls를 기준으로 계산될 수 있어(경쟁 상태 — 마지막 한 장만 저장되는 버그) —
  // ElevatorFieldApp의 supplyPhotoUrlsRef와 동일한 패턴으로 ref에 최신 배열을 동기적으로 보관한다.
  const photoUrlsRef = useRef({});
  // todos.billing_required 컬럼(마이그레이션 151)이 있을 때만 "비용청구 후 완료" 설정을 보여준다.
  const billingReady = todos.some((x) => x.billingRequired !== undefined);

  // 알림/푸시로 특정 할일을 지목하면(?openTodo=) 목록이 아니라 그 할일 상세를 바로 연다 —
  // 지목된 id를 렌더 중에 상태로 옮기고(이전 값과 다를 때만) 부모의 focus 값은 비운다.
  const [seenFocusId, setSeenFocusId] = useState(null);
  if (focusTodoId && focusTodoId !== seenFocusId) {
    setSeenFocusId(focusTodoId);
    setDetailId(focusTodoId);
  } else if (!focusTodoId && seenFocusId) {
    setSeenFocusId(null); // 다음에 같은 할일을 다시 지목해도 열리도록
  }
  useEffect(() => {
    if (focusTodoId) onFocusHandled?.();
  }, [focusTodoId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openDetail(id) { setListNavDir("fwd"); setDetailId(id); }
  function closeDetail() { setListNavDir("back"); setDetailId(null); }

  // 관리자는 본인 담당 할일이 아니라 전체 기사의 할일을 본다.
  const mine = role === "admin" ? todos : todos.filter((t) => t.assignee === CURRENT_ENGINEER);

  async function toggleManualTodo(id) {
    const current = todos.find((x) => x.id === id);
    if (!current) return;
    const done = !current.done;
    // 자체점검 지적사항(B/C)은 담당기사 전원에게 같은 selfCheckItemId로, 관리자가 담당자 여러 명으로 배정한
    // 수동 할일(id가 "todo-manual-<배치id>-<순번>")도 담당자 수만큼 행이 있다 — 1명이 완료하면 전원 완료,
    // 완료 취소도 전원 취소(관리자웹 할일관리와 같은 규칙, lib/todoEdit.js completionGroupIds).
    const idsToComplete = completionGroupIds(todos, current);
    const { error } = await supabase.from("todos").update({ done }).in("id", idsToComplete);
    if (error) {
      alert(`할 일 완료 처리에 실패했습니다.\n${error.message ?? ""}\n다시 시도해주세요.`);
      return;
    }
    setTodos((prev) => prev.map((x) => (idsToComplete.includes(x.id) ? { ...x, done } : x)));
  }

  // 폐자재/여유부품 반납 할일의 반납사진 등록/삭제. 완료 조건(사진 1장 이상, 재오픈 후엔 기준선보다
  // 증가)은 목록의 TodoCheckbox·상세 화면의 잠금 계산에서 t.photoUrls/t.photoCount로 판정한다.
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

  // 자재/견적 연동 할 일은 담당자 수만큼 각자 별도 행으로 저장돼 있다 — 같은 요청을 공유하는 행을
  // 한 건으로 묶는다(기사 본인 화면은 자기 몫 1건만 남아 있어 묶어도 그대로).
  function groupOf(t) {
    const key = groupKeyOf(t);
    return mine.filter((m) => groupKeyOf(m) === key);
  }

  // 자재/견적 연동 할 일은 비용청구가 완료되어야 자동으로 끝나지만, 관리자가 직접 부여한
  // 할 일과 정기검사 보완조치·자체점검 지적사항 할 일은 그런 연결고리가 없어 본인이 직접 완료 처리해야 한다.
  // 반납 할일은 반납사진을 최소 1장 올려야만 잠금이 풀린다. 재오픈 후에는 기존 사진이 누적 보존되므로
  // "재오픈 시점 기준선(photoCount)보다 사진이 늘었으면"으로 판정 — 새 사진을 추가해야 잠금이 풀린다.
  // 관리자 배정이라도 "비용청구 후 완료"로 설정된 할일은 자재지급건처럼 청구해야 완료된다(체크 잠금).
  const isManualSource = (t) => (t.source === "manual" && !t.billingRequired) || t.source === "inspection" || t.source === "selfcheck" || t.source === "waste_return";
  const wasteLocked = (t) => t.source === "waste_return" && !((t.photoUrls?.length ?? 0) > (t.photoCount ?? 0));

  /* ------------------------------ 상세 화면 ------------------------------ */
  const detailTodo = detailId ? todos.find((x) => x.id === detailId) : null;
  if (detailTodo) {
    const group = groupOf(detailTodo);
    const members = group.length ? group : [detailTodo];
    const locked = wasteLocked(detailTodo);
    const manual = isManualSource(detailTodo);
    return (
      <TodoDetailScreen
        key={detailTodo.id}
        todo={detailTodo}
        group={members}
        requester={getRequesterName(detailTodo, materialRequests, quoteRequests)}
        supplyPhotoUrls={getSupplyPhotos(detailTodo, materialRequests, quoteRequests)}
        role={role}
        canToggle={role === "admin" || (manual && !locked)}
        photoLocked={role !== "admin" && locked}
        onToggle={async () => {
          if (role === "admin") {
            const target = !members.every((m) => m.done);
            members.forEach((m) => { if (m.done !== target) onAdminToggle(m.id); });
          } else {
            await toggleManualTodo(detailTodo.id);
          }
        }}
        onBack={closeDetail}
        onAddPhoto={addTodoPhoto}
        onRemovePhoto={removeTodoPhoto}
        onRequestReassign={role !== "admin" ? onRequestReassignTodo : null}
        onClearReassignRequest={onClearReassignRequest}
        onExtendDueDate={role !== "admin" ? onExtendTodoDueDate : null}
        onSaveEdit={role === "admin" ? onSaveTodoEdit : null}
        onDeleteGroup={role === "admin" ? onDeleteTodoGroup : null}
        billingReady={billingReady}
      />
    );
  }

  /* ------------------------------ 목록 ------------------------------ */
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
    .filter((t) => showDone || !t.done)
    .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.siteName ?? "").toLowerCase().includes(q));
  const groupsMap = new Map();
  for (const t of filtered) {
    const key = groupKeyOf(t);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(t);
  }
  const visible = [...groupsMap.values()]
    .map((group) => ({ t: group[0], group }))
    .sort((a, b) => new Date(a.t.dueDate) - new Date(b.t.dueDate));

  return (
    <div className={`flex-1 overflow-y-auto pb-4 ${listNavDir === "back" ? "room-slide-in-left" : ""}`}>
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
          const isManual = isManualSource(t);
          const locked = wasteLocked(t);
          const groupDone = group.every((m) => m.done);
          const overdue = !groupDone && new Date(t.dueDate) < new Date(TODAY_STR);
          const requester = getRequesterName(t, materialRequests, quoteRequests);
          const dueTextCls = `text-[11px] font-bold ${overdue ? "text-red-600" : "text-slate-700"}`;
          // 지브라 스트라이프 — 짝수줄만 살짝 톤(bg-slate-50)
          return (
            <div key={t.id} id={`todo-row-${t.id}`} className={`rounded-xl px-2 ${i % 2 === 1 ? "bg-slate-50" : ""}`}>
              <div className="flex items-start gap-2.5 py-2">
                <div className="pt-0.5">
                  <TodoCheckbox
                    done={groupDone}
                    locked={role !== "admin" && (!isManual || locked)}
                    onClick={
                      role === "admin"
                        ? () => { const target = !groupDone; group.forEach((m) => { if (m.done !== target) onAdminToggle(m.id); }); }
                        : isManual && !locked
                          ? () => toggleManualTodo(t.id)
                          : undefined
                    }
                  />
                </div>
                {/* 행 클릭 = 할 일 상세 화면으로 이동 (게시판 글 상세와 같은 슬라이드) */}
                <button type="button" onClick={() => openDetail(t.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    {overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                    <p className={`text-sm font-bold min-w-0 truncate ${groupDone ? "line-through text-slate-400" : "text-slate-800"}`}>{t.title}</p>
                    {group.some((m) => m.reassignRequested) && <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full"><Repeat size={9} strokeWidth={2.8} />재배정 요청</span>}
                    <ChevronRight size={15} className="shrink-0 text-slate-300 ml-auto" />
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[11px] text-slate-400 truncate">
                      기한: <span className={dueTextCls}>{formatShortDate(t.dueDate)}</span>
                      {requester ? ` · 요청자: ${requester}` : ""}
                    </p>
                    <span className="shrink-0"><DDay dueDate={t.dueDate} size="xs" /></span>
                  </div>
                  {(role === "admin" || (!isManual && !groupDone)) && (
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[11px] text-slate-400 truncate">
                        {role === "admin" ? `담당: ${group.length > 1 ? group.map((m) => m.assignee).join(", ") : t.assignee}` : ""}
                      </p>
                      {!isManual && !groupDone && <p className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">비용청구 시 자동완료</p>}
                    </div>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {assignOpen && (
        <TodoAssignSheet engineerNames={engineerNames} onSubmit={onAssignTodo} onClose={() => setAssignOpen(false)} billingReady={billingReady} />
      )}
    </div>
  );
}


export function TodoAssignSheet({ engineerNames, onSubmit, onClose, billingReady }) {
  const sites = useContext(SitesContext);
  const units = useContext(UnitsContext);
  const [uploadSession] = useState(() => Date.now());
  const [form, setForm] = useState({ assignees: [], siteId: "", title: "", description: "", dueDate: addDays(TODAY_STR, 7), photos: [], billingRequired: false, unitIds: [], unitId: "", billingRows: [] });
  // 사진 업로드가 끝나기 전에 부여 버튼을 누르면 그 사진이 빠진 채로 저장될 수 있어 막는다.
  const [photosUploading, setPhotosUploading] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  function toggleAssignee(name) {
    setForm((f) => ({
      ...f,
      assignees: f.assignees.includes(name) ? f.assignees.filter((a) => a !== name) : [...f.assignees, name],
    }));
  }

  const site = sites.find((s) => s.id === form.siteId);
  // 현장은 필수가 아니다 — 현장과 무관한 일반 할일도 부여할 수 있어야 한다.
  const siteUnits = units.filter((u) => u.siteId === form.siteId && u.isActive !== false);
  const canSubmit = form.assignees.length > 0 && form.title.trim().length > 0 && !photosUploading
    && (!form.billingRequired || (!!form.siteId && billingSetupValid(form, siteUnits)));

  return (
    <Sheet title="할 일 부여" onClose={onClose}>
      <Field label="담당자 (1명 이상 선택)">
        <div className="relative">
          <button
            type="button"
            onClick={() => setAssigneeOpen((v) => !v)}
            className={`${inputCls} flex items-center justify-between text-left`}
          >
            <span className={`truncate ${form.assignees.length ? "text-slate-800" : "text-slate-400"}`}>
              {form.assignees.length ? form.assignees.join(", ") : "담당자를 선택하세요"}
            </span>
            <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${assigneeOpen ? "rotate-180" : ""}`} />
          </button>
          {assigneeOpen && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {engineerNames.map((e) => (
                <label key={e} className="flex items-center gap-2 px-3 py-2.5 text-sm border-b border-slate-50 last:border-0 active:bg-slate-50">
                  <input type="checkbox" checked={form.assignees.includes(e)} onChange={() => toggleAssignee(e)} className="w-4 h-4" />
                  {e}
                </label>
              ))}
              {engineerNames.length === 0 && <p className="text-xs text-slate-400 text-center py-3">등록된 기사 계정이 없습니다</p>}
            </div>
          )}
        </div>
      </Field>
      <Field label="현장 (선택)">
        <SiteSearchSelect value={form.siteId} onChange={(id) => setForm({ ...form, siteId: id, unitIds: [], unitId: "" })} />
      </Field>
      {/* 부품 교체+청구 업무는 관리자웹 자재신청관리의 "직접 지급"으로 일원화 — 새 배정에서는 청구 설정을 숨긴다 */}
      <Field label="할 일 제목">
        <input
          className={inputCls}
          placeholder="예: 소방연동 점검 서류 제출"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <Field label="내용 (선택)">
        <textarea
          className={inputCls}
          rows={3}
          placeholder="세부 내용을 적어주세요"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
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
            siteName: site?.name ?? null,
            billingRequired: form.billingRequired,
            unitIds: form.unitIds,
            billingRows: form.billingRows,
            title: form.title.trim(),
            description: form.description.trim() || null,
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


