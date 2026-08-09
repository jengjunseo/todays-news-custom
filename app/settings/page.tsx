import { SettingsPanel } from "@/components/settings-panel";
import { requirePageSession } from "@/lib/auth/page-guard";
import { getSetupDiagnostics } from "@/lib/diagnostics/setup";

export default async function SettingsPage() {
  await requirePageSession();
  const diagnostics = await getSetupDiagnostics();
  return (
    <section className="page-stack" aria-labelledby="settings-title">
      <div className="eyebrow">내 앱 관리</div>
      <h1 id="settings-title">설정</h1>
      <SettingsPanel
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        diagnostics={diagnostics}
      />
    </section>
  );
}
