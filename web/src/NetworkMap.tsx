import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { LocateFixed, Layers, Warehouse, CircleHelp } from "lucide-react";
import type { Data, Network, NetworkRow } from "./types";
import { number, riskLevel, shortLocation } from "./utils";

interface Props {
  data: Data;
  network: Network;
  selected: string;
  onSelect: (id: string) => void;
  layer: string;
  filtered: string[];
  scenario?: boolean;
}
const colors = {
  critical: "#ce5c49",
  warning: "#be9141",
  healthy: "#3b8b70",
  unknown: "#8b9395",
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ]!,
  );
export default function NetworkMap({
  data,
  network,
  selected,
  onSelect,
  layer,
  filtered,
  scenario = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    pins = useRef<L.LayerGroup | null>(null),
    links = useRef<L.LayerGroup | null>(null),
    tile = useRef<L.TileLayer | null>(null);
  const [base, setBase] = useState(false),
    [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: true,
      minZoom: 5,
      maxZoom: 13,
    }).setView([26.15, 93.1], 7);
    map.current = m;
    tile.current = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        maxZoom: 18,
        opacity: 0.28,
      },
    );
    tile.current.on("tileerror", () => setFailed(true));
    m.attributionControl.addAttribution(
      '<a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a> / DataMeet · CC BY 2.5 IN',
    );
    L.control.zoom({ position: "topright" }).addTo(m);
    pins.current = L.layerGroup().addTo(m);
    links.current = L.layerGroup().addTo(m);
    const abort = new AbortController();
    fetch("/maps/northeast.geojson", { signal: abort.signal })
      .then((r) => r.json())
      .then((geo) => {
        if (!map.current) return;
        L.geoJSON(geo, {
          interactive: false,
          style: (f) => ({
            color: f?.properties.shapeName === "Assam" ? "#6e9a7a" : "#b9c2b8",
            weight: f?.properties.shapeName === "Assam" ? 1.5 : 1,
            fillColor:
              f?.properties.shapeName === "Assam" ? "#b5ceab" : "#d7ddce",
            fillOpacity: f?.properties.shapeName === "Assam" ? 0.25 : 0.08,
          }),
        })
          .addTo(m)
          .bringToBack();
        for (const f of geo.features) {
          const name = f.properties.shapeName;
          if (
            [
              "Assam",
              "Meghalaya",
              "Nagaland",
              "Arunachal Pradesh",
              "Manipur",
              "Mizoram",
              "Tripura",
            ].includes(name)
          ) {
            const bounds = L.geoJSON(f).getBounds();
            L.marker(bounds.getCenter(), {
              interactive: false,
              keyboard: false,
              icon: L.divIcon({
                className: "state-label",
                html: escape(name.toUpperCase()),
                iconSize: [160, 20],
                iconAnchor: [80, 10],
              }),
            }).addTo(m);
          }
        }
      })
      .catch(() => {});
    const coordinates = data.locations
      .filter((x) => x.latitude != null && x.longitude != null)
      .map((x) => [x.latitude!, x.longitude!] as L.LatLngTuple);
    const frame = () => {
      if (coordinates.length)
        m.fitBounds(L.latLngBounds(coordinates), {
          paddingTopLeft: [45, 35],
          paddingBottomRight: [115, 45],
          maxZoom: 7,
          animate: false,
        });
    };
    let narrow = ref.current.clientWidth < 500;
    frame();
    const resize = new ResizeObserver(() => {
      m.invalidateSize();
      const next = !!ref.current && ref.current.clientWidth < 500;
      if (next !== narrow) {
        narrow = next;
        frame();
      }
    });
    resize.observe(ref.current);
    return () => {
      abort.abort();
      resize.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current || !tile.current) return;
    if (base) tile.current.addTo(map.current);
    else tile.current.remove();
  }, [base]);
  useEffect(() => {
    if (!map.current || !pins.current || !links.current) return;
    pins.current.clearLayers();
    links.current.clearLayers();
    const nodes = new Map(data.locations.map((x) => [x.id, x]));
    for (const route of data.routes.filter((r) => r.permitted)) {
      const origin = nodes.get(route.origin_id),
        dest = nodes.get(route.destination_id);
      if (
        !origin ||
        !dest ||
        origin.latitude == null ||
        dest.latitude == null ||
        origin.longitude == null ||
        dest.longitude == null
      )
        continue;
      if (
        origin.kind === "warehouse" &&
        (filtered.includes(dest.id) || filtered.includes(origin.id))
      )
        L.polyline(
          [
            [origin.latitude, origin.longitude],
            [dest.latitude, dest.longitude],
          ],
          {
            color: "#7e9c8d",
            weight: 1.5,
            opacity: 0.5,
            dashArray: "5 8",
            interactive: false,
          },
        ).addTo(links.current);
    }
    for (const node of data.locations) {
      if (
        node.latitude == null ||
        node.longitude == null ||
        !filtered.includes(node.id)
      )
        continue;
      const row = network.table.find((r) => r.location_id === node.id);
      if (!row) continue;
      const status = !row.balance.known
        ? "unknown"
        : layer === "expiry"
          ? row.projected_expiry_units > 0
            ? "warning"
            : "healthy"
          : layer === "freshness"
            ? row.stock_age_hours == null
              ? "unknown"
              : row.stock_age_hours > 24
                ? "warning"
                : "healthy"
            : riskLevel(row, network.as_of);
      const color = colors[status as keyof typeof colors];
      const active = node.id === selected;
      const warehouse = node.kind === "warehouse";
      const icon = L.divIcon({
        className: `network-pin ${active ? "is-active" : ""} ${warehouse ? "is-warehouse" : ""}`,
        html: `<div class="pin-dot" style="--pin-color:${color}">${warehouse ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 9 9-5 9 5v11H3V9Z"/><path d="M9 20v-7h6v7"/></svg>' : "<span></span>"}</div><div class="pin-label"><strong>${escape(warehouse ? "Central warehouse" : shortLocation(node.name))}</strong><span>${row.balance.known ? number(row.balance.available) + (scenario ? " projected" : " available") : "Unknown balance"}${active ? " · Selected" : ""}</span></div>`,
        iconSize: [170, 54],
        iconAnchor: warehouse ? [18, 62] : [18, 18],
      });
      const marker = L.marker([node.latitude, node.longitude], {
        icon,
        keyboard: true,
        title: `${node.name}, ${row.status}, ${number(row.balance.available)} units`,
        zIndexOffset: active ? 1000 : warehouse ? 100 : 300,
      }).addTo(pins.current);
      marker.on("click", () => onSelectRef.current(node.id));
    }
  }, [data.locations, data.routes, network, selected, layer, filtered]);
  function fit() {
    if (map.current) {
      const coords = data.locations
        .filter((x) => x.latitude != null && x.longitude != null)
        .map((x) => [x.latitude!, x.longitude!] as L.LatLngTuple);
      if (coords.length)
        map.current.fitBounds(L.latLngBounds(coords), {
          paddingTopLeft: [45, 35],
          paddingBottomRight: [115, 45],
          maxZoom: 7,
          animate: true,
        });
    }
  }
  return (
    <div className="map-wrap">
      <div
        ref={ref}
        className="network-map"
        aria-label="Interactive medicine distribution network map"
      />
      <div className="map-corner-label">
        <span className="live-dot" />
        ASSAM NETWORK
        <span className="map-label-separator" />
        {data.locations.length}{" "}
        {data.me.evidence_type === "synthetic" ? "DEMO SITES" : "SITES"}
      </div>
      <div className="map-tools">
        <button
          className="map-tool"
          onClick={fit}
          aria-label="Fit all network locations"
        >
          <LocateFixed size={17} />
        </button>
        <button
          className={`map-tool ${!base ? "selected" : ""}`}
          onClick={() => setBase((x) => !x)}
          aria-label="Toggle map background"
        >
          <Layers size={17} />
        </button>
      </div>
      <div className="map-legend">
        <span style={{ display: layer === "risk" ? "inline-flex" : "none" }}>
          <i style={{ background: colors.critical }} />
          {layer === "risk"
            ? "Critical"
            : layer === "expiry"
              ? "Expiry exposure"
              : "Stale >24h"}
        </span>
        <span>
          <i style={{ background: colors.warning }} />
          {layer === "risk"
            ? "At risk"
            : layer === "expiry"
              ? "Expiry exposure"
              : "Stale >24h"}
        </span>
        <span>
          <i style={{ background: colors.healthy }} />
          {layer === "risk"
            ? "Covered"
            : layer === "expiry"
              ? "No exposure"
              : "Fresh ≤24h"}
        </span>
        <span>
          <i style={{ background: colors.unknown }} />
          Unknown
        </span>
      </div>
      <div className="map-footnote">
        <CircleHelp size={12} />
        {failed ? "Offline map context · " : "Approximate demo sites · "}Supply
        links show configured connections
      </div>
      <div className="map-scale">
        <Warehouse size={12} />
        Configured supply network
      </div>
    </div>
  );
}
