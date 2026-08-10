export const DEFAULT_NOTIFICATION_SETTINGS = {
  morning_enabled: true,
  morning_time: "07:30",
  perspective_enabled: true,
  perspective_time: "12:40",
  evening_enabled: true,
  evening_time: "18:30",
  timezone: "Asia/Seoul",
} as const;

export type NotificationSettings = {
  morning_enabled: boolean;
  morning_time: string;
  perspective_enabled: boolean;
  perspective_time: string;
  evening_enabled: boolean;
  evening_time: string;
  timezone: "Asia/Seoul";
};
