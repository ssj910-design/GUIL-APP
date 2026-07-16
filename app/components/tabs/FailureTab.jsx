import { useState, useContext } from "react";
import { Home, Settings, ClipboardCheck, PackageX, PhoneCall, Flag, User, Flame } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { siteUnits, failureStage, parseErrorCode, unitIdFor, profileIdByName } from "@/lib/utils";
import { FAULT_TYPES } from "@/lib/constants";
import { useLiveInspections } from "@/app/hooks/useLiveInspections";
import { TimelineInput, tlInputCls, PrimaryButton, Sheet, Field, inputCls, SmsToast } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload } from "@/app/components/formWidgets";


/* ------------------------------------------------------------------ */
/* FAILURE (고장접수)                                                   */
/* ------------------------------------------------------------------ */

function FailureRegisterForm({ setFailures, goToUnassigned }) {
  const sites = useContext(SitesContext);
  const units = useContext(UnitsContext);
  const { engineerNames, profiles: allProfiles, selfId } = useContext(AuthContext);
  const v2Ready = units.length > 0;
  const [form, setForm] = useState({
    siteId: "", unit: "", faultType: "", faultDetail: "", notFault: false, assignee: "", reporterPhone: "", sendSms: false,
  });
  const site = sites.find((s) => s.id === form.siteId);
  const nowLabel = "2026-07-10 " + new Date().toTimeString().slice(0, 5);
  const canSubmit = !!site && !!form.faultType && form.reporterPhone.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
    const newFailure = {
      id: "f" + Date.now(),
      siteId: site.id,
      siteName: site.name,
      elevatorNo: form.unit || site.elevatorNo,
      errorCode: form.faultType + (form.faultDetail ? ` (${form.faultDetail})` : ""),
      status: "미처리",
      reportedAt: "07/10 " + new Date().toTimeString().slice(0, 5),
      assignee: form.assignee || null,
      notFault: form.notFault,
      reporterPhone: form.reporterPhone.trim(),
    };
    await supabase.from("failures").insert({
      id: newFailure.id,
      site_id: newFailure.siteId,
      site_name: newFailure.siteName,
      elevator_no: newFailure.elevatorNo,
      error_code: newFailure.errorCode,
      status: newFailure.status,
      reported_at: newFailure.reportedAt,
      assignee: newFailure.assignee,
      not_fault: newFailure.notFault,
      reporter_phone: newFailure.reporterPhone,
      ...(v2Ready ? {
        unit_id: unitIdFor(units, newFailure.siteId, newFailure.elevatorNo),
        assignee_id: profileIdByName(allProfiles, newFailure.assignee),
        created_by: selfId,
      } : {}),
    });
    setFailures((prev) => [newFailure, ...prev]);
    setForm({ siteId: "", unit: "", faultType: "", faultDetail: "", notFault: false, assignee: "", reporterPhone: "", sendSms: false });
    goToUnassigned();
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 pb-24">
      <p className="px-5 pt-4 pb-2 flex items-center justify-between text-xs font-bold text-slate-400">
        정보 <span className="text-blue-600">필수입력</span>
      </p>
      <div className="bg-white overflow-visible">
        <TimelineInput icon={Flag} label="현장명" required>
          <SiteSearchSelect value={form.siteId} onChange={(id) => setForm({ ...form, siteId: id, unit: "" })} placeholder="현장명 검색" />
        </TimelineInput>
        <TimelineInput icon={ClipboardCheck} label="접수일시">
          <span className={tlInputCls}>{nowLabel}</span>
        </TimelineInput>
        <TimelineInput icon={PhoneCall} label="현장 전화번호">
          <span className={tlInputCls}>{site?.phone ?? "현장을 선택해주세요"}</span>
        </TimelineInput>
        <TimelineInput icon={Home} label="주소">
          <span className={`${tlInputCls} truncate`}>{site?.address ?? "현장을 선택해주세요"}</span>
        </TimelineInput>
        <TimelineInput icon={Flame} label="계약구분">
          <span className={tlInputCls}>{site?.contractType ?? "현장을 선택해주세요"}</span>
        </TimelineInput>
        <TimelineInput icon={User} label="담당자">
          <span className={tlInputCls}>{site ? site.manager : "현장을 선택해주세요"}</span>
        </TimelineInput>
        <TimelineInput icon={User} label="담당 기사">
          <span className={tlInputCls}>{site ? site.assignedEngineer || "미배정" : "현장을 선택해주세요"}</span>
        </TimelineInput>
        <TimelineInput icon={Settings} label="호기" last>
          <select className={tlInputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} disabled={!site}>
            <option value="">호기를 선택해주세요</option>
            {site && siteUnits(site).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </TimelineInput>
      </div>

      <p className="px-5 pt-5 pb-2 text-xs font-bold text-slate-400">신고자 정보</p>
      <div className="bg-white">
        <TimelineInput icon={PhoneCall} label="신고자 전화번호" required last>
          <input
            className={tlInputCls}
            placeholder="필수 입력"
            value={form.reporterPhone}
            onChange={(e) => setForm({ ...form, reporterPhone: e.target.value })}
          />
        </TimelineInput>
      </div>

      <p className="px-5 pt-5 pb-2 text-xs font-bold text-slate-400">입력란</p>
      <div className="bg-white">
        <TimelineInput icon={PackageX} label="고장구분" required>
          <select className={tlInputCls} value={form.faultType} onChange={(e) => setForm({ ...form, faultType: e.target.value })}>
            <option value="">고장구분을 선택해주세요</option>
            {FAULT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </TimelineInput>
        <TimelineInput icon={PackageX} label="고장상세내역">
          <input
            className={tlInputCls}
            placeholder="입력하세요"
            value={form.faultDetail}
            onChange={(e) => setForm({ ...form, faultDetail: e.target.value })}
          />
        </TimelineInput>
        <TimelineInput icon={PackageX} label="고장아님(다발아님)">
          <button
            onClick={() => setForm({ ...form, notFault: !form.notFault })}
            className={`text-sm font-bold ${form.notFault ? "text-slate-400" : "text-blue-600"}`}
          >
            {form.notFault ? "고장아님" : "고장"}
          </button>
        </TimelineInput>
        <TimelineInput icon={User} label="배정자" last>
          <select className={tlInputCls} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
            <option value="">배정자를 선택해주세요</option>
            {engineerNames.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </TimelineInput>
      </div>

      <div className="px-5 pt-5 pb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-600">고객안심 출동문자 발송</span>
        <button onClick={() => setForm({ ...form, sendSms: !form.sendSms })}>
          <div className={`w-9 h-5 rounded-full flex items-center px-0.5 ${form.sendSms ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start"}`}>
            <div className="w-4 h-4 rounded-full bg-white" />
          </div>
        </button>
      </div>
      {form.sendSms && (
        <p className="px-5 pt-1 text-[11px] text-blue-600 leading-relaxed">
          접수완료시 신고자 전화번호로 고장처리 상태와 기사님의 실시간 위치가 전송됩니다
        </p>
      )}

      <div className="px-5 pt-6">
        <PrimaryButton onClick={submit} disabled={!canSubmit}>접수완료</PrimaryButton>
        {!form.reporterPhone.trim() && form.siteId && (
          <p className="text-[11px] text-red-500 text-center mt-2">신고자 전화번호는 필수 입력 항목입니다</p>
        )}
      </div>
    </div>
  );
}


export function FailureDetailSheet({ failure, onClose, onDispatch, onArrive, onOpenResult }) {
  const sites = useContext(SitesContext);
  const site = sites.find((s) => s.id === failure.siteId);
  const stage = failureStage(failure);
  const { faultType, faultDetail } = parseErrorCode(failure.errorCode);
  const unitLabel = failure.elevatorNo && !failure.elevatorNo.includes("호기") ? `${failure.elevatorNo}호기` : failure.elevatorNo;
  const unitIndex = failure.elevatorNo ? Number(failure.elevatorNo.split("-")[1]) - 1 : NaN;
  const unitGovNo = site?.govElevatorNos?.[unitIndex];
  const liveInspections = useLiveInspections(
    unitGovNo ? [{ key: `${failure.siteId}-${unitIndex}`, siteId: failure.siteId, siteName: failure.siteName, govElevatorNo: unitGovNo }] : []
  );
  const liveInfo = liveInspections[0];
  return (
    <Sheet title="고장신고 상세" onClose={onClose}>
      <div className="bg-slate-100 rounded-xl p-3 mb-3 text-center">
        <p className="font-bold text-slate-800">{failure.siteName} · {unitLabel}</p>
        <p className="text-sm text-blue-700 font-semibold mt-1">{faultType}</p>
        {faultDetail && <p className="text-xs text-slate-500 mt-0.5">{faultDetail}</p>}
      </div>
      <div className="space-y-2.5 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">구분</span>
          <span className="font-semibold text-slate-700">{liveInfo?.kindNm || "승객용"}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">모델명</span>
          <span className="font-semibold text-slate-700">{site?.elevatorModel || "-"}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">층수[지상/지하]</span>
          <span className="font-semibold text-slate-700">{liveInfo ? `${liveInfo.groundFloorCnt} / ${liveInfo.undgrndFloorCnt}` : "-"}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">주소</span>
          <span className="font-semibold text-slate-700 text-right">{site?.address ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">신고자 전화번호</span>
          <span className="font-semibold text-slate-700">{failure.reporterPhone || "-"}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">접수일시</span>
          <span className="font-semibold text-slate-700">{failure.reportedAt}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">담당 기사</span>
          <span className="font-semibold text-slate-700">{site?.assignedEngineer || "미배정"}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">배정자</span>
          <span className="font-semibold text-slate-700">{failure.assignee || "미정"}</span>
        </div>
        {failure.dispatchedAt && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">출동 확정</span>
            <span className="font-semibold text-slate-700">{failure.dispatchedAt} · {failure.etaMinutes}분 후 도착예정</span>
          </div>
        )}
        {failure.arrivalTime && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">실제 도착</span>
            <span className="font-semibold text-slate-700">{failure.arrivalTime}</span>
          </div>
        )}
        {failure.escalation && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">조치 결과</span>
            <span className="font-semibold text-red-600">{failure.escalation}</span>
          </div>
        )}
      </div>
      {stage === "pending" && onDispatch && (
        <button
          onClick={() => { onDispatch(failure); onClose(); }}
          className="w-full bg-blue-700 text-white text-sm font-bold py-3 rounded-xl active:bg-blue-800"
        >
          {failure.assignee ? "출동 응답" : "내가 출동하기"}
        </button>
      )}
      {stage === "dispatched" && onArrive && (
        <button
          onClick={() => { onArrive(failure); onClose(); }}
          className="w-full bg-blue-700 text-white text-sm font-bold py-3 rounded-xl active:bg-blue-800"
        >
          도착
        </button>
      )}
      {stage === "arrived" && onOpenResult && (
        <button
          onClick={() => { onOpenResult(failure); onClose(); }}
          className="w-full bg-emerald-600 text-white text-sm font-bold py-3 rounded-xl active:bg-emerald-700"
        >
          🛠️ 고장처리결과 입력
        </button>
      )}
    </Sheet>
  );
}


