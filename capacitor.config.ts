import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "in.trounce.app",
  appName: "Trounce",
  webDir: "dist/client",
  server: {
    // Connects directly to the live full-stack production server
    url: "https://t-trounce.onrender.com",
    cleartext: true,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;

