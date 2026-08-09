import { describe, expect, it } from "vitest";

import { completePreviewSentence } from "@/components/news-card";

describe("collapsed reading preview", () => {
  it("uses only a short completed sentence and skips partial text", () => {
    expect(
      completePreviewSentence(
        "지역 경제를 활성화하고, ...",
        "회사는 다음 달 시범 사업을 시작한다고 밝혔다. 적용 범위는 추후 공개된다.",
      ),
    ).toBe("회사는 다음 달 시범 사업을 시작한다고 밝혔다.");
    expect(completePreviewSentence("고객 신", "“완결되지 않은 인용문입니다.")).toBeNull();
  });
});
