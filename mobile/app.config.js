const expo = {
  name: "GRD Supply",
  slug: "grd-supply-mobile",
  version: "1.2.0",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "in.grdsupply.demo",
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    versionCode: 3,
    adaptiveIcon: {
      backgroundColor: "#193C32",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: true,
    package: "in.grdsupply.demo",
    permissions: ["CAMERA"],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
  },
  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    [
      "expo-camera",
      {
        cameraPermission:
          "Allow GRD Supply to scan internal batch and shipment QR labels. Images stay on your device.",
        recordAudioAndroid: false,
      },
    ],
    "expo-build-properties",
  ],
  scheme: "grdsupply",
};
const localDemo = process.env.GRD_ALLOW_LOCAL_HTTP === "1";

module.exports = {
  ...expo,
  plugins: [
    ...expo.plugins.filter(
      (p) => (Array.isArray(p) ? p[0] : p) !== "expo-build-properties",
    ),
    ["expo-build-properties", { android: { usesCleartextTraffic: localDemo } }],
  ],
  ios: {
    ...expo.ios,
    infoPlist: {
      ...expo.ios.infoPlist,
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
        ...(localDemo ? { NSAllowsArbitraryLoads: true } : {}),
      },
    },
  },
};
