import { useState } from "react";
import { PrimaryButton, Field, inputCls } from "@/app/components/ui";


/* ------------------------------------------------------------------ */
/* LOGIN                                                                */
/* ------------------------------------------------------------------ */

export function LoginScreen({ onLogin, error, submitting }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="h-screen w-screen bg-slate-200 flex items-center justify-center overflow-hidden">
      <div
        className="bg-slate-50 flex flex-col shadow-2xl border-4 border-slate-900 rounded-[2.5rem] px-8"
        style={{ width: "375px", height: "min(812px, 100vh - 24px)", maxHeight: "100vh" }}
      >
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
            계정이 없으신가요? 관리자에게 계정 발급을 요청하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
