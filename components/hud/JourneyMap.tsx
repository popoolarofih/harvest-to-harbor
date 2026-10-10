'use client';
import { useEffect, useState } from 'react';
import { journeyProgress, type TradeBuyer } from '../../game/simulation';
import type { Shipment } from '../../game/types';

// Stylised maps drawn from rough lon/lat outlines: enough to orient the player, not cartography.
type LL = [number, number];

const NIGERIA: LL[] = [[2.7, 6.4], [2.7, 9.0], [3.6, 11.7], [4.1, 13.5], [5.5, 13.9], [6.9, 13.6], [8.1, 13.3], [9.6, 12.8], [10.7, 13.4], [12.3, 13.1], [13.6, 13.7], [14.2, 12.4], [14.6, 11.8], [13.7, 10.9], [13.3, 10.1], [12.4, 8.6], [11.8, 7.1], [10.6, 6.9], [9.8, 6.2], [8.8, 4.9], [8.4, 4.5], [7.1, 4.4], [6.0, 4.3], [5.0, 5.5], [4.5, 6.3], [3.4, 6.4], [2.7, 6.4]];
const AFRICA: LL[] = [[-17, 15], [-16, 20], [-13, 27], [-9, 32], [-6, 36], [10, 37], [11, 33], [20, 31], [32, 31], [34, 28], [43, 12], [51, 12], [41, -2], [40, -11], [35, -24], [20, -35], [18, -29], [12, -17], [13, -6], [9, 3], [6, 4.3], [3.4, 6.4], [-2, 4.8], [-7.5, 4.4], [-13.5, 9.5], [-17, 15]];
const EUROPE: LL[] = [[-9, 38.7], [-9, 43], [-2, 43.4], [-4.5, 48.4], [2, 51], [8, 54], [10, 57], [20, 60], [30, 60], [30, 45], [24, 40], [20, 40], [15, 37.5], [12, 44], [3, 43], [-1, 37], [-9, 38.7]];
const UK: LL[] = [[-5.7, 50], [1.7, 52], [1.8, 52.8], [0, 53.6], [-1.6, 55.6], [-3, 58.6], [-5, 58.6], [-6, 56.5], [-4.6, 54.7], [-3, 53.4], [-4.8, 52], [-5.7, 50]];
const ARABIA: LL[] = [[34, 28], [36, 33], [48, 30], [56, 26], [59, 22], [52, 16], [43, 12.7], [34, 28]];
const AMERICAS: LL[] = [[-81, 25], [-80, 32], [-76, 35], [-74, 41], [-70, 42], [-66, 45], [-60, 47], [-60, 60], [-85, 60], [-85, 25], [-81, 25]];

const ROAD: { name: string; at: LL }[] = [
  { name: 'Kafanchan', at: [8.3, 9.6] }, { name: 'Abuja', at: [7.5, 9.1] }, { name: 'Lokoja', at: [6.7, 7.8] }, { name: 'Ibadan', at: [3.9, 7.4] }, { name: 'Lagos · Apapa', at: [3.4, 6.45] },
];
const LAGOS: LL = [3.4, 6.45];
const ATLANTIC: LL[] = [[0, 3], [-10, 4], [-19, 14], [-20, 28], [-12, 40]];
const SEA_ROUTES: Record<string, LL[]> = {
  Felixstowe: [LAGOS, ...ATLANTIC, [-7, 48], [-2, 50], [1.3, 51.9]],
  Rotterdam: [LAGOS, ...ATLANTIC, [-7, 48], [-2, 50], [3, 52], [4.4, 51.9]],
  Hamburg: [LAGOS, ...ATLANTIC, [-7, 48], [-2, 50], [4, 53], [8, 54], [9.9, 53.5]],
  'Jebel Ali': [LAGOS, [0, 3], [-10, 4], [-19, 14], [-20, 28], [-10, 36], [-5.6, 36], [10, 37.5], [32.3, 31.5], [33.5, 27], [43, 12.5], [51, 13], [58, 22], [56.5, 26], [55, 25]],
  Savannah: [LAGOS, [-10, 4], [-25, 10], [-50, 20], [-75, 30], [-81, 32]],
};
const DOMESTIC_STOPS: Record<string, number> = { Abuja: 2, Lagos: 5 };
// Matches journeyProgress(): road is the first 25% of an export journey, port the next 10%.
const ROAD_SHARE = 0.25, LAND_SHARE = 0.35;

