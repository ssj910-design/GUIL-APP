// 알림 종류 카탈로그 — 여기가 유일한 원본이다.
// 관리자 설정 화면·기사 설정 화면·발송 로직이 전부 이 목록을 읽는다.
// 새 알림을 추가하려면 여기에 한 줄 넣으면 화면과 설정이 자동으로 따라온다.
//
// level: urgent(소리·진동+헤드업 배너) | high(소리·진동) | normal(무음 푸시) | low(앱 배지만)
// trigger: instant(사람이 행동한 직후) | scheduled(크론이 시각 보고)
// audience: engineer | admin | all | engineer_admin(배정 기사 고정 + 관리자는 등급 선택)

export const LEVELS = {
  urgent: { label: "긴급", desc: "소리·진동 + 헤드업 배너", tone: "bg-red-50 text-red-600 border-red-200" },
  high: { label: "높음", desc: "소리·진동", tone: "bg-orange-50 text-orange-600 border-orange-200" },
  normal: { label: "보통", desc: "무음 푸시", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { label: "낮음", desc: "앱 배지만", tone: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const NOTIFICATIONS = [
  // ---- 고장 (가장 급한 축) ----
  { key: "failure_assigned", label: "나에게 고장이 배정됨", audience: "engineer", level: "urgent", trigger: "instant", group: "고장" },
  { key: "failure_unassigned", label: "미배정 고장 발생 (전원)", audience: "engineer", level: "urgent", trigger: "instant", group: "고장",
    desc: "선착순으로 잡는 건이라 전원에게 갑니다" },
  { key: "failure_reported", label: "고장 접수됨", audience: "engineer_admin", level: "urgent", trigger: "instant", group: "고장" },
  { key: "failure_refused", label: "출동 거부됨", audience: "admin", level: "urgent", trigger: "instant", group: "고장" },
  { key: "failure_escalated", label: "갇힘·운행정지 등 중대 건", audience: "admin", level: "urgent", trigger: "instant", group: "고장" },
  { key: "failure_stale", label: "미배정 고장 반복 재촉", audience: "engineer_admin", level: "urgent", trigger: "scheduled", built: true, group: "고장",
    defaultAudienceTiers: ["super", "manager"], // 자재담당관리자는 고장 대응에 관여하지 않아 기본 제외
    desc: "접수 후 10분째부터 10분 간격으로 최대 3회, 출근중인 기사 전원 + 관리자에게 (지원요청·운행정지로 되돌아간 건 제외, pg_cron이 매분 확인)" },
  { key: "dispatch_no_response", label: "배정된 기사가 출동응답 안 함", audience: "engineer_admin", level: "urgent", trigger: "scheduled", built: true, group: "고장",
    defaultAudienceTiers: ["super", "manager"], // 자재담당관리자는 고장 대응에 관여하지 않아 기본 제외
    desc: "배정 후 3분마다 배정 기사(출근중일 때만)·관리자에게 (pg_cron이 매분 확인)" },
  { key: "failure_reassigned", label: "내 건이 재배정돼 회수됨", audience: "engineer", level: "normal", trigger: "instant", group: "고장" },
  { key: "failure_completed", label: "고장 처리완료", audience: "engineer_admin", level: "urgent", trigger: "instant", group: "고장" },
  { key: "failure_result_escalated", label: "처리 중 지원요청·운행정지 발생", audience: "all", level: "urgent", trigger: "instant", group: "고장" },
  { key: "critical_site_new", label: "집중관리현장 새로 발생", audience: "all", level: "urgent", trigger: "instant", group: "고장" },
  { key: "critical_site_repeat", label: "집중관리현장 추가 고장", audience: "admin", level: "urgent", trigger: "instant", group: "고장" },

  // ---- 근무 ----
  { key: "duty_swap_request", label: "근무 교환 요청 받음", audience: "engineer", level: "normal", trigger: "instant", group: "근무" },
  { key: "duty_swap_result", label: "내 교환 요청 수락·거절됨", audience: "engineer", level: "normal", trigger: "instant", group: "근무" },
  { key: "duty_tomorrow", label: "내일 내 당직·숙직", audience: "engineer", level: "low", trigger: "scheduled", built: true, group: "근무",
    desc: "전날 18:00" },
  { key: "attendance_missing", label: "출근 체크 안 함", audience: "engineer", level: "low", trigger: "scheduled", built: true, group: "근무",
    desc: "09:01~10:00 매분, 체크 전까지 (연차·반차(오전)·병가·공가 제외)" },
  { key: "attendance_report", label: "출근 미체크 인원 요약", audience: "admin", level: "low", trigger: "scheduled", built: true, group: "근무",
    desc: "09:10 기준 (연차·반차(오전)·병가·공가 제외)" },

  // ---- 연차 ----
  { key: "leave_requested", label: "연차 신청 들어옴", audience: "admin", level: "normal", trigger: "instant", group: "연차" },
  { key: "leave_decided", label: "내 연차 승인·반려됨", audience: "engineer", level: "normal", trigger: "instant", group: "연차" },

  // ---- 점검·검사 ----
  { key: "selfcheck_pending", label: "이번 달 자체점검 미완료", audience: "engineer", level: "normal", trigger: "scheduled", built: true, group: "점검",
    desc: "말일부터 매일 09:00, 등록+공단제출 성공할 때까지 반복" },
  { key: "inspection_due", label: "오늘 담당현장 정기검사", audience: "engineer", level: "normal", trigger: "scheduled", built: true, group: "점검",
    desc: "매일 08:00, 당일 검사 있는 담당현장만" },
  { key: "selfcheck_gov_failed", label: "자체점검 공단 제출 실패", audience: "engineer", level: "normal", trigger: "instant", built: true, group: "점검",
    desc: "본인 담당현장이 실패했을 때만" },

  // ---- 자재·계약 ----
  { key: "supply_ready", label: "자재·견적 지급 완료 (수령 확인)", audience: "engineer", level: "normal", trigger: "instant", group: "자재" },
  { key: "restock_ready", label: "상비부품 지급 완료 (수령 확인)", audience: "engineer", level: "normal", trigger: "instant", group: "자재" },
  { key: "material_requested", label: "자재 신청 들어옴", audience: "admin", level: "normal", trigger: "instant", group: "자재" },
  { key: "quote_requested", label: "견적 신청 들어옴", audience: "admin", level: "normal", trigger: "instant", group: "자재" },
  { key: "material_request_cancelled", label: "자재 신청 취소됨", audience: "admin", level: "normal", trigger: "instant", group: "자재" },
  { key: "quote_request_cancelled", label: "견적 신청 취소됨", audience: "admin", level: "normal", trigger: "instant", group: "자재" },
  { key: "contract_expiring", label: "계약 만료 D-30", audience: "admin", level: "normal", trigger: "scheduled", built: true, group: "계약",
    desc: "매주 월 09:00, 만료 30일 이내 현장" },

  // ---- 할일 ----
  { key: "todo_assigned", label: "나에게 할 일이 배정됨 (관리자 등록)", audience: "engineer", level: "normal", trigger: "instant", group: "할일" },
  { key: "todo_reassign_requested", label: "할일 재배정 요청 들어옴", audience: "admin", level: "normal", trigger: "instant", group: "할일" },

  // ---- 게시판 ----
  // room_new_post는 멘션·공지 대상자와 겹치지 않는다 — 그 두 알림을 이미 받은 사람은
  // handleSendFeedPost에서 이 알림 대상 목록에서 빼서 한 글에 두 알림이 안 가게 한다.
  { key: "room_new_post", label: "게시판에 새 글 올라옴 (멘션·공지 대상자 제외)", audience: "all", level: "normal", trigger: "instant", group: "게시판" },
  { key: "room_mention", label: "게시판에서 나를 @멘션", audience: "all", level: "normal", trigger: "instant", group: "게시판" },
  { key: "room_notice", label: "공지 등록됨", audience: "all", level: "normal", trigger: "instant", group: "게시판" },
  { key: "room_comment", label: "내 글에 댓글 달림", audience: "all", level: "normal", trigger: "instant", group: "게시판" },
  { key: "feedback_reply", label: "내 건의에 답글 달림", audience: "all", level: "normal", trigger: "instant", group: "게시판" },
];

export const GROUPS = [...new Set(NOTIFICATIONS.map((n) => n.group))];

/** 그 사람이 받을 수 있는 알림 목록 */
export function forRole(role) {
  return NOTIFICATIONS.filter((n) =>
    n.audience === "all" || n.audience === "engineer_admin" || n.audience === (role === "admin" ? "admin" : "engineer")
  );
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

/**
 * 관리자가 포함된 알림(audience: "admin" | "engineer_admin")만 받는 사람을 등급으로 좁힐 수
 * 있다 — 여러 등급을 동시에 고를 수 있어(예: 최고+중간만) 항상 배열로 돌려준다.
 * 저장된 값이 없으면 카탈로그의 defaultAudienceTiers를, 그것도 없으면 빈 배열(=전체 관리자)을 쓴다.
 * 화면(NotifySettings)과 실제 발송(check-failures 크론)이 이 함수 하나를 같이 써서 라벨과 실제
 * 수신자가 항상 일치하게 한다.
 */
export function audienceTiersOf(item, orgSettings = {}) {
  if (item.audience !== "admin" && item.audience !== "engineer_admin") return [];
  const saved = orgSettings[item.key]?.audienceTiers;
  return saved && saved.length ? saved : (item.defaultAudienceTiers ?? []);
}
