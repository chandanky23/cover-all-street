import Svg, { Circle, Polyline } from 'react-native-svg';

import { brand } from '@/constants/duppyTheme';

// A tiny route preview: the journey's thinned path scaled into a square,
// with a sage dot at the start and a lavender dot at the end.
export function RouteThumb({ path, size = 56 }: { path: [number, number][]; size?: number }) {
  if (path.length < 2) return null;
  const lats = path.map((p) => p[0]);
  const lons = path.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const cos = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const w = Math.max((maxLon - minLon) * cos, 1e-6);
  const h = Math.max(maxLat - minLat, 1e-6);
  const pad = 6;
  const scale = (size - pad * 2) / Math.max(w, h);
  const offX = (size - w * scale) / 2;
  const offY = (size - h * scale) / 2;
  const pts = path.map(([lat, lon]) => [offX + (lon - minLon) * cos * scale, offY + (maxLat - lat) * scale]);
  const start = pts[0];
  const end = pts[pts.length - 1];
  return (
    <Svg width={size} height={size} accessibilityLabel="Route preview">
      <Polyline
        points={pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}
        stroke={brand.forest}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx={start[0]} cy={start[1]} r={3.5} fill={brand.sage} />
      <Circle cx={end[0]} cy={end[1]} r={3.5} fill={brand.lavender} />
    </Svg>
  );
}
