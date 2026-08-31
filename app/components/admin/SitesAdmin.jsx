"use client";

// 현장관리 — 관리자 콘솔의 핵심 화면.
// v2 기본: 호기(units)를 직접 편집한다. 단 007(옛 컬럼 정리) 전까지는
// 모바일 앱이 아직 참조하는 sites의 옛 컬럼(unit_count, gov_elevator_nos,
// elevator_model)도 함께 동기화한다(듀얼라이트).
import { useState } from "react";
import { Plus, Trash2, Paperclip, FileText, ShieldCheck, BadgeCheck, PhoneCall } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapUnit, mapSite, mapUnitPartPhoto } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";
import { addDays, govDateToDashed, siteMatchesQuery, siteMatchReasons, formatPhone, shortDate, realInstallPlace, unitContractBadges } from "@/lib/utils";
import { useLiveInspections, useInspectionHistory, mapGovResultToCode } from "@/app/hooks/useLiveInspections";
import { Badge } from "@/app/components/ui";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { Modal, StatusBadge, DateTextInput, FileCarousel, sentHistory, Highlight } from "@/app/components/admin/adminShared";
import { PartsStatusTab } from "@/app/components/admin/PartsStatusTab";
import ImportSites from "@/app/components/admin/ImportSites";
import VerifyImport from "@/app/components/admin/VerifyImport";
import ImportEmergencyPhones from "@/app/components/admin/ImportEmergencyPhones";
import { confirmAsync } from "@/app/components/ConfirmHost";
import { uploadPhoto } from "@/lib/photos";
import { authFetch } from "@/lib/apiFetch";

const CONTRACT_TYPES = ["POG(일반계약)", "FM(종합계약)", "2회점검"];
const CONTACT_ROLES = ["대표", "담당자", "관리소장", "건물주", "경비실", "입주민 대표", "총무", "기타"];
const inputCls = "border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500";
const TERMINATION_BASIS = ["중지공문", "구두통보", "기타"];

// 현장 계약서 사본 첨부 — 클릭해서 열지 않아도 바로 보이게, 2장 이상이면 좌우로 넘긴다.
function SiteContractModal({ site, onClose, onSave }) {
  const urls = site.contractUrls ?? [];
  return (
    <Modal title={`${site.name} 계약서`} onClose={onClose} wide="xl">
      <FileCarousel
        urls={urls}
        uploadLabel="계약서 사본 첨부 (사진/PDF)"
        height="h-[calc(85vh-9rem)]"
        onUpload={(file) => uploadPhoto(file, `contracts/${site.id}`)}
        onSave={onSave}
      />
    </Modal>
  );
}

// 현장 사업자등록증 첨부 — 계약서와 완전히 동일한 방식(다중 첨부, 좌우 넘김).
function SiteBizRegModal({ site, onClose, onSave }) {
  const urls = site.businessRegUrls ?? [];
  return (
    <Modal title={`${site.name} 사업자등록증`} onClose={onClose} wide="xl">
      <FileCarousel
        urls={urls}
        uploadLabel="사업자등록증 첨부 (사진/PDF)"
        height="h-[calc(85vh-9rem)]"
        onUpload={(file) => uploadPhoto(file, `business-reg/${site.id}`)}
        onSave={onSave}
      />
    </Modal>
  );
}

