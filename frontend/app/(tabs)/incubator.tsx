import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, FlatList, Pressable, TextInput, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { Card, Badge, Chip, EmptyState, Loading, OfflineBanner } from "@/src/components/ui";
import { STATUS } from "@/src/constants/app";

const FILTERS = [
  { key: "", label: "All" },
  { key: "idea", label: "Ideas" },
  { key: "branding", label: "Branding" },
  { key: "done", label: "Complete" },
];

export default function Incubator() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [projects, setProjects] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.projects(q, status);
      setProjects(p.projects || []);
      setOffline(!!p?._offline);
    } catch {} finally {
      setLoading(false);
    }
  }, [q, status]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Sticky header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: c.bg, borderBottomColor: c.divider, borderBottomWidth: 1 }}>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 28, fontWeight: "700", fontFamily: fonts.display, marginBottom: 14 }}>
          Incubator
        </Text>
        <View style={[styles.search, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.md }]}>
          <Ionicons name="search" size={18} color={c.textMute} />
          <TextInput
            testID="project-search-input"
            placeholder="Search projects…"
            placeholderTextColor={c.textMute}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={load}
            returnKeyType="search"
            style={{ flex: 1, color: c.text, fontFamily: fonts.body, fontSize: 15 }}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }} style={{ marginHorizontal: -20, paddingHorizontal: 20 }}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} active={status === f.key} onPress={() => setStatus(f.key)} testID={`filter-${f.label.toLowerCase()}`} />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <Loading />
      ) : projects.length === 0 ? (
        <EmptyState
          icon="bulb"
          title="No projects yet"
          subtitle="Capture an idea by text or voice and let AI refine it into a plan."
          cta={
            <Pressable onPress={() => router.push("/capture")} style={[styles.emptyBtn, { backgroundColor: c.brand, borderRadius: radius.md }]} testID="empty-new-idea">
              <Text style={{ color: c.onBrand, fontWeight: "700", fontFamily: fonts.body }}>Capture an idea</Text>
            </Pressable>
          }
        />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<OfflineBanner visible={offline} />}
          renderItem={({ item: p }) => {
            const done = (p.tasks || []).filter((t: any) => t.done).length;
            return (
              <Card testID={`project-card-${p.id}`} onPress={() => router.push(`/project/${p.id}`)} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={{ color: c.text, fontWeight: "700", fontSize: 17, fontFamily: fonts.display, flex: 1, marginRight: 8 }} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Badge label={(STATUS as any)[p.status]?.label || p.status} tone={(STATUS as any)[p.status]?.tone} />
                </View>
                <Text style={{ color: c.textMute, fontSize: 13, marginTop: 6, lineHeight: 19, fontFamily: fonts.body }} numberOfLines={2}>
                  {p.summary}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 }}>
                  <Meta icon="checkbox" text={`${done}/${(p.tasks || []).length} tasks`} c={c} fonts={fonts} />
                  {p.brand_kit_id && <Meta icon="color-palette" text="Branded" c={c} fonts={fonts} />}
                </View>
              </Card>
            );
          }}
        />
      )}

      {/* FAB */}
      <Pressable
        testID="fab-new-idea"
        accessibilityRole="button"
        accessibilityLabel="Capture a new idea"
        onPress={() => router.push("/capture")}
        style={[styles.fab, { backgroundColor: c.brand, bottom: insets.bottom + 80 }]}
      >
        <Ionicons name="add" size={30} color={c.onBrand} />
      </Pressable>
    </View>
  );
}

function Meta({ icon, text, c, fonts }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Ionicons name={icon} size={14} color={c.textMute} />
      <Text style={{ color: c.textMute, fontSize: 12, fontFamily: fonts.body }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 46, paddingHorizontal: 14, borderWidth: 1 },
  emptyBtn: { paddingHorizontal: 22, paddingVertical: 13 },
  fab: { position: "absolute", right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", ...Platform.select({ web: { boxShadow: "0px 4px 8px rgba(0,0,0,0.3)" }, default: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 } }) },
});
