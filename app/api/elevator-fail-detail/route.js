// 국가승강기정보센터 승강기안전검사이력 조회 서비스를 서버에서 대신 호출합니다.
// 1) getInspectsafeList로 해당 승강기의 전체 검사이력을 가져오고
// 2) anchorDate가 있으면 그 날짜와 가장 가까운 회차 하나만, 없으면 전체 회차를 반환합니다.
//    회차마다 부적합내역조회코드(failCd)가 있으면 getInspectFailList로 실제 부적합 항목을 붙입니다.
//
// 회차별 부적합상세(getInspectFailList)는 두 가지로 느려지지 않게 손봤습니다:
// - 캐시: 과거 회차의 부적합내역은 한번 확정되면 절대 안 바뀌는 데이터라 fail_cd 기준으로
//   inspection_fail_cache(Supabase)에 저장해두고, 있으면 외부 API를 다시 안 부릅니다.
// - 지연 조회: anchorDate 없이 부르는 "검사이력 화면" 전체 목록 조회는 이제 회차 목록만
//   즉시 돌려주고(빠른 API 1번), 부적합상세는 사용자가 그 회차를 클릭했을 때
//   anchorDate로 그 회차 하나만 다시 조회합니다(InspectionFailDetailSheet가 처리).
//
// 실시간 조회 로직(XML 파싱·캐시·회차 매칭)은 lib/govFailApi.js에 있고, 매일 도는
// sync-inspection-cache 크론(조건부·불합격 호기 부적합상세 선캐싱)도 같은 모듈을 쓴다.
import { createClient } from "@supabase/supabase-js";
import { fetchInspectionHistory, findRecordByAnchor, fetchFailItems } from "@/lib/govFailApi";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const elevatorNo = searchParams.get("elevatorNo");
  const anchorDate = searchParams.get("anchorDate");
  const latestOnly = searchParams.get("latestOnly");
  if (!elevatorNo) {
    return Response.json({ error: "elevatorNo가 필요합니다" }, { status: 400 });
  }
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null;

  const records = await fetchInspectionHistory(elevatorNo);
  if (!records) {
    return Response.json({ error: "검사이력 조회에 실패했습니다" }, { status: 502 });
  }

  // 최근 회차 몇 개의 판정결과(dispWords)만 필요한 가벼운 조회 — 부적합 상세(getInspectFailList)는 호출하지 않는다.
  // 검사도래현장 목록에서 "직전 검사가 조건부합격/조건후합격이었는지"만 확인할 때 씀
  // (회차마다 부적합 상세까지 받는 전체이력 조회는 비쌈). 조건후합격은 그 앞 회차(조건부합격)의 부적합내역을
  // 찾아 보여줘야 해서 최근 회차 여러 개를 함께 내려준다.
  if (latestOnly) {
    return Response.json({ records: records.slice(0, 10) });
  }

  // anchorDate 없이 호출하면 검사이력 화면용으로 전체 회차를 최신순으로 반환한다 — 목록만,
  // 부적합상세는 안 붙인다(회차를 클릭했을 때 anchorDate로 그 회차만 따로 조회).
  // failCd가 없는 회차는 조회할 것도 없으니 그 자리에서 바로 확정해서 내려준다.
  if (!anchorDate) {
    const history = records.map((record) =>
      record.failCd ? { record } : { record, items: [], reason: "no_fail_code" }
    );
    return Response.json({ history });
  }

  // anchorDate가 있으면(조건부/불합격 목록에서 특정 건을 클릭한 경우) 그 날짜와 가장 가까운 회차 하나만 찾는다.
  const record = findRecordByAnchor(records, anchorDate);
  if (Number.isNaN(new Date(anchorDate).getTime())) {
    return Response.json({ error: "anchorDate가 올바르지 않습니다" }, { status: 400 });
  }
  if (!record) {
    return Response.json({ items: [], record: null, reason: "no_record" });
  }
  if (!record.failCd) {
    return Response.json({ items: [], record, reason: "no_fail_code" });
  }
  const { items, reason } = await fetchFailItems(supabase, record.failCd);
  return Response.json({ items, record, reason });
}
