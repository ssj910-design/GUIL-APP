import { useState, useEffect } from "react";
import { Badge, Sheet } from "@/app/components/ui";


export function InspectionFailDetailSheet({ inspection, onClose }) {
  const [state, setState] = useState({ loading: true, items: [], error: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(inspection.govElevatorNo)}&anchorDate=${encodeURIComponent(inspection.startDate)}`
        );
        const data = await res.json();
        if (!cancelled) setState({ loading: false, items: data.items ?? [], error: data.error ?? null });
      } catch {
        if (!cancelled) setState({ loading: false, items: [], error: "조회에 실패했습니다" });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [inspection.govElevatorNo, inspection.startDate]);

  return (
    <Sheet title="조건부·불합격 상세" onClose={onClose}>
      <div className="bg-slate-100 rounded-xl p-3 mb-3 flex items-center justify-between">
        <p className="font-bold text-slate-800">{inspection.siteName} · {inspection.elevatorNo}</p>
        <Badge result={inspection.result} />
      </div>
      {state.loading ? (
        <p className="text-xs text-slate-400 text-center py-8">국가승강기정보센터에서 부적합 항목을 조회하는 중...</p>
      ) : state.error ? (
        <p className="text-xs text-red-500 text-center py-8">{state.error}</p>
      ) : state.items.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">부적합 상세 항목을 찾을 수 없습니다</p>
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
