import { StatusBar } from 'expo-status-bar';
import { LogBox, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CameraScreen } from './src/components/CameraScreen';
import { DeviceProfileProvider } from './src/features/deviceProfile';
import { SettingsProvider } from './src/features/settings';

// Expo Go-only notice (limited media-library access in Go); harmless for Camen's
// save flow and it otherwise parks a banner over the shutter row.
LogBox.ignoreLogs(['Androids permission requirements']);

export default function App() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <SettingsProvider>
          <DeviceProfileProvider>
            <StatusBar style="light" />
            <View style={styles.fill}>
              <CameraScreen />
            </View>
          </DeviceProfileProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0B0C0E' },
});
