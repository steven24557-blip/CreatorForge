import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button, Chip, Loading, SectionTitle } from "@/src/components/ui";
import { exportPlanPdf } from "@/src/utils/exporter";

const STATUSES = [
  { key: "idea", label: "Idea" },
  { key: "branding", label: "Branding" },
  { key: "done", label: "Complete" },
];

export default function ProjectDetail() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast, celebrate } = useFeedback();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [creatingKit, setCreatingKit] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.project(id);
      setData(res);
    } catch {
      toast("Project not found", "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Loading />
      </View>
    );
  }

  const p = data.project;
  const kit = data.brand_kit;
  const assets = data.assets || [];

  const setStatus = async (status: string) => {
    try {
      const { newly_unlocked } = await api.patchProject(id, { status });
      if (newly_unlocked?.length) {
        const u = await api.usage();
        const m = u.milestones?.[newly_unlocked[0]];
        if (m) celebrate({ title: m.title, desc: m.desc, reward: m.reward });
      }
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const toggleTask = async (taskId: string) => {
    const tasks = p.tasks.map((t: any) => (t.id === taskId ? { ...t, done: !t.done } : t));
    setData({ ...data, project: { ...p, tasks } });
    try {
      await api.patchProject(id, { tasks });
    } catch {
      load();
    }
  };

  const sendRefine = async () => {
    if (!msg.trim()) return;
    const text = msg.trim();
    setMsg("");
    setSending(true);
    try {
      await api.refineProject(id, text);
      await load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSending(false);
    }
  };

  const createKit = async () => {
    setCreatingKit(true);
    try {
      const { brand_kit } = await api.createBrandKit({ project_id: id, auto_generate: true });
      router.push(`/brand-kit/${brand_kit.id}`);
    } catch (e: any) {
      if (e.status === 402) router.push("/paywall");
      else toast(e.message, "error");
    } finally {
      setCreatingKit(false);
    }
  };

  const exportPlan = async () => {
    try {
      await exportPlanPdf(p);
      toast("Plan exported", "success");
    } catch {
      toast("Export failed", "error");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="project-back" hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Pressable onPress={exportPlan} testID="export-plan-button" hitSlop={10}>
          <Ionicons name="share-outline" size={22} color={c.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 50}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={{ color: c.text, fontSize: 28, fontWeight: "700", fontFamily: fonts.display }}>{p.title}</Text>
          {!!p.pitch && <Text style={{ color: c.brand, fontStyle: "italic", fontFamily: fonts.body, fontSize: 16, marginTop: 8 }}>"{p.pitch}"</Text>}
          <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 12 }}>{p.summary}</Text>

          {/* status */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
            {STATUSES.map((s) => (
              <Chip key={s.key} label={s.label} active={p.status === s.key} onPress={() => setStatus(s.key)} testID={`status-${s.key}`} />
            ))}
          </View>

          {/* tasks */}
          {!!(p.tasks || []).length && (
            <View style={{ marginTop: 26 }}>
              <SectionTitle>Tasks</SectionTitle>
              {p.tasks.map((t: any) => (
                <Pressable key={t.id} testID={`task-${t.id}`} onPress={() => toggleTask(t.id)} style={[styles.task, { borderBottomColor: c.divider }]}>
                  <Ionicons name={t.done ? "checkbox" : "square-outline"} size={22} color={t.done ? c.brand : c.textMute} />
                  <Text style={{ color: t.done ? c.textMute : c.text, fontFamily: fonts.body, fontSize: 15, flex: 1, textDecorationLine: t.done ? "line-through" : "none" }}>
                    {t.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* brand kit */}
          <View style={{ marginTop: 26 }}>
            <SectionTitle>Brand</SectionTitle>
            {kit ? (
              <Pressable testID="project-brand-kit" onPress={() => router.push(`/brand-kit/${kit.id}`)} style={[styles.kit, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.lg }]}>
                <View style={{ flexDirection: "row" }}>
                  {(kit.colors || []).slice(0, 5).map((col: string, i: number) => (
                    <View key={i} style={{ flex: 1, height: 40, backgroundColor: col }} />
                  ))}
                </View>
                <View style={{ padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: c.text, fontFamily: fonts.display, fontWeight: "700", fontSize: 16 }}>{kit.name}</Text>
                  <Ionicons name="chevron-forward" size={18} color={c.textMute} />
                </View>
              </Pressable>
            ) : (
              <Button title="Create Brand Kit" icon="color-wand" loading={creatingKit} onPress={createKit} testID="create-project-kit" />
            )}
          </View>

          {/* assets */}
          {assets.length > 0 && (
            <View style={{ marginTop: 26 }}>
              <SectionTitle>Assets</SectionTitle>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {assets.map((a: any) => (
                  <Image key={a.id} source={{ uri: `data:image/png;base64,${a.image_b64 || ""}` }} style={{ width: 140, height: 140, borderRadius: radius.md, backgroundColor: c.card }} contentFit="cover" />
                ))}
              </ScrollView>
            </View>
          )}

          {/* refinement */}
          <View style={{ marginTop: 26 }}>
            <SectionTitle>Refine with AI</SectionTitle>
            {(p.refinements || []).map((r: any, i: number) => (
              <View key={i} style={{ marginBottom: 14 }}>
                <Text style={{ color: r.role === "user" ? c.textMute : c.brand, fontFamily: fonts.body, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 4 }}>
                  {r.role === "user" ? "YOU" : "CREATORFORGE"}
                </Text>
                <Text style={{ color: r.role === "user" ? c.textDim : c.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 }}>{r.text}</Text>
              </View>
            ))}
            {sending && <ActivityIndicator color={c.brand} style={{ marginVertical: 8 }} />}
            <View style={[styles.refineBar, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.md }]}>
              <TextInput
                testID="refine-input"
                placeholder="Make it more modern…"
                placeholderTextColor={c.textMute}
                value={msg}
                onChangeText={setMsg}
                style={{ flex: 1, color: c.text, fontFamily: fonts.body, fontSize: 15 }}
                onSubmitEditing={sendRefine}
              />
              <Pressable onPress={sendRefine} testID="refine-send" disabled={sending}>
                <Ionicons name="arrow-up-circle" size={32} color={c.brand} />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  task: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  kit: { borderWidth: 1, overflow: "hidden" },
  refineBar: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingLeft: 14, paddingRight: 8, height: 52, marginTop: 8 },
});
