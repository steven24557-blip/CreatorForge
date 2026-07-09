import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { Card, SectionTitle, Button, EmptyState, Loading } from "@/src/components/ui";
import { useFeedback } from "@/src/context/FeedbackContext";

const W = Dimensions.get("window").width;

export default function Studio() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useFeedback();

  const [kits, setKits] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [k, a] = await Promise.all([api.brandKits(), api.assets()]);
      setKits(k.brand_kits || []);
      setAssets(a.assets || []);
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
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <Button title="New Brand Kit" icon="add" onPress={() => setModal(true)} testID="new-brand-kit-button" style={{ marginBottom: 24 }} />

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
              <SectionTitle>Asset Gallery</SectionTitle>
              <View style={styles.grid}>
                {assets.map((a) => (
                  <View key={a.id} style={{ width: gridW }}>
                    <Image
                      source={{ uri: `data:image/png;base64,${a.image_b64}` }}
                      style={{ width: gridW, height: gridW, borderRadius: radius.md, backgroundColor: c.card }}
                      contentFit="cover"
                    />
                    <Text style={{ color: c.textMute, fontSize: 11, marginTop: 4, fontFamily: fonts.body, textTransform: "capitalize" }}>
                      {a.type}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 12, marginTop: 8 }}>
                Open a brand kit or project to generate more.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Create kit sheet */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setModal(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
            <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />
            <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", fontFamily: fonts.display, marginBottom: 4 }}>New Brand Kit</Text>
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
  kitCard: { borderWidth: 1, overflow: "hidden" },
  swatchRow: { flexDirection: "row" },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetInput: { height: 52, borderWidth: 1, paddingHorizontal: 16, fontSize: 15 },
});
