import { useState } from "react";
import { PrimaryButton, Field, inputCls } from "@/app/components/ui";


/* ------------------------------------------------------------------ */
/* LOGIN                                                                */
/* ------------------------------------------------------------------ */

export function LoginScreen({ onLogin, error, submitting, demo }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  return (
    // PC에서도 접속하므로 반응형 — 모바일은 꽉 차게, PC는 가운데 카드로 보이게.
    <div className="min-h-dvh w-full bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm sm:bg-white sm:border sm:border-slate-200 sm:rounded-2xl sm:shadow-sm sm:p-8">
        <h1 className="text-xl font-extrabold text-blue-950 mb-1 text-center">구일엘리베이터(주)</h1>
        <p className="text-xs text-slate-400 mb-8 text-center">현장관리 시스템 로그인</p>

        <Field label="아이디">
          <input
            type="text"
            className={inputCls}
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="아이디"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
          />
        </Field>
        <Field label="비밀번호">
          <input
            type="password"
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && onLogin(loginId, password)}
          />
        </Field>
        {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
        <PrimaryButton onClick={() => onLogin(loginId, password)} disabled={submitting || !loginId || !password}>
          {submitting ? "로그인 중..." : "로그인"}
        </PrimaryButton>
        {demo && (
          <p className="text-[11px] text-amber-500 text-center mt-3">
            미리보기 — 아무 값이나 입력해도 로그인됩니다
          </p>
        )}
      </div>
    </div>
  );
}
