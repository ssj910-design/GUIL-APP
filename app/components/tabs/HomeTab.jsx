import { useState, useContext, useEffect } from "react";
import { ShieldCheck, AlertOctagon, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { unitsToInspections, formatMonthDay, stripCityPrefix, groupBySite, findUnitForInspection, govDateToDashed, recentFailuresBySite, entrapmentSitesRecent, formatUnitLabel, distanceKm } from "@/lib/utils";
import { Badge, DDay, SmsToast, Sheet } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { usePriorFlaggedInspection } from "@/app/hooks/useLiveInspections";
import { FailureDetailSheet, DispatchEtaModal, ArrivalResultModal, FailureMiniCard, AssignEngineerSheet } from "@/app/components/tabs/FailureTab";


// 검사도래현장 한 줄: 직전 검사가 조건부합격/조건후합격이면 현장명을 눌러 당시 부적합내역을 볼 수 있다.
function DueSoonRow({ i, address, govElevatorNo, onOpenFail }) {
  const { latest, detailRecord } = usePriorFlaggedInspection(govElevatorNo);
  const clickable = Boolean(latest);
  return (
    <div
      onClick={clickable ? () => onOpenFail({
        id: `unit-hist-${govElevatorNo}`,
        siteName: i.siteName,
        elevatorNo: i.elevatorNo,
        result: "conditional",
        govElevatorNo,
        startDate: govDateToDashed(detailRecord.inspctDe),
      }) : undefined}
      className={`flex items-center justify-between bg-blue-50 rounded-lg px-2.5 py-1.5 gap-2 touch-manipulation ${clickable ? "cursor-pointer active:bg-blue-100" : ""}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{i.siteName} · {i.elevatorNo}</p>
        <p className="text-[11px] text-slate-400 truncate">{address}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-0.5">
        {latest && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-300">
            직전검사 {latest.dispWords}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">{i.type}</span>
          <span className="text-xs font-bold text-blue-700 whitespace-nowrap">
            {i.dueDate ? formatMonthDay(i.dueDate) : "-"}{i.dueTime ? ` ${i.dueTime}` : ""}
          </span>
        </span>
      </div>
    </div>
  );
}


function FailureHistoryDetailScreen({ site, failures, onBack }) {
  const history = failures.filter((f) => f.siteId === site.id);
  const [detailTarget, setDetailTarget] = useState(null);
  return (
    <Sheet title="고장처리내역 상세" onClose={onBack}>
      <div className="bg-slate-100 rounded-xl p-3 mb-4">
        <p className="font-bold text-slate-800">{site.name} · {formatUnitLabel(site.elevatorNo)}</p>
        <p className="text-xs text-slate-400 mt-0.5">{site.address}</p>
      </div>
      <div className="space-y-2.5">
        {history.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">고장 이력이 없습니다</p>
        ) : (
          history.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setDetailTarget(f)}
              className="w-full text-left border border-slate-200 rounded-xl p-3.5 active:bg-slate-50"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-slate-800 text-sm">{f.errorCode}{f.elevatorNo ? ` · ${formatUnitLabel(f.elevatorNo)}` : ""}</p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${f.status === "완료" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{f.status}</span>
              </div>
              <p className="text-xs text-slate-500 mb-1">{f.reportedAt} 접수 · {f.assignee ?? "미배정"}</p>
              {f.escalation && <p className="text-xs font-bold text-red-600">조치 결과: {f.escalation}</p>}
              {f.processResult && <p className="text-xs text-slate-500">처리결과: {f.processResult}</p>}
            </button>
          ))
        )}
      </div>
      {detailTarget && <FailureDetailSheet failure={detailTarget} onClose={() => setDetailTarget(null)} />}
    </Sheet>
  );
}


// 위치 켜는 법 안내문 — OS별로 경로가 달라 둘 다 적어 준다. 우리방으로 쏘거나 복사해 전달한다.
const GEO_HELP =
  "📍 위치 권한을 켜주세요 (급한 출동 때 가까운 현장을 먼저 안내받는 데 씁니다)\n" +
  "· 안드로이드 크롬: 주소창 왼쪽 자물쇠 → 권한 → 위치 → 허용\n" +
  "· 아이폰: 설정 → Safari(또는 홈 화면 추가한 앱) → 위치 → 허용, 그리고 설정 → 개인정보 보호 → 위치 서비스 ON";

function leaveLabel(l) {
  if (!l) return null;
  if (l.kind === "반차") {
    const period = periodOf(l.note);
    return period ? `반차(${period})` : "반차";
  }
  return l.kind; // 연차 | 병가 | 공가
}

// 관리자 출근 현황 — 요약을 누르면 출근·미출근 명단과 위치 권한 상태를 펼친다.
function AdminAttendanceCard({ attendances, engineers, todayLeaves = [] }) {
  const [open, setOpen] = useState(false);
  const attByPid = new Map(attendances.map((a) => [a.profileId, a]));
  const rows = engineers.map((e) => ({ e, a: attByPid.get(e.id) }));
  const inCount = rows.filter((r) => r.a?.checkedInAt).length;
  // 위치 권한을 안 켠 사람(거부·미결정) — 보고된 값 기준. granted가 아니면 안내 대상.
  const geoOff = rows.filter((r) => r.e.geo_perm && r.e.geo_perm !== "granted");
  const hhmm = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "");

  // 오늘 휴가 현황 — 연차/병가/공가는 하루 종일 쉬므로 "정상근무" 대상에서 뺀다(반차는 절반만 쉬므로 포함).
  const leaveByProfile = new Map(todayLeaves.map((l) => [l.profile_id, l]));
  const annualCount = todayLeaves.filter((l) => l.kind === "연차").length;
  const halfAmCount = todayLeaves.filter((l) => l.kind === "반차" && periodOf(l.note) === "오전").length;
  const halfPmCount = todayLeaves.filter((l) => l.kind === "반차" && periodOf(l.note) === "오후").length;
  const sickCount = todayLeaves.filter((l) => l.kind === "병가").length;
  const publicCount = todayLeaves.filter((l) => l.kind === "공가").length;
  const normalTotal = engineers.length - annualCount - sickCount - publicCount;
  const leaveStats = [
    annualCount > 0 && `연차 ${annualCount}명`,
    halfAmCount > 0 && `반차(오전) ${halfAmCount}명`,
    halfPmCount > 0 && `반차(오후) ${halfPmCount}명`,
    sickCount > 0 && `병가 ${sickCount}명`,
    publicCount > 0 && `공가 ${publicCount}명`,
    `정상근무 ${inCount}/${normalTotal}명`,
  ].filter(Boolean).join(" · ");

  // 근무 중(출근O·마감X)인데 앱을 2시간 넘게 안 본 사람 — '연락 두절'이 아니라 '확인해볼 사람'.
  // 미출근·퇴근자는 앱 안 봐도 정상이라 제외. 관리자만 본다(기사에겐 안 보임).
  const STALE_MS = 2 * 60 * 60 * 1000;
  const hoursAgo = (iso) => (iso ? (Date.now() - new Date(iso)) / 3600000 : Infinity);
  const isWorking = (a) => a?.checkedInAt && !a.checkedOutAt;
  const staleRows = rows.filter((r) => isWorking(r.a) && (Date.now() - new Date(r.e.last_seen_at ?? 0)) > STALE_MS);

  const permLabel = (s) => (s === "granted" ? "위치 켜짐" : s === "denied" ? "위치 거부" : s === "prompt" ? "위치 미설정" : "미확인");
  const permColor = (s) => (s === "granted" ? "bg-emerald-500" : s === "denied" ? "bg-red-500" : "bg-amber-500");

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <button onClick={() => setOpen((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between active:bg-slate-50 rounded-xl flex-wrap gap-y-1">
        <span className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-xs font-bold text-slate-500 whitespace-nowrap">오늘 출근</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">{leaveStats}</span>
          {staleRows.length > 0 && <span className="text-[10px] font-extrabold text-white bg-red-500 rounded-full px-1.5 py-0.5">2시간+ 미확인 {staleRows.length}</span>}
          {geoOff.length > 0 && <span className="text-[10px] font-extrabold text-white bg-amber-500 rounded-full px-1.5 py-0.5">위치 미설정 {geoOff.length}</span>}
          <span className="text-[11px] font-bold text-blue-700">{open ? "접기" : "명단"}</span>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-3 border-t border-slate-100 pt-2.5">
          {geoOff.length > 0 && (
            <p className="text-[11px] text-slate-400 mb-2.5 leading-relaxed">
              위치 미설정 기사에게는 본인 앱에서 켜라는 안내가 자동으로 뜹니다 (게시판에 노출되지 않음).
            </p>
          )}
          <div className="space-y-1.5">
            {rows.map(({ e, a }) => {
              const stale = isWorking(a) && hoursAgo(e.last_seen_at) >= 2;
              const leave = leaveByProfile.get(e.id);
              return (
                <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-700 min-w-0 truncate">{e.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {stale && <span className="text-[10px] font-bold text-red-500">{Math.floor(hoursAgo(e.last_seen_at))}시간째 미확인</span>}
                    {a?.checkedInAt
                      ? <span className="text-slate-500">{hhmm(a.checkedInAt)} 출근{a.checkedOutAt && ` · ${a.status} ${hhmm(a.checkedOutAt)}`}</span>
                      : leave
                        ? <span className="text-emerald-600 font-bold">{leaveLabel(leave)}</span>
                        : <span className="text-slate-300">미출근</span>}
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${permColor(e.geo_perm)}`} title={permLabel(e.geo_perm)} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// 출퇴근 체크 — 기사는 출근/퇴근·당직 버튼, 관리자는 오늘 출근 인원 요약.
// 출근 시 현위치를 1회 받아 저장한다(고장 배정 시 가까운 기사 정렬용).
function AttendanceBar({ attendances, dutySchedules = [], pendingNight, onCloseNight, onAttendance, todayLeaves = [] }) {
  const { role, selfId, engineers } = useContext(AuthContext);
  const [checking, setChecking] = useState(false);
  const [geoModalDismissed, setGeoModalDismissed] = useState(false);
  const [geoPerm, setGeoPerm] = useState("unknown"); // granted | denied | prompt | unknown

  // 기사가 홈을 열면 '마지막 접속 시각'을 기록한다 (출근부에서 '오늘 앱 봤나' 확인용).
  useEffect(() => {
    if (role === "admin" || !selfId) return;
    supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", selfId).then(() => {});
  }, [role, selfId]);

  // 위치 권한 상태를 미리 파악해 둔다 — '아직 안 물어봄(prompt)'이면 안내 카드로 먼저 유도.
  // 확정된 상태는 서버에 보고해 관리자가 '위치 안 켠 사람'을 파악할 수 있게 한다.
  useEffect(() => {
    if (role === "admin" || typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let p;
    const report = (state) => {
      setGeoPerm(state);
      if (selfId && state !== "unknown") {
        // Supabase 쿼리는 .then/await가 있어야 실제로 전송된다 (lazy builder)
        supabase.from("profiles").update({ geo_perm: state, geo_perm_at: new Date().toISOString() }).eq("id", selfId).then(() => {});
      }
    };
    navigator.permissions.query({ name: "geolocation" }).then((res) => {
      p = res;
      report(res.state);
      res.onchange = () => report(res.state);
    }).catch(() => setGeoPerm("unknown"));
    return () => { if (p) p.onchange = null; };
  }, [role, selfId]);

  // [위치 허용하기] — 시스템 권한 팝업을 띄운다. 결과는 위 onchange가 잡아 카드가 사라진다.
  function primeLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(() => setGeoPerm("granted"), () => {}, { timeout: 8000 });
  }

  if (role === "admin") {
    return (
      <div className="px-5 pt-4">
        <AdminAttendanceCard attendances={attendances} engineers={engineers} todayLeaves={todayLeaves} />
      </div>
    );
  }

  const mine = attendances.find((a) => a.profileId === selfId);
  const hhmm = (iso) => new Date(iso).toTimeString().slice(0, 5);
  const done = !!mine?.checkedOutAt; // 오늘 근무 마감(퇴근·당직)
  // 오늘 내 근무표(당직·숙직·정상근무). 당직·숙직은 정규 퇴근시간(17:30)이 지나면 그 상태로 전환한다.
  const todayDuty = dutySchedules.find((d) => d.dutyDate === TODAY_STR && d.profileId === selfId);
  const dutyKind = todayDuty && (todayDuty.kind === "당직" || todayDuty.kind === "숙직") ? todayDuty.kind : null;
  const afterShiftEnd = new Date().getHours() * 60 + new Date().getMinutes() >= 17 * 60 + 30;
  const dutyOn = dutyKind && afterShiftEnd;
  const workLabel = dutyOn ? `${dutyKind} 중` : "근무 중";
  const workTone = dutyOn
    ? (dutyKind === "당직" ? "text-emerald-700 bg-emerald-50" : "text-blue-700 bg-blue-50")
    : "text-blue-600 bg-blue-50";
  // 위치 권한이 거부·미결정이면 출근을 막는다(위치는 필수). 권한 API 미지원(unknown)이면 통과.
  const needGeo = geoPerm === "denied" || geoPerm === "prompt";

  async function relocate() {
    setChecking(true);
    const r = await onAttendance("relocate");
    setChecking(false);
    if (r?.locFailed) alert("위치를 받지 못했습니다.\n브라우저 위치 권한을 허용한 뒤 다시 시도해 주세요.\n(설정 → 위치, 또는 주소창 왼쪽 자물쇠 → 위치)");
  }

  // 위치 안 켠 기사에게는 본인 앱에서만 모달로 알린다 (게시판은 전원 공개라 부적절).
  // 열 때 한 번 뜨고, '나중에'로 닫으면 이 화면에선 다시 안 뜬다(다음에 앱 새로 열면 아직 꺼졌을 때 또 안내).
  const showGeoModal = (geoPerm === "denied" || geoPerm === "prompt") && !geoModalDismissed;

  return (
    <>
      {showGeoModal && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-8" onClick={() => setGeoModalDismissed(true)}>
          <div className="bg-white rounded-2xl w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-extrabold text-slate-800 text-center">📍 위치 권한을 켜주세요</p>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed text-center">
              출근할 때 위치를 한 번만 확인해요. 급한 출동이 생기면 가까운 현장을 먼저 안내받을 수 있어요.
            </p>
            {geoPerm === "denied" && (
              <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed whitespace-pre-line bg-slate-50 rounded-lg p-2.5">{GEO_HELP}</p>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setGeoModalDismissed(true)}
                className="flex-1 text-xs font-bold text-slate-500 bg-slate-100 rounded-lg py-2.5">나중에</button>
              {geoPerm === "prompt" && (
                <button onClick={() => { primeLocation(); setGeoModalDismissed(true); }}
                  className="flex-1 text-xs font-bold text-white bg-blue-700 rounded-lg py-2.5">위치 허용하기</button>
              )}
            </div>
          </div>
        </div>
      )}
      {pendingNight && <NightCloseCard onCloseNight={onCloseNight} />}
      <div className="px-5 pt-4">
        {!mine?.checkedInAt ? (
          <>
            {/* 위치 권한을 아직 안 물어봤으면 먼저 맥락을 주고 허용을 유도한다 (거부율↓, 아이폰 대응) */}
            {geoPerm === "prompt" && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-2">
                <p className="text-xs font-bold text-blue-800">📍 위치 사용 안내</p>
                <p className="text-[11px] text-blue-700 mt-1 leading-relaxed">
                  출근할 때 위치를 한 번만 확인해요. 급한 출동이 생기면 가까운 현장을 먼저 안내받을 수 있어요.
                </p>
                <button onClick={primeLocation} className="w-full mt-2 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800">
                  위치 허용하기
                </button>
              </div>
            )}
            {geoPerm === "denied" && (
              <p className="text-[11px] text-amber-600 font-semibold bg-amber-50 rounded-lg px-3 py-2 mb-2 leading-relaxed">
                위치 권한이 꺼져 있습니다. 켜면 급한 출동 때 가까운 현장을 먼저 안내받을 수 있어요 — 설정 → 위치, 또는 주소창 자물쇠 → 위치에서 허용.
              </p>
            )}
            <button
              onClick={async () => { setChecking(true); await onAttendance("in"); setChecking(false); }}
              disabled={checking || needGeo}
              className="w-full bg-blue-700 text-white text-sm font-bold py-3.5 rounded-xl active:bg-blue-800 disabled:opacity-60"
            >
              {checking ? "위치 확인 중…" : needGeo ? "위치 허용 후 출근신고 가능" : "출근 체크"}
            </button>
            <p className="text-[10px] text-slate-400 mt-1.5 px-1">출근할 때 위치를 한 번만 확인해요 · 급한 출동 때 가까운 현장 우선 안내에 쓰여요</p>
          </>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-500">
                출근 <span className="text-slate-800">{hhmm(mine.checkedInAt)}</span>
                {mine.lat != null
                  ? <span className="ml-1.5 text-[10px] font-bold text-emerald-600">· 위치 확인됨</span>
                  : <span className="ml-1.5 text-[10px] font-bold text-amber-600">· 위치 미기록</span>}
                {done && (
                  <span className="ml-2 text-slate-800">{mine.status} {hhmm(mine.checkedOutAt)}</span>
                )}
              </p>
              {!done && (
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 ${workTone}`}>{workLabel}</span>
              )}
            </div>

            {/* 위치를 못 받았으면 다시 받을 수 있게 (처음에 권한 거부했어도 나중에 켜서 재수집) */}
            {mine.lat == null && !done && (
              <button onClick={relocate} disabled={checking}
                className="w-full mt-2 text-[11px] font-bold text-blue-700 bg-blue-50 rounded-lg py-2 disabled:opacity-60">
                {checking ? "위치 확인 중…" : "📍 위치 다시 받기"}
              </button>
            )}

            {/* 근무 종료 — 언제든 누를 수 있게(2단계라 오터치 안전). 눌러야 당직/퇴근 선택이 열린다.
                오늘 본인 근무표(dutyKind)가 당직/숙직이면 그 마감 버튼만, 없으면 퇴근만 뜬다 */}
            {!done && <WorkEndRow onAttendance={onAttendance} dutyKind={dutyKind} />}
          </div>
        )}
      </div>
    </>
  );
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// 반차 신청 시 note 맨 앞에 "오전"/"오후"를 적어두므로(WorkCalendarSheet.jsx의 submitLeave 참고)
// 날짜 상세 팝업에도 그대로 꺼내 보여준다.
function periodOf(note) {
  const m = (note ?? "").match(/^(오전|오후)/);
  return m ? m[1] : null;
}

// 홈탭용 워크 캘린더 미리보기 — 관리자 대시보드의 WeekStrip(admin/WeekStrip.jsx)을 좁은
// 모바일 화면에 맞게 압축한 버전. 카드 폭이 좁아 "당직 아무개" 같은 라벨은 안 들어가서
// 색점(당직=초록/숙직=파랑/휴가=호박색)만으로 구분하고 이름만 보여준다. 오늘을 맨 첫 칸에
// 고정하고 앞으로 6일치를 이어서 총 7칸을 가로 스크롤로 넘겨본다(폭이 375px 안팎이라 전부
// 한 화면에 안 들어가는 게 정상 — 스와이프 전제).
function WorkCalendarMiniStrip({ profiles, onOpen, swapCount = 0 }) {
  const [duties, setDuties] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [dayDetail, setDayDetail] = useState(null); // 날짜 카드 클릭 시 당직·숙직·휴가 인원 모아보기

  const center = new Date(`${TODAY_STR}T00:00:00`);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(center);
    d.setDate(center.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const from = week[0], to = week[6];

  useEffect(() => {
    Promise.all([
      supabase.from("duty_schedules").select("*").gte("duty_date", from).lte("duty_date", to),
      supabase.from("leaves").select("*").lte("start_date", to).gte("end_date", from),
    ]).then(([d, l]) => {
      setDuties(d.data ?? []);
      setLeaves((l.data ?? []).filter((x) => (x.status ?? "승인") === "승인"));
    });
  }, [from, to]);

  const nameOf = (id) => profiles.find((p) => p.id === id)?.name ?? "";

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-600">워크 캘린더</p>
        <span className="flex items-center gap-1.5">
          {swapCount > 0 && (
            <span className="text-[10px] font-extrabold text-white bg-red-500 rounded-full px-1.5 py-0.5">교환요청 {swapCount}</span>
          )}
          {onOpen && (
            <button onClick={onOpen} className="text-[11px] font-bold text-blue-700">전체보기 →</button>
          )}
        </span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {week.map((d) => {
          const dow = new Date(`${d}T00:00:00`).getDay();
          const dutyDay = duties.filter((x) => x.duty_date === d && (x.kind === "당직" || x.kind === "숙직"));
          const leaveDay = leaves.filter((l) => l.start_date <= d && d <= l.end_date);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDayDetail(d)}
              className={`shrink-0 w-[54px] text-left rounded-lg border p-1.5 ${
                d === TODAY_STR ? "border-blue-300 bg-blue-50" : "border-slate-100"
              }`}
            >
              <p className={`text-[10px] font-bold text-center ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-400"}`}>
                {DOW[dow]} {Number(d.slice(8))}
              </p>
              <div className="mt-1 space-y-0.5">
                {dutyDay.map((x) => (
                  <p key={x.id} className="flex items-center gap-1 text-[9.5px] font-semibold text-slate-600">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${x.kind === "당직" ? "bg-emerald-500" : "bg-blue-500"}`} />
                    <span className="truncate">{nameOf(x.profile_id)}</span>
                  </p>
                ))}
                {leaveDay.map((l) => (
                  <p key={l.id} className="flex items-center gap-1 text-[9.5px] font-semibold text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="truncate">{nameOf(l.profile_id)}</span>
                  </p>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {dayDetail && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-6" onClick={() => setDayDetail(null)}>
          <div className="bg-white w-full max-w-xs rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-extrabold text-slate-800">{dayDetail.slice(5).replace("-", "/")} 근무·휴가</p>
              <button onClick={() => setDayDetail(null)} className="p-1 text-slate-400" aria-label="닫기"><X size={16} /></button>
            </div>
            <div className="space-y-2.5">
              {["당직", "숙직"].map((kind) => {
                const person = duties.find((x) => x.duty_date === dayDetail && x.kind === kind);
                return (
                  <div key={kind} className="flex items-start justify-between gap-3 text-sm border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                    <span className={`font-bold shrink-0 ${kind === "당직" ? "text-emerald-700" : "text-blue-700"}`}>{kind}</span>
                    <span className="text-slate-700 font-bold text-right">{person ? nameOf(person.profile_id) : "미배정"}</span>
                  </div>
                );
              })}
              {(() => {
                const people = leaves.filter((l) => l.start_date <= dayDetail && dayDetail <= l.end_date);
                const label = people
                  .map((l) => `${nameOf(l.profile_id)} ${l.kind}${l.kind === "반차" && periodOf(l.note) ? `(${periodOf(l.note)})` : ""}`)
                  .join(", ");
                return (
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="font-bold shrink-0 text-amber-700">휴가</span>
                    <span className="text-slate-700 font-bold text-right">{label || "-"}</span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 어제 숙직을 마감 안 하고 넘긴 경우 — 익일 출근 버튼을 누르면 자동 마감되지만,
// 오늘 연차·미출근이라 출근을 안 할 사람을 위해 홈 상단에 수동 마감 버튼을 띄운다.
function NightCloseCard({ onCloseNight }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
      <p className="text-xs font-bold text-blue-800">🌙 어제 숙직이 아직 마감되지 않았어요</p>
      <p className="text-[11px] text-blue-600 mt-0.5 leading-relaxed">출근하면 자동으로 마감돼요. 오늘 쉬는 날이면 아래 버튼으로 마감하세요.</p>
      <button disabled={busy} onClick={async () => { setBusy(true); await onCloseNight(); setBusy(false); }}
        className="w-full mt-2 bg-blue-700 text-white text-xs font-bold py-2 rounded-lg disabled:opacity-60">
        {busy ? "마감 중…" : "어제 숙직 마감하기"}
      </button>
    </div>
  );
}

// 퇴근·당직·숙직을 바로 노출하면 오터치가 난다. '근무 종료'를 눌러야 선택지가 열리게 한다
// (2단계라 언제 눌러도 안전 — 시간대 제한 없음).
// 오늘 본인 근무표(dutyKind)가 당직/숙직이면 그 마감 버튼을 띄우고, 없으면 퇴근만 뜬다 —
// 기사가 매번 당직/숙직을 직접 고를 필요 없이 근무표대로 뜬다.
// 버튼을 누르면 위치(GPS)를 받느라 몇 초 걸리므로 그동안 '위치 확인 중…'을 보여 먹통처럼 보이지 않게 한다.
function WorkEndRow({ onAttendance, dutyKind }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const end = async (kind) => { setBusy(true); await onAttendance(kind); setBusy(false); };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full mt-2 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg py-2.5 active:bg-slate-200">
        🏠 근무 종료하기{dutyKind ? ` (오늘 ${dutyKind})` : ""}
      </button>
    );
  }
  const dutyBtn = dutyKind === "당직"
    ? <button disabled={busy} onClick={() => end("duty")} className="flex-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-lg py-2 disabled:opacity-50">당직 마감</button>
    : dutyKind === "숙직"
    ? <button disabled={busy} onClick={() => end("night")} className="flex-1 text-[11px] font-bold text-blue-700 bg-blue-50 rounded-lg py-2 disabled:opacity-50">숙직 마감</button>
    : null;
  return (
    <div className="mt-2">
      <p className="text-[11px] font-bold text-slate-500 mb-1.5">
        {busy ? "위치 확인 중…" : dutyKind ? `오늘은 ${dutyKind} 근무예요` : "오늘 근무를 마칠까요?"}
      </p>
      <div className="flex gap-1.5">
        {dutyBtn}
        <button disabled={busy} onClick={() => end("out")} className="flex-1 text-[11px] font-bold text-white bg-slate-700 rounded-lg py-2 disabled:opacity-50">퇴근</button>
        <button disabled={busy} onClick={() => setOpen(false)} className="text-[11px] font-bold text-slate-400 px-2 disabled:opacity-50">취소</button>
      </div>
    </div>
  );
}

export function HomeTab({ attendances = [], dutySchedules = [], pendingNight, onCloseNight, onAttendance, onOpenRoster, swapCount, inspections, failures, onDispatch, onArrive, onResult, onRefuse, onAssign, onReassign, onShowAllFailures, toast, todayLeaves = [] }) {
  const sites = useContext(SitesContext);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const { name: CURRENT_ENGINEER, role, selfId, engineers = [], profiles = [] } = useContext(AuthContext);
  // 기사 본인 위치 — 미배정 고장을 가까운 순으로 정렬·표시하는 기준.
  const selfLoc = engineers.find((e) => e.id === selfId);
  const selfCoord = selfLoc?.last_lat != null ? { lat: selfLoc.last_lat, lng: selfLoc.last_lng } : null;
  const distOf = (f) => {
    const s = siteById.get(f.siteId);
    return distanceKm(selfCoord, s?.lat != null ? { lat: s.lat, lng: s.lng } : null);
  };
  const mySites = role === "admin" ? sites : sites.filter((s) => s.assignedEngineer === CURRENT_ENGINEER);
  // 지원요청/운행정지가 걸린 현장 — 집중관리 섹션 + 고장현황 카드 라벨 양쪽에서 쓴다.
  const openEscalations = failures.filter((f) => f.escalation && f.status !== "완료");
  const supportSiteIds = new Set(openEscalations.filter((f) => f.escalation === "지원요청").map((f) => f.siteId));
  const stoppedSiteIds = new Set(openEscalations.filter((f) => f.escalation === "운행정지").map((f) => f.siteId));
  const escalatedSiteIds = new Set([...supportSiteIds, ...stoppedSiteIds]);
  // 최근 30일 고장 목록은 실시간 계산 — 처리완료 여부와 무관하게 누적. 3회↑ 재발 배지·집중관리 판정에 쓴다.
  const recentFailuresBySiteId = recentFailuresBySite(failures);
  // 갇힘사고는 재발 횟수와 무관하게 최근 30일 내 1건만 있어도 집중관리 대상 — 30일 지나면 자동으로 빠진다.
  const entrapmentSiteIds = entrapmentSitesRecent(failures);
  // 집중관리현장: 3회 이상 고장, 갇힘사고, 지원요청/운행정지 걸린 현장 (담당 무관 — 기사도 회사 전체 위험 현장을 봄).
  const criticalSites = sites.filter((s) =>
    (recentFailuresBySiteId.get(s.id)?.length ?? 0) >= 3 || escalatedSiteIds.has(s.id) || entrapmentSiteIds.has(s.id)
  );
  const [detailTarget, setDetailTarget] = useState(null);
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [resultTarget, setResultTarget] = useState(null);
  const [historySite, setHistorySite] = useState(null);
  const [inspectionFailTarget, setInspectionFailTarget] = useState(null);

  // 검사유효기간은 units의 DB 캐시를 쓴다 (전 호기 실시간 API 호출 금지 — 트래픽 한도).
  const allUnits = useContext(UnitsContext);
  const mySiteIds = new Set(mySites.map((s) => s.id));
  const liveInspections = unitsToInspections(allUnits, mySites).filter((i) => mySiteIds.has(i.siteId));
  const liveSiteIds = new Set(liveInspections.map((i) => i.siteId));
  const combinedInspections = [...liveInspections, ...inspections.filter((i) => !liveSiteIds.has(i.siteId) && mySiteIds.has(i.siteId))];

  // 도래현장: 관리자가 수기입력한 검사일자(inspections.due_date) 기준으로 검사일이 30일 이내로 남은 담당현장만 (국가승강기정보센터 API 연동 현장은 제외)
  const dueSoon = groupBySite(
    inspections
      .filter((i) => mySiteIds.has(i.siteId) && i.dueDate && !i.result)
      .map((i) => ({ ...i, daysLeft: Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) }))
      .filter((i) => i.daysLeft >= 0 && i.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  );

  // 조건부/불합격 카드의 "검사일정"은 관리자가 InspectionsAdmin에서 수기입력한 방문 예정 일시(inspections.due_date/due_time)다
  // — 보완기한(API 검사 유효기간)과는 별개 정보로 함께 보여준다.
  const manualByUnitId = new Map(inspections.filter((i) => i.unitId).map((i) => [i.unitId, i]));
  const manualBySiteId = new Map(inspections.filter((i) => !i.unitId).map((i) => [i.siteId, i]));

  // 보완기한이 61일 이상 남은 건 아직 급하지 않으니 목록에서 뺀다(60일은 노출) — 기한 미정은 계속 노출.
  const flagged = groupBySite(
    combinedInspections
      .filter((i) => i.result === "conditional" || i.result === "fail")
      .filter((i) => !i.dueDate || Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) <= 60)
      .map((i) => {
        const manual = manualByUnitId.get(i.unitId) ?? manualBySiteId.get(i.siteId) ?? null;
        return { ...i, scheduleDate: manual?.dueDate ?? null, scheduleTime: manual?.dueTime ?? null };
      })
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
  );

  // 관리자는 남의 배정 건까지 전부 봐야 한다(누구 응답을 기다리는지 알아야 재배정 가능).
  // 기사는 본인 배정 건 + 미배정(전원 노출) 건만.
  const activeMine = failures.filter(
    (f) => f.status !== "완료" && (role === "admin" || f.assignee === CURRENT_ENGINEER || !f.assignee)
  );
  // 진행 중(작업중·출동중)을 위로, 그다음 응답대기·미배정
  const stageRank = (f) => (f.status === "진행중" ? 0 : f.assignee ? 1 : 2);
  // 관리자 홈은 액션이 필요한 것만(미배정·응답대기) — 출동중·작업중은 "모두 보기"로
  // 기사 홈은 같은 단계 안에서 미배정 건을 '가까운 순'으로(내가 출동할 후보라 가까운 게 먼저).
  // 거리를 못 구하면(내 위치 없거나 현장 좌표 없음) 맨 뒤로 보낸다.
  const byDistance = (a, b) => {
    const r = stageRank(a) - stageRank(b);
    if (r !== 0) return r;
    const da = distOf(a), db = distOf(b);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  };
  const listSource = role === "admin"
    ? activeMine.filter((f) => f.status === "미처리").sort((a, b) => (a.assignee ? 1 : 0) - (b.assignee ? 1 : 0))
    : [...activeMine].sort(byDistance);
  const [showAllFailures, setShowAllFailures] = useState(false);
  const shownFailures = showAllFailures ? listSource : listSource.slice(0, 5);

  return (
    <div className="flex-1 overflow-y-auto pb-4 relative">
      {onAttendance && <AttendanceBar attendances={attendances} dutySchedules={dutySchedules} pendingNight={pendingNight} onCloseNight={onCloseNight} onAttendance={onAttendance} todayLeaves={todayLeaves} />}

      <div className="px-5 pt-4">
        <WorkCalendarMiniStrip profiles={profiles} onOpen={onOpenRoster} swapCount={swapCount} />
      </div>

      {/* 고장 처리 현황 */}
      <div className="px-5 pt-4">
        <div className="flex items-start justify-between mb-2 gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 text-sm">고장 처리 현황</h3>
            {role === "admin" && (
              <p className="font-medium text-[11px] text-slate-500 mt-0.5">
                미배정 {listSource.filter((f) => !f.assignee && f.escalation !== "지원요청").length}
                {listSource.some((f) => !f.assignee && f.escalation === "지원요청") && (
                  <span className="text-amber-600 font-bold"> · 지원미배정 {listSource.filter((f) => !f.assignee && f.escalation === "지원요청").length}</span>
                )}
                {" · 응답대기 "}{listSource.filter((f) => f.assignee).length}
              </p>
            )}
          </div>
          {role === "admin" && onShowAllFailures && (
            <button onClick={onShowAllFailures} className="shrink-0 text-[11px] font-bold text-blue-700 mt-0.5">
              모두보기
            </button>
          )}
        </div>
        <div className="space-y-2.5">
          {listSource.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-5">
              <p className="text-xs text-slate-400 text-center">{role === "admin" ? "배정 대기 중인 고장이 없습니다" : "진행 중인 고장이 없습니다"}</p>
            </div>
          ) : (
            shownFailures.map((f) => (
              <FailureMiniCard
                key={f.id}
                f={f}
                dist={role !== "admin" && !f.assignee ? distOf(f) : null}
                warnCount={recentFailuresBySiteId.get(f.siteId)?.length ?? 0}
                onOpenDetail={setDetailTarget}
                onDispatch={setDispatchTarget}
                onArrive={onArrive}
                onOpenResult={setResultTarget}
                onRefuse={onRefuse}
                onAssignOpen={setAssignTarget}
              />
            ))
          )}
          {listSource.length > 5 && (
            <button
              onClick={() => setShowAllFailures(!showAllFailures)}
              className="w-full text-center text-xs font-bold text-blue-700 bg-white border border-slate-200 rounded-xl py-2.5"
            >
              {showAllFailures ? "접기" : `전체 ${listSource.length}건 보기`}
            </button>
          )}
        </div>
      </div>

      {/* 집중 관리 현장 — 기사는 보고 자발 지원, 관리자는 지원자 배정 (담당 무관, 전 현장 기준) */}
      <div className="px-5 pt-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon size={18} className="text-red-600" />
            <h3 className="font-extrabold text-red-700 text-sm whitespace-nowrap">집중관리현장(갇힘·운행정지·고장다발·지원요청)</h3>
          </div>
          {criticalSites.length === 0 ? (
            <p className="text-xs text-red-500">현재 집중 관리 대상 현장이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {criticalSites.map((s) => {
                const stopped = stoppedSiteIds.has(s.id);
                const support = supportSiteIds.has(s.id);
                const trapped = entrapmentSiteIds.has(s.id);
                const recent = recentFailuresBySiteId.get(s.id) ?? [];
                const count30d = recent.length;
                const units = [...new Set(recent.map((f) => formatUnitLabel(f.elevatorNo)).filter(Boolean))];
                const unitLabel = units.length ? units.join(", ") : formatUnitLabel(s.elevatorNo);
                return (
                  <button
                    key={s.id}
                    onClick={() => setHistorySite(s)}
                    className={`w-full flex items-center justify-between bg-white rounded-xl px-3 py-2.5 text-left active:bg-red-50 ${stopped ? "border-2 border-red-400" : "border border-red-100"}`}
                  >
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{s.name}{unitLabel ? ` · ${unitLabel}` : ""}</p>
                      <p className="text-[11px] text-slate-400">{s.address}</p>
                    </div>
                    <span className="flex gap-1 shrink-0">
                      {trapped && <span className="text-xs font-extrabold text-white bg-red-600 px-2 py-1 rounded-full">갇힘</span>}
                      {support && <span className="text-xs font-extrabold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">지원요청</span>}
                      {stopped && <span className="text-xs font-extrabold text-red-600 bg-red-100 px-2 py-1 rounded-full">운행정지</span>}
                      {count30d > 0 && <span className="text-xs font-extrabold text-red-600 bg-red-100 px-2 py-1 rounded-full">{count30d}회 고장</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 공공데이터 실시간 검사 관제 */}
      <div className="px-5 pt-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-blue-950 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold text-blue-950 bg-white px-1.5 py-0.5 rounded">공공데이터</span>
              <span className="text-xs font-extrabold text-white">실시간 검사 관제</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/40 rounded-full pl-1.5 pr-2 py-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <span className="text-[10px] font-extrabold text-emerald-300 tracking-wide">LIVE</span>
            </div>
          </div>
          <p className="px-4 pt-2.5 text-[10px] text-slate-400">국가승강기정보센터(행정안전부) Open API 연동 · 담당 현장 승강기 고유번호 기준 실시간 조회</p>

          <div className="px-4 pt-3 pb-3.5">
            <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
              <ShieldCheck size={13} /> 검사도래현장 · 30일 이내
            </p>
            {dueSoon.length === 0 ? (
              <p className="text-xs text-slate-400 py-1.5">30일 이내 검사 도래 현장이 없습니다.</p>
            ) : (
              <div className="space-y-1.5">
                {dueSoon.map((i) => {
                  const priorUnit = findUnitForInspection(i, allUnits);
                  return (
                    <DueSoonRow
                      key={i.id}
                      i={i}
                      address={stripCityPrefix(siteById.get(i.siteId)?.address)}
                      govElevatorNo={priorUnit?.govNo}
                      onOpenFail={setInspectionFailTarget}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 pb-4 pt-3 border-t border-slate-100">
            <p className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1.5">
              <AlertOctagon size={13} /> 조건부/불합격 현장 · 보완조치 필요
            </p>
            {flagged.length === 0 ? (
              <p className="text-xs text-slate-400 py-1.5">조건부·불합격 현장이 없습니다.</p>
            ) : (
              <div className="space-y-1.5">
                {flagged.map((i) => {
                  const isLive = i.id?.startsWith("unit-");
                  return (
                    <div
                      key={i.id}
                      onClick={isLive ? () => setInspectionFailTarget(i) : undefined}
                      className={`bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 space-y-0.5 touch-manipulation ${isLive ? "active:bg-red-100 cursor-pointer" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-800 truncate min-w-0">{i.siteName} · {i.elevatorNo}</p>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">{i.type}</span>
                          <Badge result={i.result} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-400 truncate min-w-0">{stripCityPrefix(siteById.get(i.siteId)?.address)}</p>
                        <div className="shrink-0 flex items-center gap-1">
                          {i.dueDate && <span className="text-xs font-bold text-blue-700">{formatMonthDay(i.dueDate)}</span>}
                          <DDay dueDate={i.dueDate} />
                        </div>
                      </div>
                      {(i.notes || i.scheduleDate) && (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {i.notes && <p className="text-[11px] text-red-600 leading-relaxed">{i.notes}</p>}
                          </div>
                          {i.scheduleDate && (
                            <span className="shrink-0 text-[10px] text-blue-600 font-semibold">
                              검사일정 {formatMonthDay(i.scheduleDate)}{i.scheduleTime ? ` ${i.scheduleTime}` : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="px-4 pb-3 text-[9.5px] text-slate-300">
            {liveInspections.length > 0
              ? "* 승강기고유번호가 등록된 현장은 국가승강기정보센터 실시간 데이터, 나머지는 수기입력 데이터입니다"
              : "* 프로토타입 시연용 시뮬레이션 데이터입니다 (현장정보에서 승강기고유번호를 등록하면 실시간 데이터로 전환됩니다)"}
          </p>
        </div>
      </div>

      {detailTarget && (
        <FailureDetailSheet
          failure={detailTarget}
          failures={failures}
          onClose={() => setDetailTarget(null)}
          onDispatch={setDispatchTarget}
          onArrive={onArrive}
          onOpenResult={setResultTarget}
          onAssignOpen={setAssignTarget}
        />
      )}
      {assignTarget && (
        <AssignEngineerSheet
          failure={assignTarget}
          failures={failures}
          onAssign={assignTarget.assignee ? onReassign : onAssign}
          attendances={attendances}
          todayLeaves={todayLeaves}
          onClose={() => setAssignTarget(null)}
          allowUnassign={!!assignTarget.assignee}
        />
      )}
      {dispatchTarget && (
        <DispatchEtaModal
          failure={dispatchTarget}
          onClose={() => setDispatchTarget(null)}
          onConfirm={(eta) => {
            onDispatch(dispatchTarget, eta);
            setDispatchTarget(null);
          }}
        />
      )}
      {resultTarget && (
        <ArrivalResultModal
          failure={resultTarget}
          onClose={() => setResultTarget(null)}
          onConfirm={(result) => {
            onResult(resultTarget, result);
            setResultTarget(null);
          }}
        />
      )}
      {inspectionFailTarget && (
        <InspectionFailDetailSheet inspection={inspectionFailTarget} onClose={() => setInspectionFailTarget(null)} />
      )}
      {historySite && (
        <FailureHistoryDetailScreen site={historySite} failures={failures} onBack={() => setHistorySite(null)} />
      )}
      <SmsToast message={toast} />
    </div>
  );
}