const ETA_OPTIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 10);


export function DispatchEtaModal({ failure, onConfirm, onClose }) {
  const [eta, setEta] = useState("");
  const valid = eta !== "";
  return (
    <Sheet title="도착 예정 시간 입력" onClose={onClose}>
      <p className="text-sm font-semibold text-slate-700 mb-4">{failure.siteName} · {failure.elevatorNo}</p>
      <Field label="도착 예정 시간 *">
        <select value={eta} onChange={(e) => setEta(e.target.value)} className={inputCls}>
          <option value="">선택해주세요</option>
          {ETA_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}분 후</option>
          ))}
        </select>
      </Field>
      <p className="text-xs font-bold text-orange-600 bg-orange-50 rounded-lg px-3 py-2.5 mb-4 leading-relaxed">
        ⚠️ 확인을 누르면 고객에게 도착 시간이 문자로 자동 발송됩니다
      </p>
      <PrimaryButton onClick={() => valid && onConfirm(parseInt(eta, 10))} disabled={!valid}>출동 확정</PrimaryButton>
    </Sheet>
  );
}


function formatTimeInput(raw) {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}


export function ArrivalTimeModal({ failure, onConfirm, onClose }) {
  const [time, setTime] = useState("");
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  return (
    <Sheet title="실제 도착 시간 입력" onClose={onClose}>
      <p className="text-sm font-semibold text-slate-700 mb-4">{failure.siteName} · {failure.elevatorNo}</p>
      <Field label="도착 시간 *">
        <input
          type="text"
          inputMode="numeric"
          value={time}
          onChange={(e) => setTime(formatTimeInput(e.target.value))}
          placeholder="예: 14:30"
          className={inputCls}
        />
      </Field>
      <PrimaryButton onClick={() => valid && onConfirm(time)} disabled={!valid}>도착 확인</PrimaryButton>
    </Sheet>
  );
}


