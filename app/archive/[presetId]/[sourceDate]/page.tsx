import Link from "next/link";
import { notFound } from "next/navigation";

import { DigestView } from "@/components/digest-view";
import { requirePageSession } from "@/lib/auth/page-guard";
import { getPublishedDigestBySourceDate } from "@/lib/digest/read-digest";
import { getPreset } from "@/lib/presets";
import { isValidKstDateKey } from "@/lib/time/kst";

const KOREAN_DATE = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

export default async function ArchivedDigestPage({
  params,
}: {
  params: Promise<{ presetId: string; sourceDate: string }>;
}) {
  await requirePageSession();
  const { presetId, sourceDate } = await params;
  const preset = getPreset(presetId);
  if (!preset || !isValidKstDateKey(sourceDate)) notFound();
  const digest = await getPublishedDigestBySourceDate(preset.id, sourceDate);
  if (!digest) notFound();

  return (
    <section className="page-stack today-page" aria-labelledby="archive-digest-title">
      <Link href={`/archive?paper=${preset.id}`} className="save-note">← {preset.displayName} 지난 신문</Link>
      <header className="today-header">
        <div>
          <div className="eyebrow">{preset.displayName} 편집국 · 지난 신문</div>
          <h1 id="archive-digest-title">{KOREAN_DATE.format(new Date(`${digest.sourceDate}T12:00:00+09:00`))}</h1>
        </div>
        <span className="reading-time">약 {digest.readingMinutes}분</span>
      </header>
      <DigestView
        items={digest.items}
        paperId={preset.id}
        sourceDate={digest.sourceDate}
        sections={preset.sections}
        persistAsCurrent={false}
      />
    </section>
  );
}
