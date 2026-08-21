import React, { useState, useContext, useRef } from "react";
import { createPortal } from "react-dom";
import { X, MapPin, Search, ClipboardCheck, PhoneCall, Flag, Mail, User, Paperclip, Download, KeyRound, ChevronDown, ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { siteUnitList, realInstallPlace, addDays, labelToSeq, govDateToDashed, shortDate, recentFailuresBySite, siteMatchesQuery, unitContractBadges, unitBadgeLabel, initialOf, INITIALS } from "@/lib/utils";
import { RESULT_LABEL } from "@/lib/constants";
import { sanitizeFilename, extOf, downloadPhoto, downloadPhotosAsZip } from "@/lib/photos";
import { useLiveInspections, useInspectionHistory, mapGovResultToCode } from "@/app/hooks/useLiveInspections";
import { Badge, TimelineRow, HistoryCard, PrimaryButton, Sheet, Field, inputCls, DrillHeader, MapLinkButtons, SwipeSubtabTrack, SwipeIndicatorBar, PhotoLightboxPane } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { BillingCard } from "@/app/components/tabs/BillingTab";
import { useSwipeSubtab } from "@/app/hooks/useSwipeSubtab";
import { usePhotoLightboxGestures } from "@/app/hooks/usePhotoLightboxGestures";
import { PartPhotosPanel } from "@/app/components/tabs/PartPhotosPanel";


/* ---- 승강기정보 화면 (정보 / 고장 / 검사) ---- */
function ElevatorDetailScreen({ site, unit, subTab, setSubTab, failures, inspections, billings, quoteRequests, todos, unitPartPhotos, onAddUnitPartPhoto, onRemoveUnitPartPhoto, onBack, onHome }) {
  // v2: units 테이블에서 이 호기의 실제 정보(호기별 모델·설치일·고유번호)를 찾는다.
  // 마이그레이션 전 DB에서는 realUnit이 없어 기존 방식(site 공통값) 그대로 동작.
  const allUnits = useContext(UnitsContext);
  const realUnit = allUnits.find((u) => u.siteId === site.id && u.seq === labelToSeq(unit));
  const unitFailures = failures.filter((f) =>
    realUnit?.id && f.unitId ? f.unitId === realUnit.id : f.siteId === site.id && f.elevatorNo === unit
  );
  const unitIndex = (realUnit ? realUnit.seq : labelToSeq(unit)) - 1;
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
  const unitQuotes = [...quoteRequests
    .filter((q) => (realUnit?.id && q.unitId ? q.unitId === realUnit.id : q.siteId === site.id && q.elevatorNo === unit))]
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));
  const unitPhotos = (unitPartPhotos ?? []).filter((p) => p.unitId === realUnit?.id);
  const [inspectionFailTarget, setInspectionFailTarget] = useState(null);
  const [photoViewer, setPhotoViewer] = useState(null);
  const elevatorSubTabs = ["정보", "고장", "검사", "교체내역", "부품현황", "견적내역"];
  const swipe = useSwipeSubtab(elevatorSubTabs, subTab, setSubTab);

  // 정보/고장/검사/교체내역/부품현황 각 탭의 패널 — SwipeSubtabTrack이 드래그 중 옆 탭을 함께 렌더링할 때 쓴다.
  function renderElevatorPane(tab) {
    if (tab === "정보") return (
          <div className="bg-slate-50 pb-6">
            <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-400">기본정보</p>
            <div className="bg-white">
              <TimelineRow icon={Flag} label="건물명" value={site.name} />
              <TimelineRow icon={Flag} label="호기" value={unit} />
              <TimelineRow icon={Flag} label="승강기번호" value={liveInfo?.govElevatorNo || "미등록"} valueColor={liveInfo ? "text-blue-600" : "text-slate-700"} />
              <TimelineRow icon={Flag} label="승강기종류" value={realUnit?.kind || "-"} />
              <TimelineRow icon={Flag} label="승강기형식" value={realUnit?.form || "-"} />
              <TimelineRow icon={Flag} label="승강기모델" value={realUnit?.model || site.elevatorModel || "-"} />
              <TimelineRow icon={Flag} label="제조업체" value={realUnit?.manufacturer || "-"} />
              <TimelineRow icon={Flag} label="설치일자" value={realUnit?.installDate || "-"} />
              <TimelineRow icon={Flag} label="운행구간" value={realUnit?.runSection || "-"} />
              <TimelineRow icon={Flag} label="적재하중" value={realUnit?.loadKg ? `${realUnit.loadKg}kg` : "-"} />
              <TimelineRow icon={Flag} label="정원" value={realUnit?.capacityPersons ? `${realUnit.capacityPersons}인승` : "-"} />
              <TimelineRow icon={Flag} label="비상통화장치" value={site.emergencyPhone || "-"} valueColor={site.emergencyPhone ? "text-blue-600" : "text-slate-700"} />
              <TimelineRow icon={Flag} label="보험" value={realUnit?.insurer ? `${realUnit.insurer} (~${realUnit.insuranceEnd ?? "?"})` : "-"} valueColor="text-blue-600" last />
            </div>
            {liveInfo && <p className="px-5 pt-2 text-[10px] text-slate-400">* 국가승강기정보센터 실시간 데이터</p>}
          </div>
        );

    if (tab === "고장") return (
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
        );

    if (tab === "검사") return (
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
        );

    if (tab === "교체내역") return (
          <div className="bg-slate-50 pt-4 pb-6 px-5">
            <p className="pb-3 text-xs font-bold text-slate-400">교체내역</p>
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
        );

    if (tab === "부품현황") return (
      <PartPhotosPanel
        unitId={realUnit?.id}
        photos={unitPhotos}
        onAdd={onAddUnitPartPhoto}
        onRemove={onRemoveUnitPartPhoto}
      />
    );

    return (
          <div className="bg-slate-50 pt-4 pb-6 px-5">
            <p className="pb-3 text-xs font-bold text-slate-400">견적내역</p>
            {unitQuotes.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">등록된 견적 내역이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {unitQuotes.map((q) => {
                  // 어플 "나의 견적 요청 전체보기"(MaterialTab.jsx QuoteHistoryScreen)와 동일한
                  // 4단계(QUOTE_STAGES) + 비용청구완료 오버레이 배지를 그대로 재사용한다.
                  const isBilled = (todos ?? []).some((t) => t.quoteRequestId === q.id && t.source !== "waste_return" && t.done === true);
                  const displayStage = isBilled ? "비용청구완료" : q.status;
                  const dateMap = { 요청접수: q.requestedDate, 작성: q.quoteIssuedDate, 승인: q.approvedDate, 자재지급완료: q.suppliedDate, 비용청구완료: q.suppliedDate };
                  const stageDate = dateMap[displayStage];
                  return (
                    <div key={q.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="font-bold text-sm text-slate-800 min-w-0">{q.quoteTitle || q.constructionType || "견적"}</p>
                        <div className="flex flex-col items-center shrink-0">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                              displayStage === "비용청구완료" ? "bg-slate-100 text-slate-500" :
                              displayStage === "자재지급완료" ? "bg-emerald-100 text-emerald-700" :
                              displayStage === "승인" ? "bg-indigo-100 text-indigo-700" :
                              displayStage === "작성" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {displayStage === "비용청구완료" ? "비용청구 완료" : displayStage}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5">{stageDate || "-"}</span>
                        </div>
                      </div>
                      {q.quotePdfUrl && (
                        <a href={q.quotePdfUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 font-semibold mt-1.5 inline-block">
                          PDF 보기
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="승강기정보" onBack={onBack} onHome={onHome} />
      <div className="flex border-b border-slate-100 shrink-0 relative">
        {elevatorSubTabs.map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1 min-w-0 truncate ${subTab === t ? "text-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
        <SwipeIndicatorBar swipe={swipe} />
      </div>

      <SwipeSubtabTrack
        swipe={swipe}
        tabs={elevatorSubTabs}
        trackClassName="flex-1"
        paneClassName="overflow-y-auto"
        renderTab={renderElevatorPane}
      />
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


// 사진이 여러 장이면 좌우로 드래그해서 넘겨볼 수 있는 전체화면 뷰어입니다. 확대는 더블탭·핀치·휠.
export function PhotoViewerSheet({ urls, index, siteName, date, onClose }) {
  const [current, setCurrent] = useState(index);
  const baseName = sanitizeFilename(`${siteName || "사진"}_${date || ""}`.replace(/_$/, ""));
  const { containerRef, idx, showPrev, showNext, trackStyle, zoom, pan, isGesturing, handlers } =
    usePhotoLightboxGestures(urls.length, current, setCurrent);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  // 다운로드는 앱에서 안드로이드 다운로드 매니저로 넘기고 나면 끝 — 눌러도 화면이 그대로라
  // "됐나?" 싶은 게 당연하다. 카톡처럼 하단에 진행 토스트를 잠깐 띄운다.
  const [toast, setToast] = useState(null);

  async function handleDownloadOne() {
    setDownloadMenuOpen(false);
    setToast("다운로드중...");
    try {
      const filename = urls.length > 1 ? `${baseName}_${current + 1}.${extOf(urls[current])}` : `${baseName}.${extOf(urls[current])}`;
      await Promise.all([downloadPhoto(urls[current], filename), new Promise((r) => setTimeout(r, 400))]);
      setToast("저장했습니다.");
      setTimeout(() => setToast(null), 1500);
    } catch {
      setToast(null);
      alert("사진 다운로드에 실패했습니다");
    }
  }

  async function handleDownloadAll() {
    setDownloadMenuOpen(false);
    setToast("다운로드중...");
    try {
      await Promise.all([downloadPhotosAsZip(urls, `${baseName}.zip`, baseName), new Promise((r) => setTimeout(r, 400))]);
      setToast("저장했습니다.");
      setTimeout(() => setToast(null), 1500);
    } catch {
      setToast(null);
      alert("사진 다운로드에 실패했습니다");
    }
  }

  // body Portal로 렌더 — 이 화면 트리 어딘가의 transform(예: PullToRefresh)에 fixed가
  // 갇혀서 다른 모달(Sheet 등, 이미 body 포탈) 뒤로 숨어버리는 걸 피한다.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-white text-xs font-semibold">{current + 1} / {urls.length}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDownloadMenuOpen(true)} className="text-white p-1" aria-label="다운로드">
            <Download size={20} />
          </button>
          <button type="button" onClick={onClose} className="text-white p-1">
            <X size={22} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 relative min-h-0 touch-none overflow-hidden" {...handlers}>
        {urls.length > 1 && (
          <button type="button" onClick={() => setCurrent((c) => Math.max(0, c - 1))} className="absolute left-2 z-20 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 rounded-full p-2">
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="flex h-full" style={trackStyle}>
          {showPrev && <PhotoLightboxPane key={idx - 1} url={urls[idx - 1]} />}
          <PhotoLightboxPane key={idx} url={urls[idx]} active zoom={zoom} pan={pan} isGesturing={isGesturing} />
          {showNext && <PhotoLightboxPane key={idx + 1} url={urls[idx + 1]} />}
        </div>
        {urls.length > 1 && (
          <button type="button" onClick={() => setCurrent((c) => Math.min(urls.length - 1, c + 1))} className="absolute right-2 z-20 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 rounded-full p-2">
            <ChevronRight size={24} />
          </button>
        )}
      </div>
      {urls.length > 1 && (
        <div className="flex justify-center gap-1.5 pt-2 pb-5 shrink-0">
          {urls.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === current ? "bg-white" : "bg-white/30"}`} />
          ))}
        </div>
      )}

      {downloadMenuOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40" onClick={() => setDownloadMenuOpen(false)}>
          <div className="bg-white rounded-t-2xl p-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            {urls.length > 1 && (
              <button onClick={handleDownloadAll} className="w-full text-center text-sm font-bold text-slate-800 py-3.5 rounded-xl active:bg-slate-100">
                {urls.length}장 모두 저장
              </button>
            )}
            <button onClick={handleDownloadOne} className="w-full text-center text-sm font-bold text-slate-800 py-3.5 rounded-xl active:bg-slate-100">
              이 사진만 저장
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[60] bg-slate-800/90 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>,
    document.body
  );
}


/* ---- 현장정보 화면 ---- */
function SiteDetailScreen({ site, siteManagers, onBack, onHome, onOpenUnit, onUpdateSiteNotes, onUpdateSiteAccessInfo }) {
  const allUnits = useContext(UnitsContext);
  const units = siteUnitList(site, allUnits); // 실제 호기(개수로 1..N 합성 금지)
  const { engineers, role } = useContext(AuthContext);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(site.notes ?? "");
  const [editingAccessInfo, setEditingAccessInfo] = useState(false);
  const [accessInfoDraft, setAccessInfoDraft] = useState(site.accessInfo ?? "");
  const assignedEngineerProfile = engineers.find((e) => e.name === site.assignedEngineer) ?? null;
  // 관리자웹에서 ★로 지정한 대표 담당자만 기본 노출 — 없으면 첫 번째 담당자를 대표로 본다(관리자웹과 동일한 폴백).
  const primaryManager = siteManagers.find((m) => m.isPrimary) ?? siteManagers[0] ?? null;
  const otherManagers = siteManagers.filter((m) => m.id !== primaryManager?.id);
  const [managersExpanded, setManagersExpanded] = useState(false);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="현장정보" onBack={onBack} onHome={onHome} />
      <div className="flex-1 overflow-y-auto bg-slate-50 pb-6">
        <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-400">상세정보</p>
        <div className="bg-white">
          <TimelineRow icon={Flag} label="현장명" value={site.name} />
          <TimelineRow icon={Flag} label="대수" value={`${units.length} 대`} />
          <TimelineRow
            icon={MapPin}
            label="주소"
            valueColor="text-blue-600"
            value={site.address}
          />
          {/* 호기별 보수료 합계(관리자웹 SitesAdmin.jsx가 항상 최신으로 동기화) — 관리자 계정에만 노출 */}
          {role === "admin" && (
            <TimelineRow
              icon={Receipt}
              label="보수료(VAT별도)"
              value={site.maintenanceCost != null ? `${Number(site.maintenanceCost).toLocaleString()}원` : "-"}
            />
          )}
          {primaryManager && (
            <>
              <TimelineRow icon={User} label={primaryManager.role || "담당자"} value={primaryManager.name || "-"} />
              <TimelineRow icon={PhoneCall} label={`${primaryManager.role || "담당자"} 전화번호`} value={primaryManager.phone || "-"} valueColor="text-blue-600" />
              <TimelineRow icon={Mail} label={`${primaryManager.role || "담당자"} 메일주소`} value={primaryManager.email || "-"} />
              <TimelineRow icon={Paperclip} label={`${primaryManager.role || "담당자"} FAX`} value={primaryManager.fax || "-"} />
            </>
          )}
          {otherManagers.length > 0 && (
            <TimelineRow
              icon={User}
              label={managersExpanded ? "담당자 접기" : "담당자 더보기"}
              valueColor="text-blue-600"
              value={
                <span className="inline-flex items-center gap-1">
                  {otherManagers.length}명
                  <ChevronDown size={14} className={`transition-transform ${managersExpanded ? "rotate-180" : ""}`} />
                </span>
              }
              onClick={() => setManagersExpanded((v) => !v)}
            />
          )}
          {managersExpanded && otherManagers.map((m) => {
            const roleLabel = m.role || "담당자";
            return (
              <React.Fragment key={m.id}>
                <TimelineRow icon={User} label={roleLabel} value={m.name || "-"} />
                <TimelineRow icon={PhoneCall} label={`${roleLabel} 전화번호`} value={m.phone || "-"} valueColor="text-blue-600" />
                <TimelineRow icon={Mail} label={`${roleLabel} 메일주소`} value={m.email || "-"} />
                <TimelineRow icon={Paperclip} label={`${roleLabel} FAX`} value={m.fax || "-"} />
              </React.Fragment>
            );
          })}
          {siteManagers.length === 0 && <TimelineRow icon={User} label="담당자" value="등록된 담당자가 없습니다" />}
          {/* 출입 정보 — 공동현관 비번·기계실 열쇠 위치. 갇힘 출동 때 바로 봐야 하는 정보라 별도 줄로, 비고 위에 고정 */}
          <TimelineRow
            icon={KeyRound}
            label="출입 정보"
            value={site.accessInfo ? site.accessInfo : "터치해서 입력"}
            valueColor={site.accessInfo ? "text-slate-700" : "text-slate-400"}
            multiline
            onClick={() => {
              setAccessInfoDraft(site.accessInfo ?? "");
              setEditingAccessInfo(true);
            }}
          />
          <TimelineRow
            icon={ClipboardCheck}
            label="특이사항"
            value={site.notes ? site.notes : "터치해서 입력"}
            valueColor={site.notes ? "text-slate-700" : "text-slate-400"}
            multiline
            last
            onClick={() => {
              setNotesDraft(site.notes ?? "");
              setEditingNotes(true);
            }}
          />
        </div>

        <p className="px-5 pt-5 pb-2 text-xs font-bold text-slate-400">담당기사 정보</p>
        <div className="bg-white">
          <TimelineRow icon={User} label="이름" value={site.assignedEngineers?.length ? site.assignedEngineers.join(", ") : "미배정"} />
          <TimelineRow icon={PhoneCall} label="휴대폰번호" value={assignedEngineerProfile?.phone || "-"} valueColor="text-blue-600" last />
        </div>

        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-400">호기</p>
          <span className="text-xs font-semibold text-blue-600">리스트보기입니다</span>
        </div>
        <div className="bg-white">
          {units.map((u, idx) => (
            <div key={u.unitNo} className="flex px-5">
              <div className="flex flex-col items-center mr-3 pt-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                {idx !== units.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-baseline justify-between gap-2 py-2.5">
                  <p className="text-sm font-bold text-slate-800">
                    {u.unitNo}{realInstallPlace(u) ? ` · ${realInstallPlace(u)}` : ""} ({u.govNo || site.govElevatorNos?.[idx] || "승강기고유번호 미등록"})
                    {unitBadgeLabel(u) && (
                      <span className="ml-1.5 text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-1.5 py-0.5 align-middle">{unitBadgeLabel(u)}</span>
                    )}
                  </p>
                  {site.emergencyPhone && (
                    <p className="text-xs font-semibold text-slate-500 shrink-0">비상통화장치 {site.emergencyPhone}</p>
                  )}
                </div>
                <button
                  onClick={() => onOpenUnit(u.unitNo)}
                  className="w-full bg-blue-500 text-white text-sm font-bold py-2.5 rounded-md active:bg-blue-600 mb-1"
                >
                  상세내용
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingAccessInfo && (
        <Sheet title="출입 정보" onClose={() => setEditingAccessInfo(false)}>
          <Field label="공동현관 비번·기계실 열쇠 위치">
            <textarea
              className={inputCls}
              rows={4}
              placeholder="예: 공동현관 1234#, 기계실 열쇠는 경비실"
              value={accessInfoDraft}
              onChange={(e) => setAccessInfoDraft(e.target.value)}
            />
          </Field>
          <PrimaryButton
            onClick={async () => {
              await onUpdateSiteAccessInfo(site.id, accessInfoDraft.trim());
              setEditingAccessInfo(false);
            }}
          >
            저장
          </PrimaryButton>
        </Sheet>
      )}

      {editingNotes && (
        <Sheet title="특이사항" onClose={() => setEditingNotes(false)}>
          <Field label="특이사항">
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


export function SiteTab({ inspections, failures, billings, quoteRequests, todos, siteManagers, onUpdateSiteNotes, onUpdateSiteAccessInfo, unitPartPhotos, onAddUnitPartPhoto, onRemoveUnitPartPhoto }) {
  const allSites = useContext(SitesContext);
  const allUnits = useContext(UnitsContext);
  const { name: CURRENT_ENGINEER, role } = useContext(AuthContext);
  // 기사는 "내 현장만"이 기본(전체는 체크 해제로) — 관리자는 담당현장 개념이 없어 토글 없이 전체.
  const sites = allSites;
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(role === "engineer");
  const [view, setView] = useState("list"); // list | site | elevator
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [elevatorSubTab, setElevatorSubTab] = useState("정보");
  const indexBarRef = useRef(null);
  const [activeInitial, setActiveInitial] = useState(null);   // 드래그 중인 자음 (놓으면 null)
  const [dragging, setDragging] = useState(false);            // 마우스용 — 터치는 touchend로 끝난다

  // 계약종료 현장은 기본 목록에는 안 보이고, 검색어로 직접 찾을 때만 나온다.
  // 761개짜리 목록이라 **가나다순으로 세운다** — 정렬이 없으면 자음 인덱스가 뜻이 없고,
  // 눈으로 훑어 찾는 것도 불가능하다.
  const list = sites
    .filter((s) => query.trim() || s.isActive !== false)
    .filter((s) => siteMatchesQuery(s, query, { units: allUnits, siteManagers }))
    .filter((s) => !onlyMine || s.assignedEngineers?.includes(CURRENT_ENGINEER))
    .slice()
    // 숫자·영문으로 시작하는 이름은 뒤로 뺀다 — 인덱스 바에서도 "#"가 맨 아래라 순서를 맞춘다.
    // (localeCompare 기본값은 숫자를 앞에 세워서 인덱스와 어긋났다)
    .sort((a, b) => {
      const na = initialOf(a.name) === "#", nb = initialOf(b.name) === "#";
      if (na !== nb) return na ? 1 : -1;
      return (a.name ?? "").localeCompare(b.name ?? "", "ko");
    });

  // 각 초성이 처음 나오는 현장 id — 인덱스를 누르면 그 카드로 보낸다.
  const firstOfInitial = new Map();
  for (const s of list) {
    const k = initialOf(s.name);
    if (!firstOfInitial.has(k)) firstOfInitial.set(k, s.id);
  }
  // 검색 중이거나 목록이 짧으면 인덱스는 방해만 된다.
  const showIndex = !query.trim() && list.length >= 30;

  // 인덱스는 **쓸어내리면 따라 움직인다**(iOS 연락처 방식). 톡톡 눌러 찾는 것보다 훨씬 빠르다.
  // 드래그 중에는 smooth 스크롤을 쓰지 않는다 — 애니메이션이 손가락을 못 따라와 밀린다.
  function jumpTo(initial, smooth = true) {
    const id = firstOfInitial.get(initial);
    if (!id) return false;   // 그 자음으로 시작하는 현장이 없으면 아무 일도 하지 않는다
    document.getElementById(`site-${id}`)?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    return true;
  }

  // 손가락 y좌표 → 자음. 버튼 하나하나에 이벤트를 다는 대신 막대 전체에서 비율로 계산한다
  // (드래그 중에는 손가락 아래 요소가 계속 바뀌어서 개별 버튼 이벤트로는 못 따라간다).
  function pickAt(clientY) {
    const el = indexBarRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.floor(((clientY - r.top) / r.height) * INITIALS.length);
    const c = INITIALS[Math.min(INITIALS.length - 1, Math.max(0, i))];
    if (c === activeInitial) return;       // 같은 칸 안에서 움직일 때는 아무것도 안 한다
    if (jumpTo(c, false)) setActiveInitial(c);
  }

  function latestInspection(siteId) {
    return inspections.find((i) => i.siteId === siteId) ?? null;
  }
  function openFailures(siteId) {
    return failures.filter((f) => f.siteId === siteId && f.status !== "완료").length;
  }
  // 최근 30일 고장 건수 — 처리완료 여부와 무관하게 누적(집중관리 판정용, 홈/대시보드와 동일 기준).
  const recentFailuresMap = recentFailuresBySite(failures);

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
        quoteRequests={quoteRequests}
        todos={todos}
        unitPartPhotos={unitPartPhotos}
        onAddUnitPartPhoto={onAddUnitPartPhoto}
        onRemoveUnitPartPhoto={onRemoveUnitPartPhoto}
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
        onUpdateSiteAccessInfo={onUpdateSiteAccessInfo}
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
            placeholder="현장정보·현장담당자정보·승강기정보 검색"
            className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          {role === "engineer" ? (
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              내 현장만 보기
            </label>
          ) : <span />}
          <p className="text-[11px] text-slate-400">총 {allSites.length}개 현장 중 {list.length}건 표시</p>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
      <div className={`h-full overflow-y-auto pr-5 pb-4 space-y-2.5 ${showIndex ? "pl-9" : "pl-5"}`}>
        {list.map((s) => {
          const insp = latestInspection(s.id);
          const openF = openFailures(s.id);
          const contractBadges = unitContractBadges(siteUnitList(s, allUnits));
          return (
            <div
              key={s.id}
              id={`site-${s.id}`}
              onClick={() => { setSelectedSite(s); setView("site"); }}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-3.5 active:bg-slate-50 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className={`font-bold text-sm ${s.isActive === false ? "text-slate-400 line-through" : "text-slate-800"}`}>{s.name} · {siteUnitList(s, allUnits).length}대</p>
                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  {contractBadges.map((b) => (
                    <span key={b} className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{b}</span>
                  ))}
                  {(recentFailuresMap.get(s.id)?.length ?? 0) >= 3 && (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">집중관리</span>
                  )}
                  {openF > 0 && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">미처리 고장 {openF}건</span>
                  )}
                  {insp?.result && <Badge result={insp.result} />}
                  {s.isActive === false && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">계약종료</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-400 truncate">{s.address}</p>
                <MapLinkButtons site={s} />
              </div>
              {s.isActive === false && (s.terminatedDate || s.terminationReason) && (
                <p className="text-[11px] text-red-600 mt-1">
                  {s.terminatedDate && `종료일자 ${shortDate(s.terminatedDate)}`}
                  {s.terminationReason && ` · 사유 ${s.terminationReason}`}
                </p>
              )}
            </div>
          );
        })}
        {list.length === 0 && <p className="text-xs text-slate-400 text-center py-8">검색 결과가 없습니다</p>}
      </div>

      {/* 자음 인덱스 — 761개를 훑어 찾을 수단. 검색은 이름을 알 때 쓰고, 이건 모를 때 쓴다.
          해당 자음의 현장이 없으면 흐리게 두고 눌러도 반응하지 않는다(빈 곳으로 튀면 더 혼란스럽다). */}
      {showIndex && (
        // **왼쪽**에 세운다 — 오른쪽은 카드마다 지도(티맵·카카오맵) 버튼이 있어서 인덱스가 그걸 덮는다.
        // 아래쪽은 플로팅 버튼(게시판·관리자)이 차지하므로 그 위까지만 세운다 — 겹치면 ㅌㅍㅎ#을 못 누른다.
        // touch-none: 막대 위에서는 브라우저 기본 스크롤을 막아야 드래그가 목록 스크롤로 새지 않는다.
        <div
          ref={indexBarRef}
          className="absolute left-0.5 top-2 bottom-28 w-7 flex flex-col justify-center gap-px z-10 touch-none select-none"
          onTouchStart={(e) => pickAt(e.touches[0].clientY)}
          onTouchMove={(e) => pickAt(e.touches[0].clientY)}
          onTouchEnd={() => setActiveInitial(null)}
          onTouchCancel={() => setActiveInitial(null)}
          onMouseDown={(e) => { setDragging(true); pickAt(e.clientY); }}
          onMouseMove={(e) => { if (dragging) pickAt(e.clientY); }}
          onMouseUp={() => { setDragging(false); setActiveInitial(null); }}
          onMouseLeave={() => { setDragging(false); setActiveInitial(null); }}
        >
          {INITIALS.map((c) => {
            const has = firstOfInitial.has(c);
            const on = activeInitial === c;
            return (
              // 개별 버튼이 아니라 표시용 — 실제 선택은 막대 전체에서 좌표로 판단한다.
              <span
                key={c}
                className={`text-[10px] font-bold leading-none py-[3px] text-center rounded pointer-events-none transition-colors ${
                  on ? "bg-blue-700 text-white" : has ? "text-blue-700" : "text-slate-200"
                }`}
              >
                {c}
              </span>
            );
          })}
        </div>
      )}

      {/* 드래그 중 지금 어느 자음인지 크게 보여준다 — 막대가 얇아 손가락에 가려서 안 보인다. */}
      {activeInitial && (
        <div className="absolute left-10 top-1/2 -translate-y-1/2 z-20 w-14 h-14 rounded-2xl bg-slate-900/85 text-white flex items-center justify-center text-2xl font-extrabold pointer-events-none">
          {activeInitial}
        </div>
      )}
      </div>
    </div>
  );
}
