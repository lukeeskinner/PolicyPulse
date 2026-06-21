"use client";

import Link from "next/link";
import { PulseLine, PulseMark } from "@/components/Brand";

// Shared page chrome so every PolicyPulse surface reads as one product:
// the live pulse mark + brand on the left, a section label, and consistent
// nav pills on the right.
export function AppHeader({
  section,
  subtitle,
  live = false,
  children,
}: {
  section?: string;
  subtitle?: string;
  live?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative z-20 border-b border-line backdrop-blur sticky top-0 bg-ink/80">
      <div className="max-w-[1560px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3 group shrink-0">
          <PulseMark className="w-9 h-9" live={live} />
          <div>
            <h1 className="font-display text-base font-semibold tracking-tight text-slate-50 leading-none group-hover:text-white">
              Policy<span className="text-signal-bright">Pulse</span>
              {section && <span className="text-slate-600 font-normal"> / {section}</span>}
            </h1>
            {subtitle && <p className="eyebrow mt-1.5">{subtitle}</p>}
          </div>
        </Link>
        <div className="flex items-center gap-2 sm:gap-2.5">{children}</div>
      </div>
      <PulseLine width={2200} height={20} className="absolute inset-x-0 -bottom-px h-5 opacity-70" />
    </header>
  );
}

export function NavPill({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors"
    >
      {icon} {label}
    </Link>
  );
}
