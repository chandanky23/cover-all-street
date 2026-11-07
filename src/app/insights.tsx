import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JourneyTagSheet, journeyWhen } from '@/components/duppy/JourneyTagSheet';
import { RouteThumb } from '@/components/duppy/RouteThumb';
import { Card, SectionHeading } from '@/components/duppy/primitives';
import { brand, space, type } from '@/constants/duppyTheme';
import {
  type Journey,
  getBezirkCoverage,
  getHourlyActivity,
  getInsightsTotals,
  getModeTotals,
  getSavedFilter,
  getTopStreets,
  listJourneys,
} from '@/lib/db';
import { formatDuration, formatMeters, formatPct } from '@/lib/format';
import { modeLabel, suggestionLabel } from '@/lib/journeys';

type Totals = Awaited<ReturnType<typeof getInsightsTotals>>;
type DistrictRow = Awaited<ReturnType<typeof getBezirkCoverage>>[number];
type StreetRow = Awaited<ReturnType<typeof getTopStreets>>[number];

const highwayLabel: Record<string, string> = {
  residential: 'Residential street',
  tertiary: 'Tertiary road',
  secondary: 'Secondary road',
  primary: 'Primary road',
  unclassified: 'Unclassified road',
  living_street: 'Living street',
  pedestrian: 'Pedestrian street',
};

// Real rollups only — every figure here is a live query over
// segment_visits/area_visits (src/lib/db.ts), correctly all-zero/empty
// for a fresh install rather than Phase 1's placeholder numbers.
export default function InsightsScreen() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [topStreets, setTopStreets] = useState<StreetRow[]>([]);
  const [filterLabel, setFilterLabel] = useState('All time');
  const [hours, setHours] = useState<number[]>(new Array(24).fill(0));
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [modeTotals, setModeTotals] = useState<Awaited<ReturnType<typeof getModeTotals>>>([]);
  const [tagging, setTagging] = useState<Journey | null>(null);

  const refresh = useCallback(() => {
    // Same saved time filter the map uses, so both screens always agree.
    getSavedFilter().then((f) => {
      setFilterLabel(f.label);
      getInsightsTotals(f).then(setTotals);
      getBezirkCoverage(f).then((rows) =>
        setDistricts(rows.filter((r) => r.eligible_length_m && r.eligible_length_m > 0))
      );
      getTopStreets(20, f).then(setTopStreets);
      getHourlyActivity(f).then(setHours);
      listJourneys(f, 200).then(setJourneys);
      getModeTotals(f).then(setModeTotals);
    });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Text style={styles.pageTitle}>Insights</Text>
            <Text style={styles.filterNote}>{filterLabel}</Text>

            <Card>
              <SectionHeading>Overview</SectionHeading>
              <View style={styles.totalsGrid}>
                <Total label="Streets travelled" value={String(totals?.streetsTravelled ?? 0)} />
                <Total label="Length covered" value={formatMeters((totals?.lengthCoveredKm ?? 0) * 1000)} />
                <Total label="Districts visited" value={`${totals?.districtsVisited ?? 0} of 12`} />
                <Total label="Neighbourhoods" value={String(totals?.neighbourhoodsVisited ?? 0)} />
                <Total label="Active days" value={String(totals?.activeDays ?? 0)} />
                <Total label="Street passes" value={String(totals?.totalPasses ?? 0)} />
              </View>
            </Card>

            <JourneysCards
              journeys={journeys}
              modeTotals={modeTotals}
              onTag={(j) => setTagging(j)}
            />

            <Card>
              <SectionHeading>When you walk</SectionHeading>
              <HourChart hours={hours} />
            </Card>

            <Card>
              <SectionHeading>District breakdown</SectionHeading>
              {districts.length === 0 ? (
                <Text style={styles.emptyNote}>
                  No districts explored yet — walk somewhere with tracking on and it'll show up here.
                </Text>
              ) : (
                districts.map((d) => {
                  const pct = Math.min(100, (d.covered_length_m / d.eligible_length_m) * 100);
                  return (
                    <View key={d.name} style={styles.districtRow}>
                      <Text style={styles.districtName}>{d.name}</Text>
                      <View style={styles.districtBarTrack}>
                        <View style={[styles.districtBarFill, { width: `${pct > 0 ? Math.max(2, pct) : 0}%` }]} />
                      </View>
                      <Text style={styles.districtPct}>{formatPct(pct)}</Text>
                    </View>
                  );
                })
              )}
            </Card>

            <SectionHeading>Top streets</SectionHeading>
            {topStreets.length === 0 && (
              <Text style={styles.emptyNote}>
                No streets recorded yet — once you walk somewhere with tracking on, your most-visited
                streets will be ranked here.
              </Text>
            )}
          </>
        }
        data={topStreets}
        keyExtractor={(s) => s.segment_id}
        renderItem={({ item, index }) => (
          <Card>
            <View style={styles.streetRow}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.streetName}>{item.name ?? 'Unnamed street'}</Text>
                <Text style={styles.streetMeta}>
                  {highwayLabel[item.highway] ?? item.highway} · {item.traversal_count} pass
                  {item.traversal_count === 1 ? '' : 'es'} · {item.visit_days} day
                  {item.visit_days === 1 ? '' : 's'} · {formatMeters(item.covered_length_m)} covered
                </Text>
              </View>
            </View>
          </Card>
        )}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      />
      <JourneyTagSheet
        journey={tagging}
        visible={tagging !== null}
        onDismiss={() => setTagging(null)}
        onSaved={refresh}
      />
    </SafeAreaView>
  );
}

