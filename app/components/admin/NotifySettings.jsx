"use client";

// 알림 설정 (회사 기본값) — 어떤 상황에 알림을 보낼지, 얼마나 급하게 보낼지 관리자가 정한다.
// 여기서 끈 알림은 개인이 켜도 안 간다. 개인은 회사가 켜둔 것 중에서만 끌 수 있다.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { NOTIFICATIONS, GROUPS, LEVELS, levelOf } from "@/lib/notifications";

const AUDIENCE = { engineer: "기사", admin: "관리자", all: "전원" };
const TRIGGER = { instant: "즉시", scheduled: "정해진 시각" };

export default function NotifySettings() {
  const [settings, setSettings] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.from("notify_settings").select("*").then(({ data }) => {
      const m = {};
      for (const r of data ?? []) m[r.key] = { enabled: r.enabled, level: r.level };
      setSettings(m);
      setLoaded(true);
    });
  }, []);

  async function save(key, patch) {
    const next = { ...(settings[key] ?? {}), ...patch };
    setSettings((prev) => ({ ...prev, [key]: next }));
    await supabase.from("notify_settings")
      .upsert({ key, enabled: next.enabled ?? true, level: next.level ?? null, updated_at: new Date().toISOString() }, { onConflict: "key" });
  }

  const on = (item) => settings[item.key]?.enabled !== false;
  const counts = {
    total: NOTIFICATIONS.length,
    off: NOTIFICATIONS.filter((n) => !on(n)).length,
    urgent: NOTIFICATIONS.filter((n) => on(n) && levelOf(n, settings) === "urgent").length,
  };

  return (
    <div className="max-w-5xl">
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

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
        <p className="text-xs font-bold text-amber-800">아직 실제 푸시는 나가지 않습니다</p>
        <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
          웹 푸시(서비스워커·구독)가 붙기 전이라, 지금 설정은 저장만 됩니다.
          푸시가 연결되면 이 값이 그대로 적용됩니다. 앱 안 종 알림은 설정과 무관하게 계속 표시됩니다.
        </p>
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
                  <th className="px-3 py-2.5 font-semibold text-left w-20">받는 사람</th>
                  <th className="px-3 py-2.5 font-semibold text-left w-24">발송 시점</th>
                  <th className="px-3 py-2.5 font-semibold text-left w-56">알림 방식</th>
                  <th className="px-3 py-2.5 font-semibold text-right w-20">사용</th>
                </tr>
              </thead>
              <tbody>
                {NOTIFICATIONS.filter((n) => n.group === g).map((n) => {
                  const enabled = on(n);
                  const lv = levelOf(n, settings);
                  return (
                    <tr key={n.key} className={`border-b border-slate-50 ${enabled ? "" : "opacity-45"}`}>
                      <td className="pl-5 pr-3 py-2.5">
                        <p className="font-bold text-slate-800">{n.label}</p>
                        {n.desc && <p className="text-[11px] text-slate-400 mt-0.5">{n.desc}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-[11px] whitespace-nowrap">{AUDIENCE[n.audience]}</td>
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
