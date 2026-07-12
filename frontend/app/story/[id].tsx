import { useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button, Loading } from "@/src/components/ui";
import { exportView } from "@/src/utils/exporter";

export default function CreationStory() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, title, tagline } = useLocalSearchParams<{ id: string; title?: string; tagline?: string }>();
  const { toast } = useFeedback();

  const [kit, setKit] = useState<any>(null);
  const [streak, setStreak] = useState(0);
  const [ideaText, setIdeaText] = useState("");
  const [showBefore, setShowBefore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const [k, u] = await Promise.all([api.brandKit(id), api.usage()]);
      setKit(k.brand_kit);
      setStreak(u?.streak?.count || 0);
      const pid = k.brand_kit?.project_id;
      if (pid) {
        try {
          const pr = await api.project(pid);
          const p = pr.project || pr;
          setIdeaText((p?.source_idea || p?.summary || "").trim());
        } catch {}
      }
    } catch {
      toast("Could not load your creation", "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = async () => {
    setBusy(true);
    try {
      await exportView(cardRef, `creatorforge-story-${(kit?.name || "brand").toLowerCase().replace(/\s/g, "-")}.png`);
      toast("Creation story ready to share!", "success");
    } catch {
      toast("Could not create story image", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Loading label="Composing your story…" />
      </View>
    );
  }

  const colors: string[] = (kit?.colors || ["#C5A880", "#1F1F1F", "#E86A5C", "#2E5A88", "#F5EFE6"]).slice(0, 5);
  const brandName = (typeof title === "string" && title) || kit?.name || "My Brand";
  const line = (typeof tagline === "string" && tagline) || (kit?.style_rules || [])[0] || "Crafted with intention.";
  const grad = [colors[1] || "#1F1F1F", colors[0] || "#C5A880"];
  const beforeText = ideaText.length > 150 ? ideaText.slice(0, 147) + "…" : ideaText;
  const hasBefore = !!beforeText;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="story-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>Creation Story</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120, alignItems: "center" }} showsVerticalScrollIndicator={false}>
        {/* Before -> After toggle */}
        {hasBefore && (
          <View style={[styles.toggleRow, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.md }]}>
            <Ionicons name="git-compare" size={16} color={c.brand} importantForAccessibility="no" />
            <Text style={{ color: c.text, fontFamily: fonts.body, fontSize: 14, flex: 1, fontWeight: "600" }}>Show “before → after”</Text>
            <Switch
              testID="before-after-toggle"
              value={showBefore}
              onValueChange={setShowBefore}
              accessibilityLabel="Show before and after transformation"
              trackColor={{ true: c.brand, false: c.border }}
              thumbColor="#fff"
            />
          </View>
        )}

        {/* Shareable card (captured to PNG) */}
        <View
          ref={cardRef}
          collapsable={false}
          accessible
          accessibilityLabel={`Creation story for ${brandName}. ${hasBefore && showBefore ? `The idea: ${beforeText}. Becomes: ` : ""}Tagline: ${line}. ${streak > 0 ? `${streak} day streak.` : ""}`}
          style={[styles.card, { borderRadius: radius.lg }]}
        >
          {hasBefore && showBefore && (
            <View testID="before-block" style={styles.beforeBlock}>
              <Text style={styles.beforeLabel}>THE IDEA</Text>
              <Text style={[styles.beforeText, { fontFamily: fonts.body }]} numberOfLines={3}>{beforeText}</Text>
              <View style={styles.becomesRow}>
                <View style={styles.becomesLine} />
                <View style={styles.becomesPill}>
                  <Ionicons name="arrow-down" size={12} color="#0E0E0E" importantForAccessibility="no" />
                  <Text style={styles.becomesTxt}>BECOMES</Text>
                </View>
                <View style={styles.becomesLine} />
              </View>
            </View>
          )}
          <LinearGradient colors={grad as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardHero}>
            {kit?.logo ? (
              <Image accessibilityElementsHidden source={{ uri: `data:image/png;base64,${kit.logo}` }} style={styles.logo} contentFit="contain" />
            ) : (
              <Ionicons name="sparkles" size={44} color="#fff" importantForAccessibility="no" />
            )}
            {streak > 0 && (
              <View style={styles.streakBadge}>
                <Ionicons name="flame" size={14} color="#fff" importantForAccessibility="no" />
                <Text style={styles.streakTxt}>{streak}-day streak</Text>
              </View>
            )}
          </LinearGradient>

          <View style={{ padding: 22, backgroundColor: "#0E0E0E" }}>
            <Text style={styles.eyebrow}>MY NEW BRAND</Text>
            <Text style={[styles.brand, { fontFamily: fonts.display }]} numberOfLines={2}>{brandName}</Text>
            <Text style={[styles.tagline, { fontFamily: fonts.body }]} numberOfLines={3}>{`“${line}”`}</Text>

            <View style={styles.swatchRow}>
              {colors.map((col, i) => (
                <View key={i} style={{ flex: 1 }}>
                  <View style={{ height: 44, backgroundColor: col, borderTopLeftRadius: i === 0 ? 8 : 0, borderBottomLeftRadius: i === 0 ? 8 : 0, borderTopRightRadius: i === colors.length - 1 ? 8 : 0, borderBottomRightRadius: i === colors.length - 1 ? 8 : 0 }} />
                </View>
              ))}
            </View>

            <View style={styles.footer}>
              <View style={styles.brandMark}>
                <Ionicons name="hammer" size={13} color="#C5A880" importantForAccessibility="no" />
                <Text style={styles.footerTxt}>Made with CreatorForge</Text>
              </View>
              <Text style={styles.footerSub}>Idea → Brand in minutes</Text>
            </View>
          </View>
        </View>

        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, textAlign: "center", marginTop: 18, lineHeight: 19 }}>
          Share your progress and inspire others. This image saves to your device / downloads on web.
        </Text>
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: c.bg, borderTopColor: c.divider, paddingBottom: insets.bottom + 16 }]}>
        <Button title="Share my story" icon="share-social" onPress={share} loading={busy} testID="story-share-button" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, width: "100%", maxWidth: 420, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14 },
  card: { width: "100%", maxWidth: 420, overflow: "hidden", backgroundColor: "#0E0E0E" },
  beforeBlock: { backgroundColor: "#161616", paddingHorizontal: 22, paddingTop: 20, paddingBottom: 8 },
  beforeLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  beforeText: { color: "rgba(255,255,255,0.82)", fontSize: 15, marginTop: 6, lineHeight: 21 },
  becomesRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  becomesLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.12)" },
  becomesPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#C5A880", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  becomesTxt: { color: "#0E0E0E", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  cardHero: { height: 200, alignItems: "center", justifyContent: "center", position: "relative" },
  logo: { width: 110, height: 110 },
  streakBadge: { position: "absolute", top: 14, right: 14, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  streakTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
  eyebrow: { color: "#C5A880", fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  brand: { color: "#fff", fontSize: 30, fontWeight: "700", marginTop: 6 },
  tagline: { color: "rgba(255,255,255,0.75)", fontSize: 15, fontStyle: "italic", marginTop: 8, lineHeight: 21 },
  swatchRow: { flexDirection: "row", marginTop: 20 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  brandMark: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
  footerSub: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, borderTopWidth: 1 },
});
