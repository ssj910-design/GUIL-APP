import { BRAND } from "@/lib/company";
import { SplashRemover } from "@/app/quote-view/SplashRemover";
import QuoteApproveClient from "./QuoteApproveClient";

export const metadata = { title: `견적 승인 — ${BRAND.name}` };

// 알림톡·이메일로 들어오는 견적 승인 페이지 — 로그인 없이, 고객이 직접 금액을 확인·입력하고
// 서명해서 승인한다(전화승인 대체). app/quote-view/page.js와 같은 틀(서버 컴포넌트가 쿼리
// 파라미터만 읽고, 실제 데이터 조회·쓰기는 클라이언트 컴포넌트가 담당)을 그대로 쓴다.
export default async function QuoteApprovePage({ searchParams }) {
  const { id } = await searchParams;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <SplashRemover />
      <header className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
        <img src="/icon.png" alt={BRAND.short} width={28} height={28} className="rounded-lg" />
        <span className="font-bold text-slate-800">{BRAND.name} 견적 승인</span>
      </header>
      {id ? (
        <QuoteApproveClient id={id} />
      ) : (
        <p className="flex-1 flex items-center justify-center text-sm text-slate-400">잘못된 요청입니다.</p>
      )}
    </div>
  );
}
