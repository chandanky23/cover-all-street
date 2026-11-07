import { describe, expect, it } from 'vitest';

import {
  europeBerlinDateKey,
  haversineMeters,
  pointInGeoJSONGeometry,
  pointToPolylineMeters,
  pointToSegmentMeters,
  polylineLengthMeters,
} from './geoMath';

describe('haversineMeters', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMeters({ lat: 52.52, lon: 13.405 }, { lat: 52.52, lon: 13.405 })).toBeCloseTo(0, 3);
  });

  it('matches a known real-world distance (Brandenburg Gate to Alexanderplatz, ~1.8km)', () => {
    const d = haversineMeters({ lat: 52.5163, lon: 13.3777 }, { lat: 52.5219, lon: 13.4132 });
    expect(d).toBeGreaterThan(1500);
    expect(d).toBeLessThan(2500);
  });
});

describe('pointToSegmentMeters', () => {
  it('is ~0 for a point exactly on the segment midpoint', () => {
    const p1 = { lat: 52.52, lon: 13.4 };
    const p2 = { lat: 52.52, lon: 13.41 };
    const mid = { lat: 52.52, lon: 13.405 };
    const { distanceM, t } = pointToSegmentMeters(mid, p1, p2);
    expect(distanceM).toBeLessThan(1);
    expect(t).toBeCloseTo(0.5, 1);
  });

  it('clamps t to the nearest endpoint when the point is off the end', () => {
    const p1 = { lat: 52.52, lon: 13.4 };
    const p2 = { lat: 52.52, lon: 13.41 };
    const beyondP2 = { lat: 52.52, lon: 13.42 };
    const { t } = pointToSegmentMeters(beyondP2, p1, p2);
    expect(t).toBe(1);
  });

  it('measures perpendicular offset correctly (~11m for ~0.0001 deg lat at this latitude)', () => {
    const p1 = { lat: 52.52, lon: 13.4 };
    const p2 = { lat: 52.52, lon: 13.41 };
    const offPoint = { lat: 52.5201, lon: 13.405 };
    const { distanceM } = pointToSegmentMeters(offPoint, p1, p2);
    expect(distanceM).toBeGreaterThan(8);
    expect(distanceM).toBeLessThan(14);
  });
});

describe('pointToPolylineMeters / polylineLengthMeters', () => {
  const polyline: [number, number][] = [
    [13.4, 52.52],
    [13.405, 52.52],
    [13.405, 52.525],
  ];

  it('finds the nearest of multiple segments, not just the first', () => {
    const nearSecondLeg = { lat: 52.523, lon: 13.4051 };
    const d = pointToPolylineMeters(nearSecondLeg, polyline);
    expect(d).toBeLessThan(15);
  });

  it('sums segment lengths for total polyline length', () => {
    const length = polylineLengthMeters(polyline);
    // ~340m east leg + ~555m north leg at this latitude
    expect(length).toBeGreaterThan(800);
    expect(length).toBeLessThan(950);
  });
});

describe('pointInGeoJSONGeometry', () => {
  const square: GeoJSON.Geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [13.0, 52.0],
        [13.1, 52.0],
        [13.1, 52.1],
        [13.0, 52.1],
        [13.0, 52.0],
      ],
    ],
  };

  it('is true for a point inside the ring', () => {
    expect(pointInGeoJSONGeometry({ lat: 52.05, lon: 13.05 }, square)).toBe(true);
  });

  it('is false for a point outside the ring', () => {
    expect(pointInGeoJSONGeometry({ lat: 52.5, lon: 13.5 }, square)).toBe(false);
  });

  it('respects holes', () => {
    const withHole: GeoJSON.Geometry = {
      type: 'Polygon',
      coordinates: [
        square.type === 'Polygon' ? square.coordinates[0] : [],
        [
          [13.04, 52.04],
          [13.06, 52.04],
          [13.06, 52.06],
          [13.04, 52.06],
          [13.04, 52.04],
        ],
      ],
    };
    expect(pointInGeoJSONGeometry({ lat: 52.05, lon: 13.05 }, withHole)).toBe(false);
    expect(pointInGeoJSONGeometry({ lat: 52.01, lon: 13.01 }, withHole)).toBe(true);
  });

  it('handles MultiPolygon', () => {
    const multi: GeoJSON.Geometry = { type: 'MultiPolygon', coordinates: [square.type === 'Polygon' ? square.coordinates : []] };
    expect(pointInGeoJSONGeometry({ lat: 52.05, lon: 13.05 }, multi)).toBe(true);
  });
});

describe('europeBerlinDateKey', () => {
  it('reads as CET (UTC+1) in January', () => {
    // 2026-01-15 23:30 UTC -> 2026-01-16 00:30 CET
    const ts = Date.UTC(2026, 0, 15, 23, 30);
    expect(europeBerlinDateKey(ts)).toBe('2026-01-16');
  });

  it('reads as CEST (UTC+2) in July', () => {
    // 2026-07-15 22:30 UTC -> 2026-07-16 00:30 CEST
    const ts = Date.UTC(2026, 6, 15, 22, 30);
    expect(europeBerlinDateKey(ts)).toBe('2026-07-16');
  });

  it('flips from CET to CEST at the spring transition (last Sunday of March, 01:00 UTC)', () => {
    // 2026's last Sunday of March is the 29th.
    const justBefore = Date.UTC(2026, 2, 29, 0, 59);
    const justAfter = Date.UTC(2026, 2, 29, 1, 0);
    expect(europeBerlinDateKey(justBefore)).toBe('2026-03-29'); // 01:59 CET
    expect(europeBerlinDateKey(justAfter)).toBe('2026-03-29'); // 03:00 CEST, same calendar day
  });

  it('flips from CEST to CET at the autumn transition (last Sunday of October, 01:00 UTC)', () => {
    // 2026's last Sunday of October is the 25th.
    const justBefore = Date.UTC(2026, 9, 25, 0, 59); // 02:59 CEST
    const justAfter = Date.UTC(2026, 9, 25, 1, 0); // 02:00 CET
    expect(europeBerlinDateKey(justBefore)).toBe('2026-10-25');
    expect(europeBerlinDateKey(justAfter)).toBe('2026-10-25');
  });

  it('handles the local midnight boundary correctly', () => {
    // 2026-06-10 21:59 UTC = 2026-06-10 23:59 CEST (still the 10th)
    // 2026-06-10 22:00 UTC = 2026-06-11 00:00 CEST (now the 11th)
    expect(europeBerlinDateKey(Date.UTC(2026, 5, 10, 21, 59))).toBe('2026-06-10');
    expect(europeBerlinDateKey(Date.UTC(2026, 5, 10, 22, 0))).toBe('2026-06-11');
  });
});
