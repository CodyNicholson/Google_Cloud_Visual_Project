// Original illustrations: a pictogram per product category, the overview's hero picture and a dotted world map.
import React from 'react';

const PATHS = {
  ai: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  compute: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="10" y="10" width="4" height="4" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>,
  containers: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  serverless: <path d="M13 2L5 14h6l-1 8 8-12h-6z" />,
  storage: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  databases: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16M10 10v10" /></>,
  analytics: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  integration: <><circle cx="6" cy="12" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.6 10.6l6.8-3.2M8.6 13.4l6.8 3.2" /></>,
  networking: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  security: <><path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  operations: <><path d="M3 12h4l2-6 4 12 2-6h6" /></>,
  devtools: <><path d="M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14" /></>,
  migration: <><path d="M3 8h13l-3-3M21 16H8l3 3" /></>,
  media: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></>,
};

export function CategoryIcon({ name, size = 22 }) {
  return (
    <svg className={`cat-icon cat-${name}`} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] || PATHS.compute}
    </svg>
  );
}

/** A cloud with the core building blocks orbiting and packets moving between them. */
export function HeroArt() {
  const items = [
    { name: 'compute', label: 'Compute', x: 70, y: 56, c: '#4285f4' },
    { name: 'storage', label: 'Storage', x: 70, y: 200, c: '#34a853' },
    { name: 'databases', label: 'Databases', x: 200, y: 262, c: '#fbbc04' },
    { name: 'networking', label: 'Network', x: 450, y: 262, c: '#ea4335' },
    { name: 'analytics', label: 'Data', x: 580, y: 200, c: '#34a853' },
    { name: 'ai', label: 'AI', x: 580, y: 56, c: '#4285f4' },
    { name: 'security', label: 'Security', x: 325, y: -6, c: '#ea4335' },
  ];
  return (
    <svg className="hero-art" viewBox="0 -36 650 370" role="img" aria-label="A cloud connected to compute, storage, databases, network, data, AI and security">
      <defs>
        <linearGradient id="cloudFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4285f4" stopOpacity="0.35" /><stop offset="1" stopColor="#34a853" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {items.map((it, i) => {
        const path = `M 325 150 L ${it.x} ${it.y}`;
        return (
          <g key={it.name}>
            <path d={path} className="hero-line" />
            <circle r="4" fill={it.c}>
              <animateMotion dur={`${2.2 + i * 0.3}s`} repeatCount="indefinite" path={path} />
            </circle>
          </g>
        );
      })}
      <path className="hero-cloud" d="M235 195c-27 0-48-20-48-46 0-23 17-42 40-45 8-28 34-47 65-47 28 0 53 16 63 41 6-2 12-3 19-3 29 0 53 23 53 51s-24 49-53 49z" fill="url(#cloudFill)" stroke="#4285f4" strokeWidth="2" />
      <text x="325" y="138" textAnchor="middle" className="hero-title">Your project</text>
      <text x="325" y="158" textAnchor="middle" className="hero-sub">billing · APIs · IAM</text>
      {items.map((it, i) => (
        <g key={it.name} transform={`translate(${it.x - 24}, ${it.y - 24})`}>
          <g className="pop-in" style={{ animationDelay: `${i * 90}ms`, color: it.c }}>
            <rect width="48" height="48" rx="12" className="hero-tile" />
            <g transform="translate(12, 12)"><CategoryIcon name={it.name} size={24} /></g>
            <text x="24" y="62" textAnchor="middle" className="hero-label">{it.label}</text>
          </g>
        </g>
      ))}
    </svg>
  );
}

// Land as [latitude, [[fromLon, toLon], ...]] every 5 degrees: rough on purpose, drawn as dots.
const LAND = [
  [75, [[-120, -70], [-55, -25], [60, 140]]], [70, [[-165, -70], [-55, -22], [20, 180]]], [65, [[-165, -60], [-50, -35], [10, 180]]],
  [60, [[-165, -60], [-48, -42], [5, 175]]], [55, [[-135, -58], [-8, 0], [5, 160]]], [50, [[-128, -55], [-5, 2], [3, 140]]],
  [45, [[-125, -60], [-2, 135]]], [40, [[-125, -72], [-9, 130]]], [35, [[-122, -76], [-9, 40], [45, 140]]], [30, [[-118, -80], [-10, 32], [35, 122]]],
  [25, [[-112, -80], [-15, 35], [45, 120]]], [20, [[-105, -88], [-17, 40], [45, 60], [70, 110]]], [15, [[-98, -84], [-17, 42], [75, 108]]],
  [10, [[-85, -62], [-16, 50], [76, 80], [98, 108]]], [5, [[-78, -52], [-10, 45], [98, 118]]], [0, [[-80, -48], [8, 42], [100, 118]]],
  [-5, [[-80, -38], [12, 40], [105, 140]]], [-10, [[-78, -36], [13, 40], [118, 150]]], [-15, [[-75, -38], [13, 40], [125, 145]]],
  [-20, [[-70, -40], [14, 35], [45, 50], [115, 148]]], [-25, [[-70, -46], [15, 33], [113, 152]]], [-30, [[-70, -50], [17, 31], [115, 153]]],
  [-35, [[-72, -56], [18, 26], [117, 150]]], [-40, [[-73, -62], [145, 148], [172, 178]]], [-45, [[-74, -66]]], [-50, [[-74, -68]]],
];
const W = 720;
const H = 300;
const px = (lon) => ((lon + 180) / 360) * W;
const py = (lat) => ((80 - lat) / 140) * H;

const DOTS = LAND.flatMap(([lat, spans]) => spans.flatMap(([a, b]) => {
  const out = [];
  for (let lon = a; lon <= b; lon += 5) out.push({ x: px(lon), y: py(lat) });
  return out;
}));

/** regions: [{ id, city, lon, lat, tone }] where tone is 'up' | 'down' | undefined */
export function WorldMap({ regions, runKey }) {
  return (
    <svg className="world-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map of Google Cloud regions" key={runKey}>
      {DOTS.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="2.1" className="map-dot" />)}
      {regions.map((r, i) => {
        const x = px(r.lon);
        const y = py(r.lat);
        return (
          <g key={r.id} className={`map-region ${r.tone ? `map-${r.tone}` : ''}`}>
            {r.tone && <circle cx={x} cy={y} r="8" className="map-pulse" style={{ animationDelay: `${i * 120}ms` }} />}
            <circle cx={x} cy={y} r={r.tone ? 6 : 3.5} className="map-pin" />
            <title>{`${r.id} (${r.city})`}</title>
            {r.tone && <text x={x + 10} y={y + 4} className="map-label">{r.id}</text>}
          </g>
        );
      })}
    </svg>
  );
}
