import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, RefreshControl, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { EmptyState, Loading } from "@/src/components/ui";

const W = Dimensions.get("window").width;

export default function Gallery() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast, celebrate } = useFeedback();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [remixing, setRemixing] = useState<string | null>(null);

  const gridW = (Math.min(W, 560) - 40 - 12) / 2;

  const load = useCallback(async () => {
    try {
      const r = await api.gallery();
      setItems(r.items || []);
    } catch {
      toast("Could not load the gallery", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const remix = async (item: any) => {
    setRemixing(item.id);
    try {
      const { brand_kit } = await api.remixKit(item.id);
      celebrate({ title: "Remixed!", desc: `“${item.name}” is now your starting point. Make it yours.`, reward: "New brand kit" });
      router.push(`/brand-kit/${brand_kit.id}`);
    } catch (e: any) {
      toast(e.message || "Could not remix", "error");
    } finally {
      setRemixing(null);
    }
  };

  const report = (item: any) => {
    const doReport = async () => {
      try {
        await api.reportKit(item.id);
        toast("Thanks — our team will review this.", "success");
        load();
      } catch {
        toast("Could not submit report", "error");
      }
    };
    if (Platform.OS === "web") {
      doReport();
      return;
    }
    Alert.alert("Report this creation?", "Flag it as inappropriate for review.", [
      { text: "Cancel", style: "cancel" },
      { text: "Report", style: "destructive", onPress: doReport },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="gallery-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>Community Gallery</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <Loading label="Loading community creations…" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        >
          <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginBottom: 16, lineHeight: 19 }}>
            Opt-in brand palettes shared by makers. No personal data is shown. Remix any to start your own.
          </Text>

          {items.length === 0 ? (
            <EmptyState
              icon="images"
              title="No public creations yet"
              subtitle="Be the first — publish a brand kit from its page to share your palette (opt-in, anonymous)."
            />
          ) : (
            <View style={styles.grid}>
              {items.map((item) => (
                <View key={item.id} testID={`gallery-item-${item.id}`} style={{ width: gridW }}>
                  <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.lg }]}>
                    <View style={styles.swatchRow}>
                      {(item.colors || []).slice(0, 5).map((col: string, i: number) => (
                        <View key={i} style={{ flex: 1, height: 56, backgroundColor: col }} />
                      ))}
                      {item.logo && (
                        <Image accessibilityElementsHidden source={{ uri: `data:image/png;base64,${item.logo}` }} style={styles.logo} contentFit="contain" />
                      )}
                    </View>
                    <View style={{ padding: 12 }}>
                      <Text style={{ color: c.text, fontWeight: "700", fontFamily: fonts.display, fontSize: 15 }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                        by {item.alias}{item.remix_count ? ` · ${item.remix_count} remixes` : ""}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                        <Pressable
                          testID={`remix-${item.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Remix ${item.name}`}
                          disabled={remixing === item.id}
                          onPress={() => remix(item)}
                          style={[styles.remixBtn, { backgroundColor: c.brand, opacity: remixing === item.id ? 0.6 : 1 }]}
                        >
                          <Ionicons name="git-network" size={14} color={c.onBrand} importantForAccessibility="no" />
                          <Text style={{ color: c.onBrand, fontFamily: fonts.body, fontWeight: "700", fontSize: 13 }}>
                            {remixing === item.id ? "Remixing…" : "Remix"}
                          </Text>
                        </Pressable>
                        <Pressable
                          testID={`report-${item.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Report ${item.name}`}
                          onPress={() => report(item)}
                          hitSlop={8}
                          style={[styles.reportBtn, { borderColor: c.border }]}
                        >
                          <Ionicons name="flag-outline" size={14} color={c.textMute} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { borderWidth: 1, overflow: "hidden" },
  swatchRow: { flexDirection: "row", position: "relative" },
  logo: { position: "absolute", right: 8, bottom: 8, width: 34, height: 34, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 8 },
  remixBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, flex: 1, justifyContent: "center" },
  reportBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
