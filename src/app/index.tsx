import { Camera, type CameraRef, GeoJSONSource, Layer, Map, type MapRef, UserLocation } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { FeatureInfoSheet, TappedFeature } from '@/components/duppy/FeatureInfoSheet';
import { FilterSheet } from '@/components/duppy/FilterSheet';
import { HeatmapEditorSheet } from '@/components/duppy/HeatmapEditorSheet';
import { Legend } from '@/components/duppy/Legend';
import { brand, radius, space, touchTarget, type } from '@/constants/duppyTheme';
import { berlinBezirke, berlinOrtsteile, getBerlinStreetsUri } from '@/lib/berlinGeo';
import {
  getBezirkCoverage,
  getSavedFilter,
  getSavedHeatmapSettings,
  getSegmentVisitCounts,
  getVisitedOrtsteilNames,
  saveFilter,
} from '@/lib/db';
import { type HeatmapSettings, classifyCoverage, classifyVisits, defaultHeatmapSettings } from '@/lib/heatmapSettings';
import { ExplorationFilter, defaultFilter } from '@/lib/explorationFilter';
import { isTracking, requestForegroundPermission } from '@/lib/locationTask';

// Real Berlin Bezirke/Ortsteile boundaries (bundled GeoJSON, see
// docs/DECISIONS.md), shaded by real coverage computed from
// segment_visits/area_visits (src/lib/db.ts) — correctly flat/zero for
// a fresh install, filling in as the matcher records real walks
// (docs/STATUS.md Phase 4). The base style is an inline, tile-free
// background so the map needs no network at all; all drawing comes from
// the bundled GeoJSON below.
const OFFLINE_MAP_STYLE = JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#E4ECE2' } }],
});
const BERLIN: [number, number] = [13.405, 52.52];

// Zoom-level-of-detail: Bezirke fill is the city-overview shading; past
// this zoom we switch to Ortsteile outlines for neighbourhood-level
// orientation (plan.md "zoom into neighbourhoods then street network").
const DISTRICT_DETAIL_ZOOM = 12;
// Real street segments (99,186 named-street ways, see docs/DECISIONS.md)
// only render once zoomed in close enough to matter — matches plan.md's
// "do not draw every street in Berlin at full resolution on the initial
// frame."
const STREET_DETAIL_ZOOM = 14;

// A MapLibre `match` expression is only valid syntax with at least one
// label/output pair before its fallback — `['match', ['get','name'],
// fallback]` with zero pairs is malformed and crashes the layer
// (confirmed on-device, see docs/DECISIONS.md). Coverage data is always
// built through this helper so a fresh install (zero real visits
// anywhere) stays a flat color instead of hitting that crash.
function coverageFillExpression(entries: [string, string][], fallback: string, property = 'name'): string {
  if (entries.length === 0) return fallback;
  // MapLibre's typed color prop doesn't model `match` arrays; it accepts them at runtime.
  return ['match', ['get', property], ...entries.flat(), fallback] as unknown as string;
}

// How often the map re-reads real coverage/tracking state from SQLite —
// same cadence as Settings' own refresh, no reason for the two screens
// to disagree about whether tracking is on.
const REFRESH_INTERVAL_MS = 4000;

// A single bottom-sheet slot over the map shows tapped-feature details.
type ActiveSheet = 'none' | 'filter' | 'heatmap' | 'feature';

