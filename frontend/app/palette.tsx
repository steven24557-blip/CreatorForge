import { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button, Chip, SectionTitle } from "@/src/components/ui";
import { generateHarmony, HARMONIES, BASE_SWATCHES, Harmony } from "@/src/utils/color";

export default function PaletteGenerator() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useFeedback();

  const [base, setBase] = useState(BASE_SWATCHES[0]);
  const [harmony, setHarmony] = useState<Harmony>("analogous");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const valid = /^#?[0-9a-fA-F]{6}$/.test(base.replace("#", ""));
  const normBase = base.startsWith("#") ? base : `#${base}`;
  const colors = useMemo(() => (valid ? generateHarmony(normBase, harmony) : []), [normBase, harmony, valid]);

  const save = async () => {
    if (!valid || colors.length === 0) {
      toast("Enter a valid hex color", "error");
      return;
    }
    setSaving(true);
    try {
      const { brand_kit } = await api.createBrandKit({
        name: name.trim() || "Custom Palette",
        auto_generate: false,
        colors,
        style_rules: [`${harmony} harmony`, "Cohesive & balanced", "High contrast"],
      });
      toast("Palette saved as a brand kit!", "success");
      router.replace(`/brand-kit/${brand_kit.id}`);
    } catch (e: any) {
      toast(e.message || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="palette-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>Palette Generator</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, maxWidth: 640, width: "100%", alignSelf: "center" }} showsVerticalScrollIndicator={false}>
        {/* Preview */}
        <View accessibilityLabel={`Palette preview with ${colors.length} colors`} style={[styles.preview, { borderRadius: radius.lg, borderColor: c.border }]}>
          {colors.map((col, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: col, height: 120, alignItems: "center", justifyContent: "flex-end", paddingBottom: 10 }}>
              <Text style={{ color: "#fff", fontSize: 9, fontFamily: fonts.body, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>{col}</Text>
            </View>
          ))}
        </View>

        <SectionTitle>Base color</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
          {BASE_SWATCHES.map((s) => (
            <Pressable
              key={s}
              testID={`base-swatch-${s.replace("#", "")}`}
              accessibilityRole="button"
              accessibilityLabel={`Base color ${s}`}
              accessibilityState={{ selected: normBase.toUpperCase() === s.toUpperCase() }}
              onPress={() => setBase(s)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: s, borderWidth: 3, borderColor: normBase.toUpperCase() === s.toUpperCase() ? c.text : "transparent" }}
            />
          ))}
        </ScrollView>
        <TextInput
          testID="hex-input"
          accessibilityLabel="Hex color code"
          value={base}
          onChangeText={setBase}
          autoCapitalize="characters"
          placeholder="#C5A880"
          placeholderTextColor={c.textMute}
          style={[styles.hex, { backgroundColor: c.card, borderColor: valid ? c.border : c.error, color: c.text, borderRadius: radius.md, fontFamily: fonts.body }]}
        />

        <View style={{ marginTop: 20 }}>
          <SectionTitle>Harmony</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {HARMONIES.map((h) => (
              <Chip key={h.key} label={h.label} active={harmony === h.key} onPress={() => setHarmony(h.key)} testID={`harmony-${h.key}`} />
            ))}
          </ScrollView>
        </View>

        <TextInput
          testID="palette-name-input"
          accessibilityLabel="Palette name"
          value={name}
          onChangeText={setName}
          placeholder="Palette name (optional)"
          placeholderTextColor={c.textMute}
          style={[styles.hex, { backgroundColor: c.card, borderColor: c.border, color: c.text, borderRadius: radius.md, fontFamily: fonts.body, marginTop: 20 }]}
        />

        <Button title="Save as Brand Kit" icon="save" loading={saving} onPress={save} testID="save-palette-button" style={{ marginTop: 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  preview: { flexDirection: "row", overflow: "hidden", borderWidth: 1, marginBottom: 24 },
  hex: { height: 52, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, marginTop: 12 },
});
