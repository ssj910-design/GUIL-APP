import { useState, useEffect } from "react";
import { Badge, Sheet } from "@/app/components/ui";
import { govDateToDashed, formatFullDate } from "@/lib/utils";


function isValidDateStr(s) {
  return Boolean(s) && !Number.isNaN(new Date(s).getTime());
}

// inspection: 조건부/불합격 목록에서 클릭한 건(govElevatorNo·startDate 기준으로 가장 가까운 회차를 서버에서 찾음).
// startDate가 없으면(조건부합격은 API에 검사일자 자체가 안 채워진 경우가 있음) 전체 이력을 받아 최신 회차를 쓴다.
// preloaded: 회차가 이미 정해진 경우({ record, items?, reason? }, 검사이력 목록에서 특정 회차를 클릭했을 때).
// items까지 채워져 있으면(예전 전체이력 조회) 재조회하지 않지만, 검사이력 화면이 이제 목록만
// 먼저 받고 부적합상세는 지연 조회하므로 items가 없는 preloaded도 흔하다 — 그때는 record의
// 검사일자를 anchorDate 삼아 그 회차 하나만 새로 조회한다.
export function InspectionFailDetailSheet({ inspection, preloaded, onClose }) {
  const [retryCount, setRetryCount] = useState(0);
  const preloadedReady = preloaded && preloaded.items !== undefined;
  const [state, setState] = useState(
    preloadedReady
      ? { loading: false, items: preloaded.items ?? [], error: null, reason: preloaded.reason ?? null, record: preloaded.record ?? null }
      : { loading: true, items: [], error: null, reason: null, record: preloaded?.record ?? null }
  );

  // preloaded인 경우, 회차 고유 날짜(record.inspctDe)를 anchorDate로 넘겨 같은 회차를 다시 조회한다.
  const retryAnchorDate = preloaded ? govDateToDashed(preloaded.record?.inspctDe) : inspection?.startDate;
  const hasValidAnchor = isValidDateStr(retryAnchorDate);
  const canRetry = Boolean(inspection?.govElevatorNo);

  useEffect(() => {
    if (preloadedReady && retryCount === 0) return;
    let cancelled = false;
    async function load() {
      setState((s) => ({ ...s, loading: true }));
      try {
        const url = hasValidAnchor
          ? `/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(inspection.govElevatorNo)}&anchorDate=${encodeURIComponent(retryAnchorDate)}`
          : `/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(inspection.govElevatorNo)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        if (hasValidAnchor) {
          setState({ loading: false, items: data.items ?? [], error: data.error ?? null, reason: data.reason ?? null, record: data.record ?? null });
        } else {
          // anchorDate 없이 부르면 전체 이력을 최신순으로 받는다 — 첫 번째(최신) 회차를 쓴다.
          const latest = (data.history ?? [])[0];
          setState({
            loading: false,
            items: latest?.items ?? [],
            error: data.error ?? null,
            reason: latest ? latest.reason : "no_record",
            record: latest?.record ?? null,
          });
        }
      } catch {
        if (!cancelled) setState({ loading: false, items: [], error: "조회에 실패했습니다", reason: null, record: null });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [preloaded, preloadedReady, retryCount, inspection?.govElevatorNo, hasValidAnchor, retryAnchorDate]);

  const inspectedOn = state.record ? govDateToDashed(state.record.inspctDe) : null;

  return (
    <Sheet title="조건부·불합격 상세" onClose={onClose}>
      <div className="bg-slate-100 rounded-xl p-3 mb-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-slate-800">{inspection.siteName} · {inspection.elevatorNo}</p>
          {inspectedOn && <p className="text-[11px] text-slate-400 mt-0.5">검사일 {formatFullDate(inspectedOn)}</p>}
        </div>
        <Badge result={inspection.result} />
      </div>
      {state.loading ? (
        <p className="text-xs text-slate-400 text-center py-8">국가승강기정보센터에서 부적합 항목을 조회하는 중...</p>
      ) : state.error ? (
        <p className="text-xs text-red-500 text-center py-8">{state.error}</p>
      ) : state.items.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs text-slate-400">
            {state.reason === "no_record"
              ? "국가승강기정보센터에 이 승강기의 검사이력이 아직 등록되지 않았습니다"
              : state.reason === "no_fail_code"
              ? "검사이력은 확인됐지만 부적합 상세코드가 등록되어 있지 않습니다"
              : state.reason === "no_items_for_fail_code"
              ? `부적합코드(${state.record?.failCd ?? "-"})는 등록돼 있지만 상세 항목이 조회되지 않습니다. 국가승강기정보센터 데이터 공백으로 보입니다.`
              : state.reason === "fetch_failed"
              ? "국가승강기정보센터 응답이 일시적으로 불안정해 조회하지 못했습니다"
              : "부적합 상세 항목을 찾을 수 없습니다"}
          </p>
          {state.reason === "fetch_failed" && canRetry && (
            <button
              onClick={() => setRetryCount((c) => c + 1)}
              className="mt-3 text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg"
            >
              다시 시도
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {state.items.map((item, idx) => (
            <div key={idx} className="border border-red-100 bg-red-50 rounded-xl p-3">
              <p className="text-[11px] font-bold text-red-600 mb-1">기준 {item.standardArticle}</p>
              <p className="text-xs text-slate-700 mb-1.5">{item.standardTitle1}</p>
              <p className="text-sm font-semibold text-slate-800">{item.failDesc}</p>
              {item.failDescInspector && <p className="text-[11px] text-slate-500 mt-1">검사원 의견: {item.failDescInspector}</p>}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
