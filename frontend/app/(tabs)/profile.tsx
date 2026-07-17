import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Modal } from "react-native";
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
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [betaPremium, setBetaPremium] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsage(await api.usage());
    } catch {}
    try {
      const f = await api.flags();
      setBetaPremium(!!f?.beta_premium_enabled);
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

  const dangerText = mode === "dark" ? "#EBA6A6" : "#8A2C2C";

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount();
      setShowDelete(false);
      await logout();
      router.replace("/login");
    } catch {
      toast("Could not delete account. Please try again.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const rows = [
    { icon: "stats-chart", label: "Insights & Analytics", onPress: () => router.push("/analytics") },
    { icon: "bulb", label: "Smart Brand Memory", onPress: () => router.push("/brand-memory") },
    { icon: "hardware-chip", label: "Automated Decisions & AI", onPress: () => router.push("/privacy-admt") },
    { icon: "gift", label: "Surprises & Milestones", onPress: () => router.push("/surprises") },
    { icon: "shield-checkmark", label: "Privacy Policy", onPress: () => router.push("/legal?doc=privacy") },
    { icon: "document-text", label: "Terms of Service", onPress: () => router.push("/legal?doc=terms") },
    { icon: "card", label: "Subscription Agreement", onPress: () => router.push("/legal?doc=subscription") },
    { icon: "information-circle", label: "AI Disclaimer", onPress: () => router.push("/legal?doc=disclaimer") },
    { icon: "accessibility", label: "Accessibility Statement", onPress: () => router.push("/legal?doc=accessibility") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 140 }} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 28, fontWeight: "700", fontFamily: fonts.display, marginBottom: 20 }}>Profile</Text>

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {betaPremium && (
              <View
                testID="beta-badge-profile"
                accessible
                accessibilityRole="text"
                accessibilityLabel="Beta — complimentary Premium access"
                style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.brandSoft, borderColor: c.brand, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}
              >
                <Ionicons name="flask" size={11} color={c.brand} importantForAccessibility="no" />
                <Text style={{ color: c.brand, fontWeight: "800", fontSize: 10, fontFamily: fonts.body, letterSpacing: 0.5 }}>BETA</Text>
              </View>
            )}
            <Badge label={premium ? "Premium" : "Free"} tone={premium ? "success" : "muted"} />
          </View>
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
                {betaPremium
                  ? "You're on complimentary Premium as a beta tester — unlimited generations & watermark-free exports, free during the beta."
                  : "Unlimited generations, no watermarks, priority AI & full brand storage."}
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
            accessibilityRole="switch"
            accessibilityLabel="Dark mode"
            accessibilityState={{ checked: mode === "dark" }}
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

        <Button title="Log out" variant="ghost" icon="log-out" onPress={async () => { await logout(); router.replace("/login"); }} testID="logout-button" style={{ marginTop: 20 }} />

        <Pressable
          onPress={() => setShowDelete(true)}
          testID="delete-account-button"
          accessibilityRole="button"
          accessibilityLabel="Delete my account and all data"
          style={{ marginTop: 12, paddingVertical: 14, alignItems: "center" }}
        >
          <Text style={{ color: dangerText, fontFamily: fonts.body, fontSize: 14, fontWeight: "600" }}>Delete my account</Text>
        </Pressable>

        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 11, textAlign: "center", marginTop: 20, lineHeight: 16 }}>
          CreatorForge v1.0 · Subscriptions auto-renew until cancelled. Manage or cancel anytime.{"\n"}AI-assisted tool for inspiration — you are responsible for final outputs & trademarks.
        </Text>
      </ScrollView>

      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}>
        <View style={styles.overlay}>
          <View accessibilityViewIsModal style={[styles.confirmCard, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.lg }]}>
            <View style={[styles.warnIcon, { backgroundColor: mode === "dark" ? "#3a1f1f" : "#FCE8E8" }]}>
              <Ionicons name="warning" size={28} color={dangerText} importantForAccessibility="no" />
            </View>
            <Text accessibilityRole="header" style={{ color: c.text, fontFamily: fonts.display, fontWeight: "700", fontSize: 20, textAlign: "center", marginTop: 14 }}>
              Delete account?
            </Text>
            <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 14, textAlign: "center", lineHeight: 20, marginTop: 8 }}>
              This permanently deletes your account, projects, brand kits, and generated assets. This cannot be undone.
            </Text>
            <Pressable
              testID="confirm-delete-button"
              accessibilityRole="button"
              accessibilityLabel="Permanently delete everything"
              accessibilityState={{ busy: deleting }}
              onPress={doDelete}
              disabled={deleting}
              style={{ marginTop: 20, backgroundColor: dangerText, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", opacity: deleting ? 0.6 : 1 }}
            >
              <Text style={{ color: mode === "dark" ? "#1a0d0d" : "#FFFFFF", fontFamily: fonts.body, fontWeight: "700", fontSize: 15 }}>
                {deleting ? "Deleting…" : "Delete everything"}
              </Text>
            </Pressable>
            <Pressable testID="cancel-delete-button" accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => setShowDelete(false)} style={{ marginTop: 10, paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ color: c.text, fontFamily: fonts.body, fontSize: 15, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  confirmCard: { width: "100%", maxWidth: 380, borderWidth: 1, padding: 24, alignItems: "center" },
  warnIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
});
