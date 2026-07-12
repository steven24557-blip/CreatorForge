import { Platform } from "react-native";
import Constants from "expo-constants";

// Native In-App Purchase product IDs — must match App Store Connect (auto-renewable
// subscription group) and Google Play Console (subscription base plans) exactly.
export const PRODUCT_IDS = ["pro.monthly", "pro.yearly"] as const;

export const PLAN_TO_PRODUCT: Record<"monthly" | "yearly", string> = {
  monthly: "pro.monthly",
  yearly: "pro.yearly",
};

export const PRODUCT_TO_PLAN: Record<string, "monthly" | "yearly"> = {
  "pro.monthly": "monthly",
  "pro.yearly": "yearly",
};

// Native IAP only works in a real dev/production build (not Expo Go, not web).
// storeClient === Expo Go. Web always uses the Stripe checkout fallback.
export const IAP_AVAILABLE =
  Platform.OS !== "web" && Constants.executionEnvironment !== "storeClient";
