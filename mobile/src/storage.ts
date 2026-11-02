import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { ChunkStore } from "./chunkStore";
import type { Store } from "./queue";

// Browser preview has session memory only; native outbox/token use OS secure storage.
const memory = new Map<string, string>();
export const vault: Store =
  Platform.OS === "web"
    ? {
        get: async (k) => memory.get(k) ?? null,
        set: async (k, v) => {
          memory.set(k, v);
        },
        remove: async (k) => {
          memory.delete(k);
        },
      }
    : new ChunkStore({
        get: (k) => SecureStore.getItemAsync(k),
        set: (k, v) =>
          SecureStore.setItemAsync(k, v, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          }),
        remove: (k) => SecureStore.deleteItemAsync(k),
      });
