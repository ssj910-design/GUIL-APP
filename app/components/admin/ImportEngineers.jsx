"use client";

// 인사관리 엑셀 일괄 등록 — 공단 회원 목록(아이디·회원명·회원구분·휴대폰·연락처·가입상태·가입일·승인일·교육수료번호).
// 엑셀 파싱은 현장 등록과 같은 방식을 재사용한다 (ImportSites.parseXlsx).
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { parseXlsx } from "@/app/components/admin/ImportSites";
import { Modal } from "@/app/components/admin/adminShared";

// 공단 엑셀은 날짜를 2026-01-02 / 2026.01.02 / 20260102 중 아무 형태로나 준다.
const toDate = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
};

const STATUSES = ["승인", "미승인", "대기", "탈퇴", "정지", "반려"];
const isMobile = (v) => /^01[016789][-]?\d{3,4}[-]?\d{4}$/.test(v);
const isTel = (v) => /^0\d{1,2}[-]?\d{3,4}[-]?\d{4}$/.test(v);
const isDateish = (v) => /^\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(v);

/**
 * ⚠️ 공단 회원목록 엑셀은 연락처가 비면 그 뒤 값들이 한 칸씩 당겨져 저장된다.
 * (예: 간기연 행은 '승인'이 연락처(E) 자리에 들어있음)
 * 그래서 열 위치가 아니라 값의 생김새로 항목을 판별한다 — 앞 3개(아이디·회원명·회원구분)만 위치 고정.
 */
function parseRow(r) {
  const rest = r.slice(3).map((v) => String(v ?? "").trim()).filter(Boolean);
  const out = { phone: null, tel: null, join_status: null, joined_at: null, approved_at: null, edu_cert_no: null };
  const dates = [];
  for (const v of rest) {
    if (!out.phone && isMobile(v)) out.phone = v;
    else if (!out.tel && isTel(v)) out.tel = v;
    else if (!out.join_status && STATUSES.includes(v)) out.join_status = v;
    else if (isDateish(v)) dates.push(v);
    else if (!out.edu_cert_no && /[A-Za-z0-9]-/.test(v)) out.edu_cert_no = v;
  }
  out.joined_at = toDate(dates[0]);
  out.approved_at = toDate(dates[1]);
  return out;
}

function toPlan(rows, existing) {
  const header = (rows[0] ?? []).map((h) => (h ?? "").trim());
  if (!header.includes("회원명")) throw new Error("회원 목록 양식이 아닙니다 (회원명 열 없음)");

  const add = [], update = [];
  const seen = new Set();
  let bad = 0;
  for (const r of rows.slice(1)) {
    const name = (r[1] ?? "").trim();
    if (!name || seen.has(name)) { bad++; continue; } // 이름 없음 또는 파일 내부 중복
    seen.add(name);
    const memberType = (r[2] ?? "").trim() || null;
    const fields = {
      minwon_id: (r[0] ?? "").trim() || null, // 아이디 = 공단 점검자 ID(SELCHK_USID)
      member_type: memberType,
      ...parseRow(r),
    };
    const found = existing.find((p) => p.name === name);
    // 회원구분 '관리자'는 콘솔 권한과 직결되므로 신규 등록 때만 반영하고, 기존 사람의 역할은 건드리지 않는다.
    if (found) update.push({ id: found.id, name, fields });
    else add.push({ name, role: memberType === "관리자" ? "admin" : "engineer", fields });
  }
  return { add, update, bad };
}

export default function ImportEngineers({ data, setData, onClose }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      setPlan(toPlan(await parseXlsx(file), data.profiles));
    } catch (err) {
      alert("엑셀을 읽지 못했습니다: " + err.message);
    }
    setBusy(false);
  }

  async function run() {
    setBusy(true);
    // 순번(당직 배정 순서)은 일부러 비워둔다 — 근무표 순번은 전 직원이 아니라 당직 대상자만 받는다.
    const insertRows = plan.add.map((a) => ({ name: a.name, role: a.role, ...a.fields }));
    if (insertRows.length) {
      const { error } = await supabase.from("profiles").insert(insertRows);
      if (error) { alert("등록 실패: " + error.message); setBusy(false); return; }
    }
    for (const u of plan.update) {
      await supabase.from("profiles").update(u.fields).eq("id", u.id);
    }
    const { data: fresh } = await supabase.from("profiles")
      .select("*")
      .order("name");
    setData((prev) => ({ ...prev, profiles: fresh ?? prev.profiles }));
    setDone({ added: insertRows.length, updated: plan.update.length });
    setBusy(false);
  }

  return (
    <Modal title="인사 엑셀 일괄 등록" onClose={onClose}>
      {done ? (
        <div className="text-center py-8">
          <p className="text-lg font-extrabold text-emerald-600 mb-1">등록 완료</p>
          <p className="text-sm text-slate-600">신규 {done.added}명 · 정보 갱신 {done.updated}명</p>
          <button onClick={onClose} className="mt-5 text-sm font-bold text-white bg-blue-700 rounded-xl px-5 py-2.5">닫기</button>
        </div>
      ) : !plan ? (
        <div className="py-4">
          <p className="text-sm text-slate-600 mb-3">
            공단 회원 목록 엑셀(.xlsx)을 선택하세요. 열 이름으로 찾으므로 순서는 달라도 됩니다.
            <br />
            <span className="text-xs text-slate-400">
              아이디 · 회원명 · 회원구분 · 휴대폰 · 연락처 · 가입상태 · 가입일 · 승인일 · 교육수료번호
            </span>
          </p>
          <input type="file" accept=".xlsx" onChange={pick} disabled={busy} className="text-sm" />
          {busy && <p className="text-xs text-slate-400 mt-2">파일 분석 중...</p>}
        </div>
      ) : (
        <div className="py-2">
          <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-1 mb-4">
            <p><b>신규 {plan.add.length}명</b>을 등록하고 <b>기존 {plan.update.length}명</b>의 정보를 갱신합니다.</p>
            <p className="text-slate-500 text-xs">
              이름이 같으면 같은 사람으로 보고 덮어씁니다(기존 사람의 역할·순번은 유지).
              당직 순번은 비워두니 등록 후 표에서 채워주세요.
            </p>
            {plan.bad > 0 && <p className="text-slate-500 text-xs">회원명이 없거나 중복인 {plan.bad}행은 무시합니다.</p>}
          </div>
          <ul className="max-h-48 overflow-y-auto text-xs text-slate-500 border border-slate-100 rounded-lg p-3 mb-4">
            {plan.add.map((a) => <li key={a.name}>+ {a.name} <span className="text-slate-400">{a.fields.member_type ?? ""}</span></li>)}
            {plan.update.map((u) => <li key={u.id} className="text-slate-400">↻ {u.name} (갱신)</li>)}
          </ul>
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="text-sm font-bold text-slate-500 px-4 py-2.5">취소</button>
            <button onClick={run} disabled={busy || (!plan.add.length && !plan.update.length)}
              className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-xl px-5 py-2.5">
              {busy ? "등록 중..." : "등록"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
