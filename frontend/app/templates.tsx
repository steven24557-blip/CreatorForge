import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { Card, Chip, Badge } from "@/src/components/ui";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "@/src/constants/templates";

export default function Templates() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cat, setCat] = useState(TEMPLATE_CATEGORIES[0]);

  const items = TEMPLATES.filter((t) => t.category === cat);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="templates-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>Templates</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={{ borderBottomColor: c.divider, borderBottomWidth: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 16 }}>
          {TEMPLATE_CATEGORIES.map((ct) => (
            <Chip key={ct} label={ct} active={cat === ct} onPress={() => setCat(ct)} testID={`template-cat-${ct.replace(/\s/g, "-").toLowerCase()}`} />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, maxWidth: 640, width: "100%", alignSelf: "center" }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginBottom: 16 }}>
          Pick a starting point — we'll pre-fill your idea, then AI refines it.
        </Text>
        {items.map((t) => (
          <Card
            key={t.id}
            testID={`template-${t.id}`}
            onPress={() => router.push({ pathname: "/capture", params: { seed: t.seed, mode: t.mode } })}
            style={{ marginBottom: 12 }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: c.text, fontWeight: "700", fontSize: 16, fontFamily: fonts.display, flex: 1, marginRight: 8 }}>{t.title}</Text>
              <Badge label={t.mode} tone="brand" />
            </View>
            <Text style={{ color: c.textMute, fontSize: 13, marginTop: 6, lineHeight: 19, fontFamily: fonts.body }} numberOfLines={2}>{t.seed}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
              <Ionicons name="sparkles" size={14} color={c.brand} />
              <Text style={{ color: c.brand, fontFamily: fonts.body, fontSize: 12, fontWeight: "600" }}>Use this template</Text>
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
});
