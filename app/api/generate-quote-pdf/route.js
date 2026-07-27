// app/api/generate-quote-pdf/route.js
// 견적서 PDF를 생성해 Supabase Storage(photos 버킷, quotes/ 폴더)에 올리고 URL을 돌려준다.
// pdf-lib는 API 키가 필요 없지만, 파일시스템(폰트) 접근이 필요해 서버에서만 실행한다.
import { buildQuotePdfBytes } from "@/lib/quotePdf";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.quoteRequestId) {
    return Response.json({ ok: false, reason: "quoteRequestId 누락" }, { status: 200 });
  }

  let bytes;
  try {
    bytes = await buildQuotePdfBytes(body);
  } catch (err) {
    return Response.json({ ok: false, reason: `PDF 생성 실패: ${err.message}` }, { status: 200 });
  }

  const path = `quotes/${body.quoteRequestId}/${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("photos")
    .upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    return Response.json({ ok: false, reason: `업로드 실패: ${uploadError.message}` }, { status: 200 });
  }

  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return Response.json({ ok: true, url: data.publicUrl });
}
