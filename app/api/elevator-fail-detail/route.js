// 국가승강기정보센터 승강기안전검사이력 조회 서비스를 서버에서 대신 호출합니다.
// 1) getInspectsafeList로 해당 승강기의 전체 검사이력을 가져오고
// 2) anchorDate가 있으면 그 날짜와 가장 가까운 회차 하나만, 없으면 전체 회차를 반환합니다.
//    회차마다 부적합내역조회코드(failCd)가 있으면 getInspectFailList로 실제 부적합 항목을 붙입니다.
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

// 실데이터로 확인된 실제 검사일자 필드는 inspctDe다(청담포레·대흥빌딩 응답에서 검증됨).
// 다른 날짜 필드(예: applcEnDt=이전 회차의 유효기간 종료일)는 다음 검사일 직전이라 헷갈리기 쉬워 쓰지 않는다.
function inspectDateMs(record) {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(record.inspctDe ?? "");
  if (!m) return null;
  const t = new Date(`${m[1]}-${m[2]}-${m[3]}`).getTime();
  return Number.isNaN(t) ? null : t;
}

async function fetchFailItemsOnce(failCd) {
  const failUrl = `${FAIL_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&pageNo=1&numOfRows=50&fail_cd=${encodeURIComponent(failCd)}`;
  const failRes = await fetch(failUrl);
  const failXml = await failRes.text();
  const failResultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(failXml)?.[1];
  if (failResultCode !== "00") {
    return { items: [], reason: "fetch_failed" };
  }
  const items = parseItems(failXml);
  // failCd는 있는데 상세 항목이 0건인 경우도 있다 — 국가승강기정보센터 쪽 데이터 공백으로 보이며 코드로는 더 확인할 수 없다.
  return { items, reason: items.length === 0 ? "no_items_for_fail_code" : null };
}

// 검사이력 화면은 회차마다 이 함수를 호출한다 — 한꺼번에 몰아서 부르면 순간적으로 레이트리밋에
// 걸려 일부만 실패할 수 있어(현재&미래 사례), 실패 시 한 번 더 시도한다.
async function fetchFailItems(failCd) {
  const first = await fetchFailItemsOnce(failCd);
  if (first.reason !== "fetch_failed") return first;
  return fetchFailItemsOnce(failCd);
}

const ONE_DAY_MS = 86400000;
const MAX_MATCH_DAYS = 45; // 이 범위 밖이면 다른 회차 검사이력으로 보고 매칭하지 않는다.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const elevatorNo = searchParams.get("elevatorNo");
  const anchorDate = searchParams.get("anchorDate");
  const latestOnly = searchParams.get("latestOnly");
  if (!elevatorNo) {
    return Response.json({ error: "elevatorNo가 필요합니다" }, { status: 400 });
  }

  const safeUrl = `${SAFE_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&pageNo=1&numOfRows=50&elevator_no=${encodeURIComponent(elevatorNo)}`;
  const safeRes = await fetch(safeUrl);
  const safeXml = await safeRes.text();
  const safeResultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(safeXml)?.[1];
  if (safeResultCode !== "00") {
    return Response.json({ error: "검사이력 조회에 실패했습니다" }, { status: 502 });
  }
  const records = parseItems(safeXml).sort((a, b) => (inspectDateMs(b) ?? 0) - (inspectDateMs(a) ?? 0));

  // 최근 회차 몇 개의 판정결과(dispWords)만 필요한 가벼운 조회 — 부적합 상세(getInspectFailList)는 호출하지 않는다.
  // 검사도래현장 목록에서 "직전 검사가 조건부합격/조건후합격이었는지"만 확인할 때 씀
  // (회차마다 부적합 상세까지 받는 전체이력 조회는 비쌈). 조건후합격은 그 앞 회차(조건부합격)의 부적합내역을
  // 찾아 보여줘야 해서 최근 회차 여러 개를 함께 내려준다.
  if (latestOnly) {
    return Response.json({ records: records.slice(0, 10) });
  }

  // anchorDate 없이 호출하면 검사이력 화면용으로 전체 회차를 최신순으로 반환한다.
  // 회차별 조회를 병렬로 몰아서 보내면 순간적으로 레이트리밋에 걸릴 수 있어(현재&미래 사례) 순차로 처리한다.
  if (!anchorDate) {
    const history = [];
    for (const record of records) {
      if (!record.failCd) {
        history.push({ record, items: [], reason: "no_fail_code" });
        continue;
      }
      const { items, reason } = await fetchFailItems(record.failCd);
      history.push({ record, items, reason });
    }
    return Response.json({ history });
  }

  // anchorDate가 있으면(조건부/불합격 목록에서 특정 건을 클릭한 경우) 그 날짜와 가장 가까운 회차 하나만 찾는다.
  const anchorTime = new Date(anchorDate).getTime();
  if (Number.isNaN(anchorTime)) {
    return Response.json({ error: "anchorDate가 올바르지 않습니다" }, { status: 400 });
  }
  let record = null;
  let bestDiff = Infinity;
  for (const r of records) {
    const t = inspectDateMs(r);
    if (t === null) continue;
    const diff = Math.abs(t - anchorTime);
    if (diff < bestDiff) { bestDiff = diff; record = r; }
  }
  if (!record || bestDiff > MAX_MATCH_DAYS * ONE_DAY_MS) {
    return Response.json({ items: [], record: null, reason: "no_record" });
  }
  if (!record.failCd) {
    return Response.json({ items: [], record, reason: "no_fail_code" });
  }
  const { items, reason } = await fetchFailItems(record.failCd);
  return Response.json({ items, record, reason });
}
