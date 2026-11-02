import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowUpRight, ShieldCheck } from "lucide-react-native";
import { useSession } from "./session";
import { Button, c, Card, Field, s, Txt } from "./ui";

export function Login() {
  const session = useSession();
  const [origin, setOrigin] = useState(session.origin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            s.content,
            { paddingTop: 30, flexGrow: 1, justifyContent: "center" },
          ]}
        >
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: 21,
              backgroundColor: c.ink,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <Text style={[s.h, { color: c.green }]}>GRD</Text>
          </View>
          <Text style={s.label}>Supply Intelligence / mobile</Text>
          <Text
            style={[s.title, { fontSize: 39, lineHeight: 48, marginBottom: 5 }]}
          >
            Better decisions.{"\n"}Within reach.
          </Text>
          <Txt>
            Your network, stock and next actions—connected to the same
            operational record.
          </Txt>
          <Card>
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="Your team email"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secure
            />
            {session.error !== "" && (
              <Text style={[s.small, { color: c.red }]}>{session.error}</Text>
            )}
            <Button
              title={
                busy ? "Connecting securely…" : "Sign in to your workspace"
              }
              disabled={busy || !email.trim() || !password}
              onPress={() => {
                setBusy(true);
                void session
                  .login(origin, email, password)
                  .then(() => setPassword(""))
                  .catch((e) =>
                    session.setError(
                      e instanceof Error ? e.message : "Unable to connect.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            />
            <Button
              title={showServer ? "Hide server setting" : "Server connection"}
              secondary
              onPress={() => setShowServer((v) => !v)}
            />
            {showServer && (
              <>
                <Field
                  label="Backend server origin"
                  value={origin}
                  onChangeText={setOrigin}
                  placeholder="https://your-server.onrender.com"
                />
                <Txt small>
                  Android emulator: http://10.0.2.2:8011. iOS simulator:
                  http://127.0.0.1:8011. A phone needs the hosted HTTPS address
                  or a deliberately configured local connection. The server is
                  not hosted by Expo.
                </Txt>
              </>
            )}
          </Card>
          <View style={s.row}>
            <ShieldCheck size={19} color={c.dim} />
            <Text style={[s.small, { flex: 1 }]}>
              Native session tokens and pending actions use your device’s secure
              storage. Passwords are never saved.
            </Text>
            <ArrowUpRight size={17} color={c.dim} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
