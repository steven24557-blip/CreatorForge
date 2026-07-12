import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button, Chip, Loading, SectionTitle, Disclaimer } from "@/src/components/ui";
import { pickCelebration } from "@/src/utils/celebrate";
import { ASSET_TYPES } from "@/src/constants/app";
import { exportView } from "@/src/utils/exporter";

const W = Dimensions.get("window").width;

export default function BrandKitScreen() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast, celebrate } = useFeedback();

  const [kit, setKit] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string>("social");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const [taglines, setTaglines] = useState<string[]>([]);
  const [tagLoading, setTagLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [k, a] = await Promise.all([api.brandKit(id), api.assets("", id)]);
      setKit(k.brand_kit);
      setAssets(a.assets || []);
    } catch {
      toast("Brand kit not found", "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !kit) {
    return <View style={{ flex: 1, backgroundColor: c.bg }}><Loading /></View>;
  }

  const context = `${kit.name}. Style: ${(kit.style_rules || []).join(", ")}. Colors: ${(kit.colors || []).join(", ")}`;

  const handleReward = async (res: any) => {
    if (res?.newly_unlocked?.length || res?.surprise || res?.streak_event?.is_milestone) {
      let milestones;
      if (res.newly_unlocked?.length) milestones = (await api.usage()).milestones;
      const cel = pickCelebration(res, milestones);
      if (cel) celebrate(cel);
    }
  };

  const genLogo = async () => {
    setLogoLoading(true);
    try {
      await api.generateLogo(id);
      await load();
      toast("Logo generated!", "success");
    } catch (e: any) {
      if (e.status === 402) router.push("/paywall");
      else toast(e.message, "error");
    } finally {
      setLogoLoading(false);
    }
  };

  const genAsset = async () => {
    if (!prompt.trim()) {
      toast("Describe the asset you want", "error");
      return;
    }
    setGenerating(true);
    try {
      const res = await api.generateAsset({
        brand_kit_id: id,
        project_id: kit.project_id || undefined,
        type,
        prompt: prompt.trim(),
      });
      setPrompt("");
      await load();
      await handleReward(res);
      toast("Asset generated!", "success");
    } catch (e: any) {
      if (e.status === 402) router.push("/paywall");
      else toast(e.message, "error");
    } finally {
      setGenerating(false);
    }
  };

  const genTaglines = async () => {
    setTagLoading(true);
    try {
      const { taglines } = await api.taglines(context);
      setTaglines(taglines || []);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setTagLoading(false);
    }
  };

  const removeAsset = async (aid: string) => {
    await api.deleteAsset(aid);
    load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="kit-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display, flex: 1, textAlign: "center" }} numberOfLines={1}>{kit.name}</Text>
        <Pressable onPress={() => router.push({ pathname: `/story/${kit.id}`, params: { title: kit.name } })} testID="kit-share-story" hitSlop={10} accessibilityRole="button" accessibilityLabel="Share creation story">
          <Ionicons name="share-social" size={22} color={c.brand} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 50}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Swatches */}
          <View style={[styles.swatchCard, { borderRadius: radius.lg, borderColor: c.border }]}>
            {(kit.colors || []).map((col: string, i: number) => (
              <View key={i} style={{ flex: 1, height: 90, backgroundColor: col, alignItems: "center", justifyContent: "flex-end", paddingBottom: 8 }}>
                <Text style={{ color: "#fff", fontSize: 9, fontFamily: fonts.body, backgroundColor: "rgba(0,0,0,0.35)", paddingHorizontal: 4, borderRadius: 3 }}>{col}</Text>
              </View>
            ))}
          </View>

          {/* fonts + rules */}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
            <View style={[styles.infoBox, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.md }]}>
              <Text style={{ color: c.textMute, fontSize: 11, fontFamily: fonts.body }}>HEADING</Text>
              <Text style={{ color: c.text, fontFamily: fonts.display, fontSize: 18, fontWeight: "700" }}>{kit.fonts?.heading || "—"}</Text>
            </View>
            <View style={[styles.infoBox, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.md }]}>
              <Text style={{ color: c.textMute, fontSize: 11, fontFamily: fonts.body }}>BODY</Text>
              <Text style={{ color: c.text, fontFamily: fonts.body, fontSize: 18, fontWeight: "600" }}>{kit.fonts?.body || "—"}</Text>
            </View>
          </View>

          {!!(kit.style_rules || []).length && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              {kit.style_rules.map((r: string) => (
                <View key={r} style={{ backgroundColor: c.brandSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: c.brand, fontFamily: fonts.body, fontSize: 12, fontWeight: "600" }}>{r}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Logo */}
          <View style={{ marginTop: 26 }}>
            <SectionTitle>Logo</SectionTitle>
            {kit.logo ? (
              <Image accessibilityLabel={`${kit.name} logo`} source={{ uri: `data:image/png;base64,${kit.logo}` }} style={{ width: "100%", height: 220, borderRadius: radius.lg, backgroundColor: c.card }} contentFit="contain" />
            ) : (
              <Button title="Generate Logo" icon="aperture" loading={logoLoading} onPress={genLogo} testID="generate-logo-button" />
            )}
          </View>

          {/* Taglines */}
          <View style={{ marginTop: 26 }}>
            <SectionTitle right={<Pressable onPress={genTaglines} testID="generate-taglines-button"><Text style={{ color: c.brand, fontFamily: fonts.body, fontWeight: "600" }}>{tagLoading ? "…" : "Generate"}</Text></Pressable>}>
              Taglines
            </SectionTitle>
            {taglines.map((t, i) => (
              <View key={i} style={[styles.tagline, { borderBottomColor: c.divider }]}>
                <Ionicons name="chatbubble-ellipses" size={16} color={c.brand} />
                <Text style={{ color: c.text, fontFamily: fonts.body, fontSize: 15, flex: 1 }}>{t}</Text>
              </View>
            ))}
            {taglines.length === 0 && !tagLoading && (
              <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13 }}>Tap Generate for on-brand taglines.</Text>
            )}
          </View>

          {/* Generate assets */}
          <View style={{ marginTop: 26 }}>
            <SectionTitle>Generate Assets</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {ASSET_TYPES.map((t) => (
                <Chip key={t.key} label={t.label} active={type === t.key} onPress={() => setType(t.key)} testID={`asset-type-${t.key}`} />
              ))}
            </ScrollView>
            <View style={[styles.promptBar, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.md }]}>
              <TextInput
                testID="asset-prompt-input"
                placeholder="Describe the visual…"
                placeholderTextColor={c.textMute}
                value={prompt}
                onChangeText={setPrompt}
                style={{ flex: 1, color: c.text, fontFamily: fonts.body, fontSize: 15 }}
              />
            </View>
            <Button title="Generate Asset" icon="sparkles" loading={generating} onPress={genAsset} testID="generate-asset-button" style={{ marginTop: 12 }} />
            <Disclaimer style={{ marginTop: 12 }} />
          </View>

          {/* Asset grid */}
          {assets.length > 0 && (
            <View style={{ marginTop: 26 }}>
              <SectionTitle>Generated ({assets.length})</SectionTitle>
              {assets.map((a) => (
                <AssetTile key={a.id} asset={a} onDelete={() => removeAsset(a.id)} />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function AssetTile({ asset, onDelete }: { asset: any; onDelete: () => void }) {
  const { c, fonts, radius } = useTheme();
  const { toast } = useFeedback();
  const router = useRouter();
  const shotRef = useRef<any>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      await exportView(shotRef, `creatorforge-${asset.type}.png`);
      toast("Exported", "success");
    } catch {
      toast("Export failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <Pressable
        testID={`open-asset-${asset.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Open ${asset.type} asset for version history and refine`}
        onPress={() => router.push(`/asset/${asset.id}`)}
      >
        <View ref={shotRef} collapsable={false} style={{ borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.card }}>
          <Image accessibilityLabel={`${asset.type} asset: ${asset.prompt}`} source={{ uri: `data:image/png;base64,${asset.image_b64 || ""}` }} style={{ width: "100%", height: 300 }} contentFit="cover" />
          {asset.watermarked && (
            <View style={styles.watermark} pointerEvents="none">
              <Text style={{ color: "rgba(255,255,255,0.8)", fontFamily: fonts.body, fontWeight: "700", fontSize: 12 }}>CreatorForge</Text>
            </View>
          )}
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 }}>
        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 12, flex: 1, textTransform: "capitalize" }} numberOfLines={1}>
          {asset.type} · {asset.prompt}
        </Text>
        <Pressable onPress={() => router.push(`/asset/${asset.id}`)} testID={`history-asset-${asset.id}`} accessibilityRole="button" accessibilityLabel={`Version history for ${asset.type} asset`} style={[styles.iconBtn, { backgroundColor: c.brandSoft }]}>
          <Ionicons name="git-branch" size={16} color={c.brand} />
        </Pressable>
        <Pressable onPress={doExport} testID={`export-asset-${asset.id}`} disabled={busy} accessibilityRole="button" accessibilityLabel={`Export ${asset.type} asset`} style={[styles.iconBtn, { backgroundColor: c.brandSoft }]}>
          <Ionicons name="download" size={16} color={c.brand} />
        </Pressable>
        <Pressable onPress={onDelete} testID={`delete-asset-${asset.id}`} accessibilityRole="button" accessibilityLabel={`Delete ${asset.type} asset`} style={[styles.iconBtn, { backgroundColor: c.card2 }]}>
          <Ionicons name="trash" size={16} color={c.textMute} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  swatchCard: { flexDirection: "row", borderWidth: 1, overflow: "hidden" },
  infoBox: { flex: 1, borderWidth: 1, padding: 14 },
  tagline: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  promptBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, paddingHorizontal: 14, height: 52, marginTop: 12 },
  watermark: { position: "absolute", bottom: 10, right: 12, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
