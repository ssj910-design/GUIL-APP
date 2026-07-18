import { useState, useEffect } from "react";
import { Badge, Sheet } from "@/app/components/ui";
import { formatShortDate } from "@/lib/utils";


function govResultToCode(dispWords) {
  if (dispWords === "합격") return "pass";
  if (dispWords === "조건부합격") return "conditional";
  if (dispWords === "불합격") return "fail";
  return null;
}

// "20260716" → "2026-07-16"
function toDashedDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function InspectionFailDetailSheet({ inspection, onClose }) {
  const [state, setState] = useState({ loading: true, history: [], error: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(inspection.govElevatorNo)}`);
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
  }, [inspection.govElevatorNo]);

  return (
    <Sheet title="검사이력·부적합 상세" onClose={onClose}>
      <div className="bg-slate-100 rounded-xl p-3 mb-3 flex items-center justify-between">
        <p className="font-bold text-slate-800">{inspection.siteName} · {inspection.elevatorNo}</p>
        <Badge result={inspection.result} />
      </div>
      {state.loading ? (
        <p className="text-xs text-slate-400 text-center py-8">국가승강기정보센터에서 검사이력을 조회하는 중...</p>
      ) : state.error ? (
        <p className="text-xs text-red-500 text-center py-8">{state.error}</p>
      ) : state.history.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">국가승강기정보센터에 등록된 검사이력이 없습니다</p>
      ) : (
        <div className="space-y-4">
          {state.history.map((h, hi) => {
            const dashedDate = toDashedDate(h.record.inspctDe);
            return (
              <div key={hi} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-700">
                    {dashedDate ? formatShortDate(dashedDate) : "검사일 미상"} · {h.record.inspctInsttNm ?? "-"}
                  </p>
                  <Badge result={govResultToCode(h.record.dispWords)} />
                </div>
                {h.items.length === 0 ? (
                  <p className="text-xs text-slate-400 pb-1">
                    {h.reason === "no_fail_code"
                      ? "부적합사항 없음"
                      : h.reason === "no_items_for_fail_code"
                      ? `부적합코드(${h.record.failCd})는 등록돼 있지만 상세 항목이 조회되지 않습니다`
                      : "부적합 상세 조회 실패"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {h.items.map((item, idx) => (
                      <div key={idx} className="border border-red-100 bg-red-50 rounded-xl p-3">
                        <p className="text-[11px] font-bold text-red-600 mb-1">기준 {item.standardArticle}</p>
                        <p className="text-xs text-slate-700 mb-1.5">{item.standardTitle1}</p>
                        <p className="text-sm font-semibold text-slate-800">{item.failDesc}</p>
                        {item.failDescInspector && <p className="text-[11px] text-slate-500 mt-1">검사원 의견: {item.failDescInspector}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
