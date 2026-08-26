import { useState, useEffect } from "react";
import { govDateToDashed } from "@/lib/utils";
import { authFetch } from "@/lib/apiFetch";


// 국가승강기정보센터 API의 최종검사판정결과 문자열을 앱 내부 코드로 변환합니다.
export function mapGovResultToCode(resultNm) {
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
            const res = await authFetch(`/api/elevator-info?elevatorNo=${encodeURIComponent(q.govElevatorNo)}`);
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


// 승강기 한 대의 과거 전체 검사이력(합격/조건부합격/불합격, 회차별 부적합 상세 포함)을 조회합니다.
// 승강기정보 상세 "검사" 탭처럼 단건 화면에서만 씁니다 (전수 호출 방지).
export function useInspectionHistory(govElevatorNo) {
  const [state, setState] = useState({ loading: false, history: [], error: null });

  useEffect(() => {
    if (!govElevatorNo) {
      setState({ loading: false, history: [], error: null });
      return;
    }
    let cancelled = false;
    async function load() {
      setState({ loading: true, history: [], error: null });
      try {
        const res = await authFetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}`);
        const data = await res.json();
        if (!cancelled) setState({ loading: false, history: data.history ?? [], error: data.error ?? null });
      } catch {
        if (!cancelled) setState({ loading: false, history: [], error: "조회에 실패했습니다" });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [govElevatorNo]);

  return state;
}


// govElevatorNo(+startDate 있으면 그 회차)의 부적합 상세를 클릭 없이 바로 가져온다 —
// 검사관리 조건부·불합격 탭처럼 목록에서 바로 내용을 보여줄 때 씀.
// InspectionFailDetailSheet의 조회 로직과 같은 흐름(anchorDate 없으면 최신 회차를 찾아 한 번 더 조회)
// 이지만, 그 컴포넌트는 preloaded/재시도 UI까지 얽혀 있어 목록용으로 그대로 재사용하기보다 이쪽에 따로 둔다.
export function useInspectionFailItems(govElevatorNo, startDate) {
  const [state, setState] = useState({ loading: true, items: [], reason: null, record: null });

  useEffect(() => {
    if (!govElevatorNo) {
      setState({ loading: false, items: [], reason: null, record: null });
      return;
    }
    let cancelled = false;
    async function load() {
      setState((s) => ({ ...s, loading: true }));
      try {
        const hasAnchor = Boolean(startDate) && !Number.isNaN(new Date(startDate).getTime());
        const url = hasAnchor
          ? `/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}&anchorDate=${encodeURIComponent(startDate)}`
          : `/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}`;
        const res = await authFetch(url);
        const data = await res.json();
        if (cancelled) return;
        // route.js가 상위 API(getInspectsafeList) 자체가 실패했을 때 top-level error만 주고
        // reason은 안 채워주는 경우가 있다 — reason 없는 채로 두면 "검사이력 없음"으로 잘못
        // 표시된다(실제론 조회 자체가 안 된 것). fetch_failed로 통일한다.
        const reasonOf = (d) => d.reason ?? (d.error ? "fetch_failed" : null);
        if (hasAnchor) {
          setState({ loading: false, items: data.items ?? [], reason: reasonOf(data), record: data.record ?? null });
          return;
        }
        const latest = (data.history ?? [])[0];
        if (!latest) {
          setState({ loading: false, items: [], reason: reasonOf(data) ?? "no_record", record: null });
        } else if (latest.items !== undefined) {
          setState({ loading: false, items: latest.items ?? [], reason: reasonOf(latest), record: latest.record ?? null });
        } else {
          const latestAnchor = govDateToDashed(latest.record?.inspctDe);
          if (!latestAnchor || Number.isNaN(new Date(latestAnchor).getTime())) {
            setState({ loading: false, items: [], reason: "no_record", record: latest.record ?? null });
          } else {
            const res2 = await authFetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}&anchorDate=${encodeURIComponent(latestAnchor)}`);
            const data2 = await res2.json();
            if (cancelled) return;
            setState({ loading: false, items: data2.items ?? [], reason: reasonOf(data2), record: data2.record ?? null });
          }
        }
      } catch {
        if (!cancelled) setState({ loading: false, items: [], reason: "fetch_failed", record: null });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [govElevatorNo, startDate]);

  return state;
}


const PRIOR_FLAGGED_WORDS = ["조건부합격", "조건후합격"];

// 검사도래현장 목록에서 "직전 검사가 조건부합격/조건후합격이었는지" 가볍게 확인한다
// (부적합 상세는 안 받는 latestOnly 조회 — 회차마다 부적합 상세까지 받는 전체이력 조회보다 훨씬 쌈).
// "조건후합격" 회차 자체는 부적합코드(failCd)가 없어(석산빌딩 실데이터로 확인), 그 앞의
// 조건부합격/불합격 회차를 detailRecord로 같이 돌려준다 — 부적합내역 조회는 이 회차 기준으로 해야 한다.
export function usePriorFlaggedInspection(govElevatorNo) {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    if (!govElevatorNo) return;
    let cancelled = false;
    authFetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}&latestOnly=1`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setRecords(data.records ?? []); })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [govElevatorNo]);

  const latest = records[0];
  if (!latest || !PRIOR_FLAGGED_WORDS.includes(latest.dispWords)) {
    return { latest: null, detailRecord: null };
  }
  const detailRecord = latest.dispWords === "조건후합격"
    ? (records.slice(1).find((r) => r.dispWords === "조건부합격" || r.dispWords === "불합격") ?? latest)
    : latest;
  return { latest, detailRecord };
}

// 검사도래현장 카드용 — sync-inspection-cache 크론이 매일 도래현장 호기만 골라 미리
// 조회해둔 units.prior_flagged_* 캐시를 우선 쓴다(즉시 표시, API 호출 없음). 캐싱 전(오늘
// 새로 도래 목록에 들어온 경우 등, checkedAt이 아직 없음)이면 usePriorFlaggedInspection으로
// 실시간 조회한다. 반환 형태는 usePriorFlaggedInspection과 동일하게 맞춰 호출부 변경을 줄인다.
export function usePriorFlaggedBadge(priorUnit) {
  const hasCached = Boolean(priorUnit?.priorFlaggedCheckedAt);
  const live = usePriorFlaggedInspection(!hasCached ? priorUnit?.govNo : null);
  if (!hasCached) return live;
  if (!priorUnit.priorFlaggedLabel) return { latest: null, detailRecord: null };
  return {
    latest: { dispWords: priorUnit.priorFlaggedLabel },
    detailRecord: { inspctDe: (priorUnit.priorFlaggedAnchorDate ?? "").replace(/-/g, "") },
  };
}
