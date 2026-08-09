"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function PushSettings({ publicKey }: { publicKey: string }) {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const available = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    queueMicrotask(() => setSupported(available));
    if (!available) return;
    queueMicrotask(() => setPermission(Notification.permission));
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then(setSubscription);
  }, []);

  async function enable() {
    setMessage("");
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return;
    const registration = await navigator.serviceWorker.ready;
    if (!publicKey) {
      setMessage("데모 알림 권한이 켜졌습니다. VAPID key를 연결하면 Web Push 구독이 활성화됩니다.");
      return;
    }
    const next = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const response = await fetch("/api/push/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next.toJSON()),
    });
    if (!response.ok) throw new Error("구독 저장 실패");
    setSubscription(next);
    setMessage("Web Push 알림이 켜졌습니다.");
  }

  async function disable() {
    if (subscription) {
      await fetch("/api/push/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    setSubscription(null);
    setMessage("알림 구독을 해제했습니다.");
  }

  async function testNotification() {
    const registration = await navigator.serviceWorker.ready;
    if (subscription) {
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      setMessage(response.ok ? "테스트 Push를 보냈습니다." : "테스트 Push 전송에 실패했습니다.");
      return;
    }
    if (Notification.permission === "granted") {
      await registration.showNotification("어제의 편집국 테스트", {
        body: "알림 권한과 서비스 워커가 정상입니다.",
        icon: "/icon-192.png",
        data: { deepLink: "/insights?focus=morning", type: "test" },
      });
      setMessage("기기 테스트 알림을 표시했습니다.");
    }
  }

  if (!supported) return <p className="save-note">이 브라우저는 Web Push를 지원하지 않습니다.</p>;
  const enabled = permission === "granted";
  return (
    <div className="push-settings">
      <div className="status-line"><span>알림 권한</span><strong>{permission === "granted" ? subscription ? "구독됨" : "허용됨" : permission === "denied" ? "차단됨" : "요청 전"}</strong></div>
      <div className="button-stack">
        {enabled ? <button className="secondary-button" type="button" onClick={disable}>알림 끄기</button> : <button className="primary-button" type="button" onClick={enable}>알림 켜기</button>}
        <button className="secondary-button" type="button" onClick={testNotification} disabled={!enabled}>테스트 알림 보내기</button>
      </div>
      {message ? <p className="save-note" role="status">{message}</p> : null}
    </div>
  );
}
