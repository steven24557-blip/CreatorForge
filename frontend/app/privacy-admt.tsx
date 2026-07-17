import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Loading } from "@/src/components/ui";

export default function PrivacyAdmt() {
  const { c, fonts, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useFeedback();

  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await api.admtInfo());
    } catch {
      toast("Could not load this page", "error");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleOptOut = async (next: boolean) => {
    setBusy(true);
    try {
      const res = await api.admtOptOut(next);
      setInfo((prev: any) => ({ ...prev, opted_out: res.opted_out, opted_out_at: res.opted_out_at }));
      toast(next ? "Automated personalization turned off" : "Automated personalization turned on", "success");
    } catch (e: any) {
      toast(e.message || "Could not update your choice", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !info) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Header insets={insets} c={c} fonts={fonts} onBack={() => router.back()} />
        <Loading label="Loading…" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header insets={insets} c={c} fonts={fonts} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={{ color: c.text, fontFamily: fonts.display, fontWeight: "700", fontSize: 24 }}>
          Automated Decisions & AI
        </Text>
        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
          Notice about our use of automated decisionmaking technology (ADMT), your rights, and your controls.
        </Text>

        {/* Opt-out control */}
        <View style={[styles.card, { backgroundColor: c.card, borderColor: info.opted_out ? c.brand : c.border, borderRadius: radius.lg }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[styles.icon, { backgroundColor: c.brandSoft }]}>
              <Ionicons name="hardware-chip" size={18} color={c.brand} importantForAccessibility="no" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontFamily: fonts.body, fontWeight: "700", fontSize: 15 }}>Automated personalization</Text>
              <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                {info.opted_out ? "OFF — we don't use your data to personalize outputs." : "ON — we use your saved style to tailor results."}
              </Text>
            </View>
            <Switch
              testID="admt-optout-toggle"
              accessibilityRole="switch"
              accessibilityLabel="Opt out of automated personalization"
              accessibilityState={{ checked: !!info.opted_out }}
              value={!!info.opted_out}
              onValueChange={(v) => toggleOptOut(v)}
              disabled={busy}
              trackColor={{ true: c.brand, false: c.card2 }}
              thumbColor="#fff"
            />
          </View>
          <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 12, marginTop: 12, lineHeight: 17 }}>
            {info.opt_out_effect}
          </Text>
        </View>

        <Section title="What this technology does" body={info.purpose} c={c} fonts={fonts} />

        <Bullets title="AI models used" items={info.models} c={c} fonts={fonts} radius={radius} icon="cube" />
        <Bullets title="Data used" items={info.data_categories} c={c} fonts={fonts} radius={radius} icon="folder" />
        <Bullets title="Key factors in the output" items={info.key_factors} c={c} fonts={fonts} radius={radius} icon="options" />
        <Bullets title="Types of output" items={info.output_types} c={c} fonts={fonts} radius={radius} icon="images" />

        <Section title="How the output is used" body={info.how_output_is_used} c={c} fonts={fonts} />
        <Section title="Human involvement" body={info.human_involvement} c={c} fonts={fonts} />
        <Section title="No retaliation" body={info.no_retaliation} c={c} fonts={fonts} />

        <Bullets title="If you opt out — your alternatives" items={info.alternatives} c={c} fonts={fonts} radius={radius} icon="build" />
        <Bullets title="Ways to opt out" items={info.opt_out_methods} c={c} fonts={fonts} radius={radius} icon="checkmark-circle" />

        <Pressable
          testID="admt-email-optout"
          onPress={() => Linking.openURL("mailto:privacy@creatorforge.app?subject=ADMT%20opt-out%20request")}
          accessibilityRole="link"
          accessibilityLabel="Email privacy at creatorforge dot app to opt out"
          style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <Ionicons name="mail" size={16} color={c.brand} importantForAccessibility="no" />
          <Text style={{ color: c.brand, fontFamily: fonts.body, fontWeight: "700", fontSize: 14 }}>Email privacy@creatorforge.app</Text>
        </Pressable>

        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 11, marginTop: 20, lineHeight: 16 }}>
          CreatorForge does not use automated decisionmaking to make legal, financial, employment, housing,
          credit, insurance, healthcare, or education decisions about you. This notice is provided to support
          California CCPA/CPPA ADMT transparency and is not legal advice.
        </Text>
      </ScrollView>
    </View>
  );
}

function Header({ insets, c, fonts, onBack }: any) {
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
      <Pressable onPress={onBack} testID="admt-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={26} color={c.text} />
      </Pressable>
      <Text accessibilityRole="header" style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>Privacy</Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function Section({ title, body, c, fonts }: any) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text accessibilityRole="header" style={{ color: c.text, fontFamily: fonts.body, fontWeight: "700", fontSize: 15 }}>{title}</Text>
      <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 14, marginTop: 6, lineHeight: 21 }}>{body}</Text>
    </View>
  );
}

function Bullets({ title, items, c, fonts, radius, icon }: any) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text accessibilityRole="header" style={{ color: c.text, fontFamily: fonts.body, fontWeight: "700", fontSize: 15, marginBottom: 8 }}>{title}</Text>
      {(items || []).map((it: string, i: number) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          <Ionicons name={icon} size={14} color={c.brand} style={{ marginTop: 3 }} importantForAccessibility="no" />
          <Text style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 14, flex: 1, lineHeight: 20 }}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  card: { borderWidth: 1, padding: 16, marginTop: 18 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
