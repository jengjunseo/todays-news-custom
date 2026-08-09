import { PresetSelector } from "@/components/preset-selector";
import { requirePageSession } from "@/lib/auth/page-guard";
import { getCurrentInsightDigest } from "@/lib/digest/read-digest";
import { getPresetOrDefault } from "@/lib/presets";

const TYPE_LABEL = { morning: "Morning", perspective: "Perspective", evening: "Evening" } as const;
const TIME_LABEL = { morning: "07:30", perspective: "12:40", evening: "18:30" } as const;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ paper?: string }>;
}) {
  await requirePageSession();
  const { paper } = await searchParams;
  const preset = getPresetOrDefault(paper);
  const digest = await getCurrentInsightDigest(preset.id);
  if (!digest) {
    return (
      <section className="page-stack">
        <PresetSelector activePresetId={preset.id} />
        <div className="eyebrow">{preset.displayName} 편집국 · 하루 세 번</div>
        <h1>오늘의 생각</h1>
        <p className="lede">신문면이 발행되면 세 가지 생각거리가 이곳에 도착합니다.</p>
      </section>
    );
  }

  return (
    <section className="page-stack" aria-labelledby="insights-title">
      <PresetSelector activePresetId={preset.id} />
      <div className="eyebrow">{preset.displayName} 편집국 · 하루 세 번</div>
      <h1 id="insights-title">오늘의 생각</h1>
      <p className="lede">같은 신문을 시간에 따라 다른 각도에서 다시 봅니다.</p>
      <div className="insight-list">
        {digest.nudges.map((nudge) => (
          <article key={nudge.id} className="insight-card" id={nudge.type}>
            <div className="insight-meta"><span>{TYPE_LABEL[nudge.type]}</span><time>{TIME_LABEL[nudge.type]}</time></div>
            <h2>{nudge.title}</h2><p>{nudge.insightBody}</p><blockquote>{nudge.question}</blockquote>
          </article>
        ))}
      </div>
    </section>
  );
}
