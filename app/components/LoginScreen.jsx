import { useState } from "react";
import { PrimaryButton, Field, inputCls } from "@/app/components/ui";


/* ------------------------------------------------------------------ */
/* LOGIN                                                                */
/* ------------------------------------------------------------------ */

export function LoginScreen({ onLogin, error, submitting, demo }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="h-dvh w-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col px-8 w-full max-w-sm h-full">
        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-xl font-extrabold text-blue-950 mb-1 text-center">구일엘리베이터(주)</h1>
          <p className="text-xs text-slate-400 mb-8 text-center">현장관리 시스템 로그인</p>

          <Field label="이메일">
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
              onKeyDown={(e) => e.key === "Enter" && onLogin(email, password)}
            />
          </Field>
          {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
          <PrimaryButton onClick={() => onLogin(email, password)} disabled={submitting || !email || !password}>
            {submitting ? "로그인 중..." : "로그인"}
          </PrimaryButton>
          <p className="text-[11px] text-slate-400 text-center mt-4">
            계정이 없으신가요? <a href="/signup" className="text-blue-600 font-bold">회사 가입</a>
          </p>
          {demo && (
            <p className="text-[11px] text-amber-500 text-center mt-2">
              미리보기 — 아무 값이나 입력해도 로그인됩니다
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
