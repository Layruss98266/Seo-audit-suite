"use client";

import { useState } from "react";
import { Card, PageHeader, HelpSection, StatusPill } from "@/components/ui";
import {
  ZapIcon,
  FileTextIcon,
  ShieldIcon,
  GlobeIcon,
  MapIcon,
  KeyIcon,
  NetworkIcon,
  CopyIcon,
  CheckIcon,
} from "@/components/icons";

// Every tool here is backed by the ported SEO-Suite code in modules/seo_suite,
// exposed by the single api/tools.py serverless function via {action, ...}.
// Panels are grouped into Generators (build markup), Analyzers (inspect a URL),
// and Research (DataForSEO). Results render as raw JSON — deliberately simple.

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
    return { ok: false, error: "Request failed — the Python API only runs under `vercel dev` or on Vercel, not plain `next dev`." };
  }
}

const INPUT_CLS =
  "w-full rounded-lg border border-[var(--seo-border)] bg-[var(--seo-input-bg)] px-3 py-2 text-sm transition-colors focus:border-[var(--seo-accent-border)] focus:outline-none";
const LABEL_CLS = "mb-1 block text-xs font-medium text-[var(--seo-text-light)]";
const BTN_CLS =
  "rounded-lg btn-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md border border-[var(--seo-border)] px-2 py-1 text-xs font-medium text-[var(--seo-text-light)] transition-colors hover:border-[var(--seo-border-strong)] hover:text-[var(--seo-heading)]"
    >
      {copied ? <CheckIcon size={12} className="text-[var(--seo-success)]" /> : <CopyIcon size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

type KeywordRow = {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  keywordDifficulty: number | null;
  intent: string | null;
};

function KeywordResultTable({ rows }: { rows: KeywordRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--seo-muted)]">No keyword rows returned.</p>;
  }
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-[var(--seo-border)]">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-[var(--table-header-bg)] text-[var(--seo-muted)]">
          <tr>
            <th className="px-3 py-2 font-semibold">Keyword</th>
            <th className="px-3 py-2 font-semibold">Volume</th>
            <th className="px-3 py-2 font-semibold">Difficulty</th>
            <th className="px-3 py-2 font-semibold">CPC</th>
            <th className="px-3 py-2 font-semibold">Competition</th>
            <th className="px-3 py-2 font-semibold">Intent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.keyword}-${i}`} className="border-t border-[var(--table-row-border)] hover:bg-[var(--table-row-hover)]">
              <td className="px-3 py-2 font-medium text-[var(--seo-subheading)]">{row.keyword}</td>
              <td className="px-3 py-2 tabular-nums text-[var(--seo-text)]">{row.searchVolume ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums text-[var(--seo-text)]">{row.keywordDifficulty ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums text-[var(--seo-text)]">{row.cpc != null ? `$${row.cpc.toFixed(2)}` : "—"}</td>
              <td className="px-3 py-2 tabular-nums text-[var(--seo-text)]">{row.competition != null ? row.competition.toFixed(2) : "—"}</td>
              <td className="px-3 py-2 capitalize text-[var(--seo-text)]">{row.intent ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isKeywordRows(rows: unknown): rows is KeywordRow[] {
  return Array.isArray(rows) && rows.every((r) => r && typeof r === "object" && "keyword" in r);
}

function ResultBlock({ result }: { result: ToolResult }) {
  if (!result) return null;
  const json = JSON.stringify(result, null, 2);
  const rows = result.ok ? result.rows : undefined;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusPill status={result.ok ? "pass" : "fail"} />
          {result.error ? (
            <span className="text-sm text-[var(--seo-error)]">{String(result.error)}</span>
          ) : null}
        </div>
        <CopyButton text={json} />
      </div>
      {isKeywordRows(rows) ? (
        <KeywordResultTable rows={rows} />
      ) : (
        <pre className="max-h-96 overflow-auto rounded-lg border border-[var(--seo-border)] bg-[var(--seo-code-bg)] p-3 font-[var(--font-jetbrains-mono),monospace] text-xs text-[var(--seo-text)]">
          {json}
        </pre>
      )}
    </div>
  );
}

function PanelShell({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-base font-semibold text-[var(--seo-heading)]">{title}</h3>
      </div>
      <p className="mb-3 text-sm text-[var(--seo-text-light)]">{description}</p>
      {children}
    </Card>
  );
}

/** Small hook: run an action, track busy + result. */
function useToolRun() {
  const [result, setResult] = useState<ToolResult>(null);
  const [busy, setBusy] = useState(false);
  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setResult(await callTools(body));
    setBusy(false);
  }
  return { result, busy, run, setResult };
}

// ── Generators ──────────────────────────────────────────────────────────────

function SchemaGeneratorPanel() {
  const [schemaType, setSchemaType] = useState("faq");
  const [json, setJson] = useState(
    '{\n  "faq_items": [\n    { "question": "What is SEO?", "answer": "Search engine optimization." }\n  ]\n}',
  );
  const { result, busy, run, setResult } = useToolRun();

  function submit() {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(json);
    } catch {
      setResult({ ok: false, error: "Field data is not valid JSON." });
      return;
    }
    run({ action: "generate-schema", schemaType, data });
  }

  return (
    <PanelShell
      title="JSON-LD Schema Generator"
      icon={<FileTextIcon size={18} className="text-[var(--seo-accent)]" />}
      description="Generate structured-data markup. Types include article, faq, product, event, recipe, and more."
    >
      <label className={LABEL_CLS}>Schema type</label>
      <input value={schemaType} onChange={(e) => setSchemaType(e.target.value)} className={`${INPUT_CLS} mb-3`} placeholder="faq, article, product…" />
      <label className={LABEL_CLS}>Field data (JSON)</label>
      <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={6} className={`${INPUT_CLS} mb-3 font-mono`} />
      <button type="button" onClick={submit} disabled={busy} className={BTN_CLS}>
        {busy ? "Generating…" : "Generate schema"}
      </button>
      <ResultBlock result={result} />
    </PanelShell>
  );
}

function MetaTagsPanel() {
  const [f, setF] = useState({ title: "", description: "", keywords: "", canonical: "", og_image: "", og_site_name: "" });
  const { result, busy, run } = useToolRun();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <PanelShell
      title="Meta Tags Generator"
      icon={<FileTextIcon size={18} className="text-[var(--seo-accent)]" />}
      description="Build title, meta description, canonical, and Open Graph / Twitter card tags."
    >
      <label className={LABEL_CLS}>Title</label>
      <input value={f.title} onChange={set("title")} className={`${INPUT_CLS} mb-3`} placeholder="Page title" />
      <label className={LABEL_CLS}>Description</label>
      <textarea value={f.description} onChange={set("description")} rows={2} className={`${INPUT_CLS} mb-3`} placeholder="Meta description" />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>Canonical URL</label>
          <input value={f.canonical} onChange={set("canonical")} className={INPUT_CLS} placeholder="https://…" />
        </div>
        <div>
          <label className={LABEL_CLS}>OG image URL</label>
          <input value={f.og_image} onChange={set("og_image")} className={INPUT_CLS} placeholder="https://…/og.png" />
        </div>
        <div>
          <label className={LABEL_CLS}>Keywords</label>
          <input value={f.keywords} onChange={set("keywords")} className={INPUT_CLS} placeholder="seo, audit" />
        </div>
        <div>
          <label className={LABEL_CLS}>Site name</label>
          <input value={f.og_site_name} onChange={set("og_site_name")} className={INPUT_CLS} placeholder="My Site" />
        </div>
      </div>
      <button type="button" onClick={() => run({ action: "generate-meta", data: f })} disabled={busy} className={BTN_CLS}>
        {busy ? "Generating…" : "Generate meta tags"}
      </button>
      <ResultBlock result={result} />
    </PanelShell>
  );
}

function RobotsPanel() {
  const [userAgent, setUserAgent] = useState("*");
  const [disallow, setDisallow] = useState("/admin\n/private");
  const [allow, setAllow] = useState("");
  const [sitemap, setSitemap] = useState("");
  const { result, busy, run } = useToolRun();

  function submit() {
    const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
    run({
      action: "generate-robots",
      data: {
        rules: [{ user_agent: userAgent || "*", disallow: lines(disallow), allow: lines(allow) }],
        sitemap: sitemap.trim() || undefined,
      },
    });
  }

  return (
    <PanelShell
      title="robots.txt Generator"
      icon={<ShieldIcon size={18} className="text-[var(--seo-accent)]" />}
      description="Produce a robots.txt from a user-agent, disallow/allow paths, and an optional sitemap URL."
    >
      <label className={LABEL_CLS}>User-agent</label>
      <input value={userAgent} onChange={(e) => setUserAgent(e.target.value)} className={`${INPUT_CLS} mb-3`} placeholder="*" />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>Disallow (one path per line)</label>
          <textarea value={disallow} onChange={(e) => setDisallow(e.target.value)} rows={4} className={`${INPUT_CLS} font-mono`} />
        </div>
        <div>
          <label className={LABEL_CLS}>Allow (one path per line)</label>
          <textarea value={allow} onChange={(e) => setAllow(e.target.value)} rows={4} className={`${INPUT_CLS} font-mono`} />
        </div>
      </div>
      <label className={LABEL_CLS}>Sitemap URL (optional)</label>
      <input value={sitemap} onChange={(e) => setSitemap(e.target.value)} className={`${INPUT_CLS} mb-3`} placeholder="https://example.com/sitemap.xml" />
      <button type="button" onClick={submit} disabled={busy} className={BTN_CLS}>
        {busy ? "Generating…" : "Generate robots.txt"}
      </button>
      <ResultBlock result={result} />
    </PanelShell>
  );
}

function SitemapPanel() {
  const [urls, setUrls] = useState("https://example.com/\nhttps://example.com/about");
  const { result, busy, run } = useToolRun();

  function submit() {
    const list = urls.split("\n").map((l) => l.trim()).filter(Boolean);
    run({ action: "generate-sitemap", data: { urls: list } });
  }

  return (
    <PanelShell
      title="XML Sitemap Generator"
      icon={<MapIcon size={18} className="text-[var(--seo-accent)]" />}
      description="Turn a list of URLs (one per line) into a valid sitemap.xml."
    >
      <label className={LABEL_CLS}>URLs (one per line)</label>
      <textarea value={urls} onChange={(e) => setUrls(e.target.value)} rows={6} className={`${INPUT_CLS} mb-3 font-mono`} />
      <button type="button" onClick={submit} disabled={busy} className={BTN_CLS}>
        {busy ? "Generating…" : "Generate sitemap"}
      </button>
      <ResultBlock result={result} />
    </PanelShell>
  );
}

function HreflangPanel() {
  const [lines, setLines] = useState("en-us, https://example.com/\nfr-fr, https://example.com/fr/");
  const { result, busy, run } = useToolRun();

  function submit() {
    const items = lines
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [locale, url] = l.split(",").map((s) => s.trim());
        return { locale, url };
      });
    run({ action: "generate-hreflang", data: { items } });
  }

  return (
    <PanelShell
      title="Hreflang Tag Generator"
      icon={<NetworkIcon size={18} className="text-[var(--seo-accent)]" />}
      description="Generate hreflang link tags. One 'locale, url' pair per line (e.g. en-us, https://…)."
    >
      <label className={LABEL_CLS}>Locale, URL (one per line)</label>
      <textarea value={lines} onChange={(e) => setLines(e.target.value)} rows={5} className={`${INPUT_CLS} mb-3 font-mono`} />
      <button type="button" onClick={submit} disabled={busy} className={BTN_CLS}>
        {busy ? "Generating…" : "Generate hreflang"}
      </button>
      <ResultBlock result={result} />
    </PanelShell>
  );
}

// ── Analyzers (URL-based) ───────────────────────────────────────────────────

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
  const { result, busy, run, setResult } = useToolRun();

  function submit() {
    if (!url.trim()) {
      setResult({ ok: false, error: "Enter a URL." });
      return;
    }
    run({ action, url: url.trim() });
  }

  return (
    <PanelShell title={title} icon={icon} description={description}>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className={`${INPUT_CLS} mb-3`}
        placeholder="https://example.com/page"
      />
      <button type="button" onClick={submit} disabled={busy} className={BTN_CLS}>
        {busy ? "Running…" : cta}
      </button>
      <ResultBlock result={result} />
    </PanelShell>
  );
}

// ── Research ─────────────────────────────────────────────────────────────────

function KeywordResearchPanel() {
  const [keywords, setKeywords] = useState("");
  const [mode, setMode] = useState("auto");
  const [limit, setLimit] = useState("150");
  const { result, busy, run, setResult } = useToolRun();

  function submit() {
    const list = keywords.split(/[\n,]/).map((k) => k.trim()).filter(Boolean);
    if (!list.length) {
      setResult({ ok: false, error: "Enter at least one keyword." });
      return;
    }
    run({ action: "keyword-research", keywords: list, mode, limit: Number(limit) });
  }

  return (
    <PanelShell
      title="Keyword Research"
      icon={<KeyIcon size={18} className="text-[var(--seo-accent)]" />}
      description="Search-volume, difficulty, and related keywords via DataForSEO. Requires DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD."
    >
      <label className={LABEL_CLS}>Seed keyword(s) — comma or newline separated</label>
      <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className={`${INPUT_CLS} mb-3`} placeholder="corporate training, leadership courses" />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={INPUT_CLS}>
            <option value="auto">auto</option>
            <option value="related">related</option>
            <option value="suggestions">suggestions</option>
            <option value="ideas">ideas</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Limit</label>
          <select value={limit} onChange={(e) => setLimit(e.target.value)} className={INPUT_CLS}>
            {["50", "100", "150", "300", "500"].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
      <button type="button" onClick={submit} disabled={busy} className={BTN_CLS}>
        {busy ? "Researching…" : "Research keywords"}
      </button>
      <ResultBlock result={result} />
    </PanelShell>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2 text-sm font-semibold uppercase tracking-wide text-[var(--seo-muted)]">
      {children}
    </h2>
  );
}

export default function ToolsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO Tools"
        subtitle="Eight stateless utilities ported from SEO-Suite: generators, URL analyzers, and keyword research."
        icon={<ZapIcon size={22} className="text-[var(--seo-accent)]" />}
      />

      <HelpSection title="About these tools">
        These run as a single Python serverless function (<code>api/tools.py</code>) — stateless, no login,
        no database. They only respond under <code>vercel dev</code> or a real Vercel deployment (plain{" "}
        <code>next dev</code> 404s on the API). Keyword research also needs <code>DATAFORSEO_LOGIN</code> /{" "}
        <code>DATAFORSEO_PASSWORD</code> set as environment variables.
      </HelpSection>

      <SectionHeading>Generators</SectionHeading>
      <div className="grid gap-6 md:grid-cols-2">
        <SchemaGeneratorPanel />
        <MetaTagsPanel />
        <RobotsPanel />
        <SitemapPanel />
        <HreflangPanel />
      </div>

      <SectionHeading>URL Analyzers</SectionHeading>
      <div className="grid gap-6 md:grid-cols-2">
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

      <SectionHeading>Research</SectionHeading>
      <div className="grid gap-6 md:grid-cols-2">
        <KeywordResearchPanel />
      </div>
    </div>
  );
}
