// 국가승강기정보센터 승강기안전검사이력 조회 서비스를 서버에서 대신 호출합니다.
// 1) getInspectsafeList로 해당 승강기의 전체 검사이력을 가져오고
// 2) 회차별로 부적합내역조회코드(failCd)가 있으면 getInspectFailList로 실제 부적합 항목을 가져옵니다.
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
function inspectDateMs(record) {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(record.inspctDe ?? "");
  if (!m) return null;
  const t = new Date(`${m[1]}-${m[2]}-${m[3]}`).getTime();
  return Number.isNaN(t) ? null : t;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const elevatorNo = searchParams.get("elevatorNo");
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

  const history = await Promise.all(
    records.map(async (record) => {
      if (!record.failCd) {
        return { record, items: [], reason: "no_fail_code" };
      }
      const failUrl = `${FAIL_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&pageNo=1&numOfRows=50&fail_cd=${encodeURIComponent(record.failCd)}`;
      const failRes = await fetch(failUrl);
      const failXml = await failRes.text();
      const failResultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(failXml)?.[1];
      if (failResultCode !== "00") {
        return { record, items: [], reason: "fetch_failed" };
      }
      const items = parseItems(failXml);
      // failCd는 있는데 상세 항목이 0건인 경우도 있다 — 국가승강기정보센터 쪽 데이터 공백으로 보이며 코드로는 더 확인할 수 없다.
      return { record, items, reason: items.length === 0 ? "no_items_for_fail_code" : null };
    })
  );

  return Response.json({ history });
}
