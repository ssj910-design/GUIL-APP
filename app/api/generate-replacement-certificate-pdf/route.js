// app/api/generate-replacement-certificate-pdf/route.js
// 교체확인서 PDF를 만들어 그대로 돌려주면서(첫 열람도 곧장 보이게), 동시에 Storage에도
// 올려 URL을 X-Certificate-Url 헤더로 함께 준다. 호출부(BillingsAdmin)가 이 URL을
// billings.certificate_pdf_url에 저장해두면, 다음부터는 이 API를 다시 부르지 않고 그
// 파일을 바로 열어서 몇 초씩 걸리던 재생성(특히 한글 폰트 임베딩)을 건너뛸 수 있다.
import { buildReplacementCertificatePdfBytes } from "@/lib/replacementCertificatePdf";
import { supabase } from "@/lib/supabaseClient";

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

  let certUrl = null;
  if (cert.billingId) {
    const path = `certificates/${cert.billingId}/${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
    if (!uploadError) {
      certUrl = supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
    }
  }

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      ...(certUrl ? { "X-Certificate-Url": certUrl } : {}),
    },
  });
}
