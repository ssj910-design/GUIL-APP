"use client";

import { useState, useEffect, useRef } from "react";
import { Home, AlertTriangle, CalendarCheck, ShieldCheck, Package, Receipt, ListTodo, MessagesSquare, Settings, Bell, Building2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest, mapTodo, mapQuoteRequest, mapBilling, mapRestockRequest, mapFeedPost, mapUnit, mapKitStock } from "@/lib/mappers";
import { addDays, profileIdByName, unitIdFor } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { simulateSms } from "@/lib/sms";
import { ScreenHeader } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { LoginScreen } from "@/app/components/LoginScreen";
import { SiteTab } from "@/app/components/tabs/SiteTab";
import { HomeTab } from "@/app/components/tabs/HomeTab";
import { FailureTab } from "@/app/components/tabs/FailureTab";
import { CheckupTab } from "@/app/components/tabs/CheckupTab";
import { InspectionTab } from "@/app/components/tabs/InspectionTab";
import { MaterialTab } from "@/app/components/tabs/MaterialTab";
import { BillingTab } from "@/app/components/tabs/BillingTab";
import { TodoTab } from "@/app/components/tabs/TodoTab";
import { AdminTab } from "@/app/components/tabs/AdminTab";
import { RoomTab } from "@/app/components/tabs/RoomTab";


const TABS = [
  { id: "home", label: "홈", icon: Home },
  { id: "sites", label: "현장관리", icon: Building2 },
  { id: "failure", label: "고장접수", icon: AlertTriangle },
  { id: "checkup", label: "정기점검", icon: CalendarCheck },
  { id: "inspection", label: "검사관리", icon: ShieldCheck },
  { id: "material", label: "자재·견적", icon: Package },
  { id: "billing", label: "비용청구", icon: Receipt },
  { id: "todo", label: "할일관리", icon: ListTodo },
  { id: "room", label: "우리방", icon: MessagesSquare },
  { id: "admin", label: "관리자 모드", icon: Settings },
];


/* ------------------------------------------------------------------ */
/* App shell                                                            */
/* ------------------------------------------------------------------ */

// 앱 구성이 끝날 때까지 로그인 화면을 잠시 꺼두는 스위치입니다.
// 다시 로그인을 켜려면 이 값을 false로 바꾸면 됩니다.
const SKIP_LOGIN = true;

const DEV_FAKE_PROFILE = { name: "관리자", role: "admin" };


// SKIP_LOGIN 상태에서 로그인 없이 URL만으로 관리자/기사 화면을 바꿔볼 수 있게 해줍니다.
// 예: ?as=engineer (기본 이름 "신석주"), ?as=engineer&name=김기사, ?as=admin
function getDevProfileOverride() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const as = params.get("as");
  if (as === "admin") return { name: params.get("name") || "관리자", role: "admin" };
  if (as === "engineer") return { name: params.get("name") || "신석주", role: "engineer" };
  return null;
}


