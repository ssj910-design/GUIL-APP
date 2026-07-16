import { useState } from "react";
import { PhotoUpload, FilterBar, PrimaryButton, Sheet, Field, inputCls } from "@/app/components/ui";


/* ------------------------------------------------------------------ */
/* CHECKUP (정기점검)                                                    */
/* ------------------------------------------------------------------ */

export function CheckupTab() {
  const [subTab, setSubTab] = useState("달력");
  const [openForm, setOpenForm] = useState(false);
  const unassigned = ["동일빌딩 1호기", "서초타워 3호기", "가산프라자 1호기"];
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const checkedDays = [2, 3, 4, 8, 9, 10, 11, 15, 16];
  const weekLabels = ["일", "월", "화", "수", "목", "금", "토"];
  const padCount = 3; // 2026-07-01은 수요일

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100 shrink-0">
        {["달력", "계획", "처리"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-sm font-bold ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 flex items-start shrink-0">
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">진행상황</p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 처리 {checkedDays.length}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 계획 {unassigned.length}</span>
          </div>
        </div>
        <div className="w-px self-stretch bg-slate-200 mx-3" />
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">전체 진행상황</p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 처리 {checkedDays.length}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 계획 {unassigned.length}</span>
          </div>
        </div>
      </div>

      {subTab === "달력" ? (
        <FilterBar
          pills={[
            { label: "현장", value: "전체" },
            { label: "담당자", value: "전체" },
            { label: "부서", value: "전체", active: true },
            { label: "해당월", value: "2026년 07월", active: true },
          ]}
        />
      ) : (
        <FilterBar
          pills={[
            { label: "현장", value: "전체" },
            { label: "담당자", value: "전체" },
            { label: "부서", value: "전체", active: true },
          ]}
          startDate="2026년 07월 01일 水"
          endDate="2026년 07월 10일 金"
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {subTab === "달력" && (
          <div className="px-5 pt-4 pb-4">
            <div className="grid grid-cols-7 text-center text-sm font-bold mb-3">
              {weekLabels.map((d, idx) => (
                <div key={d} className={idx === 0 ? "text-red-500" : idx === 6 ? "text-blue-500" : "text-slate-700"}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-4 text-center">
              {Array.from({ length: padCount }).map((_, i) => <div key={"pad" + i} />)}
              {days.map((d) => {
                const dow = (d + padCount - 1) % 7;
                const isToday = d === 10;
                const colorCls = isToday ? "text-white" : dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-700";
                return (
                  <div key={d} className="flex justify-center">
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-blue-500" : ""} ${colorCls}`}>
                      {d}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {subTab === "계획" && (
          <div className="px-5 pt-4">
            <h3 className="font-bold text-slate-800 text-sm mb-2">이번 달 나에게 할당된 미배정 현장</h3>
            <div className="space-y-2">
              {unassigned.map((u) => (
                <div key={u} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">{u}</p>
                  <button onClick={() => setOpenForm(u)} className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
                    일정 등록
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {subTab === "처리" && (
          <div className="px-5 pt-10 text-center">
            <p className="text-xs text-slate-400">해당 기간에 처리된 점검이 없습니다</p>
          </div>
        )}
      </div>

      {openForm && (
        <Sheet title={`${openForm} 점검 등록`} onClose={() => setOpenForm(false)}>
          <Field label="점검 예정일"><input type="date" className={inputCls} defaultValue="2026-07-14" /></Field>
          <Field label="점검 사진"><PhotoUpload label="표준 화질 점검 사진 등록" /></Field>
          <Field label="특이사항"><textarea className={inputCls} rows={3} placeholder="예: 로프 장력 미세 저하, 다음 점검 시 재확인 필요" /></Field>
          <PrimaryButton onClick={() => setOpenForm(false)}>일정 저장</PrimaryButton>
        </Sheet>
      )}
    </div>
  );
}
