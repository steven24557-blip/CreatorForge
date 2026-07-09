import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { Card, Badge, Loading } from "@/src/components/ui";
import { MILESTONE_ORDER, MILESTONE_ICONS } from "@/src/constants/app";

const REWARD_IMG =
  "https://images.unsplash.com/photo-1761881775481-40a387991652?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwxfHxnb2xkJTIwcHJlbWl1bSUyMG1pbGVzdG9uZSUyMHJld2FyZHxlbnwwfHx8fDE3ODM1Nzg2NzZ8MA&ixlib=rb-4.1.0&q=85";

export default function Surprises() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setUsage(await api.usage());
    } catch {} finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={{ flex: 1, backgroundColor: c.bg }}><Loading /></View>;

  const unlocked = usage?.unlocked || [];
  const milestones = usage?.milestones || {};

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="surprises-back" hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>Surprises</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* stats banner */}
        <View style={[styles.banner, { borderRadius: radius.lg }]}>
          <Image source={{ uri: REWARD_IMG }} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(15,15,15,0.55)" }]} />
          <View style={{ padding: 20 }}>
            <Text style={{ color: "#fff", fontFamily: fonts.display, fontSize: 22, fontWeight: "700" }}>Creator Rewards</Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.body, fontSize: 13, marginTop: 4 }}>
              Keep creating to unlock hidden themes & bonus credits.
            </Text>
            <View style={{ flexDirection: "row", gap: 20, marginTop: 16 }}>
              <Stat label="Ideas" value={usage?.counters?.ideas_created ?? 0} fonts={fonts} />
              <Stat label="Assets" value={usage?.counters?.assets_generated ?? 0} fonts={fonts} />
              <Stat label="Streak" value={`${usage?.streak?.count ?? 0}d`} fonts={fonts} />
              <Stat label="Bonus" value={usage?.bonus_credits ?? 0} fonts={fonts} />
            </View>
          </View>
        </View>

        <View style={{ marginTop: 24, gap: 12 }}>
          {MILESTONE_ORDER.map((key) => {
            const m = milestones[key];
            const isUnlocked = unlocked.includes(key);
            return (
              <Card key={key} testID={`milestone-${key}`} style={{ opacity: isUnlocked ? 1 : 0.75 }}>
                <View style={{ flexDirection: "row", gap: 14 }}>
                  <View style={[styles.icon, { backgroundColor: isUnlocked ? c.brand : c.card2 }]}>
                    <Ionicons name={(isUnlocked ? MILESTONE_ICONS[key] : "lock-closed") as any} size={24} color={isUnlocked ? c.onBrand : c.textMute} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ color: c.text, fontFamily: fonts.display, fontWeight: "700", fontSize: 16, flex: 1 }}>{m?.title || key}</Text>
                      <Badge label={isUnlocked ? "Unlocked" : "Locked"} tone={isUnlocked ? "success" : "muted"} />
                    </View>
                    <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginTop: 6, lineHeight: 19 }}>{m?.desc}</Text>
                    {!!m?.reward && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                        <Ionicons name="gift" size={14} color={c.brand} />
                        <Text style={{ color: c.brand, fontFamily: fonts.body, fontSize: 12, fontWeight: "600" }}>{m.reward}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, fonts }: any) {
  return (
    <View>
      <Text style={{ color: "#C5A880", fontFamily: fonts.display, fontWeight: "700", fontSize: 22 }}>{value}</Text>
      <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: fonts.body, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  banner: { overflow: "hidden", minHeight: 150 },
  icon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
