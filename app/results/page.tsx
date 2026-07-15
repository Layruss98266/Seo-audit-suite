"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAudit } from "@/lib/state/AuditContext";
import {
  Card,
  EmptyState,
  MetricCard,
  PageHeader,
  ScoreBadge,
  ScoreCircle,
  SeverityBadge,
  StatusPill,
} from "@/components/ui";
import { ListChecksIcon } from "@/components/icons";
import { ExportBar } from "@/components/ExportBar";
import { AiSummaryCard } from "@/components/AiSummaryCard";
import {
  allIssuesOf,
  avgScore,
  getThematicIssues,
  issuesByTitle,
  scoreDistribution,
  severityCounts,
  type AggregatedIssue,
} from "@/lib/aggregate";
import { difficultyBreakdown } from "@/lib/difficulty";
import { downloadCsv, severityColor } from "@/lib/format";
import { categorizeUrl, categoryColor } from "@/lib/pageCategory";
import type { AuditResult } from "@/lib/types";

// ── small helpers ────────────────────────────────────────────────────────────

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

function worstIssue(r: AuditResult): string {
  const issues = r.all_issues || [];
  if (issues.length === 0) return "";
  return [...issues].sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0))[0].issue;
}

function brokenLinkCount(r: AuditResult): number {
  return (r.internal_links?.broken_count || 0) + (r.external_links?.broken_count || 0);
}

/** Count issues at a given set of severities (case-insensitive). */
function countSeverities(issues: { severity: string }[], sevs: string[]): number {
  const want = new Set(sevs.map((s) => s.toLowerCase()));
  return issues.filter((i) => want.has((i.severity || "").toLowerCase())).length;
}

const SEVERITY_ORDER = ["Critical", "High", "Medium", "Warning", "Low"];

// ── shared row widgets (kept from the previous results view) ──────────────────

/** One row in the sitewide "Top failing checks" list, expandable to the exact
 *  affected page URLs, each a button that jumps to that page's detail view. */
