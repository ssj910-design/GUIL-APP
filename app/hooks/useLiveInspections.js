import { useState, useEffect } from "react";


// 국가승강기정보센터 API의 최종검사판정결과 문자열을 앱 내부 코드로 변환합니다.
function mapGovResultToCode(resultNm) {
  if (resultNm === "합격") return "pass";
  if (resultNm === "조건부합격") return "conditional";
  if (resultNm === "불합격") return "fail";
  return null;
}


// 승강기고유번호가 등록된 현장들의 검사결과를 국가승강기정보센터 API에서 실시간으로 가져옵니다.
// 현장의 등록된 승강기고유번호(호기별)를 조회 대상 목록으로 펼쳐줍니다.
export function siteToUnitQueries(site) {
  return (site.govElevatorNos ?? [])
    .map((no, idx) => ({ key: `${site.id}-${idx}`, siteId: site.id, siteName: site.name, govElevatorNo: no }))
    .filter((q) => q.govElevatorNo);
}


// queries: [{ key, siteId, siteName, govElevatorNo }] — 호기 하나당 하나씩 실시간 조회합니다.
export function useLiveInspections(queries) {
  const [live, setLive] = useState([]);
  const key = queries.map((q) => `${q.key}:${q.govElevatorNo}`).join(",");

  useEffect(() => {
    if (queries.length === 0) {
      setLive([]);
      return;
    }
    let cancelled = false;
    async function loadAll() {
      const results = await Promise.all(
        queries.map(async (q) => {
          try {
            const res = await fetch(`/api/elevator-info?elevatorNo=${encodeURIComponent(q.govElevatorNo)}`);
            const data = await res.json();
            // 같은 건물의 다른 호기가 함께 반환될 수 있어, 실제로 등록한 번호와 일치하는 항목만 남깁니다.
            const items = (data.items ?? []).filter((item) => item.elevatorNo === q.govElevatorNo);
            return items.map((item) => ({
              id: `gov-${q.key}`,
              siteId: q.siteId,
              siteName: q.siteName,
              elevatorNo: item.installationPlace || item.elevatorNo,
              dueDate: item.applcEnDt,
              startDate: item.applcBeDt,
              result: mapGovResultToCode(item.resultNm),
              org: "한국승강기안전공단",
              type: "정기검사",
              notes: item.resultNm === "조건부합격" || item.resultNm === "불합격" ? `국가승강기정보센터 최종검사판정결과: ${item.resultNm}` : "",
              // 승강기정보(정보 탭)에서 쓰는 실제 제원 정보
              govElevatorNo: item.elevatorNo,
              kindNm: item.elvtrKindNm,
              form: item.elvtrForm,
              detailForm: item.elvtrDetailForm,
              statusNm: item.elvtrSttsNm,
              liveLoad: item.liveLoad,
              ratedCap: item.ratedCap,
              groundFloorCnt: item.groundFloorCnt,
              undgrndFloorCnt: item.undgrndFloorCnt,
              frstInstallationDe: item.frstInstallationDe,
              shuttleSection: item.shuttleSection,
            }));
          } catch {
            return [];
          }
        })
      );
      if (!cancelled) setLive(results.flat());
    }
    loadAll();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return live;
}
