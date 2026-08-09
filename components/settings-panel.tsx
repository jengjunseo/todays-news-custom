"use client";

import { useEffect, useState } from "react";

import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/db/repositories/notification-settings-repository";
import { PushSettings } from "@/components/push-settings";
import type { SetupDiagnostics } from "@/lib/diagnostics/setup";

type Theme = "system" | "light" | "dark";
type Settings = {
  morning_enabled: boolean;
  morning_time: string;
  perspective_enabled: boolean;
  perspective_time: string;
  evening_enabled: boolean;
  evening_time: string;
  timezone: "Asia/Seoul";
};

export function SettingsPanel({
  vapidPublicKey,
  diagnostics,
}: {
  vapidPublicKey: string;
  diagnostics: SetupDiagnostics;
}) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [theme, setTheme] = useState<Theme>("system");
  const [saved, setSaved] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateMessage, setRegenerateMessage] = useState("");

  useEffect(() => {
    const storedSettings = localStorage.getItem("custom-newspaper:settings");
    const storedTheme = (localStorage.getItem("custom-newspaper:theme") as Theme | null) ?? "system";
    queueMicrotask(() => {
      if (storedSettings) setSettings(JSON.parse(storedSettings) as Settings);
      setTheme(storedTheme);
    });
    applyTheme(storedTheme);
    void fetch("/api/settings")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { settings?: Settings } | null) => {
        if (body?.settings) {
          setSettings(body.settings);
          localStorage.setItem("custom-newspaper:settings", JSON.stringify(body.settings));
        }
      });
  }, []);

  function update(next: Settings) {
    setSettings(next);
    setSaved(false);
    localStorage.setItem("custom-newspaper:settings", JSON.stringify(next));
    void fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).then((response) => setSaved(response.ok));
  }

  function updateTheme(next: Theme) {
    setTheme(next);
    localStorage.setItem("custom-newspaper:theme", next);
    applyTheme(next);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  async function regenerate() {
    setRegenerating(true);
    setRegenerateMessage("");
    const response = await fetch("/api/digest/regenerate", { method: "POST" });
    setRegenerateMessage(response.ok ? "모든 신문면을 다시 생성했습니다." : "재생성에 실패했습니다.");
    setRegenerating(false);
  }

  return (
    <div className="settings-sections">
      <section className="settings-group">
        <h2>Push 알림</h2>
        <PushSettings publicKey={vapidPublicKey} />
      </section>
      <section className="settings-group">
        <h2>알림 시간</h2>
        <NotificationRow label="아침 알림" enabled={settings.morning_enabled} time={settings.morning_time} onChange={(enabled, time) => update({ ...settings, morning_enabled: enabled, morning_time: time })} />
        <NotificationRow label="점심 알림" enabled={settings.perspective_enabled} time={settings.perspective_time} onChange={(enabled, time) => update({ ...settings, perspective_enabled: enabled, perspective_time: time })} />
        <NotificationRow label="저녁 알림" enabled={settings.evening_enabled} time={settings.evening_time} onChange={(enabled, time) => update({ ...settings, evening_enabled: enabled, evening_time: time })} />
        <small className="save-note">{saved ? "설정 저장됨" : "저장 중…"}</small>
      </section>

      <section className="settings-group">
        <h2>테마</h2>
        <div className="segmented" role="group" aria-label="화면 테마">
          {(["system", "light", "dark"] as const).map((value) => (
            <button key={value} type="button" data-active={theme === value} onClick={() => updateTheme(value)}>
              {value === "system" ? "시스템" : value === "light" ? "라이트" : "다크"}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <h2>설정 진단</h2>
        <dl className="diagnostics-list">
          <Diagnostic label="Database" value={diagnostics.database} />
          <Diagnostic label="News API" value={diagnostics.newsApi} />
          <Diagnostic label="AI" value={diagnostics.ai} />
          <Diagnostic label="Push" value={diagnostics.push} />
          <Diagnostic label="Scheduler" value={diagnostics.scheduler} />
          <Diagnostic label="Last digest" value={diagnostics.lastDigest} />
        </dl>
        <button className="secondary-button" type="button" onClick={regenerate} disabled={regenerating}>
          {regenerating ? "다시 생성 중…" : "모든 신문면 다시 생성"}
        </button>
        {regenerateMessage ? <p className="save-note" role="status">{regenerateMessage}</p> : null}
      </section>

      <section className="settings-group">
        <h2>계정</h2>
        <button className="secondary-button" type="button" onClick={logout}>로그아웃</button>
      </section>
    </div>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function NotificationRow({ label, enabled, time, onChange }: { label: string; enabled: boolean; time: string; onChange: (enabled: boolean, time: string) => void }) {
  return (
    <div className="notification-row">
      <label><input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked, time)} /><span>{label}</span></label>
      <input aria-label={`${label} 시간`} type="time" value={time} onChange={(event) => onChange(enabled, event.target.value)} disabled={!enabled} />
    </div>
  );
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme === "system" ? "" : theme;
}
