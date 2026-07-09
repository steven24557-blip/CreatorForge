import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { useFeedback } from "@/src/context/FeedbackContext";
import { api } from "@/src/api/client";
import { Card, Badge, Button } from "@/src/components/ui";

export default function Profile() {
  const { c, fonts, radius, mode, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const { toast } = useFeedback();

  const [usage, setUsage] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setUsage(await api.usage());
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const premium = usage?.plan === "premium";

  const restore = async () => {
    await refresh();
    await load();
    const u = await api.usage();
    toast(u.plan === "premium" ? "Premium restored!" : "No active premium found", u.plan === "premium" ? "success" : "info");
  };

  const rows = [
    { icon: "gift", label: "Surprises & Milestones", onPress: () => router.push("/surprises") },
    { icon: "shield-checkmark", label: "Privacy Policy", onPress: () => router.push("/legal?doc=privacy") },
    { icon: "document-text", label: "Terms & Subscription", onPress: () => router.push("/legal?doc=terms") },
    { icon: "information-circle", label: "AI Disclaimer", onPress: () => router.push("/legal?doc=disclaimer") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: c.text, fontSize: 28, fontWeight: "700", fontFamily: fonts.display, marginBottom: 20 }}>Profile</Text>

        <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={[styles.avatar, { backgroundColor: c.brand }]}>
            <Text style={{ color: c.onBrand, fontSize: 24, fontWeight: "700", fontFamily: fonts.display }}>
              {(user?.name || "C").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: "700", fontFamily: fonts.display }} numberOfLines={1}>
              {user?.name}
            </Text>
            <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13 }} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
          <Badge label={premium ? "Premium" : "Free"} tone={premium ? "success" : "muted"} />
        </Card>

        {/* Plan card */}
        <Card style={{ marginTop: 16 }}>
          {premium ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="star" size={20} color={c.brand} />
                <Text style={{ color: c.text, fontWeight: "700", fontFamily: fonts.display, fontSize: 17 }}>Premium active</Text>
              </View>
              <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginTop: 6 }}>
                Unlimited generations, no watermarks, priority AI & full brand storage.
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: c.text, fontWeight: "700", fontFamily: fonts.display, fontSize: 17 }}>Upgrade to Premium</Text>
              <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginTop: 6, marginBottom: 14 }}>
                Unlimited AI generations, watermark-free exports & advanced refinement.
              </Text>
              <Button title="See plans" icon="flash" onPress={() => router.push("/paywall")} testID="profile-upgrade-button" />
            </>
          )}
          <Pressable onPress={restore} style={{ marginTop: 12 }} testID="restore-purchases-button">
            <Text style={{ color: c.brand, fontFamily: fonts.body, fontSize: 13, fontWeight: "600" }}>Restore purchases</Text>
          </Pressable>
        </Card>

        {/* Appearance */}
        <Card style={{ marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name={mode === "dark" ? "moon" : "sunny"} size={20} color={c.brand} />
            <Text style={{ color: c.text, fontFamily: fonts.body, fontSize: 15, fontWeight: "600" }}>
              {mode === "dark" ? "Dark mode" : "Light mode"}
            </Text>
          </View>
          <Switch
            testID="theme-toggle"
            value={mode === "dark"}
            onValueChange={toggle}
            trackColor={{ true: c.brand, false: c.card2 }}
            thumbColor="#fff"
          />
        </Card>

        {/* Links */}
        <View style={{ marginTop: 16, backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
          {rows.map((r, i) => (
            <Pressable
              key={r.label}
              testID={`profile-row-${r.icon}`}
              onPress={r.onPress}
              style={[styles.row, { borderTopColor: c.divider, borderTopWidth: i === 0 ? 0 : 1 }]}
            >
              <Ionicons name={r.icon as any} size={20} color={c.textDim} />
              <Text style={{ color: c.text, flex: 1, fontFamily: fonts.body, fontSize: 15 }}>{r.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={c.textMute} />
            </Pressable>
          ))}
        </View>

        <Button title="Log out" variant="ghost" icon="log-out" onPress={logout} testID="logout-button" style={{ marginTop: 20 }} />

        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 11, textAlign: "center", marginTop: 20, lineHeight: 16 }}>
          CreatorForge v1.0 · Subscriptions auto-renew until cancelled. Manage or cancel anytime.{"\n"}AI-assisted tool for inspiration — you are responsible for final outputs & trademarks.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
});