export default function HomeScreen() {
  const [filter, setFilter] = useState<ExplorationFilter>(defaultFilter);
  const [settings, setSettings] = useState<HeatmapSettings>(defaultHeatmapSettings);
  const [streetColorExpression, setStreetColorExpression] = useState<string>(
    defaultHeatmapSettings.frequencyColors.zero
  );
  const [sheet, setSheet] = useState<ActiveSheet>('none');
  const [tracking, setTracking] = useState(false);
  const [streetsUri, setStreetsUri] = useState<string | null>(null);
  const [nearStreetZoom, setNearStreetZoom] = useState(false);
  const [loadingStreets, setLoadingStreets] = useState(false);
  const [tappedFeature, setTappedFeature] = useState<TappedFeature | null>(null);
  const [districtFillColorExpression, setDistrictFillColorExpression] = useState<string>(
    defaultHeatmapSettings.coverageColors.zero
  );
  const [ortsteileFillColorExpression, setOrtsteileFillColorExpression] = useState<string>(
    defaultHeatmapSettings.coverageColors.zero
  );
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const segmentCountsRef = useRef<Map<string, number>>(new globalThis.Map());

  // Parsing the bundled street network takes a few seconds the first time
  // you zoom in. Show a small indicator until street lines are actually
  // on screen (polled, since the map's own "finished rendering" event
  // never fires while the location dot animates), with a safety timeout
  // so it can never get stuck.
  useEffect(() => {
    if (!nearStreetZoom || !streetsUri) {
      setLoadingStreets(false);
      return;
    }
    setLoadingStreets(true);
    let stopped = false;
    const poll = setInterval(async () => {
      try {
        const rendered = await mapRef.current?.queryRenderedFeatures({ layers: ['berlin-streets-line'] });
        if (!stopped && rendered && rendered.length > 0) setLoadingStreets(false);
      } catch {
        // map not ready yet; keep polling
      }
    }, 700);
    const timeout = setTimeout(() => setLoadingStreets(false), 30000);
    return () => {
      stopped = true;
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, [nearStreetZoom, streetsUri]);

  useEffect(() => {
    // Resolve the bundled asset's local URI once (cheap, just a file
    // path), but don't mount the GeoJSONSource until the camera is
    // actually near street zoom — MapLibre parses an entire source into
    // native memory as soon as it mounts, regardless of the Layer's own
    // minzoom (confirmed on-device, see docs/DECISIONS.md).
    getBerlinStreetsUri().then(setStreetsUri);
  }, []);

  const refreshRealData = useCallback(async () => {
    isTracking().then(setTracking);

    // Real Bezirk coverage %: covered length ÷ real eligible length,
    // both derived from actual street data (src/lib/db.ts). A lowest-
    // non-zero-band placeholder percentage (20) represents "visited at
    // all" for Ortsteile, which don't have a real per-Ortsteil eligible
    // length to compute an exact % against — see docs/STATUS.md.
    // Both screens read the same saved filter and palette, so what you
    // choose here is exactly what Insights shows too.
    const [savedFilter, saved] = await Promise.all([getSavedFilter(), getSavedHeatmapSettings()]);
    setFilter(savedFilter);
    setSettings(saved);
    const [bezirkRows, visitedOrtsteile, segmentCounts] = await Promise.all([
      getBezirkCoverage(savedFilter),
      getVisitedOrtsteilNames(savedFilter),
      getSegmentVisitCounts(savedFilter),
    ]);

    const districtEntries: [string, string][] = bezirkRows
      .filter((r) => r.eligible_length_m && r.eligible_length_m > 0)
      .map((r) => {
        const pct = Math.min(100, (r.covered_length_m / r.eligible_length_m) * 100);
        return [r.name, saved.coverageColors[classifyCoverage(pct, saved.coverageThresholds)]];
      });
    setDistrictFillColorExpression(coverageFillExpression(districtEntries, saved.coverageColors.zero));

    // "Visited at all" for Ortsteile uses the lowest non-zero coverage
    // band — they have no per-Ortsteil eligible length for a real %.
    const ortsteilEntries: [string, string][] = visitedOrtsteile.map((name) => [
      name,
      saved.coverageColors.upTo25,
    ]);
    setOrtsteileFillColorExpression(coverageFillExpression(ortsteilEntries, saved.coverageColors.zero));

    // Walked streets are painted by how often they were walked, using
    // the user's own palette and thresholds.
    segmentCountsRef.current = new globalThis.Map(segmentCounts.map((r) => [r.segment_id, r.count] as [string, number]));
    const streetEntries: [string, string][] = segmentCounts.map((r) => [
      r.segment_id,
      saved.frequencyColors[classifyVisits(r.count, saved.visitThresholds)],
    ]);
    setStreetColorExpression(coverageFillExpression(streetEntries, saved.frequencyColors.zero, 'id'));
  }, []);

  useEffect(() => {
    refreshRealData();
    const id = setInterval(refreshRealData, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshRealData]);

  function openFeature(feature: TappedFeature) {
    setTappedFeature(feature);
    setSheet('feature');
  }

  function closeSheet() {
    setSheet('none');
  }

  async function onRecenter() {
    const fg = await requestForegroundPermission();
    if (fg.status !== 'granted') {
      Alert.alert('Location needed', 'Duppy Map needs location access to recenter the map on where you are.');
      return;
    }
    try {
      // A real GPS fix can fail or take a while (indoors, location
      // services off, a weak signal) — a recenter button that just
      // silently does nothing when that happens is a dead end for the
      // user, so a bounded wait with honest feedback beats hanging
      // forever on a promise that may never resolve.
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
      cameraRef.current?.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: STREET_DETAIL_ZOOM + 1,
        duration: 800,
      });
    } catch {
      Alert.alert('Couldn’t get your location', 'Check that location services are turned on and try again.');
    }
  }

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={OFFLINE_MAP_STYLE}
        ref={mapRef}
        onRegionDidChange={(e) => {
          const zoom = e.nativeEvent.zoom;
          setNearStreetZoom((was) => {
            // small hysteresis band so hovering right at the threshold
            // doesn't rapidly mount/unmount the source
            if (was) return zoom >= STREET_DETAIL_ZOOM - 0.5;
            return zoom >= STREET_DETAIL_ZOOM;
          });
        }}>
        <Camera ref={cameraRef} initialViewState={{ center: BERLIN, zoom: 9.8 }} />
        <UserLocation />
        <GeoJSONSource
          id="berlin-bezirke"
          data={berlinBezirke}
          onPress={(e) => {
            const props = e.nativeEvent.features[0]?.properties;
            if (!props?.name) return;
            openFeature({ kind: 'bezirk', name: props.name, population: props.population, areaId: String(props.id) });
          }}>
          <Layer
            id="berlin-bezirke-fill"
            type="fill"
            maxzoom={DISTRICT_DETAIL_ZOOM}
            paint={{ 'fill-color': districtFillColorExpression, 'fill-opacity': 0.75 }}
          />
          <Layer
            id="berlin-bezirke-line"
            type="line"
            paint={{ 'line-color': brand.cream, 'line-width': 1.5 }}
          />
        </GeoJSONSource>
        <GeoJSONSource
          id="berlin-ortsteile"
          data={berlinOrtsteile}
          onPress={(e) => {
            const props = e.nativeEvent.features[0]?.properties;
            if (!props?.name) return;
            openFeature({ kind: 'ortsteil', name: props.name, areaId: String(props.id) });
          }}>
          <Layer
            id="berlin-ortsteile-fill"
            type="fill"
            minzoom={DISTRICT_DETAIL_ZOOM}
            paint={{ 'fill-color': ortsteileFillColorExpression, 'fill-opacity': 0.6 }}
          />
          <Layer
            id="berlin-ortsteile-line"
            type="line"
            minzoom={DISTRICT_DETAIL_ZOOM}
            paint={{ 'line-color': brand.forest, 'line-width': 1, 'line-opacity': 0.6 }}
          />
        </GeoJSONSource>
        {streetsUri && nearStreetZoom && (
          <GeoJSONSource
            id="berlin-streets"
            data={streetsUri}
            onPress={(e) => {
              // Thin lines overlap (dual carriageways, junctions); if the tap
              // touches several, prefer the one that has actually been walked.
              const hits = e.nativeEvent.features;
              let best = hits[0];
              let bestCount = -1;
              for (const f of hits) {
                const c = segmentCountsRef.current.get(String(f.properties?.id)) ?? 0;
                if (c > bestCount) {
                  best = f;
                  bestCount = c;
                }
              }
              const props = best?.properties;
              if (!props) return;
              openFeature({ kind: 'street', name: props.name ?? null, highway: props.highway, segmentId: String(props.id) });
            }}>
            <Layer
              id="berlin-streets-line"
              type="line"
              minzoom={STREET_DETAIL_ZOOM}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': streetColorExpression, 'line-width': 3 }}
            />
          </GeoJSONSource>
        )}
      </Map>

      <View style={styles.topRow}>
        <Pressable style={styles.filterChip} onPress={() => setSheet('filter')}>
          <Text style={styles.filterChipText}>{filter.label}</Text>
        </Pressable>
        <Pressable
          style={styles.trackingBadge}
          onPress={() => router.navigate('/settings')}
          accessibilityRole="button"
          accessibilityLabel={tracking ? 'Tracking is on. Open settings' : 'Tracking is off. Open settings to turn it on'}>
          <View style={[styles.trackingDot, { backgroundColor: tracking ? brand.sage : brand.unvisitedRoad }]} />
          <Text style={styles.trackingText}>{tracking ? 'Tracking' : 'Tracking off'}</Text>
        </Pressable>
      </View>

      {loadingStreets && (
        <View style={styles.loadingPill} pointerEvents="none">
          <ActivityIndicator size="small" color={brand.forest} />
          <Text style={styles.trackingText}>Loading streets…</Text>
        </View>
      )}

      <View style={styles.bottomLeft}>
        <Legend settings={settings} />
      </View>

      <View style={styles.bottomRight}>
        <Pressable style={styles.fab} onPress={onRecenter} accessibilityLabel="Recenter on my location">
          <Text style={styles.fabIcon}>◎</Text>
        </Pressable>
        <Pressable style={styles.fab} onPress={() => setSheet('heatmap')} accessibilityLabel="Customize heatmap colours">
          <Text style={styles.fabIcon}>🎨</Text>
        </Pressable>
      </View>

      <FilterSheet
        visible={sheet === 'filter'}
        filter={filter}
        onDismiss={closeSheet}
        onApply={(f) => {
          setFilter(f);
          saveFilter(f).then(refreshRealData);
        }}
      />
      <HeatmapEditorSheet visible={sheet === 'heatmap'} onDismiss={closeSheet} onSaved={refreshRealData} />
      <FeatureInfoSheet filter={filter} feature={tappedFeature} visible={sheet === 'feature'} onDismiss={closeSheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  topRow: {
    position: 'absolute',
    top: 48,
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterChip: {
    backgroundColor: brand.cream,
    borderRadius: radius.chip,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    minHeight: touchTarget,
    justifyContent: 'center',
  },
  filterChipText: { ...type.label, color: brand.forest },
  trackingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: brand.cream,
    borderRadius: radius.chip,
    paddingHorizontal: space.md,
    minHeight: touchTarget,
  },
  loadingPill: {
    position: 'absolute',
    alignSelf: 'center',
    top: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: brand.cream,
    borderRadius: radius.chip,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  trackingDot: { width: 10, height: 10, borderRadius: 5 },
  trackingText: { ...type.caption, color: brand.forest },
  bottomLeft: { position: 'absolute', left: space.md, bottom: space.xl },
  bottomRight: { position: 'absolute', right: space.md, bottom: space.xl, gap: space.sm },
  fab: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    backgroundColor: brand.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: { fontSize: 20 },
});
