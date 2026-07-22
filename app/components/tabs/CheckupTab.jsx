import { useState, useContext } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { useHolidays } from "@/app/hooks/useHolidays";
import { siteUnitList } from "@/lib/utils";
import { mapSelfCheck, mapSelfCheckItem, mapSelfCheckItemState } from "@/lib/mappers";
import { PrimaryButton, Sheet, Field, inputCls, MapLinkButtons } from "@/app/components/ui";
import { MultiPhotoUpload } from "@/app/components/formWidgets";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import SELF_CHECK_ITEM_CODES from "@/lib/data/selfCheckItemCodes.json";

/* ------------------------------------------------------------------ */
/* CHECKUP (정기점검) — self_checks(자체점검 출석부) 실데이터 연동             */
/* 일정 등록 = 이번 달 출석부 행의 planned_date.                            */
/* 자체점검 등록 = 승강기민원24 실제 웹 등록화면을 참고해 한 화면에서          */
/* 완료 처리(사내 기록) + 승강기민원24(RegistInspectionService) 제출까지      */
/* 한 번에 처리한다(실제 공단 화면도 등록=제출 단일 액션).                   */
/* 점검항목엔 1/3/6개월 주기가 있고(실제 리포트 5개월치로 실증), 3개월        */
/* 주기는 3·6·9·12월, 6개월 주기는 6·12월에 고정 대상이 된다(전사 공통       */
/* 캘린더 — 호기별 이력 추적 없이 달만 보고 계산).                          */
/* 처리 탭은 등록 결과(공단 제출 성공/실패·전송일시)만 보여주는 조회 화면.     */
/* ------------------------------------------------------------------ */

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
// 이번 달 점검항목 목록은 이미 isDueThisMonth로 걸러져 있어(점검주기가 3/6/9/12월 등으로
// 고정) 여기 뜨는 항목은 전부 이번 달 대상 — 그러니 "제외(D)"를 사람이 수동 선택할 일이 없다.
const RESULT_OPTIONS = [
  { v: "A", label: "양호" },
  { v: "B", label: "주의관찰" },
  { v: "C", label: "긴급수리" },
  { v: "E", label: "없음" },
];

