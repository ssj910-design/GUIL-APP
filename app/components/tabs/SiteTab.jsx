import React, { useState, useEffect, useContext, useRef } from "react";
import { X, MapPin, Search, ClipboardCheck, PhoneCall, Flag, Mail, User, Paperclip, Flame, Download } from "lucide-react";
import { siteUnits, addDays, labelToSeq, govDateToDashed, formatShortDate } from "@/lib/utils";
import { RESULT_LABEL } from "@/lib/constants";
import { sanitizeFilename, extOf, downloadPhoto, downloadPhotosAsZip } from "@/lib/photos";
import { useLiveInspections, useInspectionHistory, mapGovResultToCode } from "@/app/hooks/useLiveInspections";
import { Badge, TimelineRow, HistoryCard, PrimaryButton, Sheet, Field, inputCls, DrillHeader } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { BillingCard } from "@/app/components/tabs/BillingTab";


/* ---- 승강기정보 화면 (정보 / 고장 / 검사) ---- */
function ElevatorDetailScreen({ site, unit, subTab, setSubTab, failures, inspections, billings, onBack, onHome }) {
  // v2: units 테이블에서 이 호기의 실제 정보(호기별 모델·설치일·고유번호)를 찾는다.
  // 마이그레이션 전 DB에서는 realUnit이 없어 기존 방식(site 공통값) 그대로 동작.
  const allUnits = useContext(UnitsContext);
  const realUnit = allUnits.find((u) => u.siteId === site.id && u.seq === labelToSeq(unit));
  const unitFailures = failures.filter((f) =>
    realUnit?.id && f.unitId ? f.unitId === realUnit.id : f.siteId === site.id && f.elevatorNo === unit
  );
  const unitIndex = (realUnit ? realUnit.seq : Number(unit?.split("-")[1])) - 1;
  const unitGovNo = realUnit?.govNo ?? site.govElevatorNos?.[unitIndex];
  const liveInspections = useLiveInspections(
    unitGovNo ? [{ key: `${site.id}-${unitIndex}`, siteId: site.id, siteName: site.name, govElevatorNo: unitGovNo }] : []
  );
  const liveInfo = liveInspections[0];
  // 검사이력 탭: 최신 상태 1건이 아니라 과거 전체 검사결과(합격·조건부합격·불합격)를 나열한다.
  const { history: inspectionHistory, loading: historyLoading } = useInspectionHistory(unitGovNo);
  const manualInspections = [...inspections.filter((i) => i.siteId === site.id)].sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));
  // 호기가 지정된 청구건은 그 호기에서만, 호기 미지정(기존) 청구건은 현장 전체에서 계속 보여줍니다.
  const unitBillings = billings.filter((b) => b.siteName === site.name && (!b.elevatorNo || b.elevatorNo === unit));
  const [inspectionFailTarget, setInspectionFailTarget] = useState(null);
  const [photoViewer, setPhotoViewer] = useState(null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="승강기정보" onBack={onBack} onHome={onHome} />
      <div className="flex border-b border-slate-100 shrink-0">
        {["정보", "고장", "검사", "부품교체내역"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1 ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === "정보" && (
          <div className="bg-slate-50 pb-6">
            <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-400">기본정보</p>
            <div className="bg-white">
              <TimelineRow icon={Flag} label="건물명" value={site.name} />
              <TimelineRow icon={Flag} label="호기" value={unit} />
              <TimelineRow icon={Flag} label="승강기번호" value={liveInfo?.govElevatorNo || "미등록"} valueColor={liveInfo ? "text-blue-600" : "text-slate-700"} />
              <TimelineRow icon={Flag} label="승강기종류" value={liveInfo?.kindNm || realUnit?.kind || "-"} />
              <TimelineRow icon={Flag} label="승강기형식" value={liveInfo?.form || realUnit?.form || "-"} />
              <TimelineRow icon={Flag} label="승강기모델" value={realUnit?.model || site.elevatorModel || "-"} />
              <TimelineRow icon={Flag} label="제조업체" value={realUnit?.manufacturer || "-"} />
              <TimelineRow icon={Flag} label="설치일자" value={liveInfo?.frstInstallationDe || realUnit?.installDate || "-"} />
              <TimelineRow icon={Flag} label="운행층수" value={liveInfo?.groundFloorCnt ? `지상 ${liveInfo.groundFloorCnt} / 지하 ${liveInfo.undgrndFloorCnt ?? 0}` : realUnit?.floors || "-"} />
              <TimelineRow icon={Flag} label="운행구간" value={liveInfo?.shuttleSection || realUnit?.runSection || "-"} />
              <TimelineRow icon={Flag} label="적재하중" value={liveInfo?.liveLoad ? `${liveInfo.liveLoad}kg` : realUnit?.loadKg ? `${realUnit.loadKg}kg` : "-"} />
              <TimelineRow icon={Flag} label="정원" value={liveInfo?.ratedCap ? `${liveInfo.ratedCap}인승` : realUnit?.capacityPersons ? `${realUnit.capacityPersons}인승` : "-"} />
              <TimelineRow icon={Flag} label="보험" value={realUnit?.insurer ? `${realUnit.insurer} (~${realUnit.insuranceEnd ?? "?"})` : "-"} valueColor="text-blue-600" last />
            </div>
            {liveInfo && <p className="px-5 pt-2 text-[10px] text-slate-400">* 국가승강기정보센터 실시간 데이터</p>}
          </div>
        )}

        {subTab === "고장" && (
          <div className="bg-slate-50 pt-4 pb-2">
            <p className="px-5 pb-3 text-xs font-bold text-slate-400">고장 과거이력</p>
            {unitFailures.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">등록된 고장 이력이 없습니다</p>
            ) : (
              <div className="px-5 space-y-4">
                {unitFailures.map((f) => {
                  const barColor = f.status === "완료" ? "#10b981" : f.status === "진행중" ? "#f59e0b" : "#ef4444";
                  const rows = [
                    { label: "접수", value: f.errorCode },
                    { label: "처리상태", value: f.escalation ? `${f.status} (${f.escalation})` : f.status },
                  ];
                  if (f.faultSymptom) rows.push({ label: "증상", value: f.faultSymptom });
                  if (f.faultErrorCode) rows.push({ label: "에러코드", value: f.faultErrorCode });
                  rows.push({ label: "원인", value: f.faultCause || (f.status === "완료" ? "-" : "확인중") });
                  if (f.processContent) rows.push({ label: "처리내용", value: f.processContent });
                  if (f.processNote) rows.push({ label: "비고", value: f.processNote });
                  if (f.photoCount > 0) rows.push({ label: "사진", value: `${f.photoCount}장` });
                  return (
                    <div key={f.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                      <HistoryCard
                        noPadding
                        barColor={barColor}
                        title={f.errorCode.split(" ")[0]}
                        badge={1}
                        rows={rows}
                        date={`2026-${f.reportedAt.replace("/", "-")}`}
                        tags={[f.assignee ?? "미배정", site.name]}
                        timeCols={[
                          { label: "접수", value: f.reportedAt, color: "text-red-500" },
                          { label: "출동", value: f.dispatchedAt ? `${f.dispatchedAt} (${f.etaMinutes}분)` : "-", color: "text-amber-500" },
                          { label: "도착", value: f.arrivalTime ?? "-", color: "text-emerald-600" },
                        ]}
                      />
                      {f.photoUrls?.length > 0 && (
                        <div className="flex gap-2 mt-2 overflow-x-auto">
                          {f.photoUrls.map((url, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setPhotoViewer({ urls: f.photoUrls, index: i, siteName: site.name, date: `2026-${f.reportedAt.replace("/", "-")}` })}
                              className="shrink-0"
                            >
                              <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {subTab === "검사" && (
          <div className="bg-slate-50 pt-4 pb-2">
            <p className="px-5 pb-3 text-xs font-bold text-slate-400">검사이력</p>
            {unitGovNo ? (
              historyLoading ? (
                <p className="text-xs text-slate-400 text-center py-10">국가승강기정보센터에서 검사이력을 조회하는 중...</p>
              ) : inspectionHistory.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-10">등록된 검사 이력이 없습니다</p>
              ) : (
                <div className="px-5 space-y-4">
                  {inspectionHistory.map((h, hi) => {
                    const resultCode = mapGovResultToCode(h.record.dispWords);
                    const clickable = resultCode === "conditional" || resultCode === "fail";
                    const inspDate = govDateToDashed(h.record.inspctDe);
                    const runStart = govDateToDashed(h.record.applcBeDt);
                    const runEnd = govDateToDashed(h.record.applcEnDt);
                    const openTarget = () => setInspectionFailTarget({
                      inspection: { siteName: site.name, elevatorNo: unit, result: resultCode, govElevatorNo: unitGovNo },
                      preloaded: h,
                    });
                    return (
                      <div
                        key={hi}
                        onClick={clickable ? openTarget : undefined}
                        onTouchEnd={clickable ? (e) => { e.preventDefault(); openTarget(); } : undefined}
                        className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 ${clickable ? "touch-manipulation cursor-pointer active:opacity-70" : ""}`}
                      >
                        <HistoryCard
                          noPadding
                          barColor={resultCode === "fail" ? "#ef4444" : resultCode === "conditional" ? "#f59e0b" : "#10b981"}
                          title={h.record.inspctKindNm ? `${h.record.inspctKindNm}검사` : "정기검사"}
                          rows={[
                            { label: "결과", value: RESULT_LABEL[resultCode] ?? h.record.dispWords ?? "-" },
                            { label: "검사기관", value: h.record.inspctInsttNm ?? "-" },
                          ]}
                          timeCols={[
                            { label: "검사일", value: inspDate ?? "-", color: "text-red-500" },
                            { label: "유효시작일", value: runStart ?? "-", color: "text-amber-500" },
                            { label: "유효종료일", value: runEnd ?? "-", color: "text-emerald-600" },
                          ]}
                        />
                        {clickable && <p className="mt-2 text-[10px] text-blue-600 font-semibold">터치해서 부적합 상세 항목 보기</p>}
                      </div>
                    );
                  })}
                </div>
              )
            ) : manualInspections.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">등록된 검사 이력이 없습니다</p>
            ) : (
              <div className="px-5 space-y-4">
                {manualInspections.map((insp) => {
                  const runEnd = insp.dueDate;
                  const runStart = insp.startDate || addDays(runEnd, -365);
                  const inspDate = insp.startDate || addDays(runStart, -5);
                  return (
                    <div key={insp.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                      <HistoryCard
                        noPadding
                        barColor={insp.result === "fail" ? "#ef4444" : insp.result === "conditional" ? "#f59e0b" : "#10b981"}
                        title={insp.type}
                        rows={[
                          { label: "상태", value: insp.result ? "완료" : "예정" },
                          { label: "결과", value: insp.result ? RESULT_LABEL[insp.result] : "미정" },
                          { label: "검사기관", value: insp.org },
                        ]}
                        timeCols={[
                          { label: "검사일", value: inspDate, color: "text-red-500" },
                          { label: "운행시작일", value: runStart, color: "text-amber-500" },
                          { label: "운행종료일", value: runEnd, color: "text-emerald-600" },
                        ]}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {subTab === "부품교체내역" && (
          <div className="bg-slate-50 pt-4 pb-6 px-5">
            <p className="pb-3 text-xs font-bold text-slate-400">부품교체내역</p>
            {unitBillings.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">등록된 부품교체 내역이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {unitBillings.map((b) => (
                  <BillingCard
                    key={b.id}
                    b={b}
                    onPhotoClick={(urls, i) => setPhotoViewer({ urls, index: i, siteName: b.siteName, date: b.replaceDate })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {inspectionFailTarget && (
        <InspectionFailDetailSheet
          inspection={inspectionFailTarget.inspection}
          preloaded={inspectionFailTarget.preloaded}
          onClose={() => setInspectionFailTarget(null)}
        />
      )}
      {photoViewer && (
        <PhotoViewerSheet
          urls={photoViewer.urls}
          index={photoViewer.index}
          siteName={photoViewer.siteName}
          date={photoViewer.date}
          onClose={() => setPhotoViewer(null)}
        />
      )}
    </div>
  );
}


// 사진이 여러 장이면 좌우로 드래그해서 넘겨볼 수 있는 전체화면 뷰어입니다.
export function PhotoViewerSheet({ urls, index, siteName, date, onClose }) {
  const [current, setCurrent] = useState(index);
  const [dragX, setDragX] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const startXRef = useRef(null);
  const draggingRef = useRef(false);
  const dragXRef = useRef(0);
  const containerRef = useRef(null);
  const baseName = sanitizeFilename(`${siteName || "사진"}_${date || ""}`.replace(/_$/, ""));

  async function handleDownloadOne() {
    if (downloading) return;
    setDownloading(true);
    try {
      const filename = urls.length > 1 ? `${baseName}_${current + 1}.${extOf(urls[current])}` : `${baseName}.${extOf(urls[current])}`;
      await downloadPhoto(urls[current], filename);
    } catch {
      alert("사진 다운로드에 실패했습니다");
    }
    setDownloading(false);
  }

  async function handleDownloadAll() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadPhotosAsZip(urls, `${baseName}.zip`, baseName);
    } catch {
      alert("사진 다운로드에 실패했습니다");
    }
    setDownloading(false);
  }

  function handleStart(clientX) {
    startXRef.current = clientX;
    draggingRef.current = true;
  }
  function handleMove(clientX) {
    if (!draggingRef.current || startXRef.current === null) return;
    const delta = clientX - startXRef.current;
    dragXRef.current = delta;
    setDragX(delta);
  }
  function handleEnd() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    startXRef.current = null;
    const threshold = 60;
    const delta = dragXRef.current;
    const width = containerRef.current?.offsetWidth || 375;
    dragXRef.current = 0;

    if (delta <= -threshold && current < urls.length - 1) {
      // 다음 사진: 지금 사진을 왼쪽 밖으로 부드럽게 밀어낸 뒤, 다음 사진으로 바꾸고 제자리로.
      setTransitioning(true);
      setDragX(-width);
      setTimeout(() => {
        setTransitioning(false);
        setCurrent((c) => c + 1);
        setDragX(0);
      }, 220);
    } else if (delta >= threshold && current > 0) {
      setTransitioning(true);
      setDragX(width);
      setTimeout(() => {
        setTransitioning(false);
        setCurrent((c) => c - 1);
        setDragX(0);
      }, 220);
    } else {
      // 기준에 못 미치면 부드럽게 제자리로 되돌립니다.
      setTransitioning(true);
      setDragX(0);
      setTimeout(() => setTransitioning(false), 220);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-white text-xs font-semibold">{current + 1} / {urls.length}</span>
        <button type="button" onClick={onClose} className="text-white p-1">
          <X size={22} />
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden select-none"
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => handleStart(e.clientX)}
        onMouseMove={(e) => { if (draggingRef.current) handleMove(e.clientX); }}
        onMouseUp={handleEnd}
        onMouseLeave={() => { if (draggingRef.current) handleEnd(); }}
      >
        <img
          src={urls[current]}
          alt=""
          draggable={false}
          className="max-w-full max-h-full object-contain"
          style={{ transform: `translateX(${dragX}px)`, transition: transitioning ? "transform 0.22s ease-out" : "none" }}
        />
      </div>
      {urls.length > 1 && (
        <div className="flex justify-center gap-1.5 pt-2 shrink-0">
          {urls.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === current ? "bg-white" : "bg-white/30"}`} />
          ))}
        </div>
      )}
      <div className="flex gap-2 px-4 pt-3 pb-5 shrink-0">
        <button
          type="button"
          onClick={handleDownloadOne}
          disabled={downloading}
          className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 text-white text-xs font-bold py-2.5 rounded-xl active:bg-white/20 disabled:opacity-50"
        >
          <Download size={14} /> 이 사진 다운로드
        </button>
        {urls.length > 1 && (
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloading}
            className="flex-1 flex items-center justify-center gap-1.5 bg-white text-slate-900 text-xs font-bold py-2.5 rounded-xl active:bg-slate-200 disabled:opacity-50"
          >
            <Download size={14} /> 전체 다운로드 ({urls.length}장 · zip)
          </button>
        )}
      </div>
    </div>
  );
}


/* ---- 현장정보 화면 ---- */
function SiteDetailScreen({ site, siteManagers, onBack, onHome, onOpenUnit, onUpdateSiteNotes }) {
  const units = siteUnits(site);
  const { engineers } = useContext(AuthContext);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(site.notes ?? "");
  const assignedEngineerProfile = engineers.find((e) => e.name === site.assignedEngineer) ?? null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="현장정보" onBack={onBack} onHome={onHome} />
      <div className="flex-1 overflow-y-auto bg-slate-50 pb-6">
        <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-400">상세정보</p>
        <div className="bg-white">
          <TimelineRow icon={Flag} label="승강기 번호" value={site.elevatorNo} valueColor="text-blue-600" />
          <TimelineRow icon={Flag} label="현장명" value={site.name} />
          <TimelineRow icon={Flag} label="대수" value={`${units.length} 대`} />
          <TimelineRow icon={MapPin} label="주소" value={site.address} valueColor="text-blue-600" />
          <TimelineRow icon={Flame} label="계약구분" value={site.contractType || "-"} valueColor={site.contractType === "FM(종합계약)" ? "text-red-600 font-bold" : "text-slate-700"} />
          {siteManagers.map((m, idx) => {
            const n = siteManagers.length > 1 ? `${idx + 1}` : "";
            return (
              <React.Fragment key={m.id}>
                <TimelineRow icon={User} label={`담당자${n}`} value={m.name || "-"} />
                <TimelineRow icon={PhoneCall} label={`담당자${n} 전화번호`} value={m.phone || "-"} valueColor="text-blue-600" />
                <TimelineRow icon={Mail} label={`담당자${n} 메일주소`} value={m.email || "-"} />
                <TimelineRow icon={Paperclip} label={`담당자${n} FAX`} value={m.fax || "-"} />
              </React.Fragment>
            );
          })}
          {siteManagers.length === 0 && <TimelineRow icon={User} label="담당자" value="등록된 담당자가 없습니다" />}
          <TimelineRow
            icon={ClipboardCheck}
            label="비고(전달사항)"
            value={site.notes ? site.notes : "터치해서 입력"}
            valueColor={site.notes ? "text-slate-700" : "text-slate-400"}
            last
            onClick={() => {
              setNotesDraft(site.notes ?? "");
              setEditingNotes(true);
            }}
          />
        </div>

        <p className="px-5 pt-5 pb-2 text-xs font-bold text-slate-400">담당기사 정보</p>
        <div className="bg-white">
          <TimelineRow icon={User} label="이름" value={site.assignedEngineer || "미배정"} />
          <TimelineRow icon={Mail} label="메일주소" value={assignedEngineerProfile?.email || "-"} />
          <TimelineRow icon={PhoneCall} label="휴대폰번호" value={assignedEngineerProfile?.phone || "-"} valueColor="text-blue-600" last />
        </div>

        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-400">호기</p>
          <span className="text-xs font-semibold text-blue-600">리스트보기입니다</span>
        </div>
        <div className="bg-white">
          {units.map((u, idx) => (
            <div key={u} className="flex px-5">
              <div className="flex flex-col items-center mr-3 pt-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                {idx !== units.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
              </div>
              <div className="flex-1 pb-3">
                <p className="text-sm font-bold text-slate-800 py-2.5">{u} ({site.govElevatorNos?.[idx] || "승강기고유번호 미등록"})</p>
                <button
                  onClick={() => onOpenUnit(u)}
                  className="w-full bg-blue-500 text-white text-sm font-bold py-2.5 rounded-md active:bg-blue-600 mb-1"
                >
                  상세내용
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingNotes && (
        <Sheet title="비고(전달사항)" onClose={() => setEditingNotes(false)}>
          <Field label="현장 전달사항">
            <textarea
              className={inputCls}
              rows={4}
              placeholder="예: 지하 기계실 열쇠는 경비실에 있음"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
            />
          </Field>
          <PrimaryButton
            onClick={async () => {
              await onUpdateSiteNotes(site.id, notesDraft.trim());
              setEditingNotes(false);
            }}
          >
            저장
          </PrimaryButton>
        </Sheet>
      )}
    </div>
  );
}


export function SiteTab({ inspections, failures, billings, siteManagers, onUpdateSiteNotes, focusSiteId, focusUnit, onFocusSiteHandled }) {
  const allSites = useContext(SitesContext);
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  // 현장관리는 기사·관리자 모두 전체 현장을 볼 수 있다 — "내 현장만 보기"로 좁혀볼 수 있다.
  const sites = allSites;
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [view, setView] = useState("list"); // list | site | elevator
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [elevatorSubTab, setElevatorSubTab] = useState("정보");

  // ★ 고장 출동 확정 후 해당 현장(호기)의 상세 화면으로 자동 이동
  useEffect(() => {
    if (!focusSiteId) return;
    const site = allSites.find((s) => s.id === focusSiteId);
    if (site) {
      setSelectedSite(site);
      if (focusUnit && siteUnits(site).includes(focusUnit)) {
        setSelectedUnit(focusUnit);
        setElevatorSubTab("정보");
        setView("elevator");
      } else {
        setView("site");
      }
    }
    onFocusSiteHandled();
  }, [focusSiteId]);

  const list = sites
    .filter((s) => s.name.includes(query.trim()))
    .filter((s) => !onlyMine || s.assignedEngineer === CURRENT_ENGINEER);

  function latestInspection(siteId) {
    return inspections.find((i) => i.siteId === siteId) ?? null;
  }
  function openFailures(siteId) {
    return failures.filter((f) => f.siteId === siteId && f.status !== "완료").length;
  }

  function backToList() {
    setView("list");
    setSelectedSite(null);
    setSelectedUnit(null);
  }

  // sites 배열이 갱신돼도(예: 비고 저장 후) 최신 정보가 보이도록 id로 다시 찾습니다.
  const liveSelectedSite = selectedSite ? sites.find((s) => s.id === selectedSite.id) ?? selectedSite : null;

  if (view === "elevator" && liveSelectedSite && selectedUnit) {
    return (
      <ElevatorDetailScreen
        site={liveSelectedSite}
        unit={selectedUnit}
        subTab={elevatorSubTab}
        setSubTab={setElevatorSubTab}
        failures={failures}
        inspections={inspections}
        billings={billings}
        onBack={() => setView("site")}
        onHome={backToList}
      />
    );
  }

  if (view === "site" && liveSelectedSite) {
    return (
      <SiteDetailScreen
        site={liveSelectedSite}
        siteManagers={siteManagers.filter((m) => m.siteId === liveSelectedSite.id)}
        onBack={backToList}
        onHome={backToList}
        onUpdateSiteNotes={onUpdateSiteNotes}
        onOpenUnit={(u) => {
          setSelectedUnit(u);
          setElevatorSubTab("정보");
          setView("elevator");
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pt-4 pb-2 shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="건물명으로 검색"
            className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            내 현장만 보기
          </label>
          <p className="text-[11px] text-slate-400">총 {allSites.length}개 현장 중 {list.length}건 표시</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
        {list.map((s) => {
          const insp = latestInspection(s.id);
          const openF = openFailures(s.id);
          return (
            <button
              key={s.id}
              onClick={() => { setSelectedSite(s); setView("site"); }}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-3.5 active:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-bold text-slate-800 text-sm">{s.name} · {siteUnits(s).length}대</p>
                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  {s.failures30d >= 3 && (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">집중관리</span>
                  )}
                  {openF > 0 && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">미처리 고장 {openF}건</span>
                  )}
                  {insp?.result && <Badge result={insp.result} />}
                </div>
              </div>
              <p className="text-[11px] text-slate-400">{s.address}</p>
            </button>
          );
        })}
        {list.length === 0 && <p className="text-xs text-slate-400 text-center py-8">검색 결과가 없습니다</p>}
      </div>
    </div>
  );
}