function projector(bounds: [number, number, number, number], w: number, h: number) {
  const [lon0, lat0, lon1, lat1] = bounds;
  return ([lon, lat]: LL): [number, number] => [((lon - lon0) / (lon1 - lon0)) * w, h - ((lat - lat0) / (lat1 - lat0)) * h];
}
const polyPath = (pts: [number, number][]) => pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');

/** Point at fraction t (0..1) along a polyline, by length. */
function along(pts: [number, number][], t: number): [number, number] {
  const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  let d = Math.max(0, Math.min(1, t)) * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i]) { const k = seg[i] ? d / seg[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; }
    d -= seg[i];
  }
  return pts[pts.length - 1];
}

/** Eases the marker to its new position after each day, so the journey visibly moves. */
function useEased(target: number) {
  const [v, setV] = useState(target);
  useEffect(() => {
    let raf = 0;
    const start = performance.now(), from = v;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1200);
      setV(from + (target - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}

export default function JourneyMap({ shipment, buyer }: { shipment: Shipment; buyer: TradeBuyer }) {
  const progress = useEased(journeyProgress(shipment, buyer));
  const W = 520, H = 280;

  if (buyer.domestic || progress <= LAND_SHARE) {
    const p = projector([2, 4, 15, 14.2], W, H);
    const stops = buyer.domestic ? ROAD.slice(0, DOMESTIC_STOPS[buyer.port] ?? ROAD.length) : ROAD;
    const line = stops.map(s => p(s.at));
    const marker = along(line, buyer.domestic ? progress : progress / ROAD_SHARE);
    const atPort = !buyer.domestic && progress >= ROAD_SHARE;
    return (
      <svg className="journey-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Truck route across Nigeria">
        <path d={polyPath(NIGERIA.map(p))} className="land" />
        <path d={polyPath(line)} className="route road" />
        {stops.map((s, i) => { const [x, y] = p(s.at); return <g key={s.name}><circle cx={x} cy={y} r={i === 0 || i === stops.length - 1 ? 5 : 3.5} className="stop" /><text x={x + 7} y={y - 6} className="label">{s.name}</text></g>; })}
        <text x={marker[0]} y={marker[1] + 6} className="vehicle" textAnchor="middle">{atPort ? '📦' : '🚛'}</text>
        <text x={12} y={22} className="caption">{buyer.domestic ? `By road to ${buyer.port}` : atPort ? 'Apapa port, Lagos: inspection and container loading' : 'Leg 1 · Kafanchan to Lagos by road'}</text>
      </svg>
    );
  }

  const p = projector([-88, -12, 64, 62], W, H);
  const route = (SEA_ROUTES[buyer.port] ?? SEA_ROUTES.Felixstowe).map(p);
  const marker = along(route, (progress - LAND_SHARE) / (1 - LAND_SHARE));
  const end = route[route.length - 1];
  return (
    <svg className="journey-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sea route from Lagos to ${buyer.port}`}>
      {[AFRICA, EUROPE, UK, ARABIA, AMERICAS].map((poly, i) => <path key={i} d={polyPath(poly.map(p))} className="land" />)}
      <path d={polyPath(NIGERIA.map(p))} className="land home" />
      <path d={polyPath(route)} className="route sea" />
      <circle cx={route[0][0]} cy={route[0][1]} r={4} className="stop" /><text x={route[0][0] + 6} y={route[0][1] + 12} className="label">Lagos</text>
      <circle cx={end[0]} cy={end[1]} r={4} className="stop" /><text x={end[0] + 6} y={end[1] - 6} className="label">{buyer.port} {buyer.flag}</text>
      <text x={marker[0]} y={marker[1] + 6} className="vehicle" textAnchor="middle">🚢</text>
      <text x={12} y={22} className="caption">Leg 2 · Lagos to {buyer.port}, {buyer.country}</text>
    </svg>
  );
}
