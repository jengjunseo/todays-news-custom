"use client";

import { useEffect, useState } from "react";

type CachedDigest = { paperId: string; sourceDate: string; items: Array<{ id: string; category: string; headline: string; oneLine: string }> };

export function OfflineDigest() {
  const [digest, setDigest] = useState<CachedDigest | null>(null);
  useEffect(() => {
    const value = localStorage.getItem("custom-newspaper:last-digest");
    if (value) {
      try { queueMicrotask(() => setDigest(JSON.parse(value) as CachedDigest)); } catch { /* Ignore broken local cache. */ }
    }
  }, []);
  if (!digest) return <p className="lede">연결이 돌아오면 최신 브리핑을 불러옵니다.</p>;
  return (
    <div className="offline-list">
      <p className="lede">마지막으로 저장한 {digest.sourceDate} · {digest.paperId} 신문면입니다.</p>
      {digest.items.map((item) => <article key={item.id}><strong>{item.headline}</strong><p>{item.oneLine}</p></article>)}
    </div>
  );
}
