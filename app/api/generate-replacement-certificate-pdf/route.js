// app/api/generate-replacement-certificate-pdf/route.js
// 교체확인서 PDF를 매 요청마다 즉석에서 만들어 그대로 돌려준다 — 스토리지에 올려두지
// 않는다(견적서 PDF와 달리, 열람 이력을 남길 필요가 없고 원본 데이터가 바뀌면 그때그때
// 최신 내용으로 다시 열람돼야 한다). pdf-lib는 파일시스템(폰트) 접근이 필요해 서버에서만.
import { buildReplacementCertificatePdfBytes } from "@/lib/replacementCertificatePdf";

export async function POST(request) {
  const cert = await request.json().catch(() => null);
  if (!cert) {
    return Response.json({ ok: false, reason: "요청 본문이 올바르지 않습니다" }, { status: 200 });
  }

  let bytes;
  try {
    bytes = await buildReplacementCertificatePdfBytes(cert);
  } catch (err) {
    return Response.json({ ok: false, reason: `PDF 생성 실패: ${err.message}` }, { status: 200 });
  }

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: { "Content-Type": "application/pdf" },
  });
}
