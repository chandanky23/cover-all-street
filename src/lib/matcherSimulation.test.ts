import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { haversineMeters } from './geoMath';
import { decideMatch, nearestCandidate } from './matcher';
import type { StreetFeature } from './streetGraph';

// Walks along real Berlin streets (bundled OSM data) with realistic GPS
// noise and measures how the matcher behaves: how many fixes land on the
// street actually walked, and how many land on a wrong street.
const file = join(__dirname, '../../assets/geo/streets-by-district/Friedrichshain-Kreuzberg.geojson');
const streets: StreetFeature[] = JSON.parse(readFileSync(file, 'utf8')).features.map((f: any) => ({
  id: String(f.properties.id),
  name: f.properties.name ?? null,
  highway: f.properties.highway ?? 'unclassified',
  coords: f.geometry.coordinates,
}));

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

function chainOf(name: string): [number, number][] {
  const ways = streets.filter((s) => s.name === name && s.coords.length > 1);
  const pts: [number, number][] = [];
  const used = new Set<string>();
  let cur = ways[0];
  while (cur && !used.has(cur.id)) {
    used.add(cur.id);
    pts.push(...cur.coords);
    const end = cur.coords[cur.coords.length - 1];
    cur =
      ways.find((w) => !used.has(w.id) && haversineMeters({ lat: w.coords[0][1], lon: w.coords[0][0] }, { lat: end[1], lon: end[0] }) < 3)!;
  }
  return pts;
}

function walk(path: [number, number][], stepM: number, noiseM: number, seed: number) {
  const r = rng(seed);
  const out: { lat: number; lon: number }[] = [];
  let carry = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = { lat: path[i][1], lon: path[i][0] };
    const b = { lat: path[i + 1][1], lon: path[i + 1][0] };
    const len = haversineMeters(a, b);
    for (let d = stepM - carry; d <= len; d += stepM) {
      const f = d / len;
      const lat = a.lat + (b.lat - a.lat) * f + (gauss(r) * noiseM) / 111_000;
      const lon = a.lon + (b.lon - a.lon) * f + (gauss(r) * noiseM) / (111_000 * Math.cos((a.lat * Math.PI) / 180));
      out.push({ lat, lon });
      carry = len - d;
    }
    carry = len % stepM === 0 ? 0 : stepM - (len - Math.floor(len / stepM) * stepM);
  }
  return out;
}

function evaluate(name: string, noiseM: number, seed: number) {
  const path = chainOf(name);
  const pts = walk(path, 14, noiseM, seed);
  let right = 0;
  let wrong = 0;
  let rejected = 0;
  for (const p of pts) {
    const d = decideMatch(p, nearestCandidate(streets, p));
    if (!d.matched) rejected++;
    else if (streets.find((s) => s.id === d.segmentId)!.name === name) right++;
    else wrong++;
  }
  return { n: pts.length, right: right / pts.length, wrong: wrong / pts.length, rejected: rejected / pts.length };
}

describe('matcher on simulated real-street walks', () => {
  for (const [name, noise] of [
    ['Boxhagener Straße', 6],
    ['Boxhagener Straße', 10],
    ['Oranienstraße', 8],
    ['Frankfurter Allee', 8],
  ] as [string, number][]) {
    it(`${name} (GPS noise ${noise} m)`, () => {
      const r = evaluate(name, noise, 42);
      console.log(name, noise, JSON.stringify(r));
      expect(r.n).toBeGreaterThan(20);
      expect(r.right).toBeGreaterThan(0.7);
      expect(r.wrong).toBeLessThan(0.1);
    });
  }
});
