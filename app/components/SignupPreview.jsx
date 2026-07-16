"use client";

// 회사 가입 화면 — 확정 설계(2026-07-16)의 미리보기.
// 3겹 검증: ① 사업자번호(국세청) ② 사업자 메일 인증 ③ 공단 API 키(결정적 증명).
// 실제 가입 처리는 Phase 2(로그인·RLS·테넌트)에서 연결한다 — 지금 각 검증은 시뮬레이션.
import { useState } from "react";
import { Building2, Mail, KeyRound, UserRound, Check } from "lucide-react";

const inputCls = "w-full border border-slate-300 rounded-xl px-3.5 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-bold text-slate-500 mb-1.5";
const btnCls = "w-full bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl text-sm";

const STEPS = [
  { icon: Building2, label: "사업자 확인" },
  { icon: Mail, label: "메일 인증" },
  { icon: KeyRound, label: "공단 연동" },
  { icon: UserRound, label: "관리자 계정" },
];

function bizNoFormat(v) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export default function SignupPreview() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    bizNo: "", company: "", ceo: "",
    email: "", otp: "", otpSent: false,
    govKey: "", govVerified: false, matched: null,
    name: "", phone: "", password: "",
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="min-h-dvh bg-slate-100 flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-xl font-extrabold text-blue-950">승강기 현장관리 — 회사 가입</h1>
          <p className="text-xs text-slate-400 mt-1">
            유지관리업체 전용 · <span className="text-amber-600 font-bold">미리보기 (실제 가입은 준비 중)</span>
          </p>
        </div>

        {/* 단계 표시 */}
        <div className="flex items-center justify-between mb-6 px-2">
          {STEPS.map(({ icon: Icon, label }, i) => (
            <div key={label} className="flex flex-col items-center gap-1 flex-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                i < step ? "bg-emerald-500 text-white" : i === step ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-400"
              }`}>
                {i < step ? <Check size={16} /> : <Icon size={16} />}
              </div>
              <span className={`text-[10px] font-bold ${i === step ? "text-blue-700" : "text-slate-400"}`}>{label}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          {step === 0 && (
            <>
              <div>
                <label className={labelCls}>사업자등록번호</label>
                <input className={inputCls} inputMode="numeric" placeholder="000-00-00000"
                  value={form.bizNo} onChange={(e) => set({ bizNo: bizNoFormat(e.target.value) })} />
                <p className="text-[10px] text-slate-400 mt-1">국세청에 실존·영업 여부를 자동 확인합니다</p>
              </div>
              <div>
                <label className={labelCls}>회사명</label>
                <input className={inputCls} placeholder="예: 구일엘리베이터(주)" value={form.company} onChange={(e) => set({ company: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>대표자명</label>
                <input className={inputCls} value={form.ceo} onChange={(e) => set({ ceo: e.target.value })} />
              </div>
              <button className={btnCls} disabled={form.bizNo.length < 12 || !form.company.trim()} onClick={() => setStep(1)}>
                사업자 확인 (국세청)
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <div className="bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl px-3 py-2.5 flex items-center gap-1.5">
                <Check size={14} /> {form.bizNo} · 계속사업자 확인됨 <span className="font-normal text-emerald-600">(미리보기)</span>
              </div>
              <div>
                <label className={labelCls}>사업자 이메일</label>
                <input className={inputCls} type="email" placeholder="office@company.co.kr" value={form.email} onChange={(e) => set({ email: e.target.value })} />
                <p className="text-[10px] text-slate-400 mt-1">인증번호가 발송됩니다 · 계정 복구에도 사용돼요</p>
              </div>
              {!form.otpSent ? (
                <button className={btnCls} disabled={!form.email.includes("@")} onClick={() => set({ otpSent: true })}>
                  인증번호 발송
                </button>
              ) : (
                <>
                  <div>
                    <label className={labelCls}>인증번호 6자리</label>
                    <input className={`${inputCls} tracking-[0.4em] text-center font-bold`} inputMode="numeric" maxLength={6}
                      value={form.otp} onChange={(e) => set({ otp: e.target.value.replace(/\D/g, "") })} />
                  </div>
                  <button className={btnCls} disabled={form.otp.length !== 6} onClick={() => setStep(2)}>
                    메일 인증 완료
                  </button>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className={labelCls}>국가승강기정보센터 API 인증키</label>
                <input className={inputCls} placeholder="공공데이터포털에서 발급받은 인증키" value={form.govKey} onChange={(e) => set({ govKey: e.target.value })} />
                <p className="text-[10px] text-slate-400 mt-1">
                  이 키는 귀사만 발급받을 수 있어 <b>업체 증명</b>이 됩니다 · 검사정보 실시간 연동에 사용
                </p>
              </div>

              <details className="bg-slate-50 rounded-xl px-4 py-3 text-xs text-slate-600">
                <summary className="font-bold cursor-pointer text-slate-700">인증키가 없어요 — 발급 방법 보기 (무료 · 약 5분)</summary>
                <ol className="mt-2 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li><a href="https://www.data.go.kr" target="_blank" rel="noreferrer" className="text-blue-600 font-bold underline">공공데이터포털(data.go.kr)</a> 회원가입 후 로그인</li>
                  <li><a href="https://www.data.go.kr/data/15038198/openapi.do" target="_blank" rel="noreferrer" className="text-blue-600 font-bold underline">&quot;한국승강기안전공단 건물별 승강기 정보&quot;</a> 페이지에서 <b>활용신청</b> (자동 승인)</li>
                  <li>마이페이지 → 개인 API 인증키 복사 → 위 칸에 붙여넣기</li>
                </ol>
                <p className="mt-2 text-[10px] text-slate-400">* 같은 키로 검사이력 API도 함께 신청해두면 좋습니다. 발급이 어려우면 아래 &quot;수동으로 등록&quot;을 선택하세요 — 가입 후 언제든 추가할 수 있어요.</p>
              </details>
              {!form.govVerified ? (
                <button className={btnCls} disabled={form.govKey.length < 20} onClick={() => set({ govVerified: true, matched: 876 })}>
                  키 검증 + 담당 승강기 조회
                </button>
              ) : (
                <>
                  <div className="bg-blue-50 rounded-xl px-4 py-3">
                    <p className="text-sm font-bold text-blue-800 flex items-center gap-1.5">
                      <Check size={15} /> 키 유효 · &quot;{form.company || "귀사"}&quot; 담당 승강기 {form.matched}대 확인
                    </p>
                    <p className="text-[10px] text-blue-500 mt-1">가입 완료 후 현장·호기로 자동 등록할 수 있습니다 (미리보기 수치)</p>
                  </div>
                  <button className={btnCls} onClick={() => setStep(3)}>다음</button>
                </>
              )}
              {!form.govVerified && (
                <button
                  className="w-full border border-slate-200 text-slate-600 font-bold py-3 rounded-xl text-sm"
                  onClick={() => { set({ govVerified: false, matched: null }); setStep(3); }}
                >
                  키 없이 수동으로 등록할게요
                </button>
              )}
              <p className="text-[10px] text-slate-400 text-center -mt-1">
                수동 선택 시: 현장·승강기를 공단 엑셀 업로드나 직접 입력으로 등록합니다 (키는 설정에서 언제든 추가)
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <label className={labelCls}>관리자 이름</label>
                <input className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>휴대폰 번호 <span className="font-normal text-slate-400">(로그인 아이디)</span></label>
                <input className={inputCls} inputMode="numeric" placeholder="010-0000-0000" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>비밀번호</label>
                <input className={inputCls} type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                가입하면 서비스 약관(자체점검 결과의 공단 대리 제출 포함)과 개인정보처리방침에 동의하는 것으로 간주됩니다.
                기사 계정은 가입 후 관리자 콘솔의 인사관리에서 휴대폰 번호로 발급합니다.
              </p>
              <button className={btnCls} disabled={!form.name.trim() || form.phone.replace(/\D/g, "").length < 10 || form.password.length < 6}
                onClick={() => setStep(4)}>
                가입 완료
              </button>
            </>
          )}

          {step === 4 && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-4"><Check size={28} /></div>
              <p className="text-lg font-extrabold text-slate-800">{form.company || "회사"} 개설 완료</p>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                미리보기 화면입니다 — 실제 가입은 로그인·보안(Phase 2) 오픈과 함께 활성화됩니다.<br />
                다음 단계: 담당 승강기 {form.matched ?? "-"}대 자동 등록 → 기사 계정 발급
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-4">
          이미 계정이 있나요? <a href="/?auth=1" className="text-blue-600 font-bold">로그인</a>
        </p>
      </div>
    </div>
  );
}
