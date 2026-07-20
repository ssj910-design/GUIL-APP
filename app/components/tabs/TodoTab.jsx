import { useState, useContext } from "react";
import { ListTodo, Check, CheckCircle2, Search, Lock, Image as ImageIcon, Download } from "lucide-react";
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

// 완료 처리/취소는 되돌리기 번거로운 동작이라, 실행 전에 한 번 더 확인을 받습니다.
function confirmToggle(done) {
  return window.confirm(done ? "완료를 취소하시겠습니까?" : "완료 처리하시겠습니까?");
}

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

function TodoCheckbox({ done, locked, onClick }) {
  if (done) {
    return <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />;
  }
  if (locked) {
    return (
      <div className="w-5 h-5 rounded-full border-2 border-slate-200 flex items-center justify-center shrink-0 text-slate-300">
        <Lock size={10} />
      </div>
    );
  }
  return <button type="button" onClick={onClick} className="w-5 h-5 rounded-full border-2 border-slate-300 shrink-0" />;
}

export function TodoTab({ todos, setTodos, onReassignTodo, onUpdateTodoDescription, materialRequests, quoteRequests }) {
  const { name: CURRENT_ENGINEER, engineerNames, role } = useContext(AuthContext);
  const [showDone, setShowDone] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const mine = todos.filter((t) => t.assignee === CURRENT_ENGINEER);

  async function completeManualTodo(id) {
    await supabase.from("todos").update({ done: true }).eq("id", id);
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, done: true } : x)));
  }

  if (mine.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <ListTodo size={32} className="text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-500">할 일이 없습니다</p>
        <p className="text-xs text-slate-400 mt-1.5">자재 담당자가 [자재 지급 완료] 처리를 하거나<br />관리자가 할 일을 부여하면 이곳에 표시됩니다</p>
      </div>
    );
  }

  const visible = mine
    .filter((t) => showDone || !t.done)
    .slice()
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const detailTodo = detailTarget ? mine.find((t) => t.id === detailTarget.id) ?? detailTarget : null;

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <label className="flex items-center gap-1.5 px-5 pt-4 text-xs font-bold text-slate-500">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="w-3.5 h-3.5" />
        완료된 항목 보기
      </label>
      <div className="px-5 pt-2.5 space-y-2.5">
        {visible.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-10">완료되지 않은 할 일이 없습니다</p>
        )}
        {visible.map((t) => {
          const isManual = t.source === "manual";
          const overdue = !t.done && new Date(t.dueDate) < new Date(TODAY_STR);
          const requester = getRequesterName(t, materialRequests, quoteRequests);
          return (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-start gap-2.5">
                <div className="pt-0.5">
                  <TodoCheckbox done={t.done} locked={!isManual} onClick={() => confirmToggle(false) && completeManualTodo(t.id)} />
                </div>
                <button type="button" onClick={() => setDetailTarget(t)} className="flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    {overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                    <p className={`text-sm font-bold ${t.done ? "line-through text-slate-400" : "text-slate-800"}`}>{t.title}</p>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    기한: {formatShortDate(t.dueDate)}{requester ? ` · 요청자: ${requester}` : ""}
                  </p>
                  {!isManual && !t.done && <p className="text-[10px] text-slate-300 mt-0.5">비용청구 시 자동완료</p>}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {detailTodo && (
        <TodoDetailSheet
          todo={detailTodo}
          requester={getRequesterName(detailTodo, materialRequests, quoteRequests)}
          coAssignees={getCoAssignees(detailTodo, todos)}
          supplyPhotoUrls={getSupplyPhotos(detailTodo, materialRequests, quoteRequests)}
          onToggle={detailTodo.source === "manual" && !detailTodo.done ? completeManualTodo : null}
          onReassign={onReassignTodo}
          engineerNames={engineerNames}
          onUpdateDescription={role === "admin" ? onUpdateTodoDescription : null}
          onClose={() => setDetailTarget(null)}
        />
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
        onClick={() => confirmToggle(t.done) && onToggle(t.id)}
        className={`w-full mt-2.5 text-xs font-bold py-2 rounded-lg ${t.done ? "bg-slate-100 text-slate-500 active:bg-slate-200" : "bg-blue-700 text-white active:bg-blue-800"}`}
      >
        {t.done ? "완료 취소" : "완료 처리"}
      </button>
    </div>
  );
}


export function TodoDetailSheet({ todo, requester, coAssignees = [], supplyPhotoUrls = [], onToggle, onReassign, engineerNames, onUpdateDescription, onClose }) {
  const [descDraft, setDescDraft] = useState(todo.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const sourceLabel = todo.source === "manual" ? "관리자 부여" : todo.source === "quote" ? "견적 연동" : "자재 연동";
  const allAssignees = [todo.assignee, ...coAssignees];

  return (
    <Sheet title="할 일 상세" onClose={onClose}>
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
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">현장</span>
          <span className="font-semibold text-slate-700">{todo.siteName}</span>
        </div>
        {todo.billingAmount != null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">교체부품·청구금액</span>
            <span className="font-bold text-blue-700">
              {todo.billingPart ? `${todo.billingPart} · ` : ""}₩{Number(todo.billingAmount).toLocaleString()}
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
          <span className="font-semibold text-slate-700">{formatYyMmDd(todo.dueDate)}</span>
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
        <PrimaryButton
          onClick={() => {
            if (!confirmToggle(todo.done)) return;
            onToggle(todo.id);
            onClose();
          }}
        >
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
    </Sheet>
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


export function TodoManageScreen({ todos, onToggle, onAssignTodo, onReassignTodo, onUpdateTodoDescription, materialRequests, quoteRequests, engineerNames, onBack }) {
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
            onToggle={onToggle}
            onReassign={onReassignTodo}
            engineerNames={engineerNames}
            onUpdateDescription={onUpdateTodoDescription}
            onClose={() => setDetailTarget(null)}
          />
        );
      })()}
    </div>
  );
}
