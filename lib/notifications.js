// 알림 종류 카탈로그 — 여기가 유일한 원본이다.
// 관리자 설정 화면·기사 설정 화면·발송 로직이 전부 이 목록을 읽는다.
// 새 알림을 추가하려면 여기에 한 줄 넣으면 화면과 설정이 자동으로 따라온다.
//
// level: urgent(소리·진동) | normal(무음 푸시) | low(앱 배지만)
// trigger: instant(사람이 행동한 직후) | scheduled(크론이 시각 보고)
// audience: engineer | admin | all

export const LEVELS = {
  urgent: { label: "긴급", desc: "소리·진동", tone: "bg-red-50 text-red-600 border-red-200" },
  normal: { label: "보통", desc: "무음 푸시", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { label: "낮음", desc: "앱 배지만", tone: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const NOTIFICATIONS = [
  // ---- 고장 (가장 급한 축) ----
  { key: "failure_assigned", label: "나에게 고장이 배정됨", audience: "engineer", level: "urgent", trigger: "instant", group: "고장" },
  { key: "failure_unassigned", label: "미배정 고장 발생 (전원)", audience: "engineer", level: "urgent", trigger: "instant", group: "고장",
    desc: "선착순으로 잡는 건이라 전원에게 갑니다" },
  { key: "failure_reported", label: "고장 접수됨", audience: "admin", level: "urgent", trigger: "instant", group: "고장" },
  { key: "failure_refused", label: "출동 거부됨", audience: "admin", level: "urgent", trigger: "instant", group: "고장" },
  { key: "failure_escalated", label: "갇힘·운행정지 등 중대 건", audience: "admin", level: "urgent", trigger: "instant", group: "고장" },
  { key: "failure_stale", label: "N분째 아무도 안 잡음", audience: "admin", level: "urgent", trigger: "scheduled", group: "고장",
    desc: "15분마다 미배정 건을 확인" },
  { key: "failure_reassigned", label: "내 건이 재배정돼 회수됨", audience: "engineer", level: "normal", trigger: "instant", group: "고장" },

  // ---- 근무 ----
  { key: "duty_swap_request", label: "근무 교환 요청 받음", audience: "engineer", level: "normal", trigger: "instant", group: "근무" },
  { key: "duty_swap_result", label: "내 교환 요청 수락·거절됨", audience: "engineer", level: "normal", trigger: "instant", group: "근무" },
  { key: "duty_tomorrow", label: "내일 내 당직·숙직", audience: "engineer", level: "low", trigger: "scheduled", group: "근무",
    desc: "전날 저녁 발송" },
  { key: "attendance_missing", label: "출근 체크 안 함", audience: "engineer", level: "low", trigger: "scheduled", group: "근무",
    desc: "09:30 기준" },
  { key: "attendance_report", label: "출근 미체크 인원 요약", audience: "admin", level: "low", trigger: "scheduled", group: "근무",
    desc: "10:00 기준" },

  // ---- 연차 ----
  { key: "leave_requested", label: "연차 신청 들어옴", audience: "admin", level: "normal", trigger: "instant", group: "연차" },
  { key: "leave_decided", label: "내 연차 승인·반려됨", audience: "engineer", level: "normal", trigger: "instant", group: "연차" },

  // ---- 점검·검사 ----
  { key: "selfcheck_pending", label: "이번 달 자체점검 미완료", audience: "engineer", level: "normal", trigger: "scheduled", group: "점검",
    desc: "말일 임박 시" },
  { key: "inspection_due", label: "담당 현장 정기검사 임박", audience: "engineer", level: "normal", trigger: "scheduled", group: "점검",
    desc: "D-7" },
  { key: "selfcheck_gov_failed", label: "자체점검 공단 제출 실패", audience: "admin", level: "normal", trigger: "instant", group: "점검" },
  { key: "selfcheck_progress", label: "자체점검 진행률 저조", audience: "admin", level: "low", trigger: "scheduled", group: "점검",
    desc: "매월 25일" },

  // ---- 자재·계약 ----
  { key: "supply_ready", label: "자재·견적 지급 완료 (수령 확인)", audience: "engineer", level: "normal", trigger: "instant", group: "자재" },
  { key: "supply_requested", label: "자재·견적 신청 들어옴", audience: "admin", level: "normal", trigger: "instant", group: "자재" },
  { key: "contract_expiring", label: "계약 만료 D-30", audience: "admin", level: "normal", trigger: "scheduled", group: "계약",
    desc: "주 1회" },

  // ---- 우리방 ----
  { key: "room_mention", label: "우리방에서 나를 @멘션", audience: "all", level: "normal", trigger: "instant", group: "우리방" },
  { key: "room_notice", label: "공지 등록됨", audience: "all", level: "normal", trigger: "instant", group: "우리방" },
];

export const GROUPS = [...new Set(NOTIFICATIONS.map((n) => n.group))];

/** 그 사람이 받을 수 있는 알림 목록 */
export function forRole(role) {
  return NOTIFICATIONS.filter((n) => n.audience === "all" || n.audience === (role === "admin" ? "admin" : "engineer"));
}

/**
 * 실제 발송 여부 — 회사 설정(관리자)이 먼저고, 그 안에서 개인이 끌 수 있다.
 * 회사가 끈 알림은 개인이 켜도 안 간다(반대로 개인이 끈 건 존중한다).
 * 개인 설정이 없으면 level 기본값을 따른다: low는 기본 꺼짐, 나머지는 켜짐.
 */
export function isEnabled(item, orgSettings = {}, userPrefs = {}) {
  const org = orgSettings[item.key];
  if (org?.enabled === false) return false;
  const mine = userPrefs[item.key];
  if (mine != null) return mine;
  return (org?.level ?? item.level) !== "low";
}

/** 회사 설정에서 등급을 바꿨으면 그 값을 쓴다 */
export function levelOf(item, orgSettings = {}) {
  return orgSettings[item.key]?.level ?? item.level;
}
