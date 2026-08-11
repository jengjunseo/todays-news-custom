import { runDailyDigest } from "@/lib/pipeline/run-daily-digest";

export const runtime = "nodejs";
export const maxDuration = 300;

function previewOnly() {
  return process.env.VERCEL_ENV === "preview";
}

export function GET() {
  if (!previewOnly()) return new Response("Not found", { status: 404 });
  return new Response(
    `<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width"><title>GBC Preview Verification</title><body><main><h1>GBC Preview Verification</h1><form method="post"><button type="submit">Run Girls Band Cry generation</button></form></main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function POST() {
  if (!previewOnly()) return new Response("Not found", { status: 404 });
  const startedAt = Date.now();
  console.log(JSON.stringify({ stage: "preview_live_verification_started", presetId: "girls-band-cry" }));
  try {
    const result = await runDailyDigest({ presetId: "girls-band-cry", force: true });
    console.log(JSON.stringify({
      stage: "preview_live_verification_completed",
      presetId: "girls-band-cry",
      status: result.status,
      sourceDate: result.sourceDate,
      elapsedMs: Date.now() - startedAt,
    }));
    return Response.json({ result });
  } catch (error) {
    console.error(JSON.stringify({
      stage: "preview_live_verification_failed",
      presetId: "girls-band-cry",
      errorType: error instanceof Error ? error.name : typeof error,
      elapsedMs: Date.now() - startedAt,
    }));
    return Response.json(
      { error: error instanceof Error ? error.message : "unknown live verification error" },
      { status: 500 },
    );
  }
}
