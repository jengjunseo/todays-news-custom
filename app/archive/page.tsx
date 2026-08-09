import Link from "next/link";

import { PresetSelector } from "@/components/preset-selector";
import { requirePageSession } from "@/lib/auth/page-guard";
import { listPublishedDigests } from "@/lib/digest/read-digest";
import { getPresetOrDefault } from "@/lib/presets";

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ paper?: string }>;
}) {
  await requirePageSession();
  const { paper } = await searchParams;
  const preset = getPresetOrDefault(paper);
  const digests = await listPublishedDigests(preset.id);
  return (
    <section className="page-stack" aria-labelledby="archive-title">
      <PresetSelector activePresetId={preset.id} />
      <div className="eyebrow">{preset.displayName} 편집국 · 날짜별 기록</div>
      <h1 id="archive-title">지난 신문</h1>
      <p className="lede">이 신문면의 발행분만 날짜 순으로 다시 봅니다.</p>
      <div className="archive-list">
        {digests.map((digest) => (
          <Link href={`/archive/${preset.id}/${digest.sourceDate}`} className="archive-row" key={digest.id}>
            <span><strong>{digest.sourceDate}</strong><small>{digest.itemCount}개 핵심 · 약 {digest.readingMinutes}분</small></span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
