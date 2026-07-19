// 자체점검결과를 승강기민원24(RegistInspectionService)에 제출합니다.
// 인증키/암호키는 서버에서만 다루고(클라이언트에 노출 금지) 서명(HMAC-MD5, Base64)까지 여기서 만듭니다.
// "교환 데이터 표준: JSON"이 스펙 문서에 명시돼 있어 certKey/contents/validation을 JSON 바디로 보낸다
// (form-urlencoded로 보냈다가 999(기타 오류)를 받아 JSON으로 전환 — 실제 운영 전 반드시 소량으로 재검증할 것,
// 이 샌드박스에서는 실제 호출을 확인할 수 없습니다).
import crypto from "crypto";

const REGIST_URL = "https://minwon.koelsa.or.kr/openapi/service/RegistInspectionService.do";

export async function POST(request) {
  const certKey = process.env.MINWON24_CERT_KEY;
  const cryptKey = process.env.MINWON24_CRYPT_KEY;
  if (!certKey || !cryptKey) {
    return Response.json({ error: "MINWON24_CERT_KEY / MINWON24_CRYPT_KEY 환경변수가 설정되지 않았습니다" }, { status: 500 });
  }

  let contentsObj;
  try {
    contentsObj = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 올바르지 않습니다" }, { status: 400 });
  }

  const contents = JSON.stringify(contentsObj);
  const validation = crypto.createHmac("md5", cryptKey).update(contents, "utf8").digest("base64");

  let res;
  try {
    res = await fetch(REGIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ certKey, contents, validation }),
    });
  } catch (err) {
    return Response.json({ error: "공단 서버 호출에 실패했습니다: " + err.message }, { status: 502 });
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return Response.json({ error: "공단 응답을 해석할 수 없습니다", httpStatus: res.status, raw: text.slice(0, 800) }, { status: 502 });
  }
  return Response.json(data);
}
