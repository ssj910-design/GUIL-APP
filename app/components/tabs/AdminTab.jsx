import { useState, useContext } from "react";
import { ShieldCheck, Package, Receipt, ListTodo, ChevronRight, Users, FileText, PackageCheck, RotateCcw, PackageX, Building2 } from "lucide-react";
import { Badge, PhotoThumb, PrimaryButton, Sheet, Field, inputCls, DrillHeader } from "@/app/components/ui";
import { SitesContext, AuthContext } from "@/app/components/context";
import { MultiPhotoUpload } from "@/app/components/formWidgets";
import { BillingHistoryScreen } from "@/app/components/tabs/BillingTab";
import { TodoManageScreen } from "@/app/components/tabs/TodoTab";


function AdminMenuRow({ icon: Icon, label, badge, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3.5 active:bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          <Icon size={15} className="text-slate-600" />
        </div>
        <span className="text-sm font-bold text-slate-800">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {!!badge && <span className="text-[11px] font-bold text-white bg-blue-700 px-2 py-0.5 rounded-full">{badge}</span>}
        <ChevronRight size={16} className="text-slate-300" />
      </div>
    </button>
  );
}


const emptySiteForm = {
  name: "", siteCode: "", elevatorNo: "", region: "", address: "",
  contractType: "", phone: "", elevatorModel: "", unitCount: "1",
  manager: "", managerPhone: "", assignedEngineer: "", govElevatorNos: [""],
};


function ManagerRow({ manager, onSave, onDelete }) {
  const [draft, setDraft] = useState({ name: manager.name ?? "", phone: manager.phone ?? "", email: manager.email ?? "", fax: manager.fax ?? "" });
  return (
    <div className="border border-slate-200 rounded-lg p-3 mb-2.5 space-y-2">
      <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="담당자 이름" />
      <input className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="전화번호" />
      <input className={inputCls} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="메일주소" />
      <input className={inputCls} value={draft.fax} onChange={(e) => setDraft({ ...draft, fax: e.target.value })} placeholder="FAX" />
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(draft)} className="flex-1 bg-blue-700 text-white text-xs font-bold py-2 rounded-lg active:bg-blue-800">저장</button>
        <button type="button" onClick={onDelete} className="flex-1 bg-red-50 text-red-600 text-xs font-bold py-2 rounded-lg active:bg-red-100">삭제</button>
      </div>
    </div>
  );
}


