import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button, Field } from "@/src/components/ui";
import { HERO_IMAGE } from "@/src/constants/app";

export default function Login() {
  const { c, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { login, signup, loginWithGoogle } = useAuth();
  const { toast } = useFeedback();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password || (mode === "signup" && !name)) {
      toast("Please fill in all fields", "error");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await signup(email.trim(), password, name.trim());
      router.replace("/(tabs)");
    } catch (e: any) {
      toast(e.message || "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    try {
      await loginWithGoogle();
    } catch (e: any) {
      toast(e.message || "Google sign-in failed", "error");
    }
  };

  const useDemo = () => {
    setMode("login");
    setEmail("demo@creatorforge.app");
    setPassword("creator123");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Image source={{ uri: HERO_IMAGE }} style={StyleSheet.absoluteFill} blurRadius={2} />
      <LinearGradient
        colors={["rgba(15,15,15,0.55)", "rgba(15,15,15,0.92)", c.bg]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandRow}>
            <View style={[styles.logoMark, { backgroundColor: c.brand }]}>
              <Ionicons name="flame" size={26} color={c.onBrand} />
            </View>
          </View>
          <Text style={[styles.title, { color: "#fff", fontFamily: fonts.display }]}>CreatorForge</Text>
          <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.75)", fontFamily: fonts.body }]}>
            Turn raw ideas into premium branded assets — all in one flow.
          </Text>

          <View style={{ marginTop: 36 }}>
            {mode === "signup" && (
              <Field
                label="Name"
                placeholder="Your name"
                value={name}
                onChangeText={setName}
                testID="signup-name-input"
              />
            )}
            <Field
              label="Email"
              placeholder="you@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              testID="auth-email-input"
            />
            <Field
              label="Password"
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              testID="auth-password-input"
            />

            <Button
              title={mode === "login" ? "Sign In" : "Create Account"}
              onPress={submit}
              loading={busy}
              testID="auth-submit-button"
              style={{ marginTop: 6 }}
            />

            <View style={styles.dividerRow}>
              <View style={[styles.line, { backgroundColor: "rgba(255,255,255,0.2)" }]} />
              <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: fonts.body, fontSize: 12 }}>OR</Text>
              <View style={[styles.line, { backgroundColor: "rgba(255,255,255,0.2)" }]} />
            </View>

            <Button
              title="Continue with Google"
              icon="logo-google"
              variant="secondary"
              onPress={google}
              testID="google-signin-button"
            />

            <Pressable onPress={() => setMode(mode === "login" ? "signup" : "login")} style={{ marginTop: 22 }} testID="toggle-auth-mode">
              <Text style={{ color: "rgba(255,255,255,0.8)", textAlign: "center", fontFamily: fonts.body }}>
                {mode === "login" ? "New here? " : "Already have an account? "}
                <Text style={{ color: c.brand, fontWeight: "700" }}>
                  {mode === "login" ? "Create an account" : "Sign in"}
                </Text>
              </Text>
            </Pressable>

            <Pressable onPress={useDemo} style={{ marginTop: 14 }} testID="use-demo-button">
              <Text style={{ color: "rgba(255,255,255,0.55)", textAlign: "center", fontFamily: fonts.body, fontSize: 13 }}>
                Try the demo account
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: { alignItems: "flex-start" },
  logoMark: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 40, fontWeight: "700", marginTop: 20 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 320 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 18 },
  line: { flex: 1, height: 1 },
});