const FAILURE_RESULT_OPTIONS = [
  { value: "처리완료", emoji: "🟢" },
  { value: "지원요청", emoji: "🟡" },
  { value: "운행정지", emoji: "🔴" },
  { value: "오신고", emoji: "⚪" },
];

const FAILURE_RESULT_BTN_CLS = {
  처리완료: "bg-emerald-600 active:bg-emerald-700",
  지원요청: "bg-amber-500 active:bg-amber-600",
  운행정지: "bg-red-600 active:bg-red-700",
  오신고: "bg-slate-500 active:bg-slate-600",
};


export function ArrivalResultModal({ failure, onConfirm, onClose }) {
  const [result, setResult] = useState("처리완료");
  const [symptom, setSymptom] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [cause, setCause] = useState("");
  const [processContent, setProcessContent] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState([]);

  return (
    <Sheet title="고장처리결과 입력" onClose={onClose}>
      <p className="text-sm font-semibold text-slate-700 mb-4">{failure.siteName} · {failure.elevatorNo}</p>
      <div className="space-y-3.5">
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">처리결과</label>
          <select className={inputCls} value={result} onChange={(e) => setResult(e.target.value)}>
            {FAILURE_RESULT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.emoji} {o.value}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">증상</label>
          <input className={inputCls} value={symptom} onChange={(e) => setSymptom(e.target.value)} placeholder="예: 도어가 완전히 닫히지 않음" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">에러코드</label>
          <input className={inputCls} value={errorCode} onChange={(e) => setErrorCode(e.target.value)} placeholder="예: E-32" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">발생원인</label>
          <input className={inputCls} value={cause} onChange={(e) => setCause(e.target.value)} placeholder="예: 도어 센서 오작동" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">처리내용</label>
          <input className={inputCls} value={processContent} onChange={(e) => setProcessContent(e.target.value)} placeholder="예: 센서 교체 및 재조정" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">비고</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="추가 전달사항 (선택)" />
        </div>
        <MultiPhotoUpload
          photos={photos}
          uploadFolder={`failures/${failure.id}`}
          onUploaded={(url) => setPhotos((p) => [...p, { url }])}
          onRemove={(idx) => setPhotos((p) => p.filter((_, i) => i !== idx))}
          label="처리 사진"
          required={false}
        />
        <button
          type="button"
          onClick={() => onConfirm({ result, symptom, errorCode, cause, processContent, note, photoCount: photos.length, photoUrls: photos.map((p) => p.url) })}
          className={`w-full text-white text-sm font-bold py-3 rounded-xl ${FAILURE_RESULT_BTN_CLS[result]}`}
        >
          {result} 등록
        </button>
      </div>
    </Sheet>
  );
}


