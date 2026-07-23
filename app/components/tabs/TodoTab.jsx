import { useState, useContext } from "react";
import { ListTodo, Check, CheckCircle2, Search, Lock, Image as ImageIcon, Download, Plus, Repeat, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { addDays, formatShortDate, formatYyMmDd } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { downloadPhoto, sanitizeFilename, extOf } from "@/lib/photos";
import { DDay, PrimaryButton, Sheet, Field, inputCls, DrillHeader } from "@/app/components/ui";
import { SitesContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload } from "@/app/components/formWidgets";


/* ------------------------------------------------------------------ */
/* TODO (할일관리)                                                       */
/* ------------------------------------------------------------------ */


// 자재/견적 신청 시점의 신청자 이름을 찾아옵니다. 지급완료 시 실제 담당자를 신청자와
// 다르게 지정할 수 있어(★ 담당자 재배정 기능), 요청자와 담당자가 다를 수 있습니다.
export function getRequesterName(todo, materialRequests, quoteRequests) {
  if (todo.source === "material") return materialRequests?.find((r) => r.id === todo.materialRequestId)?.engineer ?? null;
  if (todo.source === "quote") return quoteRequests?.find((q) => q.id === todo.quoteRequestId)?.engineer ?? null;
  return "관리자";
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
  if (todo.source === "manual") return null;
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

export function TodoTab({ todos, setTodos, onReassignTodo, onUpdateTodoDescription, onUpdateTodoDueDate, onExtendTodoDueDate, onRequestReassignTodo, onClearReassignRequest, onAssignTodo, onAdminToggle, materialRequests, quoteRequests }) {
  const { name: CURRENT_ENGINEER, engineerNames, role } = useContext(AuthContext);
  const sites = useContext(SitesContext);
  const [showDone, setShowDone] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  // 관리자는 본인 담당 할일이 아니라 전체 기사의 할일을 본다.
  const mine = role === "admin" ? todos : todos.filter((t) => t.assignee === CURRENT_ENGINEER);

  async function toggleManualTodo(id) {
    const current = todos.find((x) => x.id === id);
    if (!current) return;
    const done = !current.done;
    await supabase.from("todos").update({ done }).eq("id", id);
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, done } : x)));
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

  const q = search.trim();
  const visible = mine
    .filter((t) => showDone || !t.done)
    .filter((t) => !q || t.title.includes(q) || (t.siteName ?? "").includes(q))
    .slice()
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

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
        {visible.map((t, i) => {
          const isManual = t.source === "manual";
          const overdue = !t.done && new Date(t.dueDate) < new Date(TODAY_STR);
          const requester = getRequesterName(t, materialRequests, quoteRequests);
          const expanded = expandedId === t.id;
          // 지브라 스트라이프 — 짝수줄만 살짝 톤(bg-slate-50), 펼친 행은 파란 톤
          return (
            <div key={t.id} className={`rounded-xl px-2 ${expanded ? "bg-blue-50/50" : i % 2 === 1 ? "bg-slate-50" : ""}`}>
              <div className="flex items-start gap-2.5 py-2">
                <div className="pt-0.5">
                  <TodoCheckbox
                    done={t.done}
                    locked={!isManual && role !== "admin"}
                    onClick={
                      role === "admin"
                        ? () => onAdminToggle(t.id)
                        : isManual
                          ? () => toggleManualTodo(t.id)
                          : undefined
                    }
                  />
                </div>
                {/* 행 클릭 = 아코디언 펼침/접힘 (바텀시트 대신 인라인) */}
                <button type="button" onClick={() => setExpandedId(expanded ? null : t.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    {overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                    <p className={`text-sm font-bold min-w-0 truncate ${t.done ? "line-through text-slate-400" : "text-slate-800"}`}>{t.title}</p>
                    {t.reassignRequested && <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full"><Repeat size={9} strokeWidth={2.8} />재배정 요청</span>}
                    <ChevronDown size={15} className={`shrink-0 text-slate-300 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[11px] text-slate-400 truncate">
                      {role === "admin" ? `담당: ${t.assignee} · ` : ""}기한: {formatShortDate(t.dueDate)}{requester ? ` · 요청자: ${requester}` : ""}
                    </p>
                    {!isManual && !t.done && <p className="text-[10px] text-slate-300 shrink-0 whitespace-nowrap">비용청구 시 자동완료</p>}
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
                    onReassign={role === "admin" ? onReassignTodo : null}
                    engineerNames={engineerNames}
                    onUpdateDescription={role === "admin" ? onUpdateTodoDescription : null}
                    onUpdateDueDate={role === "admin" ? onUpdateTodoDueDate : null}
                    onExtendDueDate={role !== "admin" ? onExtendTodoDueDate : null}
                    onRequestReassign={role !== "admin" ? onRequestReassignTodo : null}
                    onClearReassignRequest={onClearReassignRequest}
                    role={role}
                    onClose={() => setExpandedId(null)}
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


function TodoRow({ t, onToggle, onOpenDetail }) {
  return (
    <div className={`border rounded-xl p-3 ${t.done ? "border-slate-100 opacity-60" : "border-slate-200"}`}>
      <button type="button" onClick={() => onOpenDetail(t)} className="w-full flex items-start justify-between gap-2 text-left">
        <div className="flex-1">
          <p className={`text-sm font-bold text-slate-800 ${t.done ? "line-through" : ""}`}>{t.title}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {t.assignee} 담당 · {t.siteName} · {t.source === "manual" ? "관리자 부여" : t.source === "quote" ? "견적 연동" : "자재 연동"}
          </p>
        </div>
        {!t.done && <DDay dueDate={t.dueDate} />}
      </button>
      <button
        onClick={() => onToggle(t.id)}
        className={`w-full mt-2.5 text-xs font-bold py-2 rounded-lg ${t.done ? "bg-slate-100 text-slate-500 active:bg-slate-200" : "bg-blue-700 text-white active:bg-blue-800"}`}
      >
        {t.done ? "완료 취소" : "완료 처리"}
      </button>
    </div>
  );
}


// 바텀시트 래퍼 — 다른 화면(관리자 콘솔 등)에서 시트로 열 때 사용. TodoTab은 본문을 인라인 아코디언으로 쓴다.
export function TodoDetailSheet(props) {
  return (
    <Sheet title="할 일 상세" onClose={props.onClose}>
      <TodoDetailBody {...props} />
    </Sheet>
  );
}

// 할 일 상세 본문 (시트/아코디언 공용). role: 'admin'이면 편집·재배정, 기사면 기한연장·재배정 요청.
export function TodoDetailBody({ todo, requester, coAssignees = [], supplyPhotoUrls = [], siteAddress, onToggle, onReassign, engineerNames, onUpdateDescription, onUpdateDueDate, onExtendDueDate, onRequestReassign, onClearReassignRequest, role, onClose }) {
  const [descDraft, setDescDraft] = useState(todo.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignReason, setReassignReason] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [extending, setExtending] = useState(false);
  const [extendDate, setExtendDate] = useState(todo.dueDate ?? "");
  const [extendReason, setExtendReason] = useState("");
  const sourceLabel = todo.source === "manual" ? "관리자 부여" : todo.source === "quote" ? "견적 연동" : "자재 연동";
  const allAssignees = [todo.assignee, ...coAssignees];

  return (
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
            <p className="text-xs font-bold text-slate-600 mb-2">다른 사람에게 넘기기 요청</p>
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
            <Repeat size={13} strokeWidth={2.5} /> 다른 사람에게 넘기기 요청
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
              onChange={(e) => {
                const next = e.target.value;
                if (next !== todo.assignee && confirm(`담당자를 ${next}(으)로 변경하시겠습니까?`)) onReassign(todo.id, next);
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
        {todo.source !== "manual" && (
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
                  className="text-[11px] font-bold text-blue-600"
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
          <div className="grid grid-cols-3 gap-2">
            {supplyPhotoUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
              </a>
            ))}
          </div>
        </div>
      )}
      {todo.photoUrls?.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-slate-500 mb-2">첨부파일 ({todo.photoUrls.length})</p>
          <div className="space-y-1.5">
            {todo.photoUrls.map((url, i) => {
              const filename = `${sanitizeFilename(todo.siteName)}_${i + 1}.${extOf(url)}`;
              return (
                <div key={i} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                  <ImageIcon size={16} className="text-slate-400 shrink-0" />
                  <span className="flex-1 text-xs text-slate-600 truncate">{filename}</span>
                  <button type="button" onClick={() => downloadPhoto(url, filename)} className="text-blue-600 shrink-0">
                    <Download size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {onToggle ? (
        <PrimaryButton onClick={() => { onToggle(todo.id); onClose(); }}>
          {todo.done ? "완료 취소" : "완료 처리"}
        </PrimaryButton>
      ) : todo.done ? (
        <div className="text-xs font-bold px-3 py-2.5 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center gap-1">
          <Check size={14} /> 완료됨
        </div>
      ) : (
        <div className="text-[11px] font-bold px-3 py-2.5 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center gap-1">
          <Lock size={12} /> 비용청구 시 자동완료
        </div>
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


function TodoAssignSheet({ engineerNames, onSubmit, onClose }) {
  const sites = useContext(SitesContext);
  const [uploadSession] = useState(() => Date.now());
  const [form, setForm] = useState({ assignees: [], siteId: "", title: "", dueDate: addDays(TODAY_STR, 7), photos: [] });

  function toggleAssignee(name) {
    setForm((f) => ({
      ...f,
      assignees: f.assignees.includes(name) ? f.assignees.filter((a) => a !== name) : [...f.assignees, name],
    }));
  }

  const site = sites.find((s) => s.id === form.siteId);
  const canSubmit = form.assignees.length > 0 && !!site && form.title.trim().length > 0;

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


export function TodoManageScreen({ todos, onToggle, onAssignTodo, onReassignTodo, onUpdateTodoDescription, onUpdateTodoDueDate, materialRequests, quoteRequests, engineerNames, onBack }) {
  const sites = useContext(SitesContext);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("전체");
  const [assignOpen, setAssignOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const sourceMatch = { 전체: null, 자재연동: "material", 견적연동: "quote", 관리자부여: "manual" };

  const filtered = todos.filter((t) => {
    const matchesSource = source === "전체" || t.source === sourceMatch[source];
    const matchesQuery = t.siteName.includes(query.trim()) || t.assignee.includes(query.trim());
    return matchesSource && matchesQuery;
  });

  const groups = {};
  filtered.forEach((t) => {
    (groups[t.assignee] ??= []).push(t);
  });
  const assignees = Object.keys(groups).sort((a, b) => groups[b].filter((t) => !t.done).length - groups[a].filter((t) => !t.done).length);
  const undoneCount = filtered.filter((t) => !t.done).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="할 일 관리" onBack={onBack} onHome={onBack} />

      <div className="px-5 py-3 bg-blue-950 shrink-0 flex items-center justify-between">
        <span className="text-xs text-blue-200">조건에 맞는 할 일 {filtered.length}건</span>
        <span className="text-sm font-extrabold text-white">미완료 {undoneCount}건</span>
      </div>

      <div className="px-5 pt-3 pb-2 shrink-0">
        <PrimaryButton onClick={() => setAssignOpen(true)} className="mb-3">
          + 새 할 일 부여
        </PrimaryButton>
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="현장명 또는 담당자로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {["전체", "자재연동", "견적연동", "관리자부여"].map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 ${source === s ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {assignees.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 할 일이 없습니다</p>
        ) : (
          assignees.map((a) => (
            <div key={a} className="mb-4">
              <p className="text-xs font-bold text-slate-400 mb-2 sticky top-0 bg-white py-1">
                {a} · {groups[a].filter((t) => !t.done).length}건 미완료 / 총 {groups[a].length}건
              </p>
              <div className="space-y-2">
                {groups[a].map((t) => <TodoRow key={t.id} t={t} onToggle={onToggle} onOpenDetail={setDetailTarget} />)}
              </div>
            </div>
          ))
        )}
      </div>

      {assignOpen && (
        <TodoAssignSheet
          engineerNames={engineerNames}
          onSubmit={onAssignTodo}
          onClose={() => setAssignOpen(false)}
        />
      )}

      {detailTarget && (() => {
        const t = todos.find((x) => x.id === detailTarget.id) ?? detailTarget;
        return (
          <TodoDetailSheet
            todo={t}
            requester={getRequesterName(t, materialRequests, quoteRequests)}
            coAssignees={getCoAssignees(t, todos)}
            supplyPhotoUrls={getSupplyPhotos(t, materialRequests, quoteRequests)}
            siteAddress={getTodoSiteAddress(t, materialRequests, quoteRequests, sites)}
            onToggle={onToggle}
            onReassign={onReassignTodo}
            engineerNames={engineerNames}
            onUpdateDescription={onUpdateTodoDescription}
            onUpdateDueDate={onUpdateTodoDueDate}
            onClose={() => setDetailTarget(null)}
          />
        );
      })()}
    </div>
  );
}
