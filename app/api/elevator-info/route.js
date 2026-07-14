// 국가승강기정보센터(한국승강기안전공단) 건물별승강기정보 조회 서비스를 서버에서 대신 호출합니다.
// 인증키를 브라우저에 노출하지 않기 위해 클라이언트가 아닌 이 라우트에서만 호출합니다.
const GOV_API_URL = "https://apis.data.go.kr/B553664/BuldElevatorService/getBuldElvtrList";

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

  const url = `${GOV_API_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&elevator_no=${encodeURIComponent(elevatorNo)}`;
  const res = await fetch(url);
  const xml = await res.text();

  const resultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(xml)?.[1];
  const resultMsg = /<resultMsg>([^<]*)<\/resultMsg>/.exec(xml)?.[1];

  if (resultCode !== "00") {
    return Response.json({ error: resultMsg ?? "조회에 실패했습니다" }, { status: 502 });
  }

  return Response.json({ items: parseItems(xml) });
}
