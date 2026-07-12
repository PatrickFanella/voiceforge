import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProvider } from "@/providers/AppProvider";
import { Colors } from "@/constants/colors";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: Colors.dark.surface },
        headerTintColor: Colors.dark.text,
        contentStyle: { backgroundColor: Colors.dark.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="voice"
        options={{
          presentation: "modal",
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="job-detail"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen name="voice-review" options={{ headerShown: false }} />
      <Stack.Screen name="clock-out" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="safety-review" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="time-review" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="record-edit" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="job-edit" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AppProvider>
            <RootLayoutNav />
          </AppProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
