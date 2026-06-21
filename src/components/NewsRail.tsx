"use client";

import { Newspaper, ExternalLink, RadioTower } from "lucide-react";
import type { NewsArticle, SourceState, UserArea } from "@/lib/civic";

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

interface NewsRailProps {
  articles: NewsArticle[];
  loading: boolean;
  status: SourceState;
  area: UserArea | null;
}

export function NewsRail({ articles, loading, status, area }: NewsRailProps) {
  const hasNews = articles.length > 0;
  // duration scales with volume for a calm, readable crawl
  const duration = Math.max(28, articles.length * 6);

  return (
    <div className="glass rounded-2xl h-full flex flex-col overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-800/70 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-violet-300" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-200">
            News around you
          </h2>
        </div>
        {hasNews && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-300">
            <RadioTower className="w-3 h-3" /> live
          </span>
        )}
      </header>

      {loading ? (
        <RailSkeleton />
      ) : !hasNews ? (
        <RailEmpty status={status} area={area} />
      ) : (
        <div className="pp-vscroll-host relative flex-1 overflow-hidden mask-fade-y">
          <div className="pp-vscroll" style={{ animationDuration: `${duration}s` }}>
            {[...articles, ...articles].map((a, i) => (
              <NewsItem key={`${a.id}-${i}`} article={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NewsItem({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noreferrer"
      className="block px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors group"
    >
      <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-1">
        <span className="text-cyan-300/90 font-medium truncate max-w-[60%]">{article.source}</span>
        <span>·</span>
        <span>{timeAgo(article.publishedAt)}</span>
        <ExternalLink className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <h3 className="font-serif-editorial text-[15px] leading-snug text-slate-100 group-hover:text-white">
        {article.title}
      </h3>
      {article.description && (
        <p className="text-[12px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
          {article.description}
        </p>
      )}
    </a>
  );
}

function RailSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-2.5 w-24 bg-slate-700/50 rounded animate-pulse" />
          <div className="h-3.5 w-full bg-slate-700/40 rounded animate-pulse" />
          <div className="h-3 w-4/5 bg-slate-700/30 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function RailEmpty({ status, area }: { status: SourceState; area: UserArea | null }) {
  const msg =
    status === "missing_key"
      ? "Add GNEWS_API_KEY to .env.local to stream live local news here."
      : area
        ? `No recent news found for ${area.label}.`
        : "Set your area to see local news.";
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-slate-400">
      <Newspaper className="w-7 h-7 text-slate-600 mb-3" />
      <p className="text-sm leading-relaxed">{msg}</p>
      <p className="text-[11px] text-slate-600 mt-2">No mock headlines — only real reporting.</p>
    </div>
  );
}