function FailureResponseCard({ f, onOpenDetail }) {
  const stage = failureStage(f);
  const { faultType, faultDetail } = parseErrorCode(f.errorCode);
  const unitLabel = f.elevatorNo && !f.elevatorNo.includes("호기") ? `${f.elevatorNo}호기` : f.elevatorNo;
  return (
    <button type="button" onClick={() => onOpenDetail(f)} className="w-full text-left rounded-xl border border-slate-200 bg-white overflow-hidden p-3.5">
      <div className="flex items-center justify-between mb-1">
        <p className="font-bold text-slate-800 text-[15px]">{f.siteName} · {unitLabel}</p>
        {f.escalation && (
          <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{f.escalation}</span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-2">{f.reportedAt}</p>
      <div className="bg-blue-500 text-white rounded-lg px-3 py-2.5 text-center">
        <p className="text-sm font-semibold">{faultType}</p>
        {faultDetail && <p className="text-xs mt-0.5 text-blue-50">{faultDetail}</p>}
      </div>
      {stage === "dispatched" && (
        <p className="text-xs font-semibold text-blue-700 mt-2.5 text-center">
          출동 {f.dispatchedAt} · {f.etaMinutes}분 후 도착예정
        </p>
      )}
      {stage === "arrived" && (
        <p className="text-xs font-semibold text-emerald-700 mt-2.5 text-center">도착 {f.arrivalTime} · 상세보기에서 결과 입력</p>
      )}
    </button>
  );
}


function FailureActionCard({ f, onOpenDetail, onDispatch, onArrive, onOpenResult }) {
  const stage = failureStage(f);
  const unitLabel = f.elevatorNo && !f.elevatorNo.includes("호기") ? `${f.elevatorNo}호기` : f.elevatorNo;
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button type="button" onClick={() => onOpenDetail(f)} className="w-full text-left p-3.5">
        <div className="flex items-center justify-between mb-1">
          <p className="font-bold text-slate-800 text-[15px]">{f.siteName} · {unitLabel}</p>
          {f.escalation && (
            <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{f.escalation}</span>
          )}
        </div>
        <p className="text-sm text-slate-500">{f.reportedAt}</p>
      </button>
      <div className="px-3.5 pb-3.5">
        {stage === "pending" && (
          <button
            onClick={() => onDispatch(f)}
            className="w-full bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
          >
            {f.assignee ? "출동 응답" : "내가 출동하기"}
          </button>
        )}
        {stage === "dispatched" && (
          <button
            onClick={() => onArrive(f)}
            className="w-full bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
          >
            도착
          </button>
        )}
        {stage === "arrived" && (
          <button
            onClick={() => onOpenResult(f)}
            className="w-full bg-emerald-600 text-white text-xs font-bold py-2.5 rounded-lg active:bg-emerald-700"
          >
            🛠️ 고장처리결과 입력
          </button>
        )}
      </div>
    </div>
  );
}


export function FailureMiniCard({ f, onOpenDetail, onDispatch, onArrive, onOpenResult }) {
  const stage = failureStage(f);
  return (
    <div className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <button type="button" onClick={() => onOpenDetail(f)} className="min-w-0 flex-1 text-left">
        <p className="font-bold text-slate-800 text-sm truncate">{f.siteName} · {f.elevatorNo}</p>
        <p className="text-[11px] text-slate-400 truncate">{f.errorCode}</p>
      </button>
      {stage === "pending" && (
        <button
          type="button"
          onClick={() => onDispatch(f)}
          className="shrink-0 bg-blue-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg active:bg-blue-800"
        >
          {f.assignee ? "출동 응답" : "내가 출동하기"}
        </button>
      )}
      {stage === "dispatched" && (
        <button
          type="button"
          onClick={() => onArrive(f)}
          className="shrink-0 bg-blue-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg active:bg-blue-800"
        >
          도착 ({f.etaMinutes}분)
        </button>
      )}
      {stage === "arrived" && (
        <button
          type="button"
          onClick={() => onOpenResult(f)}
          className="shrink-0 bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg active:bg-emerald-700"
        >
          🛠️ 결과입력
        </button>
      )}
    </div>
  );
}


function FailureUnassignedList({ failures, onDispatch, onArrive, onResult }) {
  const list = failures.filter((f) => !f.assignee && f.status === "미처리");
  const [detailTarget, setDetailTarget] = useState(null);
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [resultTarget, setResultTarget] = useState(null);
  const [arriveTarget, setArriveTarget] = useState(null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {list.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">미배정 고장이 없습니다</p>
        ) : (
          list.map((f) => (
            <FailureResponseCard key={f.id} f={f} onOpenDetail={setDetailTarget} />
          ))
        )}
      </div>

      {detailTarget && (
        <FailureDetailSheet
          failure={detailTarget}
          onClose={() => setDetailTarget(null)}
          onDispatch={setDispatchTarget}
          onArrive={setArriveTarget}
          onOpenResult={setResultTarget}
        />
      )}
      {dispatchTarget && (
        <DispatchEtaModal
          failure={dispatchTarget}
          onClose={() => setDispatchTarget(null)}
          onConfirm={(eta) => {
            onDispatch(dispatchTarget, eta);
            setDispatchTarget(null);
          }}
        />
      )}
      {arriveTarget && (
        <ArrivalTimeModal
          failure={arriveTarget}
          onClose={() => setArriveTarget(null)}
          onConfirm={(time) => {
            onArrive(arriveTarget, time);
            setArriveTarget(null);
          }}
        />
      )}
      {resultTarget && (
        <ArrivalResultModal
          failure={resultTarget}
          onClose={() => setResultTarget(null)}
          onConfirm={(result) => {
            onResult(resultTarget, result);
            setResultTarget(null);
          }}
        />
      )}
    </div>
  );
}


