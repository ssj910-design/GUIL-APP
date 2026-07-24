import { useState, useContext, useEffect } from "react";
import { Home, Settings, ClipboardCheck, PackageX, PhoneCall, Flag, User, Flame, MapPin, Repeat, AlertTriangle, Wrench, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { siteUnitList, realInstallPlace, failureStage, parseErrorCode, unitIdFor, profileIdByName, formatPhone, distanceKm, labelToSeq, formatUnitLabel, unitHistory, findErrorCode, errorCodeHistory, busyStatusOf } from "@/lib/utils";
import { FAULT_TYPES, TODAY_STR } from "@/lib/constants";
import { useLiveInspections } from "@/app/hooks/useLiveInspections";
import { TimelineInput, tlInputCls, PrimaryButton, Sheet, Field, inputCls, SmsToast, MapLinkButtons } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload } from "@/app/components/formWidgets";
import { PhotoViewerSheet } from "@/app/components/tabs/SiteTab";
import { confirmAsync } from "@/app/components/ConfirmHost";


/* ------------------------------------------------------------------ */
/* FAILURE (고장접수)                                                   */
/* ------------------------------------------------------------------ */

function FailureRegisterForm({ failures, setFailures, goToUnassigned, onReported, onDispatch }) {
  const sites = useContext(SitesContext);
  const units = useContext(UnitsContext);
  const { engineerNames, profiles: allProfiles, selfId, name: myName, role, engineers = [] } = useContext(AuthContext);
  const v2Ready = units.length > 0;
  // 기사 본인이 접수하면 기본 배정 = 본인, 단 지금 처리 중(진행중 건 보유)이면 미배정으로
  const isBusy = (name) => failures.some((f) => f.assignee === name && f.status === "진행중");
  const defaultAssignee = () => (role === "engineer" && !isBusy(myName) ? myName : "");
  const [form, setForm] = useState({
    siteId: "", units: [], faultType: "", faultDetail: "", details: {}, notFault: false, assignee: defaultAssignee(), eta: "", reporterPhone: "", sendSms: false, reportNote: "",
  });
  const [step, setStep] = useState(0); // 스텝형 접수 (0~3)
  const [driveMin, setDriveMin] = useState(null); // T맵 예상 소요시간(분) — 출동응답과 동일하게 여기서도 보여준다
  const site = sites.find((s) => s.id === form.siteId);
  const nowLabel = TODAY_STR + " " + new Date().toTimeString().slice(0, 5);
  const detailFilled = form.units.length > 1
    ? form.units.every((u) => (form.details[u] ?? "").trim().length > 0)
    : form.faultDetail.trim().length > 0;
  // 기사가 본인 배정으로 접수하면 도착예정시간을 여기서 같이 받아 출동응답 단계를 건너뛴다 — 그때는 필수.
  const selfDispatching = role === "engineer" && form.assignee === myName;
  const canSubmit = !!site && !!form.faultType && detailFilled && form.reporterPhone.trim().length > 0 && (!selfDispatching || form.eta !== "");
  const selfLoc = engineers.find((e) => e.id === selfId);

  useEffect(() => {
    if (!selfDispatching || selfLoc?.last_lat == null || site?.lat == null) { setDriveMin(null); return; }
    let cancelled = false;
    fetch("/api/tmap-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startLat: selfLoc.last_lat, startLng: selfLoc.last_lng,
        endLat: site.lat, endLng: site.lng,
        startName: "출발", endName: site.name,
      }),
    })
      .then((res) => res.json())
      .then((data) => { if (!cancelled && data.ok) setDriveMin(Math.round(data.totalTimeSec / 60)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selfDispatching, selfLoc?.last_lat, selfLoc?.last_lng, site?.lat, site?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!canSubmit) return;
    // 선택한 호기마다 접수 1건씩 생성 (처리·배정이 호기 단위라 데이터도 호기별로 쪼갠다)
    const targets = form.units.length ? form.units : [site.elevatorNo];
    const stamp = Date.now();
    // 여러 호기 선택 시 상세증상은 호기별 입력(details), 단일이면 공통 입력(faultDetail)
    const detailOf = (u) => (targets.length > 1 ? (form.details[u] ?? "").trim() : form.faultDetail);
    const newFailures = targets.map((u, i) => ({
      id: "f" + (stamp + i),
      siteId: site.id,
      siteName: site.name,
      elevatorNo: u,
      errorCode: form.faultType + (detailOf(u) ? ` (${detailOf(u)})` : ""),
      status: "미처리",
      reportedAt: TODAY_STR.slice(5).replace("-", "/") + " " + new Date().toTimeString().slice(0, 5),
      assignee: form.assignee || null,
      notFault: form.notFault,
      reporterPhone: form.reporterPhone.trim(),
      reportNote: form.reportNote.trim(),
    }));
    const { error } = await supabase.from("failures").insert(newFailures.map((f) => ({
      id: f.id,
      site_id: f.siteId,
      site_name: f.siteName,
      elevator_no: f.elevatorNo,
      error_code: f.errorCode,
      status: f.status,
      reported_at: f.reportedAt,
      assignee: f.assignee,
      not_fault: f.notFault,
      reporter_phone: f.reporterPhone,
      report_note: f.reportNote || null,
      ...(v2Ready ? {
        unit_id: unitIdFor(units, f.siteId, f.elevatorNo),
        assignee_id: profileIdByName(allProfiles, f.assignee),
        created_by: selfId,
      } : {}),
    })));
    // ★ write 실패 시 낙관적 반영·이동을 막고 폼을 유지 — 신고가 조용히 소실되지 않도록 (P0)
    if (error) {
      alert("고장 접수 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.");
      return;
    }
    setFailures((prev) => [...newFailures, ...prev]);
    onReported?.(newFailures);
    // 접수 시점에 본인 배정 + 도착예정시간을 같이 받았으면 그대로 출동 처리 — 기사가 따로 "출동 응답"을 누를 필요가 없다.
    if (selfDispatching && form.eta) {
      newFailures.forEach((f) => onDispatch?.(f, Number(form.eta)));
    }
    setForm({ siteId: "", units: [], faultType: "", faultDetail: "", details: {}, notFault: false, assignee: defaultAssignee(), eta: "", reporterPhone: "", sendSms: false, reportNote: "" });
    setStep(0);
    goToUnassigned();
  }

  // 스텝형 접수 — 입력 6개를 4단계로 나누고, 자동 정보 7줄은 카드/요약으로 이동 (원복: git tag before-failure-steps)
  // 기사 현재 상태 — 진행중 건이 있으면 출동중(도착 전)/처리중(도착 후)
  const engineerStatus = (name) => {
    const act = failures.filter((f) => f.assignee === name && f.status === "진행중");
    if (!act.length) return null;
    return act.some((f) => !f.arrivalTime) ? "출동중" : "처리중";
  };

  const STEP_TITLES = ["현장 선택", "고장 내용", "신고자 정보", "확인 · 접수"];
  const canNext =
    step === 0 ? !!site :
    step === 1 ? !!form.faultType && detailFilled :
    step === 2 ? form.reporterPhone.trim().length > 0 && (!selfDispatching || form.eta !== "") : true;

  const infoRows = site ? [
    ["주소", site.address], ["현장 전화", site.phone], ["계약구분", site.contractType],
    ["담당자", site.manager], ["담당 기사", site.assignedEngineer || "미배정"], ["접수일시", nowLabel],
  ] : [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* 진행 표시 */}
      <div className="shrink-0 px-5 pt-4 pb-3 bg-white border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          {STEP_TITLES.map((t, i) => (
            <div key={t} className={`flex-1 h-1 rounded-full ${i <= step ? "bg-blue-600" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-sm font-extrabold text-slate-800 mt-2.5">{step + 1}. {STEP_TITLES[step]}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24 space-y-4">
        {step === 0 && (
          <>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1.5">현장명 *</p>
              <SiteSearchSelect
                value={form.siteId}
                onChange={(id) => {
                  // 호기가 1대뿐인 현장은 자동 선택 (여러 대는 오접수 방지를 위해 명시적 선택)
                  const s = sites.find((x) => x.id === id);
                  const us = s ? siteUnitList(s, units) : [];
                  setForm({ ...form, siteId: id, units: us.length === 1 ? [us[0].unitNo] : [], reportNote: s?.notes || "" });
                }}
                placeholder="현장명 검색"
              />
            </div>
            {site && (
              <>
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1.5">
                    호기{siteUnitList(site, units).length === 1 ? <span className="text-blue-600 font-semibold"> — 1대 현장, 자동 선택됨</span> : <span className="text-slate-400 font-semibold"> (여러 대 고장이면 모두 선택)</span>}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {siteUnitList(site, units).map((u) => {
                      const place = realInstallPlace(u);
                      const on = form.units.includes(u.unitNo);
                      return (
                        <button
                          key={u.unitNo}
                          onClick={() => setForm({
                            ...form,
                            units: on ? form.units.filter((x) => x !== u.unitNo) : [...form.units, u.unitNo],
                          })}
                          className={`py-2.5 px-1 rounded-xl border leading-tight ${
                            on ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200 bg-white"
                          }`}
                        >
                          <span className="block text-sm font-bold">{u.unitNo}</span>
                          {place && <span className={`block text-[11px] font-semibold truncate ${on ? "text-blue-100" : "text-slate-400"}`}>{place}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {form.units.length > 1 && (
                    <p className="text-[11px] text-blue-600 font-semibold mt-1.5">
                      선택 {form.units.length}대 — 호기별로 접수 {form.units.length}건이 각각 생성됩니다
                    </p>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-1.5">
                  {infoRows.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <span className="text-slate-400 shrink-0">{k}</span>
                      <span className="font-semibold text-slate-700 text-right truncate">{v || "-"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1.5">고장구분 *</p>
              <div className="grid grid-cols-2 gap-2">
                {FAULT_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, faultType: t })}
                    className={`py-3.5 rounded-xl text-sm font-bold border ${
                      form.faultType === t ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200 bg-white"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {form.units.length > 1 ? (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1.5">호기별 상세증상 *</p>
                <div className="space-y-2">
                  {form.units.map((u) => (
                    <div key={u} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-sm font-bold text-slate-600 text-center">{u}</span>
                      <input
                        className={inputCls}
                        placeholder="이 호기의 증상"
                        value={form.details[u] ?? ""}
                        onChange={(e) => setForm({ ...form, details: { ...form.details, [u]: e.target.value } })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1.5">신고내용 *</p>
                <input className={inputCls} placeholder="예: 3층에서 문이 안 닫힘" value={form.faultDetail} onChange={(e) => setForm({ ...form, faultDetail: e.target.value })} />
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1.5">비고 (선택)</p>
              <input className={inputCls} placeholder="참고사항" value={form.reportNote} onChange={(e) => setForm({ ...form, reportNote: e.target.value })} />
            </div>
            <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3">
              <span className="text-sm font-bold text-slate-600">고장아님(다발아님)으로 접수</span>
              <button onClick={() => setForm({ ...form, notFault: !form.notFault })}>
                <div className={`w-9 h-5 rounded-full flex items-center px-0.5 ${form.notFault ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start"}`}>
                  <div className="w-4 h-4 rounded-full bg-white" />
                </div>
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1.5">신고자 전화번호 *</p>
              <input
                className={inputCls}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="숫자만 입력 — 하이픈 자동"
                value={form.reporterPhone}
                onChange={(e) => setForm({ ...form, reporterPhone: formatPhone(e.target.value) })}
              />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1.5">
                {role === "admin" ? "배정 기사 (선택)" : "내가 처리할까요? (선택)"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setForm({ ...form, assignee: "", eta: "" })}
                  className={`py-3 rounded-xl text-sm font-bold border ${
                    form.assignee === "" ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200 bg-white"
                  }`}
                >
                  나중에 배정
                </button>
                {/* 기사는 본인만 배정할 수 있다 — 타 기사 배정은 관리자 권한.
                    기사가 남을 배정하면 배정된 사람이 상황을 모른 채 책임만 지게 된다. */}
                {(role === "admin" ? engineerNames : engineerNames.filter((n) => n === myName)).map((name) => {
                  const st = engineerStatus(name);
                  const sel = form.assignee === name;
                  return (
                    <button
                      key={name}
                      onClick={() => setForm({ ...form, assignee: name })}
                      className={`py-2.5 rounded-xl text-sm font-bold border ${
                        sel ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200 bg-white"
                      }`}
                    >
                      {role === "engineer" && name === myName ? "나에게" : name}
                      {st && (
                        <span className={`block text-[10px] font-bold mt-0.5 ${
                          sel ? "text-amber-200" : st === "출동중" ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          {st}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {role === "engineer" && isBusy(myName) && (
                <p className="text-[11px] text-amber-600 font-semibold mt-1.5">
                  지금 처리 중인 고장이 있어 기본을 "나중에 배정"으로 뒀어요 — 필요하면 본인을 직접 선택하세요
                </p>
              )}
            </div>
            {/* 본인 배정이면 접수와 동시에 출동 처리 — 나중에 "출동 응답"을 따로 누를 필요가 없게 여기서 도착예정시간을 받는다. */}
            {selfDispatching && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-bold text-slate-500">도착 예정 시간 *</p>
                  {driveMin != null && (
                    <span className="text-xs font-bold text-red-600">지금 출발 시 예상 소요시간 {driveMin}분(T MAP연동)</span>
                  )}
                </div>
                <select
                  value={form.eta}
                  onChange={(e) => setForm({ ...form, eta: e.target.value })}
                  className={inputCls}
                >
                  <option value="">선택해주세요</option>
                  {ETA_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}분 후</option>
                  ))}
                </select>
                <p className="text-[11px] text-orange-600 font-semibold mt-1.5 leading-relaxed">
                  고객에게 도착 시간이 문자로 자동 발송됩니다
                </p>
              </div>
            )}
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-600">고객안심 출동문자 발송</span>
                <button onClick={() => setForm({ ...form, sendSms: !form.sendSms })}>
                  <div className={`w-9 h-5 rounded-full flex items-center px-0.5 ${form.sendSms ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start"}`}>
                    <div className="w-4 h-4 rounded-full bg-white" />
                  </div>
                </button>
              </div>
              {form.sendSms && (
                <p className="pt-2 text-[11px] text-blue-600 leading-relaxed">
                  접수완료시 신고자 전화번호로 고장처리 상태와 기사님의 실시간 위치가 전송됩니다
                </p>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-2">
              {[
                ["현장", site?.name],
                ["호기", form.units.length ? form.units.join(", ") : "미지정"],
                ["접수 건수", `${form.units.length || 1}건${form.units.length > 1 ? " (호기별 1건)" : ""}`],
                ["고장구분", form.faultType],
                ["상세내역", form.units.length > 1
                  ? form.units.map((u) => `${u}: ${form.details[u] || "-"}`).join(" / ")
                  : form.faultDetail || "-"],
                ...(form.notFault ? [["구분", "고장아님(다발아님)"]] : []),
                ...(form.reportNote.trim() ? [["비고", form.reportNote]] : []),
                ["신고자 전화", form.reporterPhone],
                ["배정 기사", form.assignee || "나중에 배정"],
                ...(selfDispatching ? [["도착 예정 시간", form.eta ? `${form.eta}분 후` : "-"]] : []),
                ["출동문자", form.sendSms ? "발송" : "미발송"],
                ["접수일시", nowLabel],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span className="text-slate-400 shrink-0">{k}</span>
                  <span className="font-semibold text-right text-slate-800">{v}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 text-center">잘못된 항목이 있으면 "이전"으로 돌아가 수정하세요</p>
          </>
        )}
      </div>

      {/* 하단 고정 이전/다음 */}
      <div className="shrink-0 bg-white border-t border-slate-100 px-5 py-3 flex gap-2">
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">
            이전
          </button>
        )}
        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300"
          >
            다음
          </button>
        ) : (
          <div className="flex-1"><PrimaryButton onClick={submit} disabled={!canSubmit}>접수완료{form.units.length > 1 ? ` (${form.units.length}건 등록)` : ""}</PrimaryButton></div>
        )}
      </div>
    </div>
  );
}


export function FailureDetailSheet({ failure, failures = [], nested = false, onClose, onDispatch, onArrive, onOpenResult, onAssignOpen }) {
  const { role } = useContext(AuthContext);
  const sites = useContext(SitesContext);
  const site = sites.find((s) => s.id === failure.siteId);
  const history = unitHistory(failures, failure);
  const stage = failureStage(failure);
  const { faultType, faultDetail } = parseErrorCode(failure.errorCode);
  const unitLabel = formatUnitLabel(failure.elevatorNo);
  const unitIndex = (labelToSeq(failure.elevatorNo) ?? NaN) - 1;
  const unitGovNo = site?.govElevatorNos?.[unitIndex];
  const liveInspections = useLiveInspections(
    unitGovNo ? [{ key: `${failure.siteId}-${unitIndex}`, siteId: failure.siteId, siteName: failure.siteName, govElevatorNo: unitGovNo }] : []
  );
  const liveInfo = liveInspections[0];
  const [photoViewer, setPhotoViewer] = useState(null);
  const [histTarget, setHistTarget] = useState(null); // 이력 행 클릭 → 그 고장 상세를 위에 얹어 보여준다
  return (
    <>
    <Sheet title={nested ? "지난 고장 상세" : "고장신고 상세"} onClose={onClose}>
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
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-slate-400 shrink-0">주소</span>
          <span className="font-semibold text-slate-700 text-right truncate min-w-0">{site?.address ?? "-"}</span>
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
        {failure.faultErrorCode && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">에러코드</span>
            <span className="font-semibold text-slate-700">{failure.faultErrorCode}</span>
          </div>
        )}
        {failure.faultCause && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-400 shrink-0">원인</span>
            <span className="font-semibold text-slate-700 text-right">{failure.faultCause}</span>
          </div>
        )}
        {failure.processContent && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-400 shrink-0">처리내용</span>
            <span className="font-semibold text-slate-700 text-right">{failure.processContent}</span>
          </div>
        )}
        {failure.processNote && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-400 shrink-0">비고</span>
            <span className="font-semibold text-slate-700 text-right">{failure.processNote}</span>
          </div>
        )}
      </div>
      {!nested && (
      <div className="mb-4">
        <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1"><Repeat size={12} strokeWidth={2.5} /> 이 호기 고장 이력 {history.length > 0 && `(${history.length})`}</p>
        {history.length === 0 ? (
          <p className="text-[13px] text-slate-400">이 호기의 다른 고장 이력이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.slice(0, 5).map((h) => {
              const ec = parseErrorCode(h.errorCode);
              const done = [h.faultCause, h.processContent].filter(Boolean).join(" → ");
              return (
                <li key={h.id}>
                  <button type="button" onClick={() => setHistTarget(h)} className="w-full text-left rounded-lg bg-slate-50 border border-slate-200/70 px-3 py-2 active:bg-slate-100">
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="font-semibold text-slate-700 truncate">{fmtMD(h.createdAt)} · {ec.faultType}{ec.faultDetail && <span className="font-normal text-slate-500"> · {ec.faultDetail}</span>}</span>
                      <span className="shrink-0 flex items-center gap-1">
                        <span className={`text-[10px] font-bold ${h.status === "완료" ? "text-emerald-600" : "text-amber-600"}`}>{h.status}</span>
                        <ChevronRight size={13} className="text-slate-300" />
                      </span>
                    </div>
                    {(h.assignee || done) && (
                      <p className="text-[12px] text-slate-500 mt-0.5 truncate">
                        {h.assignee && <span className="font-medium text-slate-600">{h.assignee}</span>}
                        {h.assignee && done && " · "}
                        {done}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
            {history.length > 5 && <li className="text-[11px] text-slate-400 text-center pt-0.5">외 {history.length - 5}건</li>}
          </ul>
        )}
      </div>
      )}
      {failure.photoUrls?.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-slate-500 mb-2">처리 사진 ({failure.photoUrls.length}장)</p>
          <div className="grid grid-cols-3 gap-2">
            {failure.photoUrls.map((url, i) => (
              <button key={i} type="button" onClick={() => setPhotoViewer({ urls: failure.photoUrls, index: i })}>
                <img src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
              </button>
            ))}
          </div>
        </div>
      )}
      {/* 티맵·카카오를 주 액션 버튼 좌측에 붙인다 (미배정 카드와 동일 레이아웃).
          관리자는 직접 출동하지 않는다 — 미배정 건은 기사 배정, 이미 배정된 건은 재배정.
          읽기전용(nested)일 땐 액션 없이 상세만 본다 */}
      {!nested && stage !== "done" && (
        <div className="flex items-center gap-2">
          {/* 길안내는 아직 이동이 필요한 단계(배정/출동중)에만 — 도착(작업중) 후엔 이미 현장이라 숨긴다 */}
          {(stage === "pending" || stage === "dispatched") && <MapLinkButtons site={site} />}
          {stage === "pending" && role === "admin" ? (
            onAssignOpen && (
              <button
                onClick={() => { onAssignOpen(failure); onClose(); }}
                className="flex-1 bg-slate-800 text-white text-sm font-bold py-3 rounded-xl active:bg-slate-900"
              >
                {failure.assignee ? "재배정" : "기사 배정"}
              </button>
            )
          ) : stage === "pending" && onDispatch && role !== "admin" ? (
            <button
              onClick={() => { onDispatch(failure); onClose(); }}
              className="flex-1 bg-blue-700 text-white text-sm font-bold py-3 rounded-xl active:bg-blue-800"
            >
              {failure.assignee ? "출동 응답" : "내가 출동하기"}
            </button>
          ) : null}
          {stage === "dispatched" && onArrive && (
            <button
              onClick={() => { onArrive(failure); onClose(); }}
              className="flex-1 bg-blue-700 text-white text-sm font-bold py-3 rounded-xl active:bg-blue-800"
            >
              도착
            </button>
          )}
          {stage === "arrived" && onOpenResult && (
            <button
              onClick={() => { onOpenResult(failure); onClose(); }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 text-white text-sm font-bold py-3 rounded-xl active:bg-emerald-700"
            >
              <Wrench size={15} strokeWidth={2.5} /> 고장처리결과 입력
            </button>
          )}
        </div>
      )}
    </Sheet>
    {photoViewer && (
      <PhotoViewerSheet
        urls={photoViewer.urls}
        index={photoViewer.index}
        siteName={failure.siteName}
        date={failure.reportedAt ?? ""}
        onClose={() => setPhotoViewer(null)}
      />
    )}
    {/* 이력 행 클릭 시 그 고장 상세를 읽기전용으로 위에 얹는다 (닫으면 이 시트로 복귀) */}
    {histTarget && (
      <FailureDetailSheet failure={histTarget} failures={failures} nested onClose={() => setHistTarget(null)} />
    )}
    </>
  );
}


const ETA_OPTIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 10);


// 관리자용 기사 배정 시트 — 기사별 현재 상태(출동중/처리중) 배지와 함께 선택
export function AssignEngineerSheet({ failure, failures, onAssign, onClose, allowUnassign, attendances = [], todayLeaves = [] }) {
  const { engineerNames, engineers = [] } = useContext(AuthContext);
  const sites = useContext(SitesContext);
  const statusOf = (name) => busyStatusOf(failures, name);

  // 가까운 기사 정렬 — 기사의 '마지막 확인 위치'(profiles.last_lat) 기준.
  // 출근 시 GPS, 이후 현장 도착·처리완료 때 그 현장 좌표로 갱신되므로 오후에도 최신에 가깝다.
  // 상시 추적이 아니라 이벤트마다 갱신된 값이고, 직선거리 기준이다.
  const site = sites.find((x) => x.id === failure.siteId);
  const hereOf = (name) => {
    const e = engineers.find((e) => e.name === name);
    return e?.last_lat != null ? { lat: e.last_lat, lng: e.last_lng } : null;
  };
  // 오늘 휴가 중인 사람은 아예 못 고르게 한다 — 회사에 없는 사람에게 배정되면 아무도 안 간다.
  // 반대로 '출동중'은 막지 않는다: 같은 건물·인근 현장을 연달아 처리하는 경우가 실제로 있어
  // 관리자가 판단할 여지를 남기고, 대신 확인을 한 번 받는다.
  const leaveOf = (name) => {
    const pid = engineers.find((e) => e.name === name)?.id;
    return todayLeaves.find((l) => l.profile_id === pid) ?? null;
  };
  // 이 건물(site)에서 그 기사가 '최근 2주' 내 접수된 고장에 대응한 수 — 지금 건물 사정 아는 기사를 관리자가 알아보게.
  const RECENT_DAYS = 14;
  const recentCutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const visitsOf = (name) =>
    failures.filter((f) =>
      f.siteId === failure.siteId && f.id !== failure.id && f.assignee === name &&
      f.createdAt && new Date(f.createdAt).getTime() >= recentCutoff
    ).length;

  const rows = engineerNames
    .map((name) => ({ name, km: distanceKm(hereOf(name), site?.lat != null ? { lat: site.lat, lng: site.lng } : null) }))
    .sort((a, b) => {
      if (a.km == null && b.km == null) return 0;
      if (a.km == null) return 1;   // 위치 모르는 기사는 뒤로
      if (b.km == null) return -1;
      return a.km - b.km;
    });
  const anyDistance = rows.some((r) => r.km != null);

  return (
    <Sheet title={`기사 배정 — ${failure.siteName} · ${formatUnitLabel(failure.elevatorNo) || "호기 미상"}`} onClose={onClose}>
      {failure.assignee && <p className="text-xs text-slate-500 mb-2">현재 배정: <b>{failure.assignee}</b> — 재배정하면 출동 기록이 초기화되고 미처리로 돌아갑니다</p>}
      <p className="text-[11px] text-slate-400 mb-2">
        {anyDistance
          ? "마지막 확인 위치 기준 직선거리 순 (출근·현장 도착 때 갱신됨)"
          : site?.lat == null ? "현장 좌표가 없어 거리순 정렬을 못 합니다" : "위치가 확인된 기사가 없어 거리를 계산할 수 없습니다"}
      </p>
      <div className="grid grid-cols-2 gap-2 pb-2">
        {allowUnassign && (
          <button
            onClick={async () => {
              if (!(await confirmAsync("미배정 하시겠습니까?\n모든 직원에게 알림이 갑니다."))) return;
              onAssign(failure, null);
              onClose();
            }}
            className="py-3 rounded-xl text-sm font-bold border text-red-500 border-red-200 bg-white active:bg-red-50"
          >
            미배정으로
          </button>
        )}
        {rows.map(({ name, km }, i) => {
          const st = statusOf(name);
          const leave = leaveOf(name);
          const visits = visitsOf(name);
          const pick = async () => {
            const msg = st
              ? `${name}님은 지금 ${st}입니다.\n그래도 이 건을 배정할까요?`
              : `${name}으로 배정하시겠습니까?`;
            if (!(await confirmAsync(msg))) return;
            onAssign(failure, name);
            onClose();
          };
          return (
            <button
              key={name}
              onClick={pick}
              disabled={!!leave}
              className={`py-3 rounded-xl text-sm font-bold border bg-white ${
                leave ? "text-slate-300 border-slate-100 bg-slate-50"
                  : i === 0 && km != null && !st ? "text-blue-700 border-blue-300 active:bg-blue-50"
                  : "text-slate-700 border-slate-200 active:bg-blue-50"
              }`}
            >
              {name}
              {!leave && i === 0 && km != null && !st && <span className="ml-1 text-[9px] font-extrabold text-blue-500">최단</span>}
              <span className="block text-[10px] font-bold mt-0.5">
                {leave ? (
                  <span className="text-red-400">{leave.kind} 중</span>
                ) : (
                  <>
                    {km != null
                      ? <span className="text-slate-400">{km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`}</span>
                      : <span className="text-slate-300">위치 없음</span>}
                    {st && <span className={`ml-1 ${st === "출동중" ? "text-amber-600" : "text-emerald-600"}`}>{st}</span>}
                  </>
                )}
              </span>
              {!leave && visits > 0 && (
                <span className="flex items-center justify-center gap-0.5 text-[9px] font-extrabold text-blue-600 mt-0.5">
                  <Wrench size={9} strokeWidth={2.8} /> 최근 고장대응 {visits}회
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}


export function DispatchEtaModal({ failure, onConfirm, onClose }) {
  const [eta, setEta] = useState("");
  const [driveMin, setDriveMin] = useState(null); // T맵 예상 소요시간(분) — 실패·키 미설정 시 null로 조용히 숨김
  const valid = eta !== "";
  const sites = useContext(SitesContext);
  const { selfId, engineers = [] } = useContext(AuthContext);
  const site = sites.find((s) => s.id === failure.siteId);
  const selfLoc = engineers.find((e) => e.id === selfId);

  useEffect(() => {
    if (selfLoc?.last_lat == null || site?.lat == null) return;
    let cancelled = false;
    fetch("/api/tmap-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startLat: selfLoc.last_lat, startLng: selfLoc.last_lng,
        endLat: site.lat, endLng: site.lng,
        startName: "출발", endName: site.name,
      }),
    })
      .then((res) => res.json())
      .then((data) => { if (!cancelled && data.ok) setDriveMin(Math.round(data.totalTimeSec / 60)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selfLoc?.last_lat, selfLoc?.last_lng, site?.lat, site?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet title="도착 예정 시간 입력" onClose={onClose}>
      <p className="text-sm font-semibold text-slate-700 mb-4">{failure.siteName} · {formatUnitLabel(failure.elevatorNo)}</p>
      <Field
        label="도착 예정 시간 *"
        right={driveMin != null && (
          <span className="text-xs font-bold text-red-600">지금 출발 시 예상 소요시간 {driveMin}분(T MAP연동)</span>
        )}
      >
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


export function ArrivalResultModal({ failure, failures = [], errorCodes = [], onConfirm, onClose }) {
  const [result, setResult] = useState("처리완료");
  const [symptom, setSymptom] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [cause, setCause] = useState("");
  const [processContent, setProcessContent] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState([]);
  const units = useContext(UnitsContext);
  const model = units.find((u) => u.id === failure.unitId)?.model;
  const codeOptions = model ? errorCodes.filter((e) => e.model === model) : [];
  const matched = model ? findErrorCode(errorCodes, model, errorCode) : null;
  const matchedHistory = matched ? errorCodeHistory(failures, units, model, errorCode) : [];

  return (
    <Sheet title="고장처리결과 입력" onClose={onClose}>
      <p className="text-sm font-semibold text-slate-700 mb-4">{failure.siteName} · {formatUnitLabel(failure.elevatorNo)}</p>
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
          <label className="text-xs font-bold text-slate-600 mb-1 block">증상 <span className="text-red-500">*</span></label>
          <input className={inputCls} value={symptom} onChange={(e) => setSymptom(e.target.value)} placeholder="예: 도어가 완전히 닫히지 않음" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">에러코드 <span className="text-red-500">*</span></label>
          <input className={inputCls} list="error-code-options" value={errorCode} onChange={(e) => setErrorCode(e.target.value)} placeholder="예: E-32" />
          {codeOptions.length > 0 && (
            <datalist id="error-code-options">
              {codeOptions.map((e) => <option key={e.id} value={e.code} />)}
            </datalist>
          )}
          {matched && (
            <div className="bg-blue-50 rounded-xl p-3 mt-2">
              <p className="text-sm font-bold text-blue-800">{matched.meaning || "의미 미등록"}</p>
              {matched.commonCause && <p className="text-xs text-blue-600 mt-1">흔한 원인: {matched.commonCause}</p>}
              {matched.standardAction && <p className="text-xs text-blue-600 mt-0.5">표준 조치: {matched.standardAction}</p>}
              <p className="text-xs font-bold text-blue-700 mt-2">과거 처리사례 {matchedHistory.length}건</p>
              {matchedHistory.length === 0 ? (
                <p className="text-xs text-blue-500 mt-1">아직 처리된 사례가 없습니다.</p>
              ) : (
                <ul className="space-y-1 mt-1.5">
                  {matchedHistory.slice(0, 3).map((h) => (
                    <li key={h.id} className="text-xs text-blue-700">
                      {h.siteName} — {[h.faultCause, h.processContent].filter(Boolean).join(" → ") || "내용 없음"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">발생원인 <span className="text-red-500">*</span></label>
          <input className={inputCls} value={cause} onChange={(e) => setCause(e.target.value)} placeholder="예: 도어 센서 오작동" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">처리내용 <span className="text-red-500">*</span></label>
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
        {(() => {
          const valid = symptom.trim() && errorCode.trim() && cause.trim() && processContent.trim();
          return (
            <button
              type="button"
              disabled={!valid}
              onClick={() => onConfirm({ result, symptom, errorCode, cause, processContent, note, photoCount: photos.length, photoUrls: photos.map((p) => p.url) })}
              className={`w-full text-white text-sm font-bold py-3 rounded-xl ${valid ? FAILURE_RESULT_BTN_CLS[result] : "bg-slate-300"}`}
            >
              {result} 등록
            </button>
          );
        })()}
      </div>
    </Sheet>
  );
}


// 미배정 접수 카드 — 클릭 없이도 판단할 수 있게 상세를 카드에 박는다:
// 거리(거리순 정렬)·접수시각·증상·주소·신고자·재발배지 + 카드에서 바로 출동/배정.
// (모델·층수 같은 라이브 정보는 상세시트 유지 — 여기선 판단에 필요한 것만.)
function FailureResponseCard({ f, dist, history = [], site, onOpenDetail, onDispatch, onAssignOpen }) {
  const stage = failureStage(f);
  const { faultType, faultDetail } = parseErrorCode(f.errorCode);
  const { role } = useContext(AuthContext);
  const unitLabel = formatUnitLabel(f.elevatorNo);
  const fmtDist = (km) => (km == null ? null : km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`);
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-3.5 pb-2.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="font-bold text-slate-800 text-[15px] truncate">{f.siteName} · {unitLabel}</p>
          {f.escalation && <span className="shrink-0 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{f.escalation}</span>}
        </div>
        <p className="text-[13px] text-slate-500 mb-2 flex items-center gap-1">
          {dist != null && <span className="inline-flex items-center gap-0.5 font-bold text-blue-600"><MapPin size={12} strokeWidth={2.5} />{fmtDist(dist)} ·</span>}
          <span>{f.reportedAt} 접수</span>
        </p>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/70 rounded-lg px-3 py-2 mb-2">
          <AlertTriangle size={15} className="text-amber-500 shrink-0" />
          <p className="text-[13px]"><span className="font-bold text-slate-800">{faultType}</span>{faultDetail && <span className="text-slate-500"> · {faultDetail}</span>}</p>
        </div>
        {history.length > 0 && (
          <p className={`text-[12px] font-semibold mb-2 flex items-center gap-1 ${history.length >= 3 ? "text-red-600" : "text-slate-500"}`}>
            <Repeat size={12} strokeWidth={2.5} className="shrink-0" />
            <span className="truncate">고장 {history.length}회 · 최근 {fmtMD(history[0].createdAt)}{history[0].assignee ? ` · ${history[0].assignee}` : ""}</span>
          </p>
        )}
        {(site?.address || f.reporterPhone || site?.elevatorModel) && (
          <div className="text-[12px] text-slate-500 space-y-1">
            {site?.address && <p className="flex items-center gap-1 min-w-0"><MapPin size={12} className="shrink-0 text-slate-400" /><span className="truncate">{site.address}</span></p>}
            {site?.elevatorModel && <p className="flex items-center gap-1 min-w-0"><Settings size={12} className="shrink-0 text-slate-400" /><span className="truncate">{site.elevatorModel}</span></p>}
            {f.reporterPhone && <p className="flex items-center gap-1"><PhoneCall size={12} className="shrink-0 text-slate-400" />신고자 {formatPhone(f.reporterPhone)}</p>}
          </div>
        )}
        {stage === "dispatched" && <p className="text-xs font-semibold text-blue-700 mt-2 text-center">출동 {f.dispatchedAt} · {f.etaMinutes}분 후 도착예정</p>}
        {stage === "arrived" && <p className="text-xs font-semibold text-emerald-700 mt-2 text-center">도착 {f.arrivalTime}</p>}
      </div>
      {stage === "pending" && (
        <div className="flex items-center gap-2 px-3.5 pb-2">
          <MapLinkButtons site={site} />
          {role === "admin" && onAssignOpen ? (
            <button onClick={() => onAssignOpen(f)} className="flex-1 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800">기사 배정</button>
          ) : (
            <button onClick={() => onDispatch(f)} className="flex-1 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800">내가 출동하기</button>
          )}
        </div>
      )}
      <button type="button" onClick={() => onOpenDetail(f)} className="w-full border-t border-slate-100 py-2.5 text-[11px] font-bold text-slate-500 inline-flex items-center justify-center gap-0.5 active:bg-slate-50">
        상세보기 <ChevronRight size={12} />
      </button>
    </div>
  );
}


function FailureActionCard({ f, onOpenDetail, onDispatch, onArrive, onOpenResult, onRefuse, onAssignOpen }) {
  const siteOf = useSiteOf();
  const { name: me, role } = useContext(AuthContext);
  const stage = failureStage(f);
  const { faultType, faultDetail } = parseErrorCode(f.errorCode);
  const unitLabel = formatUnitLabel(f.elevatorNo);
  const bar = stage === "arrived" ? "border-l-amber-500" : stage === "dispatched" ? "border-l-blue-500" : f.escalation === "운행정지" ? "border-l-red-600" : "border-l-red-400";
  return (
    <div className={`rounded-xl border border-slate-200 border-l-4 ${bar} bg-white overflow-hidden`}>
      <div className="w-full flex items-start gap-2 p-3.5 pb-2.5">
        <button type="button" onClick={() => onOpenDetail(f)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="font-bold text-slate-800 text-[15px] truncate">{f.siteName} · {unitLabel}</p>
            {f.escalation && (
              <span className="shrink-0 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{f.escalation}</span>
            )}
          </div>
          <div className="flex items-start gap-1.5">
            <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[13px] min-w-0"><span className="font-bold text-slate-700">{faultType}</span>{faultDetail && <span className="text-slate-500"> · {faultDetail}</span>}</p>
          </div>
          {stage === "dispatched" && <p className="text-[11px] text-blue-600 font-semibold mt-1">출동 {f.dispatchedAt} · {f.etaMinutes}분 후 도착예정</p>}
          {stage === "arrived" && <p className="text-[11px] text-amber-600 font-semibold mt-1">{f.arrivalTime} 도착 · 작업 중</p>}
        </button>
        {(stage === "pending" || stage === "dispatched") && <MapLinkButtons site={siteOf(f)} />}
      </div>
      <div className="px-3.5 pb-3.5">
        {stage === "pending" && (
          <div className="flex gap-2">
            {role === "admin" && !f.assignee && onAssignOpen ? (
              <button
                onClick={() => onAssignOpen(f)}
                className="flex-1 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
              >
                기사 배정
              </button>
            ) : (
            <button
              onClick={() => onDispatch(f)}
              className="flex-1 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
            >
              {f.assignee ? "출동 응답" : "내가 출동하기"}
            </button>
            )}
            {onRefuse && f.assignee === me && (
              <button
                onClick={() => onRefuse(f)}
                className="shrink-0 text-xs font-bold text-red-500 border border-red-200 px-3 rounded-lg active:bg-red-50"
              >
                거부
              </button>
            )}
          </div>
        )}
        {stage === "dispatched" && (
          <div className="flex gap-2">
            <button
              onClick={() => onArrive(f)}
              className="flex-1 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
            >
              도착
            </button>
            {onRefuse && f.assignee === me && (
              <button
                onClick={() => onRefuse(f)}
                className="shrink-0 text-xs font-bold text-red-500 border border-red-200 px-3 rounded-lg active:bg-red-50"
              >
                취소
              </button>
            )}
          </div>
        )}
        {stage === "arrived" && (
          <button
            onClick={() => onOpenResult(f)}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 text-white text-xs font-bold py-2.5 rounded-lg active:bg-emerald-700"
          >
            <Wrench size={13} strokeWidth={2.5} /> 고장처리결과 입력
          </button>
        )}
      </div>
    </div>
  );
}


// 카드에서 현장 좌표를 찾기 위한 헬퍼 (길안내 버튼용)
function useSiteOf() {
  const sites = useContext(SitesContext);
  return (f) => sites.find((x) => x.id === f.siteId);
}

// dist: 기사 홈에서 미배정 고장까지의 거리(km). 있으면 거리 뱃지를 보여준다(없으면 생략).
const fmtDist = (km) => (km == null ? null : km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`);
// 이력 표시용 MM/DD (재발 배지·상세 이력 목록 공용)
const fmtMD = (d) => { const x = new Date(d); return `${String(x.getMonth() + 1).padStart(2, "0")}/${String(x.getDate()).padStart(2, "0")}`; };
export function FailureMiniCard({ f, dist, warnCount = 0, onOpenDetail, onDispatch, onArrive, onOpenResult, onRefuse, onAssignOpen }) {
  const siteOf = useSiteOf();
  const stage = failureStage(f);
  const { name: me, role } = useContext(AuthContext);
  // 상태별 컬러 — 작업중(초록)/출동중(파랑)/응답대기(노랑) 우선, 그다음 미배정을 세분:
  // 운행정지(빨강 심각) / 지원미배정=지원요청에서 넘어옴(주황) / 일반 미배정(빨강)
  const state = stage === "arrived" ? { label: "작업중", bar: "border-l-amber-500", chip: "bg-amber-50 text-amber-600" }
    : stage === "dispatched" ? { label: "출동중", bar: "border-l-blue-500", chip: "bg-blue-50 text-blue-600" }
    : f.assignee ? { label: `${f.assignee} 응답대기`, bar: "border-l-amber-400", chip: "bg-amber-50 text-amber-600" }
    : f.escalation === "운행정지" ? { label: "운행정지", bar: "border-l-red-600", chip: "bg-red-100 text-red-700" }
    : f.escalation === "지원요청" ? { label: "지원미배정", bar: "border-l-amber-500", chip: "bg-amber-100 text-amber-700" }
    : { label: "미배정", bar: "border-l-red-500", chip: "bg-red-50 text-red-600" };
  return (
    <div className={`w-full rounded-xl border border-slate-200 border-l-4 ${state.bar} bg-white overflow-hidden`}>
      {/* 개요 카드 — 현장명을 윗줄에 통째로 두고, 지도·버튼은 아랫줄로 내려 이름이 눌리지 않게 한다 */}
      <button type="button" onClick={() => onOpenDetail(f)} className="w-full text-left px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-slate-800 text-sm truncate flex-1 min-w-0">{f.siteName}{formatUnitLabel(f.elevatorNo) ? ` · ${formatUnitLabel(f.elevatorNo)}` : ""}</p>
          <span className={`shrink-0 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${state.chip}`}>{state.label}</span>
          {warnCount >= 3 && <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-red-100 text-red-600" title={`최근 30일 ${warnCount}회 고장`}><Repeat size={10} strokeWidth={2.8} />{warnCount}</span>}
        </div>
        <p className="text-[11px] text-slate-400 truncate flex items-center gap-0.5 mt-0.5">
          {dist != null && <span className="inline-flex items-center gap-0.5 font-bold text-blue-600"><MapPin size={11} strokeWidth={2.5} />{fmtDist(dist)} ·</span>}
          <span className="truncate">{f.errorCode}</span>
        </p>
      </button>
      {stage !== "done" && (
        <div className="flex items-center gap-2 px-3.5 pb-3">
          {(stage === "pending" || stage === "dispatched") && <MapLinkButtons site={siteOf(f)} />}
          {stage === "pending" && (
            role === "admin" && onAssignOpen ? (
              <button type="button" onClick={() => onAssignOpen(f)} className="flex-1 bg-blue-700 text-white text-xs font-bold py-2 rounded-lg active:bg-blue-800">{f.assignee ? "재배정" : "기사 배정"}</button>
            ) : (
              <>
                <button type="button" onClick={() => onDispatch(f)} className="flex-1 bg-blue-700 text-white text-xs font-bold py-2 rounded-lg active:bg-blue-800">{f.assignee ? "출동 응답" : "내가 출동하기"}</button>
                {onRefuse && f.assignee === me && <button type="button" onClick={() => onRefuse(f)} className="shrink-0 text-xs font-bold text-red-500 border border-red-200 px-3 py-2 rounded-lg active:bg-red-50">거부</button>}
              </>
            )
          )}
          {stage === "dispatched" && (
            <>
              <button type="button" onClick={() => onArrive(f)} className="flex-1 bg-blue-700 text-white text-xs font-bold py-2 rounded-lg active:bg-blue-800">도착 ({f.etaMinutes}분)</button>
              {onRefuse && f.assignee === me && <button type="button" onClick={() => onRefuse(f)} className="shrink-0 text-xs font-bold text-red-500 border border-red-200 px-3 py-2 rounded-lg active:bg-red-50">취소</button>}
            </>
          )}
          {stage === "arrived" && (
            <button type="button" onClick={() => onOpenResult(f)} className="flex-1 inline-flex items-center justify-center gap-1 bg-emerald-600 text-white text-xs font-bold py-2 rounded-lg active:bg-emerald-700"><Wrench size={13} strokeWidth={2.5} /> 결과입력</button>
          )}
        </div>
      )}
    </div>
  );
}


function FailureUnassignedList({ failures, onDispatch, onArrive, onResult, onRefuse, onAssign, attendances, todayLeaves, errorCodes }) {
  const [assignTarget, setAssignTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [resultTarget, setResultTarget] = useState(null);
  const { role, selfId, engineers = [] } = useContext(AuthContext);
  const sites = useContext(SitesContext);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const selfLoc = engineers.find((e) => e.id === selfId);
  const selfCoord = selfLoc?.last_lat != null ? { lat: selfLoc.last_lat, lng: selfLoc.last_lng } : null;
  const distOf = (f) => { const s = siteById.get(f.siteId); return distanceKm(selfCoord, s?.lat != null ? { lat: s.lat, lng: s.lng } : null); };
  // 미배정 미처리를 기사 위치 기준 가까운 순으로 (거리 못 구하면 뒤로)
  const list = failures.filter((f) => !f.assignee && f.status === "미처리").sort((a, b) => {
    const da = distOf(a), db = distOf(b);
    if (da == null && db == null) return 0;
    if (da == null) return 1; if (db == null) return -1;
    return da - db;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24 space-y-3">
        {list.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">미배정 고장이 없습니다</p>
        ) : (
          list.map((f) => (
            <FailureResponseCard key={f.id} f={f}
              dist={distOf(f)} history={unitHistory(failures, f)} site={siteById.get(f.siteId)}
              onOpenDetail={setDetailTarget} onDispatch={setDispatchTarget}
              onAssignOpen={role === "admin" ? setAssignTarget : null} />
          ))
        )}
      </div>

      {detailTarget && (
        <FailureDetailSheet
          failure={detailTarget}
          failures={failures}
          onClose={() => setDetailTarget(null)}
          onDispatch={setDispatchTarget}
          onArrive={onArrive}
          onOpenResult={setResultTarget}
          onAssignOpen={setAssignTarget}
        />
      )}
      {assignTarget && (
        <AssignEngineerSheet failure={assignTarget} failures={failures} onAssign={onAssign} attendances={attendances} todayLeaves={todayLeaves} onClose={() => setAssignTarget(null)} />
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
      {resultTarget && (
        <ArrivalResultModal
          failure={resultTarget}
          failures={failures}
          errorCodes={errorCodes}
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


function FailureProcessRegister({ failures, onDispatch, onArrive, onResult, onRefuse, onAssign, attendances, todayLeaves, errorCodes }) {
  const [assignTarget, setAssignTarget] = useState(null);
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [showDone, setShowDone] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [resultTarget, setResultTarget] = useState(null);
  const mine = failures.filter((f) => f.assignee === CURRENT_ENGINEER);
  const active = mine.filter((f) => f.status !== "완료");
  const done = mine.filter((f) => f.status === "완료");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24">
        <p className="text-sm font-bold text-slate-700 mb-2">처리중인 고장</p>
        <div className="space-y-2.5 mb-5">
          {active.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">처리중인 고장이 없습니다</p>
          ) : (
            active.map((f) => (
              <FailureActionCard onRefuse={onRefuse}
                key={f.id}
                f={f}
                onOpenDetail={setDetailTarget}
                onDispatch={setDispatchTarget}
                onArrive={onArrive}
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
                <FailureStatusCard key={f.id} f={f} onOpenDetail={setDetailTarget} canReassign={false} />
              ))
            )}
          </div>
        )}
      </div>

      {detailTarget && (
        <FailureDetailSheet
          failure={detailTarget}
          failures={failures}
          onClose={() => setDetailTarget(null)}
          onDispatch={setDispatchTarget}
          onArrive={onArrive}
          onOpenResult={setResultTarget}
          onAssignOpen={setAssignTarget}
        />
      )}
      {assignTarget && (
        <AssignEngineerSheet failure={assignTarget} failures={failures} onAssign={onAssign} attendances={attendances} todayLeaves={todayLeaves} onClose={() => setAssignTarget(null)} />
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
      {resultTarget && (
        <ArrivalResultModal
          failure={resultTarget}
          failures={failures}
          errorCodes={errorCodes}
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


// 처리현황 카드 — 상태별로 필요한 정보를 담는다:
// 완료(초록): 증상·원인·조치·처리자·도착~완료 시각 / 진행중(파랑·초록): 현재 단계·배정자 / 미처리(빨강): 미배정·접수
function FailureStatusCard({ f, onOpenDetail, onReassign, canReassign }) {
  const { faultType, faultDetail } = parseErrorCode(f.errorCode);
  const stage = failureStage(f);
  // 미처리는 그냥 '미처리'로 뭉치지 않고 운행정지·지원미배정·응답대기·미배정으로 구분해 보여준다.
  const state = f.status === "완료"
    ? { bar: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-700", label: f.processResult || "완료" }
    : f.status === "진행중"
    ? (stage === "arrived"
        ? { bar: "border-l-amber-500", chip: "bg-amber-50 text-amber-600", label: "작업중" }
        : { bar: "border-l-blue-500", chip: "bg-blue-50 text-blue-600", label: "출동중" })
    : f.escalation === "운행정지"
    ? { bar: "border-l-red-600", chip: "bg-red-100 text-red-700", label: "운행정지" }
    : f.escalation === "지원요청"
    ? { bar: "border-l-amber-500", chip: "bg-amber-100 text-amber-700", label: "지원미배정" }
    : f.assignee
    ? { bar: "border-l-amber-400", chip: "bg-amber-50 text-amber-600", label: "응답대기" }
    : { bar: "border-l-red-400", chip: "bg-red-50 text-red-600", label: "미배정" };
  const who = f.assignee
    ? f.status === "완료" && f.completeTime
      ? `${f.assignee} · ${f.arrivalTime ? f.arrivalTime + " 도착 → " : ""}${f.completeTime} 완료`
      : stage === "arrived" && f.arrivalTime ? `${f.assignee} · ${f.arrivalTime} 도착`
      : stage === "dispatched" ? `${f.assignee} · 출동 ${f.dispatchedAt}`
      : f.assignee
    : `미배정 · ${f.reportedAt} 접수`;
  return (
    <div className={`rounded-xl border border-slate-200 border-l-4 ${state.bar} bg-white overflow-hidden`}>
      <button type="button" onClick={() => onOpenDetail(f)} className="w-full text-left p-3.5">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="font-bold text-slate-800 text-sm truncate">{f.siteName} · {formatUnitLabel(f.elevatorNo)}</p>
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${state.chip}`}>{state.label}</span>
        </div>
        <div className="flex items-start gap-1.5 mb-1">
          <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[13px] min-w-0"><span className="font-bold text-slate-700">{faultType}</span>{faultDetail && <span className="text-slate-500"> · {faultDetail}</span>}</p>
        </div>
        {f.status === "완료" && (f.faultCause || f.processContent) && (
          <div className="text-[11px] text-slate-500 space-y-0.5 mb-1.5 pl-[19px]">
            {f.faultCause && <p className="truncate">원인 · {f.faultCause}</p>}
            {f.processContent && <p className="truncate">조치 · {f.processContent}</p>}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
          <User size={12} className="shrink-0" /><span className="truncate">{who}</span>
        </div>
      </button>
      {canReassign && (
        <div className="px-3.5 pb-3">
          <button onClick={() => onReassign(f)} className="text-[11px] font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5 active:bg-blue-50">재배정</button>
        </div>
      )}
    </div>
  );
}

function FailureStatusOverview({ failures, onReassign, attendances = [], todayLeaves = [] }) {
  const { name: CURRENT_ENGINEER, role } = useContext(AuthContext);
  const [detailTarget, setDetailTarget] = useState(null);
  const [reassignTarget, setReassignTarget] = useState(null);
  const [filter, setFilter] = useState("all"); // all · 미처리(미배정) · 진행중 · 완료
  const mine = failures.filter((f) => f.assignee === CURRENT_ENGINEER);
  const myDone = mine.filter((f) => f.status === "완료").length;
  const myUndone = mine.filter((f) => f.status !== "완료").length;
  // 기사는 본인 배정 건만, 관리자만 전사 — 처리현황이 역할 무관 전체를 보여주던 누수 차단 (P2-1)
  const base = role === "admin" ? failures : mine;
  const allDone = base.filter((f) => f.status === "완료").length;
  const allProcessing = base.filter((f) => f.status === "진행중").length;
  const allUndone = base.filter((f) => f.status === "미처리").length;
  // 필터 칩 = 상태별. '미배정' 칩은 status 미처리(미배정·지원미배정·운행정지·응답대기 포함).
  const FILTERS = [
    { key: "all", label: "전체", count: base.length },
    { key: "미처리", label: "미배정", count: allUndone },
    { key: "진행중", label: "진행중", count: allProcessing },
    { key: "완료", label: "완료", count: allDone },
  ];
  const shown = filter === "all" ? base : base.filter((f) => f.status === filter);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 py-4 shrink-0">
        {mine.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
            <span className="text-[13px] font-bold text-blue-700">내 진행</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 처리 {myDone}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 미처리 {myUndone}</span>
          </div>
        )}
        <div className="flex gap-1.5">
          {FILTERS.map((flt) => (
            <button
              key={flt.key}
              onClick={() => setFilter(flt.key)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                filter === flt.key ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-600 border-slate-200 active:bg-slate-50"
              }`}
            >
              {flt.label} {flt.count}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24 space-y-2.5">
        {shown.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">{filter === "all" ? "고장 접수 이력이 없습니다" : "해당 상태의 고장이 없습니다"}</p>
        ) : (
          shown.map((f) => (
            <FailureStatusCard key={f.id} f={f} onOpenDetail={setDetailTarget} onReassign={setReassignTarget}
              canReassign={role === "admin" && f.status !== "완료" && !!f.assignee} />
          ))
        )}
      </div>

      {detailTarget && <FailureDetailSheet failure={detailTarget} failures={failures} onClose={() => setDetailTarget(null)} />}
      {reassignTarget && (
        <AssignEngineerSheet failure={reassignTarget} failures={failures} onAssign={onReassign} attendances={attendances} todayLeaves={todayLeaves} onClose={() => setReassignTarget(null)} allowUnassign />
      )}
    </div>
  );
}


// 에러코드집 — 기종 선택 후 코드 검색, 클릭 시 의미·원인·조치법 + 과거 처리이력. 읽기전용(수정은 관리자 콘솔).
function ErrorCodeBook({ errorCodes, failures }) {
  const units = useContext(UnitsContext);
  const models = [...new Set(errorCodes.map((e) => e.model))].sort();
  const [model, setModel] = useState(models[0] ?? "");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const list = errorCodes.filter((e) => e.model === model && (e.code.includes(query) || (e.meaning ?? "").includes(query)));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pt-4 space-y-2 shrink-0">
        <select className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}>
          {models.length === 0 && <option value="">등록된 기종이 없습니다</option>}
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className={inputCls} placeholder="코드·의미 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 pb-24">
        {list.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">{model ? "등록된 코드가 없습니다" : "기종을 선택하세요"}</p>
        ) : (
          list.map((e) => (
            <button key={e.id} type="button" onClick={() => setSelected(e)} className="w-full text-left rounded-lg bg-white border border-slate-200 px-3 py-2.5 active:bg-slate-50">
              <p className="font-bold text-slate-800 text-sm">{e.code}</p>
              <p className="text-xs text-slate-500 mt-0.5">{e.meaning || "의미 미등록"}</p>
            </button>
          ))
        )}
      </div>
      {selected && (
        <Sheet title={`${selected.model} · ${selected.code}`} onClose={() => setSelected(null)}>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">의미</p>
              <p className="text-sm text-slate-800">{selected.meaning || "의미 미등록"}</p>
            </div>
            {selected.commonCause && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">흔한 원인</p>
                <p className="text-sm text-slate-800">{selected.commonCause}</p>
              </div>
            )}
            {selected.standardAction && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">표준 조치법</p>
                <p className="text-sm text-slate-800">{selected.standardAction}</p>
              </div>
            )}
            <div>
              {(() => {
                const history = errorCodeHistory(failures, units, selected.model, selected.code);
                return (
                  <>
                    <p className="text-xs font-bold text-slate-500 mb-1.5">과거 처리사례 {history.length > 0 && `(${history.length})`}</p>
                    {history.length === 0 ? (
                      <p className="text-xs text-slate-400">아직 처리된 사례가 없습니다.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {history.map((h) => (
                          <li key={h.id} className="rounded-lg bg-slate-50 border border-slate-200/70 px-3 py-2">
                            <p className="text-xs font-semibold text-slate-700">{fmtMD(h.createdAt)} · {h.siteName}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{[h.faultSymptom, h.faultCause, h.processContent].filter(Boolean).join(" → ") || "내용 없음"}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

export function FailureTab({ failures, setFailures, onDispatch, onArrive, onResult, onRefuse, onAssign, onReassign, focusSubTab, onFocusHandled, toast, attendances = [], todayLeaves = [], errorCodes = [], onReported }) {
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [subTab, setSubTab] = useState("접수등록");
  // 홈 "모두 보기" 등 외부에서 특정 서브탭으로 진입 (SiteTab focusSiteId와 같은 패턴)
  useEffect(() => {
    if (focusSubTab) { setSubTab(focusSubTab); onFocusHandled?.(); }
  }, [focusSubTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const subTabs = ["접수등록", "미배정", "처리등록", "처리현황", "에러코드집"];
  const unassignedCount = failures.filter((f) => !f.assignee && f.status === "미처리").length;
  // 처리등록 배지는 그 탭에서 보여주는 "처리중인 고장"(active) 목록과 동일한 기준 —
  // 미처리(출동 전)뿐 아니라 진행중(도착 후 결과 미등록)도 아직 처리등록이 끝난 게 아니라서 포함한다.
  const waitingCount = failures.filter((f) => f.assignee === CURRENT_ENGINEER && f.status !== "완료").length;
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
      {subTab === "접수등록" && <FailureRegisterForm onReported={onReported} onDispatch={onDispatch} failures={failures} setFailures={setFailures} goToUnassigned={() => setSubTab("미배정")} />}
      {subTab === "미배정" && (
        <FailureUnassignedList failures={failures} onDispatch={onDispatch} onArrive={onArrive} onResult={onResult} onRefuse={onRefuse} onAssign={onAssign} attendances={attendances} todayLeaves={todayLeaves} errorCodes={errorCodes} />
      )}
      {subTab === "처리등록" && (
        <FailureProcessRegister failures={failures} onDispatch={onDispatch} onArrive={onArrive} onResult={onResult} onRefuse={onRefuse} onAssign={onAssign} attendances={attendances} todayLeaves={todayLeaves} errorCodes={errorCodes} />
      )}
      {subTab === "처리현황" && <FailureStatusOverview failures={failures} onReassign={onReassign} attendances={attendances} todayLeaves={todayLeaves} />}
      {subTab === "에러코드집" && <ErrorCodeBook errorCodes={errorCodes} failures={failures} />}
      <SmsToast message={toast} />
    </div>
  );
}
