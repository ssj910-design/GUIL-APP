"use client";

// 알림 설정 (회사 기본값) — 어떤 상황에 알림을 보낼지, 얼마나 급하게 보낼지 관리자가 정한다.
// 여기서 끈 알림은 개인이 켜도 안 간다. 개인은 회사가 켜둔 것 중에서만 끌 수 있다.
import { useState, useEffect, useContext } from "react";
import { supabase } from "@/lib/supabaseClient";
import { NOTIFICATIONS, GROUPS, LEVELS, levelOf, audienceTiersOf } from "@/lib/notifications";
import { AdminAuthContext } from "@/app/components/admin/adminShared";
import { subscribedProfileId } from "@/lib/push";

const AUDIENCE = { engineer: "기사", admin: "관리자", all: "전원" };
const ADMIN_TIER_CHIPS = { super: "최고", manager: "중간", material: "자재담당" };
const TRIGGER = { instant: "즉시", scheduled: "정해진 시각" };

export default function NotifySettings() {
  const { id: myId } = useContext(AdminAuthContext);
  const [settings, setSettings] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(null); // 지금 테스트 발송 중인 key

  // 실제 발송 시점(크론·스케줄)을 안 기다리고 본인 기기로 바로 받아서 확인해볼 수 있는 테스트 발송.
  // profileIds를 본인 하나로 못박아서 받는사람 설정과 무관하게 나에게만 간다 — 단, "사용" 꺼짐은 그대로 존중한다.
  async function testSend(n) {
    // 로그인이 꺼져 있으면(SKIP_LOGIN) 화면이 "누가 보고 있는지"를 모른다 — 그땐 이 기기가
    // 알림을 켤 때 저장해둔 구독(endpoint→profile_id)으로 본인을 찾는다. 안 그러면 테스트 버튼이
    // 전부 "로그인 정보 없음"만 띄우고 아무것도 못 하는 껍데기가 된다.
    const target = myId ?? (await subscribedProfileId());
    if (!target) {
      alert("이 기기로 보낼 대상을 찾지 못했습니다.\n먼저 좌측 하단 또는 마이페이지에서 “이 기기에서 알림 받기”를 켜주세요.");
      return;
    }
    setTesting(n.key);
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // test: 개인별 수신 설정(특히 '낮음' 등급 기본 꺼짐) 때문에 테스트가 조용히 스킵되지 않게 한다.
        // 회사 설정의 "사용 꺼짐"은 그대로 존중된다(서버에서 먼저 차단).
        body: JSON.stringify({ key: n.key, profileIds: [target], test: true, title: `[테스트] ${n.label}`, body: "알림 설정 화면에서 보낸 테스트 알림입니다." }),
      });
      const data = await res.json();
      if (data.ok && data.sent > 0) alert("테스트 알림을 보냈습니다 — 이 기기에서 확인해보세요.");
      else if (data.ok) alert("발송은 됐지만 이 계정에 등록된 알림 기기가 없습니다 (마이페이지에서 알림 받기를 켜주세요).");
      else alert("테스트 발송 실패: " + (data.reason ?? "알 수 없는 오류"));
    } catch (e) {
      alert("테스트 발송 실패: " + e.message);
    }
    setTesting(null);
  }

  useEffect(() => {
    supabase.from("notify_settings").select("*").then(({ data }) => {
      const m = {};
      for (const r of data ?? []) m[r.key] = { enabled: r.enabled, level: r.level, audienceTiers: r.audience_tiers ?? [] };
      setSettings(m);
      setLoaded(true);
    });
  }, []);

  async function save(key, patch) {
    const next = { ...(settings[key] ?? {}), ...patch };
    setSettings((prev) => ({ ...prev, [key]: next }));
    await supabase.from("notify_settings")
      .upsert({ key, enabled: next.enabled ?? true, level: next.level ?? null, audience_tiers: next.audienceTiers?.length ? next.audienceTiers : null, updated_at: new Date().toISOString() }, { onConflict: "key" });
  }

  const on = (item) => settings[item.key]?.enabled !== false;
  const counts = {
    total: NOTIFICATIONS.length,
    off: NOTIFICATIONS.filter((n) => !on(n)).length,
    urgent: NOTIFICATIONS.filter((n) => on(n) && ["urgent", "high"].includes(levelOf(n, settings))).length,
  };

  return (
    <div className="max-w-[100rem] mx-auto">
      <h1 className="text-xl font-extrabold mb-1">알림 설정</h1>
      <p className="text-xs text-slate-500 mb-4">
        회사 기본값입니다. 여기서 끈 알림은 아무에게도 가지 않습니다.
        기사는 마이페이지에서 켜진 알림 중 원하지 않는 것을 끌 수 있습니다.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-5 max-w-md">
        {[["전체", `${counts.total}종`, "text-slate-900"],
          ["소리·진동", `${counts.urgent}종`, "text-red-600"],
          ["꺼둠", `${counts.off}종`, counts.off ? "text-slate-500" : "text-slate-300"]].map(([l, v, tone]) => (
          <div key={l} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-[11px] text-slate-400 font-semibold">{l}</p>
            <p className={`text-lg font-extrabold ${tone}`}>{v}</p>
          </div>
        ))}
      </div>

      {!loaded ? (
        <p className="text-xs text-slate-400">불러오는 중…</p>
      ) : GROUPS.map((g) => (
        <div key={g} className="mb-5">
          <h2 className="text-sm font-extrabold text-slate-700 mb-2">{g}</h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "48rem" }}>
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="pl-5 pr-3 py-2.5 font-semibold text-left">상황</th>
                  <th className="px-3 py-2.5 font-semibold text-left w-36">받는 사람</th>
                  <th className="px-3 py-2.5 font-semibold text-left w-24">발송 시점</th>
                  <th className="px-3 py-2.5 font-semibold text-left w-56">알림 방식</th>
                  <th className="px-3 py-2.5 font-semibold text-right w-20">사용</th>
                  <th className="px-3 py-2.5 font-semibold text-right w-16">테스트</th>
                </tr>
              </thead>
              <tbody>
                {NOTIFICATIONS.filter((n) => n.group === g).map((n) => {
                  const enabled = on(n);
                  const lv = levelOf(n, settings);
                  const tiers = audienceTiersOf(n, settings);
                  return (
                    <tr key={n.key} className={`border-b border-slate-50 ${enabled ? "" : "opacity-45"}`}>
                      <td className="pl-5 pr-3 py-2.5">
                        <p className="font-bold text-slate-800">{n.label}</p>
                        {n.desc && <p className="text-[11px] text-slate-400 mt-0.5">{n.desc}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-[11px] whitespace-nowrap">
                        {n.audience === "admin" ? (
                          <div className="flex gap-1 items-center flex-wrap">
                            {Object.entries(ADMIN_TIER_CHIPS).map(([v, label]) => {
                              const active = tiers.includes(v);
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  disabled={!enabled}
                                  onClick={() => save(n.key, { audienceTiers: active ? tiers.filter((t) => t !== v) : [...tiers, v] })}
                                  className={`text-[10px] font-bold rounded-full px-2 py-1 border disabled:cursor-not-allowed ${
                                    active ? "bg-indigo-600 text-white border-indigo-600" : "text-slate-400 border-slate-200"
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                            {tiers.length === 0 && <span className="text-slate-400">(전체)</span>}
                          </div>
                        ) : AUDIENCE[n.audience]}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-[11px] whitespace-nowrap">{TRIGGER[n.trigger]}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {Object.entries(LEVELS).map(([k, meta]) => (
                            <button
                              key={k}
                              disabled={!enabled}
                              onClick={() => save(n.key, { level: k })}
                              title={meta.desc}
                              className={`text-[10px] font-bold rounded-lg px-2 py-1.5 border disabled:cursor-not-allowed ${
                                lv === k ? meta.tone : "text-slate-300 border-slate-100"
                              }`}
                            >
                              {meta.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => save(n.key, { enabled: !enabled })}
                          className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? "bg-blue-600" : "bg-slate-200"}`}
                          aria-label={`${n.label} ${enabled ? "끄기" : "켜기"}`}
                        >
                          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => testSend(n)}
                          disabled={!enabled || testing === n.key}
                          className="text-[10px] font-bold text-indigo-600 border border-indigo-200 rounded-lg px-2 py-1.5 disabled:text-slate-300 disabled:border-slate-100 disabled:cursor-not-allowed"
                        >
                          {testing === n.key ? "발송중…" : "테스트"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