function FailingIssueRow({
  issue,
  onOpenUrl,
}: {
  issue: AggregatedIssue;
  onOpenUrl: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = severityColor(issue.severity).text;
  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`shrink-0 text-xs text-[var(--seo-muted)] transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          <span className="truncate text-[var(--seo-text)]" style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>
            {issue.issue}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-[var(--seo-card-hover)] px-2 py-0.5 text-xs font-medium text-[var(--seo-text-light)]">
          {issue.count} {issue.count === 1 ? "page" : "pages"}
        </span>
      </button>
      {open ? (
        <ul className="ml-6 mt-1 flex flex-col gap-0.5 border-l border-[var(--seo-border)] pl-3">
          {issue.urls.map((u) => (
            <li key={u}>
              <button
                type="button"
                onClick={() => onOpenUrl(u)}
                className="truncate text-left text-xs text-[var(--seo-accent)] hover:underline"
                title={u}
              >
                {pathnameOf(u)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Compact Easy/Medium/Hard fix-effort counts for a result's issues. */
function EffortChips({ result }: { result: AuditResult }) {
  const b = difficultyBreakdown(result.all_issues || []);
  if (b.Easy + b.Medium + b.Hard === 0) {
    return <span className="text-xs text-[var(--seo-success)]">None</span>;
  }
  const chip = (n: number, label: string, color: string) =>
    n > 0 ? (
      <span key={label} className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ color, backgroundColor: "var(--seo-card-hover)" }} title={`${n} ${label} fix${n > 1 ? "es" : ""}`}>
        {n} {label}
      </span>
    ) : null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {chip(b.Easy, "easy", "var(--seo-success)")}
      {chip(b.Medium, "med", "var(--seo-warning)")}
      {chip(b.Hard, "hard", "var(--seo-error)")}
    </span>
  );
}

/** Page-category badge for the "Type" column (Course/Blog/Topic/…). */
function TypeBadge({ url, auditType }: { url: string; auditType?: string }) {
  const category = categorizeUrl(url, auditType);
  const c = categoryColor(category);
  return (
    <span className="pill" style={{ color: c.text, backgroundColor: c.bg }}>
      {category}
    </span>
  );
}

/** A labeled horizontal proportion bar (good/average/poor or severity mix). */
function ProportionBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--seo-card-hover)]">
        {segments.map((s) =>
          s.value > 0 ? (
            <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${s.value}`} />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[var(--seo-text-light)]">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label} <strong className="text-[var(--seo-heading)]">{s.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── per-URL table row ────────────────────────────────────────────────────────

function ResultRow({ r, onOpen }: { r: AuditResult; onOpen: (r: AuditResult) => void }) {
  const cl = r.technical_audit_checklist?.summary;
  const issues = r.all_issues || [];
  const crit = countSeverities(issues, ["Critical", "High"]);
  const broken = brokenLinkCount(r);
  const top = worstIssue(r);
  return (
    <tr
      onClick={() => onOpen(r)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(r);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open audit detail for ${r.url}`}
      className="cursor-pointer border-b border-[var(--table-row-border)] last:border-0 hover:bg-[var(--table-row-hover)] focus:outline-none focus-visible:bg-[var(--table-row-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--seo-accent)]"
    >
      <td className="px-4 py-3 align-top font-medium text-[var(--seo-subheading)]">
        <span className="break-all">{r.url}</span>
        {r.status_code && r.status_code !== 200 ? (
          <span className="ml-2 text-xs text-[var(--seo-error)]">{r.status_code}</span>
        ) : null}
        {top ? <div className="mt-1 text-xs font-normal text-[var(--seo-text-light)]">{top}</div> : null}
      </td>
      <td className="px-4 py-3 align-top">
        <TypeBadge url={r.url} auditType={r.audit_type} />
      </td>
      <td className="px-4 py-3 align-top">
        <ScoreBadge score={r.seo_score ?? 0} />
      </td>
      <td className="px-4 py-3 align-top text-center">
        <span className="text-sm font-medium text-[var(--seo-heading)]">{issues.length}</span>
      </td>
      <td className="px-4 py-3 align-top text-center">
        {crit > 0 ? (
          <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ color: "var(--seo-error)", backgroundColor: "var(--seo-error-bg)" }}>{crit}</span>
        ) : (
          <span className="text-xs text-[var(--seo-muted)]">0</span>
        )}
      </td>
      <td className="px-4 py-3 align-top text-center">
        {broken > 0 ? (
          <span className="text-sm font-medium text-[var(--seo-error)]">{broken}</span>
        ) : (
          <span className="text-xs text-[var(--seo-muted)]">0</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <EffortChips result={r} />
      </td>
      <td className="px-4 py-3 align-top">
        {cl ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs">
            <StatusPill status="pass" /> {cl.pass}
            <StatusPill status="warning" /> {cl.warning}
            <StatusPill status="fail" /> {cl.fail}
          </span>
        ) : (
          <span className="text-xs text-[var(--seo-muted)]">N/A</span>
        )}
      </td>
      <td className="px-4 py-3 text-right align-top">
        <span className="whitespace-nowrap text-sm font-medium text-[var(--seo-accent)]">View →</span>
      </td>
    </tr>
  );
}

// ── sorting ──────────────────────────────────────────────────────────────────

type SortMode = "score-asc" | "score-desc" | "issues-desc" | "critical-desc" | "broken-desc" | "alpha";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "score-asc", label: "Worst score first" },
  { value: "score-desc", label: "Best score first" },
  { value: "issues-desc", label: "Most issues first" },
  { value: "critical-desc", label: "Most critical first" },
  { value: "broken-desc", label: "Most broken links" },
  { value: "alpha", label: "URL (A–Z)" },
];

function sortRows(rows: AuditResult[], mode: SortMode): AuditResult[] {
  const w = [...rows];
  switch (mode) {
    case "score-desc":
      return w.sort((a, b) => (b.seo_score ?? 0) - (a.seo_score ?? 0));
    case "issues-desc":
      return w.sort((a, b) => (b.all_issues?.length ?? 0) - (a.all_issues?.length ?? 0));
    case "critical-desc":
      return w.sort((a, b) => countSeverities(b.all_issues || [], ["Critical", "High"]) - countSeverities(a.all_issues || [], ["Critical", "High"]));
    case "broken-desc":
      return w.sort((a, b) => brokenLinkCount(b) - brokenLinkCount(a));
    case "alpha":
      return w.sort((a, b) => a.url.localeCompare(b.url));
    case "score-asc":
    default:
      return w.sort((a, b) => (a.seo_score ?? 0) - (b.seo_score ?? 0));
  }
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { results, navFilter, setNavFilter, setSelectedUrlIndex, clearAll } = useAudit();
  const router = useRouter();

  const [scoreMax, setScoreMax] = useState(100);
  const [brokenOnly, setBrokenOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("score-asc");
  const [confirmClear, setConfirmClear] = useState(false);
  const [h1ReportOpen, setH1ReportOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [checklistFilter, setChecklistFilter] = useState<"all" | "has-fail" | "has-warning">("all");

  useEffect(() => {
    if (!navFilter) return;
    if (navFilter.kind === "score" && navFilter.key === "critical_urls") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- consuming a one-shot nav signal from context
      setScoreMax(49);
    }
    setNavFilter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navFilter]);

  const types = useMemo(
    () => [...new Set(results.map((r) => categorizeUrl(r.url, r.audit_type)))].sort(),
    [results],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return results.filter((r) => {
      if ((r.seo_score ?? 0) > scoreMax) return false;
      if (brokenOnly && brokenLinkCount(r) === 0) return false;
      if (q && !r.url.toLowerCase().includes(q)) return false;
      if (typeFilter !== "all" && categorizeUrl(r.url, r.audit_type) !== typeFilter) return false;
      const cl = r.technical_audit_checklist?.summary;
      if (checklistFilter === "has-fail" && !(cl && cl.fail > 0)) return false;
      if (checklistFilter === "has-warning" && !(cl && cl.warning > 0)) return false;
      return true;
    });
  }, [results, scoreMax, brokenOnly, search, typeFilter, checklistFilter]);

  const sortedRows = useMemo(() => sortRows(filtered, sortMode), [filtered, sortMode]);

  // Overview stats across ALL audited URLs (not just the filtered subset — the
  // KPI band describes the whole run; the table below reflects the filters).
  const overview = useMemo(() => {
    const allIssues = allIssuesOf(results);
    const dist = scoreDistribution(results);
    const sev = severityCounts(allIssues);
    const themes = getThematicIssues(allIssues);
    return {
      urls: results.length,
      avg: avgScore(results),
      totalIssues: allIssues.length,
      criticalHigh: countSeverities(allIssues, ["Critical", "High"]),
      brokenLinks: results.reduce((s, r) => s + brokenLinkCount(r), 0),
      pagesWithFailures: results.filter((r) => (r.technical_audit_checklist?.summary?.fail ?? 0) > 0).length,
      dist,
      sev,
      themes,
      topFailing: issuesByTitle(results).slice(0, 8),
    };
  }, [results]);

  function openDetail(r: AuditResult) {
    setSelectedUrlIndex(results.indexOf(r));
    router.push("/detail");
  }
  function openDetailByUrl(url: string) {
    const idx = results.findIndex((r) => r.url === url);
    if (idx < 0) return;
    setSelectedUrlIndex(idx);
    router.push("/detail");
  }
  function exportSiteH1Csv() {
    const rows = [["URL", "H1 Text", "H1 Count"]];
    for (const r of results) {
      rows.push([r.url, r.heading_detail?.h1_text || "", String(r.heading_detail?.counts?.h1 ?? 0)]);
    }
    downloadCsv("site-h1-report.csv", rows);
  }

  if (results.length === 0) {
    return (
      <div>
        <PageHeader icon={<ListChecksIcon size={18} />} title="SEO Audit Results" />
        <EmptyState title="No audits yet" hint="Run an audit to see results here." />
      </div>
    );
  }

  const multi = results.length > 1;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<ListChecksIcon size={18} />}
        title="SEO Audit Results"
        subtitle={`${filtered.length} of ${results.length} URL${results.length === 1 ? "" : "s"} shown`}
      />

      {/* ── KPI overview band ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="URLs audited" value={overview.urls} />
        <MetricCard label="Avg score" value={Math.round(overview.avg)} sub="/ 100" />
        <MetricCard label="Total issues" value={overview.totalIssues} />
        <MetricCard label="Critical / High" value={overview.criticalHigh} sub="priority" />
        <MetricCard label="Broken links" value={overview.brokenLinks} />
        <MetricCard label="Pages w/ failures" value={overview.pagesWithFailures} />
      </div>

      {/* ── distributions + sitewide insights ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[var(--seo-subheading)]">Score & Severity</h3>
          {multi ? (
            <div className="mb-4 flex items-center gap-5">
              <ScoreCircle score={overview.avg} size={72} label="Avg" />
              <div className="flex-1">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--seo-muted)]">Score distribution</div>
                <ProportionBar
                  segments={[
                    { label: "Good (90+)", value: overview.dist.good, color: "var(--seo-success)" },
                    { label: "Average (50–89)", value: overview.dist.average, color: "var(--seo-warning)" },
                    { label: "Poor (<50)", value: overview.dist.poor, color: "var(--seo-error)" },
                  ]}
                />
              </div>
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-5">
              <ScoreCircle score={results[0].seo_score ?? 0} size={80} label="Score" />
              <div className="text-sm text-[var(--seo-text-light)]">
                <div className="break-all font-medium text-[var(--seo-heading)]">{pathnameOf(results[0].url)}</div>
                <div className="mt-1">{overview.totalIssues} issues · {overview.criticalHigh} priority · {overview.brokenLinks} broken links</div>
              </div>
            </div>
          )}
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--seo-muted)]">Issues by severity</div>
          <ProportionBar
            segments={SEVERITY_ORDER.filter((s) => (overview.sev[s] ?? 0) > 0).map((s) => ({
              label: s,
              value: overview.sev[s] ?? 0,
              color: severityColor(s).text,
            }))}
          />
        </Card>

        <Card>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--seo-muted)]">
            {multi ? "Top failing checks (site-wide)" : "Issues on this page"}
          </div>
          <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
            {overview.topFailing.length > 0 ? (
              overview.topFailing.map((f) => (
                <FailingIssueRow key={f.issue} issue={f} onOpenUrl={openDetailByUrl} />
              ))
            ) : (
              <span className="text-sm text-[var(--seo-success)]">No issues found. 🎉</span>
            )}
          </div>
        </Card>
      </div>

      {/* ── issues by theme (category rollup) ── */}
      {Object.keys(overview.themes).length > 0 ? (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[var(--seo-subheading)]">Issues by category</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(overview.themes)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([theme, issues]) => {
                const crit = countSeverities(issues, ["Critical", "High"]);
                return (
                  <div key={theme} className="rounded-lg border border-[var(--seo-border)] p-3">
                    <div className="text-sm font-medium text-[var(--seo-heading)]">{theme}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[var(--seo-text-light)]">
                      <span className="text-base font-semibold text-[var(--seo-heading)]">{issues.length}</span> issues
                      {crit > 0 ? <SeverityBadge severity="High" /> : null}
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      ) : null}

      {/* ── AI summary ── */}
      <AiSummaryCard
        cacheKey={multi ? "__sitewide__" : results[0].url}
        seoScore={Math.round(overview.avg)}
        issues={allIssuesOf(results)}
        contextLabel={multi ? `across ${results.length} audited pages (sitewide)` : undefined}
      />

      {/* ── filters ── */}
      <Card>
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-[var(--seo-muted)]">Search URL</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by path or domain…" className="w-full rounded-lg border border-[var(--seo-border)] bg-[var(--seo-card)] px-3 py-1.5 text-sm text-[var(--seo-text)] placeholder:text-[var(--seo-muted)]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--seo-muted)]">Max score: {scoreMax}</label>
            <input type="range" min={0} max={100} value={scoreMax} onChange={(e) => setScoreMax(Number(e.target.value))} className="w-48" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--seo-muted)]">Sort</label>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className="rounded-lg border border-[var(--seo-border)] bg-[var(--seo-card)] px-3 py-1.5 text-sm text-[var(--seo-text)]">
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {types.length > 1 ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--seo-muted)]">Type</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-[var(--seo-border)] bg-[var(--seo-card)] px-3 py-1.5 text-sm text-[var(--seo-text)]">
                <option value="all">All types</option>
                {types.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--seo-muted)]">Checklist</label>
            <select value={checklistFilter} onChange={(e) => setChecklistFilter(e.target.value as typeof checklistFilter)} className="rounded-lg border border-[var(--seo-border)] bg-[var(--seo-card)] px-3 py-1.5 text-sm text-[var(--seo-text)]">
              <option value="all">All checklist results</option>
              <option value="has-fail">Has failures</option>
              <option value="has-warning">Has warnings</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--seo-text)]">
            <input type="checkbox" checked={brokenOnly} onChange={(e) => setBrokenOnly(e.target.checked)} />
            Broken links only
          </label>
        </div>
      </Card>

      <ExportBar results={filtered} totalCount={results.length} />

      {/* ── per-URL table (full-bleed) ── */}
      <div className="full-bleed mb-4 px-4 md:px-8">
        <Card className="overflow-hidden p-0">
          {sortedRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--seo-muted)]">No URLs match the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
                    <th className="px-4 py-2.5">URL & top issue</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Score</th>
                    <th className="px-4 py-2.5 text-center">Issues</th>
                    <th className="px-4 py-2.5 text-center">Crit/High</th>
                    <th className="px-4 py-2.5 text-center">Broken</th>
                    <th className="px-4 py-2.5">Fix effort</th>
                    <th className="px-4 py-2.5">Checklist</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r, idx) => (
                    <ResultRow key={r.url + idx} r={r} onOpen={openDetail} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── sitewide H1 report (collapsible) ── */}
      {multi ? (
        <Card className="overflow-hidden p-0">
          <button type="button" onClick={() => setH1ReportOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left">
            <span className="flex items-center gap-2">
              <span className={`text-[var(--seo-muted)] transition-transform ${h1ReportOpen ? "rotate-90" : ""}`}>▸</span>
              <span className="text-sm font-semibold text-[var(--seo-subheading)]">Sitewide H1 Report</span>
            </span>
          </button>
          {h1ReportOpen ? (
            <div className="overflow-x-auto border-t border-[var(--seo-border)]">
              <div className="flex justify-end p-3">
                <button onClick={exportSiteH1Csv} className="rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--seo-card-hover)]">Export CSV</button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
                    <th className="px-4 py-3">URL</th>
                    <th className="px-4 py-3">H1 Text</th>
                    <th className="px-4 py-3">H1 Count</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((res) => (
                    <tr key={res.url} className="border-b border-[var(--table-row-border)]">
                      <td className="max-w-xs truncate px-4 py-3">{res.url}</td>
                      <td className="px-4 py-3">{res.heading_detail?.h1_text || <em>none</em>}</td>
                      <td className="px-4 py-3">{res.heading_detail?.counts?.h1 ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ── destructive: clear all ── */}
      <div className="mt-6 flex items-center justify-between border-t border-[var(--seo-border)] pt-4">
        <a href="/results-legacy" className="text-xs text-[var(--seo-muted)] hover:text-[var(--seo-text-light)] hover:underline">
          View legacy results layout →
        </a>
        <button
          type="button"
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true);
              return;
            }
            clearAll();
            setConfirmClear(false);
          }}
          onBlur={() => setConfirmClear(false)}
          className="rounded-lg border border-[var(--seo-error-border)] px-3 py-1.5 text-sm font-medium text-[var(--seo-error)] hover:bg-[var(--seo-error-bg)]"
        >
          {confirmClear ? "Confirm clear all results?" : "Clear All Results"}
        </button>
      </div>
    </div>
  );
}
