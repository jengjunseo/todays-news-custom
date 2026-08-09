"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { DigestItemWithSources } from "@/lib/demo/digest";

function hasBalancedQuotes(value: string) {
  const pairs = [
    ["“", "”"],
    ["‘", "’"],
    ["「", "」"],
    ["『", "』"],
  ] as const;
  return (
    (value.match(/"/g)?.length ?? 0) % 2 === 0 &&
    pairs.every(
      ([open, close]) => value.split(open).length === value.split(close).length,
    )
  );
}

export function completePreviewSentence(...values: string[]) {
  for (const value of values) {
    const sentences = value
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?。]+[.!?。]+(?:["”’」』])?/g) ?? [];
    const sentence = sentences
      .map((candidate) => candidate.trim())
      .find(
        (candidate) =>
          candidate.length <= 180 &&
          !candidate.includes("...") &&
          !candidate.includes("…") &&
          hasBalancedQuotes(candidate),
      );
    if (sentence) return sentence;
  }
  return null;
}

export function NewsCard({
  item,
  paperId,
  categoryLabel,
  read,
  expanded,
  onToggle,
}: {
  item: DigestItemWithSources;
  paperId: string;
  categoryLabel: string;
  read: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [reflection, setReflection] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hydrated = useRef(false);
  const cardRef = useRef<HTMLElement>(null);
  const wasExpanded = useRef(expanded);
  const draftKey = `custom-newspaper:reflection:${paperId}:${item.id}`;
  const oneLinePreview = completePreviewSentence(item.oneLine, item.overview);
  const whyPreview = completePreviewSentence(item.whyItMatters);

  useLayoutEffect(() => {
    const justOpened = expanded && !wasExpanded.current;
    wasExpanded.current = expanded;
    if (!justOpened) return;

    const frame = requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  useEffect(() => {
    const stored = localStorage.getItem(draftKey) ?? "";
    queueMicrotask(() => {
      setReflection(stored);
      hydrated.current = true;
    });
  }, [draftKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem(draftKey, reflection);
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      const response = await fetch("/api/reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestItemId: item.id, content: reflection }),
      }).catch(() => null);
      setSaveState(response?.ok ? "saved" : "error");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draftKey, item.id, reflection]);

  return (
    <article ref={cardRef} className="news-card" data-expanded={expanded}>
      <button className="news-card__summary" type="button" onClick={onToggle} aria-expanded={expanded}>
        <span className="card-meta">
          <span className="category-pill">{categoryLabel}</span>
          {read ? <span className="read-mark">읽음</span> : null}
        </span>
        <strong>{item.headline}</strong>
        {oneLinePreview ? <span className="card-one-line">{oneLinePreview}</span> : null}
        {whyPreview ? <span className="card-why">{whyPreview}</span> : null}
        <span className="expand-label">{expanded ? "접기" : "자세히 읽기"}</span>
      </button>

      {expanded ? (
        <div className="news-card__details">
          <Detail title="무슨 일이 있었나"><p>{item.overview}</p></Detail>
          <Detail title="핵심">
            <ul>{item.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul>
          </Detail>
          <Detail title="쉽게 보면"><p>{item.analogy}</p></Detail>
          <Detail title="왜 중요할까"><p>{item.whyItMatters}</p></Detail>
          <Detail title="생각해보기"><p className="question-copy">{item.socraticQuestion}</p></Detail>

          <label className="reflection-field">
            <span>내 생각</span>
            <textarea
              value={reflection}
              onChange={(event) => setReflection(event.target.value.slice(0, 5000))}
              maxLength={5000}
              rows={4}
              placeholder="두세 문장으로 생각을 남겨보세요."
            />
            <small>
              {reflection.length} / 5000 · {saveState === "saving" ? "저장 중" : saveState === "error" ? "기기에 임시 보관됨" : saveState === "saved" ? "저장됨" : "자동 저장"}
            </small>
          </label>

          <div className="source-block">
            <h3>출처</h3>
            <ul>
              {item.sources.map((source) => (
                <li key={`${item.id}-${source.id}`}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    <span>{source.publisher}{source.isOfficial ? " · 공식" : ""}</span>
                    <small>{source.title}</small>
                  </a>
                </li>
              ))}
            </ul>
            <p className="fact-line">사실 상태 {item.factStatus} · 신뢰도 {Math.round(item.confidence * 100)}%</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Detail({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3>{children}</section>;
}
