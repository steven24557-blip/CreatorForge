import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button } from "@/src/components/ui";
import { HERO_IMAGE } from "@/src/constants/app";

const FEATURES = [
  "Unlimited AI generations",
  "Watermark-free exports",
  "Advanced conversational refinement",
  "Full brand kit storage",
  "Priority AI responses",
  "Milestone rewards & vault themes",
];

export default function Paywall() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast, celebrate } = useFeedback();

  const [packages, setPackages] = useState<any>(null);
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.packages().then((r) => setPackages(r.packages)).catch(() => {});
  }, []);

  const pollStatus = async (sessionId: string, tries = 0) => {
    if (tries > 8) {
      toast("Payment pending — pull to refresh later", "info");
      return;
    }
    try {
      const s = await api.paymentStatus(sessionId);
      if (s.payment_status === "paid") {
        celebrate({ title: "Welcome to Premium!", desc: "Unlimited generations & watermark-free exports are now unlocked.", reward: "Premium activated" });
        router.replace("/(tabs)");
        return;
      }
      if (s.status === "expired") {
        toast("Checkout expired", "error");
        return;
      }
    } catch {}
    setTimeout(() => pollStatus(sessionId, tries + 1), 2000);
  };

  const restore = async () => {
    try {
      const u = await api.usage();
      if (u.plan === "premium") {
        celebrate({ title: "Premium restored!", desc: "Your Premium access is active again.", reward: "Premium activated" });
        router.replace("/(tabs)");
      } else {
        toast("No active Premium found on this account", "info");
      }
    } catch {
      toast("Could not restore purchases", "error");
    }
  };

  const subscribe = async () => {
    setBusy(true);
    try {
      const origin =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin
          : process.env.EXPO_PUBLIC_BACKEND_URL!;
      const { url, session_id } = await api.checkout(plan, origin);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = url;
      } else {
        await WebBrowser.openBrowserAsync(url);
        pollStatus(session_id);
      }
    } catch (e: any) {
      toast(e.message || "Checkout failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const monthly = packages?.monthly;
  const yearly = packages?.yearly;
  const savingsPct = monthly && yearly ? Math.round((1 - yearly.amount / (monthly.amount * 12)) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Image accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={{ uri: HERO_IMAGE }} style={{ width: "100%", height: 300, position: "absolute" }} />
      <LinearGradient colors={["rgba(15,15,15,0.4)", "rgba(15,15,15,0.9)", c.bg]} style={{ width: "100%", height: 300, position: "absolute" }} />

      <Pressable onPress={() => router.back()} style={{ position: "absolute", top: insets.top + 8, left: 16, zIndex: 10 }} testID="paywall-close" hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
        <Ionicons name="close" size={28} color="#fff" />
      </Pressable>

      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 90, paddingBottom: insets.bottom + 140 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.crown, { backgroundColor: c.brand }]}>
          <Ionicons name="star" size={26} color={c.onBrand} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: "#fff", fontFamily: fonts.display }]}>CreatorForge Premium</Text>
        <Text style={[styles.sub, { color: "rgba(255,255,255,0.8)", fontFamily: fonts.body }]}>
          Everything you need to forge a brand — without limits.
        </Text>

        <View style={{ marginTop: 28, gap: 12 }}>
          <PlanCard
            testID="plan-yearly"
            selected={plan === "yearly"}
            onPress={() => setPlan("yearly")}
            title="Annual"
            price={yearly ? `$${yearly.amount}/yr` : "$149/yr"}
            note={savingsPct > 0 ? `Save ${savingsPct}% · best value` : "Best value"}
            highlight
            c={c}
            fonts={fonts}
            radius={radius}
          />
          <PlanCard
            testID="plan-monthly"
            selected={plan === "monthly"}
            onPress={() => setPlan("monthly")}
            title="Monthly"
            price={monthly ? `$${monthly.amount}/mo` : "$14.99/mo"}
            note="Flexible, cancel anytime"
            c={c}
            fonts={fonts}
            radius={radius}
          />
        </View>

        <View style={{ marginTop: 28 }}>
          {FEATURES.map((f) => (
            <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Ionicons name="checkmark-circle" size={20} color={c.brand} />
              <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 15 }}>{f}</Text>
            </View>
          ))}
        </View>

        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 12 }}>
          Payment is charged to your account at confirmation. Subscriptions renew until cancelled; manage or cancel anytime from your account. Prices in USD.
        </Text>

        <View style={styles.linksRow}>
          <Pressable onPress={restore} testID="paywall-restore-button" accessibilityRole="button" accessibilityLabel="Restore purchases" hitSlop={8}>
            <Text style={{ color: c.brand, fontFamily: fonts.body, fontSize: 13, fontWeight: "700" }}>Restore Purchases</Text>
          </Pressable>
          <Text style={{ color: c.textMute }}>·</Text>
          <Pressable onPress={() => router.push("/legal?doc=terms")} accessibilityRole="link" accessibilityLabel="Terms of Service" hitSlop={8}>
            <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13 }}>Terms</Text>
          </Pressable>
          <Text style={{ color: c.textMute }}>·</Text>
          <Pressable onPress={() => router.push("/legal?doc=subscription")} accessibilityRole="link" accessibilityLabel="Subscription Agreement" hitSlop={8}>
            <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13 }}>Subscription</Text>
          </Pressable>
          <Text style={{ color: c.textMute }}>·</Text>
          <Pressable onPress={() => router.push("/legal?doc=privacy")} accessibilityRole="link" accessibilityLabel="Privacy Policy" hitSlop={8}>
            <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13 }}>Privacy</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: c.bg, borderTopColor: c.divider, paddingBottom: insets.bottom + 16 }]}>
        <Button
          title={`Continue — ${plan === "yearly" ? (yearly ? `$${yearly.amount}/yr` : "$149/yr") : (monthly ? `$${monthly.amount}/mo` : "$14.99/mo")}`}
          onPress={subscribe}
          loading={busy}
          testID="subscribe-button"
        />
      </View>
    </View>
  );
}

function PlanCard({ selected, onPress, title, price, note, highlight, c, fonts, radius, testID }: any) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        borderWidth: 2,
        borderColor: selected ? c.brand : c.border,
        backgroundColor: selected ? c.brandSoft : c.card,
        borderRadius: radius.lg,
        padding: 18,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: c.text, fontFamily: fonts.display, fontWeight: "700", fontSize: 18 }}>{title}</Text>
          {highlight && (
            <View style={{ backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: c.onBrand, fontSize: 10, fontWeight: "700", fontFamily: fonts.body }}>POPULAR</Text>
            </View>
          )}
        </View>
        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginTop: 2 }}>{note}</Text>
      </View>
      <Text style={{ color: c.text, fontFamily: fonts.display, fontWeight: "700", fontSize: 18 }}>{price}</Text>
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? c.brand : c.textMute} style={{ marginLeft: 10 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  crown: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "700", marginTop: 18 },
  sub: { fontSize: 15, marginTop: 8, lineHeight: 22 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, borderTopWidth: 1 },
  linksRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 8, marginTop: 16 },
});
