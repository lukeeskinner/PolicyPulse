"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

// A premium little icon control: Sun and Moon are stacked and crossfade/rotate
// between each other (driven by [data-theme] in CSS, so it never mismatches on
// hydration). The aria-label is static to stay accessible without a mismatch.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark theme"
      title="Toggle theme"
      className={`relative flex items-center justify-center w-9 h-9 rounded-full border border-line text-slate-300 hover:text-signal-bright hover:border-signal/50 transition-colors ${className}`}
    >
      <Sun className="theme-icon theme-icon-sun w-4 h-4" aria-hidden="true" />
      <Moon className="theme-icon theme-icon-moon w-4 h-4" aria-hidden="true" />
    </button>
  );
}
