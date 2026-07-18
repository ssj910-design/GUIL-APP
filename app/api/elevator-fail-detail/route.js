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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const elevatorNo = searchParams.get("elevatorNo");
  if (!elevatorNo) {
    return Response.json({ error: "elevatorNo가 필요합니다" }, { status: 400 });
  }

  // appr_sdt/appr_edt는 검사일이 아니라 "승인일자" 필터라, 실제 검사일 기준 앞뒤로 좁히면
  // 승인 처리 지연이 있는 현장(예: 대흥빌딩)의 이력을 놓친다. 날짜로 좁히지 않고 승강기고유번호로만
  // 조회한 뒤, 이력들 중 부적합내역조회코드(failCd)가 있는 건을 찾는다.
  const safeUrl = `${SAFE_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&pageNo=1&numOfRows=50&elevator_no=${encodeURIComponent(elevatorNo)}`;
  const safeRes = await fetch(safeUrl);
  const safeXml = await safeRes.text();
  const safeResultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(safeXml)?.[1];
  if (safeResultCode !== "00") {
    return Response.json({ error: "검사이력 조회에 실패했습니다" }, { status: 502 });
  }
  // 범위 안에 검사이력이 여러 건 잡히면 부적합내역조회코드(failCd)가 있는 레코드를 우선한다.
  const records = parseItems(safeXml);
  const record = records.find((r) => r.failCd) ?? records[0] ?? null;
  if (!record) {
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
