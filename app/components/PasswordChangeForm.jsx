import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// 비밀번호 변경 폼 — 마이페이지(설정)와 첫 로그인 강제변경 화면이 공용으로 쓴다.
// 규칙(DB change_password 함수와 동일): 6자 이상, 문자+숫자 조합 필수, 같은 글자·뻔한 것 금지.
export function PasswordChangeForm({ profileId, onDone, submitLabel = "비밀번호 변경" }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  async function submit() {
    setErr("");
    if (next !== confirm) { setErr("새 비밀번호가 서로 다릅니다"); return; }
    setSaving(true);
    // 규칙 검증·해시는 DB 함수에서 처리한다. 반환값 ''=성공, 그 외=실패 사유.
    const { data, error } = await supabase.rpc("change_password", { p_profile_id: profileId, p_current: current, p_new: next });
    setSaving(false);
    if (error) { setErr("변경 중 오류가 발생했습니다. 다시 시도해주세요."); return; }
    if (data) { setErr(data); return; } // 실패 사유 문자열
    setCurrent(""); setNext(""); setConfirm("");
    onDone?.();
  }

  return (
    <div className="space-y-2.5">
      <input type="password" className={inputCls} placeholder="현재 비밀번호" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      <input type="password" className={inputCls} placeholder="새 비밀번호 (문자+숫자 조합, 6자 이상)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <input type="password" className={inputCls} placeholder="새 비밀번호 확인" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
        onKeyDown={(e) => e.key === "Enter" && submit()} />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <button
        onClick={submit}
        disabled={saving || !current || !next || !confirm}
        className="w-full bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg"
      >
        {saving ? "변경 중..." : submitLabel}
      </button>
    </div>
  );
}
