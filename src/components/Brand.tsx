"use client";

// The signature element: PolicyPulse's live waveform.
//
// PulseMark is the logo glyph — a single civic "heartbeat" read from the law.
// PulseLine is an ambient, scrolling pulse used as a header vitals strip so the
// whole product literally reads a live signal. Both are decorative (aria-hidden)
// and stop moving under prefers-reduced-motion via the .pp-scroll-x utility.

const MARK_PATH = "M2 14 H8 l1.6 -7 l2.2 12 l1.8 -8 l1.4 3 H26";

export function PulseMark({
  className = "",
  live = false,
}: {
  className?: string;
  live?: boolean;
}) {
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-lg border border-signal/40 bg-signal/10 ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 28 28" fill="none" className="w-[62%] h-[62%] text-signal-bright">
        <path
          d={MARK_PATH}
          stroke="currentColor"
          strokeWidth={2.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {live && (
        <span className="absolute -right-0.5 -top-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 pp-pulse" />
      )}
    </span>
  );
}

// Build one tile of waveform: a quiet baseline punctuated by periodic
// heartbeats, beginning and ending on the baseline so two tiles loop seamlessly.
function buildWave(width: number, baseline = 11): string {
  const seg = 196;
  const lead = 66;
  let d = `M0 ${baseline}`;
  for (let x = 0; x + lead + 40 <= width; x += seg) {
    d += ` H${x + lead} l9 -7 l11 13 l9 -10 l7 4`;
  }
  d += ` H${width}`;
  return d;
}

export function PulseLine({
  width = 1600,
  height = 22,
  strokeWidth = 1.25,
  className = "",
}: {
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const d = buildWave(width, height / 2);
  return (
    <div
      className={`pointer-events-none overflow-hidden mask-fade-x ${className}`}
      aria-hidden
    >
      <div className="flex pp-scroll-x" style={{ width: width * 2 }}>
        {[0, 1].map((i) => (
          <svg
            key={i}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            fill="none"
            preserveAspectRatio="none"
            className="shrink-0 text-signal/35"
          >
            <path
              d={d}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ))}
      </div>
    </div>
  );
}
