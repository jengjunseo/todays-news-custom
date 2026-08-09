import Link from "next/link";

import { NEWSPAPER_PRESETS } from "@/lib/presets";

export function PresetSelector({ activePresetId }: { activePresetId: string }) {
  return (
    <nav className="preset-selector" aria-label="신문면 선택">
      {NEWSPAPER_PRESETS.map((preset) => (
        <Link
          key={preset.id}
          href={`/?paper=${preset.id}`}
          data-active={preset.id === activePresetId}
          aria-current={preset.id === activePresetId ? "page" : undefined}
        >
          {preset.displayName}
        </Link>
      ))}
    </nav>
  );
}
