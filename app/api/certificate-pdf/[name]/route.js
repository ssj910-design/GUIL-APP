// app/api/certificate-pdf/[name]/route.js
// 교체확인서 미리보기용 중계 — Storage 파일을 우리 도메인을 거쳐 보내면서 한글 문서명을
// Content-Disposition(과 URL 마지막 조각)에 실어준다. Supabase Storage는 오브젝트 키에
// 한글을 못 쓰고(InvalidKey) 공개 URL에도 파일명을 실을 방법이 없어서, 미리보기를 그쪽
// URL이나 blob:으로 열면 브라우저 내장 PDF 뷰어의 저장 버튼이 엉뚱한 이름을 붙인다.
import { supabase } from "@/lib/supabaseClient";

export async function GET(request, ctx) {
  const { name } = await ctx.params;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  // 우리 버킷의 교체확인서 폴더만 — 아무 URL이나 대신 받아주는 프록시가 되면 안 된다.
  if (!path.startsWith("certificates/") || path.includes("..")) {
    return new Response("bad path", { status: 400 });
  }

  const res = await fetch(supabase.storage.from("photos").getPublicUrl(path).data.publicUrl);
  if (!res.ok) return new Response("not found", { status: 404 });

  return new Response(res.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
