import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/db/repositories/notification-settings-repository";

type DemoSettings = {
  morning_enabled: boolean;
  morning_time: string;
  perspective_enabled: boolean;
  perspective_time: string;
  evening_enabled: boolean;
  evening_time: string;
  timezone: "Asia/Seoul";
};

const demoGlobal = globalThis as typeof globalThis & { __yesterdayCoreSettings?: DemoSettings };

export function getDemoSettings(): DemoSettings {
  demoGlobal.__yesterdayCoreSettings ??= { ...DEFAULT_NOTIFICATION_SETTINGS };
  return demoGlobal.__yesterdayCoreSettings;
}

export function setDemoSettings(settings: DemoSettings) {
  demoGlobal.__yesterdayCoreSettings = structuredClone(settings);
  return getDemoSettings();
}
