import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { Card, SectionTitle, Loading, EmptyState } from "@/src/components/ui";

export default function Analytics() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [a, u] = await Promise.all([api.analytics(), api.usage()]);
      setData(a);
      setUsage(u);
    } catch {} finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={{ flex: 1, backgroundColor: c.bg }}><Loading /></View>;

  const maxActivity = Math.max(1, ...(data?.activity || []).map((d: any) => d.count));
  const statusColors: any = { idea: c.textMute, branding: c.brand, done: c.success };
  const totalStatus = Math.max(1, (data?.status_counts?.idea || 0) + (data?.status_counts?.branding || 0) + (data?.status_counts?.done || 0));
  const stats = [
    { label: "Projects", value: data?.total_projects ?? 0, icon: "bulb" },
    { label: "Assets", value: data?.total_assets ?? 0, icon: "images" },
    { label: "Streak", value: `${usage?.streak?.count ?? 0}d`, icon: "flame" },
    { label: "Tasks done", value: `${data?.tasks?.done ?? 0}/${data?.tasks?.total ?? 0}`, icon: "checkbox" },
  ];
  const typeEntries = Object.entries(data?.type_counts || {});

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="analytics-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>Insights</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, maxWidth: 700, width: "100%", alignSelf: "center" }} showsVerticalScrollIndicator={false}>
        {/* stat cards */}
        <View style={styles.statsGrid}>
          {stats.map((s) => (
            <Card key={s.label} style={{ width: "48%", padding: 16 }}>
              <Ionicons name={s.icon as any} size={20} color={c.brand} importantForAccessibility="no" />
              <Text style={{ color: c.text, fontFamily: fonts.display, fontWeight: "700", fontSize: 26, marginTop: 8 }}>{s.value}</Text>
              <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 12 }}>{s.label}</Text>
            </Card>
          ))}
        </View>

        {/* activity */}
        <View style={{ marginTop: 24 }}>
          <SectionTitle>7-Day Activity</SectionTitle>
          <Card>
            <View
              accessibilityLabel={`Assets generated in the last 7 days: ${(data?.activity || []).map((d: any) => d.count).join(", ")}`}
              style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 120, gap: 6 }}
            >
              {(data?.activity || []).map((d: any, i: number) => (
                <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                  <View style={{ width: "70%", height: Math.max(4, (d.count / maxActivity) * 96), backgroundColor: d.count ? c.brand : c.card2, borderRadius: 4 }} />
                  <Text style={{ color: c.textMute, fontSize: 10, fontFamily: fonts.body }}>{d.date.slice(8, 10)}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* project pipeline */}
        <View style={{ marginTop: 24 }}>
          <SectionTitle>Project Pipeline</SectionTitle>
          <Card>
            <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden" }}>
              {(["idea", "branding", "done"] as const).map((k) => {
                const v = data?.status_counts?.[k] || 0;
                if (!v) return null;
                return <View key={k} style={{ flex: v / totalStatus, backgroundColor: statusColors[k] }} />;
              })}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 14 }}>
              {(["idea", "branding", "done"] as const).map((k) => (
                <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColors[k] }} />
                  <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 12, textTransform: "capitalize" }}>
                    {k} ({data?.status_counts?.[k] || 0})
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* asset types */}
        <View style={{ marginTop: 24 }}>
          <SectionTitle>Assets by Type</SectionTitle>
          {typeEntries.length === 0 ? (
            <EmptyState icon="images" title="No assets yet" subtitle="Generate branded assets to see your breakdown here." />
          ) : (
            <Card>
              {typeEntries.map(([type, count]: any, i) => (
                <View key={type} style={[styles.typeRow, { borderTopColor: c.divider, borderTopWidth: i === 0 ? 0 : 1 }]}>
                  <Text style={{ color: c.text, fontFamily: fonts.body, fontSize: 14, textTransform: "capitalize", flex: 1 }}>{type}</Text>
                  <Text style={{ color: c.brand, fontFamily: fonts.display, fontWeight: "700", fontSize: 16 }}>{count}</Text>
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  typeRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
});
