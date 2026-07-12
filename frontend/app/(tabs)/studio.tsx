import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { Platform } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { Card, SectionTitle, Button, Chip, EmptyState, Loading, OfflineBanner } from "@/src/components/ui";
import { useFeedback } from "@/src/context/FeedbackContext";
import { downloadBase64Web } from "@/src/utils/exporter";
import { ASSET_TYPES } from "@/src/constants/app";

const W = Dimensions.get("window").width;

export default function Studio() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useFeedback();

  const [kits, setKits] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [assetType, setAssetType] = useState("");
  const [assetQuery, setAssetQuery] = useState("");

  const filteredAssets = assets.filter(
    (a) =>
      (!assetType || a.type === assetType) &&
      (!assetQuery || (a.prompt || "").toLowerCase().includes(assetQuery.toLowerCase()))
  );

  const downloadAll = async () => {
    if (Platform.OS !== "web") {
      toast("Batch download is available on web; tap an asset to share on mobile.", "info");
      return;
    }
    for (const a of filteredAssets) {
      await downloadBase64Web(a.image_b64, `creatorforge-${a.type}-${a.id.slice(0, 6)}.png`);
    }
    toast(`Downloading ${filteredAssets.length} assets`, "success");
  };

  const load = useCallback(async () => {
    try {
      const [k, a] = await Promise.all([api.brandKits(), api.assets()]);
      setKits(k.brand_kits || []);
      setAssets(a.assets || []);
      setOffline(!!k?._offline);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const createKit = async () => {
    if (!name.trim()) {
      toast("Give your brand kit a name", "error");
      return;
    }
    setCreating(true);
    try {
      const { brand_kit } = await api.createBrandKit({ name: name.trim(), auto_generate: true });
      setModal(false);
      setName("");
      toast("Brand kit created!", "success");
      router.push(`/brand-kit/${brand_kit.id}`);
    } catch (e: any) {
      if (e.status === 402) router.push("/paywall");
      else toast(e.message || "Failed to create", "error");
    } finally {
      setCreating(false);
    }
  };

  const gridW = (Math.min(W, 560) - 40 - 12) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, borderBottomColor: c.divider, borderBottomWidth: 1 }}>
        <Text style={{ color: c.text, fontSize: 28, fontWeight: "700", fontFamily: fonts.display }}>Branding Studio</Text>
        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 14, marginTop: 4 }}>
          Craft brand kits & generate on-brand visuals.
        </Text>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, maxWidth: 720, width: "100%", alignSelf: "center" }} showsVerticalScrollIndicator={false}>
          <OfflineBanner visible={offline} />
          <Button title="New Brand Kit" icon="add" onPress={() => setModal(true)} testID="new-brand-kit-button" style={{ marginBottom: 20 }} />

          <SectionTitle>Creative Tools</SectionTitle>
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
            {[
              { icon: "color-filter", label: "Palette Generator", sub: "Harmony rules", onPress: () => router.push("/palette") },
              { icon: "grid", label: "Templates", sub: "Quick starts", onPress: () => router.push("/templates") },
            ].map((t) => (
              <Pressable
                key={t.label}
                testID={`tool-${t.label.replace(/\s/g, "-").toLowerCase()}`}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                onPress={t.onPress}
                style={[styles.toolCard, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.lg }]}
              >
                <View style={[styles.toolIcon, { backgroundColor: c.brandSoft }]}>
                  <Ionicons name={t.icon as any} size={20} color={c.brand} importantForAccessibility="no" />
                </View>
                <Text style={{ color: c.text, fontFamily: fonts.body, fontWeight: "700", fontSize: 14 }}>{t.label}</Text>
                <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 11 }}>{t.sub}</Text>
              </Pressable>
            ))}
          </View>

          <SectionTitle>Brand Kits</SectionTitle>
          {kits.length === 0 ? (
            <EmptyState icon="color-palette" title="No brand kits yet" subtitle="Create your first AI-generated brand kit with a cohesive palette." />
          ) : (
            <View style={styles.grid}>
              {kits.map((k) => (
                <Pressable
                  key={k.id}
                  testID={`brand-kit-${k.id}`}
                  onPress={() => router.push(`/brand-kit/${k.id}`)}
                  style={[styles.kitCard, { width: gridW, backgroundColor: c.card, borderColor: c.border, borderRadius: radius.lg }]}
                >
                  <View style={styles.swatchRow}>
                    {(k.colors || []).slice(0, 5).map((col: string, i: number) => (
                      <View key={i} style={{ flex: 1, height: 44, backgroundColor: col }} />
                    ))}
                  </View>
                  <View style={{ padding: 12 }}>
                    <Text style={{ color: c.text, fontWeight: "700", fontFamily: fonts.display, fontSize: 15 }} numberOfLines={1}>
                      {k.name}
                    </Text>
                    <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 12, marginTop: 2 }}>
                      {(k.colors || []).length} colors
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {assets.length > 0 && (
            <View style={{ marginTop: 28 }}>
              <SectionTitle
                right={
                  <Pressable onPress={downloadAll} testID="download-all-button" accessibilityRole="button" accessibilityLabel="Download all assets">
                    <Text style={{ color: c.brand, fontFamily: fonts.body, fontWeight: "600" }}>Download all</Text>
                  </Pressable>
                }
              >
                Asset Library
              </SectionTitle>
              <View style={[styles.search, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.md }]}>
                <Ionicons name="search" size={18} color={c.textMute} importantForAccessibility="no" />
                <TextInput
                  testID="asset-search-input"
                  accessibilityLabel="Search assets"
                  placeholder="Search assets…"
                  placeholderTextColor={c.textMute}
                  value={assetQuery}
                  onChangeText={setAssetQuery}
                  style={{ flex: 1, color: c.text, fontFamily: fonts.body, fontSize: 15 }}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12, paddingBottom: 4 }}>
                <Chip label="All" active={assetType === ""} onPress={() => setAssetType("")} testID="asset-filter-all" />
                {ASSET_TYPES.map((t) => (
                  <Chip key={t.key} label={t.label} active={assetType === t.key} onPress={() => setAssetType(t.key)} testID={`asset-filter-${t.key}`} />
                ))}
              </ScrollView>
              <View style={[styles.grid, { marginTop: 14 }]}>
                {filteredAssets.map((a) => (
                  <Pressable
                    key={a.id}
                    testID={`asset-tile-${a.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${a.type} asset for history and refine`}
                    onPress={() => router.push(`/asset/${a.id}`)}
                    style={{ width: gridW }}
                  >
                    <Image
                      accessibilityLabel={`Generated ${a.type} asset: ${a.prompt}`}
                      source={{ uri: `data:image/png;base64,${a.image_b64}` }}
                      style={{ width: gridW, height: gridW, borderRadius: radius.md, backgroundColor: c.card }}
                      contentFit="cover"
                    />
                    <Text style={{ color: c.textMute, fontSize: 11, marginTop: 4, fontFamily: fonts.body, textTransform: "capitalize" }} numberOfLines={1}>
                      {a.type}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {filteredAssets.length === 0 && (
                <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginTop: 8 }}>No assets match your search.</Text>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Create kit sheet */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setModal(false)} accessibilityLabel="Close">
          <Pressable accessibilityViewIsModal style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
            <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />
            <Text accessibilityRole="header" style={{ color: c.text, fontSize: 20, fontWeight: "700", fontFamily: fonts.display, marginBottom: 4 }}>New Brand Kit</Text>
            <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginBottom: 16 }}>
              AI will generate a cohesive palette, fonts & style rules.
            </Text>
            <TextInput
              testID="brand-kit-name-input"
              placeholder="e.g. Lumen Coffee"
              placeholderTextColor={c.textMute}
              value={name}
              onChangeText={setName}
              style={[styles.sheetInput, { backgroundColor: c.bg, borderColor: c.border, color: c.text, borderRadius: radius.md, fontFamily: fonts.body }]}
            />
            <Button title="Generate Brand Kit" icon="sparkles" loading={creating} onPress={createKit} testID="create-brand-kit-confirm" style={{ marginTop: 16 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  toolCard: { flex: 1, borderWidth: 1, padding: 14 },
  toolIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 46, paddingHorizontal: 14, borderWidth: 1 },
  kitCard: { borderWidth: 1, overflow: "hidden" },
  swatchRow: { flexDirection: "row" },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetInput: { height: 52, borderWidth: 1, paddingHorizontal: 16, fontSize: 15 },
});