function FailureProcessRegister({ failures, onDispatch, onArrive, onResult }) {
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [showDone, setShowDone] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [resultTarget, setResultTarget] = useState(null);
  const [arriveTarget, setArriveTarget] = useState(null);
  const mine = failures.filter((f) => f.assignee === CURRENT_ENGINEER);
  const active = mine.filter((f) => f.status !== "완료");
  const done = mine.filter((f) => f.status === "완료");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="text-sm font-bold text-slate-700 mb-2">처리중인 고장</p>
        <div className="space-y-2.5 mb-5">
          {active.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">처리중인 고장이 없습니다</p>
          ) : (
            active.map((f) => (
              <FailureActionCard
                key={f.id}
                f={f}
                onOpenDetail={setDetailTarget}
                onDispatch={setDispatchTarget}
                onArrive={setArriveTarget}
                onOpenResult={setResultTarget}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-slate-700">처리완료</p>
          <button onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1.5">
            <div className={`w-9 h-5 rounded-full flex items-center px-0.5 ${showDone ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start"}`}>
              <div className="w-4 h-4 rounded-full bg-white" />
            </div>
            <span className="text-xs font-bold text-slate-500">완료 보기</span>
          </button>
        </div>
        {showDone && (
          <div className="space-y-2">
            {done.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">처리완료된 고장이 없습니다</p>
            ) : (
              done.map((f) => (
                <button key={f.id} onClick={() => setDetailTarget(f)} className="w-full text-left bg-white rounded-xl border border-slate-200 p-3.5 opacity-70">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-slate-800 text-sm">{f.siteName} · {f.elevatorNo}</p>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">완료</span>
                  </div>
                  <p className="text-xs text-slate-500">{f.errorCode}</p>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {detailTarget && (
        <FailureDetailSheet
          failure={detailTarget}
          onClose={() => setDetailTarget(null)}
          onDispatch={setDispatchTarget}
          onArrive={setArriveTarget}
          onOpenResult={setResultTarget}
        />
      )}
      {dispatchTarget && (
        <DispatchEtaModal
          failure={dispatchTarget}
          onClose={() => setDispatchTarget(null)}
          onConfirm={(eta) => {
            onDispatch(dispatchTarget, eta);
            setDispatchTarget(null);
          }}
        />
      )}
      {arriveTarget && (
        <ArrivalTimeModal
          failure={arriveTarget}
          onClose={() => setArriveTarget(null)}
          onConfirm={(time) => {
            onArrive(arriveTarget, time);
            setArriveTarget(null);
          }}
        />
      )}
      {resultTarget && (
        <ArrivalResultModal
          failure={resultTarget}
          onClose={() => setResultTarget(null)}
          onConfirm={(result) => {
            onResult(resultTarget, result);
            setResultTarget(null);
          }}
        />
      )}
    </div>
  );
}


function FailureStatusOverview({ failures }) {
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [detailTarget, setDetailTarget] = useState(null);
  const mine = failures.filter((f) => f.assignee === CURRENT_ENGINEER);
  const myDone = mine.filter((f) => f.status === "완료").length;
  const myUndone = mine.filter((f) => f.status !== "완료").length;
  const allDone = failures.filter((f) => f.status === "완료").length;
  const allProcessing = failures.filter((f) => f.status === "진행중").length;
  const allUndone = failures.filter((f) => f.status === "미처리").length;
  const statusColor = { 미처리: "bg-red-100 text-red-700", 진행중: "bg-amber-100 text-amber-700", 완료: "bg-emerald-100 text-emerald-700" };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 py-4 flex items-start shrink-0">
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">내 진행상황</p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 처리 {myDone}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 미처리 {myUndone}</span>
          </div>
        </div>
        <div className="w-px self-stretch bg-slate-200 mx-3" />
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">전체 진행상황</p>
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 처리 {allDone}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> 처리중 {allProcessing}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 미처리 {allUndone}</span>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
        {failures.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">고장 접수 이력이 없습니다</p>
        ) : (
          failures.map((f) => (
            <button
              key={f.id}
              onClick={() => setDetailTarget(f)}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-3.5 active:bg-slate-50"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-slate-800 text-sm">{f.siteName} · {f.elevatorNo}</p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusColor[f.status]}`}>{f.status}</span>
              </div>
              <p className="text-xs text-slate-500">{f.errorCode}</p>
              <p className="text-[11px] text-slate-400 mt-1">{f.reportedAt} 접수 · {f.assignee ?? "미배정"}</p>
            </button>
          ))
        )}
      </div>

      {detailTarget && <FailureDetailSheet failure={detailTarget} onClose={() => setDetailTarget(null)} />}
    </div>
  );
}


export function FailureTab({ failures, setFailures, onDispatch, onArrive, onResult, toast }) {
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [subTab, setSubTab] = useState("접수등록");
  const subTabs = ["접수등록", "미배정", "처리등록", "처리현황"];
  const unassignedCount = failures.filter((f) => !f.assignee && f.status === "미처리").length;
  const waitingCount = failures.filter((f) => f.assignee === CURRENT_ENGINEER && f.status === "미처리").length;
  const badgeCount = { 미배정: unassignedCount, 처리등록: waitingCount };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="flex border-b border-slate-100 shrink-0 overflow-x-auto">
        {subTabs.map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-xs font-bold shrink-0 px-1.5 whitespace-nowrap flex items-center justify-center gap-1 ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {!!badgeCount[t] && (
              <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{badgeCount[t]}</span>
            )}
            {t}
          </button>
        ))}
      </div>
      {subTab === "접수등록" && <FailureRegisterForm setFailures={setFailures} goToUnassigned={() => setSubTab("미배정")} />}
      {subTab === "미배정" && (
        <FailureUnassignedList failures={failures} onDispatch={onDispatch} onArrive={onArrive} onResult={onResult} />
      )}
      {subTab === "처리등록" && (
        <FailureProcessRegister failures={failures} onDispatch={onDispatch} onArrive={onArrive} onResult={onResult} />
      )}
      {subTab === "처리현황" && <FailureStatusOverview failures={failures} />}
      <SmsToast message={toast} />
    </div>
  );
}