function isDueThisMonth(item, ymStr) {
  if (item.cycle === 1) return true;
  const m = Number(ymStr.slice(5, 7));
  if (item.cycle === 3) return m % 3 === 0; // 3·6·9·12월
  if (item.cycle === 6) return m % 6 === 0; // 6·12월
  return false;
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CheckupTab({ selfChecks, setSelfChecks, siteManagers = [], profilesAll = [] }) {
  const sites = useContext(SitesContext);
  const units = useContext(UnitsContext);
  const { name: CURRENT_ENGINEER, selfId } = useContext(AuthContext);
  const [subTab, setSubTab] = useState("계획");
  const [showAll, setShowAll] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [query, setQuery] = useState("");

  const [scheduleTarget, setScheduleTarget] = useState(null); // 일정 등록 대상 현장
  const [scheduleDate, setScheduleDate] = useState(TODAY_STR);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [checkupTarget, setCheckupTarget] = useState(null); // 자체점검 등록 대상 현장
  const [checkupUnitId, setCheckupUnitId] = useState(null);
  const [checkupDate, setCheckupDate] = useState(TODAY_STR);
  const [checkupStartTime, setCheckupStartTime] = useState("09:00");
  const [checkupEndTime, setCheckupEndTime] = useState("09:30");
  const [checkupCnfirm, setCheckupCnfirm] = useState(""); // 관리주체명
  const [checkupCnfirmTel, setCheckupCnfirmTel] = useState(""); // 관리주체 전화번호
  const [checkupSubProfileId, setCheckupSubProfileId] = useState(""); // 부점검자
  const [checkupNotes, setCheckupNotes] = useState("");
  const [checkupPhotos, setCheckupPhotos] = useState([]); // [{ url }]
  const [itemExceptions, setItemExceptions] = useState({}); // { [itemCd]: { result, remark } } — 이번 달 대상 항목 중 기본값(A)과 다른 것만
  const [itemQuery, setItemQuery] = useState("");
  const [itemStates, setItemStates] = useState({}); // { [itemCd]: { applicable } } — 호기별 해당없음(E) 상태
  const [checkupAgree, setCheckupAgree] = useState(false);
  const [savingCheckup, setSavingCheckup] = useState(false);
  const [checkupResult, setCheckupResult] = useState(null);

  const [dayPopup, setDayPopup] = useState(null); // 클릭한 날짜(iso)

  const ym = TODAY_STR.slice(0, 7);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const selfProfile = profilesAll.find((p) => p.id === selfId);

  // 디폴트는 내 담당현장만, "모든 현장보기" 체크 시 전체 현장. 계획 탭은 현장명·주소로 추가 검색.
  const scopedSites = sites.filter((s) => showAll || s.assignedEngineer === CURRENT_ENGINEER);
  const visibleUnitIds = new Set(units.filter((u) => scopedSites.some((s) => s.id === u.siteId)).map((u) => u.id));
  const q = query.trim();
  const checksThisMonth = selfChecks.filter((c) => c.ym === ym && visibleUnitIds.has(c.unitId));

  // 월 1회 점검이라 이번 달에 이미 등록 완료한 현장은 계획 목록에서 기본적으로 숨긴다
  // (다음 달이 되면 ym이 바뀌어 자동으로 다시 나타남). 월 2회 이상 도는 현장도 있어서
  // "점검완료현장 보기" 체크로 다시 볼 수 있게 해둔다.
  function isSiteDoneThisMonth(s) {
    const siteUnits = siteUnitList(s, units).filter((u) => u.id);
    if (siteUnits.length === 0) return false;
    return siteUnits.every((u) => checksThisMonth.some((c) => c.unitId === u.id && c.status === "완료"));
  }
  const planSites = scopedSites
    .filter((s) => !q || s.name.includes(q) || (s.address ?? "").includes(q))
    .filter((s) => showCompleted || !isSiteDoneThisMonth(s));

  const plannedChecks = checksThisMonth.filter((c) => c.status === "예정");
  const doneChecks = checksThisMonth
    .filter((c) => c.status === "완료")
    .sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? ""));

  function locOfCheck(c) {
    const u = unitById.get(c.unitId);
    const s = u ? siteById.get(u.siteId) : null;
    return s ? `${s.name} · ${u.unitNo}` : "-";
  }

  function setItemResult(code, result) {
    setItemExceptions((prev) => {
      if (result === "A") {
        const next = { ...prev };
        delete next[code];
        return next;
      }
      return { ...prev, [code]: { result, remark: prev[code]?.remark ?? "" } };
    });
  }

  const dueItemCodes = SELF_CHECK_ITEM_CODES.filter((item) => {
    const st = itemStates[item.code];
    if (st?.applicable === false) return false;
    return isDueThisMonth(item, ym);
  });
  const filteredItemCodes = dueItemCodes.filter(
    (it) => !itemQuery.trim() || it.name.includes(itemQuery.trim()) || it.no.includes(itemQuery.trim())
  );

  // 달력: 오늘이 속한 달을 기준으로 그린다. (워크캘린더와 같은 룩 — 공휴일 포함)
  const today = new Date(`${TODAY_STR}T00:00:00`);
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = new Date(year, month, 1).getDay();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const isoOf = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const { days: HOLIDAY } = useHolidays(year);

  async function registerSchedule() {
    const targetUnits = siteUnitList(scheduleTarget, units).filter((u) => u.id);
    if (targetUnits.length === 0) { setScheduleTarget(null); return; }
    setSavingSchedule(true);
    const { error: genError } = await supabase.rpc("generate_self_checks", { p_ym: ym });
    if (genError) { alert("일정 등록 실패: " + genError.message); setSavingSchedule(false); return; }
    const unitIds = targetUnits.map((u) => u.id);
    const { error } = await supabase.from("self_checks").update({ planned_date: scheduleDate }).eq("ym", ym).in("unit_id", unitIds);
    if (error) { alert("일정 등록 실패: " + error.message); setSavingSchedule(false); return; }
    const { data: fresh } = await supabase.from("self_checks").select("*").eq("ym", ym).in("unit_id", unitIds);
    setSelfChecks((prev) => [...prev.filter((c) => !(c.ym === ym && unitIds.includes(c.unitId))), ...(fresh ?? []).map(mapSelfCheck)]);
    setSavingSchedule(false);
    setScheduleTarget(null);
  }

  // 이미 이번 달 행이 있으면(등록된 결과·사진·특이사항·점검항목 예외·공단 제출 결과) 불러와 폼에 채운다.
  async function loadCheckupForUnit(unitId, s) {
    setCheckupUnitId(unitId);
    setCheckupDate(TODAY_STR);
    setCheckupStartTime("09:00");
    setCheckupEndTime("09:30");
    setCheckupNotes("");
    setCheckupPhotos([]);
    setItemExceptions({});
    setItemQuery("");
    setCheckupSubProfileId("");
    setCheckupAgree(false);
    setCheckupResult(null);

    const manager = siteManagers.find((m) => m.siteId === s?.id && m.isPrimary) ?? siteManagers.find((m) => m.siteId === s?.id);
    setCheckupCnfirm(manager?.name ?? "");
    setCheckupCnfirmTel(manager?.phone ?? "");

    const { data: stateRows } = await supabase.from("self_check_item_states").select("*").eq("unit_id", unitId);
    const stateMap = {};
    (stateRows ?? []).map(mapSelfCheckItemState).forEach((st) => { stateMap[st.itemCd] = { applicable: st.applicable }; });
    setItemStates(stateMap);

    const existing = selfChecks.find((c) => c.unitId === unitId && c.ym === ym);
    if (!existing) return;
    if (existing.doneDate) setCheckupDate(existing.doneDate);
    setCheckupNotes(existing.notes ?? "");
    setCheckupPhotos((existing.photos ?? []).map((url) => ({ url })));
    if (existing.govResultCode) setCheckupResult({ resultCode: existing.govResultCode, resultMsg: existing.govResultMsg });
    const { data } = await supabase.from("self_check_items").select("*").eq("self_check_id", existing.id);
    const map = {};
    (data ?? []).map(mapSelfCheckItem).forEach((it) => { map[it.itemCd] = { result: it.result, remark: it.remark ?? "" }; });
    setItemExceptions(map);
  }

  function openCheckup(s) {
    const targetUnits = siteUnitList(s, units).filter((u) => u.id);
    if (targetUnits.length === 0) return;
    setCheckupTarget(s);
    loadCheckupForUnit(targetUnits[0].id, s);
  }

  // 사내 기록 저장 + 승강기민원24(RegistInspectionService) 실제 제출을 한 번에 처리한다
  // (실제 공단 웹 등록화면도 등록=제출 단일 액션이라 동일하게 구성).
  async function registerAndSubmit() {
    if (!checkupUnitId || !checkupTarget) return;
    if (!checkupAgree) { alert("자체점검 자격자 동의 체크가 필요합니다"); return; }
    const u = unitById.get(checkupUnitId);
    if (!u?.govNo) { alert("이 호기에 승강기고유번호가 등록돼 있지 않습니다"); return; }
    if (!selfProfile?.minwon_id) { alert("본인의 민원24 점검자 ID가 등록돼 있지 않습니다 — 인사관리에서 먼저 등록해주세요"); return; }
    if (!selfProfile?.phone) { alert("본인의 연락처가 등록돼 있지 않습니다 — 인사관리에서 먼저 등록해주세요"); return; }
    if (!checkupSubProfileId) { alert("부점검자를 선택해주세요 — 공단 규정상 자체점검자 2명 이상 등록이 필요합니다 (본인과 동일한 ID로는 제출할 수 없습니다)"); return; }
    if (!checkupCnfirm.trim() || !checkupCnfirmTel.trim()) {
      alert("관리주체명/전화번호가 필요합니다 — 현장정보에서 이 현장의 담당자를 먼저 등록해주세요");
      return;
    }

    setSavingCheckup(true);
    setCheckupResult(null);

    const { error: genError } = await supabase.rpc("generate_self_checks", { p_ym: ym });
    if (genError) { alert("자체점검 등록 실패: " + genError.message); setSavingCheckup(false); return; }
    const { error } = await supabase
      .from("self_checks")
      .update({
        status: "완료",
        done_date: checkupDate,
        photos: checkupPhotos.map((p) => p.url),
        notes: checkupNotes || null,
        assignee_id: selfId,
      })
      .eq("unit_id", checkupUnitId)
      .eq("ym", ym);
    if (error) { alert("자체점검 등록 실패: " + error.message); setSavingCheckup(false); return; }
    const { data: freshRow } = await supabase.from("self_checks").select("*").eq("unit_id", checkupUnitId).eq("ym", ym).single();
    const mapped = mapSelfCheck(freshRow);

    // 점검항목 예외를 통째로 다시 쓴다 (기존 행 삭제 후 현재 예외만 insert).
    await supabase.from("self_check_items").delete().eq("self_check_id", mapped.id);
    const exceptionRows = Object.entries(itemExceptions).map(([code, v]) => ({
      self_check_id: mapped.id, item_cd: code, result: v.result, remark: v.remark || null,
    }));
    if (exceptionRows.length > 0) {
      const { error: itemsError } = await supabase.from("self_check_items").insert(exceptionRows);
      if (itemsError) { alert("점검항목 저장 실패: " + itemsError.message); setSavingCheckup(false); return; }
    }
    setSelfChecks((prev) => [...prev.filter((c) => !(c.unitId === checkupUnitId && c.ym === ym)), mapped]);

    // 184개 항목 전체를 채운다: 예외 우선 → 해당없음(E) → 이번 달 대상이면 A, 아니면 D.
    const resultList = SELF_CHECK_ITEM_CODES.map((item) => {
      const exc = itemExceptions[item.code];
      if (exc) return { SEL_CHK_ITEM_CD: item.code, SEL_CHK_RESULT: exc.result, REMARK: exc.remark || "" };
      const st = itemStates[item.code];
      if (st?.applicable === false) return { SEL_CHK_ITEM_CD: item.code, SEL_CHK_RESULT: "E", REMARK: "" };
      return { SEL_CHK_ITEM_CD: item.code, SEL_CHK_RESULT: isDueThisMonth(item, ym) ? "A" : "D", REMARK: "" };
    });

    const digitsOnly = (v) => (v ?? "").replace(/[^0-9]/g, "");
    const ymCompact = ym.replace("-", "");
    const dateCompact = checkupDate.replace(/-/g, "");
    const companyUniqueNo = mapped.govCompanyUniqueNo || `GUIL_${mapped.id.slice(0, 8)}`;
    const subProfile = profilesAll.find((p) => p.id === checkupSubProfileId);

    const contents = {
      COMPANY_UNIQUE_NO: companyUniqueNo,
      ELEVATOR_NO: u.govNo,
      SEL_CHK_YM: ymCompact,
      SELCHK_USID: selfProfile.minwon_id,
      SEL_CHK_ST_DT: `${dateCompact}${checkupStartTime.replace(":", "")}`,
      SEL_CHK_END_DT: `${dateCompact}${checkupEndTime.replace(":", "")}`,
      SELCHK_USID_TELNO: digitsOnly(selfProfile.phone),
      SUB_SELCHK_DIV: "1",
      SUB_SELCHK_USID: subProfile.minwon_id,
      SUB_SELCHK_USNM: "",
      SUB_SELCHK_BIRTH_DT: "",
      CNFIRM: checkupCnfirm,
      CNFIRM_TELNO: digitsOnly(checkupCnfirmTel),
      SELCHK_DELAY_CD: "",
      SELCHK_REASON_CD: "GD0001",
      SELCHK_REASON_DETAIL_CD: "",
      PART_NM: "",
      PATICULS: checkupNotes || "",
      RESULT_LIST: resultList,
    };

    try {
      const res = await fetch("/api/self-check-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contents),
      });
      const data = await res.json();
      setCheckupResult(data);
      const submittedAt = new Date().toISOString();
      await supabase.from("self_checks").update({
        gov_company_unique_no: companyUniqueNo,
        gov_submitted_at: submittedAt,
        gov_result_code: data.resultCode ?? null,
        gov_result_msg: data.resultMsg ?? data.error ?? null,
      }).eq("id", mapped.id);
      setSelfChecks((prev) => prev.map((x) => (x.id === mapped.id
        ? { ...x, govCompanyUniqueNo: companyUniqueNo, govSubmittedAt: submittedAt, govResultCode: data.resultCode ?? null, govResultMsg: data.resultMsg ?? data.error ?? null }
        : x)));
    } catch (err) {
      setCheckupResult({ error: err.message });
    }
    setSavingCheckup(false);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100 shrink-0">
        {["계획", "처리", "달력"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-sm font-bold ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-5 pt-4 pb-2 shrink-0 flex items-center justify-between">
        <p className="text-sm font-bold text-blue-700">진행상황</p>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 계획 {plannedChecks.length}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 처리 {doneChecks.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === "계획" && (
          <div className="px-5 pt-2 pb-4">
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="현장명 또는 주소로 검색"
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                모든 현장보기
              </label>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
                점검완료현장 보기
              </label>
            </div>
            <div className="space-y-2.5">
              {planSites.map((s) => {
                const hasUnits = siteUnitList(s, units).filter((u) => u.id).length > 0;
                return (
                  <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm">{s.name} · {siteUnitList(s, units).length}대</p>
                      <p className="text-[11px] text-slate-400 truncate">{s.address}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <MapLinkButtons site={s} />
                      {hasUnits ? (
                        <>
                          <button
                            onClick={() => { setScheduleTarget(s); setScheduleDate(TODAY_STR); }}
                            className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg"
                          >
                            일정 등록
                          </button>
                          <button
                            onClick={() => openCheckup(s)}
                            className="text-xs font-bold text-white bg-blue-700 px-3 py-1.5 rounded-lg"
                          >
                            자체점검 등록
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400">호기 미등록</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {planSites.length === 0 && <p className="text-xs text-slate-400 text-center py-8">표시할 현장이 없습니다</p>}
            </div>
          </div>
        )}

        {subTab === "처리" && (
          <div className="px-5 pt-4 pb-4">
            {doneChecks.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">해당 기간에 자체점검 등록된 현장이 없습니다</p>
            ) : (
              <div className="space-y-2.5">
                {doneChecks.map((c) => (
                  <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm">{locOfCheck(c)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">완료일 {c.doneDate}</p>
                      </div>
                      {c.govResultCode === "000" ? (
                        <span className="shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">제출 성공</span>
                      ) : c.govSubmittedAt ? (
                        <span className="shrink-0 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">제출 실패</span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">미제출</span>
                      )}
                    </div>
                    {c.govSubmittedAt && (
                      <p className="text-[10px] text-slate-400 mt-1">전송 {formatDateTime(c.govSubmittedAt)}</p>
                    )}
                    {c.govResultCode && c.govResultCode !== "000" && (
                      <p className="text-[11px] text-red-600 mt-0.5">{c.govResultCode} {c.govResultMsg}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {subTab === "달력" && (
          <div className="pb-4 px-2">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                {WEEK_LABELS.map((d, idx) => (
                  <p key={d} className={`text-center text-[11px] font-bold py-2 ${idx === 0 ? "text-red-500" : idx === 6 ? "text-blue-500" : "text-slate-500"}`}>{d}</p>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: startDow }).map((_, i) => (
                  <div key={"pad" + i} className="min-h-[84px] border-b border-r border-slate-100 bg-slate-50/40" />
                ))}
                {monthDays.map((d) => {
                  const dow = (startDow + d - 1) % 7;
                  const iso = isoOf(d);
                  const isToday = iso === TODAY_STR;
                  const holiday = HOLIDAY[iso];
                  const daySchedules = checksThisMonth.filter((c) => c.plannedDate === iso);
                  const numColorCls = holiday || dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : isToday ? "text-blue-700" : "text-slate-500";
                  return (
                    <button
                      key={d}
                      onClick={() => setDayPopup(iso)}
                      className={`min-h-[84px] border-b border-r border-slate-100 p-1.5 flex flex-col items-start text-left active:bg-slate-50 ${isToday ? "bg-blue-50" : holiday ? "bg-red-50/40" : ""}`}
                    >
                      <div className="flex items-baseline gap-1 mb-0.5 w-full min-w-0">
                        <span className={`text-[11px] font-bold ${numColorCls}`}>{d}</span>
                        {holiday && <span className="text-[9px] font-bold text-red-400 truncate">{holiday}</span>}
                      </div>
                      {daySchedules.length > 0 && (
                        <div className="space-y-0.5 w-full">
                          {daySchedules.slice(0, 2).map((c) => (
                            <p key={c.id} className="text-[10px] font-semibold rounded px-1 py-0.5 truncate bg-blue-50 text-blue-700">{siteById.get(unitById.get(c.unitId)?.siteId)?.name ?? "-"}</p>
                          ))}
                          {daySchedules.length > 2 && (
                            <p className="text-[9px] text-slate-400 px-1">+{daySchedules.length - 2}건 더</p>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2.5 px-1 text-[10px] text-slate-400 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 inline-block" /> 점검 예정 현장</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-50 border border-blue-300 inline-block" /> 오늘</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-50 border border-red-200 inline-block" /> 공휴일</span>
            </div>
          </div>
        )}
      </div>

      {scheduleTarget && (
        <Sheet title={`${scheduleTarget.name} 일정 등록`} onClose={() => setScheduleTarget(null)}>
          <Field label="점검 예정일">
            <input type="date" className={inputCls} value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
          </Field>
          <PrimaryButton disabled={savingSchedule} onClick={registerSchedule}>
            {savingSchedule ? "저장 중..." : "일정 저장"}
          </PrimaryButton>
        </Sheet>
      )}

      {checkupTarget && (
        <Sheet title={`${checkupTarget.name} 자체점검 등록`} onClose={() => setCheckupTarget(null)}>
          <p className="text-[11px] text-slate-400 mb-1">승강기민원24(RegistInspectionService)에 실제로 제출됩니다. 내용을 확인한 뒤 등록해주세요.</p>
          {siteUnitList(checkupTarget, units).filter((u) => u.id).length > 1 && (
            <Field label="호기">
              <select className={inputCls} value={checkupUnitId ?? ""} onChange={(e) => loadCheckupForUnit(e.target.value, checkupTarget)}>
                {siteUnitList(checkupTarget, units).filter((u) => u.id).map((u) => (
                  <option key={u.id} value={u.id}>{u.unitNo}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="점검일">
            <input type="date" className={inputCls} value={checkupDate} onChange={(e) => setCheckupDate(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="점검 시작시각">
              <input type="time" className={inputCls} value={checkupStartTime} onChange={(e) => setCheckupStartTime(e.target.value)} />
            </Field>
            <Field label="점검 완료시각">
              <input type="time" className={inputCls} value={checkupEndTime} onChange={(e) => setCheckupEndTime(e.target.value)} />
            </Field>
          </div>

          <Field label="주점검자">
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2.5">
              {CURRENT_ENGINEER} {selfProfile?.minwon_id ? `(${selfProfile.minwon_id})` : "— 민원24 ID 미등록"}
            </p>
          </Field>
          <Field label="부점검자 (민원24 ID 등록된 인원 중 선택 — 자체점검자 2명 이상 입력 필수)">
            <select className={inputCls} value={checkupSubProfileId} onChange={(e) => setCheckupSubProfileId(e.target.value)}>
              <option value="">부점검자를 선택하세요</option>
              {profilesAll.filter((p) => p.id !== selfId && p.minwon_id).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>

          <Field label="점검 사진 (사내 기록용 — 공단 제출과 무관)">
            <MultiPhotoUpload
              photos={checkupPhotos}
              uploadFolder={`self-checks/${checkupUnitId ?? "unknown"}/${ym}`}
              onUploaded={(url) => setCheckupPhotos((p) => [...p, { url }])}
              onRemove={(idx) => setCheckupPhotos((p) => p.filter((_, i) => i !== idx))}
            />
          </Field>

          <Field label={`이번 달 점검항목 (기본 양호 · 예외 ${Object.keys(itemExceptions).length}건)`}>
            <input
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              placeholder="항목명·번호로 검색"
              className={inputCls}
            />
            <div className="mt-2 max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {filteredItemCodes.map((item) => {
                const current = itemExceptions[item.code]?.result ?? "A";
                return (
                  <div key={item.code} className="px-2.5 py-1.5">
                    <p className="text-[11px] text-slate-600 mb-1 truncate">{item.no} {item.name}</p>
                    <div className="flex gap-1">
                      {RESULT_OPTIONS.map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          title={o.label}
                          onClick={() => setItemResult(item.code, o.v)}
                          className={`${o.v === "D" || o.v === "E" ? "px-2 h-7" : "w-7 h-7"} shrink-0 rounded-full text-[11px] font-bold border ${current === o.v ? "bg-blue-700 text-white border-blue-700" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                        >
                          {o.v === "D" || o.v === "E" ? o.label : o.v}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {filteredItemCodes.length === 0 && <p className="text-xs text-slate-400 text-center py-4">검색 결과가 없습니다</p>}
            </div>
            {Object.keys(itemExceptions).length > 0 && (
              <p className="text-[10px] text-amber-600 mt-1">예외 항목(B/C)이 있으면 아래 특이사항에 사유를 함께 적어주세요 — 공단 제출 시 필수입니다.</p>
            )}
          </Field>

          <Field label="특이사항">
            <textarea
              className={inputCls}
              rows={3}
              placeholder="예: 로프 장력 미세 저하, 다음 점검 시 재확인 필요"
              value={checkupNotes}
              onChange={(e) => setCheckupNotes(e.target.value)}
            />
          </Field>

          <label className="flex items-start gap-2 text-[11px] text-slate-500 mb-3">
            <input type="checkbox" className="mt-0.5" checked={checkupAgree} onChange={(e) => setCheckupAgree(e.target.checked)} />
            본인은 자체점검 자격자이며, 자체점검 실시 후 거짓 없이 결과를 입력하였음에 동의합니다.
          </label>

          {checkupResult && (
            <div className="mb-2">
              <p className={`text-xs font-bold ${checkupResult.resultCode === "000" ? "text-emerald-600" : "text-red-600"}`}>
                {checkupResult.error ? checkupResult.error : `${checkupResult.resultCode} ${checkupResult.resultMsg}`}
              </p>
              {checkupResult.resultCode === "999" && (
                <p className="text-[10px] text-slate-400 mt-1">
                  이 승강기고유번호가 공단(민원24) 쪽에 우리 회사 유지관리 계약으로 아직 연결(이관)되지 않았을 가능성이 높습니다 — 다른 승강기는 정상 제출되는데 특정 승강기만 이 오류가 반복되면 공단에 해당 고유번호의 계약 연결 상태를 문의해주세요.
                </p>
              )}
              {checkupResult.raw && (
                <p className="text-[10px] text-slate-400 mt-1 break-all">HTTP {checkupResult.httpStatus} · {checkupResult.raw}</p>
              )}
            </div>
          )}

          <PrimaryButton disabled={savingCheckup} onClick={registerAndSubmit}>
            {savingCheckup ? "제출 중..." : "점검등록"}
          </PrimaryButton>
        </Sheet>
      )}

      {dayPopup && (
        <Sheet title={`${dayPopup} 점검일정`} onClose={() => setDayPopup(null)}>
          {checksThisMonth.filter((c) => c.plannedDate === dayPopup).length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">등록된 점검 일정이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {checksThisMonth.filter((c) => c.plannedDate === dayPopup).map((c) => (
                <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2.5">
                  <p className="text-sm font-semibold text-slate-800">{locOfCheck(c)}</p>
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
