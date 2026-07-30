"use client";

// 에러코드집 관리 — 기종별 에러코드의 고장 이름·의미·조치사항을 등록한다. 과거 처리이력은 상세보기에서만 본다.
import { useRef, useState } from "react";
import { Plus, Upload, Download } from "lucide-react";
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
  const [form, setForm] = useState({ model: models[0] ?? "", code: "", faultName: "", meaning: "", standardAction: "" });
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
          <input
            className={inputCls}
            list="error-code-model-options"
            placeholder="예: OTIS Gen2 (새 기종은 직접 입력)"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
          <datalist id="error-code-model-options">
            {models.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">코드 *</p>
          <input className={inputCls} placeholder="예: E-32" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">고장 이름</p>
          <input className={inputCls} value={form.faultName} onChange={(e) => setForm({ ...form, faultName: e.target.value })} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">의미</p>
          <input className={inputCls} value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">조치사항</p>
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
  const [faultName, setFaultName] = useState(entry.faultName ?? "");
  const [meaning, setMeaning] = useState(entry.meaning ?? "");
  const [standardAction, setStandardAction] = useState(entry.standardAction ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const history = errorCodeHistory(failures, units, entry.model, entry.code);

  async function save() {
    setSaving(true);
    await onSave(entry, { model, code, faultName, meaning, standardAction });
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
          <p className="text-xs font-bold text-slate-500 mb-1">고장 이름</p>
          <input className={inputCls} value={faultName} onChange={(e) => setFaultName(e.target.value)} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">의미</p>
          <input className={inputCls} value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="미등록" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">조치사항</p>
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

// 엑셀/CSV 한 행에서 기종·코드·고장이름·의미·조치사항 값을 찾는다 — 헤더 이름이 정확히
// 같지 않아도(띄어쓰기·대소문자 차이) 매칭되도록 정규화해서 비교한다.
function pickCol(row, keys) {
  const norm = (s) => String(s).replace(/\s/g, "").toLowerCase();
  for (const k of Object.keys(row)) {
    if (keys.some((kk) => norm(k) === norm(kk))) return String(row[k] ?? "").trim();
  }
  return "";
}

// "엑셀로 대량입력" 팝업 — 샘플 양식을 내려받아 채운 뒤 그 파일을 그대로 첨부하면 된다.
function ImportErrorCodesModal({ onClose, onImportFile }) {
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  async function downloadSample() {
    const XLSX = await import("xlsx");
    const wsData = [
      ["기종", "코드", "고장 이름", "의미", "조치사항"],
      ["OTIS Gen2", "E-32", "도어 센서 오류", "도어 센서가 물체를 감지해 문이 안 닫힘", "센서 청소 후 재조정, 필요 시 교체"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "에러코드");
    XLSX.writeFile(wb, "에러코드_샘플양식.xlsx");
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setImporting(true);
    await onImportFile(file);
    setImporting(false);
  }

  return (
    <Modal title="엑셀로 대량입력" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          “기종”·“코드” 열이 있는 엑셀(.xlsx/.xls) 또는 CSV 파일을 올리면 여러 건을 한 번에 등록합니다.
          “고장 이름”·“의미”·“조치사항” 열은 있으면 함께 채워지고, 없어도 됩니다. 이미 등록된
          (기종, 코드) 조합은 새 내용으로 덮어씁니다.
        </p>
        <button
          type="button"
          onClick={downloadSample}
          className="flex items-center justify-center gap-1.5 text-sm font-bold text-blue-700 bg-blue-50 rounded-xl px-4 py-2.5 w-full"
        >
          <Download size={15} /> 샘플 양식 다운로드
        </button>
        <div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5 w-full"
          >
            <Upload size={15} /> {importing ? "가져오는 중..." : "엑셀 파일 첨부"}
          </button>
          {fileName && <p className="text-xs text-slate-400 text-center mt-1.5">{fileName}</p>}
        </div>
      </div>
    </Modal>
  );
}

export default function ErrorCodesAdmin({ data, setData }) {
  const { errorCodes = [], units, failures } = data;
  // 에러코드집의 기종은 실제 호기 기종 데이터와 별개로, 등록된 에러코드에 쓰인 기종만으로 관리한다.
  const models = [...new Set(errorCodes.map((e) => e.model).filter(Boolean))].sort();
  const [modelFilter, setModelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [registering, setRegistering] = useState(false);
  const [detail, setDetail] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const rows = errorCodes.filter((e) => {
    if (modelFilter !== "all" && e.model !== modelFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.model, e.code, e.faultName, e.meaning].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  // 엑셀(.xlsx/.xls) 또는 CSV로 여러 건을 한 번에 등록 — 헤더에 "기종"·"코드"가 있는 행만 가져온다.
  // 이미 있는 (기종,코드) 조합은 upsert로 덮어쓴다(단일 등록과 동일한 규칙).
  async function importErrorCodesFile(file) {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const parsed = sheetRows
        .map((row) => ({
          model: pickCol(row, ["기종", "model"]),
          code: pickCol(row, ["코드", "에러코드", "code"]),
          faultName: pickCol(row, ["고장이름", "고장명", "faultname"]),
          meaning: pickCol(row, ["의미", "meaning"]),
          standardAction: pickCol(row, ["조치사항", "표준조치법", "표준조치", "조치법", "standardaction"]),
        }))
        .filter((r) => r.model && r.code);
      if (parsed.length === 0) {
        alert("가져올 수 있는 행이 없습니다 — '기종'·'코드' 열이 채워진 행이 있는지 확인해주세요.");
        return;
      }
      if (!(await confirmAsync(`${parsed.length}건을 코드집에 등록할까요? 이미 있는 (기종, 코드) 조합은 덮어씁니다.`))) return;
      const payload = parsed.map((r) => ({
        model: r.model,
        code: r.code,
        fault_name: r.faultName || null,
        meaning: r.meaning || null,
        standard_action: r.standardAction || null,
      }));
      const { data: inserted, error } = await supabase.from("error_codes").upsert(payload, { onConflict: "model,code" }).select();
      if (error) { alert("대량입력 실패: " + error.message); return; }
      const mapped = (inserted ?? []).map(mapErrorCode);
      const key = (m, c) => `${m}::${c}`;
      const newKeys = new Set(mapped.map((m) => key(m.model, m.code)));
      setData((prev) => ({
        ...prev,
        errorCodes: [...prev.errorCodes.filter((x) => !newKeys.has(key(x.model, x.code))), ...mapped],
      }));
      alert(`${mapped.length}건을 등록했습니다.`);
    } catch (err) {
      alert("엑셀 파일을 읽는 중 오류가 발생했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
  }

  async function createErrorCode(form) {
    const row = {
      model: form.model.trim(),
      code: form.code.trim(),
      fault_name: form.faultName.trim() || null,
      meaning: form.meaning.trim() || null,
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
        fault_name: patch.faultName.trim() || null,
        meaning: patch.meaning.trim() || null,
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 text-sm font-bold text-blue-700 bg-blue-50 rounded-xl px-4 py-2.5 whitespace-nowrap"
          >
            <Upload size={15} /> 엑셀로 대량입력
          </button>
          <button onClick={() => setRegistering(true)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
            <Plus size={15} /> 코드 등록
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <select className={`${inputCls} w-auto`} value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
          <option value="all">전체 기종</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className={`${inputCls} flex-1 min-w-48`} placeholder="기종·코드·고장이름·의미 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <AdminTable head={["기종", "코드", "고장 이름", "의미", "조치사항"]}>
        {rows.map((e) => (
          <tr key={e.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setDetail(e)}>
            <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{e.model}</td>
            <td className="px-3 py-2.5 font-bold whitespace-nowrap">{e.code}</td>
            <td className="px-3 py-2.5 text-slate-600">{e.faultName || <span className="text-slate-400">미등록</span>}</td>
            <td className="px-3 py-2.5 text-slate-600">{e.meaning || <span className="text-slate-400">미등록</span>}</td>
            <td className="px-3 py-2.5 text-slate-600">{e.standardAction || <span className="text-slate-400">미등록</span>}</td>
          </tr>
        ))}
      </AdminTable>
      {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-10">등록된 에러코드가 없습니다</p>}

      {importOpen && (
        <ImportErrorCodesModal onClose={() => setImportOpen(false)} onImportFile={importErrorCodesFile} />
      )}
      {registering && (
        <RegisterErrorCodeModal models={models} onClose={() => setRegistering(false)} onCreate={createErrorCode} />
      )}
      {detail && (
        <ErrorCodeDetailModal entry={detail} failures={failures} units={units} onClose={() => setDetail(null)} onSave={saveDetail} onDelete={deleteErrorCode} />
      )}
    </div>
  );
}
