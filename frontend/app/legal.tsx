import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme } from "@/src/theme/ThemeContext";

const DOCS: Record<string, { title: string; effective: string; body: string[] }> = {
  privacy: {
    title: "Privacy Policy",
    effective: "Effective 1 June 2026",
    body: [
      "CreatorForge (\"we\", \"us\") builds an AI-assisted workspace for turning ideas into branded assets. This Privacy Policy explains what we collect, how we use it, the third parties involved, and your rights under the EU/UK GDPR and the California Consumer Privacy Act (CCPA/CPRA). By using the app you agree to this policy.",
      "# 1. Data We Collect",
      "Account data: name, email address, and (for password accounts) a securely hashed password. For Google sign-in we receive your name, email and profile picture from Google.",
      "Content you create: ideas, voice memos, projects, tasks, brand kits, prompts, and the AI outputs generated for you (text, palettes, taglines, images).",
      "Usage data: generation counts, streaks, milestone progress, subscription status, and basic device/log information needed to operate and secure the service.",
      "Payment data: we do NOT store your card number. Payments are processed by Stripe; we retain only a transaction reference and your subscription status.",
      "# 2. How We Use Your Data",
      "To provide and sync your workspace across devices; to generate AI outputs you request; to enforce plan limits and unlock rewards; to process subscriptions; to secure the service and prevent abuse; and to comply with legal obligations. Our legal bases (GDPR Art. 6) are performance of contract, your consent (for optional features like voice capture), and our legitimate interests in operating a secure service.",
      "# 3. AI Processing & Third-Party Sub-processors",
      "Text and image inputs you submit are sent to AI providers to generate outputs: Anthropic (Claude) for text, Google (Gemini) for images, and OpenAI (Whisper) for voice transcription. These providers process your inputs to return a result. Do not submit confidential, sensitive, or personal information of others that you are not authorized to share.",
      "Voice data: audio you record is uploaded solely to produce a text transcription. The transcription is stored with your idea; the audio file is processed transiently and is not retained by us after transcription.",
      "Payments: Stripe, Inc. acts as our payment sub-processor.",
      "# 4. Data Sharing",
      "We do not sell your personal information and we do not share it for cross-context behavioral advertising. We share data only with the sub-processors above, or where required by law, or to protect our rights and users' safety.",
      "# 5. Data Retention",
      "We retain your content while your account is active. On deletion request, we remove your account and associated content within 30 days, except where retention is legally required (e.g., transaction records).",
      "# 6. Your Rights (GDPR / UK GDPR)",
      "You have the right to access, rectify, erase, restrict, and port your data, and to object to processing. Where processing is based on consent, you may withdraw it at any time. You may also lodge a complaint with your local supervisory authority.",
      "# 7. Your Rights (California – CCPA/CPRA)",
      "California residents have the right to know, access, delete, and correct personal information, and the right to opt out of sale/sharing (note: we do not sell or share). We will not discriminate against you for exercising these rights.",
      "# 8. Automated Decisionmaking Technology (ADMT)",
      "We use automated decisionmaking technology (AI models — Anthropic Claude, Google Gemini, and OpenAI Whisper) solely to help you create brand content from the ideas, text, and voice you submit. We do NOT use ADMT to make legal, financial, employment, housing, credit, insurance, healthcare, or education decisions about you. Key factors in the output are the words and intent of your prompt, the asset type you request, and — only if personalization is enabled — your saved brand style. Outputs are editable suggestions; you review, refine, or discard them, and nothing consequential happens automatically.",
      "You may opt out of automated personalization at any time in Profile → Automated Decisions & AI, or by emailing privacy@creatorforge.app. If you opt out, AI creation tools remain available but we will not use your data to profile or personalize outputs (Smart Brand Memory is turned off and no style data is stored), and manual tools (palette generator, templates, manual editing, exports) remain available. You have the right to access details about how this technology works, and we will not retaliate against you for opting out.",
      "# 9. Security",
      "Passwords are hashed with bcrypt and never stored in plaintext. Authentication uses signed bearer tokens transmitted over encrypted HTTPS/TLS connections; tokens are stored in the device secure keychain (mobile) or secured browser storage (web). We apply access controls and industry-standard safeguards, though no method of transmission or storage is 100% secure.",
      "# 10. Children",
      "The service is intended for users aged 13 and older. We do not knowingly collect data from children under 13.",
      "# 11. Contact & Requests",
      "To exercise any right or ask a question, contact privacy@creatorforge.app. We will respond within the timeframes required by applicable law.",
    ],
  },
  terms: {
    title: "Terms of Service",
    effective: "Effective 1 June 2026",
    body: [
      "These Terms of Service (\"Terms\") govern your use of CreatorForge. By creating an account or using the app you agree to these Terms. If you do not agree, do not use the service.",
      "# 1. Eligibility",
      "You must be at least 13 years old (or the age of digital consent in your country) to use CreatorForge. If you use the app on behalf of an organization, you represent that you are authorized to bind it.",
      "# 2. The Service",
      "CreatorForge is an AI-assisted creative tool that helps you refine ideas and generate branding materials. Features and AI models may change over time as we improve the product.",
      "# 3. Your Content & Ownership",
      "You retain ownership of the ideas and content you input. Subject to the AI providers' terms, outputs generated for you are yours to use; however AI outputs are provided for inspiration and are not guaranteed to be original, accurate, or free of third-party rights.",
      "# 4. Acceptable Use",
      "You agree not to: submit unlawful, infringing, hateful, or deceptive content; attempt to reverse engineer, overload, or abuse the service; generate content that violates others' intellectual property, privacy, or publicity rights; or use outputs in a way that misleads consumers. We may suspend or terminate accounts that violate these Terms.",
      "# 5. AI Disclaimer",
      "AI-assisted creative tool. All outputs are for inspiration only. You are solely responsible for final commercial use, trademark searches, copyright clearance, and the accuracy of any plans or branding. Do not rely on outputs as legal, financial, medical, or professional advice.",
      "# 6. Free & Premium Plans",
      "The free plan includes a limited number of daily AI generations and may apply watermarks to certain outputs. Premium removes these limits as described in the Subscription Agreement.",
      "# 7. Intellectual Property",
      "The CreatorForge name, app, and design are owned by us. These Terms do not grant you rights to our trademarks or software beyond using the service as intended.",
      "# 8. Disclaimers & Limitation of Liability",
      "The service is provided \"as is\" and \"as available\" without warranties of any kind. To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages, or for outcomes arising from your use of AI outputs. Nothing limits liability that cannot be excluded by law.",
      "# 9. Termination",
      "You may stop using the service at any time. We may suspend or end access for violations of these Terms or to comply with law.",
      "# 10. Changes & Governing Law",
      "We may update these Terms; material changes will be notified in-app. Continued use after changes constitutes acceptance. These Terms are governed by applicable consumer-protection laws of your jurisdiction to the extent they apply.",
      "# 11. Contact",
      "Questions? Contact support@creatorforge.app.",
    ],
  },
  subscription: {
    title: "Subscription Agreement",
    effective: "Effective 1 June 2026",
    body: [
      "This Subscription Agreement governs CreatorForge Premium subscriptions and supplements our Terms of Service.",
      "# 1. Plans & Pricing",
      "Premium is offered at US$14.99 per month or US$149 per year (a saving versus monthly). Prices are in US dollars and shown before purchase; applicable taxes may be added at checkout.",
      "# 2. Billing & Payment",
      "Web payments are processed securely by Stripe. Payment is charged to your selected payment method upon confirmation of purchase. On Apple App Store or Google Play, billing is handled by the respective platform under their terms.",
      "# 3. Auto-Renewal",
      "Subscriptions automatically renew at the end of each billing period (monthly or annually) at the then-current price, unless you cancel at least 24 hours before the renewal date. Your payment method will be charged for renewal within 24 hours of the period end.",
      "# 4. Cancellation",
      "You can cancel anytime. Web subscribers manage or cancel via their account or the Stripe customer portal; App Store/Play subscribers cancel in their device subscription settings. When you cancel, Premium access continues until the end of the current paid period, after which it will not renew.",
      "# 5. Refunds",
      "Except where required by law, payments are non-refundable and partial periods are not refunded. App Store and Google Play purchases are subject to the refund policies of Apple and Google respectively. EU/UK consumers may have a statutory right of withdrawal; by starting to use Premium immediately you acknowledge that this right may end once the service has been fully provided for the period.",
      "# 6. Billing Disputes",
      "If you believe you were charged in error, contact billing@creatorforge.app within 60 days of the charge and we will investigate promptly. For platform purchases, you may also raise disputes through Apple or Google.",
      "# 7. Price Changes",
      "We may change subscription prices. We will notify you in advance, and changes apply to the next renewal after notice; you may cancel before the change takes effect.",
      "# 8. Restore Purchases",
      "You can restore an active subscription at any time from Profile → Restore purchases, or via your platform account.",
      "# 9. Free Tier",
      "The free tier remains available with limited daily AI generations and watermarks on certain outputs. Downgrading from Premium returns you to the free tier at period end.",
    ],
  },
  disclaimer: {
    title: "AI Disclaimer",
    effective: "Effective 1 June 2026",
    body: [
      "CreatorForge is an AI-assisted tool for inspiration and creation.",
      "All outputs are for inspiration only. You are solely responsible for reviewing, verifying, and finalizing outputs, and for final commercial use, trademark searches, copyright clearance, and the accuracy of any plans or branding.",
      "AI-generated names, logos, taglines, and visuals may resemble existing works. Conduct appropriate trademark, copyright, and legal clearance before any commercial use.",
      "Generated content may contain inaccuracies and must not be relied upon as professional, legal, financial, or medical advice.",
      "Voice memos are transcribed by a third-party AI service; review transcriptions for accuracy before use.",
      "Suitable for users aged 13 and above.",
    ],
  },
  accessibility: {
    title: "Accessibility Statement",
    effective: "Effective 1 June 2026",
    body: [
      "CreatorForge is committed to digital accessibility and conformance with the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA.",
      "# What we do",
      "Interactive elements expose accessible roles, labels, and states for screen readers (VoiceOver on iOS, TalkBack on Android, and browser screen readers on web). Touch targets meet minimum size guidance, text respects your system font-scaling up to 200%, and we maintain sufficient color contrast in both dark and light themes.",
      "Dynamic content — including toasts, milestone celebrations, and modals — is announced to assistive technology, and decorative imagery is hidden from screen readers while generated images include descriptive labels.",
      "# Ongoing effort",
      "Accessibility is an ongoing commitment. Some third-party or AI-generated visual content may not be fully describable automatically. If you encounter a barrier, we want to fix it.",
      "# Feedback",
      "Email accessibility@creatorforge.app with the screen and device you were using, and we will respond promptly.",
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
        <Pressable onPress={() => router.back()} testID="legal-back" hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </Pressable>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: fonts.display }}>{content.title}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: c.textMute, fontFamily: fonts.body, fontSize: 12, marginBottom: 16 }}>{content.effective}</Text>
        {content.body.map((para, i) => {
          if (para.startsWith("# ")) {
            return (
              <Text
                key={i}
                accessibilityRole="header"
                style={{ color: c.text, fontFamily: fonts.display, fontWeight: "700", fontSize: 18, marginTop: 20, marginBottom: 8 }}
              >
                {para.replace(/^# /, "")}
              </Text>
            );
          }
          return (
            <Text key={i} style={{ color: c.textDim, fontFamily: fonts.body, fontSize: 15, lineHeight: 24, marginBottom: 14 }}>
              {para}
            </Text>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
});