export default function App() {
  // undefined = 아직 로그인 여부 확인 중, null = 로그인 안 됨, 객체 = 로그인 됨
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [engineers, setEngineers] = useState([]);
  const engineerNames = engineers.map((e) => e.name);

  const [tab, setTab] = useState("home");
  const [focusSiteId, setFocusSiteId] = useState(null);
  const [focusUnit, setFocusUnit] = useState(null);
  const [sites, setSites] = useState([]);
  const [units, setUnits] = useState([]); // v2: 호기 목록 (마이그레이션 전 DB에서는 빈 배열)
  const [profilesAll, setProfilesAll] = useState([]); // v2: 전 직원 프로필 (이름→id 매핑용)
  const [siteManagers, setSiteManagers] = useState([]);
  const [failures, setFailures] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [todos, setTodos] = useState([]);
  const [billings, setBillings] = useState([]);
  const [materialRequests, setMaterialRequests] = useState([]);
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [restockRequests, setRestockRequests] = useState([]);
  const [kitStock, setKitStock] = useState([]);
  const [kitStockReady, setKitStockReady] = useState(false);
  const [feed, setFeed] = useState([]);
  // 지급 사진을 여러 장 연달아 올릴 때, setState 업데이터 함수가 React 렌더링 타이밍에 따라
  // 아직 반영되지 않은 상태를 기준으로 계산될 수 있어(경쟁 상태) ref에 최신값을 직접 보관합니다.
  const supplyPhotoUrlsRef = useRef({ material: {}, quote: {}, restock: {} });
  // 상비부품 재고도 같은 이유로(한 번의 청구에서 여러 부품을 동시에 차감할 수 있어) ref에
  // 최신 수량을 직접 보관합니다. key: `${engineerId}|${part}`
  const kitStockRef = useRef({});
  const [failureToast, setFailureToast] = useState("");
  const [loading, setLoading] = useState(true);

  // 로그인 상태를 확인하고, 로그인/로그아웃이 일어날 때마다 알림을 받습니다.
  useEffect(() => {
    if (SKIP_LOGIN) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // 로그인이 되면 profiles 테이블에서 이 계정의 이름/역할을 가져옵니다.
  useEffect(() => {
    if (SKIP_LOGIN) {
      setProfile(getDevProfileOverride() ?? DEV_FAKE_PROFILE);
      return;
    }
    if (!session) {
      setProfile(null);
      return;
    }
    async function loadProfile() {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setProfile(data ? { name: data.name, role: data.role } : null);
    }
    loadProfile();
  }, [session]);

  async function handleLogin(email, password) {
    setAuthSubmitting(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError("이메일 또는 비밀번호가 올바르지 않습니다.");
    setAuthSubmitting(false);
  }

  function handleLogout() {
    supabase.auth.signOut();
  }

  // 로그인이 완료된 뒤에만 Supabase에서 실제 데이터를 불러옵니다.
  // (예전에는 INITIAL_FAILURES 같은 가짜 배열로 시작했지만, 이제는 DB가 기준입니다)
  useEffect(() => {
    if (!SKIP_LOGIN && !session) return;
    async function loadData() {
      const [
        sitesRes,
        siteManagersRes,
        failuresRes,
        inspectionsRes,
        materialRes,
        todosRes,
        quoteRes,
        billingsRes,
        restockRes,
        feedRes,
        engineersRes,
        unitsRes,
        kitStockRes,
      ] = await Promise.all([
        supabase.from("sites").select("*"),
        supabase.from("site_managers").select("*"),
        supabase.from("failures").select("*").order("created_at", { ascending: false }),
        supabase.from("inspections").select("*"),
        supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("todos").select("*").order("created_at", { ascending: false }),
        supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("billings").select("*").order("created_at", { ascending: false }),
        supabase.from("restock_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("feed_posts").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,name,role,phone,email").order("name"),
        supabase.from("units").select("*").order("seq"),
        supabase.from("kit_stock").select("*"),
      ]);
      setSites((sitesRes.data ?? []).map(mapSite));
      setSiteManagers((siteManagersRes.data ?? []).map(mapSiteManager));
      setFailures((failuresRes.data ?? []).map(mapFailure));
      setInspections((inspectionsRes.data ?? []).map(mapInspection));
      setMaterialRequests((materialRes.data ?? []).map(mapMaterialRequest));
      setTodos((todosRes.data ?? []).map(mapTodo));
      setQuoteRequests((quoteRes.data ?? []).map(mapQuoteRequest));
      setBillings((billingsRes.data ?? []).map(mapBilling));
      setRestockRequests((restockRes.data ?? []).map(mapRestockRequest));
      setFeed((feedRes.data ?? []).map(mapFeedPost));
      const allProfiles = engineersRes.data ?? [];
      setProfilesAll(allProfiles);
      setEngineers(allProfiles.filter((p) => p.role === "engineer"));
      setUnits((unitsRes.data ?? []).map(mapUnit)); // 테이블 없으면(마이그레이션 전) error → 빈 배열
      const loadedKitStock = (kitStockRes.data ?? []).map(mapKitStock); // kit_stock 테이블 없으면(마이그레이션 전) error → 빈 배열
      setKitStock(loadedKitStock);
      loadedKitStock.forEach((k) => { kitStockRef.current[`${k.engineerId}|${k.part}`] = k.qty; });
      setKitStockReady(!kitStockRes.error);
      setLoading(false);
    }
    loadData();
  }, [session]);

  // v2 마이그레이션이 실행된 DB인지 (units 존재 여부로 판단).
  // 마이그레이션 전 DB에 새 컬럼을 보내면 insert 전체가 실패하므로 반드시 이 가드를 통과해야 한다.
  const v2Ready = units.length > 0;

  // ★ 관리자가 현장관리 메뉴에서 현장을 새로 등록
  async function handleAddSite(form) {
    const newSite = {
      id: "site-" + Date.now(),
      siteCode: form.siteCode,
      name: form.name,
      elevatorNo: form.elevatorNo,
      address: form.address,
      region: form.region,
      contractType: form.contractType,
      phone: form.phone,
      elevatorModel: form.elevatorModel,
      unitCount: Number(form.unitCount) || 1,
      manager: form.manager,
      managerPhone: form.managerPhone,
      overdueLong: 0,
      overdueTotal: 0,
      failures30d: 0,
      assignedEngineer: form.assignedEngineer || null,
      notes: null,
      govElevatorNos: (form.govElevatorNos ?? []).map((v) => v || null),
    };
    await supabase.from("sites").insert({
      id: newSite.id,
      site_code: newSite.siteCode || null,
      name: newSite.name,
      elevator_no: newSite.elevatorNo,
      address: newSite.address,
      region: newSite.region,
      contract_type: newSite.contractType,
      phone: newSite.phone,
      elevator_model: newSite.elevatorModel,
      unit_count: newSite.unitCount,
      manager: newSite.manager,
      manager_phone: newSite.managerPhone,
      assigned_engineer: newSite.assignedEngineer,
      gov_elevator_nos: newSite.govElevatorNos,
    });
    setSites((prev) => [...prev, newSite]);
    // v2 듀얼라이트: 호기(units) 생성 + 담당기사 배정 (마이그레이션 전 DB에서는 조용히 무시됨)
    const unitRows = Array.from({ length: newSite.unitCount }, (_, i) => ({
      site_id: newSite.id,
      seq: i + 1,
      unit_no: `${i + 1}호기`,
      model: newSite.elevatorModel || null,
      gov_no: newSite.govElevatorNos[i] || null,
    }));
    const { data: createdUnits } = await supabase.from("units").insert(unitRows).select();
    if (createdUnits) setUnits((prev) => [...prev, ...createdUnits.map(mapUnit)]);
    const leadId = profileIdByName(profilesAll, newSite.assignedEngineer);
    if (leadId) await supabase.from("site_assignments").insert({ site_id: newSite.id, tech_id: leadId, is_lead: true });
  }

  // ★ 관리자가 현장관리 메뉴에서 현장 정보(담당 기사 배정 포함)를 수정
  async function handleUpdateSite(siteId, form) {
    await supabase
      .from("sites")
      .update({
        site_code: form.siteCode || null,
        name: form.name,
        elevator_no: form.elevatorNo,
        address: form.address,
        region: form.region,
        contract_type: form.contractType,
        phone: form.phone,
        elevator_model: form.elevatorModel,
        unit_count: Number(form.unitCount) || 1,
        manager: form.manager,
        manager_phone: form.managerPhone,
        assigned_engineer: form.assignedEngineer || null,
        gov_elevator_nos: (form.govElevatorNos ?? []).map((v) => v || null),
      })
      .eq("id", siteId);
    setSites((prev) =>
      prev.map((s) =>
        s.id === siteId
          ? {
              ...s,
              siteCode: form.siteCode,
              name: form.name,
              elevatorNo: form.elevatorNo,
              address: form.address,
              region: form.region,
              contractType: form.contractType,
              phone: form.phone,
              elevatorModel: form.elevatorModel,
              unitCount: Number(form.unitCount) || 1,
              manager: form.manager,
              managerPhone: form.managerPhone,
              assignedEngineer: form.assignedEngineer || null,
              govElevatorNos: (form.govElevatorNos ?? []).map((v) => v || null),
            }
          : s
      )
    );
    // v2 듀얼라이트: units 동기화 — 없는 호기 생성, gov_no 갱신, 초과분 비활성.
    // 호기별 모델은 여기서 덮어쓰지 않는다 (신규 생성 시에만 현장 공통 모델을 시드).
    const count = Number(form.unitCount) || 1;
    const govNos = (form.govElevatorNos ?? []).map((v) => v || null);
    await supabase.from("units").upsert(
      Array.from({ length: count }, (_, i) => ({
        site_id: siteId, seq: i + 1, unit_no: `${i + 1}호기`,
        model: form.elevatorModel || null, gov_no: govNos[i],
      })),
      { onConflict: "site_id,seq", ignoreDuplicates: true }
    );
    for (let i = 0; i < count; i++) {
      await supabase.from("units").update({ gov_no: govNos[i], is_active: true }).eq("site_id", siteId).eq("seq", i + 1);
    }
    await supabase.from("units").update({ is_active: false }).eq("site_id", siteId).gt("seq", count);
    const { data: freshUnits } = await supabase.from("units").select("*").eq("site_id", siteId).order("seq");
    if (freshUnits) setUnits((prev) => [...prev.filter((u) => u.siteId !== siteId), ...freshUnits.map(mapUnit)]);
    await supabase.from("site_assignments").delete().eq("site_id", siteId);
    const leadId = profileIdByName(profilesAll, form.assignedEngineer);
    if (leadId) await supabase.from("site_assignments").insert({ site_id: siteId, tech_id: leadId, is_lead: true });
  }

  // ★ 관리자가 현장관리 메뉴에서 현장을 삭제
  async function handleDeleteSite(siteId) {
    await supabase.from("sites").delete().eq("id", siteId);
    setSites((prev) => prev.filter((s) => s.id !== siteId));
  }

  // ★ 기사·관리자 누구나 현장정보의 "비고(전달사항)"을 수정
  async function handleUpdateSiteNotes(siteId, notes) {
    await supabase.from("sites").update({ notes }).eq("id", siteId);
    setSites((prev) => prev.map((s) => (s.id === siteId ? { ...s, notes } : s)));
  }

  // ★ 관리자가 현장구성에서 담당자(보수업체 담당자)를 추가
  async function handleAddSiteManager(siteId, form) {
    const newManager = { id: "sm-" + Date.now(), siteId, name: form.name, phone: form.phone, email: form.email, fax: form.fax };
    await supabase.from("site_managers").insert({
      id: newManager.id,
      site_id: siteId,
      name: newManager.name,
      phone: newManager.phone,
      email: newManager.email,
      fax: newManager.fax,
    });
    setSiteManagers((prev) => [...prev, newManager]);
  }

  // ★ 관리자가 현장구성에서 담당자 정보를 수정
  async function handleUpdateSiteManager(managerId, form) {
    await supabase
      .from("site_managers")
      .update({ name: form.name, phone: form.phone, email: form.email, fax: form.fax })
      .eq("id", managerId);
    setSiteManagers((prev) => prev.map((m) => (m.id === managerId ? { ...m, ...form } : m)));
  }

  // ★ 관리자가 현장구성에서 담당자를 삭제
  async function handleDeleteSiteManager(managerId) {
    await supabase.from("site_managers").delete().eq("id", managerId);
    setSiteManagers((prev) => prev.filter((m) => m.id !== managerId));
  }

  // ★ 관리자가 기사관리에서 기사 개인의 전화번호/메일주소를 입력
  async function handleUpdateEngineerContact(engineerId, { phone, email }) {
    await supabase.from("profiles").update({ phone, email }).eq("id", engineerId);
    setEngineers((prev) => prev.map((e) => (e.id === engineerId ? { ...e, phone, email } : e)));
  }

  // ★ 고장 출동 응답/내가 출동하기 → ETA 확정 (홈, 고장접수 탭 공용)
  function notifyFailure(message) {
    setFailureToast(message);
    setTimeout(() => setFailureToast(""), 3000);
  }

  async function handleDispatchFailure(failure, etaMinutes) {
    const assignee = failure.assignee || profile.name;
    const dispatchedAt = new Date().toTimeString().slice(0, 5);
    await supabase
      .from("failures")
      .update({
        assignee,
        dispatched_at: dispatchedAt,
        eta_minutes: etaMinutes,
        status: "진행중",
        ...(v2Ready ? { assignee_id: profileIdByName(profilesAll, assignee) } : {}),
      })
      .eq("id", failure.id);
    setFailures((prev) =>
      prev.map((x) => (x.id === failure.id ? { ...x, assignee, dispatchedAt, etaMinutes, status: "진행중" } : x))
    );
    simulateSms(failure.reporterPhone, `구일엘리베이터입니다. 담당 기사가 약 ${etaMinutes}분 후 도착 예정입니다.`);
    notifyFailure(`문자 발송 완료 · ${failure.reporterPhone || "신고자"}에게 도착예정시간 안내`);
    setFocusSiteId(failure.siteId);
    setFocusUnit(failure.elevatorNo || null);
    setTab("sites");
  }

  async function handleArriveFailure(failure, arrivalTime) {
    await supabase.from("failures").update({ arrival_time: arrivalTime }).eq("id", failure.id);
    setFailures((prev) => prev.map((x) => (x.id === failure.id ? { ...x, arrivalTime } : x)));
  }

  async function handleFailureResult(failure, payload) {
    const { result, symptom, errorCode, cause, processContent, note, photoCount, photoUrls } = payload;
    const isClosed = result === "처리완료" || result === "오신고";
    const escalation = result === "처리완료" ? null : result;
    await supabase
      .from("failures")
      .update({
        status: isClosed ? "완료" : failure.status,
        process_result: result,
        escalation,
        fault_symptom: symptom || null,
        fault_error_code: errorCode || null,
        fault_cause: cause || null,
        process_content: processContent || null,
        process_note: note || null,
        photo_count: photoCount || 0,
        photo_urls: photoUrls?.length ? photoUrls : null,
      })
      .eq("id", failure.id);
    setFailures((prev) =>
      prev.map((x) =>
        x.id === failure.id
          ? {
              ...x,
              status: isClosed ? "완료" : x.status,
              processResult: result,
              escalation,
              faultSymptom: symptom || null,
              faultErrorCode: errorCode || null,
              faultCause: cause || null,
              processContent: processContent || null,
              processNote: note || null,
              photoCount: photoCount || 0,
              photoUrls: photoUrls ?? [],
            }
          : x
      )
    );
  }

  async function handleSubmitBilling({ type, siteName, elevatorNo, part, cost, replaceDate, contactPhone, beforePhotoUrls, afterPhotoUrls, confirmPhotoUrl, siteId, unitId, materialRequestId }) {
    // v2: 호기 확정 — 직접 전달받거나(자재건), siteId 또는 유일한 현장명으로 찾는다
    const billSite = siteId
      ? sites.find((x) => x.id === siteId)
      : sites.filter((x) => x.name === siteName).length === 1
        ? sites.find((x) => x.name === siteName)
        : null;
    const billUnitId = unitId ?? (billSite ? unitIdFor(units, billSite.id, elevatorNo) : null);
    const newBilling = {
      id: "bill-" + Date.now(),
      type,
      siteName,
      elevatorNo: elevatorNo || null,
      part,
      cost,
      replaceDate,
      contactPhone,
      engineer: profile.name,
      submittedAt: TODAY_STR,
      beforePhotoUrls: beforePhotoUrls?.length ? beforePhotoUrls : [],
      afterPhotoUrls: afterPhotoUrls?.length ? afterPhotoUrls : [],
      confirmPhotoUrl: confirmPhotoUrl || null,
    };
    await supabase.from("billings").insert({
      id: newBilling.id,
      type: newBilling.type,
      site_name: newBilling.siteName,
      elevator_no: newBilling.elevatorNo,
      part: newBilling.part,
      cost: newBilling.cost || null,
      replace_date: newBilling.replaceDate,
      contact_phone: newBilling.contactPhone,
      engineer: newBilling.engineer,
      submitted_at: newBilling.submittedAt,
      before_photo_urls: newBilling.beforePhotoUrls.length ? newBilling.beforePhotoUrls : null,
      after_photo_urls: newBilling.afterPhotoUrls.length ? newBilling.afterPhotoUrls : null,
      confirm_photo_url: newBilling.confirmPhotoUrl,
      ...(v2Ready ? {
        unit_id: billUnitId,
        engineer_id: profileIdByName(profilesAll, profile.name),
        material_request_id: materialRequestId ?? null,
      } : {}),
    });
    setBillings((prev) => [newBilling, ...prev]);
  }

  // ★ 우리방 피드에 새 글 등록
  async function handleSendFeedPost(text) {
    const newPost = {
      id: "p" + Date.now(),
      author: profile.name,
      time: new Date().toTimeString().slice(0, 5),
      text,
    };
    await supabase.from("feed_posts").insert({
      id: newPost.id,
      author: newPost.author,
      body: newPost.text,
      ...(v2Ready ? { author_id: profileIdByName(profilesAll, newPost.author) } : {}),
    });
    setFeed((prev) => [...prev, newPost]);
  }

  // ★ 자재 담당자가 지급할 자재 사진을 한 장 추가하는 순간 (지급완료 체크의 선행 조건)
  // 여러 장을 연달아 올릴 때 setState 업데이터만으로는 React 렌더링 타이밍에 따라 아직 반영되지
  // 않은 상태를 기준으로 계산될 수 있어(경쟁 상태), ref에 최신 배열을 직접 동기적으로 보관합니다.
  async function handleAttachPhoto(requestId, newUrl) {
    const ref = supplyPhotoUrlsRef.current.material;
    const existing = ref[requestId] ?? materialRequests.find((r) => r.id === requestId)?.supplyPhotoUrls ?? [];
    if (existing.includes(newUrl)) return;
    const urls = [...existing, newUrl];
    ref[requestId] = urls;
    setMaterialRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, hasSupplyPhoto: true, supplyPhotoUrls: urls } : r)));
    await supabase.from("material_requests").update({ has_supply_photo: true, supply_photo_urls: urls }).eq("id", requestId);
  }

  // ★ 등록된 지급 사진을 한 장 삭제
  async function handleRemoveSupplyPhoto(requestId, idx) {
    const ref = supplyPhotoUrlsRef.current.material;
    const existing = ref[requestId] ?? materialRequests.find((r) => r.id === requestId)?.supplyPhotoUrls ?? [];
    const urls = existing.filter((_, i) => i !== idx);
    ref[requestId] = urls;
    setMaterialRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, hasSupplyPhoto: urls.length > 0, supplyPhotoUrls: urls } : r)));
    await supabase
      .from("material_requests")
      .update({ has_supply_photo: urls.length > 0, supply_photo_urls: urls.length ? urls : null })
      .eq("id", requestId);
  }

  // ★ 자재 지급 완료 트리거: 이 순간에만 할 일이 자동 생성됩니다 (D-30 시작)
  // assignee를 넘기면(신청자와 실제 교체 기사가 다른 경우) 그 이름으로 할 일이 생성되고,
  // 생략하면 지금처럼 신청 기사 본인 앞으로 생성됩니다.
  async function handleSupplyComplete(requestId, assignee) {
    const req = materialRequests.find((r) => r.id === requestId);
    if (!req || !req.hasSupplyPhoto) return;

    await supabase
      .from("material_requests")
      .update({ status: "지급완료", supplied_date: TODAY_STR })
      .eq("id", requestId);
    setMaterialRequests((prev) =>
      prev.map((r) => (r.id === requestId && r.hasSupplyPhoto ? { ...r, status: "지급완료", suppliedDate: TODAY_STR } : r))
    );

    const newTodo = {
      id: "todo-" + requestId,
      materialRequestId: requestId,
      source: "material",
      title: `${req.siteName} ${req.part} 교체 및 확인서 제출`,
      siteName: req.siteName,
      elevatorNo: req.elevatorNo,
      part: req.part,
      assignee: assignee || req.engineer,
      assignedDate: TODAY_STR,
      dueDate: addDays(TODAY_STR, 30),
      done: false,
    };
    await supabase.from("todos").insert({
      id: newTodo.id,
      material_request_id: newTodo.materialRequestId,
      source: newTodo.source,
      title: newTodo.title,
      site_name: newTodo.siteName,
      elevator_no: newTodo.elevatorNo,
      part: newTodo.part,
      assignee: newTodo.assignee,
      assigned_date: newTodo.assignedDate,
      due_date: newTodo.dueDate,
      done: newTodo.done,
      ...(v2Ready ? {
        unit_id: req.unitId ?? unitIdFor(units, req.siteId, req.elevatorNo),
        assignee_id: profileIdByName(profilesAll, newTodo.assignee),
      } : {}),
    });
    setTodos((prev) => [newTodo, ...prev]);
  }

  // ★ 기사가 비용청구에서 "상비부품에서 사용함"을 체크하고 제출하면 보충 요청이 자동 생성되고,
  // 사용한 수량만큼 그 기사의 상비부품 재고(kit_stock)가 즉시 차감됩니다 (0 아래로는 내려가지 않음).
  async function handleUseKitPart({ part, siteName, qty }) {
    const usedQty = Number(qty) || 1;
    const engineerId = profileIdByName(profilesAll, profile.name);
    const newRestock = {
      id: "restock-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      engineer: profile.name,
      part,
      siteName,
      requestedDate: TODAY_STR,
      status: "대기",
      suppliedDate: null,
      hasSupplyPhoto: false,
      quantity: usedQty,
      engineerId,
      receivedAt: null,
    };
    await supabase.from("restock_requests").insert({
      id: newRestock.id,
      engineer: newRestock.engineer,
      part: newRestock.part,
      site_name: newRestock.siteName,
      requested_date: newRestock.requestedDate,
      status: newRestock.status,
      ...(v2Ready ? { engineer_id: engineerId } : {}),
      ...(kitStockReady ? { quantity: usedQty } : {}),
    });
    setRestockRequests((prev) => [newRestock, ...prev]);

    if (kitStockReady && engineerId) {
      const key = `${engineerId}|${part}`;
      const currentQty = kitStockRef.current[key] ?? 0;
      const newQty = Math.max(0, currentQty - usedQty);
      kitStockRef.current[key] = newQty;
      await supabase.from("kit_stock").upsert({ engineer_id: engineerId, part, qty: newQty }, { onConflict: "engineer_id,part" });
      setKitStock((prev) => {
        const existing = prev.find((k) => k.engineerId === engineerId && k.part === part);
        if (existing) return prev.map((k) => (k === existing ? { ...k, qty: newQty } : k));
        return [...prev, { id: key, engineerId, part, qty: newQty }];
      });
    }
  }

  // ★ 기사가 지급완료된 보충 요청을 "수령하기" 하면 그만큼 상비부품 재고가 늘어납니다.
  async function handleReceiveRestock(restockId) {
    const restock = restockRequests.find((r) => r.id === restockId);
    if (!restock) return;
    const receivedAt = new Date().toISOString();
    await supabase.from("restock_requests").update({ received_at: receivedAt }).eq("id", restockId);
    setRestockRequests((prev) => prev.map((r) => (r.id === restockId ? { ...r, receivedAt } : r)));

    if (kitStockReady && restock.engineerId) {
      const key = `${restock.engineerId}|${restock.part}`;
      const currentQty = kitStockRef.current[key] ?? 0;
      const newQty = currentQty + (restock.quantity || 1);
      kitStockRef.current[key] = newQty;
      await supabase.from("kit_stock").upsert({ engineer_id: restock.engineerId, part: restock.part, qty: newQty }, { onConflict: "engineer_id,part" });
      setKitStock((prev) => {
        const existing = prev.find((k) => k.engineerId === restock.engineerId && k.part === restock.part);
        if (existing) return prev.map((k) => (k === existing ? { ...k, qty: newQty } : k));
        return [...prev, { id: key, engineerId: restock.engineerId, part: restock.part, qty: newQty }];
      });
    }
  }

  // ★ 관리자가 보충할 부품 사진을 등록 (지급완료의 선행 조건)
  // 여러 장을 연달아 올릴 때 setState 업데이터만으로는 React 렌더링 타이밍에 따라 아직 반영되지
  // 않은 상태를 기준으로 계산될 수 있어(경쟁 상태), ref에 최신 배열을 직접 동기적으로 보관합니다.
  async function handleAttachRestockPhoto(restockId, newUrl) {
    const ref = supplyPhotoUrlsRef.current.restock;
    const existing = ref[restockId] ?? restockRequests.find((r) => r.id === restockId)?.supplyPhotoUrls ?? [];
    if (existing.includes(newUrl)) return;
    const urls = [...existing, newUrl];
    ref[restockId] = urls;
    setRestockRequests((prev) => prev.map((r) => (r.id === restockId ? { ...r, hasSupplyPhoto: true, supplyPhotoUrls: urls } : r)));
    await supabase.from("restock_requests").update({ has_supply_photo: true, supply_photo_urls: urls }).eq("id", restockId);
  }

  async function handleRemoveRestockSupplyPhoto(restockId, idx) {
    const ref = supplyPhotoUrlsRef.current.restock;
    const existing = ref[restockId] ?? restockRequests.find((r) => r.id === restockId)?.supplyPhotoUrls ?? [];
    const urls = existing.filter((_, i) => i !== idx);
    ref[restockId] = urls;
    setRestockRequests((prev) => prev.map((r) => (r.id === restockId ? { ...r, hasSupplyPhoto: urls.length > 0, supplyPhotoUrls: urls } : r)));
    await supabase
      .from("restock_requests")
      .update({ has_supply_photo: urls.length > 0, supply_photo_urls: urls.length ? urls : null })
      .eq("id", restockId);
  }

  // ★ 보충 지급완료 처리
  async function handleCompleteRestock(restockId) {
    const r = restockRequests.find((x) => x.id === restockId);
    if (!r || !r.hasSupplyPhoto) return;
    await supabase.from("restock_requests").update({ status: "완료", supplied_date: TODAY_STR }).eq("id", restockId);
    setRestockRequests((prev) =>
      prev.map((x) => (x.id === restockId && x.hasSupplyPhoto ? { ...x, status: "완료", suppliedDate: TODAY_STR } : x))
    );
  }

  // ★ 견적 진행 단계 전진: 요청접수 → 견적발행 → 승인 (사진 불필요)
  async function handleAdvanceQuote(quoteId) {
    const q = quoteRequests.find((x) => x.id === quoteId);
    if (!q) return;
    if (q.status === "요청접수") {
      await supabase.from("quote_requests").update({ status: "견적발행", quote_issued_date: TODAY_STR }).eq("id", quoteId);
    } else if (q.status === "견적발행") {
      await supabase.from("quote_requests").update({ status: "승인", approved_date: TODAY_STR }).eq("id", quoteId);
    }
    setQuoteRequests((prev) =>
      prev.map((x) => {
        if (x.id !== quoteId) return x;
        if (x.status === "요청접수") return { ...x, status: "견적발행", quoteIssuedDate: TODAY_STR };
        if (x.status === "견적발행") return { ...x, status: "승인", approvedDate: TODAY_STR };
        return x;
      })
    );
  }

  // ★ 관리자가 지급할 자재 사진을 등록 (자재지급완료 처리의 선행 조건)
  // 여러 장을 연달아 올릴 때 setState 업데이터만으로는 React 렌더링 타이밍에 따라 아직 반영되지
  // 않은 상태를 기준으로 계산될 수 있어(경쟁 상태), ref에 최신 배열을 직접 동기적으로 보관합니다.
  async function handleAttachQuotePhoto(quoteId, newUrl) {
    const ref = supplyPhotoUrlsRef.current.quote;
    const existing = ref[quoteId] ?? quoteRequests.find((q) => q.id === quoteId)?.supplyPhotoUrls ?? [];
    if (existing.includes(newUrl)) return;
    const urls = [...existing, newUrl];
    ref[quoteId] = urls;
    setQuoteRequests((prev) => prev.map((q) => (q.id === quoteId ? { ...q, hasSupplyPhoto: true, supplyPhotoUrls: urls } : q)));
    await supabase.from("quote_requests").update({ has_supply_photo: true, supply_photo_urls: urls }).eq("id", quoteId);
  }

  async function handleRemoveQuoteSupplyPhoto(quoteId, idx) {
    const ref = supplyPhotoUrlsRef.current.quote;
    const existing = ref[quoteId] ?? quoteRequests.find((q) => q.id === quoteId)?.supplyPhotoUrls ?? [];
    const urls = existing.filter((_, i) => i !== idx);
    ref[quoteId] = urls;
    setQuoteRequests((prev) => prev.map((q) => (q.id === quoteId ? { ...q, hasSupplyPhoto: urls.length > 0, supplyPhotoUrls: urls } : q)));
    await supabase
      .from("quote_requests")
      .update({ has_supply_photo: urls.length > 0, supply_photo_urls: urls.length ? urls : null })
      .eq("id", quoteId);
  }

  // ★ 자재지급완료 트리거: 이 순간 담당 기사(들)에게 할 일이 자동 생성됩니다
  // assignees(배열)를 넘기면 신청자 외에 실제 시공 기사를 2명 이상 지정할 수 있고,
  // 각 담당자마다 할 일이 하나씩 생성됩니다 (같은 quoteRequestId를 공유 — 한 명이 비용청구를
  // 하면 나머지 담당자의 할 일도 함께 자동완료됩니다).
  async function handleCompleteQuoteSupply(quoteId, assignees) {
    const q = quoteRequests.find((x) => x.id === quoteId);
    if (!q || !q.hasSupplyPhoto) return;
    const finalAssignees = assignees?.length ? assignees : [q.engineer];

    await supabase.from("quote_requests").update({ status: "자재지급완료", supplied_date: TODAY_STR }).eq("id", quoteId);
    setQuoteRequests((prev) =>
      prev.map((x) => (x.id === quoteId && x.hasSupplyPhoto ? { ...x, status: "자재지급완료", suppliedDate: TODAY_STR } : x))
    );

    const newTodos = finalAssignees.map((assignee, idx) => ({
      id: `todo-quote-${quoteId}-${idx}`,
      materialRequestId: null,
      quoteRequestId: quoteId,
      source: "quote",
      title: `${q.siteName} ${q.constructionType} 시공 확인 및 서류 제출`,
      siteName: q.siteName,
      elevatorNo: q.elevatorNo,
      part: q.constructionType,
      assignee,
      assignedDate: TODAY_STR,
      dueDate: addDays(TODAY_STR, 30),
      done: false,
    }));
    await supabase.from("todos").insert(
      newTodos.map((t) => ({
        id: t.id,
        quote_request_id: t.quoteRequestId,
        source: t.source,
        title: t.title,
        site_name: t.siteName,
        elevator_no: t.elevatorNo,
        part: t.part,
        assignee: t.assignee,
        assigned_date: t.assignedDate,
        due_date: t.dueDate,
        done: t.done,
        ...(v2Ready ? {
          unit_id: q.unitId ?? unitIdFor(units, q.siteId, q.elevatorNo),
          assignee_id: profileIdByName(profilesAll, t.assignee),
        } : {}),
      }))
    );
    setTodos((prev) => [...newTodos, ...prev]);
  }

  // ★ 관리자가 직원(1명 이상)에게 할 일을 직접 부여 — 담당자마다 할 일을 하나씩 만듭니다
  async function handleAssignTodo({ assignees, siteName, title, dueDate, photoCount, photoUrls }) {
    const newTodos = assignees.map((assignee, idx) => ({
      id: "todo-manual-" + Date.now() + "-" + idx,
      materialRequestId: null,
      source: "manual",
      title,
      siteName,
      part: null,
      assignee,
      assignedDate: TODAY_STR,
      dueDate,
      done: false,
      photoCount: photoCount || 0,
      photoUrls: photoUrls ?? [],
    }));
    await supabase.from("todos").insert(
      newTodos.map((t) => ({
        id: t.id,
        source: t.source,
        title: t.title,
        site_name: t.siteName,
        assignee: t.assignee,
        assigned_date: t.assignedDate,
        due_date: t.dueDate,
        done: t.done,
        photo_count: t.photoCount,
        photo_urls: t.photoUrls?.length ? t.photoUrls : null,
        ...(v2Ready ? { assignee_id: profileIdByName(profilesAll, t.assignee) } : {}),
      }))
    );
    setTodos((prev) => [...newTodos, ...prev]);
  }

  // ★ 관리자 권한: 어떤 할 일이든(자재/견적 연동건 포함) 임의로 완료·완료취소 처리할 수 있음
  async function handleAdminToggleTodo(todoId) {
    const current = todos.find((t) => t.id === todoId);
    if (!current) return;
    await supabase.from("todos").update({ done: !current.done }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)));
  }

  // ★ 할 일 담당자 재지정 — 신청자와 실제 교체 기사가 지급 시점엔 다르게 정해졌거나
  // 나중에 배차가 바뀐 경우의 안전망입니다. 관리자 화면과 기사 본인 화면 양쪽에서 호출됩니다.
  async function handleReassignTodo(todoId, newAssignee) {
    await supabase.from("todos").update({ assignee: newAssignee }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, assignee: newAssignee } : t)));
  }

  // ★ 관리자가 할 일에 설명(내용)을 추가/수정합니다.
  async function handleUpdateTodoDescription(todoId, description) {
    await supabase.from("todos").update({ description }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, description } : t)));
  }

  // ★ 기사 반려: 잘못된 자재가 지급된 경우. 연결된 할 일은 취소되고 담당자에게 재지급 알림이 전달됩니다.
  async function handleReject(requestId, reason) {
    await supabase
      .from("material_requests")
      .update({ status: "반려", reject_reason: reason, rejected_date: TODAY_STR })
      .eq("id", requestId);
    setMaterialRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: "반려", rejectReason: reason, rejectedDate: TODAY_STR } : r))
    );

    const todoIdsToRemove = todos.filter((t) => t.materialRequestId === requestId && !t.done).map((t) => t.id);
    if (todoIdsToRemove.length > 0) {
      await supabase.from("todos").delete().in("id", todoIdsToRemove);
    }
    setTodos((prev) => prev.filter((t) => !(t.materialRequestId === requestId && !t.done)));
  }

  // 관리자가 반려 건을 재확인하고 다시 '지급 대기' 목록으로 돌려보냅니다.
  async function handleReprocess(requestId) {
    await supabase
      .from("material_requests")
      .update({ status: "승인대기", supplied_date: null, reject_reason: null, rejected_date: null, has_supply_photo: false })
      .eq("id", requestId);
    setMaterialRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, status: "승인대기", suppliedDate: null, rejectReason: null, rejectedDate: null, hasSupplyPhoto: false }
          : r
      )
    );
  }

  const tabTitle = TABS.find((t) => t.id === tab)?.label ?? "";
  const visibleTabs = TABS.filter((t) => t.id !== "admin" || profile?.role === "admin");

  if (!SKIP_LOGIN && session === undefined) {
    return (
      <div className="h-dvh w-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm font-bold text-slate-400">로그인 확인 중...</p>
      </div>
    );
  }

  if (!SKIP_LOGIN && !session) {
    return <LoginScreen onLogin={handleLogin} error={authError} submitting={authSubmitting} />;
  }

  if (loading || !profile) {
    return (
      <div className="h-dvh w-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm font-bold text-slate-400">데이터를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ name: profile.name, role: profile.role, engineerNames, engineers, profiles: profilesAll, selfId: profileIdByName(profilesAll, profile.name), signOut: handleLogout }}>
    <SitesContext.Provider value={sites}>
    <UnitsContext.Provider value={units}>
      <div className="h-dvh w-screen bg-slate-50 flex flex-col overflow-hidden relative">
          <ScreenHeader
            title={tab === "home" ? "구일엘리베이터(주)" : tabTitle}
            right={
              <button className="relative p-1.5 bg-blue-900 rounded-full">
                <Bell size={16} />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
              </button>
            }
          />

          {tab === "home" && (
            <HomeTab
              inspections={inspections}
              failures={failures}
              onDispatch={handleDispatchFailure}
              onArrive={handleArriveFailure}
              onResult={handleFailureResult}
              toast={failureToast}
            />
          )}
          {tab === "sites" && <SiteTab inspections={inspections} failures={failures} billings={billings} siteManagers={siteManagers} onUpdateSiteNotes={handleUpdateSiteNotes} focusSiteId={focusSiteId} focusUnit={focusUnit} onFocusSiteHandled={() => { setFocusSiteId(null); setFocusUnit(null); }} />}
          {tab === "failure" && (
            <FailureTab
              failures={failures}
              setFailures={setFailures}
              onDispatch={handleDispatchFailure}
              onArrive={handleArriveFailure}
              onResult={handleFailureResult}
              toast={failureToast}
            />
          )}
          {tab === "checkup" && <CheckupTab />}
          {tab === "inspection" && <InspectionTab inspections={inspections} setInspections={setInspections} />}
          {tab === "material" && <MaterialTab requests={materialRequests} setRequests={setMaterialRequests} todos={todos} onReject={handleReject} quoteRequests={quoteRequests} setQuoteRequests={setQuoteRequests} restockRequests={restockRequests} kitStock={kitStock} onReceiveRestock={handleReceiveRestock} />}
          {tab === "billing" && <BillingTab todos={todos} setTodos={setTodos} onSubmitBilling={handleSubmitBilling} onUseKitPart={handleUseKitPart} />}
          {tab === "todo" && (
            <TodoTab
              todos={todos}
              setTodos={setTodos}
              onReassignTodo={handleReassignTodo}
              onUpdateTodoDescription={handleUpdateTodoDescription}
              materialRequests={materialRequests}
              quoteRequests={quoteRequests}
            />
          )}
          {tab === "room" && <RoomTab feed={feed} onSendChat={handleSendFeedPost} />}
          {tab === "admin" && profile.role === "admin" && <AdminTab inspections={inspections} materialRequests={materialRequests} billings={billings} quoteRequests={quoteRequests} restockRequests={restockRequests} todos={todos} onSupplyComplete={handleSupplyComplete} onReprocess={handleReprocess} onAttachPhoto={handleAttachPhoto} onRemoveSupplyPhoto={handleRemoveSupplyPhoto} onAssignTodo={handleAssignTodo} onAdvanceQuote={handleAdvanceQuote} onAttachQuotePhoto={handleAttachQuotePhoto} onRemoveQuoteSupplyPhoto={handleRemoveQuoteSupplyPhoto} onCompleteQuoteSupply={handleCompleteQuoteSupply} onAdminToggleTodo={handleAdminToggleTodo} onAttachRestockPhoto={handleAttachRestockPhoto} onRemoveRestockSupplyPhoto={handleRemoveRestockSupplyPhoto} onCompleteRestock={handleCompleteRestock} onReassignTodo={handleReassignTodo} onUpdateTodoDescription={handleUpdateTodoDescription} onAddSite={handleAddSite} onUpdateSite={handleUpdateSite} onDeleteSite={handleDeleteSite} siteManagers={siteManagers} onAddSiteManager={handleAddSiteManager} onUpdateSiteManager={handleUpdateSiteManager} onDeleteSiteManager={handleDeleteSiteManager} onUpdateEngineerContact={handleUpdateEngineerContact} />}

          {/* bottom nav */}
          <div
            className="shrink-0 bg-slate-50 border-t-2 border-slate-300 flex overflow-x-auto"
            style={{ boxShadow: "0 -4px 6px -1px rgba(0,0,0,0.1)" }}
          >
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-col items-center justify-center gap-1 py-3 px-2 shrink-0 border-r border-slate-200 last:border-r-0 ${active ? "bg-blue-900" : "bg-transparent"}`}
                  style={{ minWidth: "68px" }}
                >
                  <Icon size={19} className={active ? "text-white" : "text-slate-400"} strokeWidth={active ? 2.75 : 2} />
                  <span className={`text-[10px] leading-tight text-center font-bold ${active ? "text-white" : "text-slate-500"}`}>{t.label}</span>
                </button>
              );
            })}
          </div>
      </div>
    </UnitsContext.Provider>
    </SitesContext.Provider>
    </AuthContext.Provider>
  );
}
