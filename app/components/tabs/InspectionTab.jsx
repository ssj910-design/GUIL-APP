import { useState, useContext } from "react";
import { TODAY_STR } from "@/lib/constants";
import { unitsToInspections, formatMonthDay, stripCityPrefix, groupBySite, findUnitForInspection, govDateToDashed, activeSites } from "@/lib/utils";
import { Badge, DDay, MapLinkButtons, SwipeSubtabTrack, SwipeIndicatorBar, inputCls } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { usePriorFlaggedBadge, useInspectionFailItems } from "@/app/hooks/useLiveInspections";
import { useSwipeSubtab } from "@/app/hooks/useSwipeSubtab";


/* ------------------------------------------------------------------ */
/* INSPECTION (검사관리) - centerpiece                                  */
/* ------------------------------------------------------------------ */

// 검사도래현장 카드 한 장: 직전 검사가 조건부합격/조건후합격이면 현장명을 눌러 당시 부적합내역을 볼 수 있다.
function DueSoonCard({ insp, address, govElevatorNo, onOpenFail, site, priorUnit }) {
  const { latest, detailRecord } = usePriorFlaggedBadge(priorUnit);
  const clickable = Boolean(latest);
  return (
    <div
      onClick={clickable ? () => onOpenFail({
        id: `unit-hist-${govElevatorNo}`,
        siteName: insp.siteName,
        elevatorNo: insp.elevatorNo,
        result: "conditional",
        govElevatorNo,
        startDate: govDateToDashed(detailRecord.inspctDe),
      }) : undefined}
      className={`bg-white rounded-xl border border-slate-200 border-l-4 border-l-blue-500 overflow-hidden touch-manipulation ${clickable ? "cursor-pointer active:bg-slate-50" : ""}`}
    >
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="font-bold text-slate-800 text-[15px] truncate min-w-0">{insp.siteName} · {insp.elevatorNo}</p>
          <span className="shrink-0 flex items-center gap-1.5">
            <span className="text-xs font-extrabold text-blue-700 whitespace-nowrap">
              {insp.dueDate ? formatMonthDay(insp.dueDate) : "-"}{insp.dueTime ? ` ${insp.dueTime}` : ""}
            </span>
            <DDay dueDate={insp.dueDate} />
          </span>
        </div>
        <p className="text-[12px] text-slate-400 truncate mb-2">
          <span className="font-medium text-slate-500">{insp.type}</span>{address ? ` · ${address}` : ""}
        </p>
        <div className="flex items-center gap-2">
          {site && <MapLinkButtons site={site} />}
          {latest && (
            <span className="ml-auto shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-300">
              직전검사 {latest.dispWords}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// 조건부/불합격 카드의 부적합 내용 — 관리자 웹(InspectionsAdmin FlaggedRow)과 동일하게 클릭 없이
// 바로 보여준다. 기준조항 설명 줄은 빼고 실제 부적합 내용·검사원 의견만 표시.
function FlaggedFailInline({ insp }) {
  // sync-inspection-cache 크론이 매일 캐싱해둔 값을 우선 쓴다(즉시 표시). 아직 캐싱 전이면 실시간 조회로 대신한다.
  const hasCached = Array.isArray(insp.failItems);
  const live = useInspectionFailItems(!hasCached ? insp.govElevatorNo : null, insp.startDate);
  const loading = hasCached ? false : live.loading;
  const items = hasCached ? insp.failItems : live.items;
  const reason = hasCached ? insp.failReason : live.reason;

  if (loading) return <p className="text-[11px] text-slate-400 mt-2">부적합 상세 조회 중...</p>;
  if (!items?.length) {
    return (
      <p className="text-[11px] text-slate-400 mt-2">
        {reason === "no_record" ? "검사이력 없음"
          : reason === "no_fail_code" ? "부적합코드 없음"
          : reason === "fetch_failed" ? "조회 실패"
          : "부적합 상세 없음"}
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-1.5">
      {items.map((item, idx) => (
        <div key={idx} className="bg-red-50 rounded-lg px-2.5 py-1.5">
          <p className="text-[11px] font-semibold text-red-700">{item.failDesc}</p>
          {item.failDescInspector && <p className="text-[11px] text-slate-500 mt-0.5">검사원 의견: {item.failDescInspector}</p>}
        </div>
      ))}
    </div>
  );
}

export function InspectionTab({ inspections }) {
  const sites = useContext(SitesContext);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const { name: CURRENT_ENGINEER, role } = useContext(AuthContext);
  // 계약종료 현장은 검사도래·조건부/불합격 어느 쪽도 대응 대상이 아니므로 뺀다.
  const mySites = activeSites(role === "admin" ? sites : sites.filter((s) => s.assignedEngineers?.includes(CURRENT_ENGINEER)));
  const [subTab, setSubTab] = useState("검사도래현장");
  const [inspectionFailTarget, setInspectionFailTarget] = useState(null);
  const [flagSort, setFlagSort] = useState("imminent"); // 조건부/불합격 정렬: imminent(재검 임박순) | severity(불합격순)
  const [search, setSearch] = useState("");
  // 디폴트는 내 담당현장만, "모든 현장보기" 체크 시 전체 현장 — CheckupTab과 동일 패턴.
  // 조회 전용(체크해도 배정이 바뀌진 않음): 목록에만 영향을 주고, 진행상황 카운팅(아래)과
  // 홈 화면은 이 토글과 무관하게 항상 내 담당현장(관리자는 전체) 기준으로 고정한다.
  const [showAll, setShowAll] = useState(false);
  const viewSites = showAll ? activeSites(sites) : mySites;

  // 검사유효기간은 units의 DB 캐시를 쓴다 (전 호기 실시간 API 호출 금지 — 트래픽 한도).
  const allUnits = useContext(UnitsContext);

  // 도래현장: 관리자가 수기입력한 검사일자(inspections.due_date)가 있는 대상 현장 전부 (기간 제한 없음,
  // 국가승강기정보센터 API 연동 현장은 제외 — 홈 화면 검사도래현장과 동일 기준) — 검사일이 지나면(daysLeft < 0) 자동으로 빠진다.
  // 보완기한이 61일 이상 남은 건 아직 급하지 않으니 목록에서 뺀다(60일은 노출) — 기한 미정은 계속 노출.
  // 기한 미정(dueDate 없음)은 Infinity로 취급해 맨 아래로 — 임박순 정렬이 뒤집히지 않게.
  const flagCmp = flagSort === "severity"
    ? (a, b) => {
        const sev = (a.result === "fail" ? 0 : 1) - (b.result === "fail" ? 0 : 1);
        if (sev !== 0) return sev;
        return (a.dueDate ? +new Date(a.dueDate) : Infinity) - (b.dueDate ? +new Date(b.dueDate) : Infinity);
      }
    : (a, b) => (a.dueDate ? +new Date(a.dueDate) : Infinity) - (b.dueDate ? +new Date(b.dueDate) : Infinity);
  // 주어진 현장 범위(scopeSites)를 기준으로 도래/조건부·불합격 목록을 계산한다 — 진행상황
  // 카운팅(항상 mySites)과 실제 목록 표시(showAll에 따라 mySites 또는 전체)를 같은 로직으로
  // 따로 계산하기 위해 함수로 뽑아냈다.
  function computeInspectionLists(scopeSites) {
    const scopeSiteIds = new Set(scopeSites.map((s) => s.id));
    const liveInspections = unitsToInspections(allUnits, scopeSites).filter((i) => scopeSiteIds.has(i.siteId));
    const liveSiteIds = new Set(liveInspections.map((i) => i.siteId));
    const combined = [...liveInspections, ...inspections.filter((i) => !liveSiteIds.has(i.siteId) && scopeSiteIds.has(i.siteId))];

    const dueSoon = groupBySite(
      inspections
        .filter((i) => scopeSiteIds.has(i.siteId) && i.dueDate && !i.result)
        .filter((i) => !search || (i.siteName ?? "").toLowerCase().includes(search.toLowerCase()))
        .map((i) => ({ ...i, daysLeft: Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) }))
        .filter((i) => i.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft)
    );
    // groupBySite는 "이미 정렬된 목록"을 받아 그 순서를 유지한 채로만 같은 현장끼리
    // 묶는다 — 정렬(.sort)을 groupBySite보다 먼저 해야 한다. 원래 여기 순서가
    // 반대(묶은 다음 정렬)였어서 정렬이 그룹을 도로 흩어놨었다(관리자웹에도 같은
    // 문제가 있어 같이 고침). severity 모드는 "불합격이 조건부합격보다 항상 위"
    // 규칙이 있어서, 그 규칙이 현장 묶기 때문에 깨지지 않게 불합격/조건부합격을
    // 각각 따로 묶은 뒤 이어 붙인다. imminent 모드는 그런 구분이 없어 그냥 묶는다.
    const flaggedBase = combined
      .filter((i) => i.result === "conditional" || i.result === "fail")
      .filter((i) => !i.dueDate || Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) <= 60)
      .filter((i) => !search || (i.siteName ?? "").toLowerCase().includes(search.toLowerCase()))
      .sort(flagCmp);
    const flagged = flagSort === "severity"
      ? [...groupBySite(flaggedBase.filter((i) => i.result === "fail")), ...groupBySite(flaggedBase.filter((i) => i.result !== "fail"))]
      : groupBySite(flaggedBase);

    return { dueSoon, flagged };
  }

  // 진행상황 카운팅은 항상 내 담당현장(관리자는 전체) 기준 — "모든 현장보기" 토글과 무관.
  const { dueSoon: myDueSoon, flagged: myFlagged } = computeInspectionLists(mySites);
  // 실제 목록 표시는 토글에 따라 내 담당현장 또는 전체.
  const { dueSoon, flagged } = computeInspectionLists(viewSites);

  const inspectionSubTabs = ["검사도래현장", "조건부/불합격 현장"];
  const swipe = useSwipeSubtab(inspectionSubTabs, subTab, setSubTab);

  // 검사도래현장/조건부·불합격 현장 각 탭의 패널 — SwipeSubtabTrack이 드래그 방향에 따라
  // 현재 탭과 옆 탭을 동시에 렌더링할 때 이 함수로 각 탭의 내용을 얻는다.
  function renderInspectionPane(tab) {
    if (tab === "검사도래현장") {
      return dueSoon.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-10">도래한 검사 현장이 없습니다</p>
      ) : (
        dueSoon.map((insp) => {
          const priorUnit = findUnitForInspection(insp, allUnits);
          return (
            <DueSoonCard
              key={insp.id}
              insp={insp}
              address={stripCityPrefix(siteById.get(insp.siteId)?.address)}
              site={siteById.get(insp.siteId)}
              govElevatorNo={priorUnit?.govNo}
              priorUnit={priorUnit}
              onOpenFail={setInspectionFailTarget}
            />
          );
        })
      );
    }
    return flagged.length === 0 ? (
      <p className="text-xs text-slate-400 text-center py-10">조건부·불합격 현장이 없습니다</p>
    ) : (
      flagged.map((insp) => {
        const isLive = insp.id?.startsWith("unit-");
        // 불합격=빨강(심각) / 조건부합격=주황(주의) — 고장카드처럼 왼쪽 색바로 구분
        const bar = insp.result === "fail" ? "border-l-red-500" : "border-l-amber-400";
        return (
          <div
            key={insp.id}
            className={`bg-white rounded-xl border border-slate-200 border-l-4 ${bar} overflow-hidden touch-manipulation`}
          >
            <div className="p-3.5">
              {/* 우측엔 결과 배지 1개만 — 정기검사는 아래 주소 앞으로 빼서 우측 혼잡 해소 */}
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-bold text-slate-800 text-[15px] truncate min-w-0">{insp.siteName} · {insp.elevatorNo}</p>
                <Badge result={insp.result} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] text-slate-400 truncate min-w-0">
                  <span className="font-medium text-slate-500">{insp.type}</span>
                  {stripCityPrefix(siteById.get(insp.siteId)?.address) ? ` · ${stripCityPrefix(siteById.get(insp.siteId)?.address)}` : ""}
                </p>
                <span className="shrink-0 flex items-center gap-1.5">
                  {insp.dueDate && <span className="text-xs font-extrabold text-blue-700 whitespace-nowrap">{formatMonthDay(insp.dueDate)}</span>}
                  <DDay dueDate={insp.dueDate} />
                </span>
              </div>
              {isLive ? (
                <FlaggedFailInline insp={insp} />
              ) : (
                insp.notes && (
                  <p className="text-[11px] text-red-600 leading-relaxed bg-red-50 rounded-lg px-2.5 py-1.5 mt-2">지적사항: {insp.notes}</p>
                )
              )}
            </div>
          </div>
        );
      })
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100 shrink-0 relative">
        {inspectionSubTabs.map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1.5 ${subTab === t ? "text-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
        <SwipeIndicatorBar swipe={swipe} />
      </div>

      <div className="px-5 pt-4 pb-2 shrink-0 flex items-center justify-between">
        <p className="text-sm font-bold text-blue-700">진행상황</p>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 도래 {myDueSoon.length}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 조건부/불합격 {myFlagged.length}</span>
        </div>
      </div>

      <div className="px-5 pb-2 shrink-0">
        <input
          className={inputCls}
          placeholder="현장명 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="px-5 pb-2 shrink-0">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          모든 현장보기
        </label>
      </div>

      {subTab === "조건부/불합격 현장" && (
        <div className="px-5 pb-2 shrink-0 flex gap-1.5">
          {[{ k: "imminent", label: "재검 임박순" }, { k: "severity", label: "불합격순" }].map((s) => (
            <button
              key={s.k}
              onClick={() => setFlagSort(s.k)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${flagSort === s.k ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-500 border-slate-200"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <SwipeSubtabTrack
        swipe={swipe}
        tabs={inspectionSubTabs}
        trackClassName="flex-1"
        paneClassName="overflow-y-auto px-5 pb-4 space-y-2.5"
        renderTab={renderInspectionPane}
      />

      {inspectionFailTarget && (
        <InspectionFailDetailSheet inspection={inspectionFailTarget} onClose={() => setInspectionFailTarget(null)} />
      )}
    </div>
  );
}
