import { useState, useContext } from "react";
import { ListTodo, Check, Search, Lock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { addDays } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { DDay, PhotoThumb, PrimaryButton, Sheet, Field, inputCls, DrillHeader } from "@/app/components/ui";
import { SitesContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload } from "@/app/components/formWidgets";


/* ------------------------------------------------------------------ */
/* TODO (할일관리)                                                       */
/* ------------------------------------------------------------------ */

export function TodoTab({ todos, setTodos, onReassignTodo }) {
  const { name: CURRENT_ENGINEER, engineerNames } = useContext(AuthContext);
  const mine = todos.filter((t) => t.assignee === CURRENT_ENGINEER);
  const [detailTarget, setDetailTarget] = useState(null);

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

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="px-5 pt-4 space-y-2.5">
        {mine.map((t) => {
          const isManual = t.source === "manual";
          return (
            <div key={t.id} className={`bg-white rounded-xl border p-3.5 ${t.done ? "border-slate-200 opacity-50" : "border-slate-200"}`}>
              <button type="button" onClick={() => setDetailTarget(t)} className="w-full flex items-start justify-between gap-2 text-left">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className={`text-sm font-bold text-slate-800 ${t.done ? "line-through" : ""}`}>{t.title}</p>
                    {isManual && <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">관리자 부여</span>}
                  </div>
                  <p className="text-[11px] text-slate-400">{t.siteName} · {isManual ? `부여일 ${t.assignedDate}` : `자재지급 ${t.assignedDate}`}</p>
                </div>
                {!t.done && <DDay dueDate={t.dueDate} />}
              </button>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[11px] text-slate-400">마감 {t.dueDate}</span>
                {t.done ? (
                  <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 flex items-center gap-1">
                    <Check size={12} /> 완료됨
                  </span>
                ) : isManual ? (
                  <button
                    onClick={() => completeManualTodo(t.id)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-700 text-white active:bg-blue-800"
                  >
                    완료 처리
                  </button>
                ) : (
                  <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 flex items-center gap-1">
                    <Lock size={11} /> 비용청구 시 자동완료
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {detailTarget && (
        <TodoDetailSheet
          todo={mine.find((t) => t.id === detailTarget.id) ?? detailTarget}
          onToggle={detailTarget.source === "manual" && !detailTarget.done ? completeManualTodo : null}
          onReassign={onReassignTodo}
          engineerNames={engineerNames}
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
        onClick={() => onToggle(t.id)}
        className={`w-full mt-2.5 text-xs font-bold py-2 rounded-lg ${t.done ? "bg-slate-100 text-slate-500 active:bg-slate-200" : "bg-blue-700 text-white active:bg-blue-800"}`}
      >
        {t.done ? "완료 취소" : "완료 처리"}
      </button>
    </div>
  );
}


function TodoDetailSheet({ todo, onToggle, onReassign, engineerNames, onClose }) {
  const sourceLabel = todo.source === "manual" ? "관리자 부여" : todo.source === "quote" ? "견적 연동" : "자재 연동";
  return (
    <Sheet title="할 일 상세" onClose={onClose}>
      <div className="bg-slate-100 rounded-xl p-3 mb-4">
        <p className="font-bold text-slate-800">{todo.title}</p>
      </div>
      <div className="space-y-2.5 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">담당자</span>
          {onReassign ? (
            <select
              className="text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg px-2 py-1"
              value={todo.assignee}
              onChange={(e) => onReassign(todo.id, e.target.value)}
            >
              {engineerNames?.includes(todo.assignee) ? null : <option value={todo.assignee}>{todo.assignee}</option>}
              {engineerNames?.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : (
            <span className="font-semibold text-slate-700">{todo.assignee}</span>
          )}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">현장</span>
          <span className="font-semibold text-slate-700">{todo.siteName}</span>
        </div>
        {todo.part && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">부품/공사</span>
            <span className="font-semibold text-slate-700">{todo.part}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">출처</span>
          <span className="font-semibold text-slate-700">{sourceLabel}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">부여일</span>
          <span className="font-semibold text-slate-700">{todo.assignedDate}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">마감일</span>
          <span className="font-semibold text-slate-700">{todo.dueDate}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">상태</span>
          <span className={`font-semibold ${todo.done ? "text-emerald-600" : "text-amber-600"}`}>{todo.done ? "완료" : "미완료"}</span>
        </div>
      </div>
      {todo.photoCount > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-slate-500 mb-2">첨부 사진 ({todo.photoCount}장)</p>
          <div className="grid grid-cols-3 gap-2">
            {todo.photoUrls?.length > 0
              ? todo.photoUrls.map((url, i) => (
                  <img key={i} src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
                ))
              : Array.from({ length: todo.photoCount }).map((_, i) => <PhotoThumb key={i} />)}
          </div>
        </div>
      )}
      {onToggle ? (
        <PrimaryButton
          onClick={() => {
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


export function TodoManageScreen({ todos, onToggle, onAssignTodo, onReassignTodo, engineerNames, onBack }) {
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

      {detailTarget && (
        <TodoDetailSheet
          todo={todos.find((t) => t.id === detailTarget.id) ?? detailTarget}
          onToggle={onToggle}
          onReassign={onReassignTodo}
          engineerNames={engineerNames}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}
