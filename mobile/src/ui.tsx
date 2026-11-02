import React from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowUpRight, X } from "lucide-react-native";
import { router } from "expo-router";
import { useSession } from "./session";

export const c = {
  ink: "#193C32",
  dim: "#657A6E",
  paper: "#F5F6EF",
  white: "#FFFFFF",
  line: "#DFE5D8",
  green: "#C6DA8D",
  red: "#AC482F",
  amber: "#986B20",
  soft: "#EDF1E6",
};
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.paper },
  content: { padding: 22, paddingBottom: 32, gap: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  card: {
    backgroundColor: c.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.line,
    padding: 18,
    gap: 12,
  },
  title: {
    fontFamily: "Manrope_700Bold",
    fontSize: 29,
    color: c.ink,
    lineHeight: 37,
    letterSpacing: -1.1,
  },
  h: {
    fontFamily: "Manrope_700Bold",
    fontSize: 18,
    color: c.ink,
    lineHeight: 25,
    letterSpacing: -0.45,
  },
  text: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: c.ink,
    lineHeight: 21,
  },
  small: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: c.dim,
    lineHeight: 18,
  },
  label: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.1,
    color: c.dim,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.white,
    borderRadius: 14,
    padding: 14,
    minHeight: 50,
    color: c.ink,
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
  },
  button: {
    backgroundColor: c.ink,
    borderRadius: 15,
    paddingHorizontal: 18,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: c.white,
  },
  divider: { height: 1, backgroundColor: c.line },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: c.soft,
  },
});
export const Txt = ({
  children,
  small = false,
}: {
  children: React.ReactNode;
  small?: boolean;
}) => <Text style={small ? s.small : s.text}>{children}</Text>;
export const Heading = ({ children }: { children: React.ReactNode }) => (
  <Text style={s.h}>{children}</Text>
);
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && { backgroundColor: c.soft },
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: c.ink }]}>{title}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  numeric = false,
  secure = false,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  numeric?: boolean;
  secure?: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={numeric ? "number-pad" : "default"}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={c.dim}
        multiline={multiline}
      />
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Badge({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: string;
}) {
  const color = ["critical", "unknown", "conflict"].includes(tone)
    ? c.red
    : tone === "warning"
      ? c.amber
      : c.ink;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: tone === "critical" ? "#FBE9E1" : c.soft,
      }}
    >
      <Text style={[s.small, { color, fontFamily: "DMSans_600SemiBold" }]}>
        {text}
      </Text>
    </View>
  );
}
export function Go({ kind, id }: { kind: string; id: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View details"
      onPress={() => detail(kind, id)}
      style={[s.chip, { padding: 10 }]}
    >
      <ArrowUpRight size={19} color={c.ink} />
    </Pressable>
  );
}
export function detail(kind: string, id: string) {
  router.push({ pathname: "/detail", params: { kind, id } });
}
export function Empty({ text }: { text: string }) {
  return (
    <Card>
      <Txt>{text}</Txt>
    </Card>
  );
}
export function Page({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  const session = useSession();
  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={session.refreshing}
            onRefresh={() => {
              void session.refresh();
            }}
            tintColor={c.ink}
          />
        }
      >
        <View style={[s.between, { marginBottom: 4 }]}>
          <View style={{ gap: 6, flex: 1 }}>
            <Text style={s.label}>{eyebrow}</Text>
            <Text style={s.title}>{title}</Text>
          </View>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 15,
              backgroundColor: c.ink,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={[s.h, { fontSize: 13, color: c.green }]}>GRD</Text>
          </View>
        </View>
        {session.offline && (
          <Badge
            text="Offline snapshot · pending actions require server acceptance"
            tone="warning"
          />
        )}
        {!!session.error && (
          <Card style={{ backgroundColor: "#FBEFE8", borderColor: "#EDD4C5" }}>
            <View style={s.between}>
              <Text style={[s.small, { color: c.red, flex: 1 }]}>
                {session.error}
              </Text>
              <Pressable
                accessibilityLabel="Dismiss message"
                onPress={() => session.setError("")}
                hitSlop={10}
              >
                <X size={17} color={c.red} />
              </Pressable>
            </View>
          </Card>
        )}
        {session.pending.length > 0 && (
          <Pressable onPress={() => router.navigate("/more")}>
            <Badge
              text={`${session.pending.length} pending action${session.pending.length > 1 ? "s" : ""} · Review & sync`}
              tone="warning"
            />
          </Pressable>
        )}
        {children}
        <Text style={s.small}>
          {session.data?.me.evidence_type === "synthetic"
            ? "SYNTHETIC DEMO · Fictional sites and stock"
            : "Operational evidence · Check source provenance"}
          {"\n"}Scenario {session.asOf} ·{" "}
          {session.synced
            ? "Last fetched " +
              new Date(session.synced).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Not fetched"}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
export function Wait() {
  return (
    <View
      style={[
        s.screen,
        { justifyContent: "center", alignItems: "center", gap: 20 },
      ]}
    >
      <ActivityIndicator color={c.ink} />
      <Heading>GRD Supply Intelligence</Heading>
    </View>
  );
}
