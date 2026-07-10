import { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button, Chip, Disclaimer } from "@/src/components/ui";
import { pickCelebration } from "@/src/utils/celebrate";

const MODES = [
  { key: "plan", label: "Plan" },
  { key: "pitch", label: "Pitch" },
  { key: "tasks", label: "Tasks" },
];

export default function Capture() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ seed?: string; mode?: string }>();
  const { toast, celebrate } = useFeedback();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const [idea, setIdea] = useState(typeof params.seed === "string" ? params.seed : "");
  const [mode, setMode] = useState(
    typeof params.mode === "string" && ["plan", "pitch", "tasks"].includes(params.mode) ? params.mode : "plan"
  );
  const [refining, setRefining] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const startRecording = async () => {
    if (Platform.OS === "web") {
      toast("Voice capture is available on the mobile app", "info");
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        toast("Enable microphone access in Settings", "error");
        Linking.openSettings();
      } else {
        toast("Microphone permission needed to record", "error");
      }
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch {
      toast("Couldn't start recording", "error");
    }
  };

  const stopRecording = async () => {
    setRecording(false);
    setTranscribing(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        const { text } = await api.transcribe(uri, "memo.m4a", "audio/m4a");
        if (text) setIdea((prev) => (prev ? prev + " " : "") + text);
        else toast("Didn't catch that — try again", "info");
      }
    } catch {
      toast("Transcription failed", "error");
    } finally {
      setTranscribing(false);
    }
  };

  const refine = async () => {
    if (!idea.trim()) {
      toast("Describe your idea first", "error");
      return;
    }
    setRefining(true);
    try {
      const res = await api.refine(idea.trim(), mode);
      setResult(res);
    } catch (e: any) {
      toast(e.message || "Refine failed", "error");
    } finally {
      setRefining(false);
    }
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const res = await api.createProject({
        title: result.title,
        summary: result.summary,
        pitch: result.pitch,
        target_audience: result.target_audience,
        value_prop: result.value_prop,
        tasks: result.tasks || [],
        brand_keywords: result.brand_keywords || [],
        source_idea: idea.trim(),
      });
      const { project } = res;
      if (res.newly_unlocked?.length || res.streak_event?.is_milestone) {
        let milestones;
        if (res.newly_unlocked?.length) milestones = (await api.usage()).milestones;
        const cel = pickCelebration(res, milestones);
        if (cel) celebrate(cel);
      }
      router.replace(`/project/${project.id}`);
    } catch (e: any) {
      toast(e.message || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="capture-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text style={{ color: c.text, fontSize: 18, fontWeight: "700", fontFamily: fonts.display }}>Capture Idea</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 50}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 14, marginBottom: 10 }}>
            What's your idea? Type it or record a voice memo.
          </Text>

          <View style={[styles.ideaBox, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.lg }]}>
            <TextInput
              testID="idea-input"
              placeholder="e.g. A subscription box for indie board games…"
              placeholderTextColor={c.textMute}
              value={idea}
              onChangeText={setIdea}
              multiline
              style={{ color: c.text, fontFamily: fonts.body, fontSize: 16, minHeight: 120, textAlignVertical: "top" }}
            />
            <Pressable
              testID="voice-record-button"
              accessibilityRole="button"
              accessibilityLabel={recording ? "Stop recording" : "Record a voice memo"}
              accessibilityState={{ busy: transcribing }}
              onPress={recording ? stopRecording : startRecording}
              disabled={transcribing}
              style={[styles.micBtn, { backgroundColor: recording ? c.error : c.brandSoft }]}
            >
              {transcribing ? (
                <ActivityIndicator color={c.brand} size="small" />
              ) : (
                <Ionicons name={recording ? "stop" : "mic"} size={20} color={recording ? "#fff" : c.brand} />
              )}
            </Pressable>
          </View>
          {recording && (
            <Text style={{ color: c.error, fontFamily: fonts.body, fontSize: 13, marginTop: 8 }}>● Recording… tap stop when done</Text>
          )}

          <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 14, marginTop: 22, marginBottom: 10 }}>Refine into:</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {MODES.map((m) => (
              <Chip key={m.key} label={m.label} active={mode === m.key} onPress={() => setMode(m.key)} testID={`mode-${m.key}`} />
            ))}
          </View>

          <Button title="Refine with AI" icon="sparkles" loading={refining} onPress={refine} testID="refine-button" style={{ marginTop: 20 }} />

          {result && (
            <View style={[styles.result, { backgroundColor: c.card, borderColor: c.brand, borderRadius: radius.lg }]}>
              <Text style={{ color: c.brand, fontFamily: fonts.body, fontSize: 12, fontWeight: "700", letterSpacing: 1 }}>AI REFINED</Text>
              <Text style={{ color: c.text, fontSize: 24, fontWeight: "700", fontFamily: fonts.display, marginTop: 6 }}>{result.title}</Text>
              {!!result.pitch && (
                <Text style={{ color: c.brand, fontStyle: "italic", fontFamily: fonts.body, fontSize: 15, marginTop: 8 }}>"{result.pitch}"</Text>
              )}
              <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 12 }}>{result.summary}</Text>

              {!!(result.tasks || []).length && (
                <>
                  <Text style={[styles.subhead, { color: c.textMute }]}>NEXT STEPS</Text>
                  {result.tasks.map((t: string, i: number) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                      <Ionicons name="ellipse-outline" size={16} color={c.brand} style={{ marginTop: 2 }} />
                      <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 14, flex: 1 }}>{t}</Text>
                    </View>
                  ))}
                </>
              )}

              {!!(result.brand_keywords || []).length && (
                <>
                  <Text style={[styles.subhead, { color: c.textMute }]}>BRAND MOOD</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {result.brand_keywords.map((k: string) => (
                      <View key={k} style={{ backgroundColor: c.brandSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Text style={{ color: c.brand, fontFamily: fonts.body, fontSize: 12, fontWeight: "600" }}>{k}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              <Button title="Save as Project" icon="checkmark" loading={saving} onPress={save} testID="save-project-button" style={{ marginTop: 20 }} />
              <Disclaimer style={{ marginTop: 14 }} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  ideaBox: { borderWidth: 1, padding: 16 },
  micBtn: { alignSelf: "flex-end", width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginTop: 12 },
  result: { borderWidth: 1, padding: 20, marginTop: 24 },
  subhead: { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 18, marginBottom: 8 },
});
