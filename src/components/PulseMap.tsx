"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, useControl, type MapRef } from "react-map-gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer } from "@deck.gl/layers";
import type { MapMouseEvent } from "mapbox-gl";
import { AlertTriangle, Check, Crosshair, Landmark, Loader2, MapPin } from "lucide-react";
import type { PolicyArc, PolicyMarker, PulseGeo, UserArea } from "@/lib/civic";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Categorical data encoding for the map: federal hub vs. a state's delegation
// in Congress vs. the state legislature. Three distinct cool hues that sit on
// the Civic Instrument palette (federal = the brand signal blue).
const KIND_COLOR: Record<PolicyMarker["kind"], string> = {
  "federal-hub": "#6e8bff",
  delegation: "#38bdf8",
  "state-house": "#c084fc",
};

type OverlayProps = ConstructorParameters<typeof MapboxOverlay>[0];

function DeckOverlay(props: OverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

// --- "Point to locate" dwell tuning ----------------------------------------
const DWELL_MS = 800; // how long the cursor must hold still before scanning
const MOVE_THRESHOLD = 10; // px of drift (from the dwell anchor) that cancels it
const DONE_HOLD_MS = 1800; // how long the "Area set" confirmation lingers
const ERROR_HOLD_MS = 2800;

type DwellStatus = "dwelling" | "scanning" | "done" | "error";
interface DwellState {
  status: DwellStatus;
  label: string;
}

function shortLabel(a: UserArea): string {
  return a.city ? `${a.city}, ${a.regionCode}` : a.region;
}

interface PulseMapProps {
  geo: PulseGeo;
  area: UserArea | null;
  selectedId: string | null;
  onSelect: (marker: PolicyMarker | null) => void;
  // Reverse-geocode a map point and set the area; returns the resolved area
  // (or null). Centralised in usePulse so the component owns no Mapbox logic.
  onPointToLocate?: (lat: number, lng: number) => Promise<UserArea | null>;
}

export function PulseMap({ geo, area, selectedId, onSelect, onPointToLocate }: PulseMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  // The map stays dark in both themes — it reads as a live "instrument" panel
  // and avoids a style reload (and its transient fetch) on every theme toggle.

  // Dwell-to-locate only makes sense with a real hover-capable pointer; on
  // touch/coarse devices we gracefully skip it and lean on search. Computed
  // lazily so it runs client-side without a setState-in-effect.
  const [hoverCapable] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  const canDwell = hoverCapable && !!onPointToLocate;

  const [reticle, setReticle] = useState<{ x: number; y: number } | null>(null);
  const [dwell, setDwell] = useState<DwellState | null>(null);

  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const coord = useRef<{ lat: number; lng: number } | null>(null);
  const scanSeq = useRef(0); // bumps on every move/scan so stale results are ignored

  const clearDwellTimer = useCallback(() => {
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback((ms: number) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      setDwell(null);
      setReticle(null);
    }, ms);
  }, []);

  // Fires once the cursor has held still for DWELL_MS.
  const runScan = useCallback(async () => {
    const c = coord.current;
    if (!c || !onPointToLocate) return;
    const seq = ++scanSeq.current;
    setDwell({ status: "scanning", label: "Scanning this area\u2026" });
    const resolved = await onPointToLocate(c.lat, c.lng);
    if (scanSeq.current !== seq) return; // superseded by a newer dwell — ignore
    if (resolved) {
      setReticle(null);
      setDwell({ status: "done", label: `Area set: ${shortLabel(resolved)}` });
      scheduleDismiss(DONE_HOLD_MS);
    } else {
      setDwell({ status: "error", label: "Couldn\u2019t read that spot \u2014 search instead" });
      scheduleDismiss(ERROR_HOLD_MS);
    }
  }, [onPointToLocate, scheduleDismiss]);

  const handleMove = useCallback(
    (e: MapMouseEvent) => {
      if (!canDwell) return;
      const { x, y } = e.point;
      const a = anchor.current;
      // Only react to meaningful movement (measured from the dwell anchor, so
      // slow drift accumulates correctly) — never geocode on every mouse move.
      if (a && Math.hypot(x - a.x, y - a.y) <= MOVE_THRESHOLD) return;

      clearDwellTimer();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      scanSeq.current++; // invalidate any in-flight scan / lingering confirmation
      anchor.current = { x, y };
      coord.current = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      setReticle({ x, y });
      setDwell({ status: "dwelling", label: "Hold still to scan this area" });
      dwellTimer.current = setTimeout(runScan, DWELL_MS);
    },
    [canDwell, clearDwellTimer, runScan],
  );

  // Leaving the map cancels an in-progress dwell, but lets a finished
  // confirmation linger (it auto-dismisses on its own timer).
  const handleLeave = useCallback(() => {
    clearDwellTimer();
    anchor.current = null;
    setReticle(null);
    setDwell((d) => (d && (d.status === "done" || d.status === "error") ? d : null));
    scanSeq.current++;
  }, [clearDwellTimer]);

  useEffect(
    () => () => {
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (area && mapRef.current) {
      mapRef.current.flyTo({
        center: [area.lng, area.lat],
        zoom: 5.4,
        pitch: 55,
        bearing: -12,
        duration: 2800,
        essential: true,
      });
    }
  }, [area?.lat, area?.lng]);

  const layers = useMemo(
    () => [
      new ArcLayer<PolicyArc>({
        id: "federal-arcs",
        data: geo.arcs,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getSourceColor: [192, 132, 252, 150],
        getTargetColor: [110, 139, 255, 220],
        getWidth: (d) => 1.2 + Math.min(6, d.weight),
        getHeight: 0.55,
        widthUnits: "pixels",
      }),
    ],
    [geo.arcs],
  );

  if (!TOKEN) return <MapMissingKey />;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl">
      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={{ longitude: -96, latitude: 38.5, zoom: 3.2, pitch: 45, bearing: -8 }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        projection={{ name: "mercator" }}
        attributionControl={false}
        reuseMaps
        onClick={() => onSelect(null)}
        onMouseMove={handleMove}
        onMouseOut={handleLeave}
        style={{ width: "100%", height: "100%" }}
      >
        <DeckOverlay interleaved={false} layers={layers} />

        {area && (
          <Marker longitude={area.lng} latitude={area.lat} anchor="center">
            <div className="relative flex items-center justify-center">
              <span className="absolute w-10 h-10 rounded-full bg-signal/20 animate-ping" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-signal ring-2 ring-[#c7d2ff]/70 shadow-[0_0_12px_rgba(110,139,255,0.9)]" />
            </div>
          </Marker>
        )}

        {geo.markers.map((m) => (
          <Marker
            key={m.id}
            longitude={m.lng}
            latitude={m.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelect(m);
            }}
          >
            <PolicyPin marker={m} active={selectedId === m.id} />
          </Marker>
        ))}
      </Map>

      {/* Dwell reticle — a crosshair + a ring that fills over the dwell window. */}
      {reticle && dwell && (dwell.status === "dwelling" || dwell.status === "scanning") && (
        <DwellReticle x={reticle.x} y={reticle.y} status={dwell.status} />
      )}

      {/* Single top-center message slot: scan status if active, else the ambient hint. */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-max max-w-[calc(100%-1.5rem)]">
        {dwell ? <ScanPill status={dwell.status} label={dwell.label} /> : canDwell ? <PointHint /> : null}
      </div>

      <MapLegend />
    </div>
  );
}

function DwellReticle({ x, y, status }: { x: number; y: number; status: DwellStatus }) {
  const R = 18;
  const C = 2 * Math.PI * R;
  return (
    <div
      className="absolute z-20 pointer-events-none pp-pop"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
    >
      <svg width="48" height="48" viewBox="0 0 48 48" className="overflow-visible">
        <circle cx="24" cy="24" r={R} fill="none" style={{ stroke: "var(--color-signal)", opacity: 0.22 }} strokeWidth="2" />
        {status === "dwelling" ? (
          <circle
            cx="24"
            cy="24"
            r={R}
            fill="none"
            style={{ stroke: "var(--color-signal-bright)" }}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            transform="rotate(-90 24 24)"
            className="pp-dwell-ring"
          />
        ) : (
          <circle cx="24" cy="24" r={R} fill="none" style={{ stroke: "var(--color-signal-bright)" }} strokeWidth="2.5" className="pp-pulse" />
        )}
        {/* crosshair ticks */}
        <g style={{ stroke: "var(--color-signal-bright)" }} strokeWidth="1.5" strokeLinecap="round">
          <line x1="24" y1="2" x2="24" y2="9" />
          <line x1="24" y1="39" x2="24" y2="46" />
          <line x1="2" y1="24" x2="9" y2="24" />
          <line x1="39" y1="24" x2="46" y2="24" />
        </g>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="w-1.5 h-1.5 rounded-full bg-signal-bright shadow-[0_0_10px_rgba(159,176,255,0.95)]" />
      </span>
    </div>
  );
}

function ScanPill({ status, label }: { status: DwellStatus; label: string }) {
  // Border carries the semantic tone; the label stays neutral (text-slate-100)
  // so it reads on both the dark and the light glass.
  const tone =
    status === "done" ? "border-emerald-400/40" : status === "error" ? "border-amber-400/40" : "border-signal/40";
  return (
    <div className={`pp-pop glass rounded-full border ${tone} text-slate-100 pl-2.5 pr-3 py-1.5 flex items-center gap-2 shadow-lg`}>
      <span className="flex items-center justify-center w-4 h-4 shrink-0">
        {status === "dwelling" && <Crosshair className="w-4 h-4 text-signal-bright" />}
        {status === "scanning" && <Loader2 className="w-4 h-4 text-signal-bright animate-spin" />}
        {status === "done" && <Check className="w-4 h-4 text-emerald-300" />}
        {status === "error" && <AlertTriangle className="w-4 h-4 text-amber-300" />}
      </span>
      <span className="text-[12px] font-medium whitespace-nowrap">{label}</span>
    </div>
  );
}

function PointHint() {
  return (
    <div className="glass rounded-full border border-line/80 px-3 py-1.5 flex items-center gap-2 opacity-80">
      <Crosshair className="w-3.5 h-3.5 text-signal-bright" />
      <span className="text-[11px] text-slate-300 whitespace-nowrap">Point anywhere to scan local policy</span>
    </div>
  );
}

function PolicyPin({ marker, active }: { marker: PolicyMarker; active: boolean }) {
  const color = KIND_COLOR[marker.kind];
  const size = Math.round(28 + marker.weight * 30);
  return (
    <button
      className="group relative flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
      style={{ width: size, height: size }}
      title={`${marker.title} — ${marker.subtitle}`}
    >
      <span
        className="absolute inset-0 rounded-full animate-ping opacity-40"
        style={{ background: color, animationDuration: "2.8s" }}
      />
      <span
        className="absolute inset-0 rounded-full opacity-25 blur-md"
        style={{ background: color }}
      />
      <span
        className="relative flex items-center justify-center rounded-full font-data font-semibold text-[11px] text-slate-950"
        style={{
          width: size * 0.62,
          height: size * 0.62,
          background: color,
          boxShadow: active
            ? `0 0 0 3px #fff, 0 0 22px ${color}`
            : `0 0 0 1.5px rgba(255,255,255,0.55), 0 0 14px ${color}aa`,
        }}
      >
        {marker.count}
      </span>
    </button>
  );
}

function MapLegend() {
  return (
    <div className="absolute bottom-3 left-3 glass rounded-xl px-3 py-2.5 text-[10px] text-slate-300 space-y-1.5 pointer-events-none">
      <div className="eyebrow mb-1">Legislation</div>
      <LegendRow color={KIND_COLOR["federal-hub"]} label="U.S. Congress (federal)" />
      <LegendRow color={KIND_COLOR.delegation} label="State delegation in Congress" />
      <LegendRow color={KIND_COLOR["state-house"]} label="State legislature bills" />
      <div className="flex items-center gap-1.5 pt-1.5 mt-0.5 border-t border-line text-slate-500">
        <span className="w-2 h-2 rounded-full bg-signal" /> Your area
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}

function MapMissingKey() {
  return (
    <div className="relative w-full h-full rounded-2xl grid-bg glass flex flex-col items-center justify-center text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-signal/15 border border-signal/30 flex items-center justify-center mb-4">
        <Landmark className="w-6 h-6 text-signal-bright" />
      </div>
      <h3 className="font-display text-lg text-slate-100">The map needs a Mapbox token</h3>
      <p className="text-sm text-slate-400 mt-2 max-w-sm leading-relaxed">
        Add <code className="font-data text-signal-bright">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your{" "}
        <code className="font-data text-signal-bright">.env.local</code> to render the live 3D map of bills
        moving around you. It&apos;s free at{" "}
        <a href="https://account.mapbox.com/access-tokens/" className="text-signal-bright underline" target="_blank" rel="noreferrer">
          mapbox.com
        </a>
        .
      </p>
      <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5" /> No mock data — the map stays empty until it&apos;s real.
      </p>
    </div>
  );
}