// 현장 단건 등록 — 현장정보 수정 화면과 동일한 칸(계약정보·담당기사·연락처·비고)을 전부 여기서 받는다.
// 호기(승강기 정보)만은 등록 후 상세화면의 "승강기 정보 > 수정하기"에서 추가한다.
function AddSiteModal({ engineers, onClose, onSave }) {
  const [form, setForm] = useState({
    name: "", address: "", contractType: CONTRACT_TYPES[0], maintenanceCost: "",
    contractDate: "", contractEnd: "", assignedEngineers: [], leadEngineer: "",
    phone: "", fax: "", email: "", accessInfo: "", notes: "",
  });
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  function toggleEngineer(name) {
    setForm((f) => {
      const has = f.assignedEngineers.includes(name);
      const nextList = has ? f.assignedEngineers.filter((n) => n !== name) : [...f.assignedEngineers, name];
      const nextLead = has && f.leadEngineer === name ? (nextList[0] ?? "") : (f.leadEngineer || name);
      return { ...f, assignedEngineers: nextList, leadEngineer: nextLead };
    });
  }
  return (
    <Modal title="새 현장 추가" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><p className="text-xs font-bold text-slate-500 mb-1">현장명</p>
            <input className={inputCls} placeholder="예: ○○빌딩" value={form.name} onChange={(e) => set("name")(e.target.value)} autoFocus /></div>
          <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">주소</p>
            <input className={inputCls} placeholder="예: 서울특별시 강남구 테헤란로 123" value={form.address} onChange={(e) => set("address")(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><p className="text-xs font-bold text-slate-500 mb-1">계약구분</p>
            <select className={inputCls} value={form.contractType} onChange={(e) => set("contractType")(e.target.value)}>
              {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">보수료(VAT별도)</p>
            <input className={inputCls} type="number" placeholder="원" value={form.maintenanceCost} onChange={(e) => set("maintenanceCost")(e.target.value)} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">계약일자</p>
            <DateTextInput value={form.contractDate} onChange={set("contractDate")} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">계약종료일</p>
            <DateTextInput value={form.contractEnd} onChange={set("contractEnd")} /></div>
          <div className="md:col-span-1">
            <p className="text-xs font-bold text-slate-500 mb-1">담당 기사 (체크, ★ = 대표)</p>
            <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto p-1.5 space-y-0.5">
              {engineers.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-xs px-1 py-0.5">
                  <input type="checkbox" checked={form.assignedEngineers.includes(p.name)} onChange={() => toggleEngineer(p.name)} />
                  <span className="flex-1">{p.name}</span>
                  {form.assignedEngineers.includes(p.name) && (
                    <button type="button" onClick={() => set("leadEngineer")(p.name)}
                      className={form.leadEngineer === p.name ? "text-amber-500" : "text-slate-300"}>★</button>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><p className="text-xs font-bold text-slate-500 mb-1">전화번호</p>
            <input className={inputCls} placeholder="관리사무소 대표번호" value={form.phone} onChange={(e) => set("phone")(formatPhone(e.target.value))} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">팩스</p>
            <input className={inputCls} value={form.fax} onChange={(e) => set("fax")(formatPhone(e.target.value))} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">이메일</p>
            <input className={inputCls} value={form.email} onChange={(e) => set("email")(e.target.value)} /></div>
        </div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">출입 정보(비번·열쇠)</p>
          <textarea className={inputCls + " resize-y"} rows={2} value={form.accessInfo} onChange={(e) => set("accessInfo")(e.target.value)} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">비고(현장직 참고사항)</p>
          <input className={inputCls} value={form.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
        <p className="text-[11px] text-slate-400">호기(승강기 정보)는 등록 후 상세화면에서 추가하면 됩니다.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">취소</button>
          <button
            disabled={!form.name.trim()}
            onClick={() => onSave(form)}
            className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5"
          >
            추가
          </button>
        </div>
      </div>
    </Modal>
  );
}

// 계약종료 — 언제·무슨 근거로·왜 종료했는지 남긴다 (soft delete와 함께 기록).
function TerminationModal({ site, onClose, onConfirm }) {
  const [date, setDate] = useState(TODAY_STR);
  const [basis, setBasis] = useState(TERMINATION_BASIS[0]);
  const [reason, setReason] = useState("");

  return (
    <Modal title={`${site.name} 계약종료`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">종료일자</p>
          <DateTextInput value={date} onChange={setDate} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">근거</p>
          <select className={inputCls} value={basis} onChange={(e) => setBasis(e.target.value)}>
            {TERMINATION_BASIS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">종료사유</p>
          <textarea className={inputCls} rows={3} placeholder="예: 건물 리모델링으로 인한 계약 해지" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">취소</button>
          <button
            onClick={() => onConfirm({ date, basis, reason: reason.trim() })}
            className="text-sm font-bold text-white bg-red-600 rounded-xl px-4 py-2.5"
          >
            계약종료 확정
          </button>
        </div>
      </div>
    </Modal>
  );
}

// units 배열로 sites 옛 컬럼 동기화 값 계산
function legacySiteFields(siteUnits) {
  const act = siteUnits.filter((u) => u.isActive !== false).sort((a, b) => a.seq - b.seq);
  const maxSeq = act.length ? act[act.length - 1].seq : 0;
  const govArr = Array.from({ length: maxSeq }, (_, i) => act.find((u) => u.seq === i + 1)?.govNo || null);
  const fields = { unit_count: act.length, gov_elevator_nos: govArr, elevator_model: act[0]?.model || null };
  // 호기별 보수료(마이그레이션 101 완료 후)가 있으면 그 합계를 현장 보수료로 동기화한다 —
  // 앞으로는 호기별 값이 원본이고 현장 보수료는 파생값이라, 여기서 항상 최신 합계로 맞춘다.
  if (act.some((u) => u.maintenanceCost !== undefined)) {
    fields.maintenance_cost = act.reduce((sum, u) => sum + (Number(u.maintenanceCost) || 0), 0);
  }
  return fields;
}

// 호기 상세정보 — 승강기정보(국가승강기정보센터 연동)/고장내역/검사내역/부품교체내역/견적내역
function UnitDetailModal({ unit, site, failures, inspections, billings, quoteRequests, unitPartPhotos, onAddPartPhoto, onRemovePartPhoto, onClose, onSave }) {
  const [tab, setTab] = useState("정보");
  const [failTarget, setFailTarget] = useState(null);
  // 정보 탭 — 건물명·호기 빼고는 여기서 직접 수정한다(승강기고유번호·설치일자는 표에서
  // 뺐으므로 여기가 유일한 수정 경로). 국가승강기정보센터 실시간 데이터가 있는 항목도
  // 자체 데이터가 우선 — 엑셀 일괄등록으로 들어온 값을 사람이 여기서 손볼 수 있어야 한다.
  const [editForm, setEditForm] = useState({
    installPlace: unit.installPlace ?? "", govNo: unit.govNo ?? "", kind: unit.kind ?? "", form: unit.form ?? "", model: unit.model ?? "",
    manufacturer: unit.manufacturer ?? "", installDate: unit.installDate ?? "", runSection: unit.runSection ?? "",
    loadKg: unit.loadKg ?? "", capacityPersons: unit.capacityPersons ?? "", ratedSpeed: unit.ratedSpeed ?? "",
    insurer: unit.insurer ?? "", insuranceEnd: unit.insuranceEnd ?? "", requiresSelfCheck: unit.requiresSelfCheck ?? true,
  });
  const [savingDetail, setSavingDetail] = useState(false);
  const detailKeys = ["installPlace", "govNo", "kind", "form", "model", "manufacturer", "installDate", "runSection", "loadKg", "capacityPersons", "ratedSpeed", "insurer", "insuranceEnd", "requiresSelfCheck"];
  const detailDirty = detailKeys.some((k) => String(editForm[k] ?? "") !== String(unit[k] ?? ""));
  // units.gov_no가 아직 안 채워진 호기가 있다(마이그레이션 진행 중) — 그런 경우
  // 모바일 앱과 동일하게 sites의 옛 컬럼(gov_elevator_nos)에서 찾아 폴백한다.
  // 편집·저장은 아니라 조회 전용이라 v2 네이티브 원칙과 충돌하지 않는다.
  const unitGovNo = unit.govNo || site.govElevatorNos?.[(unit.seq ?? 1) - 1] || null;
  const liveInspections = useLiveInspections(
    unitGovNo ? [{ key: unit.id, siteId: site.id, siteName: site.name, govElevatorNo: unitGovNo }] : []
  );
  const liveInfo = liveInspections[0];
  // 검사내역 탭: 최신 상태 1건이 아니라 과거 전체 검사결과(합격·조건부합격·불합격)를 나열한다
  // (모바일 앱 SiteTab "검사" 탭과 동일 — 목록은 즉시 받고, 부적합상세는 클릭 시 지연 조회+캐시).
  const { history: inspectionHistory, loading: historyLoading } = useInspectionHistory(unitGovNo);
  const unitFailures = failures
    .filter((f) => (f.unitId ? f.unitId === unit.id : f.siteId === site.id))
    .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));
  const manualInspections = inspections.filter((i) => (i.unitId ? i.unitId === unit.id : i.siteId === site.id));
  // 여러 호기를 한 번에 청구한 건은 unitId가 대표 호기 하나만 가리켜서 unitId만으로 거르면
  // 나머지 호기 페이지에서 그 청구가 통째로 안 보인다 — elevatorNos에 이 호기가 있으면 포함.
  const unitBillings = billings.filter((b) =>
    b.elevatorNos?.length ? b.elevatorNos.includes(unit.unitNo) : b.unitId ? b.unitId === unit.id : b.siteName === site.name
  );

  // 고장내역/부품교체내역과 동일한 컨벤션: unit_id가 있으면 그 호기만, 없으면(관리자가 호기를
  // 안 정한 경우 등) 현장 전체로 fallback.
  const unitQuotes = quoteRequests
    .filter((q) => (q.unitId ? q.unitId === unit.id : q.siteId === site.id))
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));
  const unitPhotos = unitPartPhotos.filter((p) => p.unitId === unit.id);

  return (
    <Modal title={`${site.name} · ${unit.unitNo} 상세정보`} onClose={onClose} wide="xl">
      <div className="flex gap-1 mb-4 border-b border-slate-100 shrink-0">
        {["정보", "고장내역", "검사내역", "부품교체내역", "견적내역", "부품현황"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-xs font-bold ${tab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* 탭마다 팝업 크기가 달라지지 않도록 고정 높이로 통일 — 부품현황은 좌우 2단이라
          바깥은 넘침을 감추고 안쪽 두 단이 각자 스크롤한다. */}
      <div className={tab === "부품현황" ? "h-[26rem] overflow-hidden" : "h-[26rem] overflow-y-auto"}>
        {tab === "정보" && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-b border-slate-50 pb-2">
              <span className="text-slate-400">건물명</span>
              <span className="font-semibold text-slate-800">{site.name}</span>
            </div>
            <div className="flex justify-between border-b border-slate-50 pb-2">
              <span className="text-slate-400">호기</span>
              <span className="font-semibold text-slate-800">{unit.unitNo}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 gap-3">
              {/* 설치장소 — 호기 번호와 별개인 실제 위치(예: 합참본부-1, 별관-3, 교회) */}
              <span className="text-slate-400 shrink-0">설치장소</span>
              <input className={inputCls + " text-right"} value={editForm.installPlace} placeholder="예: 합참본부-1" onChange={(e) => setEditForm({ ...editForm, installPlace: e.target.value })} />
            </div>
            {[
              ["승강기번호", "govNo"], ["승강기종류", "kind"], ["승강기형식", "form"],
              ["승강기모델", "model"], ["제조업체", "manufacturer"], ["운행구간", "runSection"],
            ].map(([label, key]) => (
              <div key={key} className="flex items-center justify-between border-b border-slate-50 pb-2 gap-3">
                <span className="text-slate-400 shrink-0">{label}</span>
                <input className={inputCls + " text-right"} value={editForm[key]} onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />
              </div>
            ))}
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 gap-3">
              <span className="text-slate-400 shrink-0">설치일자</span>
              <DateTextInput key={editForm.installDate} value={editForm.installDate} onChange={(v) => setEditForm({ ...editForm, installDate: v })} />
            </div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 gap-3">
              <span className="text-slate-400 shrink-0">적재하중(kg)</span>
              <input className={inputCls + " text-right"} type="number" value={editForm.loadKg} onChange={(e) => setEditForm({ ...editForm, loadKg: e.target.value })} />
            </div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 gap-3">
              <span className="text-slate-400 shrink-0">정원(인승)</span>
              <input className={inputCls + " text-right"} type="number" value={editForm.capacityPersons} onChange={(e) => setEditForm({ ...editForm, capacityPersons: e.target.value })} />
            </div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 gap-3">
              <span className="text-slate-400 shrink-0">정격속도(m/s)</span>
              <input className={inputCls + " text-right"} type="number" step="0.01" value={editForm.ratedSpeed} onChange={(e) => setEditForm({ ...editForm, ratedSpeed: e.target.value })} />
            </div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 gap-3">
              <span className="text-slate-400 shrink-0">보험사</span>
              <input className={inputCls + " text-right"} value={editForm.insurer} onChange={(e) => setEditForm({ ...editForm, insurer: e.target.value })} />
            </div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 gap-3">
              <span className="text-slate-400 shrink-0">보험 만기일</span>
              <DateTextInput key={editForm.insuranceEnd} value={editForm.insuranceEnd} onChange={(v) => setEditForm({ ...editForm, insuranceEnd: v })} />
            </div>
            {/* 호이스트·주차기·턴테이블처럼 승강기 계약에 같이 딸려오지만 법정 승강기가
                아닌 설비는 꺼서 매달 자체점검 출석부에 안 뜨게 한다(종류는 위 "승강기종류"
                칸에 그냥 입력). */}
            <label className="flex items-center justify-between border-b border-slate-50 pb-2 gap-3 cursor-pointer">
              <span className="text-slate-400 shrink-0">자체점검 대상</span>
              <input
                type="checkbox"
                checked={editForm.requiresSelfCheck}
                onChange={(e) => setEditForm({ ...editForm, requiresSelfCheck: e.target.checked })}
                className="w-4 h-4"
              />
            </label>
            <div className="flex justify-end pt-1">
              <button
                disabled={!detailDirty || savingDetail}
                onClick={async () => { setSavingDetail(true); await onSave(unit, editForm); setSavingDetail(false); }}
                className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-lg px-4 py-2"
              >
                저장
              </button>
            </div>
            {liveInfo && <p className="text-[10px] text-slate-400 pt-2">* 국가승강기정보센터 실시간 데이터(승강기번호 {liveInfo.govElevatorNo})는 참고용 — 실제 값은 위 항목에 직접 입력합니다.</p>}
          </div>
        )}

        {tab === "고장내역" && (
          unitFailures.length === 0 ? <p className="text-xs text-slate-400 text-center py-10">등록된 고장 이력이 없습니다</p> : (
            <div className="space-y-2">
              {unitFailures.map((f) => (
                <div key={f.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-sm">{f.errorCode}</p>
                    <StatusBadge tone={f.status === "완료" ? "green" : f.status === "진행중" ? "amber" : "red"}>
                      {f.escalation ? `${f.status}·${f.escalation}` : f.status}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-slate-500">{f.reportedAt} 접수 · {f.assignee ?? "미배정"}</p>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "검사내역" && (
          unitGovNo ? (
            historyLoading ? (
              <p className="text-xs text-slate-400 text-center py-10">국가승강기정보센터에서 검사이력을 조회하는 중...</p>
            ) : inspectionHistory.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">등록된 검사 이력이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {inspectionHistory.map((h, hi) => {
                  const resultCode = mapGovResultToCode(h.record.dispWords);
                  const clickable = resultCode === "conditional" || resultCode === "fail";
                  const inspDate = govDateToDashed(h.record.inspctDe);
                  return (
                    <div
                      key={hi}
                      onClick={clickable ? () => setFailTarget({
                        inspection: { siteName: site.name, elevatorNo: unit.unitNo, result: resultCode, govElevatorNo: unitGovNo },
                        preloaded: h,
                      }) : undefined}
                      className={`border border-slate-200 rounded-lg p-3 ${clickable ? "cursor-pointer hover:bg-slate-50" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-bold text-sm">{h.record.inspctKindNm ? `${h.record.inspctKindNm}검사` : "정기검사"}</p>
                        {resultCode ? <Badge result={resultCode} /> : <StatusBadge tone="slate">{h.record.dispWords ?? "-"}</StatusBadge>}
                      </div>
                      <p className="text-xs text-slate-500">{h.record.inspctInsttNm ?? "-"} · 검사일 {inspDate ? shortDate(inspDate) : "-"}</p>
                      {clickable && <p className="text-[10px] text-blue-600 font-semibold mt-1">클릭해서 부적합 상세 항목 보기</p>}
                    </div>
                  );
                })}
              </div>
            )
          ) : manualInspections.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">등록된 검사 이력이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {manualInspections.map((i) => (
                <div key={i.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-sm">{i.type}</p>
                    {i.result ? <Badge result={i.result} /> : <StatusBadge tone="slate">예정</StatusBadge>}
                  </div>
                  <p className="text-xs text-slate-500">{i.org} · 기한 {shortDate(i.dueDate)}</p>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "부품교체내역" && (
          unitBillings.length === 0 ? <p className="text-xs text-slate-400 text-center py-10">등록된 부품교체 내역이 없습니다</p> : (
            <div className="space-y-2">
              {unitBillings.map((b) => {
                const photos = [...(b.beforePhotoUrls ?? []), ...(b.afterPhotoUrls ?? [])];
                return (
                  <div key={b.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-bold text-sm whitespace-pre-line">{b.part}</p>
                      <span className="text-sm font-bold shrink-0">{b.cost ? Number(b.cost).toLocaleString() + "원" : "-"}</span>
                    </div>
                    <p className="text-xs text-slate-500">{shortDate(b.replaceDate)} · {b.engineer ?? "-"}</p>
                    {photos.length > 0 && (
                      <div className="flex gap-1.5 mt-2 overflow-x-auto">
                        {photos.map((url, i) => (
                          <img key={i} src={url} alt="" className="w-14 h-14 rounded object-cover border border-slate-200 shrink-0" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === "견적내역" && (
          unitQuotes.length === 0 ? <p className="text-xs text-slate-400 text-center py-10">등록된 견적 내역이 없습니다</p> : (
            <div className="space-y-2">
              {unitQuotes.map((q) => {
                const displayStatus = q.status === "자재지급완료" ? "교체완료" : q.status;
                const tone = displayStatus === "교체완료" ? "indigo"
                  : (displayStatus === "승인" || displayStatus === "작성") ? "amber"
                  : displayStatus === "요청접수" ? "blue" : "slate";
                return (
                  <div key={q.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-sm">{q.quoteTitle || q.constructionType || "견적"}</p>
                      <StatusBadge tone={tone}>{displayStatus}</StatusBadge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {shortDate(q.quoteIssuedDate || q.requestedDate)}
                      {sentHistory(q).length > 0 && ` · ${sentHistory(q)[0]}`}
                    </p>
                    {q.quotePdfUrl && (
                      <a href={q.quotePdfUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 font-semibold mt-1 inline-block">
                        PDF 보기
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === "부품현황" && (
          <PartsStatusTab unitId={unit.id} photos={unitPhotos} onAdd={onAddPartPhoto} onRemove={onRemovePartPhoto} />
        )}
      </div>

      {failTarget && (
        <InspectionFailDetailSheet
          inspection={failTarget.inspection}
          preloaded={failTarget.preloaded}
          onClose={() => setFailTarget(null)}
          Container={Modal}
        />
      )}
    </Modal>
  );
}

function UnitRow({ unit, emergencyPhone, maintenanceCostReady, onSave, onSaveEmergencyPhone, onToggleActive, onDelete, onOpenDetail, contractTypeReady }) {
  // 승강기고유번호·설치일자·설치장소는 여기서 안 다룬다 — 호기 상세정보(onOpenDetail)의
  // "정보" 탭에서 수정한다. 표는 목록으로 훑어볼 항목만, 상세는 상세정보에서.
  const [form, setForm] = useState({ model: unit.model ?? "", contractType: unit.contractType ?? CONTRACT_TYPES[0], maintenanceCost: unit.maintenanceCost ?? "" });
  const [emergencyDraft, setEmergencyDraft] = useState(emergencyPhone ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = form.model !== (unit.model ?? "") || form.contractType !== (unit.contractType ?? CONTRACT_TYPES[0]) || String(form.maintenanceCost) !== String(unit.maintenanceCost ?? "");
  const emergencyDirty = emergencyDraft !== (emergencyPhone ?? "");

  return (
    <tr className={`border-b border-slate-50 ${unit.isActive === false ? "opacity-40" : ""}`}>
      <td className="px-4 py-2 font-bold whitespace-nowrap">
        <button onClick={() => onOpenDetail(unit)} className="text-blue-700 hover:underline">{unit.unitNo}</button>
      </td>
      <td className="px-2 py-2 text-slate-600 truncate" title={unit.kind ?? ""}>{unit.kind || "-"}</td>
      <td className="px-2 py-2"><input className={inputCls} value={form.model} placeholder="모델명" onChange={(e) => setForm({ ...form, model: e.target.value })} /></td>
      <td className="px-2 py-2">
        {/* 호기별 계약구분 — 한 현장 안에서 FM/POG가 섞인 예외 케이스 대응. 기본값 POG(일반계약). */}
        <select className={inputCls} disabled={!contractTypeReady} value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
          {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </td>
      {/* 호기별 보수료 — 이 합계가 현장정보의 보수료(VAT별도)로 동기화된다(syncLegacy). */}
      <td className="px-2 py-2"><input className={inputCls} type="number" placeholder="원" disabled={!maintenanceCostReady} value={form.maintenanceCost} onChange={(e) => setForm({ ...form, maintenanceCost: e.target.value })} /></td>
      <td className="px-2 py-2"><input className={inputCls} value={emergencyDraft} placeholder="비상통화장치" onChange={(e) => setEmergencyDraft(e.target.value)} /></td>
      <td className="px-2 py-2 whitespace-nowrap text-right">
        <button
          disabled={(!dirty && !emergencyDirty) || saving}
          onClick={async () => {
            setSaving(true);
            if (dirty) await onSave(unit, form);
            if (emergencyDirty) await onSaveEmergencyPhone(emergencyDraft);
            setSaving(false);
          }}
          className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-3 py-1.5 mr-1"
        >
          저장
        </button>
        <button onClick={() => onToggleActive(unit)} className="text-xs font-bold text-slate-400 border border-slate-200 rounded-lg px-2 py-1.5 mr-1">
          {unit.isActive === false ? "복구" : "비활성"}
        </button>
        <button onClick={() => onDelete(unit)} className="text-xs font-bold text-red-500 border border-red-100 rounded-lg px-2 py-1.5">
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

// 현장 담당자(관리소장·건물주 등) 한 명 — 인라인 편집 행
function ContactRow({ c, onSave, onDelete, onSetPrimary, isDefault }) {
  const [form, setForm] = useState({ name: c.name ?? "", phone: c.phone ?? "", email: c.email ?? "", fax: c.fax ?? "", role: c.role ?? CONTACT_ROLES[0] });
  const dirty = ["name", "phone", "email", "fax", "role"].some((k) => form[k] !== (c[k] ?? (k === "role" ? CONTACT_ROLES[0] : "")));
  return (
    <tr className="border-b border-slate-50">
      <td className="pl-4 py-2 w-8 text-center">
        {/* 대표로 지정된 담당자가 없으면 맨 위(첫 번째) 담당자를 기본값으로 별표 표시 */}
        <button title="대표 담당자로 지정" onClick={() => onSetPrimary(c)} className={c.isPrimary || isDefault ? "text-amber-500" : "text-slate-200 hover:text-slate-400"}>★</button>
      </td>
      <td className="px-2 py-2">
        <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {CONTACT_ROLES.map((r) => <option key={r}>{r}</option>)}
          {!CONTACT_ROLES.includes(form.role) && <option>{form.role}</option>}
        </select>
      </td>
      <td className="px-2 py-2"><input className={inputCls} placeholder="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></td>
      <td className="px-2 py-2"><input className={inputCls} placeholder="전화번호" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} /></td>
      <td className="px-2 py-2"><input className={inputCls} placeholder="이메일" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></td>
      <td className="px-2 py-2"><input className={inputCls} placeholder="팩스" value={form.fax} onChange={(e) => setForm({ ...form, fax: formatPhone(e.target.value) })} /></td>
      <td className="px-2 py-2 whitespace-nowrap text-right pr-3">
        <button disabled={!dirty} onClick={() => onSave(c, form)} className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-3 py-1.5 mr-1">저장</button>
        <button onClick={() => onDelete(c)} className="text-xs font-bold text-red-400 border border-red-100 rounded-lg px-2 py-1.5">삭제</button>
      </td>
    </tr>
  );
}

export default function SitesAdmin({ data, setData }) {
  const { sites, units, profiles, failures, inspections, billings, siteManagers, quoteRequests, unitPartPhotos } = data;
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [siteForm, setSiteForm] = useState(null); // 선택 현장 기본정보 편집값
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingContacts, setEditingContacts] = useState(false);
  const [editingUnits, setEditingUnits] = useState(false);
  const [importing, setImporting] = useState(false); // 공단 엑셀 일괄 등록
  const [addingSite, setAddingSite] = useState(false); // 현장 단건 추가
  const [verifying, setVerifying] = useState(false); // 정리 안 된 내부 엑셀 검증(DB 반영 없음)
  const [emgOpen, setEmgOpen] = useState(false);     // 비상통화장치 번호 일괄 업로드
  const [unitDetail, setUnitDetail] = useState(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [bizRegOpen, setBizRegOpen] = useState(false);
  const [terminating, setTerminating] = useState(false);

  const site = sites.find((s) => s.id === selectedId);
  const siteUnits = units.filter((u) => u.siteId === selectedId).sort((a, b) => a.seq - b.seq);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [assignMode, setAssignMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [bulkEngineer, setBulkEngineer] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  // 계약 만료 판정: 종료일 30일 내(임박) / 지남(만료). 종료일 미입력 현장은 대상 아님.
  const in30 = (d) => d && d >= TODAY_STR && d <= addDays(TODAY_STR, 30);
  const isExpired = (d) => d && d < TODAY_STR;
  const dday = (d) => Math.ceil((new Date(d) - new Date(TODAY_STR)) / 86400000);
  const expiringSites = sites.filter((s) => s.isActive !== false && (in30(s.contractEnd) || isExpired(s.contractEnd)));
  const endedSites = sites.filter((s) => s.isActive === false);
  const [contractFilter, setContractFilter] = useState("all"); // all | expiring | ended

  const filtered = sites
    .filter((s) => siteMatchesQuery(s, search, { units, siteManagers }))
    .filter((s) => !onlyUnassigned || !s.assignedEngineers?.length)
    .filter((s) =>
      contractFilter === "ended" ? s.isActive === false :
      contractFilter === "expiring" ? s.isActive !== false && (in30(s.contractEnd) || isExpired(s.contractEnd)) :
      // "전체" 목록에선 계약종료 현장을 기본으로 숨긴다 — 검색어를 입력했을 때만 매칭되면 보이게(종료 계약 탭은 그대로 전용 진입점).
      search.trim() ? true : s.isActive !== false);
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 담당기사 배정을 할 수 있어야 한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false); // 제외된 기사는 담당기사 배정 목록에서 뺀다
  // contract_date/maintenance_cost 컬럼은 각 마이그레이션 실행 전엔 존재하지 않는다 — undefined면 아직 미실행으로 간주.
  const contractDateReady = sites.some((s) => s.contractDate !== undefined);
  const maintenanceCostReady = sites.some((s) => s.maintenanceCost !== undefined);
  const officeNotesReady = sites.some((s) => s.officeNotes !== undefined);
  const unitContractTypeReady = units.some((u) => u.contractType !== undefined);
  const unitMaintenanceCostReady = units.some((u) => u.maintenanceCost !== undefined);

  const contacts = siteManagers.filter((m) => m.siteId === selectedId);

  const [renew, setRenew] = useState(null); // 재계약 폼 {start, end} (null=닫힘)

  function select(s) {
    setSelectedId(s.id);
    setEditingInfo(false);
    setEditingContacts(false);
    setEditingUnits(false);
    setRenew(null);
    setSiteForm({
      name: s.name, address: s.address ?? "",
      notes: s.notes ?? "", officeNotes: s.officeNotes ?? "",
      assignedEngineers: s.assignedEngineers ?? [], leadEngineer: s.assignedEngineer ?? "",
      phone: s.phone ?? "", fax: s.fax ?? "", email: s.email ?? "", accessInfo: s.accessInfo ?? "",
      contractDate: s.contractDate ?? "", contractEnd: s.contractEnd ?? "",
    });
  }

  // 현장 단건 추가 — 현장정보 수정 화면과 동일한 칸을 전부 이 시점에 받아 저장한다.
  // 담당 기사를 고르면 site_assignments도 같이 채운다 (changeAssignees와 동일한 듀얼라이트 이유).
  async function addSite(form) {
    const id = `site-${Date.now()}`;
    const { error } = await supabase.from("sites").insert({
      id, name: form.name, address: form.address || null, contract_type: form.contractType,
      maintenance_cost: form.maintenanceCost === "" ? null : Number(form.maintenanceCost),
      contract_date: form.contractDate || null, contract_end: form.contractEnd || null,
      assigned_engineer: form.leadEngineer || null,
      phone: form.phone || null, fax: form.fax || null, email: form.email || null, notes: form.notes || null,
      access_info: form.accessInfo || null,
    });
    if (error) { alert("현장 추가 실패: " + error.message); return; }
    if (form.assignedEngineers.length) {
      const rows = form.assignedEngineers
        .map((name) => engineers.find((x) => x.name === name))
        .filter(Boolean)
        .map((p) => ({ site_id: id, tech_id: p.id, is_lead: p.name === form.leadEngineer }));
      if (rows.length) await supabase.from("site_assignments").insert(rows);
    }
    const { data: created, error: fetchErr } = await supabase.from("sites").select("*").eq("id", id).single();
    if (fetchErr || !created) { alert("추가는 됐지만 불러오기 실패: " + (fetchErr?.message ?? "")); return; }
    // mapSite만으론 assignedEngineers가 안 채워진다(전체 로드 시 mergeAssignedEngineers가 하는 일) —
    // 방금 위에서 등록한 담당자 목록을 그대로 얹어서 "미배정"으로 잘못 보이는 걸 막는다.
    const mapped = { ...mapSite(created), assignedEngineers: form.assignedEngineers };
    setData((prev) => ({ ...prev, sites: [...prev.sites, mapped] }));
    setAddingSite(false);
    setSearch("");
    select(mapped);
    // 새 현장은 좌표가 없어 티맵·카카오맵 연동 아이콘이 안 뜬다 — 지오코딩 배치를 바로 한 번
    // 돌려서 이 현장(+밀린 다른 현장 몇 개)의 좌표를 채운다. 실패해도 조용히 넘어가고
    // (나중에 배치가 다시 돌면 채워짐), UI 흐름을 막지 않는다.
    authFetch("/api/geocode-sites?limit=5")
      .then(() => supabase.from("sites").select("lat, lng").eq("id", id).maybeSingle())
      .then(({ data: geo }) => {
        if (geo?.lat != null) {
          setData((prev) => ({ ...prev, sites: prev.sites.map((s) => (s.id === id ? { ...s, lat: geo.lat, lng: geo.lng } : s)) }));
        }
      })
      .catch(() => {});
  }

  // 재계약 확정 — 새 기간 저장 + 계약종료 상태였다면 복구
  async function renewContract() {
    const { error } = await supabase.from("sites")
      .update({ contract_date: renew.start || null, contract_end: renew.end || null, is_active: true })
      .eq("id", selectedId);
    if (error) { alert("재계약 저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => (s.id === selectedId ? { ...s, contractDate: renew.start, contractEnd: renew.end, isActive: true } : s)),
    }));
    setRenew(null);
    setSiteForm((f) => ({ ...f, contractDate: renew.start, contractEnd: renew.end }));
  }

  // 체크한 현장들에 담당 기사 일괄 배정 (site_assignments + 옛 컬럼 듀얼라이트)
  async function bulkAssign() {
    const ids = [...checkedIds];
    const p = profiles.find((x) => x.name === bulkEngineer);
    if (!ids.length || !p) return;
    setBulkBusy(true);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      await supabase.from("site_assignments").delete().in("site_id", chunk);
      await supabase.from("site_assignments").insert(chunk.map((siteId) => ({ site_id: siteId, tech_id: p.id, is_lead: true })));
      await supabase.from("sites").update({ assigned_engineer: bulkEngineer }).in("id", chunk);
    }
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((x) => (checkedIds.has(x.id) ? { ...x, assignedEngineer: bulkEngineer, assignedEngineers: [bulkEngineer] } : x)),
    }));
    await syncInspectionTodoAssignee(ids, bulkEngineer);
    setBulkBusy(false);
    setCheckedIds(new Set());
    setAssignMode(false);
  }

  // ---- 저장 핸들러들 (units 우선 + sites 옛 컬럼 동기화) ----

  async function syncLegacy(siteId, nextUnits) {
    const legacy = legacySiteFields(nextUnits.filter((u) => u.siteId === siteId));
    await supabase.from("sites").update(legacy).eq("id", siteId);
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => s.id === siteId
        ? {
            ...s, unitCount: legacy.unit_count, govElevatorNos: legacy.gov_elevator_nos, elevatorModel: legacy.elevator_model,
            ...(legacy.maintenance_cost !== undefined ? { maintenanceCost: legacy.maintenance_cost } : {}),
          }
        : s),
    }));
  }

  // 승강기고유번호·설치일자는 표에서 안 다룬다(호기 상세정보 모달의 saveUnitDetail 전용) —
  // 여기서 같이 patch에 넣으면 표에서 저장할 때마다 상세정보에서 입력한 값을 지워버린다.
  async function saveUnit(unit, form) {
    const patch = {
      model: form.model || null,
      ...(unitContractTypeReady ? { contract_type: form.contractType || null } : {}),
      ...(unitMaintenanceCostReady ? { maintenance_cost: form.maintenanceCost === "" ? null : Number(form.maintenanceCost) } : {}),
    };
    const { error } = await supabase.from("units").update(patch).eq("id", unit.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    const nextUnits = units.map((u) => (u.id === unit.id ? {
      ...u, model: form.model || null,
      ...(unitContractTypeReady ? { contractType: form.contractType || null } : {}),
      ...(unitMaintenanceCostReady ? { maintenanceCost: form.maintenanceCost === "" ? null : Number(form.maintenanceCost) } : {}),
    } : u));
    setData((prev) => ({ ...prev, units: nextUnits }));
    await syncLegacy(unit.siteId, nextUnits); // 호기별 보수료 합계를 현장정보 보수료로 동기화
  }

  // 호기 상세정보 모달의 "정보" 탭 저장 — 표(UnitRow)와는 별개 필드 집합(승강기번호·종류·형식·
  // 제조업체·설치일자·운행구간·적재하중·정원·정격속도·보험)이라 saveUnit과 분리해서 관리한다.
  // 바뀐 필드만 patch에 넣는다 — 특히 gov_no는 유니크 제약이라, 안 건드린 항목까지
  // 매번 통째로 재저장하면(예전 방식) 다른 호기와 겹치는 기존 값 때문에 무관한 필드
  // 하나만 고쳐도 "duplicate key" 에러로 저장 자체가 막히는 문제가 있었다.
  async function saveUnitDetail(unit, form) {
    const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
    const fieldMap = {
      installPlace: ["install_place", form.installPlace?.trim() || null, unit.installPlace ?? null],
      // 숫자만 남긴다(엑셀 일괄등록 ImportSites.jsx와 동일한 정제) — 정부 API 국가승강기정보센터
      // 조회가 정확히 일치하는 문자열만 인정해서, 복붙 과정에서 섞여 들어간 탭·공백 하나만 있어도
      // 검사이력 조회가 조용히 0건으로 실패한다(남영빌딩 1호기에서 실측 확인).
      govNo: ["gov_no", form.govNo?.replace(/\D/g, "") || null, unit.govNo ?? null],
      kind: ["kind", form.kind || null, unit.kind ?? null],
      form: ["form", form.form || null, unit.form ?? null],
      model: ["model", form.model || null, unit.model ?? null],
      manufacturer: ["manufacturer", form.manufacturer || null, unit.manufacturer ?? null],
      installDate: ["install_date", form.installDate || null, unit.installDate ?? null],
      runSection: ["run_section", form.runSection || null, unit.runSection ?? null],
      loadKg: ["load_kg", numOrNull(form.loadKg), unit.loadKg ?? null],
      capacityPersons: ["capacity_persons", numOrNull(form.capacityPersons), unit.capacityPersons ?? null],
      ratedSpeed: ["rated_speed", numOrNull(form.ratedSpeed), unit.ratedSpeed ?? null],
      insurer: ["insurer", form.insurer || null, unit.insurer ?? null],
      insuranceEnd: ["insurance_end", form.insuranceEnd || null, unit.insuranceEnd ?? null],
      requiresSelfCheck: ["requires_self_check", form.requiresSelfCheck, unit.requiresSelfCheck ?? true],
    };
    const patch = {};
    const localPatch = {};
    for (const [key, [dbCol, next, current]] of Object.entries(fieldMap)) {
      if (String(next ?? "") !== String(current ?? "")) { patch[dbCol] = next; localPatch[key] = next; }
    }
    if (!Object.keys(patch).length) return;
    const { error } = await supabase.from("units").update(patch).eq("id", unit.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    // 자체점검 대상을 방금 껐으면, 다음 달 자동생성이 스킵되는 것만으론 "이번 순간부터
    // 반영"이 안 된다 — 이번 달 것이 이미 생성돼있을 수 있으니(매달 1일 자동생성) 그
    // 줄도 같이 지운다. 이미 완료·누락 처리된 줄(과거 기록)은 감사기록이라 안 건드리고,
    // 아직 '예정'인 것만 지운다.
    if ("requiresSelfCheck" in localPatch && localPatch.requiresSelfCheck === false) {
      const { error: delError } = await supabase.from("self_checks")
        .delete().eq("unit_id", unit.id).eq("ym", TODAY_STR.slice(0, 7)).eq("status", "예정");
      if (delError) console.error("이번 달 자체점검 항목 삭제 실패:", delError.message);
    }
    const nextUnits = units.map((u) => (u.id === unit.id ? { ...u, ...localPatch } : u));
    setData((prev) => ({ ...prev, units: nextUnits }));
    await syncLegacy(unit.siteId, nextUnits); // model·govNo가 legacy site 컬럼(elevator_model·gov_elevator_nos)에도 반영돼야 함
  }

  // 부품현황 탭 — 사진 1장 추가/삭제. 모바일 ElevatorFieldApp.jsx의
  // handleAddUnitPartPhoto/handleRemoveUnitPartPhoto와 같은 테이블(unit_part_photos)을
  // 쓰지만, 이 파일 관례대로 직접 supabase 호출 후 setData로 로컬 반영한다.
  async function addUnitPartPhoto({ unitId, category, subcategory, part, url }) {
    const { data: created, error } = await supabase
      .from("unit_part_photos")
      .insert({ unit_id: unitId, category, subcategory, part, url })
      .select().single();
    if (error) { alert("사진 저장 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, unitPartPhotos: [...prev.unitPartPhotos, mapUnitPartPhoto(created)] }));
  }

  async function removeUnitPartPhoto(photoId) {
    const { error } = await supabase.from("unit_part_photos").delete().eq("id", photoId);
    if (error) { alert("사진 삭제 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, unitPartPhotos: prev.unitPartPhotos.filter((p) => p.id !== photoId) }));
  }

  async function toggleUnitActive(unit) {
    const next = !(unit.isActive !== false);
    await supabase.from("units").update({ is_active: next }).eq("id", unit.id);
    const nextUnits = units.map((u) => (u.id === unit.id ? { ...u, isActive: next } : u));
    setData((prev) => ({ ...prev, units: nextUnits }));
    await syncLegacy(unit.siteId, nextUnits);
  }

  async function deleteUnit(unit) {
    if (!(await confirmAsync(`"${unit.unitNo}"를 완전히 삭제할까요? 연결된 고장·검사·청구 이력은 남아있지만 호기 정보와의 연결은 사라집니다.`))) return;
    const { error } = await supabase.from("units").delete().eq("id", unit.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    const nextUnits = units.filter((u) => u.id !== unit.id);
    setData((prev) => ({ ...prev, units: nextUnits }));
    await syncLegacy(unit.siteId, nextUnits);
  }

  async function addUnit() {
    const seq = siteUnits.length ? Math.max(...siteUnits.map((u) => u.seq)) + 1 : 1;
    const { data: created, error } = await supabase
      .from("units")
      .insert({ site_id: selectedId, seq, unit_no: `${seq}호기` })
      .select().single();
    if (error) { alert("호기 추가 실패: " + error.message); return; }
    const nextUnits = [...units, mapUnit(created)];
    setData((prev) => ({ ...prev, units: nextUnits }));
    await syncLegacy(selectedId, nextUnits);
    // 자체점검 출석부는 매월 1일에만 자동 생성돼서, 그 이후 추가한 호기는 다음 달까지
    // 자체점검현황에 안 잡힌다 — 새 호기를 만드는 김에 이번 달 줄도 바로 만들어준다.
    const lead = profiles.find((p) => p.name === site?.assignedEngineer);
    await supabase.from("self_checks").insert({
      unit_id: created.id, ym: TODAY_STR.slice(0, 7), assignee_id: lead?.id ?? null,
    });
  }

  async function saveSiteInfo() {
    const namesChanged = JSON.stringify([...siteForm.assignedEngineers].sort()) !== JSON.stringify([...(site.assignedEngineers ?? [])].sort());
    const leadChanged = siteForm.leadEngineer !== (site.assignedEngineer ?? "");
    if (namesChanged || leadChanged) {
      await changeAssignees(siteForm.assignedEngineers, siteForm.leadEngineer);
    }
    await supabase.from("sites").update({
      name: siteForm.name, address: siteForm.address, notes: siteForm.notes || null,
      phone: siteForm.phone || null, fax: siteForm.fax || null, email: siteForm.email || null,
      access_info: siteForm.accessInfo || null,
      ...(contractDateReady ? { contract_date: siteForm.contractDate || null } : {}),
      contract_end: siteForm.contractEnd || null,
      ...(officeNotesReady ? { office_notes: siteForm.officeNotes || null } : {}),
    }).eq("id", selectedId);
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => (s.id === selectedId ? { ...s, ...siteForm, assignedEngineers: siteForm.assignedEngineers, assignedEngineer: siteForm.leadEngineer } : s)),
    }));
    setEditingInfo(false);
  }

  function cancelEditInfo() {
    select(site);
  }

  // EMCALL,통신사,국선/무선 — 승강기 정보 표에서 편집한다(호기 공통 값, 사이트 단위 저장).
  async function saveEmergencyPhone(value) {
    await supabase.from("sites").update({ emergency_phone: value || null }).eq("id", selectedId);
    setData((prev) => ({ ...prev, sites: prev.sites.map((s) => (s.id === selectedId ? { ...s, emergencyPhone: value || null } : s)) }));
  }

  // 담당 기사 배열 전체를 다시 쓴다 — site_assignments를 지우고 배열 수만큼 재삽입.
  // is_lead는 leadName과 일치하는 것만 true. sites.assigned_engineer(레거시)는 대표 이름으로 듀얼라이트.
  async function changeAssignees(names, leadName) {
    await supabase.from("site_assignments").delete().eq("site_id", selectedId);
    const rows = names
      .map((name) => profiles.find((x) => x.name === name))
      .filter(Boolean)
      .map((p) => ({ site_id: selectedId, tech_id: p.id, is_lead: p.name === leadName }));
    if (rows.length) await supabase.from("site_assignments").insert(rows);
    await supabase.from("sites").update({ assigned_engineer: leadName || null }).eq("id", selectedId); // 듀얼라이트
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => (s.id === selectedId ? { ...s, assignedEngineers: names, assignedEngineer: leadName || null } : s)),
    }));
    await syncInspectionTodoAssignee([selectedId], leadName);
  }

  // 정기검사 보완조치 할일(source: inspection) 중 아직 안 끝난 건은 현장 담당자가 바뀌면 담당자도 같이 바꿔준다.
  // (자재/견적/수동 할일은 손대지 않는다 — 검사 보완조치만 현장 담당자와 자동으로 맞춰두는 규칙.)
  async function syncInspectionTodoAssignee(siteIds, engineerName) {
    const unitIds = units.filter((u) => siteIds.includes(u.siteId)).map((u) => u.id);
    if (!unitIds.length) return;
    const p = profiles.find((x) => x.name === engineerName);
    const patch = { assignee: engineerName || null, assignee_id: p?.id ?? null };
    const { error } = await supabase.from("todos").update(patch).in("unit_id", unitIds).eq("source", "inspection").eq("done", false);
    if (error) return;
    setData((prev) => ({
      ...prev,
      todos: prev.todos.map((t) =>
        t.source === "inspection" && !t.done && unitIds.includes(t.unitId) ? { ...t, assignee: patch.assignee, assigneeId: patch.assignee_id } : t
      ),
    }));
  }

  // ---- 현장 담당자(연락처부) ----

  async function addContact() {
    const row = { id: "sm-" + Date.now(), site_id: selectedId, name: "", phone: "", role: CONTACT_ROLES[0], is_primary: contacts.length === 0 };
    const { data: created, error } = await supabase.from("site_managers").insert(row).select().single();
    if (error) { alert("추가 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, siteManagers: [...prev.siteManagers, { id: created.id, siteId: selectedId, name: "", phone: "", email: "", fax: "", role: created.role, isPrimary: created.is_primary }] }));
  }

  async function saveContact(c, form) {
    await supabase.from("site_managers").update({
      name: form.name, phone: form.phone || null, email: form.email || null, fax: form.fax || null, role: form.role,
    }).eq("id", c.id);
    setData((prev) => ({ ...prev, siteManagers: prev.siteManagers.map((m) => (m.id === c.id ? { ...m, ...form } : m)) }));
  }

  async function deleteContact(c) {
    if (!(await confirmAsync(`담당자 "${c.name || "(이름 없음)"}"를 삭제할까요?`))) return;
    await supabase.from("site_managers").delete().eq("id", c.id);
    setData((prev) => ({ ...prev, siteManagers: prev.siteManagers.filter((m) => m.id !== c.id) }));
  }

  async function setPrimary(c) {
    await supabase.from("site_managers").update({ is_primary: false }).eq("site_id", c.siteId);
    await supabase.from("site_managers").update({ is_primary: true }).eq("id", c.id);
    setData((prev) => ({ ...prev, siteManagers: prev.siteManagers.map((m) => (m.siteId === c.siteId ? { ...m, isPrimary: m.id === c.id } : m)) }));
  }

  // 계약종료/복구 (soft delete — 설계 원칙 4). 종료는 일자·근거·사유를 받아야 해서 모달을 연다.
  // 종료일자를 미래로 잡으면 지금 당장은 활성 상태를 유지하고, 그 날짜가 되면
  // check-terminations 크론(매일 KST 00:10)이 자동으로 비활성화한다.
  const pendingTermination = site?.isActive !== false && site?.terminatedDate && site.terminatedDate > TODAY_STR;

  async function toggleSiteActive() {
    if (site.isActive === false) {
      await supabase.from("sites").update({
        is_active: true, terminated_date: null, termination_basis: null, termination_reason: null,
      }).eq("id", selectedId);
      setData((prev) => ({
        ...prev,
        sites: prev.sites.map((x) => (x.id === selectedId ? { ...x, isActive: true, terminatedDate: null, terminationBasis: null, terminationReason: null } : x)),
      }));
    } else if (pendingTermination) {
      await supabase.from("sites").update({
        terminated_date: null, termination_basis: null, termination_reason: null,
      }).eq("id", selectedId);
      setData((prev) => ({
        ...prev,
        sites: prev.sites.map((x) => (x.id === selectedId ? { ...x, terminatedDate: null, terminationBasis: null, terminationReason: null } : x)),
      }));
    } else {
      setTerminating(true);
    }
  }

  async function confirmTermination({ date, basis, reason }) {
    const effectiveNow = !date || date <= TODAY_STR;
    await supabase.from("sites").update({
      ...(effectiveNow ? { is_active: false } : {}),
      terminated_date: date || null, termination_basis: basis, termination_reason: reason || null,
    }).eq("id", selectedId);
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((x) => (x.id === selectedId ? {
        ...x,
        ...(effectiveNow ? { isActive: false } : {}),
        terminatedDate: date, terminationBasis: basis, terminationReason: reason,
      } : x)),
    }));
    setTerminating(false);
  }

  async function saveSiteContract(urls) {
    await supabase.from("sites").update({ contract_urls: urls }).eq("id", selectedId);
    setData((prev) => ({ ...prev, sites: prev.sites.map((x) => (x.id === selectedId ? { ...x, contractUrls: urls } : x)) }));
  }

  async function saveSiteBizReg(urls) {
    await supabase.from("sites").update({ business_reg_urls: urls }).eq("id", selectedId);
    setData((prev) => ({ ...prev, sites: prev.sites.map((x) => (x.id === selectedId ? { ...x, businessRegUrls: urls } : x)) }));
  }

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-extrabold">현장정보</h1>
          <p className="text-xs text-slate-500 mt-0.5">호기(승강기 1대) 단위로 모델·설치일·승강기고유번호를 관리합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAddingSite(true)}
            className="flex items-center gap-1.5 text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 whitespace-nowrap">
            <Plus size={15} /> 새 현장 추가
          </button>
          <button onClick={() => setVerifying(true)}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl px-4 py-2.5 whitespace-nowrap">
            <ShieldCheck size={15} /> 엑셀 검증 업로드
          </button>
          <button onClick={() => setEmgOpen(true)}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl px-4 py-2.5 whitespace-nowrap">
            <PhoneCall size={15} /> 비상통화 번호
          </button>
          <button onClick={() => setImporting(true)}
            className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
            <Plus size={15} /> 엑셀로 현장 일괄 등록
          </button>
        </div>
      </div>

      {addingSite && <AddSiteModal engineers={engineers} onClose={() => setAddingSite(false)} onSave={addSite} />}
      {importing && <ImportSites data={data} setData={setData} onClose={() => setImporting(false)} />}
      {verifying && <VerifyImport data={data} setData={setData} onClose={() => setVerifying(false)} />}
      {emgOpen && <ImportEmergencyPhones data={data} setData={setData} onClose={() => setEmgOpen(false)} />}

      {/* 계약 만료 알림 배너 */}
      {expiringSites.length > 0 && contractFilter !== "expiring" && (
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm font-bold text-amber-700 flex-1">
            ⚠️ 계약 만료 30일 내(만료 포함) 현장 {expiringSites.length}곳 — 재계약 협의가 필요합니다
          </p>
          <button onClick={() => setContractFilter("expiring")} className="text-xs font-bold text-white bg-amber-600 rounded-lg px-3 py-1.5 whitespace-nowrap">
            모아보기
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-7 gap-5 items-stretch">
        {/* 현장 목록 */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[28rem] xl:h-[calc(100vh-13rem)]">
          <div className="p-3 border-b border-slate-100 shrink-0 space-y-2">
            <input className={inputCls} placeholder="현장정보·현장담당자정보·승강기정보 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            {/* 계약 상태 필터 — 종료 계약 모아보기 */}
            <div className="flex gap-1.5">
              {[["all", `전체 (${sites.length})`], ["expiring", `만료임박 (${expiringSites.length})`], ["ended", `종료 계약 (${endedSites.length})`]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setContractFilter(v)}
                  className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 border ${contractFilter === v ? "bg-blue-700 text-white border-blue-700" : "text-slate-500 border-slate-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 cursor-pointer">
                <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} />
                미배정만 ({sites.filter((x) => !x.assignedEngineers?.length).length})
              </label>
              <button
                onClick={() => { setAssignMode(!assignMode); setCheckedIds(new Set()); }}
                className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 border ${assignMode ? "bg-blue-700 text-white border-blue-700" : "text-blue-700 border-blue-200"}`}
              >
                {assignMode ? "배정 모드 끄기" : "기사 일괄 배정"}
              </button>
            </div>
            {assignMode && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCheckedIds(checkedIds.size === filtered.length ? new Set() : new Set(filtered.map((x) => x.id)))}
                  className="text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 whitespace-nowrap"
                >
                  {checkedIds.size === filtered.length && filtered.length > 0 ? "전체 해제" : `목록 전체 (${filtered.length})`}
                </button>
                <select className={`${inputCls} flex-1`} value={bulkEngineer} onChange={(e) => setBulkEngineer(e.target.value)}>
                  <option value="">기사 선택</option>
                  {engineers.map((p) => <option key={p.id}>{p.name}</option>)}
                </select>
                <button
                  onClick={bulkAssign}
                  disabled={bulkBusy || !checkedIds.size || !bulkEngineer}
                  className="text-[11px] font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-lg px-2.5 py-1.5 whitespace-nowrap"
                >
                  {bulkBusy ? "배정 중..." : `${checkedIds.size}개 배정`}
                </button>
              </div>
            )}
          </div>
          <ul className="flex-1 overflow-y-auto">
            {filtered.map((s) => {
              const activeUnits = units.filter((u) => u.siteId === s.id && u.isActive !== false);
              const cnt = activeUnits.length;
              const contractBadges = unitContractBadges(activeUnits);
              const open = failures.filter((f) => f.siteId === s.id && f.status !== "완료").length;
              // 검색어와 일치한 필드 — 현장명·주소 자체는 카드에 이미 보이니 표시에서 뺀다.
              const matchReasons = search.trim()
                ? siteMatchReasons(s, search, { units, siteManagers }).filter((r) => r !== "현장명" && r !== "주소")
                : [];
              // 엑셀 검증 상태 띠 — red/yellow/green (083 미실행이거나 미검증이면 투명)
              const bandCls = s.verifyLevel === "red" ? "bg-red-400" : s.verifyLevel === "yellow" ? "bg-amber-400" : s.verifyLevel === "green" ? "bg-emerald-400" : "bg-transparent";
              return (
                <li key={s.id} className="flex items-stretch">
                  <span className={`w-1 shrink-0 ${bandCls}`} title={s.verifyLevel ? `검증 상태: ${s.verifyLevel}` : ""} />
                  {assignMode && (
                    <label className="flex items-center px-2 border-b border-slate-50 cursor-pointer">
                      <input type="checkbox" checked={checkedIds.has(s.id)} onChange={() => {
                        const next = new Set(checkedIds);
                        next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                        setCheckedIds(next);
                      }} />
                    </label>
                  )}
                  <button onClick={() => select(s)}
                    className={`flex-1 text-left px-4 py-3 border-b border-slate-50 ${selectedId === s.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <div className="flex items-center justify-between">
                      <p className={`font-bold text-sm flex items-center gap-1 ${s.isActive === false ? "text-slate-300 line-through" : ""}`}>
                        {s.name}
                        {s.verifiedAt && <BadgeCheck size={14} className="shrink-0 text-emerald-500" title="검증 인증완료" />}
                        {contractBadges.map((b) => (
                          <span key={b} className="text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-1.5 py-0.5">{b}</span>
                        ))}
                        <span className="text-slate-400 font-semibold">· {cnt}대</span>
                      </p>
                      <span className="flex gap-1">
                        {s.assignedEngineer
                          ? <span className="text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">{s.assignedEngineer}{s.assignedEngineers?.length > 1 ? ` 외 ${s.assignedEngineers.length - 1}명` : ""}</span>
                          : <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">미배정</span>}
                        {s.isActive === false && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">계약종료</span>}
                        {open > 0 && <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-2 py-0.5">고장 {open}</span>}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.address}</p>
                    {matchReasons.length > 0 && (
                      <p className="text-[10px] text-blue-600 font-semibold mt-0.5">일치: {matchReasons.join(", ")}</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 상세 */}
        <div className="xl:col-span-5 xl:h-[calc(100vh-13rem)] xl:overflow-y-auto space-y-4 pr-0.5">
          {!site ? (
            <div className="bg-white rounded-xl border border-slate-200 h-40 xl:h-full flex items-center justify-center text-sm text-slate-400">
              목록에서 현장을 선택하세요
            </div>
          ) : (
            <>
              {/* 엑셀 검증 결과 — 노랑/빨강이면 무엇이 문제였는지 보여주고, 확인했으면 여기서 바로 통과 처리 */}
              {(site.verifyLevel === "yellow" || site.verifyLevel === "red") && (
                <div className={`rounded-xl border p-4 ${site.verifyLevel === "red" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className={`text-sm font-extrabold ${site.verifyLevel === "red" ? "text-red-700" : "text-amber-700"}`}>
                      엑셀 검증 {site.verifyLevel === "red" ? "빨강 — 원본 데이터 문제" : "노랑 — 확인 필요"}
                    </p>
                    {site.verifyLevel === "yellow" ? (
                      <button
                        onClick={async () => {
                          const patch = { verify_level: "green", verified_at: new Date().toISOString() };
                          const { error } = await supabase.from("sites").update(patch).eq("id", site.id);
                          if (error) { alert("처리 실패: " + error.message); return; }
                          setData((prev) => ({ ...prev, sites: prev.sites.map((x) => (x.id === site.id ? { ...x, verifyLevel: "green", verifiedAt: patch.verified_at } : x)) }));
                        }}
                        className="flex items-center gap-1 text-xs font-bold text-white bg-emerald-600 rounded-lg px-3 py-1.5 whitespace-nowrap">
                        <BadgeCheck size={13} /> 확인했음 — 인증 표시만
                      </button>
                    ) : (
                      <span className="text-[11px] font-bold text-red-500">원본 엑셀을 고친 뒤 재검증 필요 (주민번호 등)</span>
                    )}
                  </div>
                  {(site.verifyIssues ?? []).length > 0 && (
                    <ul className="list-disc ml-4 space-y-0.5 text-xs text-slate-600">
                      {site.verifyIssues.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  )}
                  <p className="text-[11px] text-slate-500 mt-2">
                    이 버튼은 <b>검증 상태만 초록으로</b> 바꿉니다. 빈 칸을 실제로 채우려면
                    위 <b>「엑셀 검증 업로드」</b>에서 파일을 올리고 <b>「DB 반영」</b>을 누르세요.
                  </p>
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                {!editingInfo ? (
                  <>
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setBizRegOpen(true)} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 whitespace-nowrap">
                        <FileText size={13} /> 사업자등록증
                      </button>
                      <button onClick={() => setContractOpen(true)} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 whitespace-nowrap">
                        <Paperclip size={13} /> 계약서
                      </button>
                      <button onClick={() => setEditingInfo(true)} className="text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 whitespace-nowrap">
                        수정하기
                      </button>
                    </div>
                    <div className="flex items-start justify-between">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 text-sm">
                        <div><p className="text-xs font-bold text-slate-400 mb-1">현장명</p><p className="font-semibold text-slate-800"><Highlight text={site.name} query={search} /></p></div>
                        <div className="col-span-2"><p className="text-xs font-bold text-slate-400 mb-1">주소</p><p className="font-semibold text-slate-800"><Highlight text={site.address} query={search} /></p></div>
                      </div>
                    </div>
                    <div className="flex items-start justify-between mt-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 text-sm">
                        <div><p className="text-xs font-bold text-slate-400 mb-1">보수료(VAT별도)</p><p className="font-semibold text-slate-800">{maintenanceCostReady ? (site.maintenanceCost != null ? Number(site.maintenanceCost).toLocaleString() + "원" : "-") : "마이그레이션 대기"}</p></div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">계약일자</p><p className="font-semibold text-slate-800">{contractDateReady ? shortDate(site.contractDate) : "마이그레이션 대기"}</p></div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">계약종료일</p>
                          <p className="font-semibold text-slate-800">
                            {shortDate(site.contractEnd)}
                            {/* D-day 상시 표시 — 통보 기한 관리를 위해 멀어도 보여준다 (묵시적 갱신 대비) */}
                            {site.contractEnd && (
                              isExpired(site.contractEnd)
                                ? <span className="ml-1.5 text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-1.5 py-0.5">D+{Math.abs(dday(site.contractEnd))} 만료</span>
                                : <span className={`ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${in30(site.contractEnd) ? "text-amber-600 bg-amber-50" : "text-blue-600 bg-blue-50"}`}>D-{dday(site.contractEnd)}</span>
                            )}
                          </p>
                        </div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">담당 기사</p><p className="font-semibold text-slate-800">{site.assignedEngineers?.length ? site.assignedEngineers.join(", ") : "미배정"}</p></div>
                      </div>
                    </div>
                    <div className="flex items-start justify-between mt-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 text-sm">
                        <div><p className="text-xs font-bold text-slate-400 mb-1">전화번호</p><p className="font-semibold text-slate-800"><Highlight text={site.phone} query={search} /></p></div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">팩스</p><p className="font-semibold text-slate-800"><Highlight text={site.fax} query={search} /></p></div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">이메일</p><p className="font-semibold text-slate-800"><Highlight text={site.email} query={search} /></p></div>
                        <div className="col-span-3"><p className="text-xs font-bold text-slate-400 mb-1">출입 정보(비번·열쇠)</p><p className="font-semibold text-slate-700 whitespace-pre-wrap"><Highlight text={site.accessInfo} query={search} /></p></div>
                        <div className="col-span-3"><p className="text-xs font-bold text-slate-400 mb-1">비고(현장직 참고사항)</p><p className="text-slate-700 whitespace-pre-wrap"><Highlight text={site.notes} query={search} /></p></div>
                        {officeNotesReady && (
                          <div className="col-span-3"><p className="text-xs font-bold text-slate-400 mb-1">비고(사무직 참고사항)</p><p className="text-slate-700 whitespace-pre-wrap"><Highlight text={site.officeNotes} query={search} /></p></div>
                        )}
                      </div>
                    </div>
                    {/* 재계약 안내 — 계약종료 상태이거나 종료일이 임박/지난 현장에만 표시 */}
                    {(site.isActive === false || isExpired(site.contractEnd) || in30(site.contractEnd)) && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-sm font-bold text-amber-700">
                          {site.isActive === false
                            ? "계약이 종료된 현장입니다"
                            : isExpired(site.contractEnd)
                            ? `계약이 만료되었습니다 (${shortDate(site.contractEnd)})`
                            : `계약 만료까지 D-${dday(site.contractEnd)} (${shortDate(site.contractEnd)})`}
                          {" — "}재계약 여부를 협의하세요
                        </p>
                        <p className="text-[11px] text-amber-600 mt-0.5">
                          별도 통보 없이 지나가면 관행상 묵시적 갱신될 수 있어요 — 조건 변경·해지는 만료 전에 통보해야 합니다
                        </p>
                        {site.isActive === false && (site.terminatedDate || site.terminationBasis || site.terminationReason) && (
                          <p className="text-xs text-amber-700 mt-1.5">
                            {site.terminatedDate && `종료일자 ${shortDate(site.terminatedDate)}`}
                            {site.terminationBasis && ` · 근거 ${site.terminationBasis}`}
                            {site.terminationReason && ` · 사유 ${site.terminationReason}`}
                          </p>
                        )}
                        {!renew ? (
                          <button
                            onClick={() => {
                              const start = site.contractEnd && site.contractEnd >= TODAY_STR ? addDays(site.contractEnd, 1) : TODAY_STR;
                              setRenew({ start, end: addDays(start, 365) });
                            }}
                            className="mt-2 text-xs font-bold text-white bg-amber-600 rounded-lg px-3 py-2"
                          >
                            재계약 진행
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-end gap-2 mt-2">
                            <div><p className="text-[10px] font-bold text-amber-700 mb-1">새 계약일자</p>
                              <DateTextInput key={renew.start} value={renew.start} onChange={(v) => setRenew({ ...renew, start: v })} /></div>
                            <div><p className="text-[10px] font-bold text-amber-700 mb-1">새 계약종료일</p>
                              <DateTextInput key={renew.end} value={renew.end} onChange={(v) => setRenew({ ...renew, end: v })} /></div>
                            <button onClick={renewContract} className="text-xs font-bold text-white bg-amber-600 rounded-lg px-3 py-2">재계약 확정</button>
                            <button onClick={() => setRenew(null)} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-3 py-2 bg-white">취소</button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end items-center gap-2">
                      {pendingTermination && (
                        <span className="text-[11px] font-bold text-amber-600">예정된 계약종료 {shortDate(site.terminatedDate)}</span>
                      )}
                      <button onClick={toggleSiteActive} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 whitespace-nowrap">
                        {site.isActive === false ? "계약 복구" : pendingTermination ? "예정 취소" : "계약종료"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><p className="text-xs font-bold text-slate-500 mb-1">현장명</p><input className={inputCls} value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} /></div>
                      <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">주소</p><input className={inputCls} value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs font-bold text-slate-500 mb-1">보수료(VAT별도)</p>
                        {/* 호기별 보수료(승강기 정보)의 합계 — 여기서는 읽기 전용, 수정은 승강기 정보에서 */}
                        <p className={`${inputCls} bg-slate-50 text-slate-600 flex items-center`}>
                          {maintenanceCostReady ? (site.maintenanceCost != null ? Number(site.maintenanceCost).toLocaleString() + "원" : "-") : "마이그레이션 대기"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 mb-1">계약일자{!contractDateReady && " (마이그레이션 대기)"}</p>
                        {contractDateReady ? (
                          <DateTextInput key={siteForm.contractDate} value={siteForm.contractDate} onChange={(v) => setSiteForm({ ...siteForm, contractDate: v })} />
                        ) : (
                          <input className={inputCls} disabled value="" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 mb-1">계약종료일</p>
                        <DateTextInput key={siteForm.contractEnd} value={siteForm.contractEnd} onChange={(v) => setSiteForm({ ...siteForm, contractEnd: v })} />
                      </div>
                      <div className="md:col-span-1">
                        <p className="text-xs font-bold text-slate-500 mb-1">담당 기사 (체크, ★ = 대표)</p>
                        <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto p-1.5 space-y-0.5">
                          {engineers.map((p) => {
                            const checked = siteForm.assignedEngineers.includes(p.name);
                            return (
                              <label key={p.id} className="flex items-center gap-1.5 text-xs px-1 py-0.5">
                                <input type="checkbox" checked={checked} onChange={() => {
                                  const nextList = checked
                                    ? siteForm.assignedEngineers.filter((n) => n !== p.name)
                                    : [...siteForm.assignedEngineers, p.name];
                                  const nextLead = checked && siteForm.leadEngineer === p.name
                                    ? (nextList[0] ?? "")
                                    : (siteForm.leadEngineer || p.name);
                                  setSiteForm({ ...siteForm, assignedEngineers: nextList, leadEngineer: nextLead });
                                }} />
                                <span className="flex-1">{p.name}</span>
                                {checked && (
                                  <button type="button" onClick={() => setSiteForm({ ...siteForm, leadEngineer: p.name })}
                                    className={siteForm.leadEngineer === p.name ? "text-amber-500" : "text-slate-300"}>★</button>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><p className="text-xs font-bold text-slate-500 mb-1">전화번호</p><input className={inputCls} placeholder="관리사무소 대표번호" value={siteForm.phone} onChange={(e) => setSiteForm({ ...siteForm, phone: formatPhone(e.target.value) })} /></div>
                      <div><p className="text-xs font-bold text-slate-500 mb-1">팩스</p><input className={inputCls} value={siteForm.fax} onChange={(e) => setSiteForm({ ...siteForm, fax: formatPhone(e.target.value) })} /></div>
                      <div><p className="text-xs font-bold text-slate-500 mb-1">이메일</p><input className={inputCls} value={siteForm.email} onChange={(e) => setSiteForm({ ...siteForm, email: e.target.value })} /></div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 mb-1">출입 정보(비번·열쇠)</p>
                      <textarea className={inputCls + " resize-y"} rows={2} value={siteForm.accessInfo} onChange={(e) => setSiteForm({ ...siteForm, accessInfo: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 mb-1">비고(현장직 참고사항)</p>
                      <textarea className={inputCls + " resize-y"} rows={4} value={siteForm.notes} onChange={(e) => setSiteForm({ ...siteForm, notes: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 mb-1">비고(사무직 참고사항){!officeNotesReady && " (마이그레이션 대기)"}</p>
                      <textarea className={inputCls + " resize-y"} rows={4} disabled={!officeNotesReady} value={siteForm.officeNotes} onChange={(e) => setSiteForm({ ...siteForm, officeNotes: e.target.value })} />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button onClick={cancelEditInfo} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5 whitespace-nowrap">취소</button>
                      <button onClick={saveSiteInfo} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">저장</button>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold">현장 담당자 <span className="text-slate-400">({contacts.length})</span></h2>
                  {editingContacts ? (
                    <div className="flex items-center gap-2">
                      <button onClick={addContact} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5">
                        <Plus size={13} /> 담당자 추가
                      </button>
                      <button onClick={() => setEditingContacts(false)} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5">완료</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingContacts(true)} className="text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5">수정하기</button>
                  )}
                </div>
                {contacts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">등록된 담당자가 없습니다</p>
                ) : editingContacts ? (
                  <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm table-fixed">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="w-8" /><th className="text-left px-2 py-2 font-semibold w-28">역할</th>
                        <th className="text-left px-2 py-2 font-semibold w-24">이름</th>
                        <th className="text-left px-2 py-2 font-semibold w-36">전화번호</th>
                        <th className="text-left px-2 py-2 font-semibold">이메일</th>
                        <th className="text-left px-2 py-2 font-semibold w-28">팩스</th><th className="w-28" />
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c) => (
                        <ContactRow
                          key={c.id}
                          c={c}
                          onSave={saveContact}
                          onDelete={deleteContact}
                          onSetPrimary={setPrimary}
                          isDefault={!contacts.some((x) => x.isPrimary) && c.id === contacts[0]?.id}
                        />
                      ))}
                    </tbody>
                  </table></div>
                ) : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm table-fixed">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="w-8" /><th className="text-left px-2 py-2 font-semibold w-28">역할</th>
                        <th className="text-left px-2 py-2 font-semibold w-24">이름</th>
                        <th className="text-left px-2 py-2 font-semibold w-36">전화번호</th>
                        <th className="text-left px-2 py-2 font-semibold">이메일</th>
                        <th className="text-left px-2 py-2 font-semibold w-28">팩스</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c) => (
                        <tr key={c.id} className="border-b border-slate-50">
                          {/* 대표로 지정된 담당자가 없으면 맨 위(첫 번째) 담당자를 기본값으로 표시 */}
                          <td className="pl-4 py-2 w-8 text-center">{(c.isPrimary || (!contacts.some((x) => x.isPrimary) && c.id === contacts[0]?.id)) && <span className="text-amber-500">★</span>}</td>
                          <td className="px-2 py-2">{c.role}</td>
                          <td className="px-2 py-2"><Highlight text={c.name} query={search} /></td>
                          <td className="px-2 py-2"><Highlight text={c.phone} query={search} /></td>
                          <td className="px-2 py-2"><Highlight text={c.email} query={search} /></td>
                          <td className="px-2 py-2"><Highlight text={c.fax} query={search} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold">승강기 정보 <span className="text-slate-400">({siteUnits.length})</span></h2>
                  {editingUnits ? (
                    <div className="flex items-center gap-2">
                      <button onClick={addUnit} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5">
                        <Plus size={13} /> 호기 추가
                      </button>
                      <button onClick={() => setEditingUnits(false)} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5">완료</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingUnits(true)} className="text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5">수정하기</button>
                  )}
                </div>
                {editingUnits ? (
                  <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm table-fixed">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="text-left px-4 py-2 font-semibold w-14">호기</th>
                        <th className="text-left px-2 py-2 font-semibold w-28">종류</th>
                        <th className="text-left px-2 py-2 font-semibold w-32">모델</th>
                        <th className="text-left px-2 py-2 font-semibold w-32">계약구분{!unitContractTypeReady && " (마이그레이션 대기)"}</th>
                        <th className="text-left px-2 py-2 font-semibold w-24">보수료{!unitMaintenanceCostReady && " (마이그레이션 대기)"}</th>
                        <th className="text-left px-2 py-2 font-semibold w-40">비상통화장치</th>
                        <th className="w-40" />
                      </tr>
                    </thead>
                    <tbody>
                      {siteUnits.map((u) => (
                        <UnitRow
                          key={u.id}
                          unit={u}
                          emergencyPhone={site.emergencyPhone}
                          maintenanceCostReady={unitMaintenanceCostReady}
                          onSave={saveUnit}
                          onSaveEmergencyPhone={saveEmergencyPhone}
                          onToggleActive={toggleUnitActive}
                          onDelete={deleteUnit}
                          onOpenDetail={setUnitDetail}
                          contractTypeReady={unitContractTypeReady}
                        />
                      ))}
                    </tbody>
                  </table></div>
                ) : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm table-fixed">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="text-left px-4 py-2 font-semibold w-40">호기</th>
                        <th className="text-left px-2 py-2 font-semibold w-28">종류</th>
                        <th className="text-left px-2 py-2 font-semibold w-32">모델</th>
                        {unitContractTypeReady && <th className="text-left px-2 py-2 font-semibold w-28">계약구분</th>}
                        <th className="text-left px-2 py-2 font-semibold w-24">보수료</th>
                        <th className="text-left px-2 py-2 font-semibold w-40">비상통화장치</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteUnits.map((u) => {
                        const unitPlaceLabel = `${u.unitNo}${realInstallPlace(u) ? `(${realInstallPlace(u)})` : ""}`;
                        return (
                          <tr
                            key={u.id}
                            onClick={() => setUnitDetail(u)}
                            className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50 ${u.isActive === false ? "opacity-40" : ""}`}
                          >
                            <td className="px-4 py-2 font-bold truncate text-blue-700" title={unitPlaceLabel}>{unitPlaceLabel}</td>
                            <td className="px-2 py-2 truncate" title={u.kind ?? ""}>{u.kind || "-"}</td>
                            <td className="px-2 py-2 truncate" title={u.model ?? ""}>{u.model || "-"}</td>
                            {unitContractTypeReady && <td className="px-2 py-2 truncate">{u.contractType || CONTRACT_TYPES[0]}</td>}
                            <td className="px-2 py-2 truncate">{unitMaintenanceCostReady ? (u.maintenanceCost != null ? Number(u.maintenanceCost).toLocaleString() + "원" : "-") : "마이그레이션 대기"}</td>
                            <td className="px-2 py-2 truncate" title={site.emergencyPhone ?? ""}>{site.emergencyPhone || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                )}
                <p className="px-4 py-2.5 text-[10px] text-slate-400 border-t border-slate-50">
                  * 호기명을 클릭하면 상세정보(승강기정보·고장·검사·부품교체내역)를 볼 수 있습니다.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {unitDetail && (
        <UnitDetailModal
          unit={unitDetail}
          site={sites.find((s) => s.id === unitDetail.siteId)}
          failures={failures}
          inspections={inspections}
          billings={billings}
          quoteRequests={quoteRequests ?? []}
          unitPartPhotos={unitPartPhotos}
          onAddPartPhoto={addUnitPartPhoto}
          onRemovePartPhoto={removeUnitPartPhoto}
          onClose={() => setUnitDetail(null)}
          onSave={saveUnitDetail}
        />
      )}

      {contractOpen && site && (
        <SiteContractModal site={site} onClose={() => setContractOpen(false)} onSave={saveSiteContract} />
      )}
      {bizRegOpen && site && (
        <SiteBizRegModal site={site} onClose={() => setBizRegOpen(false)} onSave={saveSiteBizReg} />
      )}

      {terminating && site && (
        <TerminationModal site={site} onClose={() => setTerminating(false)} onConfirm={confirmTermination} />
      )}
    </div>
  );
}
