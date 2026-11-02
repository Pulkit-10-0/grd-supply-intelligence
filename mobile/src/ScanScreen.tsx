import React, { useState } from "react";
import { Platform, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { internalLabel } from "./queue";
import { useSession } from "./session";
import { Button, Card, Field, Heading, Page, Txt } from "./ui";

export function ScanScreen() {
  const { api, setError, refresh } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState(false);
  const [reading, setReading] = useState(false);
  const [value, setValue] = useState("");
  async function verify(raw: string) {
    if (reading) return;
    setReading(true);
    setCamera(false);
    try {
      const result = await api!.request<{
        batch?: { id: string };
        shipment?: { id: string };
      }>("/scan/" + encodeURIComponent(internalLabel(raw)));
      await refresh();
      router.replace({
        pathname: "/detail",
        params: result.shipment
          ? { kind: "shipment", id: result.shipment.id }
          : { kind: "batch", id: result.batch!.id },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to verify this label.");
    } finally {
      setReading(false);
    }
  }
  return (
    <Page
      title="Scan. Verify. Act."
      eyebrow="Internal labels / manual fallback"
    >
      <Button title="← Back to stock" secondary onPress={() => router.back()} />
      <Card>
        <Heading>Verify a batch or shipment</Heading>
        <Txt>
          Use a GRD internal label that identifies the batch record.
          Verification checks your organisation and site access against the
          server.
        </Txt>
        <Txt small>
          A retail product barcode does not prove a batch number or expiry.
          Camera images stay on the device; only the internal identifier is sent
          to your server.
        </Txt>
      </Card>
      {camera && permission?.granted && Platform.OS !== "web" && (
        <View style={{ height: 280, borderRadius: 22, overflow: "hidden" }}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={(result) => {
              if (!reading) void verify(result.data);
            }}
          />
        </View>
      )}
      {Platform.OS !== "web" && (
        <Button
          title={camera ? "Close camera" : "Open QR scanner"}
          secondary
          disabled={reading}
          onPress={() => {
            if (camera) {
              setCamera(false);
              return;
            }
            void (async () => {
              const result = permission?.granted
                ? permission
                : await requestPermission();
              if (result.granted) setCamera(true);
              else
                setError(
                  "Camera permission is unavailable. Enter the internal label below.",
                );
            })();
          }}
        />
      )}
      <Card>
        <Field
          label="Internal batch or shipment label"
          value={value}
          onChangeText={setValue}
          placeholder="GRD:SHIPMENT:shipment-id"
        />
        <Button
          title={reading ? "Verifying…" : "Verify internal label"}
          disabled={reading || !value.trim()}
          onPress={() => {
            void verify(value);
          }}
        />
      </Card>
    </Page>
  );
}
