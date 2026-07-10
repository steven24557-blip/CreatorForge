import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button, SectionTitle } from "@/src/components/ui";

type Status = "pending" | "active" | "done" | "error";
const STEP_DEFS = [
  { key: "refine", label: "Refining your idea", icon: "sparkles" },
  { key: "project", label: "Structuring the project", icon: "construct" },
  { key: "brand", label: "Designing your brand kit", icon: "color-palette" },
  { key: "taglines", label: "Writing taglines", icon: "chatbubble-ellipses" },
  { key: "visual", label: "Forging a hero visual", icon: "image" },
];

export default function Agent() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast, celebrate } = useFeedback();

  const [idea, setIdea] = useState("");
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [limited, setLimited] = useState(false);

  const [project, setProject] = useState<any>(null);
  const [brandKit, setBrandKit] = useState<any>(null);
  const [taglines, setTaglines] = useState<string[]>([]);
  const [asset, setAsset] = useState<any>(null);

  const set = (key: string, s: Status) => setStatuses((prev) => ({ ...prev, [key]: s }));

  const run = async () => {
    if (!idea.trim()) {
      toast("Describe your idea first", "error");
      return;
    }
    setRunning(true);
    setLimited(false);
    setProject(null); setBrandKit(null); setTaglines([]); setAsset(null);
    setStatuses({});
    const unlocked: string[] = [];
    try {
      set("refine", "active");
      const refined = await api.refine(idea.trim(), "plan");
      set("refine", "done");

      set("project", "active");
      const pr = await api.createProject({
        title: refined.title,
        summary: refined.summary,
        pitch: refined.pitch,
        target_audience: refined.target_audience,
        value_prop: refined.value_prop,
        tasks: refined.tasks || [],
        brand_keywords: refined.brand_keywords || [],
        source_idea: idea.trim(),
      });
      setProject(pr.project);
      (pr.newly_unlocked || []).forEach((k: string) => unlocked.push(k));
      set("project", "done");

      set("brand", "active");
      const bk = await api.createBrandKit({ project_id: pr.project.id, auto_generate: true });
      setBrandKit(bk.brand_kit);
      set("brand", "done");

      set("taglines", "active");
      const tg = await api.taglines(`${pr.project.title}. ${pr.project.summary}`);
      setTaglines(tg.taglines || []);
      set("taglines", "done");

      set("visual", "active");
      const as = await api.generateAsset({
        project_id: pr.project.id,
        brand_kit_id: bk.brand_kit.id,
        type: "social",
        prompt: `hero social graphic representing ${pr.project.title}`,
      });
      setAsset(as.asset);
      (as.newly_unlocked || []).forEach((k: string) => unlocked.push(k));
      set("visual", "done");

      if (unlocked.length) {
        const u = await api.usage();
        const m = u.milestones?.[unlocked[0]];
        if (m) celebrate({ title: m.title, desc: m.desc, reward: m.reward });
      }
    } catch (e: any) {
      setStatuses((prev) => {
        const next = { ...prev };
        for (const s of STEP_DEFS) if (next[s.key] === "active") next[s.key] = "error";
        return next;
      });
      if (e.status === 402) {
        setLimited(true);
        toast("Daily free generation limit reached", "info");
      } else {
        toast(e.message || "The agent hit a snag", "error");
      }
    } finally {
      setRunning(false);
    }
  };

  const complete = statuses.visual === "done";

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="agent-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>Idea → Brand Agent</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 50}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, maxWidth: 680, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.hero, { backgroundColor: c.brandSoft, borderRadius: radius.lg }]}>
            <Ionicons name="flash" size={22} color={c.brand} importantForAccessibility="no" />
            <Text style={{ color: c.text, fontFamily: fonts.body, fontSize: 14, flex: 1, lineHeight: 20 }}>
              Describe your idea once — the agent refines it, builds a project, designs a brand kit, writes taglines, and forges a hero visual, all on-brand.
            </Text>
          </View>

          <Pressable
            testID="agent-memory-chip"
            accessibilityRole="button"
            accessibilityLabel="Smart Brand Memory settings"
            onPress={() => router.push("/brand-memory")}
            style={[styles.memChip, { borderColor: c.border }]}
          >
            <Ionicons name="bulb" size={14} color={c.brand} importantForAccessibility="no" />
            <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 12, flex: 1 }}>Smart Brand Memory enforces your style across generations</Text>
            <Ionicons name="chevron-forward" size={14} color={c.textMute} importantForAccessibility="no" />
          </Pressable>

          <TextInput
            testID="agent-idea-input"
            accessibilityLabel="Describe your idea"
            placeholder="e.g. A premium oat-milk brand for coffee lovers…"
            placeholderTextColor={c.textMute}
            value={idea}
            onChangeText={setIdea}
            editable={!running}
            multiline
            style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text, borderRadius: radius.lg, fontFamily: fonts.body }]}
          />

          <Button title={running ? "Forging…" : "Forge my brand"} icon="hammer" loading={running} onPress={run} testID="agent-run-button" style={{ marginTop: 16 }} />

          {/* Stepper */}
          {(running || Object.keys(statuses).length > 0) && (
            <View style={{ marginTop: 24 }}>
              {STEP_DEFS.map((s) => {
                const st = statuses[s.key] || "pending";
                return (
                  <View key={s.key} style={styles.stepRow} accessibilityLabel={`${s.label}: ${st}`}>
                    <View style={[styles.stepIcon, { backgroundColor: st === "done" ? c.brand : st === "error" ? c.card2 : c.card, borderColor: st === "active" ? c.brand : c.border }]}>
                      {st === "active" ? (
                        <ActivityIndicator size="small" color={c.brand} />
                      ) : (
                        <Ionicons
                          name={(st === "done" ? "checkmark" : st === "error" ? "close" : s.icon) as any}
                          size={18}
                          color={st === "done" ? c.onBrand : st === "error" ? c.onError : c.textMute}
                        />
                      )}
                    </View>
                    <Text style={{ color: st === "pending" ? c.textMute : c.text, fontFamily: fonts.body, fontSize: 15, fontWeight: st === "active" ? "700" : "500" }}>
                      {s.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {limited && (
            <View style={[styles.limitCard, { backgroundColor: c.card, borderColor: c.brand, borderRadius: radius.lg }]}>
              <Text style={{ color: c.text, fontFamily: fonts.display, fontWeight: "700", fontSize: 16 }}>Out of free generations</Text>
              <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginTop: 4, marginBottom: 12 }}>
                Your project & plan are saved. Upgrade for unlimited on-brand visuals.
              </Text>
              <Button title="See Premium" icon="star" onPress={() => router.push("/paywall")} testID="agent-upgrade-button" />
            </View>
          )}

          {/* Result */}
          {project && (
            <View style={{ marginTop: 28 }}>
              <SectionTitle>{complete ? "Your brand is forged" : "In progress"}</SectionTitle>
              <View style={[styles.resultCard, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.lg }]}>
                {asset && (
                  <Image accessibilityLabel={`Hero visual for ${project.title}`} source={{ uri: `data:image/png;base64,${asset.image_b64}` }} style={{ width: "100%", height: 200 }} contentFit="cover" />
                )}
                {brandKit && (
                  <View style={{ flexDirection: "row" }}>
                    {(brandKit.colors || []).slice(0, 5).map((col: string, i: number) => (
                      <View key={i} style={{ flex: 1, height: 12, backgroundColor: col }} />
                    ))}
                  </View>
                )}
                <View style={{ padding: 16 }}>
                  <Text style={{ color: c.text, fontFamily: fonts.display, fontWeight: "700", fontSize: 20 }}>{project.title}</Text>
                  {!!project.pitch && <Text style={{ color: c.brand, fontFamily: fonts.body, fontStyle: "italic", fontSize: 14, marginTop: 6 }}>{`"${project.pitch}"`}</Text>}
                  {taglines.slice(0, 3).map((t, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: i === 0 ? 12 : 6 }}>
                      <Ionicons name="pricetag" size={14} color={c.textMute} style={{ marginTop: 2 }} importantForAccessibility="no" />
                      <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 14, flex: 1 }}>{t}</Text>
                    </View>
                  ))}
                  {!running && (
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                      <Button title="Open Project" onPress={() => router.replace(`/project/${project.id}`)} testID="agent-open-project" style={{ flex: 1 }} />
                      {brandKit && <Button title="Brand Kit" variant="secondary" onPress={() => router.replace(`/brand-kit/${brandKit.id}`)} testID="agent-open-kit" style={{ flex: 1 }} />}
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  memChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14 },
  input: { borderWidth: 1, padding: 16, minHeight: 110, fontSize: 16, textAlignVertical: "top", marginTop: 14 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 },
  stepIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  limitCard: { borderWidth: 1, padding: 18, marginTop: 20 },
  resultCard: { borderWidth: 1, overflow: "hidden" },
});
