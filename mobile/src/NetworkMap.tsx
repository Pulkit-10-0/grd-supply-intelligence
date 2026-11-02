import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { LocateFixed, Minus, Plus } from "lucide-react-native";
import boundaries from "./boundaries.json";
import { useSession } from "./session";
import { c, detail, s, Txt } from "./ui";
import { riskLevel, shortLocation } from "../../shared/utils";

const colors: Record<string, string> = {
  critical: c.red,
  warning: c.amber,
  healthy: "#3D7653",
  unknown: "#819181",
};
export function NetworkMap({ large = false }: { large?: boolean }) {
  const { data, network, asOf } = useSession();
  const [zoom, setZoom] = useState(false);
  if (!data) return null;
  const sites = data.locations.filter(
    (l) => l.latitude != null && l.longitude != null,
  );
  const point = (id: string) => {
    const l = sites.find((x) => x.id === id);
    return l
      ? { x: (l.longitude! - 88) * 50, y: (29.8 - l.latitude!) * 55 }
      : null;
  };
  return (
    <View
      style={{
        backgroundColor: "#E8EEE1",
        borderRadius: 22,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: c.line,
      }}
    >
      <View style={[s.between, { paddingHorizontal: 16, paddingTop: 15 }]}>
        <Text style={s.label}>Northeast supply network</Text>
        <View style={s.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={zoom ? "Zoom out" : "Zoom to Assam"}
            onPress={() => setZoom((z) => !z)}
            style={s.chip}
          >
            {zoom ? (
              <Minus size={17} color={c.ink} />
            ) : (
              <Plus size={17} color={c.ink} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fit region"
            onPress={() => setZoom(false)}
            style={s.chip}
          >
            <LocateFixed size={17} color={c.ink} />
          </Pressable>
        </View>
      </View>
      <Svg
        width="100%"
        height={large ? 320 : 230}
        viewBox={zoom ? "158 98 215 226" : "5 4 470 390"}
      >
        {boundaries.map((b) => (
          <Path
            key={b.name}
            d={b.path}
            fill={b.name === "Assam" ? "#D2DEBC" : "#EDF1E6"}
            stroke="#B4C3A5"
            strokeWidth={0.8}
          />
        ))}
        <SvgText x="210" y="182" fontSize="12" letterSpacing="3" fill="#718367">
          ASSAM
        </SvgText>
        <SvgText x="220" y="288" fontSize="9" fill="#87977A">
          MIZORAM
        </SvgText>
        {!zoom && (
          <SvgText x="303" y="80" fontSize="10" fill="#87977A">
            ARUNACHAL PRADESH
          </SvgText>
        )}
        {data.routes
          .filter((r) => r.permitted)
          .slice(0, 30)
          .map((r) => {
            const a = point(r.origin_id),
              b = point(r.destination_id);
            return a && b ? (
              <Line
                key={r.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#708563"
                strokeWidth="1"
                strokeDasharray="3 4"
                opacity={0.3}
              />
            ) : null;
          })}
        {sites.map((l, index) => {
          const p = point(l.id)!;
          const row = network?.table.find((r) => r.location_id === l.id);
          const color = row ? colors[riskLevel(row, asOf)] : colors.unknown;
          const crowded = sites.some(
            (other, i) =>
              i < index &&
              Math.abs(other.latitude! - l.latitude!) < 0.1 &&
              Math.abs(other.longitude! - l.longitude!) < 0.1,
          );
          return (
            <React.Fragment key={l.id}>
              <Circle cx={p.x} cy={p.y} r="12" fill={color} opacity={0.12} />
              <Circle
                cx={p.x}
                cy={p.y}
                r="5"
                fill={color}
                stroke="#FFF"
                strokeWidth="2"
                onPress={() => detail("location", l.id)}
              />
              {!crowded && (
                <SvgText
                  x={p.x + 10}
                  y={p.y - 7}
                  fontSize="9"
                  fontWeight="600"
                  fill={c.ink}
                >
                  {shortLocation(l.name).replace(" Central", "")}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{ paddingHorizontal: 15, paddingBottom: 15, gap: 8 }}>
        <View style={s.row}>
          {[
            ["critical", "≤3 days"],
            ["warning", "Shortage"],
            ["healthy", "Covered"],
          ].map(([key, label]) => (
            <View style={s.row} key={key}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors[key],
                }}
              />
              <Text style={[s.small, { fontSize: 10 }]}>{label}</Text>
            </View>
          ))}
        </View>
        <Txt small>
          Illustrative links · Approximate town locations, no live GPS.
          {large
            ? "\nBoundaries: geoBoundaries / DataMeet / ECI · 2011 · CC BY 2.5 IN"
            : ""}
        </Txt>
      </View>
    </View>
  );
}
