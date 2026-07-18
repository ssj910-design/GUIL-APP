// 국가승강기정보센터 승강기안전검사이력 조회 서비스를 서버에서 대신 호출합니다.
// 1) getInspectsafeList로 해당 승강기의 검사이력(부적합내역조회코드 포함)을 찾고
// 2) getInspectFailList로 그 코드에 해당하는 실제 부적합 항목을 가져옵니다.
const SAFE_URL = "https://apis.data.go.kr/B553664/ElevatorInspectsafeService/getInspectsafeList";
const FAIL_URL = "https://apis.data.go.kr/B553664/ElevatorInspectsafeService/getInspectFailList";

function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((itemMatch) => {
    const fields = {};
    for (const fieldMatch of itemMatch[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)) {
      fields[fieldMatch[1]] = fieldMatch[2];
    }
    return fields;
  });
}

// 레코드의 필드명을 모른 채로(응답 스펙 미확인) 날짜로 보이는 값을 전부 찾아 anchorTime과의
// 최소 시간차를 구한다. appr_sdt/appr_edt 같은 요청 파라미터로 서버에 필터링을 맡기면
// "승인일자"처럼 실제 검사일과 다른 날짜 기준으로 걸러져 엉뚱한 이력이 뽑힐 수 있어(대흥빌딩 사례),
// 필터 없이 전체를 받아 클라이언트(서버 라우트)에서 직접 검사일과 제일 가까운 레코드를 고른다.
function closestDateDiffMs(record, anchorTime) {
  let best = Infinity;
  for (const value of Object.values(record)) {
    const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value ?? "");
    if (!m) continue;
    const t = new Date(`${m[1]}-${m[2]}-${m[3]}`).getTime();
    if (Number.isNaN(t)) continue;
    const diff = Math.abs(t - anchorTime);
    if (diff < best) best = diff;
  }
  return best;
}

const ONE_DAY_MS = 86400000;
const MAX_MATCH_DAYS = 45; // 이 범위 밖이면 다른 회차 검사이력으로 보고 매칭하지 않는다.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const elevatorNo = searchParams.get("elevatorNo");
  const anchorDate = searchParams.get("anchorDate");
  if (!elevatorNo || !anchorDate) {
    return Response.json({ error: "elevatorNo와 anchorDate가 필요합니다" }, { status: 400 });
  }
  const anchorTime = new Date(anchorDate).getTime();
  if (Number.isNaN(anchorTime)) {
    return Response.json({ error: "anchorDate가 올바르지 않습니다" }, { status: 400 });
  }

  const safeUrl = `${SAFE_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&pageNo=1&numOfRows=50&elevator_no=${encodeURIComponent(elevatorNo)}`;
  const safeRes = await fetch(safeUrl);
  const safeXml = await safeRes.text();
  const safeResultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(safeXml)?.[1];
  if (safeResultCode !== "00") {
    return Response.json({ error: "검사이력 조회에 실패했습니다" }, { status: 502 });
  }

  // 이 승강기의 전체 검사이력 중 실제 검사일(anchorDate)과 가장 가까운 회차를 고른다.
  // failCd 유무로 먼저 거르면 다른 회차의 부적합 이력이 섞여 나올 수 있으므로(대흥빌딩 사례),
  // 날짜 근접도를 우선 기준으로 삼는다.
  const records = parseItems(safeXml);
  let record = null;
  let bestDiff = Infinity;
  for (const r of records) {
    const diff = closestDateDiffMs(r, anchorTime);
    if (diff < bestDiff) { bestDiff = diff; record = r; }
  }
  if (!record || bestDiff > MAX_MATCH_DAYS * ONE_DAY_MS) {
    return Response.json({ items: [], record: null, reason: "no_record" });
  }
  if (!record.failCd) {
    return Response.json({ items: [], record, reason: "no_fail_code" });
  }

  const failUrl = `${FAIL_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&pageNo=1&numOfRows=50&fail_cd=${encodeURIComponent(record.failCd)}`;
  const failRes = await fetch(failUrl);
  const failXml = await failRes.text();
  const failResultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(failXml)?.[1];
  if (failResultCode !== "00") {
    return Response.json({ error: "부적합 항목 조회에 실패했습니다" }, { status: 502 });
  }

  const items = parseItems(failXml);
  // failCd는 있는데 상세 항목이 0건인 경우도 있다 — 국가승강기정보센터 쪽 데이터 공백으로 보이며 코드로는 더 확인할 수 없다.
  return Response.json({ items, record, reason: items.length === 0 ? "no_items_for_fail_code" : null });
}
