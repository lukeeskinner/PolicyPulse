"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef } from "react";
import Map, { Marker, useControl, type MapRef } from "react-map-gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer } from "@deck.gl/layers";
import { MapPin, Landmark } from "lucide-react";
import type { PolicyArc, PolicyMarker, PulseGeo, UserArea } from "@/lib/civic";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const KIND_COLOR: Record<PolicyMarker["kind"], string> = {
  "federal-hub": "#a855f7",
  delegation: "#38bdf8",
  "state-house": "#22d3ee",
};

type OverlayProps = ConstructorParameters<typeof MapboxOverlay>[0];

function DeckOverlay(props: OverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

interface PulseMapProps {
  geo: PulseGeo;
  area: UserArea | null;
  selectedId: string | null;
  onSelect: (marker: PolicyMarker | null) => void;
}

export function PulseMap({ geo, area, selectedId, onSelect }: PulseMapProps) {
  const mapRef = useRef<MapRef | null>(null);

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
        getSourceColor: [56, 189, 248, 150],
        getTargetColor: [168, 85, 247, 220],
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
        style={{ width: "100%", height: "100%" }}
      >
        <DeckOverlay interleaved={false} layers={layers} />

        {area && (
          <Marker longitude={area.lng} latitude={area.lat} anchor="center">
            <div className="relative flex items-center justify-center">
              <span className="absolute w-10 h-10 rounded-full bg-cyan-400/20 animate-ping" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-cyan-300 ring-2 ring-cyan-100/70 shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
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

      <MapLegend />
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
      <LegendRow color={KIND_COLOR["federal-hub"]} label="U.S. Congress (federal)" />
      <LegendRow color={KIND_COLOR.delegation} label="State delegation in Congress" />
      <LegendRow color={KIND_COLOR["state-house"]} label="State legislature bills" />
      <div className="flex items-center gap-1.5 pt-0.5 text-slate-500">
        <span className="w-2 h-2 rounded-full bg-cyan-300" /> Your area
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
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30 flex items-center justify-center mb-4">
        <Landmark className="w-6 h-6 text-cyan-200" />
      </div>
      <h3 className="font-display text-lg text-slate-100">The map needs a Mapbox token</h3>
      <p className="text-sm text-slate-400 mt-2 max-w-sm leading-relaxed">
        Add <code className="font-data text-cyan-300">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your{" "}
        <code className="font-data text-cyan-300">.env.local</code> to render the live 3D map of bills
        moving around you. It&apos;s free at{" "}
        <a href="https://account.mapbox.com/access-tokens/" className="text-cyan-300 underline" target="_blank" rel="noreferrer">
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
