import { useState, useEffect, useContext } from "react";
import { X, LogOut, CalendarDays, Plane, Plus, Bell, BellRing } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/app/components/context";
import { TODAY_STR } from "@/lib/constants";
import { annualLeaveDays, yearsOfService } from "@/lib/leave";
import { forRole, GROUPS, LEVELS, isEnabled, levelOf } from "@/lib/notifications";
import { pushSupported, pushPermission, enablePush, disablePush, isSubscribed } from "@/lib/push";

const KIND_TONE = { 당직: "bg-emerald-50 text-emerald-700", 숙직: "bg-blue-50 text-blue-700", 정상근무: "bg-violet-50 text-violet-500" };

/** 마이페이지 — 내 근무·내 연차·내 출퇴근을 한 곳에서. 조회 중심이고 수정은 연락처만. */
export function MyPage({ attendances, dutySchedules, onClose }) {
  const { name, role, selfId, profiles = [], signOut } = useContext(AuthContext);
  const me = profiles.find((p) => p.id === selfId) ?? {};
  const [leaves, setLeaves] = useState([]);
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({ kind: "연차", start: TODAY_STR, end: TODAY_STR, note: "" });
  const [busy, setBusy] = useState(false);
  const [orgSettings, setOrgSettings] = useState({});
  const [prefs, setPrefs] = useState(me.notify_prefs ?? {});
  const [notifOpen, setNotifOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const year = TODAY_STR.slice(0, 4);
  useEffect(() => {
    if (!selfId) return;
    supabase.from("leaves").select("*").eq("profile_id", selfId)
      .gte("start_date", `${year}-01-01`).lte("start_date", `${year}-12-31`)
      .order("start_date", { ascending: false })
      .then(({ data }) => setLeaves(data ?? []));
  }, [selfId, year]);

  // 회사에서 켜둔 알림만 개인이 조절할 수 있다
  useEffect(() => {
    supabase.from("notify_settings").select("*").then(({ data }) => {
      const m = {};
      for (const r of data ?? []) m[r.key] = { enabled: r.enabled, level: r.level };
      setOrgSettings(m);
    });
  }, []);

  // 브라우저 구독이 있으면 서버 기록도 함께 맞춘다 (아래 isSubscribed 주석 참고)
  useEffect(() => { if (selfId) isSubscribed(selfId).then(setSubscribed); }, [selfId]);

  async function togglePush() {
    setPushBusy(true);
    if (subscribed) {
      await disablePush();
      setSubscribed(false);
    } else {
      const r = await enablePush(selfId);
      if (!r.ok) alert(r.reason);
      setSubscribed(r.ok);
    }
    setPushBusy(false);
  }

  async function toggleNotify(item, next) {
    const nextPrefs = { ...prefs, [item.key]: next };
    setPrefs(nextPrefs);
    await supabase.from("profiles").update({ notify_prefs: nextPrefs }).eq("id", selfId);
  }

  const myNotifs = forRole(role).filter((n) => orgSettings[n.key]?.enabled !== false);


  // 오늘 이후 내 당직 (가까운 순 5건)
  const myDuties = dutySchedules
    .filter((d) => d.profileId === selfId && d.dutyDate >= TODAY_STR)
    .sort((a, b) => a.dutyDate.localeCompare(b.dutyDate))
    .slice(0, 5);

  const auto = annualLeaveDays(me.hire_date, `${year}-12-31`);
  const grant = me.annual_leave_days ?? auto;
  // 승인된 것만 차감한다 — 신청 중인 건을 미리 빼면 반려됐을 때 숫자가 틀어진다
  const approved = leaves.filter((l) => (l.status ?? "승인") === "승인");
  const waiting = leaves.filter((l) => l.status === "신청");
  const used = approved.reduce((n, l) => n + Number(l.days), 0);
  const left = grant == null ? null : grant - used;

  // 반차는 0.5일, 그 외는 시작~종료 일수 (주말 제외는 회사 규정이 갈려 자동 계산하지 않는다)
  const reqDays = form.kind === "반차"
    ? 0.5
    : Math.max(1, Math.floor((new Date(form.end) - new Date(form.start)) / 86400000) + 1);

  // 신청 기간에 내 당직·숙직이 끼면 신청을 막는다 — 근무를 먼저 교환한 뒤 연차를 써야 한다.
  const dutyConflicts = dutySchedules.filter(
    (d) => d.profileId === selfId && d.dutyDate >= form.start && d.dutyDate <= form.end
  );

  async function submitLeave() {
    if (dutyConflicts.length) return;
    setBusy(true);
    const { data, error } = await supabase.from("leaves").insert({
      profile_id: selfId, start_date: form.start, end_date: form.end,
      kind: form.kind, days: reqDays, note: form.note || null,
      status: "신청", requested_by: selfId,
    }).select();
    setBusy(false);
    if (error) { alert("신청 실패: " + error.message); return; }
    setLeaves((prev) => [data[0], ...prev]);
    setApplying(false);
    setForm({ kind: "연차", start: TODAY_STR, end: TODAY_STR, note: "" });
  }

  async function cancelLeave(l) {
    if (!confirm(`${l.start_date} ${l.kind} 신청을 취소할까요?`)) return;
    await supabase.from("leaves").delete().eq("id", l.id);
    setLeaves((prev) => prev.filter((x) => x.id !== l.id));
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
        </div>

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
            <p className="text-xs text-slate-400 mb-2.5">
              입사일이 등록되지 않아 연차 일수를 계산할 수 없습니다 (관리자 문의) — 신청은 가능합니다
            </p>
          ) : (
            <>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (used / grant) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-slate-500 mb-2.5">
                부여 {grant}일 · 사용 {used}일
                {waiting.length > 0 && <span className="text-amber-600 font-bold"> · 승인대기 {waiting.reduce((n, l) => n + Number(l.days), 0)}일</span>}
              </p>
            </>
          )}

              {leaves.length === 0 ? (
                <p className="text-xs text-slate-400 mb-2">신청·사용 내역이 없습니다</p>
              ) : (
                <div className="space-y-1 border-t border-slate-100 pt-2 mb-2">
                  {leaves.map((l) => {
                    const st = l.status ?? "승인";
                    return (
                      <div key={l.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-600 min-w-0 truncate">
                          {l.start_date.slice(5)}{l.end_date !== l.start_date && `~${l.end_date.slice(5)}`}
                          <span className="ml-1.5 text-slate-400">{l.kind}</span>
                          <span className={`ml-1.5 font-bold ${
                            st === "신청" ? "text-amber-600" : st === "반려" ? "text-red-500" : "text-emerald-600"
                          }`}>{st}</span>
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-slate-500">{l.days}일</span>
                          {st === "신청" && (
                            <button onClick={() => cancelLeave(l)} className="text-[10px] font-bold text-slate-400 underline">취소</button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {!applying ? (
                <button onClick={() => setApplying(true)}
                  className="w-full bg-blue-50 text-blue-700 text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-1">
                  <Plus size={13} /> 연차 신청
                </button>
              ) : (
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    {["연차", "반차", "병가"].map((k) => (
                      <button key={k} onClick={() => setForm({ ...form, kind: k })}
                        className={`py-2 rounded-lg text-xs font-bold border ${
                          form.kind === k ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200"
                        }`}>{k}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={form.start}
                      onChange={(e) => setForm({ ...form, start: e.target.value, end: e.target.value > form.end ? e.target.value : form.end })}
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-800" />
                    <span className="text-[11px] text-slate-400">~</span>
                    <input type="date" value={form.end} min={form.start} disabled={form.kind === "반차"}
                      onChange={(e) => setForm({ ...form, end: e.target.value })}
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-800 disabled:bg-slate-50" />
                  </div>
                  <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="사유 (선택)"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800" />
                  {left != null && reqDays > left && (
                    <p className="text-[11px] font-bold text-red-500">잔여 {left}일보다 많이 신청했습니다</p>
                  )}
                  {dutyConflicts.length > 0 && (
                    <p className="text-[11px] font-bold text-red-500 leading-relaxed">
                      {dutyConflicts.map((d) => `${d.dutyDate.slice(5).replace("-", "/")} ${d.kind}`).join(", ")} 근무가 있습니다.
                      먼저 근무 교환을 한 뒤 신청하세요.
                    </p>
                  )}
                  <div className="flex gap-1.5">
                    <button onClick={submitLeave} disabled={busy || dutyConflicts.length > 0 || (left != null && reqDays > left)}
                      className="flex-1 text-xs font-bold text-white bg-blue-700 py-2.5 rounded-lg disabled:bg-slate-200">
                      {busy ? "신청 중…" : dutyConflicts.length ? "근무일 포함" : `${reqDays}일 신청`}
                    </button>
                    <button onClick={() => setApplying(false)} className="flex-1 text-xs font-bold text-slate-500 bg-slate-100 py-2.5 rounded-lg">취소</button>
                  </div>
                </div>
              )}

        </Card>

        {/* 알림 설정 — 회사가 켜둔 것 중에서 본인이 끌 수 있다 */}
        <Card
          icon={<Bell size={13} />}
          title="알림 설정"
          extra={
            <button onClick={() => setNotifOpen((v) => !v)} className="text-[11px] font-bold text-blue-700">
              {notifOpen ? "접기" : `${myNotifs.filter((n) => isEnabled(n, orgSettings, prefs)).length}/${myNotifs.length}종 받는 중`}
            </button>
          }
        >
          {/* 기기 단위 푸시 스위치 — 이걸 켜야 앱이 꺼져 있어도 알림이 온다 */}
          <button
            onClick={togglePush}
            disabled={pushBusy || !pushSupported()}
            className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 mb-2 border ${
              subscribed ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"
            }`}
          >
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <BellRing size={13} className={subscribed ? "text-blue-600" : "text-slate-400"} />
              이 기기에서 알림 받기
            </span>
            <span className={`text-[11px] font-extrabold ${subscribed ? "text-blue-700" : "text-slate-400"}`}>
              {pushBusy ? "처리 중…"
                : !pushSupported() ? "미지원"
                : pushPermission() === "denied" ? "차단됨"
                : subscribed ? "켜짐" : "꺼짐"}
            </span>
          </button>
          {pushPermission() === "denied" && (
            <p className="text-[10px] text-red-500 mb-2 leading-relaxed">
              브라우저에서 알림이 차단돼 있습니다. 주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꿔주세요.
            </p>
          )}

          {!notifOpen ? (
            <p className="text-xs text-slate-400">받고 싶지 않은 알림은 꺼둘 수 있습니다</p>
          ) : (
            <div className="space-y-3">
              {GROUPS.filter((g) => myNotifs.some((n) => n.group === g)).map((g) => (
                <div key={g}>
                  <p className="text-[10px] font-extrabold text-slate-400 mb-1">{g}</p>
                  <div className="space-y-1">
                    {myNotifs.filter((n) => n.group === g).map((n) => {
                      const enabled = isEnabled(n, orgSettings, prefs);
                      const lv = levelOf(n, orgSettings);
                      return (
                        <div key={n.key} className="flex items-center justify-between gap-2 py-1">
                          <p className="text-[11px] text-slate-600 min-w-0">
                            {n.label}
                            <span className={`ml-1.5 text-[9px] font-bold rounded px-1 py-0.5 border ${LEVELS[lv].tone}`}>{LEVELS[lv].label}</span>
                          </p>
                          <button
                            onClick={() => toggleNotify(n, !enabled)}
                            className={`shrink-0 relative w-9 h-5 rounded-full transition-colors ${enabled ? "bg-blue-600" : "bg-slate-200"}`}
                            aria-label={`${n.label} ${enabled ? "끄기" : "켜기"}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${enabled ? "left-[18px]" : "left-0.5"}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-slate-400 leading-relaxed pt-1 border-t border-slate-100">
                「이 기기에서 알림 받기」를 켜야 앱을 닫아도 알림이 옵니다. 기기마다 따로 켜야 합니다.
              </p>
            </div>
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
