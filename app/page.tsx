import { DigestView } from "@/components/digest-view";
import { PresetSelector } from "@/components/preset-selector";
import { requirePageSession } from "@/lib/auth/page-guard";
import { getCurrentDigest } from "@/lib/digest/read-digest";
import { getPresetOrDefault } from "@/lib/presets";
import { isDigestStale } from "@/lib/time/kst";

const KOREAN_DATE = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ paper?: string }>;
}) {
  await requirePageSession();
  const { paper } = await searchParams;
  const preset = getPresetOrDefault(paper);
  const digest = await getCurrentDigest(preset.id);

  if (!digest) {
    return (
      <section className="page-stack" aria-labelledby="today-title">
        <PresetSelector activePresetId={preset.id} />
        <div className="eyebrow">{preset.displayName} 편집국</div>
        <h1 id="today-title">첫 신문면을 준비하고 있어요</h1>
        <p className="lede">발행 작업이 끝나면 미리 생성된 신문이 이곳에 표시됩니다.</p>
      </section>
    );
  }

  const stale = isDigestStale(digest.sourceDate);
  return (
    <section className="page-stack today-page" aria-labelledby="today-title">
      <PresetSelector activePresetId={preset.id} />
      <header className="today-header">
        <div>
          <div className="eyebrow">{preset.displayName} 편집국</div>
          <h1 id="today-title">{KOREAN_DATE.format(new Date(`${digest.sourceDate}T12:00:00+09:00`))} 신문</h1>
        </div>
        <span className="reading-time">약 {digest.readingMinutes}분</span>
      </header>
      <p className="paper-description">{preset.description}</p>
      {stale ? (
        <p className="save-note" role="status">
          최신 면 준비 중 · 현재 {KOREAN_DATE.format(new Date(`${digest.sourceDate}T12:00:00+09:00`))} 발행분 표시
        </p>
      ) : null}
      <DigestView
        items={digest.items}
        paperId={preset.id}
        sourceDate={digest.sourceDate}
        sections={preset.sections}
      />
    </section>
  );
}
