import { Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { colors } from '../../ui/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => (
  <Text style={{ fontSize: 20, color, fontWeight: '700' }}>{glyph}</Text>
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card },
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.ink },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('今') }} />
      <Tabs.Screen name="lessons" options={{ title: 'Lessons', tabBarIcon: icon('課') }} />
      <Tabs.Screen name="review" options={{ title: 'Review', tabBarIcon: icon('復') }} />
    </Tabs>
  );
}
