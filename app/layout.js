import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "구일엘리베이터(주) 현장관리",
  description: "승강기 유지보수 현장관리 앱",
  appleWebApp: {
    title: "구일엘리베이터",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#172554",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* JS가 뜨기 전 흰 화면이 보이지 않도록 정적 HTML로 로고를 먼저 그려둔다.
            각 앱(ElevatorFieldApp/AdminApp)이 마운트되는 즉시 이 엘리먼트를 제거해
            같은 로고를 보여주는 BrandSplash(ui.jsx)로 깜빡임 없이 넘어간다. */}
        <div id="app-splash" className="fixed inset-0 z-[999] bg-blue-950 flex items-center justify-center">
          <img src="/icon-512.png" alt="구일엘리베이터" width={96} height={96} className="rounded-2xl shadow-lg" />
        </div>
        {children}
      </body>
    </html>
  );
}
