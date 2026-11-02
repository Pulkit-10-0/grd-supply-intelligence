import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Manrope_700Bold } from "@expo-google-fonts/manrope";
import {
  DMSans_400Regular,
  DMSans_600SemiBold,
} from "@expo-google-fonts/dm-sans";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../session";
import { c, Wait } from "../ui";
import { Login } from "../Login";

export { ErrorBoundary } from "expo-router";
function Gate() {
  const session = useSession();
  if (session.loading) return <Wait />;
  if (!session.data) return <Login />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.paper },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="detail" options={{ presentation: "modal" }} />
      <Stack.Screen name="operations" options={{ presentation: "modal" }} />
      <Stack.Screen name="scan" options={{ presentation: "modal" }} />
    </Stack>
  );
}
export default function Layout() {
  const [loaded, error] = useFonts({
    Manrope_700Bold,
    DMSans_400Regular,
    DMSans_600SemiBold,
  });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
