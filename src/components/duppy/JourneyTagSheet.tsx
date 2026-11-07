import { StyleSheet, Text, View } from 'react-native';

import { brand, space, type } from '@/constants/duppyTheme';
import { type Journey, setJourneyMode } from '@/lib/db';
import { europeBerlinDateKey } from '@/lib/geoMath';
import { formatDayKey } from '@/lib/explorationFilter';
import { formatClock, formatDuration, formatMeters } from '@/lib/format';
import { MODES, type Mode, suggestionLabel } from '@/lib/journeys';

import { RouteThumb } from './RouteThumb';
import { Chip, DuppyButton } from './primitives';
import { Sheet } from './Sheet';

export function journeyWhen(j: Pick<Journey, 'startTs' | 'endTs'>): string {
  return `${formatDayKey(europeBerlinDateKey(j.startTs))} · ${formatClock(j.startTs)}–${formatClock(j.endTs)}`;
}

// Tag a whole journey with how it was travelled. The app only suggests
// walking / cycling / "a vehicle" from speed; the person picks the mode.
export function JourneyTagSheet({
  journey,
  visible,
  onDismiss,
  onSaved,
}: {
  journey: Journey | null;
  visible: boolean;
  onDismiss: () => void;
  onSaved: () => void;
}) {
  async function choose(mode: Mode | null) {
    if (!journey) return;
    await setJourneyMode(journey.id, mode);
    onSaved();
    onDismiss();
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      {journey && (
        <>
          <Text style={styles.title}>How did you travel?</Text>
          <View style={styles.summary}>
            <RouteThumb path={journey.path} size={72} />
            <View style={{ flex: 1 }}>
              <Text style={styles.when}>{journeyWhen(journey)}</Text>
              <Text style={styles.meta}>
                {formatMeters(journey.distanceM)} · {formatDuration(journey.endTs - journey.startTs)}
              </Text>
              <Text style={styles.hint}>{suggestionLabel(journey.suggestion)}</Text>
            </View>
          </View>
          <Text style={styles.helper}>
            Tag the whole journey. Splitting one trip into walking, train and bus is planned for a later version.
          </Text>
          <View style={styles.chips}>
            {MODES.map((m) => (
              <Chip key={m.mode} label={m.label} active={journey.mode === m.mode} onPress={() => choose(m.mode)} />
            ))}
          </View>
          {journey.mode && <DuppyButton label="Remove tag" variant="secondary" onPress={() => choose(null)} />}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: brand.forest },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.sm },
  when: { ...type.body, fontFamily: 'Quicksand-SemiBold', color: brand.forest },
  meta: { ...type.caption, color: brand.forest, opacity: 0.8 },
  hint: { ...type.caption, color: brand.forest, opacity: 0.6, marginTop: 2 },
  helper: { ...type.caption, color: brand.forest, opacity: 0.7, marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.xs },
});
