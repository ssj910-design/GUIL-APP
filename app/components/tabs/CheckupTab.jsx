import { useState, useContext } from "react";
import { Search } from "lucide-react";
import { TODAY_STR } from "@/lib/constants";
import { siteUnits } from "@/lib/utils";
import { PhotoUpload, PrimaryButton, Sheet, Field, inputCls } from "@/app/components/ui";
import { SitesContext, AuthContext } from "@/app/components/context";


/* ------------------------------------------------------------------ */
/* CHECKUP (정기점검)                                                    */
/* ------------------------------------------------------------------ */

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function CheckupTab() {
  const sites = useContext(SitesContext);
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [subTab, setSubTab] = useState("계획");
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [checkupTarget, setCheckupTarget] = useState(null); // 자체점검 등록 대상 현장
  const [scheduleTarget, setScheduleTarget] = useState(null); // 일정 등록 대상 현장
  const [scheduleDate, setScheduleDate] = useState(TODAY_STR);
  const [schedules, setSchedules] = useState([]); // { id, date, siteId, siteName }
  const [dayPopup, setDayPopup] = useState(null); // 클릭한 날짜(iso)
  const checkedDays = [2, 3, 4, 8, 9, 10, 11, 15, 16];

  // 계획: 디폴트는 내 담당현장만, "모든 현장보기" 체크 시 전체 현장. 현장명·주소로 검색.
  const q = query.trim();
  const planSites = sites
    .filter((s) => showAll || s.assignedEngineer === CURRENT_ENGINEER)
    .filter((s) => !q || s.name.includes(q) || (s.address ?? "").includes(q));

  // 달력: 오늘이 속한 달을 기준으로 그린다.
  const today = new Date(`${TODAY_STR}T00:00:00`);
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = new Date(year, month, 1).getDay();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const isoOf = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  function registerSchedule() {
    setSchedules((prev) => [
      ...prev,
      { id: `sch-${prev.length}-${scheduleTarget.id}-${scheduleDate}`, date: scheduleDate, siteId: scheduleTarget.id, siteName: scheduleTarget.name },
    ]);
    setScheduleTarget(null);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100 shrink-0">
        {["계획", "처리", "달력"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-sm font-bold ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-5 pt-4 pb-2 shrink-0 flex items-center justify-between">
        <p className="text-sm font-bold text-blue-700">진행상황</p>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 계획 {planSites.length}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 처리 {checkedDays.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === "계획" && (
          <div className="px-5 pt-2 pb-4">
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="현장명 또는 주소로 검색"
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-3">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              모든 현장보기
            </label>
            <div className="space-y-2.5">
              {planSites.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm">{s.name} · {siteUnits(s).length}대</p>
                    <p className="text-[11px] text-slate-400 truncate">{s.address}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => { setScheduleTarget(s); setScheduleDate(TODAY_STR); }}
                      className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg"
                    >
                      일정 등록
                    </button>
                    <button
                      onClick={() => setCheckupTarget(s)}
                      className="text-xs font-bold text-white bg-blue-700 px-3 py-1.5 rounded-lg"
                    >
                      자체점검 등록
                    </button>
                  </div>
                </div>
              ))}
              {planSites.length === 0 && <p className="text-xs text-slate-400 text-center py-8">표시할 현장이 없습니다</p>}
            </div>
          </div>
        )}

        {subTab === "처리" && (
          <div className="px-5 pt-10 text-center">
            <p className="text-xs text-slate-400">해당 기간에 처리된 점검이 없습니다</p>
          </div>
        )}

        {subTab === "달력" && (
          <div className="pb-4">
            <div className="grid grid-cols-7 text-center text-sm font-bold px-2">
              {WEEK_LABELS.map((d, idx) => (
                <div key={d} className={`py-2.5 ${idx === 0 ? "text-red-400" : idx === 6 ? "text-sky-400" : "text-slate-500"}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-t border-slate-100">
              {Array.from({ length: startDow }).map((_, i) => (
                <div key={"pad" + i} className="min-h-[84px] border-b border-r border-slate-50" />
              ))}
              {monthDays.map((d) => {
                const dow = (startDow + d - 1) % 7;
                const iso = isoOf(d);
                const isToday = iso === TODAY_STR;
                const daySchedules = schedules.filter((s) => s.date === iso);
                const numColorCls = dow === 0 ? "text-red-400" : dow === 6 ? "text-sky-400" : "text-slate-700";
                return (
                  <button
                    key={d}
                    onClick={() => setDayPopup(iso)}
                    className="min-h-[84px] border-b border-r border-slate-50 p-1.5 flex flex-col items-start text-left active:bg-slate-50"
                  >
                    <span className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${isToday ? "bg-blue-500 text-white" : numColorCls}`}>
                      {d}
                    </span>
                    {daySchedules.length > 0 && (
                      <div className="mt-1 space-y-0.5 w-full">
                        {daySchedules.slice(0, 2).map((s) => (
                          <p key={s.id} className="text-[10px] text-blue-700 font-semibold truncate">{s.siteName}</p>
                        ))}
                        {daySchedules.length > 2 && (
                          <p className="text-[9px] text-slate-400">+{daySchedules.length - 2}건 더</p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {scheduleTarget && (
        <Sheet title={`${scheduleTarget.name} 일정 등록`} onClose={() => setScheduleTarget(null)}>
          <Field label="점검 예정일">
            <input type="date" className={inputCls} value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
          </Field>
          <PrimaryButton onClick={registerSchedule}>일정 저장</PrimaryButton>
        </Sheet>
      )}

      {checkupTarget && (
        <Sheet title={`${checkupTarget.name} 자체점검 등록`} onClose={() => setCheckupTarget(null)}>
          <Field label="점검일"><input type="date" className={inputCls} defaultValue={TODAY_STR} /></Field>
          <Field label="점검 사진"><PhotoUpload label="표준 화질 점검 사진 등록" /></Field>
          <Field label="특이사항"><textarea className={inputCls} rows={3} placeholder="예: 로프 장력 미세 저하, 다음 점검 시 재확인 필요" /></Field>
          <PrimaryButton onClick={() => setCheckupTarget(null)}>자체점검 등록</PrimaryButton>
        </Sheet>
      )}

      {dayPopup && (
        <Sheet title={`${dayPopup} 점검일정`} onClose={() => setDayPopup(null)}>
          {schedules.filter((s) => s.date === dayPopup).length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">등록된 점검 일정이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {schedules.filter((s) => s.date === dayPopup).map((s) => (
                <div key={s.id} className="bg-slate-50 rounded-lg px-3 py-2.5">
                  <p className="text-sm font-semibold text-slate-800">{s.siteName}</p>
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
