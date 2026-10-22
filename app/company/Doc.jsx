import Link from "next/link";
import { BRAND, COMPANY } from "@/lib/company";
import { SplashRemover } from "../quote-view/SplashRemover";

// 공개 안내 페이지(회사 소개·개인정보처리방침) 공용 틀 — layout의 정적 스플래시는
// 앱 컴포넌트가 지우는데 이 페이지들은 앱을 거치지 않으므로 SplashRemover로 직접 지운다.
export function Doc({ title, children }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <SplashRemover />
      <header className="bg-blue-950 text-white">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center gap-3">
          <img src="/icon-192.png" alt={BRAND.short} width={40} height={40} className="rounded-lg" />
          <Link href="/company" className="font-bold text-lg">{BRAND.name}</Link>
        </div>
      </header>
      <article className="max-w-3xl mx-auto px-5 py-8">
        <h1 className="text-2xl font-bold mb-6">{title}</h1>
        {children}
      </article>
      <footer className="max-w-3xl mx-auto px-5 pb-10 text-xs text-slate-500 leading-relaxed">
        <p>{COMPANY.name} · {COMPANY.ceo} · {COMPANY.regNo.replace("등록번호. ", "사업자등록번호 ")}</p>
        <p>{COMPANY.address}</p>
        <p>{COMPANY.contact}</p>
        <p className="mt-2"><Link href="/privacy" className="underline">개인정보처리방침</Link></p>
      </footer>
    </main>
  );
}

export const H2 = ({ children }) => <h2 className="text-lg font-bold mt-8 mb-2">{children}</h2>;
export const P = ({ children }) => <p className="text-sm leading-7 text-slate-700">{children}</p>;
export const UL = ({ items }) => (
  <ul className="list-disc pl-5 text-sm leading-7 text-slate-700">{items.map((t) => <li key={t}>{t}</li>)}</ul>
);