function SiteEditorSheet({ initial, engineerNames, siteId, managers, onAddManager, onUpdateManager, onDeleteManager, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const canSave = form.name.trim().length > 0;
  const unitN = Number(form.unitCount) || 1;

  function setGovNo(idx, value) {
    setForm((f) => {
      const arr = [...(f.govElevatorNos ?? [])];
      arr[idx] = value.replace(/[^0-9]/g, "");
      return { ...f, govElevatorNos: arr };
    });
  }

  return (
    <Sheet title={initial === emptySiteForm ? "새 현장 등록" : "현장 정보 수정"} onClose={onClose}>
      <Field label="현장명"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 대박빌딩" /></Field>
      <Field label="승강기 번호"><input className={inputCls} value={form.elevatorNo} onChange={(e) => setForm({ ...form, elevatorNo: e.target.value })} placeholder="예: 1호기" /></Field>
      <Field label="대수"><input type="number" min={1} className={inputCls} value={form.unitCount} onChange={(e) => setForm({ ...form, unitCount: e.target.value })} /></Field>
      <Field label="주소"><input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      <Field label="계약구분">
        <select
          className={`${inputCls} ${form.contractType === "FM(종합계약)" ? "text-red-600 font-bold" : ""}`}
          value={form.contractType}
          onChange={(e) => setForm({ ...form, contractType: e.target.value })}
        >
          <option value="">선택해주세요</option>
          <option value="POG(일반계약)">POG(일반계약)</option>
          <option value="FM(종합계약)">FM(종합계약)</option>
        </select>
      </Field>
      <Field label="승강기 모델"><input className={inputCls} value={form.elevatorModel} onChange={(e) => setForm({ ...form, elevatorModel: e.target.value })} /></Field>
      <Field label="승강기고유번호 (국가승강기정보센터, 호기별)">
        <div className="space-y-2">
          {Array.from({ length: unitN }, (_, i) => (
            <input
              key={i}
              className={inputCls}
              value={(form.govElevatorNos ?? [])[i] ?? ""}
              onChange={(e) => setGovNo(i, e.target.value)}
              placeholder={`${i + 1}호기 고유번호 (예: 0075681)`}
            />
          ))}
        </div>
      </Field>
      <Field label="담당 기사 배정">
        <select className={inputCls} value={form.assignedEngineer} onChange={(e) => setForm({ ...form, assignedEngineer: e.target.value })}>
          <option value="">미배정</option>
          {engineerNames.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </Field>
      <PrimaryButton onClick={() => onSave(form)} disabled={!canSave}>저장</PrimaryButton>

      {siteId && (
        <div className="mt-6 pt-5 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 mb-2.5">담당자 관리 (여러 명 등록 가능)</p>
          {managers.map((m) => (
            <ManagerRow
              key={m.id}
              manager={m}
              onSave={(draft) => onUpdateManager(m.id, draft)}
              onDelete={() => onDeleteManager(m.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => onAddManager(siteId, { name: "", phone: "", email: "", fax: "" })}
            className="w-full border-2 border-dashed border-slate-300 rounded-lg py-2.5 text-xs font-bold text-slate-500 active:bg-slate-50"
          >
            + 담당자 추가
          </button>
        </div>
      )}
    </Sheet>
  );
}


function SiteManagementScreen({ sites, engineerNames, onAddSite, onUpdateSite, onDeleteSite, siteManagers, onAddSiteManager, onUpdateSiteManager, onDeleteSiteManager, onBack }) {
  const [editingSite, setEditingSite] = useState(null); // null | "new" | site object
  const [deleteTarget, setDeleteTarget] = useState(null);

  function siteToForm(s) {
    return {
      name: s.name ?? "", siteCode: s.siteCode ?? "", elevatorNo: s.elevatorNo ?? "",
      region: s.region ?? "", address: s.address ?? "", contractType: s.contractType ?? "",
      phone: s.phone ?? "", elevatorModel: s.elevatorModel ?? "", unitCount: String(s.unitCount ?? 1),
      manager: s.manager ?? "", managerPhone: s.managerPhone ?? "", assignedEngineer: s.assignedEngineer ?? "",
      govElevatorNos: Array.from({ length: Number(s.unitCount) || 1 }, (_, i) => s.govElevatorNos?.[i] ?? ""),
    };
  }

  async function handleSave(form) {
    if (editingSite === "new") {
      await onAddSite(form);
    } else {
      await onUpdateSite(editingSite.id, form);
    }
    setEditingSite(null);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="현장정보" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <PrimaryButton onClick={() => setEditingSite("new")} className="mb-4">
          + 새 현장 등록
        </PrimaryButton>
        <div className="space-y-2.5">
          {sites.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-slate-800 text-sm">{s.name} · {s.elevatorNo}</p>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{s.region || "-"}</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">{s.address || "주소 미등록"}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  담당 기사: <span className="font-semibold text-slate-700">{s.assignedEngineer || "미배정"}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingSite(s)}
                    className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => setDeleteTarget(s)}
                    className="text-[11px] font-bold text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
          {sites.length === 0 && <p className="text-xs text-slate-400 text-center py-10">등록된 현장이 없습니다</p>}
        </div>
      </div>

      {editingSite && (
        <SiteEditorSheet
          initial={editingSite === "new" ? emptySiteForm : siteToForm(editingSite)}
          engineerNames={engineerNames}
          siteId={editingSite === "new" ? null : editingSite.id}
          managers={editingSite === "new" ? [] : siteManagers.filter((m) => m.siteId === editingSite.id)}
          onAddManager={onAddSiteManager}
          onUpdateManager={onUpdateSiteManager}
          onDeleteManager={onDeleteSiteManager}
          onSave={handleSave}
          onClose={() => setEditingSite(null)}
        />
      )}

      {deleteTarget && (
        <Sheet title="현장 삭제" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-700 mb-1">
            <span className="font-bold">{deleteTarget.name}</span> 현장을 삭제하시겠습니까?
          </p>
          <p className="text-[11px] text-slate-400 mb-4">
            이 현장과 연결된 고장·검사·자재 이력은 남아있지만, 더 이상 이 현장을 참조하지 않게 됩니다.
          </p>
          <PrimaryButton
            tone="red"
            onClick={async () => {
              await onDeleteSite(deleteTarget.id);
              setDeleteTarget(null);
            }}
          >
            삭제
          </PrimaryButton>
        </Sheet>
      )}
    </div>
  );
}


function EngineerContactRow({ engineer, onSave }) {
  const [draft, setDraft] = useState({ phone: engineer.phone ?? "", email: engineer.email ?? "" });
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3.5 mb-2.5">
      <p className="font-bold text-slate-800 text-sm mb-2">{engineer.name}</p>
      <div className="space-y-2">
        <input className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="전화번호" />
        <input className={inputCls} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="메일주소" />
      </div>
      <button
        type="button"
        onClick={() => onSave(draft)}
        className="w-full mt-2.5 bg-blue-700 text-white text-xs font-bold py-2 rounded-lg active:bg-blue-800"
      >
        저장
      </button>
    </div>
  );
}


function EngineerManageScreen({ engineers, onUpdateEngineerContact, onBack }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="기사관리" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {engineers.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">등록된 기사 계정이 없습니다</p>
        ) : (
          engineers.map((e) => (
            <EngineerContactRow key={e.id} engineer={e} onSave={(draft) => onUpdateEngineerContact(e.id, draft)} />
          ))
        )}
      </div>
    </div>
  );
}


function AssigneeSelect({ value, options, onChange }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.includes(value) ? null : <option value={value}>{value}</option>}
      {options.map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
  );
}

// 견적 지급 시 실제 시공할 기사를 2명 이상 지정할 수 있게 하는 다중 선택 UI입니다.
function MultiAssigneeSelect({ values, options, onChange }) {
  const extras = values.filter((v) => !options.includes(v));
  const allNames = [...options, ...extras];
  function toggle(name) {
    onChange(values.includes(name) ? values.filter((v) => v !== name) : [...values, name]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {allNames.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => toggle(name)}
          className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
            values.includes(name) ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-500 border-slate-300"
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function MaterialRequestsScreen({ materialRequests, onSupplyComplete, onReprocess, onAttachPhoto, onRemoveSupplyPhoto, onBack }) {
  const { engineerNames } = useContext(AuthContext);
  const [detailTarget, setDetailTarget] = useState(null);
  const [assigneeMap, setAssigneeMap] = useState({});
  const [billingAmountMap, setBillingAmountMap] = useState({});
  const pending = materialRequests.filter((r) => r.status === "승인대기");
  const supplied = materialRequests.filter((r) => r.status === "지급완료");
  const rejected = materialRequests.filter((r) => r.status === "반려");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="자재 지급 대기" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {rejected.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <PackageX size={16} className="text-red-600" />
              <h3 className="font-extrabold text-red-700 text-sm">기사 반려 · 재지급 필요</h3>
            </div>
            <div className="space-y-2">
              {rejected.map((r) => (
                <div key={r.id} className="bg-white rounded-xl p-3 border border-red-100">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-slate-800 text-sm">{r.siteName} · {r.part}</p>
                    <span className="text-[11px] text-slate-400">{r.engineer}</span>
                  </div>
                  <p className="text-xs text-red-600 mb-2">사유: {r.rejectReason}</p>
                  <button
                    onClick={() => onReprocess(r.id)}
                    className="w-full flex items-center justify-center gap-1.5 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
                  >
                    <RotateCcw size={13} /> 재지급 대상으로 되돌리기
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-sm">자재 지급 대기</h3>
            <span className="text-xs font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="space-y-2.5">
            {pending.map((r) => (
              <div key={r.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-800">{r.siteName} · {r.part}</p>
                  <button
                    onClick={() => setDetailTarget({ type: "material", data: r })}
                    className="text-[11px] font-bold text-blue-600 shrink-0 flex items-center gap-0.5"
                  >
                    상세보기 <ChevronRight size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{r.engineer} 기사 신청 · {r.requestedDate} · {r.urgency}</p>

                <div className="mt-2.5">
                  <MultiPhotoUpload
                    photos={(r.supplyPhotoUrls ?? (r.supplyPhotoUrl ? [r.supplyPhotoUrl] : [])).map((url) => ({ url }))}
                    uploadFolder={`materials/${r.id}/supply`}
                    onUploaded={(url) => onAttachPhoto(r.id, url)}
                    onRemove={(idx) => onRemoveSupplyPhoto(r.id, idx)}
                    label="지급할 자재 사진 촬영"
                    required={false}
                  />
                </div>

                <div className="mt-2.5">
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">담당 기사 (실제 교체할 기사, 기본값 신청자)</label>
                  <AssigneeSelect
                    value={assigneeMap[r.id] ?? r.engineer}
                    options={engineerNames}
                    onChange={(name) => setAssigneeMap((m) => ({ ...m, [r.id]: name }))}
                  />
                </div>

                <div className="mt-2.5">
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">청구 부품</label>
                  <p className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 bg-slate-50">{r.part || "-"}</p>
                </div>
                <div className="mt-2.5">
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">청구금액</label>
                  <input
                    type="number"
                    className={inputCls}
                    placeholder="예: 70000"
                    value={billingAmountMap[r.id] ?? ""}
                    onChange={(e) => setBillingAmountMap((m) => ({ ...m, [r.id]: e.target.value }))}
                  />
                </div>

                <button
                  onClick={() => onSupplyComplete(r.id, assigneeMap[r.id] ?? r.engineer, r.part || null, billingAmountMap[r.id] || null)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg bg-blue-700 text-white active:bg-blue-800"
                >
                  <PackageCheck size={14} /> 자재 지급 완료 체크
                </button>
              </div>
            ))}
            {pending.length === 0 && <p className="text-xs text-slate-400 text-center py-3">지급 대기 중인 자재 신청이 없습니다</p>}
          </div>

          {supplied.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-400 mt-4 mb-2">최근 지급완료 (할 일 자동 생성됨)</p>
              <div className="space-y-1.5">
                {supplied.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs text-slate-500">
                    <span>{r.siteName} · {r.part}</span>
                    <span className="text-emerald-600 font-semibold">{r.suppliedDate} 지급 · D-30 시작</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {detailTarget?.type === "material" && (
        <Sheet title="자재 신청 상세" onClose={() => setDetailTarget(null)}>
          <div className="space-y-3">
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">현장</p>
              <p className="font-bold text-slate-800">{detailTarget.data.siteName}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">부품 내역 (부품명, 수량)</p>
              <p className="font-bold text-slate-800 whitespace-pre-wrap">{detailTarget.data.part}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">긴급도</p>
                <p className="font-bold text-slate-800">{detailTarget.data.urgency}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">신청 기사</p>
                <p className="font-bold text-slate-800">{detailTarget.data.engineer}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3 col-span-2">
                <p className="text-[11px] text-slate-500">신청일</p>
                <p className="font-bold text-slate-800">{detailTarget.data.requestedDate}</p>
              </div>
            </div>
            {detailTarget.data.note && (
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">기사 의견 (교체 사유 및 특이사항)</p>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{detailTarget.data.note}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">기사가 첨부한 부품 규격 사진 ({detailTarget.data.photoCount ?? 1}장)</p>
              <div className="grid grid-cols-3 gap-2">
                {detailTarget.data.photoUrls?.length > 0
                  ? detailTarget.data.photoUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
                    ))
                  : Array.from({ length: detailTarget.data.photoCount ?? 1 }).map((_, i) => <PhotoThumb key={i} />)}
              </div>
            </div>
            {detailTarget.data.status === "반려" && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <p className="text-[11px] text-red-600 font-semibold">반려 사유</p>
                <p className="text-sm text-red-700 mt-0.5">{detailTarget.data.rejectReason}</p>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}


function QuoteRequestsScreen({ quoteRequests, onAdvanceQuote, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onCompleteQuoteSupply, onBack }) {
  const { engineerNames } = useContext(AuthContext);
  const [detailTarget, setDetailTarget] = useState(null);
  const [assigneesMap, setAssigneesMap] = useState({});

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="견적 요청 관리" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="space-y-3">
            {quoteRequests.map((q) => (
              <div key={q.id} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-slate-800">{q.siteName} · {q.constructionType}</p>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      q.status === "자재지급완료" ? "bg-emerald-100 text-emerald-700" :
                      q.status === "승인" ? "bg-indigo-100 text-indigo-700" :
                      q.status === "견적발행" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {q.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-1">{q.engineer} 기사 신청 · {q.requestedDate} · 현장담당 {q.contactPhone}</p>
                <button
                  onClick={() => setDetailTarget({ type: "quote", data: q })}
                  className="text-[11px] font-bold text-blue-600 mb-2 flex items-center gap-0.5"
                >
                  상세보기 <ChevronRight size={12} />
                </button>

                {q.status === "요청접수" && (
                  <button
                    onClick={() => onAdvanceQuote(q.id)}
                    className="w-full bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
                  >
                    견적발행 처리
                  </button>
                )}
                {q.status === "견적발행" && (
                  <button
                    onClick={() => onAdvanceQuote(q.id)}
                    className="w-full bg-indigo-600 text-white text-xs font-bold py-2.5 rounded-lg active:bg-indigo-700"
                  >
                    승인 처리
                  </button>
                )}
                {q.status === "승인" && (() => {
                  const assignees = assigneesMap[q.id] ?? [q.engineer];
                  const canComplete = assignees.length > 0;
                  return (
                    <>
                      <div className="mb-2">
                        <MultiPhotoUpload
                          photos={(q.supplyPhotoUrls ?? (q.supplyPhotoUrl ? [q.supplyPhotoUrl] : [])).map((url) => ({ url }))}
                          uploadFolder={`quotes/${q.id}/supply`}
                          onUploaded={(url) => onAttachQuotePhoto(q.id, url)}
                          onRemove={(idx) => onRemoveQuoteSupplyPhoto(q.id, idx)}
                          label="지급할 자재 사진 촬영"
                          required={false}
                        />
                      </div>
                      <div className="mb-2">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">담당 기사 (실제 시공할 기사, 2명 이상 지정 가능 · 기본값 신청자)</label>
                        <MultiAssigneeSelect
                          values={assignees}
                          options={engineerNames}
                          onChange={(names) => setAssigneesMap((m) => ({ ...m, [q.id]: names }))}
                        />
                      </div>
                      <button
                        onClick={() => canComplete && onCompleteQuoteSupply(q.id, assignees)}
                        disabled={!canComplete}
                        className={`w-full flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg ${
                          canComplete ? "bg-blue-700 text-white active:bg-blue-800" : "bg-slate-200 text-slate-400"
                        }`}
                      >
                        <PackageCheck size={14} /> 자재 지급 완료 체크
                      </button>
                      {assignees.length === 0 && (
                        <p className="text-[10px] text-slate-400 text-center mt-1">담당 기사를 1명 이상 선택해주세요</p>
                      )}
                    </>
                  );
                })()}
                {q.status === "자재지급완료" && (
                  <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <PackageCheck size={12} /> {q.suppliedDate} 지급완료 · 담당 기사에게 할 일 자동 생성됨
                  </p>
                )}
              </div>
            ))}
            {quoteRequests.length === 0 && <p className="text-xs text-slate-400 text-center py-3">접수된 견적 요청이 없습니다</p>}
          </div>
        </div>
      </div>

      {detailTarget?.type === "quote" && (
        <Sheet title="견적 요청 상세" onClose={() => setDetailTarget(null)}>
          <div className="space-y-3">
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">현장</p>
              <p className="font-bold text-slate-800">{detailTarget.data.siteName}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">견적 내역 (부품명, 수량)</p>
              <p className="font-bold text-slate-800 whitespace-pre-wrap">{detailTarget.data.constructionType}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">현장 견적 담당자 연락처</p>
                <p className="font-bold text-slate-800">{detailTarget.data.contactPhone}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">신청 기사</p>
                <p className="font-bold text-slate-800">{detailTarget.data.engineer}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3 col-span-2">
                <p className="text-[11px] text-slate-500">신청일</p>
                <p className="font-bold text-slate-800">{detailTarget.data.requestedDate}</p>
              </div>
            </div>
            {detailTarget.data.note && (
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">기사 의견 (견적 사유 및 특이사항)</p>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{detailTarget.data.note}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">기사가 첨부한 현장 상태 사진 ({detailTarget.data.photoCount ?? 1}장)</p>
              <div className="grid grid-cols-3 gap-2">
                {detailTarget.data.photoUrls?.length > 0
                  ? detailTarget.data.photoUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
                    ))
                  : Array.from({ length: detailTarget.data.photoCount ?? 1 }).map((_, i) => <PhotoThumb key={i} />)}
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}


function InspectionMonitorScreen({ inspections, onBack }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="검사결과 및 합격증 모니터링" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="space-y-3">
            {inspections.map((i) => (
              <div key={i.id} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{i.siteName} · {i.type}</span>
                {i.result ? <Badge result={i.result} /> : <span className="text-[11px] text-slate-400">미등록</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}



function RestockScreen({ restockRequests, onAttachRestockPhoto, onRemoveRestockSupplyPhoto, onCompleteRestock, onBack }) {
  const pending = restockRequests.filter((r) => r.status === "대기");
  const done = restockRequests.filter((r) => r.status === "완료");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="상비부품 보충" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-sm">보충 대기</h3>
            <span className="text-xs font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="space-y-2.5">
            {pending.map((r) => (
              <div key={r.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                <p className="text-sm font-bold text-slate-800">{r.part}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{r.engineer} 기사 · {r.siteName}에서 사용 · {r.requestedDate}</p>

                <div className="mt-2.5">
                  <MultiPhotoUpload
                    photos={(r.supplyPhotoUrls ?? (r.supplyPhotoUrl ? [r.supplyPhotoUrl] : [])).map((url) => ({ url }))}
                    uploadFolder={`restock/${r.id}/supply`}
                    onUploaded={(url) => onAttachRestockPhoto(r.id, url)}
                    onRemove={(idx) => onRemoveRestockSupplyPhoto(r.id, idx)}
                    label="보충할 부품 사진 촬영"
                    required={false}
                  />
                </div>

                <button
                  onClick={() => onCompleteRestock(r.id)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg bg-blue-700 text-white active:bg-blue-800"
                >
                  <PackageCheck size={14} /> 보충 지급 완료 체크
                </button>
              </div>
            ))}
            {pending.length === 0 && <p className="text-xs text-slate-400 text-center py-3">보충 대기 중인 상비부품이 없습니다</p>}
          </div>

          {done.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-400 mt-4 mb-2">최근 보충완료</p>
              <div className="space-y-1.5">
                {done.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs text-slate-500">
                    <span>{r.engineer} · {r.part}</span>
                    <span className="text-emerald-600 font-semibold">{r.suppliedDate} 보충완료</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


export function AdminTab({ inspections, materialRequests, billings, quoteRequests, restockRequests, todos, onSupplyComplete, onReprocess, onAttachPhoto, onRemoveSupplyPhoto, onAssignTodo, onAdvanceQuote, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onCompleteQuoteSupply, onAdminToggleTodo, onAttachRestockPhoto, onRemoveRestockSupplyPhoto, onCompleteRestock, onReassignTodo, onUpdateTodoDescription, onAddSite, onUpdateSite, onDeleteSite, siteManagers, onAddSiteManager, onUpdateSiteManager, onDeleteSiteManager, onUpdateEngineerContact }) {
  const sites = useContext(SitesContext);
  const { engineerNames, engineers } = useContext(AuthContext);
  const [billingViewOpen, setBillingViewOpen] = useState(false);
  const [todoViewOpen, setTodoViewOpen] = useState(false);
  const [adminScreen, setAdminScreen] = useState(null); // null | "sites" | "materials" | "quotes" | "inspections" | "restock"
  const pendingCount = materialRequests.filter((r) => r.status === "승인대기").length;
  const quoteActiveCount = quoteRequests.filter((q) => q.status !== "자재지급완료").length;

  if (billingViewOpen) {
    return <BillingHistoryScreen billings={billings} onBack={() => setBillingViewOpen(false)} />;
  }

  if (todoViewOpen) {
    return (
      <TodoManageScreen
        todos={todos}
        onToggle={onAdminToggleTodo}
        onAssignTodo={onAssignTodo}
        onReassignTodo={onReassignTodo}
        onUpdateTodoDescription={onUpdateTodoDescription}
        materialRequests={materialRequests}
        quoteRequests={quoteRequests}
        engineerNames={engineerNames}
        onBack={() => setTodoViewOpen(false)}
      />
    );
  }

  if (adminScreen === "sites") {
    return (
      <SiteManagementScreen
        sites={sites}
        engineerNames={engineerNames}
        onAddSite={onAddSite}
        onUpdateSite={onUpdateSite}
        onDeleteSite={onDeleteSite}
        siteManagers={siteManagers}
        onAddSiteManager={onAddSiteManager}
        onUpdateSiteManager={onUpdateSiteManager}
        onDeleteSiteManager={onDeleteSiteManager}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  if (adminScreen === "engineers") {
    return (
      <EngineerManageScreen
        engineers={engineers}
        onUpdateEngineerContact={onUpdateEngineerContact}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  if (adminScreen === "materials") {
    return (
      <MaterialRequestsScreen
        materialRequests={materialRequests}
        onSupplyComplete={onSupplyComplete}
        onReprocess={onReprocess}
        onAttachPhoto={onAttachPhoto}
        onRemoveSupplyPhoto={onRemoveSupplyPhoto}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  if (adminScreen === "quotes") {
    return (
      <QuoteRequestsScreen
        quoteRequests={quoteRequests}
        onAdvanceQuote={onAdvanceQuote}
        onAttachQuotePhoto={onAttachQuotePhoto}
        onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
        onCompleteQuoteSupply={onCompleteQuoteSupply}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  if (adminScreen === "inspections") {
    return <InspectionMonitorScreen inspections={inspections} onBack={() => setAdminScreen(null)} />;
  }

  if (adminScreen === "restock") {
    return (
      <RestockScreen
        restockRequests={restockRequests}
        onAttachRestockPhoto={onAttachRestockPhoto}
        onRemoveRestockSupplyPhoto={onRemoveRestockSupplyPhoto}
        onCompleteRestock={onCompleteRestock}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          <AdminMenuRow icon={Building2} label="현장정보" badge={sites.length} onClick={() => setAdminScreen("sites")} />
          <AdminMenuRow icon={Users} label="기사관리" badge={engineers.length} onClick={() => setAdminScreen("engineers")} />
          <AdminMenuRow icon={PackageCheck} label="자재 지급 대기" badge={pendingCount} onClick={() => setAdminScreen("materials")} />
          <AdminMenuRow icon={Package} label="상비부품 보충" badge={restockRequests.filter((r) => r.status === "대기").length} onClick={() => setAdminScreen("restock")} />
          <AdminMenuRow icon={FileText} label="견적 요청 관리" badge={quoteActiveCount} onClick={() => setAdminScreen("quotes")} />
          <AdminMenuRow icon={ListTodo} label="할 일 관리" badge={todos.filter((t) => !t.done).length} onClick={() => setTodoViewOpen(true)} />
          <AdminMenuRow icon={Receipt} label="비용청구 내역" badge={billings.length} onClick={() => setBillingViewOpen(true)} />
          <AdminMenuRow icon={ShieldCheck} label="검사결과 및 합격증 모니터링" onClick={() => setAdminScreen("inspections")} />
        </div>
      </div>
    </div>
  );
}
