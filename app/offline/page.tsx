import { OfflineDigest } from "@/components/offline-digest";

export default function OfflinePage() {
  return (
    <section className="page-stack" aria-labelledby="offline-title">
      <div className="eyebrow">오프라인</div>
      <h1 id="offline-title">연결이 끊겼어요</h1>
      <OfflineDigest />
    </section>
  );
}
