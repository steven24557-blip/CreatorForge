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
  Switch,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
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
  const [publishing, setPublishing] = useState(false);
  const [pkgStyle, setPkgStyle] = useState<string>("box");
  const [pkgImages, setPkgImages] = useState<string[]>([]);
  const [pkgLoading, setPkgLoading] = useState(false);

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

  const togglePublish = async () => {
    setPublishing(true);
    try {
      const next = !kit.is_public;
      const { brand_kit } = await api.publishKit(id, next);
      setKit(brand_kit);
      toast(next ? "Published to the community gallery (anonymous)" : "Removed from gallery", next ? "success" : "info");
    } catch (e: any) {
      toast(e.message || "Could not update gallery status", "error");
    } finally {
      setPublishing(false);
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

  const addPkgImage = async () => {
    if (pkgImages.length >= 2) {
      toast("You can add up to 2 images", "info");
      return;
    }
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) {
      status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    }
    if (status !== "granted") {
      toast("Photo access is needed to add an image. Enable it in Settings.", "error");
      Linking.openSettings();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });
    if (!res.canceled && res.assets?.[0]?.base64) {
      setPkgImages((prev) => [...prev, res.assets[0].base64 as string]);
    }
  };

  const genPackaging = async () => {
    if (pkgImages.length === 0) {
      toast("Add your logo or product image first", "error");
      return;
    }
    setPkgLoading(true);
    try {
      const res = await api.generatePackaging({ brand_kit_id: id, style: pkgStyle, images: pkgImages });
      setPkgImages([]);
      await load();
      await handleReward(res);
      toast("Packaging preview created!", "success");
    } catch (e: any) {
      if (e.status === 402) router.push("/paywall");
      else toast(e.message, "error");
    } finally {
      setPkgLoading(false);
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

          {/* Product Packaging Preview */}
          <View style={{ marginTop: 26 }}>
            <SectionTitle>Packaging Preview</SectionTitle>
            <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>
              Add your logo or product image, pick a style, and AI mocks it up in your brand colors. Free: 1/day · Premium: unlimited.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {[
                { key: "box", label: "Box" },
                { key: "pouch", label: "Pouch" },
                { key: "bottle", label: "Bottle" },
                { key: "bag", label: "Bag" },
              ].map((s) => (
                <Chip key={s.key} label={s.label} active={pkgStyle === s.key} onPress={() => setPkgStyle(s.key)} testID={`pkg-style-${s.key}`} />
              ))}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              {pkgImages.map((img, i) => (
                <View key={i}>
                  <Image accessibilityLabel={`Uploaded asset ${i + 1}`} source={{ uri: `data:image/png;base64,${img}` }} style={{ width: 68, height: 68, borderRadius: radius.md, backgroundColor: c.card2 }} contentFit="cover" />
                  <Pressable
                    testID={`pkg-remove-${i}`}
                    onPress={() => setPkgImages((prev) => prev.filter((_, idx) => idx !== i))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove uploaded asset ${i + 1}`}
                    hitSlop={8}
                    style={styles.pkgRemove}
                  >
                    <Ionicons name="close" size={13} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {pkgImages.length < 2 && (
                <Pressable
                  testID="pkg-add-image"
                  onPress={addPkgImage}
                  accessibilityRole="button"
                  accessibilityLabel="Add a logo or product image"
                  style={[styles.pkgAdd, { borderColor: c.border, backgroundColor: c.card }]}
                >
                  <Ionicons name="add" size={22} color={c.brand} importantForAccessibility="no" />
                  <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 11, marginTop: 2 }}>Add</Text>
                </Pressable>
              )}
            </View>

            <Button title="Generate Packaging" icon="cube" loading={pkgLoading} onPress={genPackaging} testID="generate-packaging-button" style={{ marginTop: 14 }} />
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

          {/* Community gallery — opt-in, privacy-first */}
          <View style={{ marginTop: 26 }}>
            <SectionTitle>Community Gallery</SectionTitle>
            <View style={[styles.publishCard, { backgroundColor: c.card, borderColor: kit.is_public ? c.brand : c.border, borderRadius: radius.lg }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.publishIcon, { backgroundColor: c.brandSoft }]}>
                  <Ionicons name={kit.is_public ? "globe" : "lock-closed"} size={18} color={c.brand} importantForAccessibility="no" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontFamily: fonts.body, fontWeight: "700", fontSize: 15 }}>
                    {kit.is_public ? "Shared to gallery" : "Share this palette"}
                  </Text>
                  <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                    {kit.is_public
                      ? `Anonymous · ${kit.remix_count || 0} remixes. Only your palette, fonts & name are visible.`
                      : "Opt-in & anonymous. Only your palette, fonts, and brand name are shown — never your account details."}
                  </Text>
                </View>
                <Switch
                  testID="publish-toggle"
                  value={!!kit.is_public}
                  onValueChange={togglePublish}
                  disabled={publishing}
                  accessibilityLabel="Publish this brand kit to the community gallery"
                  trackColor={{ true: c.brand, false: c.border }}
                  thumbColor="#fff"
                />
              </View>
              {kit.is_public && (
                <Pressable onPress={() => router.push("/gallery")} testID="view-in-gallery" accessibilityRole="button" accessibilityLabel="View the community gallery" style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: c.brand, fontFamily: fonts.body, fontWeight: "700", fontSize: 13 }}>Browse the gallery</Text>
                  <Ionicons name="chevron-forward" size={14} color={c.brand} importantForAccessibility="no" />
                </Pressable>
              )}
            </View>
          </View>
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
            <View style={styles.watermark}>
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
  watermark: { position: "absolute", bottom: 10, right: 12, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, pointerEvents: "none" },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  publishCard: { borderWidth: 1, padding: 16 },
  publishIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pkgAdd: { width: 68, height: 68, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  pkgRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
});
