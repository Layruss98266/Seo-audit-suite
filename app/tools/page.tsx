"use client";

import { useState } from "react";
import { Card, PageHeader, HelpSection, StatusPill } from "@/components/ui";
import { ZapIcon, FileTextIcon, ShieldIcon, GlobeIcon } from "@/components/icons";

// These tools are the stateless utilities ported from the SEO-Suite project
// into modules/seo_suite and exposed by api/tools.py. Each panel POSTs
// {action, ...} to /api/tools and renders the JSON result. Kept deliberately
// simple (raw JSON output) — richer visualizations can follow, but this gives
// a working end-to-end surface for every ported tool.

type ToolResult = { ok?: boolean; error?: string; [k: string]: unknown } | null;

async function callTools(body: Record<string, unknown>): Promise<ToolResult> {
  try {
    const res = await fetch("/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ToolResult;
  } catch {
    return { ok: false, error: "Request failed — is the Python API running? (use `vercel dev`)" };
  }
}

function ResultBlock({ result }: { result: ToolResult }) {
  if (!result) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <StatusPill status={result.ok ? "pass" : "fail"} />
        {result.error ? (
          <span className="text-sm text-[var(--seo-danger)]">{String(result.error)}</span>
        ) : null}
      </div>
      <pre className="max-h-96 overflow-auto rounded-lg border border-[var(--seo-border)] bg-[var(--seo-code-bg,var(--seo-card-hover))] p-3 font-[var(--font-jetbrains-mono),monospace] text-xs text-[var(--seo-text)]">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function SchemaGeneratorPanel() {
  const [schemaType, setSchemaType] = useState("faq");
  const [json, setJson] = useState('{\n  "faq_items": [\n    { "question": "What is SEO?", "answer": "Search engine optimization." }\n  ]\n}');
  const [result, setResult] = useState<ToolResult>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(json);
    } catch {
      setResult({ ok: false, error: "Field data is not valid JSON." });
      setBusy(false);
      return;
    }
    setResult(await callTools({ action: "generate-schema", schemaType, data }));
    setBusy(false);
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <FileTextIcon size={18} className="text-[var(--seo-accent)]" />
        <h3 className="text-base font-semibold text-[var(--seo-heading)]">JSON-LD Schema Generator</h3>
      </div>
      <p className="mb-3 text-sm text-[var(--seo-text-light)]">
        Generate structured-data markup. Supported types include article, faq, product, and more.
      </p>
      <label className="mb-1 block text-xs font-medium text-[var(--seo-text-light)]">Schema type</label>
      <input
        value={schemaType}
        onChange={(e) => setSchemaType(e.target.value)}
        className="mb-3 w-full rounded-lg border border-[var(--seo-border)] bg-[var(--seo-input-bg,transparent)] px-3 py-2 text-sm"
        placeholder="faq, article, product…"
      />
      <label className="mb-1 block text-xs font-medium text-[var(--seo-text-light)]">Field data (JSON)</label>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={6}
        className="mb-3 w-full rounded-lg border border-[var(--seo-border)] bg-[var(--seo-input-bg,transparent)] px-3 py-2 font-mono text-xs"
      />
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-lg btn-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Generating…" : "Generate schema"}
      </button>
      <ResultBlock result={result} />
    </Card>
  );
}

function UrlToolPanel({
  title,
  icon,
  action,
  description,
  cta,
}: {
  title: string;
  icon: React.ReactNode;
  action: string;
  description: string;
  cta: string;
}) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ToolResult>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!url.trim()) {
      setResult({ ok: false, error: "Enter a URL." });
      return;
    }
    setBusy(true);
    setResult(await callTools({ action, url: url.trim() }));
    setBusy(false);
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-base font-semibold text-[var(--seo-heading)]">{title}</h3>
      </div>
      <p className="mb-3 text-sm text-[var(--seo-text-light)]">{description}</p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && run()}
        className="mb-3 w-full rounded-lg border border-[var(--seo-border)] bg-[var(--seo-input-bg,transparent)] px-3 py-2 text-sm"
        placeholder="https://example.com/page"
      />
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-lg btn-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Running…" : cta}
      </button>
      <ResultBlock result={result} />
    </Card>
  );
}

export default function ToolsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO Tools"
        subtitle="Stateless utilities ported from SEO-Suite: generators, validators, and research."
        icon={<ZapIcon size={22} className="text-[var(--seo-accent)]" />}
      />

      <HelpSection title="About these tools">
        These utilities run as a single Python serverless function (<code>api/tools.py</code>). They are
        stateless — no login, no database. Keyword research additionally needs DataForSEO credentials
        (<code>DATAFORSEO_LOGIN</code> / <code>DATAFORSEO_PASSWORD</code>) set as environment variables.
      </HelpSection>

      <div className="grid gap-6 md:grid-cols-2">
        <SchemaGeneratorPanel />
        <UrlToolPanel
          title="Structured Data Validator"
          icon={<ShieldIcon size={18} className="text-[var(--seo-accent)]" />}
          action="validate-schema"
          description="Fetch a URL and validate its JSON-LD structured data for missing required fields."
          cta="Validate URL"
        />
        <UrlToolPanel
          title="Page-Type Detector"
          icon={<GlobeIcon size={18} className="text-[var(--seo-accent)]" />}
          action="page-type"
          description="Classify a page (article, product, category, homepage…) from its markup and URL."
          cta="Detect page type"
        />
      </div>
    </div>
  );
}
