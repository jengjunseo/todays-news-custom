import { describe, expect, it, vi } from "vitest";

import { collectPresetEvidence } from "@/lib/editorial/collect-evidence";
import { normalizeEvidence } from "@/lib/editorial/normalize-evidence";
import { scoreEvidenceRelevance } from "@/lib/editorial/relevance";
import { evaluateSubjectIdentity } from "@/lib/editorial/subject-identity";
import { EvidenceDocumentSchema, type DiscoveryProvider, type RawEvidenceCandidate } from "@/lib/editorial/types";
import { girlsBandCryPreset } from "@/lib/presets/girls-band-cry";
import { wonjuPreset } from "@/lib/presets/wonju";

const sourceDate = "2026-08-01";
const route = girlsBandCryPreset.discovery.find((candidate) => candidate.id === "gbc-music")!;

function candidate(input: Partial<RawEvidenceCandidate> = {}): RawEvidenceCandidate {
  return {
    title: "i-dle 미연, 일본 첫 오리지널 디지털 싱글 RUN AWAY 발매",
    identityLead: "미연이 일본에서 첫 오리지널 디지털 싱글을 발표하고 활동 일정을 공개했습니다.",
    excerpt: "미연의 신곡과 인터뷰 소식입니다. 추천 기사: 걸즈 밴드 크라이 신곡 라이브 발표.",
    url: "https://entertainment.example/miyeon-run-away",
    providerUrl: "https://exa.example/miyeon-run-away",
    publisher: "Entertainment Example",
    publishedAt: new Date("2026-08-01T03:00:00.000Z"),
    language: "ko",
    sourceType: "news",
    ...input,
  };
}

function decision(raw: RawEvidenceCandidate, provider = "exa") {
  return evaluateSubjectIdentity({ candidate: raw, preset: girlsBandCryPreset, route, provider });
}

describe("binary subject identity gate", () => {
  it("rejects Miyeon even when peripheral Girls Band Cry text would pass additive relevance", async () => {
    const raw = candidate();
    expect(decision(raw)).toEqual({ accepted: false, proof: "missing-subject" });

    const normalized = EvidenceDocumentSchema.parse(normalizeEvidence({
      raw,
      preset: girlsBandCryPreset,
      route,
      query: route.queries[0]!,
      provider: "exa",
      sourceDate,
    }));
    expect(scoreEvidenceRelevance(girlsBandCryPreset, route, normalized).accepted).toBe(true);

    const provider = {
      name: "exa",
      channels: ["web-search"],
      search: vi.fn().mockResolvedValue([raw]),
    } satisfies DiscoveryProvider;
    await expect(collectPresetEvidence({ preset: girlsBandCryPreset, sourceDate, providers: [provider] }))
      .resolves.toEqual([]);
  });

  it("rejects aespa when Girls Band Cry exists only in recommendation text", () => {
    const raw = candidate({
      title: "aespa, 2026-27 SYNK : COMPLaeXITY 서울 공연 개최",
      identityLead: "aespa가 고척스카이돔에서 3만5천 명 규모의 서울 공연을 열었습니다.",
      excerpt: "aespa의 공연과 투어 소식입니다. 관련 추천: トゲナシトゲアリ ライブ 인터뷰.",
      url: "https://entertainment.example/aespa-complexity",
      providerUrl: "https://exa.example/aespa-complexity",
    });

    expect(decision(raw)).toEqual({ accepted: false, proof: "missing-subject" });
  });

  it("accepts a primary subject in the title", () => {
    expect(decision(candidate({
      title: "ガールズバンドクライ、新曲の配信日を発表",
      identityLead: "新曲の配信日と参加メンバーが公開されました。",
    }))).toEqual({ accepted: true, proof: "primary-title" });
  });

  it("accepts the Preset-owned high-specificity associated identity in the lead", () => {
    expect(decision(candidate({
      title: "新たなキャラクタービジュアルを公開",
      identityLead: "井芹仁菜の新たなビジュアルと担当スタッフのコメントが公開されました。",
      excerpt: "新たなビジュアルと制作情報が公式に公開されました。",
    }))).toEqual({ accepted: true, proof: "associated-lead" });
  });

  it("trusts only the validated direct official lane and leaves Wonju unchanged", () => {
    const officialRoute = girlsBandCryPreset.discovery.find((candidate) => candidate.channel === "official-feed")!;
    expect(evaluateSubjectIdentity({
      candidate: candidate({
        title: "新着情報",
        url: "https://girls-band-cry.com/news/post-488.html",
        providerUrl: "https://girls-band-cry.com/news/post-488.html",
        sourceType: "official",
      }),
      preset: girlsBandCryPreset,
      route: officialRoute,
      provider: "official-source",
    })).toEqual({ accepted: true, proof: "official-source" });

    expect(evaluateSubjectIdentity({
      candidate: candidate({ title: "강원 교통 소식", identityLead: undefined }),
      preset: wonjuPreset,
      route: wonjuPreset.discovery[0]!,
      provider: "naver",
    })).toEqual({ accepted: true, proof: "not-required" });
  });
});
