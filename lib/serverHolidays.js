// 서버(크론) 전용 공휴일 판정 — app/hooks/useHolidays.js(클라이언트 훅)와 같은 데이터 원천을
// 쓰지만, Supabase 클라이언트가 아니라 supabaseAdmin을 받는 크론 라우트에서 쓰려고 따로 뒀다.
// holidays 테이블(sync-holidays 크론이 특일정보 API로 채움)을 우선 보고, 테이블이 아예
// 비어 있으면(동기화 전·실패) lib/holidays.json 폴백을 본다.
//
// 근로자의날(5월 1일)은 관공서 공휴일이 아니라 holidays 테이블/API에 없다 — 그래서 날짜로
// 직접 판정해 항상 휴일 취급한다.
import fallback from "@/lib/holidays.json";

function isWorkersDay(dateStr) {
  return dateStr.endsWith("-05-01");
}

export async function isKstHoliday(supabaseAdmin, dateStr) {
  if (isWorkersDay(dateStr)) return true;

  const { data: hit, error } = await supabaseAdmin.from("holidays").select("holiday_date").eq("holiday_date", dateStr).limit(1);
  if (!error && hit?.length) return true;
  if (!error) {
    // 이 날짜는 없었다 — 테이블 자체가 비어있는지(동기화 안 됨) 확인해서, 데이터가 있는데도
    // 이 날짜만 없는 거면 진짜 공휴일이 아닌 것이고, 테이블이 통째로 비어있으면 폴백을 본다.
    const { count } = await supabaseAdmin.from("holidays").select("*", { count: "exact", head: true });
    if (count && count > 0) return false;
  }
  return !!fallback.days[dateStr];
}
