import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { brand, space, type } from '@/constants/duppyTheme';
import { getAreaDetail, getSegmentDetail } from '@/lib/db';
import { ExplorationFilter, formatDayKey } from '@/lib/explorationFilter';
import { formatMeters, formatPct } from '@/lib/format';

import { Sheet } from './Sheet';

const highwayLabel: Record<string, string> = {
  residential: 'Residential street',
  tertiary: 'Tertiary road',
  secondary: 'Secondary road',
  primary: 'Primary road',
  unclassified: 'Unclassified road',
  living_street: 'Living street',
  pedestrian: 'Pedestrian street',
};

export type TappedFeature =
  | { kind: 'bezirk'; name: string; population?: string; areaId: string }
  | { kind: 'ortsteil'; name: string; areaId: string }
  | { kind: 'street'; name: string | null; highway: string; segmentId: string };

type SegmentStats = Awaited<ReturnType<typeof getSegmentDetail>>;
type AreaStats = Awaited<ReturnType<typeof getAreaDetail>>;

export function FeatureInfoSheet({
  feature,
  visible,
  filter,
  onDismiss,
}: {
  feature: TappedFeature | null;
  visible: boolean;
  filter: ExplorationFilter;
  onDismiss: () => void;
}) {
  const [segmentStats, setSegmentStats] = useState<SegmentStats | null>(null);
  const [areaStats, setAreaStats] = useState<AreaStats | null>(null);

  useEffect(() => {
    if (!feature || !visible) return;
    setSegmentStats(null);
    setAreaStats(null);
    if (feature.kind === 'street') {
      getSegmentDetail(feature.segmentId, filter).then(setSegmentStats);
    } else {
      getAreaDetail(feature.areaId, filter).then(setAreaStats);
    }
  }, [feature, visible, filter]);

  if (!feature) return null;

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      {feature.kind === 'bezirk' && (
        <>
          <Text style={styles.title}>{feature.name}</Text>
          <Text style={styles.subtitle}>Bezirk (Berlin district) · {filter.label}</Text>
          {feature.population && <Text style={styles.body}>Population: {Number(feature.population).toLocaleString()}</Text>}
          <AreaVisitSummary stats={areaStats} />
        </>
      )}
      {feature.kind === 'ortsteil' && (
        <>
          <Text style={styles.title}>{feature.name}</Text>
          <Text style={styles.subtitle}>Ortsteil (Berlin neighbourhood) · {filter.label}</Text>
          <AreaVisitSummary stats={areaStats} />
        </>
      )}
      {feature.kind === 'street' && (
        <>
          <Text style={styles.title}>{feature.name ?? 'Unnamed street'}</Text>
          <Text style={styles.subtitle}>
            {highwayLabel[feature.highway] ?? feature.highway} · {filter.label}
          </Text>
          <SegmentVisitSummary stats={segmentStats} />
        </>
      )}
      <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
    </Sheet>
  );
}

function DayList({ days }: { days: { day: string; passes?: number }[] }) {
  if (days.length === 0) return null;
  const shown = days.slice(0, 8);
  return (
    <View style={styles.dayList}>
      <Text style={styles.statLabel}>Days</Text>
      {shown.map((d) => (
        <Text key={d.day} style={styles.dayRow}>
          {formatDayKey(d.day)}
          {d.passes !== undefined ? ` · ${d.passes} pass${d.passes === 1 ? '' : 'es'}` : ''}
        </Text>
      ))}
      {days.length > shown.length && <Text style={styles.note}>and {days.length - shown.length} more</Text>}
    </View>
  );
}

function AreaVisitSummary({ stats }: { stats: AreaStats | null }) {
  if (!stats) return null;
  if (stats.days.length === 0) {
    return (
      <Text style={styles.note}>
        Nothing recorded here for this period — walking through with tracking on will fill this in.
      </Text>
    );
  }
  return (
    <>
      <View style={styles.statRow}>
        <Stat label="Days visited" value={String(stats.days.length)} />
        {stats.isBezirk && <Stat label="Streets walked" value={String(stats.streets)} />}
        {stats.isBezirk && <Stat label="Coverage" value={formatPct(stats.coveragePct)} />}
      </View>
      <DayList days={stats.days.map((day) => ({ day }))} />
      <Text style={styles.note}>
        Based only on your own recorded walks. Coverage is walked street length over all street length.
      </Text>
    </>
  );
}

function SegmentVisitSummary({ stats }: { stats: SegmentStats | null }) {
  if (!stats) return null;
  if (stats.days.length === 0) {
    return (
      <Text style={styles.note}>
        This street isn't recorded for this period — walking it with tracking on will paint it here.
      </Text>
    );
  }
  return (
    <>
      <View style={styles.statRow}>
        <Stat label="Passes" value={String(stats.passes)} />
        <Stat label="Days" value={String(stats.days.length)} />
        <Stat label="Covered" value={formatMeters(stats.coveredM)} />
      </View>
      <DayList days={stats.days} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: brand.forest },
  subtitle: { ...type.caption, color: brand.forest, opacity: 0.7, marginBottom: space.sm },
  body: { ...type.body, color: brand.forest, marginBottom: space.xs },
  note: { ...type.caption, color: brand.forest, opacity: 0.7, marginTop: space.sm },
  attribution: { ...type.caption, color: brand.forest, opacity: 0.5, marginTop: space.lg },
  dayList: { marginTop: space.md, gap: 2 },
  dayRow: { ...type.body, color: brand.forest },
  statRow: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  stat: { flex: 1 },
  statLabel: { ...type.caption, color: brand.forest, opacity: 0.6 },
  statValue: { ...type.body, fontFamily: 'Quicksand-SemiBold', color: brand.forest },
});
