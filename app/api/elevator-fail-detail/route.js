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

function toYyyymmdd(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const elevatorNo = searchParams.get("elevatorNo");
  const anchorDate = searchParams.get("anchorDate");
  if (!elevatorNo || !anchorDate) {
    return Response.json({ error: "elevatorNo와 anchorDate가 필요합니다" }, { status: 400 });
  }

  const anchor = new Date(anchorDate);
  const sdt = new Date(anchor);
  sdt.setDate(sdt.getDate() - 5);
  const edt = new Date(anchor);
  edt.setDate(edt.getDate() + 5);

  const safeUrl = `${SAFE_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&pageNo=1&numOfRows=5&appr_sdt=${toYyyymmdd(sdt)}&appr_edt=${toYyyymmdd(edt)}&elevator_no=${encodeURIComponent(elevatorNo)}`;
  const safeRes = await fetch(safeUrl);
  const safeXml = await safeRes.text();
  const safeResultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(safeXml)?.[1];
  if (safeResultCode !== "00") {
    return Response.json({ error: "검사이력 조회에 실패했습니다" }, { status: 502 });
  }
  const record = parseItems(safeXml)[0];
  if (!record || !record.failCd) {
    return Response.json({ items: [], record: record ?? null });
  }

  const failUrl = `${FAIL_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&pageNo=1&numOfRows=50&fail_cd=${encodeURIComponent(record.failCd)}`;
  const failRes = await fetch(failUrl);
  const failXml = await failRes.text();
  const failResultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(failXml)?.[1];
  if (failResultCode !== "00") {
    return Response.json({ error: "부적합 항목 조회에 실패했습니다" }, { status: 502 });
  }

  return Response.json({ items: parseItems(failXml), record });
}
