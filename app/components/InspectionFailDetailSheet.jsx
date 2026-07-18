import { useState, useEffect } from "react";
import { Badge, Sheet } from "@/app/components/ui";
import { govDateToDashed, formatShortDate } from "@/lib/utils";


// inspection: 조건부/불합격 목록에서 클릭한 건(govElevatorNo·startDate 기준으로 가장 가까운 회차를 서버에서 찾음).
// preloaded: 이미 회차가 정해진 경우({ record, items, reason }, 검사이력 목록에서 특정 회차를 클릭했을 때) — 있으면 재조회하지 않는다.
export function InspectionFailDetailSheet({ inspection, preloaded, onClose }) {
  const [state, setState] = useState(
    preloaded
      ? { loading: false, items: preloaded.items ?? [], error: null, reason: preloaded.reason ?? null, record: preloaded.record ?? null }
      : { loading: true, items: [], error: null, reason: null, record: null }
  );

  useEffect(() => {
    if (preloaded) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(inspection.govElevatorNo)}&anchorDate=${encodeURIComponent(inspection.startDate)}`
        );
        const data = await res.json();
        if (!cancelled) setState({ loading: false, items: data.items ?? [], error: data.error ?? null, reason: data.reason ?? null, record: data.record ?? null });
      } catch {
        if (!cancelled) setState({ loading: false, items: [], error: "조회에 실패했습니다", reason: null, record: null });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [preloaded, inspection?.govElevatorNo, inspection?.startDate]);

  const inspectedOn = state.record ? govDateToDashed(state.record.inspctDe) : null;

  return (
    <Sheet title="조건부·불합격 상세" onClose={onClose}>
      <div className="bg-slate-100 rounded-xl p-3 mb-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-slate-800">{inspection.siteName} · {inspection.elevatorNo}</p>
          {inspectedOn && <p className="text-[11px] text-slate-400 mt-0.5">검사일 {formatShortDate(inspectedOn)}</p>}
        </div>
        <Badge result={inspection.result} />
      </div>
      {state.loading ? (
        <p className="text-xs text-slate-400 text-center py-8">국가승강기정보센터에서 부적합 항목을 조회하는 중...</p>
      ) : state.error ? (
        <p className="text-xs text-red-500 text-center py-8">{state.error}</p>
      ) : state.items.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">
          {state.reason === "no_record"
            ? "국가승강기정보센터에 이 승강기의 검사이력이 아직 등록되지 않았습니다"
            : state.reason === "no_fail_code"
            ? "검사이력은 확인됐지만 부적합 상세코드가 등록되어 있지 않습니다"
            : state.reason === "no_items_for_fail_code"
            ? `부적합코드(${state.record?.failCd ?? "-"})는 등록돼 있지만 상세 항목이 조회되지 않습니다. 국가승강기정보센터 데이터 공백으로 보입니다.`
            : "부적합 상세 항목을 찾을 수 없습니다"}
        </p>
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
