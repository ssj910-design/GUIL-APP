import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import fallback from "@/lib/holidays.json";

/**
 * 공휴일 조회 — DB(holidays 테이블, 크론이 특일정보 API로 채움)를 먼저 보고,
 * 비어 있으면 lib/holidays.json 폴백을 쓴다.
 *
 * 폴백이 있는 이유: 특일정보 API 키 발급 전이거나 크론이 실패해도 달력이 비지 않게.
 * 반환하는 `stale`은 "요청한 연도에 공휴일 데이터가 아예 없다"는 뜻 —
 * 화면에서 안내를 띄워 사람이 눈치챌 수 있게 한다.
 */
export function useHolidays(year) {
  const [db, setDb] = useState(null); // null = 아직 로딩

  useEffect(() => {
    let alive = true;
    supabase.from("holidays").select("holiday_date,name").then(({ data }) => {
      if (!alive) return;
      const map = {};
      for (const r of data ?? []) map[r.holiday_date] = r.name;
      setDb(map);
    });
    return () => { alive = false; };
  }, []);

  const fromDb = db && Object.keys(db).length > 0;
  const days = fromDb ? db : fallback.days;
  const hasYear = year == null || Object.keys(days).some((d) => d.startsWith(String(year)));

  return { days, source: fromDb ? "db" : "file", stale: !hasYear };
}
