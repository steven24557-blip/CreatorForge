import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme } from "@/src/theme/ThemeContext";

const DOCS: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: "Privacy Policy",
    body: [
      "CreatorForge respects your privacy. This policy explains what we collect and how we use it.",
      "Data we collect: Account details (name, email), the ideas, projects, brand kits and prompts you create, and generated outputs. We store these to provide the service and sync your workspace.",
      "AI processing: Text and voice inputs you submit are sent to third-party AI providers (Anthropic, Google, OpenAI) to generate refinements, images and transcriptions. Do not submit confidential information you are not authorized to share.",
      "Voice memos: Audio is transcribed and the transcription is stored with your idea. Audio files are processed transiently and are not retained after transcription.",
      "Payments: Payments are processed by our payment provider. We store only a transaction reference and your subscription status — never full card details.",
      "Data retention & deletion: Your content is retained while your account is active. You may request deletion of your account and associated data at any time.",
      "We do not sell your personal data. We use industry-standard measures to protect it, though no method is 100% secure.",
    ],
  },
  terms: {
    title: "Terms & Subscription",
    body: [
      "By using CreatorForge you agree to these terms. The app is provided 'as is' for creative and business inspiration.",
      "Subscriptions: Premium is offered at $14.99/month or $149/year (USD). Payment is charged at confirmation of purchase.",
      "Auto-renewal: Subscriptions automatically renew at the end of each billing period unless cancelled beforehand. You can manage or cancel your subscription from your account or platform settings.",
      "Cancellation & refunds: You may cancel anytime; access continues until the end of the paid period. Refunds are handled per the policy of the platform used to purchase.",
      "Free tier: The free plan includes a limited number of daily AI generations and may apply watermarks to certain outputs.",
      "Acceptable use: You agree not to misuse the service, infringe others' rights, or generate unlawful content. We may suspend accounts that violate these terms.",
      "You retain ownership of the ideas and content you create, subject to the AI providers' terms for generated outputs.",
    ],
  },
  disclaimer: {
    title: "AI Disclaimer",
    body: [
      "CreatorForge is an AI-assisted tool for inspiration and creation.",
      "You are responsible for reviewing, verifying and finalizing all outputs before any commercial use.",
      "AI-generated names, logos, taglines and visuals may resemble existing works. You are solely responsible for conducting trademark, copyright and legal clearance before using any output commercially.",
      "Generated content may contain inaccuracies. Do not rely on it as professional, legal, financial or medical advice.",
      "Suitable for users aged 13 and above.",
    ],
  },
};

export default function Legal() {
  const { c, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = DOCS[doc || "privacy"] || DOCS.privacy;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <Pressable onPress={() => router.back()} testID="legal-back" hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>{content.title}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {content.body.map((para, i) => (
          <Text key={i} style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 15, lineHeight: 24, marginBottom: 16 }}>
            {para}
          </Text>
        ))}
        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 12, marginTop: 8 }}>Last updated: June 2026</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
});
