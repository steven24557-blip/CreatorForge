import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { Card, Badge, SectionTitle } from "@/src/components/ui";
import { HERO_IMAGE, STATUS, MILESTONE_ORDER, MILESTONE_ICONS } from "@/src/constants/app";

export default function Dashboard() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [usage, setUsage] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, p] = await Promise.all([api.usage(), api.projects()]);
      setUsage(u);
      setProjects(p.projects || []);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  const premium = usage?.plan === "premium";
  const genUsed = usage?.generations_used ?? 0;
  const genLimit = usage?.generations_limit;
  const unlockedCount = usage?.unlocked?.length ?? 0;

  const quicks = [
    { icon: "add-circle", label: "New Idea", sub: "Capture & refine", onPress: () => router.push("/capture") },
    { icon: "color-wand", label: "Start Branding", sub: "Create a brand kit", onPress: () => router.push("/(tabs)/studio") },
    { icon: "gift", label: "Surprises", sub: `${unlockedCount} unlocked`, onPress: () => router.push("/surprises") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Image source={{ uri: HERO_IMAGE }} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={["rgba(15,15,15,0.3)", "rgba(15,15,15,0.85)", c.bg]}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 24 }}>
            <View style={styles.topRow}>
              <View>
                <Text style={[styles.greeting, { color: "rgba(255,255,255,0.7)", fontFamily: fonts.body }]}>
                  {greeting()},
                </Text>
                <Text style={[styles.name, { color: "#fff", fontFamily: fonts.display }]}>
                  {user?.name?.split(" ")[0] || "Creator"}
                </Text>
              </View>
              <Pressable
                testID="dashboard-plan-badge"
                onPress={() => router.push(premium ? "/(tabs)/profile" : "/paywall")}
                style={[styles.planPill, { backgroundColor: premium ? c.brand : "rgba(255,255,255,0.15)" }]}
              >
                <Ionicons name={premium ? "star" : "flash"} size={13} color={premium ? c.onBrand : "#fff"} />
                <Text style={{ color: premium ? c.onBrand : "#fff", fontWeight: "700", fontSize: 12, fontFamily: fonts.body }}>
                  {premium ? "Premium" : "Free"}
                </Text>
              </Pressable>
            </View>

            {/* usage bar */}
            <View style={[styles.usageCard, { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.md }]}>
              <Ionicons name="sparkles" size={18} color={c.brand} />
              <Text style={{ color: "#fff", flex: 1, fontFamily: fonts.body, fontSize: 13 }}>
                {premium ? "Unlimited AI generations" : `${genUsed}/${genLimit ?? "-"} free generations today`}
              </Text>
              {!premium && (
                <Pressable onPress={() => router.push("/paywall")} testID="hero-upgrade-button">
                  <Text style={{ color: c.brand, fontWeight: "700", fontFamily: fonts.body, fontSize: 13 }}>Upgrade</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          {/* Quick actions */}
          <SectionTitle>Quick Start</SectionTitle>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
          >
            {quicks.map((q) => (
              <Pressable
                key={q.label}
                testID={`quick-${q.label.replace(/\s/g, "-").toLowerCase()}`}
                onPress={q.onPress}
                style={[styles.quick, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.lg }]}
              >
                <View style={[styles.quickIcon, { backgroundColor: c.brandSoft }]}>
                  <Ionicons name={q.icon as any} size={22} color={c.brand} />
                </View>
                <Text style={{ color: c.text, fontWeight: "700", fontFamily: fonts.body, fontSize: 15 }}>{q.label}</Text>
                <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 12 }}>{q.sub}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Milestone tracker */}
          <View style={{ marginTop: 28 }}>
            <SectionTitle right={<Pressable onPress={() => router.push("/surprises")}><Text style={{ color: c.brand, fontFamily: fonts.body, fontWeight: "600" }}>View all</Text></Pressable>}>
              Milestones
            </SectionTitle>
            <Card>
              <View style={styles.milestoneRow}>
                {MILESTONE_ORDER.map((key) => {
                  const unlocked = usage?.unlocked?.includes(key);
                  return (
                    <View key={key} style={{ alignItems: "center", flex: 1 }}>
                      <View
                        style={[
                          styles.msCircle,
                          { backgroundColor: unlocked ? c.brand : c.card2, borderColor: unlocked ? c.brand : c.border },
                        ]}
                      >
                        <Ionicons
                          name={(unlocked ? MILESTONE_ICONS[key] : "lock-closed") as any}
                          size={22}
                          color={unlocked ? c.onBrand : c.textMute}
                        />
                      </View>
                      <Text style={{ color: unlocked ? c.text : c.textMute, fontSize: 11, marginTop: 8, textAlign: "center", fontFamily: fonts.body }}>
                        {usage?.milestones?.[key]?.title?.split(" ")[0] || key}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <View style={[styles.statsRow, { borderTopColor: c.divider }]}>
                <Stat label="Ideas" value={usage?.counters?.ideas_created ?? 0} c={c} fonts={fonts} />
                <Stat label="Assets" value={usage?.counters?.assets_generated ?? 0} c={c} fonts={fonts} />
                <Stat label="Streak" value={`${usage?.streak?.count ?? 0}d`} c={c} fonts={fonts} />
              </View>
            </Card>
          </View>

          {/* Recent projects */}
          <View style={{ marginTop: 28 }}>
            <SectionTitle right={<Pressable onPress={() => router.push("/(tabs)/incubator")}><Text style={{ color: c.brand, fontFamily: fonts.body, fontWeight: "600" }}>All</Text></Pressable>}>
              Recent Projects
            </SectionTitle>
            {projects.slice(0, 4).map((p) => (
              <Card key={p.id} testID={`dash-project-${p.id}`} onPress={() => router.push(`/project/${p.id}`)} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={{ color: c.text, fontWeight: "700", fontSize: 16, fontFamily: fonts.display, flex: 1, marginRight: 8 }} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Badge label={(STATUS as any)[p.status]?.label || p.status} tone={(STATUS as any)[p.status]?.tone} />
                </View>
                <Text style={{ color: c.textMute, fontSize: 13, marginTop: 6, fontFamily: fonts.body }} numberOfLines={2}>
                  {p.summary}
                </Text>
              </Card>
            ))}
            {projects.length === 0 && (
              <Text style={{ color: c.textMute, fontFamily: fonts.body, textAlign: "center", paddingVertical: 20 }}>
                No projects yet — capture your first idea!
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, c, fonts }: any) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ color: c.brand, fontSize: 22, fontWeight: "700", fontFamily: fonts.display }}>{value}</Text>
      <Text style={{ color: c.textMute, fontSize: 12, fontFamily: fonts.body }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 220, overflow: "hidden" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { fontSize: 15 },
  name: { fontSize: 32, fontWeight: "700", marginTop: 2 },
  planPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  usageCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, marginTop: 24 },
  quick: { width: 150, padding: 16, borderWidth: 1 },
  quickIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  milestoneRow: { flexDirection: "row", justifyContent: "space-between" },
  msCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  statsRow: { flexDirection: "row", marginTop: 18, paddingTop: 16, borderTopWidth: 1 },
});
