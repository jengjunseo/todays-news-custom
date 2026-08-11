import { getCurrentDigest } from "@/lib/digest/read-digest";
import { buildExaSearchRequest } from "@/lib/editorial/providers/exa";
import { hasTitleSubjectIdentity } from "@/lib/editorial/subject-identity";
import { getPreset } from "@/lib/presets";

export const runtime = "nodejs";
export const maxDuration = 300;

function previewOnly() {
  return process.env.VERCEL_ENV === "preview";
}

type ExaResult = { title?: string | null; url?: string | null };

function summarizeResults(results: ExaResult[], preset: NonNullable<ReturnType<typeof getPreset>>) {
  return results.map((result) => {
    let domain = "invalid-url";
    try {
      domain = new URL(result.url ?? "").hostname.replace(/^www\./, "");
    } catch {}
    const title = result.title?.trim() || "(untitled)";
    return { title, domain, titleIdentityPass: hasTitleSubjectIdentity(preset, title) };
  });
}

async function runReadOnlyBakeoff() {
  const preset = getPreset("girls-band-cry");
  if (!preset) throw new Error("Girls Band Cry preset missing");
  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) throw new Error("EXA_API_KEY is not configured");
  const routes = preset.discovery.filter((route) => ["gbc-music", "gbc-live"].includes(route.id));
  const cases = routes.map((route) => ({
    route,
    query: route.queries[1] ?? route.queries[0]!,
  }));
  const variants = ["baseline", "include-text", "include-text-news"] as const;
  const rows = [];
  for (const { route, query } of cases) {
    const precise = buildExaSearchRequest({ preset, route, query, sourceDate: "2026-08-10" });
    for (const variant of variants) {
      const body = { ...precise } as Record<string, unknown>;
      if (variant === "baseline") delete body.includeText;
      if (variant === "include-text-news") body.category = "news";
      const startedAt = Date.now();
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Exa bake-off failed (${response.status})`);
      const payload = await response.json() as { results?: ExaResult[] };
      const results = summarizeResults(payload.results ?? [], preset);
      rows.push({
        routeId: route.id,
        variant,
        includeText: body.includeText ?? null,
        category: body.category ?? null,
        resultCount: results.length,
        titleIdentityPassCount: results.filter((result) => result.titleIdentityPass).length,
        projectedLeadVerificationCount: results.filter((result) => !result.titleIdentityPass).length,
        elapsedMs: Date.now() - startedAt,
        results,
      });
    }
  }
  return rows;
}

export async function GET(request: Request) {
  if (!previewOnly()) return new Response("Not found", { status: 404 });
  if (new URL(request.url).searchParams.get("output") === "digest") {
    return Response.json({ digest: await getCurrentDigest("girls-band-cry") });
  }
  return new Response(
    `<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width"><title>GBC Preview Verification</title><body><main><h1>GBC Preview Verification</h1><p><a href="?output=digest">Inspect current published digest</a></p><form method="post"><button name="action" value="bakeoff" type="submit">Run read-only Exa bake-off</button></form></main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!previewOnly()) return new Response("Not found", { status: 404 });
  const formData = await request.formData();
  if (formData.get("action") !== "bakeoff") return new Response("Bad request", { status: 400 });
  const startedAt = Date.now();
  console.log(JSON.stringify({ stage: "preview_exa_bakeoff_started", presetId: "girls-band-cry" }));
  try {
    const rows = await runReadOnlyBakeoff();
    console.log(JSON.stringify({
      stage: "preview_exa_bakeoff_completed",
      presetId: "girls-band-cry",
      elapsedMs: Date.now() - startedAt,
      rows: rows.map(({ results, ...row }) => row),
    }));
    return Response.json({ sourceDate: "2026-08-10", rows });
  } catch (error) {
    console.error(JSON.stringify({
      stage: "preview_exa_bakeoff_failed",
      presetId: "girls-band-cry",
      errorType: error instanceof Error ? error.name : typeof error,
      elapsedMs: Date.now() - startedAt,
    }));
    return Response.json({ error: error instanceof Error ? error.message : "unknown bake-off error" }, { status: 500 });
  }
}
