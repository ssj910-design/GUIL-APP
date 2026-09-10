"use client";

// 안드로이드 APK 다운로드 페이지 — 플레이스토어 없이 사이드로드로 배포하는 방식(docs/APK-PLAN.md).
// releases/latest.json(lib/releases.js)을 읽어 최신 버전 정보와 다운로드 링크를 보여준다.
import { useEffect, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/company";
import { fetchLatestRelease } from "@/lib/releases";

export default function DownloadPage() {
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);

  // layout.js가 JS 뜨기 전 흰 화면 방지용으로 그려둔 정적 스플래시 — 이 페이지가 마운트되면
  // 지워야 한다(ElevatorFieldApp/AdminApp과 동일한 규칙, 안 지우면 이 화면이 영원히 안 보임).
  useEffect(() => { document.getElementById("app-splash")?.remove(); }, []);

  useEffect(() => {
    fetchLatestRelease().then((r) => { setRelease(r); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" className="w-16 h-16 rounded-2xl mx-auto mb-4" />
        <h1 className="text-lg font-extrabold text-slate-900 text-center mb-1">{BRAND.name} 현장관리 앱</h1>
        <p className="text-sm text-slate-500 text-center mb-8">안드로이드 설치 파일(APK)을 내려받으세요</p>

        {loading ? (
          <p className="text-xs text-slate-400 text-center py-6">불러오는 중...</p>
        ) : !release ? (
          <p className="text-xs text-red-500 text-center py-6">배포된 버전 정보를 찾을 수 없습니다. 관리자에게 문의해주세요.</p>
        ) : (
          <>
            <a
              href={release.url}
              className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white text-sm font-bold rounded-xl py-3.5 shadow-sm active:bg-blue-800"
            >
              <Download size={18} /> 다운로드 (v{release.versionName})
            </a>
            {release.releasedAt && <p className="text-[11px] text-slate-400 text-center mt-2">{release.releasedAt} 배포</p>}
          </>
        )}

        {release?.notes && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mt-4">
            <p className="text-xs font-bold text-slate-700 mb-2">이번 업데이트</p>
            <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{release.notes}</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-4 mt-4">
          <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-blue-600" /> 설치 안내
          </p>
          <ol className="text-xs text-slate-500 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>위 버튼으로 APK 파일을 내려받습니다.</li>
            <li>다운로드한 파일을 눌러 설치를 시작하면 "출처를 알 수 없는 앱" 경고가 뜰 수 있습니다 — 설정에서 이 앱의 설치 허용을 켜주세요.</li>
            <li>Play Protect가 "검사되지 않은 앱"이라고 경고해도, 저희가 만든 정식 앱이니 무시하고 설치를 진행하면 됩니다.</li>
            <li>이미 설치돼 있다면 그 위에 새로 설치하면 기존 데이터는 그대로 유지됩니다.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
