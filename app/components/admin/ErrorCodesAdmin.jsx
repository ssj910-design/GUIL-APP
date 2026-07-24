"use client";

// 에러코드집 관리 — 기종별 에러코드 의미·원인·조치법을 등록하고, 과거 처리이력을 함께 본다.
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapErrorCode } from "@/lib/mappers";
import { errorCodeHistory } from "@/lib/utils";
import { AdminTable, Modal, inputCls } from "@/app/components/admin/adminShared";
import { confirmAsync } from "@/app/components/ConfirmHost";

const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

function RegisterErrorCodeModal({ models, onClose, onCreate }) {
  const [form, setForm] = useState({ model: models[0] ?? "", code: "", meaning: "", commonCause: "", standardAction: "" });
  const [saving, setSaving] = useState(false);
  const valid = form.model.trim() && form.code.trim();

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="에러코드 등록" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">기종 *</p>
          {models.length > 0 ? (
            <select className={inputCls} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input className={inputCls} placeholder="예: OTIS Gen2" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          )}
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">코드 *</p>
          <input className={inputCls} placeholder="예: E-32" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">의미</p>
          <input className={inputCls} value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">흔한 원인</p>
          <input className={inputCls} value={form.commonCause} onChange={(e) => setForm({ ...form, commonCause: e.target.value })} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">표준 조치법</p>
          <input className={inputCls} value={form.standardAction} onChange={(e) => setForm({ ...form, standardAction: e.target.value })} />
        </div>
        <div className="flex justify-end pt-2">
          <button disabled={!valid || saving} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
            {saving ? "등록 중..." : "등록하기"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ErrorCodeDetailModal({ entry, failures, units, onClose, onSave, onDelete }) {
  const [model, setModel] = useState(entry.model ?? "");
  const [code, setCode] = useState(entry.code ?? "");
  const [meaning, setMeaning] = useState(entry.meaning ?? "");
  const [commonCause, setCommonCause] = useState(entry.commonCause ?? "");
  const [standardAction, setStandardAction] = useState(entry.standardAction ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const history = errorCodeHistory(failures, units, entry.model, entry.code);

  async function save() {
    setSaving(true);
    await onSave(entry, { model, code, meaning, commonCause, standardAction });
    setSaving(false);
  }

  async function remove() {
    if (!(await confirmAsync(`${entry.model} · ${entry.code} 항목을 삭제할까요? 되돌릴 수 없습니다.`))) return;
    setDeleting(true);
    await onDelete(entry);
    setDeleting(false);
  }

  return (
    <Modal title={`${entry.model} · ${entry.code}`} onClose={onClose}>
      <div className="space-y-3 mb-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기종</p>
            <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">코드</p>
            <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">의미</p>
          <input className={inputCls} value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="미등록" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">흔한 원인</p>
          <input className={inputCls} value={commonCause} onChange={(e) => setCommonCause(e.target.value)} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">표준 조치법</p>
          <input className={inputCls} value={standardAction} onChange={(e) => setStandardAction(e.target.value)} />
        </div>
        <div className="flex justify-between items-center">
          <button disabled={deleting} onClick={remove} className="text-sm font-bold text-red-600 bg-red-50 border border-red-100 disabled:opacity-50 rounded-xl px-4 py-2">
            {deleting ? "삭제 중..." : "삭제"}
          </button>
          <button disabled={saving || !model.trim() || !code.trim()} onClick={save} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">과거 처리이력 {history.length > 0 && `(${history.length})`}</p>
        {history.length === 0 ? (
          <p className="text-xs text-slate-400">아직 처리된 사례가 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">{fmtDate(h.createdAt)} · {h.siteName}</p>
                <p className="text-xs text-slate-500 mt-0.5">{[h.faultSymptom, h.faultCause, h.processContent].filter(Boolean).join(" → ") || "내용 없음"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export default function ErrorCodesAdmin({ data, setData }) {
  const { errorCodes = [], units, failures } = data;
  const models = [...new Set(units.map((u) => u.model).filter(Boolean))].sort();
  const [modelFilter, setModelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [registering, setRegistering] = useState(false);
  const [detail, setDetail] = useState(null);

  const rows = errorCodes.filter((e) => {
    if (modelFilter !== "all" && e.model !== modelFilter) return false;
    const q = search.trim();
    if (!q) return true;
    return [e.model, e.code, e.meaning].filter(Boolean).join(" ").includes(q);
  });
  const historyCount = (e) => errorCodeHistory(failures, units, e.model, e.code).length;

  async function createErrorCode(form) {
    const row = {
      model: form.model.trim(),
      code: form.code.trim(),
      meaning: form.meaning.trim() || null,
      common_cause: form.commonCause.trim() || null,
      standard_action: form.standardAction.trim() || null,
    };
    const { data: inserted, error } = await supabase.from("error_codes").upsert(row, { onConflict: "model,code" }).select().maybeSingle();
    if (error) { alert("등록 실패: " + error.message); return; }
    const mapped = mapErrorCode(inserted);
    setData((prev) => ({
      ...prev,
      errorCodes: [...prev.errorCodes.filter((e) => !(e.model === mapped.model && e.code === mapped.code)), mapped],
    }));
  }

  async function saveDetail(entry, patch) {
    const { data: updated, error } = await supabase
      .from("error_codes")
      .update({
        model: patch.model.trim(),
        code: patch.code.trim(),
        meaning: patch.meaning.trim() || null,
        common_cause: patch.commonCause.trim() || null,
        standard_action: patch.standardAction.trim() || null,
      })
      .eq("id", entry.id)
      .select()
      .maybeSingle();
    if (error) { alert("저장 실패: " + error.message); return; }
    const mapped = mapErrorCode(updated);
    setData((prev) => ({ ...prev, errorCodes: prev.errorCodes.map((e) => (e.id === mapped.id ? mapped : e)) }));
    setDetail(mapped);
  }

  async function deleteErrorCode(entry) {
    const { error } = await supabase.from("error_codes").delete().eq("id", entry.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, errorCodes: prev.errorCodes.filter((e) => e.id !== entry.id) }));
    setDetail(null);
  }

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold">에러코드집</h1>
        <button onClick={() => setRegistering(true)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
          <Plus size={15} /> 코드 등록
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <select className={`${inputCls} w-auto`} value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
          <option value="all">전체 기종</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className={`${inputCls} flex-1 min-w-48`} placeholder="기종·코드·의미 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <AdminTable head={["기종", "코드", "의미", "처리이력"]}>
        {rows.map((e) => (
          <tr key={e.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setDetail(e)}>
            <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{e.model}</td>
            <td className="px-3 py-2.5 font-bold whitespace-nowrap">{e.code}</td>
            <td className="px-3 py-2.5 text-slate-600">{e.meaning || <span className="text-slate-400">미등록</span>}</td>
            <td className="px-3 py-2.5 text-slate-500">{historyCount(e)}건</td>
          </tr>
        ))}
      </AdminTable>
      {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-10">등록된 에러코드가 없습니다</p>}

      {registering && (
        <RegisterErrorCodeModal models={models} onClose={() => setRegistering(false)} onCreate={createErrorCode} />
      )}
      {detail && (
        <ErrorCodeDetailModal entry={detail} failures={failures} units={units} onClose={() => setDetail(null)} onSave={saveDetail} onDelete={deleteErrorCode} />
      )}
    </div>
  );
}
