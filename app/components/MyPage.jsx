import { useState, useEffect, useContext } from "react";
import { X, LogOut, CalendarDays, Clock, Plane } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/app/components/context";
import { TODAY_STR } from "@/lib/constants";
import { annualLeaveDays, yearsOfService } from "@/lib/leave";

const KIND_TONE = { 숙직: "bg-slate-100 text-slate-700", 당직: "bg-emerald-50 text-emerald-700", 정상근무: "bg-indigo-50 text-indigo-500" };

/** 마이페이지 — 내 근무·내 연차·내 출퇴근을 한 곳에서. 조회 중심이고 수정은 연락처만. */
export function MyPage({ attendances, dutySchedules, onClose }) {
  const { name, role, selfId, profiles = [], signOut } = useContext(AuthContext);
  const me = profiles.find((p) => p.id === selfId) ?? {};
  const [leaves, setLeaves] = useState([]);
  const [phone, setPhone] = useState(me.phone ?? "");
  const [saved, setSaved] = useState(false);

  const year = TODAY_STR.slice(0, 4);
  useEffect(() => {
    if (!selfId) return;
    supabase.from("leaves").select("*").eq("profile_id", selfId)
      .gte("start_date", `${year}-01-01`).lte("start_date", `${year}-12-31`)
      .order("start_date", { ascending: false })
      .then(({ data }) => setLeaves(data ?? []));
  }, [selfId, year]);

  const today = attendances.find((a) => a.profileId === selfId);
  const hhmm = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : null);

  // 오늘 이후 내 당직 (가까운 순 5건)
  const myDuties = dutySchedules
    .filter((d) => d.profileId === selfId && d.dutyDate >= TODAY_STR)
    .sort((a, b) => a.dutyDate.localeCompare(b.dutyDate))
    .slice(0, 5);

  const auto = annualLeaveDays(me.hire_date, `${year}-12-31`);
  const grant = me.annual_leave_days ?? auto;
  const used = leaves.reduce((n, l) => n + Number(l.days), 0);
  const left = grant == null ? null : grant - used;

  async function savePhone() {
    await supabase.from("profiles").update({ phone: phone || null }).eq("id", selfId);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const Card = ({ icon, title, children, extra }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">{icon}{title}</p>
        {extra}
      </div>
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
      <div className="shrink-0 bg-blue-900 text-white px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-extrabold">마이페이지</p>
        <button onClick={onClose} className="p-1" aria-label="닫기"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* 프로필 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-700 text-white flex items-center justify-center text-lg font-extrabold shrink-0">
              {name?.slice(-2)}
            </div>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-slate-800">{name}</p>
              <p className="text-[11px] text-slate-400">
                {role === "admin" ? "관리자" : "현장요원"}
                {me.duty_order != null && ` · 당직 순번 ${me.duty_order}번`}
                {me.hire_date && ` · 입사 ${me.hire_date} (${Math.max(0, yearsOfService(me.hire_date, TODAY_STR))}년차)`}
              </p>
            </div>
          </div>
          <div className="flex items-end gap-2 mt-3">
            <div className="flex-1">
              <p className="text-[11px] font-bold text-slate-500 mb-1">연락처</p>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800"
                inputMode="numeric" value={phone} placeholder="010-0000-0000"
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <button onClick={savePhone} disabled={phone === (me.phone ?? "")}
              className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-4 py-2.5">
              {saved ? "저장됨" : "저장"}
            </button>
          </div>
        </div>

        {/* 오늘 근태 */}
        <Card icon={<Clock size={13} />} title="오늘 근태">
          {!today?.checkedInAt ? (
            <p className="text-xs text-slate-400">아직 출근 체크를 하지 않았습니다</p>
          ) : (
            <p className="text-sm font-bold text-slate-700">
              출근 {hhmm(today.checkedInAt)}
              {today.checkedOutAt && <span className="text-slate-400 font-semibold"> · {today.status} {hhmm(today.checkedOutAt)}</span>}
            </p>
          )}
        </Card>

        {/* 다가오는 내 당직 */}
        <Card icon={<CalendarDays size={13} />} title="다가오는 내 근무">
          {myDuties.length === 0 ? (
            <p className="text-xs text-slate-400">예정된 당직·숙직이 없습니다</p>
          ) : (
            <div className="space-y-1.5">
              {myDuties.map((d) => (
                <div key={d.id} className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700">
                    {d.dutyDate.slice(5).replace("-", "/")}
                    <span className="ml-1.5 text-[11px] font-semibold text-slate-400">
                      {["일", "월", "화", "수", "목", "금", "토"][new Date(`${d.dutyDate}T00:00:00`).getDay()]}요일
                    </span>
                    {d.dutyDate === TODAY_STR && <span className="ml-1.5 text-[10px] font-extrabold text-red-500">오늘</span>}
                  </p>
                  <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${KIND_TONE[d.kind]}`}>{d.kind}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 연차 */}
        <Card
          icon={<Plane size={13} />}
          title={`${year}년 연차`}
          extra={left != null && (
            <span className="text-[11px] font-extrabold text-blue-700">잔여 {left}일</span>
          )}
        >
          {grant == null ? (
            <p className="text-xs text-slate-400">입사일이 등록되지 않아 계산할 수 없습니다 (관리자 문의)</p>
          ) : (
            <>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (used / grant) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-slate-500 mb-2.5">부여 {grant}일 · 사용 {used}일</p>
              {leaves.length === 0 ? (
                <p className="text-xs text-slate-400">사용 내역이 없습니다</p>
              ) : (
                <div className="space-y-1 border-t border-slate-100 pt-2">
                  {leaves.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600">
                        {l.start_date.slice(5)}{l.end_date !== l.start_date && `~${l.end_date.slice(5)}`}
                        <span className="ml-1.5 text-slate-400">{l.kind}</span>
                      </span>
                      <span className="font-bold text-slate-500">{l.days}일</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>

        <button onClick={signOut}
          className="w-full bg-white border border-slate-200 text-slate-500 text-sm font-bold py-3 rounded-xl flex items-center justify-center gap-1.5">
          <LogOut size={14} /> 로그아웃
        </button>
      </div>
    </div>
  );
}
