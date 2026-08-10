// 카카오 알림톡 버튼(도메인이 kdptzotxnzpuwzdguzgh.supabase.co로 고정된 승인 템플릿) 전용
// 견적서 뷰어. Storage에 직접 HTML을 올리면 Supabase가 보안상 text/plain으로 강제
// 다운그레이드해서(XSS 방지) 렌더링이 안 된다 — Edge Function은 그 제약을 안 받는다.
//
// 카카오톡 인앱 브라우저(특히 안드로이드)는 PDF 자체를 못 열고 바로 다운로드로 넘겨버리므로,
// 구글 뷰어(docs.google.com/gview)로 PDF를 페이지 안에 그려서 보여준다.
Deno.serve((req) => {
  const url = new URL(req.url).searchParams.get("url");
  if (!url || !url.startsWith("https://kdptzotxnzpuwzdguzgh.supabase.co/storage/")) {
    return new Response("잘못된 요청입니다", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>견적서</title></head><body style="margin:0"><iframe src="https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}" style="width:100vw;height:100vh;border:0"></iframe></body></html>`;
  // 카카오 인앱 브라우저가 Content-Type을 무시하고 자체 판단(sniffing)해 원문을 그대로
  // 텍스트로 보여주는 걸 막기 위해 nosniff를 명시한다.
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
});
