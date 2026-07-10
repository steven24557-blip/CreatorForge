import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button, SectionTitle, Loading } from "@/src/components/ui";

export default function BrandMemory() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useFeedback();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [tone, setTone] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [newKw, setNewKw] = useState("");

  const load = useCallback(async () => {
    try {
      const { brand_memory } = await api.brandMemory();
      setEnabled(brand_memory.enabled !== false);
      setTone(brand_memory.tone || "");
      setKeywords(brand_memory.keywords || []);
      setColors(brand_memory.colors || []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addKw = () => {
    const k = newKw.trim();
    if (k && !keywords.some((x) => x.toLowerCase() === k.toLowerCase())) {
      setKeywords([k, ...keywords].slice(0, 12));
    }
    setNewKw("");
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateBrandMemory({ enabled, tone, keywords, colors });
      toast("Brand memory updated", "success");
      router.back();
    } catch (e: any) {
      toast(e.message || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: c.bg }}><Loading /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="memory-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>Smart Brand Memory</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, maxWidth: 680, width: "100%", alignSelf: "center" }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: c.brandSoft, borderRadius: radius.lg }]}>
          <Ionicons name="bulb" size={22} color={c.brand} importantForAccessibility="no" />
          <Text style={{ color: c.text, fontFamily: fonts.body, fontSize: 14, flex: 1, lineHeight: 20 }}>
            CreatorForge learns your style as you create and enforces it across every AI generation — palettes, taglines and visuals stay consistent.
          </Text>
        </View>

        <View style={[styles.toggleRow, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.lg }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontFamily: fonts.body, fontSize: 15, fontWeight: "700" }}>Enforce my style</Text>
            <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 12, marginTop: 2 }}>Apply learned style to new generations</Text>
          </View>
          <Switch
            testID="memory-enabled-toggle"
            accessibilityRole="switch"
            accessibilityLabel="Enforce brand memory"
            accessibilityState={{ checked: enabled }}
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ true: c.brand, false: c.card2 }}
            thumbColor="#fff"
          />
        </View>

        <View style={{ marginTop: 22 }}>
          <SectionTitle>Brand tone</SectionTitle>
          <TextInput
            testID="memory-tone-input"
            accessibilityLabel="Brand tone"
            placeholder="e.g. warm, premium, playful"
            placeholderTextColor={c.textMute}
            value={tone}
            onChangeText={setTone}
            style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text, borderRadius: radius.md, fontFamily: fonts.body }]}
          />
        </View>

        <View style={{ marginTop: 22 }}>
          <SectionTitle>Learned keywords</SectionTitle>
          <View style={[styles.addRow, { backgroundColor: c.card, borderColor: c.border, borderRadius: radius.md }]}>
            <TextInput
              testID="memory-keyword-input"
              accessibilityLabel="Add keyword"
              placeholder="Add a style keyword…"
              placeholderTextColor={c.textMute}
              value={newKw}
              onChangeText={setNewKw}
              onSubmitEditing={addKw}
              returnKeyType="done"
              style={{ flex: 1, color: c.text, fontFamily: fonts.body, fontSize: 15 }}
            />
            <Pressable onPress={addKw} testID="memory-add-keyword" accessibilityRole="button" accessibilityLabel="Add keyword" hitSlop={8}>
              <Ionicons name="add-circle" size={28} color={c.brand} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {keywords.length === 0 && <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13 }}>No keywords yet — create a project or brand kit and they'll appear here.</Text>}
            {keywords.map((k) => (
              <Pressable
                key={k}
                testID={`memory-kw-${k}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove keyword ${k}`}
                onPress={() => setKeywords(keywords.filter((x) => x !== k))}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandSoft, borderRadius: 999, paddingLeft: 12, paddingRight: 8, paddingVertical: 7 }}
              >
                <Text style={{ color: c.brand, fontFamily: fonts.body, fontSize: 13, fontWeight: "600" }}>{k}</Text>
                <Ionicons name="close-circle" size={16} color={c.brand} />
              </Pressable>
            ))}
          </View>
        </View>

        {colors.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <SectionTitle>Signature colors</SectionTitle>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {colors.map((col) => (
                <Pressable
                  key={col}
                  testID={`memory-color-${col.replace("#", "")}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove color ${col}`}
                  onPress={() => setColors(colors.filter((x) => x !== col))}
                  style={{ alignItems: "center" }}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: col, borderWidth: 1, borderColor: c.border }} />
                  <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 9, marginTop: 4 }}>{col}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Button title="Save memory" icon="save" loading={saving} onPress={save} testID="memory-save-button" style={{ marginTop: 28 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, padding: 16, marginTop: 16 },
  input: { height: 52, borderWidth: 1, paddingHorizontal: 16, fontSize: 15 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingLeft: 14, paddingRight: 8, height: 52 },
});
