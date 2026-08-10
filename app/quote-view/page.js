import { BRAND } from "@/lib/company";
import { SplashRemover } from "./SplashRemover";

export const metadata = { title: `견적서 확인 — ${BRAND.name}` };

// 알림톡 버튼으로 들어오는 견적서 확인 페이지 — Supabase Edge Function 단독 응답과 달리
// 우리 앱의 진짜 페이지(제목·아이콘·본문 다 갖춤)라, 카카오 인앱브라우저의 알림톡
// 링크 안전필터가 "정체를 알 수 없는 최소한의 응답"으로 의심해 원문 텍스트만 보여주던
// 문제를 피하려는 시도다 (자세한 배경은 lib/alimtalk.js 주석 참고).
export default async function QuoteViewPage({ searchParams }) {
  const { url } = await searchParams;
  const valid = typeof url === "string" && url.startsWith("https://kdptzotxnzpuwzdguzgh.supabase.co/storage/");

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <SplashRemover />
      <header className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
        <img src="/icon.png" alt={BRAND.short} width={28} height={28} className="rounded-lg" />
        <span className="font-bold text-slate-800">{BRAND.name} 견적서</span>
      </header>
      {valid ? (
        <iframe
          src={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`}
          className="flex-1 w-full border-0"
          title="견적서 PDF"
        />
      ) : (
        <p className="flex-1 flex items-center justify-center text-sm text-slate-400">잘못된 요청입니다.</p>
      )}
    </div>
  );
}
