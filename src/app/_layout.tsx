import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { DATABASE_NAME, migrate } from '../db/database';
import { colors } from '../ui/theme';

function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <Suspense fallback={<Loading />}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: colors.accent,
            headerTitleStyle: { color: colors.ink },
            headerStyle: { backgroundColor: colors.bg },
            contentStyle: { backgroundColor: colors.bg },
            headerBackTitle: 'Back',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="lesson/[id]" options={{ title: 'Lesson' }} />
          <Stack.Screen name="quiz" options={{ title: 'Quiz', presentation: 'fullScreenModal', headerShown: false }} />
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}
