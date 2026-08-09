"use client";

import { useEffect, useMemo, useState } from "react";

import { NewsCard } from "@/components/news-card";
import type { DigestItemWithSources } from "@/lib/demo/digest";

const LEGACY_READ_STORAGE_KEY = "yesterday-core:read";

export function readStorageKey(paperIdOrSourceDate: string, maybeSourceDate?: string) {
  const paperId = maybeSourceDate ? paperIdOrSourceDate : "legacy";
  const sourceDate = maybeSourceDate ?? paperIdOrSourceDate;
  return `custom-newspaper:read:${paperId}:${sourceDate}`;
}

export function completionStorageKey(paperIdOrSourceDate: string, maybeSourceDate?: string) {
  const paperId = maybeSourceDate ? paperIdOrSourceDate : "legacy";
  const sourceDate = maybeSourceDate ?? paperIdOrSourceDate;
  return `custom-newspaper:completion:${paperId}:${sourceDate}`;
}

function parsedStoredIds(value: string | null) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function loadScopedReadIds(storage: Storage, paperIdOrSourceDate: string, sourceDateOrItemIds: string | string[], maybeItemIds?: string[]) {
  const paperId = maybeItemIds ? paperIdOrSourceDate : "legacy";
  const sourceDate = maybeItemIds ? sourceDateOrItemIds as string : paperIdOrSourceDate;
  const itemIds = maybeItemIds ?? sourceDateOrItemIds as string[];
  const key = readStorageKey(paperId, sourceDate);
  const stored = storage.getItem(key);
  const candidates = parsedStoredIds(stored ?? storage.getItem(LEGACY_READ_STORAGE_KEY));
  const allowed = new Set(itemIds);
  const scoped = [...new Set(candidates.filter((id) => allowed.has(id)))];
  storage.setItem(key, JSON.stringify(scoped));
  return new Set(scoped);
}

export function completesDigest(readIds: Set<string>, nextId: string, itemIds: string[]) {
  return (
    itemIds.length > 0 &&
    !readIds.has(nextId) &&
    itemIds.every((id) => id === nextId || readIds.has(id))
  );
}

export function DigestView({
  items,
  paperId,
  sourceDate,
  sections,
  persistAsCurrent = true,
}: {
  items: DigestItemWithSources[];
  paperId: string;
  sourceDate: string;
  sections: Array<{ id: string; label: string }>;
  persistAsCurrent?: boolean;
}) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [readStateReady, setReadStateReady] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const scopedReadKey = readStorageKey(paperId, sourceDate);
  const scopedCompletionKey = completionStorageKey(paperId, sourceDate);

  useEffect(() => {
    const stored = loadScopedReadIds(localStorage, paperId, sourceDate, itemIds);
    queueMicrotask(() => {
      setReadIds(stored);
      setReadStateReady(true);
      setExpandedId(null);
      setShowCelebration(false);
    });
  }, [itemIds, paperId, sourceDate]);

  useEffect(() => {
    if (!persistAsCurrent) return;
    localStorage.setItem(
      "custom-newspaper:last-digest",
      JSON.stringify({
        paperId,
        sourceDate,
        items: items.map((item) => ({ id: item.id, category: item.category, headline: item.headline, oneLine: item.oneLine })),
      }),
    );
    localStorage.setItem("custom-newspaper:last-paper", paperId);
  }, [items, paperId, persistAsCurrent, sourceDate]);

  useEffect(() => {
    if (!showCelebration) return;
    const timer = window.setTimeout(() => setShowCelebration(false), 3000);
    return () => window.clearTimeout(timer);
  }, [showCelebration]);

  const readCount = itemIds.filter((id) => readIds.has(id)).length;
  const progress = items.length === 0 ? 0 : Math.round((readCount / items.length) * 100);
  const grouped = useMemo(
    () =>
      sections.map(({ id: category, label }) => ({
        category,
        label,
        items: items.filter((item) => item.category === category),
      })),
    [items, sections],
  );

  function markRead(id: string) {
    if (readIds.has(id)) return;
    const shouldCelebrate =
      readStateReady &&
      persistAsCurrent &&
      completesDigest(readIds, id, itemIds) &&
      localStorage.getItem(scopedCompletionKey) !== "seen";
    const next = new Set(readIds).add(id);
    setReadIds(next);
    localStorage.setItem(scopedReadKey, JSON.stringify([...next]));
    if (shouldCelebrate) {
      localStorage.setItem(scopedCompletionKey, "seen");
      setShowCelebration(true);
    }
    void fetch("/api/read-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digestItemId: id }),
    });
  }

  function toggleItem(id: string, read: boolean) {
    const willOpen = expandedId !== id;
    setExpandedId(willOpen ? id : null);
    if (willOpen && !read) markRead(id);
  }

  return (
    <>
      <section className="progress-block" aria-label={`읽기 진행률 ${progress}%`}>
        <div className="progress-meta">
          <span>오늘 읽기</span>
          <span>{readCount} / {items.length}</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-value" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <div className="category-list">
        {grouped.map((group) =>
          group.items.length ? (
            <section key={group.category} className="category-section" aria-labelledby={`category-${group.category}`}>
              <h2 id={`category-${group.category}`}>{group.label}</h2>
              <div className="news-list">
                {group.items.map((item) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    paperId={paperId}
                    categoryLabel={group.label}
                    read={readIds.has(item.id)}
                    expanded={expandedId === item.id}
                    onToggle={() => toggleItem(item.id, readIds.has(item.id))}
                  />
                ))}
              </div>
            </section>
          ) : null,
        )}
      </div>

      {showCelebration ? (
        <div className="completion-celebration" role="status" aria-live="polite">
          <span aria-hidden="true">✦</span>
          <strong>이 신문면을 모두 읽었습니다</strong>
        </div>
      ) : null}
    </>
  );
}
