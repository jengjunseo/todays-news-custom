import { Suspense } from "react";

import { BottomNavigation } from "@/components/bottom-navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-frame">
      {process.env.DEMO_MODE === "true" ? <div className="demo-badge">데모 데이터</div> : null}
      <main className="app-main">{children}</main>
      <Suspense fallback={<div className="bottom-nav" aria-hidden="true" />}>
        <BottomNavigation />
      </Suspense>
    </div>
  );
}