function JourneysCards({
  journeys,
  modeTotals,
  onTag,
}: {
  journeys: Journey[];
  modeTotals: { mode: string | null; distanceM: number; count: number }[];
  onTag: (j: Journey) => void;
}) {
  if (journeys.length === 0) {
    return (
      <Card>
        <SectionHeading>Journeys</SectionHeading>
        <Text style={styles.emptyNote}>
          Trips you record will show up here, and you can tag how you travelled — walking, cycling, bus, train and more.
        </Text>
      </Card>
    );
  }
  const untagged = journeys.filter((j) => j.mode === null).length;
  const maxDist = Math.max(...modeTotals.map((m) => m.distanceM), 1);
  return (
    <>
      <Card>
        <SectionHeading>How you travelled</SectionHeading>
        {modeTotals.map((m) => (
          <View key={m.mode ?? 'untagged'} style={styles.districtRow}>
            <Text style={styles.districtName}>{modeLabel(m.mode)}</Text>
            <View style={styles.districtBarTrack}>
              <View
                style={[
                  styles.districtBarFill,
                  { width: `${Math.max(2, (m.distanceM / maxDist) * 100)}%`, opacity: m.mode === null ? 0.4 : 1 },
                ]}
              />
            </View>
            <Text style={styles.modeDist}>{formatMeters(m.distanceM)}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <SectionHeading>{untagged > 0 ? `Tag your journeys (${untagged} to go)` : 'Recent journeys'}</SectionHeading>
        {journeys.slice(0, 8).map((j) => (
          <Pressable
            key={j.id}
            style={styles.journeyRow}
            onPress={() => onTag(j)}
            accessibilityRole="button"
            accessibilityLabel={`Journey ${journeyWhen(j)}, ${formatMeters(j.distanceM)}. ${j.mode ? modeLabel(j.mode) : 'Not tagged. Tap to tag'}`}>
            <RouteThumb path={j.path} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.journeyWhen}>{journeyWhen(j)}</Text>
              <Text style={styles.streetMeta}>
                {formatMeters(j.distanceM)} · {formatDuration(j.endTs - j.startTs)}
              </Text>
              {j.mode === null && <Text style={styles.streetMeta}>{suggestionLabel(j.suggestion)}</Text>}
            </View>
            <View style={[styles.modePill, j.mode === null && styles.modePillTag]}>
              <Text style={[styles.modePillText, j.mode === null && styles.modePillTextTag]}>
                {j.mode ? modeLabel(j.mode) : 'Tag'}
              </Text>
            </View>
          </Pressable>
        ))}
        {journeys.length > 8 && <Text style={styles.emptyNote}>Showing the latest 8 of {journeys.length}.</Text>}
      </Card>
    </>
  );
}

function HourChart({ hours }: { hours: number[] }) {
  const max = Math.max(...hours);
  if (max === 0) {
    return <Text style={styles.emptyNote}>Nothing recorded for this period yet.</Text>;
  }
  return (
    <View>
      <View style={styles.hourBars}>
        {hours.map((n, h) => (
          <View key={h} style={styles.hourCol}>
            <View style={[styles.hourBar, { height: Math.max(n > 0 ? 3 : 0, (n / max) * 64) }]} />
          </View>
        ))}
      </View>
      <View style={styles.hourAxis}>
        {['0h', '6h', '12h', '18h', '24h'].map((l) => (
          <Text key={l} style={styles.hourAxisLabel}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalCell}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: brand.cream },
  content: { padding: space.md, gap: space.sm },
  pageTitle: { ...type.display, color: brand.forest },
  filterNote: { ...type.caption, color: brand.forest, opacity: 0.6, marginBottom: space.sm },
  totalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  totalCell: { width: '45%' },
  totalValue: { ...type.title, color: brand.forest },
  totalLabel: { ...type.caption, color: brand.forest, opacity: 0.7 },
  districtRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 },
  districtName: { ...type.caption, color: brand.forest, width: 150 },
  districtBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: brand.unvisitedRoad, overflow: 'hidden' },
  districtBarFill: { height: 8, backgroundColor: brand.sage },
  districtPct: { ...type.caption, color: brand.forest, width: 56, textAlign: 'right' },
  streetRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rank: { ...type.heading, color: brand.forest, width: 24 },
  streetName: { ...type.body, fontFamily: 'Quicksand-SemiBold', color: brand.forest },
  streetMeta: { ...type.caption, color: brand.forest, opacity: 0.7 },
  hourBars: { flexDirection: 'row', alignItems: 'flex-end', height: 64, gap: 2 },
  hourCol: { flex: 1, justifyContent: 'flex-end', height: 64 },
  hourBar: { backgroundColor: brand.sage, borderRadius: 2 },
  hourAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  hourAxisLabel: { ...type.caption, color: brand.forest, opacity: 0.6 },
  modeDist: { ...type.caption, color: brand.forest, width: 64, textAlign: 'right' },
  journeyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, minHeight: 52 },
  journeyWhen: { ...type.body, fontFamily: 'Quicksand-SemiBold', color: brand.forest },
  modePill: { backgroundColor: brand.blush, borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 6 },
  modePillTag: { backgroundColor: brand.forest },
  modePillText: { ...type.caption, color: brand.forest },
  modePillTextTag: { color: brand.cream },
  emptyNote: { ...type.caption, color: brand.forest, opacity: 0.7, paddingVertical: space.sm },
});
