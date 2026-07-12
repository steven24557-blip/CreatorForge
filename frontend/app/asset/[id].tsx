import { useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button, Loading, SectionTitle } from "@/src/components/ui";
import { pickCelebration } from "@/src/utils/celebrate";
import { exportView } from "@/src/utils/exporter";

const W = Dimensions.get("window").width;

export default function AssetDetail() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast, celebrate } = useFeedback();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tweak, setTweak] = useState("");
  const [compareId, setCompareId] = useState<string | null>(null); // version id to compare against current
  const shotRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.assetVersions(id);
      setData(res);
    } catch {
      toast("Could not load asset", "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const regenerate = async () => {
    setBusy(true);
    try {
      const res = await api.regenerateAsset(id, tweak.trim() || undefined);
      const cel = pickCelebration(res);
      setTweak("");
      setCompareId(null);
      await load();
      if (cel) celebrate(cel);
      else toast("New version created", "success");
    } catch (e: any) {
      if (e.status === 402) router.push("/paywall");
      else toast(e.message || "Regeneration failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const revert = async (versionId: string) => {
    setBusy(true);
    try {
      await api.revertAsset(id, versionId);
      setCompareId(null);
      await load();
      toast("Version restored", "success");
    } catch (e: any) {
      toast(e.message || "Could not restore version", "error");
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    try {
      await exportView(shotRef, `creatorforge-${data?.type || "asset"}.png`);
      toast("Exported", "success");
    } catch {
      toast("Export failed", "error");
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Header insets={insets} c={c} fonts={fonts} title="Asset" onBack={() => router.back()} />
        <Loading label="Loading asset…" />
      </View>
    );
  }

  const current = data?.current;
  const versions: any[] = data?.versions || [];
  const compareVersion = compareId ? versions.find((v) => v.id === compareId) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header insets={insets} c={c} fonts={fonts} title={`${(data?.type || "Asset")} · v${versions.length + 1}`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Preview (compare = side-by-side) */}
        {compareVersion ? (
          <View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <CompareCell label="Current" b64={current?.image_b64} watermarked={current?.watermarked} c={c} fonts={fonts} radius={radius} />
              <CompareCell label="Previous" b64={compareVersion.image_b64} watermarked={compareVersion.watermarked} c={c} fonts={fonts} radius={radius} />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Button title="Keep current" variant="secondary" onPress={() => setCompareId(null)} style={{ flex: 1 }} testID="compare-keep-current" />
              <Button title="Restore previous" onPress={() => revert(compareVersion.id)} loading={busy} style={{ flex: 1 }} testID="compare-restore" />
            </View>
          </View>
        ) : (
          <View>
            <View ref={shotRef} collapsable={false} style={{ borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.card }}>
              <Image
                accessibilityLabel={`Current ${data?.type} asset: ${current?.prompt}`}
                source={{ uri: `data:image/png;base64,${current?.image_b64 || ""}` }}
                style={{ width: "100%", height: W - 40 }}
                contentFit="cover"
              />
              {current?.watermarked && (
                <View style={styles.watermark}>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.body, fontWeight: "700", fontSize: 12 }}>CreatorForge</Text>
                </View>
              )}
            </View>
            <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginTop: 10 }} numberOfLines={3}>
              {current?.prompt}
            </Text>
            <Pressable onPress={doExport} testID="asset-export" accessibilityRole="button" accessibilityLabel="Export asset as PNG" style={[styles.exportRow, { borderColor: c.border, borderRadius: radius.md }]}>
              <Ionicons name="download" size={18} color={c.brand} importantForAccessibility="no" />
              <Text style={{ color: c.brand, fontFamily: fonts.body, fontWeight: "700", fontSize: 14 }}>Export PNG</Text>
            </Pressable>
          </View>
        )}

        {/* Refine / regenerate */}
        <SectionTitle>Refine this asset</SectionTitle>
        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>
          Tweak the prompt (optional) then regenerate — your previous version is saved to history.
        </Text>
        <TextInput
          testID="asset-tweak-input"
          accessibilityLabel="Tweak asset prompt"
          placeholder={current?.prompt || "Describe a change…"}
          placeholderTextColor={c.textMute}
          value={tweak}
          onChangeText={setTweak}
          multiline
          style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text, borderRadius: radius.md, fontFamily: fonts.body }]}
        />
        <Button title="Generate new version" icon="sparkles" onPress={regenerate} loading={busy} testID="asset-regenerate" style={{ marginTop: 12 }} />

        {/* Version history */}
        {versions.length > 0 && (
          <View style={{ marginTop: 26 }}>
            <SectionTitle>Version History ({versions.length})</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
              {versions.map((v, i) => {
                const active = compareId === v.id;
                return (
                  <Pressable
                    key={v.id}
                    testID={`version-${i}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Previous version ${versions.length - i}. Tap to compare with current.`}
                    onPress={() => setCompareId(active ? null : v.id)}
                    style={{ width: 120 }}
                  >
                    <Image
                      source={{ uri: `data:image/png;base64,${v.image_b64 || ""}` }}
                      style={{ width: 120, height: 120, borderRadius: radius.md, borderWidth: active ? 2 : 1, borderColor: active ? c.brand : c.border }}
                      contentFit="cover"
                    />
                    <Text style={{ color: active ? c.brand : c.textMute, fontFamily: fonts.body, fontSize: 12, marginTop: 6, fontWeight: active ? "700" : "400" }}>
                      {active ? "Comparing…" : `Version ${versions.length - i}`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function CompareCell({ label, b64, watermarked, c, fonts, radius }: any) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.text, fontFamily: fonts.body, fontWeight: "700", fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <View style={{ borderRadius: radius.md, overflow: "hidden", backgroundColor: c.card }}>
        <Image source={{ uri: `data:image/png;base64,${b64 || ""}` }} style={{ width: "100%", height: (W - 52) / 2 }} contentFit="cover" accessibilityLabel={`${label} asset version`} />
        {watermarked && (
          <View style={styles.watermarkSm}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.body, fontWeight: "700", fontSize: 9 }}>CreatorForge</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Header({ insets, c, fonts, title, onBack }: any) {
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
      <Pressable onPress={onBack} testID="asset-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={26} color={c.text} />
      </Pressable>
      <Text accessibilityRole="header" style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display, textTransform: "capitalize" }} numberOfLines={1}>{title}</Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  watermark: { position: "absolute", bottom: 10, right: 12, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, pointerEvents: "none" },
  watermarkSm: { position: "absolute", bottom: 6, right: 6, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, pointerEvents: "none" },
  input: { borderWidth: 1, padding: 14, minHeight: 80, textAlignVertical: "top", fontSize: 15 },
  exportRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, paddingVertical: 12, marginTop: 12 },
});
