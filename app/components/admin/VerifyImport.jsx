"use client";

// 엑셀 검증 업로드 — "정리 안 된 내부 관리 엑셀"을 DB에 넣기 전에 검사하는 프로그램.
// (현장 일괄등록 ImportSites 옆의 별도 도구 — 여기서는 DB에 아무것도 쓰지 않는다)
//
// 흐름: ① 내부 엑셀 업로드(필수) + 대조 엑셀 업로드(선택, 센터 다운로드본이나 일괄등록 양식)
//      ② 자동 검증 — 행마다 문제를 빨강(막아야 함)/노랑(확인 필요)으로 표시
//      ③ 한 건씩 클릭해 원본 vs 해석값을 보고 "검토 완료" 체크
//      ④ 정리본 엑셀 다운로드 → 손보고 나서 일괄등록으로 진행 (DB 반영은 다음 단계)
//
// 검증 규칙은 실제 구일 관리 엑셀(승강기정보1.xlsx, 779행)을 분석해 만들었다:
// 병합셀 잔재(현장명 빈 행), 한 셀에 전화 여러 개, 연락처 셀의 비밀번호·열쇠 메모,
// 사업자번호 열의 주민번호, 서술형 계약일("16년…/20년… 재계약"), 연도 없는 검사만료("3. 28") 등.
import { useMemo, useState } from "react";
import { Upload, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "@/app/components/admin/adminShared";

const PHONE_RE = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const nameKey = (s) => norm(s).replace(/\(.*?\)/g, "").replace(/\s/g, ""); // 괄호 별칭·공백 무시하고 매칭

// "12년9월1일" / "2016.10.26" / "20111213" → ISO 날짜. 못 읽으면 null.
function parseKoreanDate(v) {
  const s = norm(v);
  if (!s) return null;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
  let m = /(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/.exec(s);
  if (m) {
    const y = m[1].length === 2 ? `20${m[1]}` : m[1];
    return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  }
  m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return null;
}

const toMoney = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && String(v).trim() !== "" ? n : null;
};

// 헤더 행에서 열 위치를 찾는다 — 열 순서가 바뀌어도 동작하게 이름으로 찾는다.
function headerMap(header) {
  const find = (...names) => header.findIndex((h) => names.some((n) => norm(h).replace(/\s/g, "").includes(n)));
  return {
    name: find("현장", "건물명"), owner: find("대표"), contractType: find("계약종류", "계약구분"),
    engineer: find("점검자", "담당기사"), unitCount: find("대수"), address: find("주소", "소재지"),
    contractDate: find("계약일"), model: find("기종", "모델"), kind: find("종류"),
    inspExpire: find("검사만료"), installYear: find("설치년도", "설치일자"), bizNo: find("사업자번호"),
    cost: find("금액", "보수료"), billMethod: find("청구방식"), overdue: find("장기미납"),
    payer: find("입금자"), email: find("이메일"), balance: find("미수잔액"),
    contact: find("연락처", "전화번호"), note: find("비고"),
  };
}

// 한 행을 검사해 { parsed, issues } 를 만든다. issues: {level:'red'|'yellow', msg}
function validateRow(raw, col, monthCols) {
  const issues = [];
  const get = (k) => (col[k] >= 0 ? norm(raw[col[k]]) : "");
  const parsed = {
    name: get("name"), owner: get("owner"), contractType: get("contractType"),
    engineer: get("engineer"), unitCount: get("unitCount"), address: get("address"),
    model: get("model"), billMethod: get("billMethod"), payer: get("payer"),
    email: get("email"), note: get("note"),
  };

  // 주소
  if (parsed.name && !parsed.address) issues.push({ level: "yellow", msg: "주소 없음" });

  // 연락처 — 자유 메모 셀: 전화 추출 + 보안 메모 감지
  const contact = get("contact");
  const phones = contact.match(PHONE_RE) ?? [];
  parsed.phones = phones;
  parsed.contactMemo = contact;
  if (phones.length >= 2) issues.push({ level: "yellow", msg: `전화 ${phones.length}개가 한 셀에 — 대표/담당 구분 필요` });
  if (/비밀번호|비번|열쇠|현관|공동현관/.test(contact)) issues.push({ level: "yellow", msg: "연락처 셀에 비밀번호·열쇠 메모 — 앱에 그대로 넣으면 안 됨(별도 보관)" });

  // 사업자번호 — 주민번호가 섞여 있는 열
  const biz = get("bizNo");
  parsed.bizNo = biz;
  if (/^\d{6}-\d{7}$/.test(biz)) issues.push({ level: "red", msg: "주민등록번호로 보임 — 개인정보, DB에 넣으면 안 됨(마스킹·삭제 필요)" });
  else if (biz && !/^\d{3}-\d{2}-\d{5}$/.test(biz)) issues.push({ level: "yellow", msg: `사업자번호 형식 이상: "${biz}"` });

  // 계약일 — 서술형이 많음
  const cd = get("contractDate");
  parsed.contractDate = parseKoreanDate(cd);
  if (cd && /\/|재계약|변경/.test(cd)) issues.push({ level: "yellow", msg: "계약일이 이력 서술형 — 첫 날짜만 해석, 이력은 비고로" });
  else if (cd && !parsed.contractDate) issues.push({ level: "yellow", msg: `계약일 해석 불가: "${cd.slice(0, 30)}"` });

  // 검사만료 "3. 28" — 연도 없음 (key: 파일 전체 공통이면 파일 공지로 승격)
  const ie = get("inspExpire");
  parsed.inspExpire = ie;
  if (ie && !/\d{4}/.test(ie)) issues.push({ level: "yellow", key: "insp-no-year", msg: `검사만료에 연도 없음("${ie}") — 센터 데이터로 보완 필요` });

  // 설치년도 YYYYMMDD
  const iy = get("installYear");
  parsed.installDate = parseKoreanDate(iy);
  if (iy && !parsed.installDate) issues.push({ level: "yellow", msg: `설치년도 해석 불가: "${iy}"` });

  // 승강기 종류 다중값 ("전망용,   장애/침대용")
  const kind = get("kind");
  parsed.kinds = kind ? kind.split(/[,·]/).map(norm).filter(Boolean) : [];

  // 금액·미수잔액
  const cost = get("cost");
  parsed.cost = toMoney(cost);
  if (cost && parsed.cost == null) issues.push({ level: "yellow", msg: `보수료가 숫자가 아님: "${cost}"` });
  const bal = get("balance");
  parsed.balance = toMoney(bal);
  if (bal && parsed.balance == null) issues.push({ level: "yellow", msg: `미수잔액이 숫자가 아님: "${bal}"` });

  // 월별 수금 열 — 값이 있는 달 수만 집계 (상세 검증은 반영 단계에서)
  parsed.paidMonths = monthCols.filter((c) => norm(raw[c.idx])).length;

  // 이메일
  if (parsed.email && !/^\S+@\S+\.\S+$/.test(parsed.email)) issues.push({ level: "yellow", msg: `이메일 형식 이상: "${parsed.email}"` });

  return { parsed, issues };
}

export default function VerifyImport({ data, onClose }) {
  const [rows, setRows] = useState(null);        // [{idx, raw, parsed, issues, contIdx}]
  const [refNames, setRefNames] = useState(null); // 대조 파일의 현장명 키 집합
  const [refOnly, setRefOnly] = useState([]);     // 대조본에만 있는 현장
  const [filter, setFilter] = useState("problem");
  const [fileNotices, setFileNotices] = useState([]); // 파일 전체 공통 형식 문제 (행 목록에서 승격)
  const [openIdx, setOpenIdx] = useState(null);
  const [reviewed, setReviewed] = useState({});   // idx → true
  const [busy, setBusy] = useState(false);

  async function readSheet(file) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer());
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  }

  // ① 내부(정리 안 된) 엑셀
  async function pickInternal(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const all = await readSheet(file);
      const header = all[0] ?? [];
      const col = headerMap(header);
      if (col.name < 0) throw new Error("헤더에서 '현장(건물명)' 열을 못 찾았습니다 — 1행이 제목 행인지 확인");
      // 월별 수금 열: "25년7월" ~ "8월" 같은 열들
      const monthCols = header.map((h, idx) => ({ h: norm(h), idx })).filter((c) => /^(\d{2}년)?\d{1,2}월$/.test(c.h.replace(/\s/g, "")));
      const out = [];
      let lastNamed = -1;
      all.slice(1).forEach((raw, i) => {
        if (!raw.some((c) => norm(c))) return; // 완전 빈 행 스킵
        const { parsed, issues } = validateRow(raw, col, monthCols);
        const idx = out.length;
        // 병합셀 잔재: 현장명이 비면 직전 현장의 연속 행으로 해석
        let contIdx = null;
        if (!parsed.name) {
          if (lastNamed >= 0) {
            contIdx = lastNamed;
            issues.unshift({ level: "yellow", msg: `현장명 없음(병합 잔재) — "${out[lastNamed].parsed.name}"의 연속 행으로 해석` });
          } else {
            issues.unshift({ level: "red", msg: "현장명 없음 — 어느 현장인지 알 수 없음" });
          }
        } else lastNamed = idx;
        out.push({ idx, excelRow: i + 2, raw, parsed, issues, contIdx });
      });
      // 같은 종류(key) 문제가 전체의 40%를 넘으면 "행마다"가 아니라 "파일 전체의 형식 문제" —
      // 행 목록에서 빼고 파일 공지 하나로 승격한다 (안 그러면 노랑 수백 개가 소음이 됨).
      const keyCount = {};
      out.forEach((r) => r.issues.forEach((x) => { if (x.key) keyCount[x.key] = (keyCount[x.key] ?? 0) + 1; }));
      const fileLevel = Object.entries(keyCount).filter(([, n]) => n > out.length * 0.4).map(([k]) => k);
      const notices = [];
      if (fileLevel.length) {
        out.forEach((r) => { r.issues = r.issues.filter((x) => !fileLevel.includes(x.key)); });
        fileLevel.forEach((k) => {
          const n = keyCount[k];
          if (k === "insp-no-year") notices.push(`검사만료 열이 연도 없는 형식(예: "3. 28") — ${n}행 전체 공통. 센터 데이터로 보완 필요`);
        });
      }
      setFileNotices(notices);
      setRows(out);
      setReviewed({});
      setOpenIdx(null);
    } catch (err) {
      alert("파일을 읽지 못했습니다: " + err.message);
    }
    setBusy(false);
  }

  // ② 대조 엑셀(선택) — 현장명 존재 여부만 상호 대조 (센터본·일괄등록 양식 모두 허용)
  async function pickReference(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const all = await readSheet(file);
      const header = all[0] ?? [];
      const nameCol = header.findIndex((h) => /현장|건물명|건물|빌딩명/.test(norm(h)));
      if (nameCol < 0) throw new Error("대조 파일 헤더에서 현장/건물명 열을 못 찾았습니다");
      const keys = new Set(all.slice(1).map((r) => nameKey(r[nameCol])).filter(Boolean));
      setRefNames(keys);
      if (rows) {
        const mine = new Set(rows.filter((r) => r.parsed.name).map((r) => nameKey(r.parsed.name)));
        setRefOnly([...new Set(all.slice(1).map((r) => norm(r[nameCol])).filter((n) => n && !mine.has(nameKey(n))))]);
      }
    } catch (err) {
      alert("대조 파일을 읽지 못했습니다: " + err.message);
    }
    setBusy(false);
  }

  // 대조 결과를 이슈에 합친 최종 행 목록
  const finalRows = useMemo(() => {
    if (!rows) return null;
    return rows.map((r) => {
      const issues = [...r.issues];
      if (refNames && r.parsed.name && !refNames.has(nameKey(r.parsed.name))) {
        issues.push({ level: "yellow", msg: "대조 파일에 없는 현장 — 이름 확인 또는 해지 현장인지 확인" });
      }
      const level = issues.some((x) => x.level === "red") ? "red" : issues.length ? "yellow" : "green";
      return { ...r, issues, level };
    });
  }, [rows, refNames]);

  const counts = useMemo(() => {
    if (!finalRows) return null;
    const c = { red: 0, yellow: 0, green: 0, reviewed: 0 };
    finalRows.forEach((r) => { c[r.level]++; if (reviewed[r.idx]) c.reviewed++; });
    return c;
  }, [finalRows, reviewed]);

  const visible = (finalRows ?? []).filter((r) =>
    filter === "all" ? true
    : filter === "problem" ? r.level !== "green" && !reviewed[r.idx]
    : filter === "reviewed" ? reviewed[r.idx]
    : r.level === filter
  );

  // ④ 정리본 다운로드 — 해석값 + 남은 문제를 열로 붙여서
  async function downloadClean() {
    const XLSX = await import("xlsx");
    const header = ["원본행", "상태", "검토", "현장명", "연속행(소속)", "주소", "점검자", "대수", "계약종류", "계약일(해석)", "보수료", "미수잔액", "수금기록달수", "전화(추출)", "이메일", "사업자번호", "승강기종류", "설치일(해석)", "남은 문제"];
    const body = finalRows.map((r) => [
      r.excelRow, r.level === "red" ? "빨강" : r.level === "yellow" ? "노랑" : "통과",
      reviewed[r.idx] ? "완료" : "",
      r.parsed.name, r.contIdx != null ? finalRows[r.contIdx].parsed.name : "",
      r.parsed.address, r.parsed.engineer, r.parsed.unitCount, r.parsed.contractType,
      r.parsed.contractDate ?? "", r.parsed.cost ?? "", r.parsed.balance ?? "", r.parsed.paidMonths,
      r.parsed.phones.join(", "), r.parsed.email, r.parsed.bizNo, r.parsed.kinds.join(", "),
      r.parsed.installDate ?? "", r.issues.map((x) => x.msg).join(" / "),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "검증결과");
    XLSX.writeFile(wb, "검증결과_정리본.xlsx");
  }

  const open = openIdx != null ? finalRows?.[openIdx] : null;
  const LV = { red: "bg-red-50 text-red-600 border-red-200", yellow: "bg-amber-50 text-amber-700 border-amber-200", green: "bg-emerald-50 text-emerald-700 border-emerald-200" };

  return (
    <Modal title="엑셀 검증 업로드 — 정리 안 된 관리 엑셀 검사" onClose={onClose} wide="xl">
      <div className="p-5 overflow-y-auto space-y-4">
        {/* 업로드 2개 */}
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 cursor-pointer">
            <Upload size={15} /> ① 내부 관리 엑셀 {rows ? `(${rows.length}행 읽음)` : "(필수)"}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={pickInternal} disabled={busy} />
          </label>
          <label className={`flex items-center gap-2 text-sm font-bold rounded-xl px-4 py-2.5 cursor-pointer border ${refNames ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-300 text-slate-600"}`}>
            <Upload size={15} /> ② 대조 엑셀 {refNames ? `(${refNames.size}곳)` : "(선택 — 센터본·등록양식)"}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={pickReference} disabled={busy || !rows} />
          </label>
          {finalRows && (
            <button onClick={downloadClean} className="flex items-center gap-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl px-4 py-2.5 ml-auto">
              <Download size={15} /> 정리본 다운로드
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400">여기서는 DB에 아무것도 저장하지 않습니다 — 검증·정리 후 "엑셀로 현장 일괄 등록"으로 진행하세요.</p>

        {/* 요약 + 필터 */}
        {counts && (
          <div className="flex flex-wrap gap-2">
            {[["problem", `남은 문제 ${counts.red + counts.yellow - counts.reviewed >= 0 ? "" : ""}`], ["red", `빨강 ${counts.red}`], ["yellow", `노랑 ${counts.yellow}`], ["green", `통과 ${counts.green}`], ["reviewed", `검토완료 ${counts.reviewed}`], ["all", `전체 ${finalRows.length}`]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`text-xs font-bold rounded-full px-3 py-1.5 border ${filter === k ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-600 border-slate-300"}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 파일 전체 공통 형식 문제 */}
        {fileNotices.map((n, i) => (
          <div key={i} className="text-xs bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-700"><b>파일 전체:</b> {n}</div>
        ))}

        {/* 대조본에만 있는 현장 */}
        {refOnly.length > 0 && (
          <div className="text-xs bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-700">
            <b>대조 파일에만 있는 현장 {refOnly.length}곳</b> (내부 엑셀에 누락 가능): {refOnly.slice(0, 10).join(", ")}{refOnly.length > 10 ? ` 외 ${refOnly.length - 10}곳` : ""}
          </div>
        )}

        {/* 목록 */}
        {visible.length > 0 && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
            {visible.map((r) => (
              <button key={r.idx} onClick={() => setOpenIdx(r.idx)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3">
                <span className={`shrink-0 text-[11px] font-bold rounded-full px-2 py-0.5 border ${LV[r.level]}`}>{r.level === "red" ? "빨강" : r.level === "yellow" ? "노랑" : "통과"}</span>
                <span className="text-sm font-bold text-slate-800 truncate">{r.parsed.name || `(${finalRows[r.contIdx]?.parsed.name ?? "?"} 연속)`}</span>
                <span className="text-xs text-slate-400 truncate">{r.parsed.address}</span>
                <span className="ml-auto shrink-0 text-xs text-slate-400">{r.issues.length ? `문제 ${r.issues.length}` : ""}{reviewed[r.idx] ? " · 검토됨" : ""}</span>
              </button>
            ))}
          </div>
        )}
        {finalRows && visible.length === 0 && <p className="text-sm text-slate-400 text-center py-6">이 필터에 해당하는 행이 없습니다</p>}

        {/* 상세 — 원본 vs 해석 */}
        {open && (
          <div className="border-2 border-blue-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-slate-800">{open.parsed.name || "(현장명 없음)"} <span className="text-xs font-semibold text-slate-400">원본 {open.excelRow}행</span></p>
              <div className="flex gap-2">
                <button onClick={() => setReviewed((p) => ({ ...p, [open.idx]: !p[open.idx] }))}
                  className={`flex items-center gap-1 text-xs font-bold rounded-lg px-3 py-1.5 border ${reviewed[open.idx] ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300"}`}>
                  <CheckCircle2 size={13} /> {reviewed[open.idx] ? "검토 완료됨" : "검토 완료로 표시"}
                </button>
                <button onClick={() => setOpenIdx(null)} className="text-xs font-bold text-slate-400 px-2">닫기</button>
              </div>
            </div>
            {open.issues.length > 0 && (
              <ul className="space-y-1">
                {open.issues.map((x, i) => (
                  <li key={i} className={`text-xs font-semibold flex items-start gap-1.5 ${x.level === "red" ? "text-red-600" : "text-amber-700"}`}>
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {x.msg}
                  </li>
                ))}
              </ul>
            )}
            <table className="w-full text-xs">
              <tbody>
                {[
                  ["주소", open.parsed.address], ["점검자", open.parsed.engineer], ["대수", open.parsed.unitCount],
                  ["계약종류", open.parsed.contractType], ["계약일(해석)", open.parsed.contractDate ?? "—"],
                  ["보수료", open.parsed.cost != null ? open.parsed.cost.toLocaleString() + "원" : "—"],
                  ["미수잔액", open.parsed.balance != null ? open.parsed.balance.toLocaleString() + "원" : "—"],
                  ["수금 기록", `${open.parsed.paidMonths}개 달에 기록 있음`],
                  ["전화(추출)", open.parsed.phones.join(" / ") || "—"],
                  ["연락처 원본 메모", open.parsed.contactMemo || "—"],
                  ["이메일", open.parsed.email || "—"], ["사업자번호", open.parsed.bizNo || "—"],
                  ["승강기 종류", open.parsed.kinds.join(", ") || "—"], ["설치일(해석)", open.parsed.installDate ?? "—"],
                  ["비고", open.parsed.note || "—"],
                ].map(([k, v]) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-bold text-slate-500 whitespace-nowrap w-28">{k}</td>
                    <td className="py-1.5 text-slate-700 break-all">{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
