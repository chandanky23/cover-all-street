import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, DuppyButton, SectionHeading } from '@/components/duppy/primitives';
import { brand, space, type } from '@/constants/duppyTheme';
import { backupFileName, parseBackup } from '@/lib/backup';
import { countObservations, deleteAllUserData, exportBackup, importBackup } from '@/lib/db';
import { formatDayKey } from '@/lib/explorationFilter';
import {
  isTracking,
  requestBackgroundPermission,
  requestForegroundPermission,
  requestNotificationPermission,
  startTrackingAndRemember,
  stopTrackingAndRemember,
} from '@/lib/locationTask';

async function openBatterySettings() {
  try {
    if (Platform.OS === 'android') {
      await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
      return;
    }
  } catch {
    // fall through to the generic app settings page
  }
  await Linking.openSettings();
}

export default function SettingsScreen() {
  const [tracking, setTracking] = useState(false);
  const [count, setCount] = useState(0);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    isTracking().then(setTracking);
    countObservations().then(setCount);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  async function onToggleTracking(next: boolean) {
    if (next) {
      // Staged, same as the welcome flow: foreground first, background
      // only if that's granted.
      const fg = await requestForegroundPermission();
      if (fg.status !== 'granted') {
        setStatusNote('location permission needed');
        Alert.alert('Location needed', 'Duppy Map needs location access to record the streets you walk.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
        refresh();
        return;
      }
      await requestNotificationPermission();
      const bg = await requestBackgroundPermission();
      await startTrackingAndRemember();
      setStatusNote(bg.status === 'granted' ? null : 'tracking (while the app is open)');
    } else {
      await stopTrackingAndRemember();
      setStatusNote(null);
    }
    refresh();
  }

  async function onBackup() {
    if (busy) return;
    setBusy(true);
    try {
      const backup = await exportBackup();
      if (backup.segmentDays.length === 0) {
        Alert.alert('Nothing to back up yet', 'Walk somewhere with tracking on first — then your history can be saved.');
        return;
      }
      const file = new File(Paths.cache, backupFileName(Date.now()));
      file.create({ overwrite: true });
      await file.write(JSON.stringify(backup));
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This phone has no app that can receive a shared file.');
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Duppy Map backup' });
    } catch {
      Alert.alert('Backup failed', 'Your data is unchanged. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]) return;
      const text = await new File(picked.assets[0].uri).text();
      const parsed = parseBackup(text);
      if (!parsed.ok) {
        Alert.alert("Can't restore this file", parsed.error);
        return;
      }
      const b = parsed.backup;
      const days = new Set(b.segmentDays.map((r) => r.visit_day));
      const latest = [...days].sort().pop();
      Alert.alert(
        'Replace your history?',
        `This backup has ${b.segments.length} streets over ${days.size} days${latest ? ` (latest ${formatDayKey(latest)})` : ''}. ` +
          'Restoring replaces everything currently in the app.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              try {
                await importBackup(b);
                setStatusNote(null);
                Alert.alert('Restored', 'Your history is back. Open the map or Insights to see it.');
              } catch {
                Alert.alert('Restore failed', 'Your existing data was not changed.');
              }
            },
          },
        ]
      );
    } catch {
      Alert.alert('Restore failed', 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  }

  function onDeleteAll() {
    Alert.alert('Delete all data?', 'This removes all travel history from this device. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteAllUserData();
          setStatusNote(null);
          refresh();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Settings</Text>

        <Card>
          <SectionHeading>Tracking</SectionHeading>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Background tracking</Text>
            <Switch
              value={tracking}
              onValueChange={onToggleTracking}
              trackColor={{ true: brand.sage }}
              accessibilityLabel="Background tracking"
            />
          </View>
          <Text style={styles.statusLine}>
            status: {statusNote ?? (tracking ? 'tracking' : 'off')} · points recorded: {count}
          </Text>
          <Text style={styles.helperText}>
            Duppy Map records your location in the background, even while your phone is locked, so it
            can paint streets you've explored. Battery use increases while tracking is on.
          </Text>
        </Card>

        <Card>
          <SectionHeading>Keep tracking running</SectionHeading>
          <Text style={styles.helperText}>
            Some phones pause background apps to save battery. If tracking stops on its own, set
            Duppy Map to "Unrestricted" (or "No restrictions") under battery use. After restarting
            your phone, open Duppy Map once and tracking resumes by itself.
          </Text>
          <DuppyButton label="Open battery settings" variant="secondary" onPress={openBatterySettings} />
        </Card>

        <Card>
          <SectionHeading>Your data</SectionHeading>
          <Text style={styles.helperText}>
            All travel history stays on this device in a local database. Nothing is uploaded, and
            there is no account or login. A backup is a file you save yourself — if you change or
            lose your phone, restoring it brings your history back.
          </Text>
          <DuppyButton label="Back up my data" variant="secondary" onPress={onBackup} />
          <DuppyButton label="Restore from backup" variant="secondary" onPress={onRestore} />
          <DuppyButton label="Delete all data" variant="secondary" onPress={onDeleteAll} />
        </Card>

        <Card>
          <SectionHeading>About</SectionHeading>
          <Text style={styles.helperText}>Duppy Map v1.0.0</Text>
          <Text style={styles.helperText}>
            Map data © OpenStreetMap contributors, available under the Open Database License
            (ODbL).
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: brand.cream },
  content: { padding: space.md, gap: space.sm },
  pageTitle: { ...type.display, color: brand.forest, marginBottom: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { ...type.body, color: brand.forest },
  statusLine: { ...type.caption, color: brand.forest, opacity: 0.7 },
  helperText: { ...type.caption, color: brand.forest, opacity: 0.8 },
});
