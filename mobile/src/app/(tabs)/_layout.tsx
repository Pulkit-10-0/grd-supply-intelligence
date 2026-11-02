import React from "react";
import { Tabs } from "expo-router";
import { Boxes, CircleDot, House, Map, ShieldCheck } from "lucide-react-native";
import { c } from "../../ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const bottom = Math.max(useSafeAreaInsets().bottom, 12);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.dim,
        tabBarStyle: {
          backgroundColor: c.white,
          borderTopColor: c.line,
          paddingTop: 9,
          height: 70 + bottom,
          paddingBottom: bottom,
        },
        tabBarLabelStyle: {
          fontFamily: "DMSans_600SemiBold",
          fontSize: 10,
          marginTop: 4,
        },
        sceneStyle: { backgroundColor: c.paper },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color }) => <House size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: "Network",
          tabBarIcon: ({ color }) => <Map size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="actions"
        options={{
          title: "Actions",
          tabBarIcon: ({ color }) => <CircleDot size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: "Stock",
          tabBarIcon: ({ color }) => <Boxes size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => <ShieldCheck size={21} color={color} />,
        }}
      />
    </Tabs>
  );
}
