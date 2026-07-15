"use client";

import Link from "next/link";
import { ScanIcon, ZapIcon, SparklesIcon, FileTextIcon } from "@/components/icons";
import type { ComponentType, SVGProps } from "react";

// Inviting empty-state hero shown before any audit has run. Replaces the bare
// "No audits yet" text so a first-time user immediately understands what the
// app does and where to start. Purely presentational; themed with the existing
// CSS variables so it works in light and dark.

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const CAPABILITIES: { icon: IconType; title: string; body: string }[] = [
  { icon: ScanIcon, title: "Technical audit", body: "35-check crawl of any URL or whole sitemap — metadata, links, indexability, site health." },
  { icon: SparklesIcon, title: "AI insights", body: "Plain-English summaries and per-issue fix suggestions to prioritise what matters." },
  { icon: ZapIcon, title: "SEO tools", body: "Schema, robots, sitemap & hreflang generators, structured-data validation, keyword research." },
  { icon: FileTextIcon, title: "Export", body: "Share results as CSV, Excel, or PDF — the full checklist travels with every format." },
];

export function GetStarted() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--seo-border)] bg-[var(--seo-card-bg)] p-8 text-center md:p-12">
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 h-48 opacity-60 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--seo-accent-light), transparent)" }}
          aria-hidden
        />
        <div className="relative">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--seo-accent)] text-white">
            <ScanIcon size={24} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--seo-heading)] md:text-3xl">
            Audit your site&apos;s SEO in seconds
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--seo-text-light)] md:text-base">
            Enterprise-grade technical SEO — crawlability, on-page, links, and site health — with
            AI-assisted fixes and one-click export. Start with a single URL or a full sitemap.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/seo-audit"
              className="inline-flex items-center gap-2 rounded-lg btn-gradient px-5 py-2.5 text-sm font-semibold text-white"
            >
              <ScanIcon size={16} /> Run your first audit
            </Link>
            <Link
              href="/tools"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--seo-border-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--seo-text)] hover:bg-[var(--seo-card-hover)]"
            >
              <ZapIcon size={16} /> Explore SEO tools
            </Link>
          </div>
        </div>
      </div>

      {/* Capability grid */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CAPABILITIES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3 rounded-xl border border-[var(--seo-border)] bg-[var(--seo-card-bg)] p-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--seo-accent-light)] text-[var(--seo-accent)]">
              <Icon size={18} />
            </span>
            <div>
              <div className="text-sm font-semibold text-[var(--seo-heading)]">{title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--seo-text-light)]">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
