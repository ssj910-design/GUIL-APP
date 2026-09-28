import { BRAND } from "@/lib/company";
import { SplashRemover } from "@/app/quote-view/SplashRemover";
import QuoteViewer from "@/app/quote-view/QuoteViewer";

export const metadata = { title: `청구서 확인 — ${BRAND.name}` };

// 알림톡 버튼으로 들어오는 청구서 확인 페이지 — app/quote-view/page.js와 완전히 같은
// 구성(고정 도메인 페이지로 카카오 인앱브라우저 안전필터 우회, pdfjs-dist로 PDF를 이미지
// 렌더링). QuoteViewer는 문서 종류에 안 묶인 범용 PDF 뷰어라 label만 바꿔 그대로 쓴다.
export default async function BillingViewPage({ searchParams }) {
  const { url } = await searchParams;
  const valid = typeof url === "string" && url.startsWith("https://kdptzotxnzpuwzdguzgh.supabase.co/storage/");

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <SplashRemover />
      <header className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
        <img src="/icon.png" alt={BRAND.short} width={28} height={28} className="rounded-lg" />
        <span className="font-bold text-slate-800">{BRAND.name} 청구서</span>
      </header>
      {valid ? (
        <QuoteViewer url={url} label="청구서" />
      ) : (
        <p className="flex-1 flex items-center justify-center text-sm text-slate-400">잘못된 요청입니다.</p>
      )}
    </div>
  );
}
