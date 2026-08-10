// 카카오 알림톡 버튼(도메인이 kdptzotxnzpuwzdguzgh.supabase.co로 고정된 승인 템플릿) 전용
// 견적서 뷰어 경유지. 카카오톡 인앱 브라우저는 우리 도메인이 직접 내려주는 HTML을
// 렌더링하지 않고 응답 원문을 그대로 텍스트로 보여줬다(Content-Type·nosniff를 정확히
// 보내도 동일) — 대신 구글 뷰어 페이지(docs.google.com, 카카오도 신뢰하는 일반 사이트)로
// 302 리다이렉트만 시킨다. 사용자가 실제로 보게 되는 페이지는 우리 도메인이 아니라
// 구글 뷰어 자체라서, 카카오가 우리 HTML을 못 그리는 문제 자체를 우회한다.
Deno.serve((req) => {
  const url = new URL(req.url).searchParams.get("url");
  if (!url || !url.startsWith("https://kdptzotxnzpuwzdguzgh.supabase.co/storage/")) {
    return new Response("잘못된 요청입니다", { status: 400 });
  }
  const target = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
  return Response.redirect(target, 302);
});
