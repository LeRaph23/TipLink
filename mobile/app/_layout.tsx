import { Tabs } from 'expo-router';

export default function AppLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="(tabs)/write"
        options={{ title: 'Encode', tabBarLabel: 'Encode' }}
      />
      <Tabs.Screen
        name="(tabs)/scan"
        options={{ title: 'Scan', tabBarLabel: 'Scan' }}
      />
    </Tabs>
  );
}
