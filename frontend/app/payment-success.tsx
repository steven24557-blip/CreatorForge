import { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { Button, Loading } from "@/src/components/ui";

export default function PaymentSuccess() {
  const { c, fonts } = useTheme();
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();
  const { celebrate } = useFeedback();

  const [state, setState] = useState<"checking" | "paid" | "failed">("checking");
  const tries = useRef(0);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!session_id) {
        setState("failed");
        return;
      }
      try {
        const s = await api.paymentStatus(session_id);
        if (!active) return;
        if (s.payment_status === "paid") {
          setState("paid");
          celebrate({ title: "Welcome to Premium!", desc: "Unlimited generations & watermark-free exports unlocked.", reward: "Premium activated" });
          return;
        }
        if (s.status === "expired") {
          setState("failed");
          return;
        }
      } catch {}
      tries.current += 1;
      if (tries.current > 10) {
        setState("failed");
        return;
      }
      setTimeout(poll, 2000);
    };
    poll();
    return () => {
      active = false;
    };
  }, [session_id]);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {state === "checking" && <Loading label="Confirming your payment…" />}
      {state === "paid" && (
        <View style={{ alignItems: "center", padding: 32 }}>
          <View style={[styles.circle, { backgroundColor: c.brand }]}>
            <Ionicons name="checkmark" size={44} color={c.onBrand} />
          </View>
          <Text style={{ color: c.text, fontSize: 26, fontWeight: "700", fontFamily: fonts.display, marginTop: 20 }}>You're Premium!</Text>
          <Text style={{ color: c.textMute, fontFamily: fonts.body, textAlign: "center", marginTop: 8, lineHeight: 20 }}>
            Enjoy unlimited AI generations and watermark-free exports.
          </Text>
          <Button title="Start creating" onPress={() => router.replace("/(tabs)")} testID="success-continue" style={{ marginTop: 28, minWidth: 200 }} />
        </View>
      )}
      {state === "failed" && (
        <View style={{ alignItems: "center", padding: 32 }}>
          <Ionicons name="alert-circle" size={56} color={c.textMute} />
          <Text style={{ color: c.text, fontSize: 22, fontWeight: "700", fontFamily: fonts.display, marginTop: 16 }}>Payment not completed</Text>
          <Text style={{ color: c.textMute, fontFamily: fonts.body, textAlign: "center", marginTop: 8 }}>
            No charge was made, or it's still processing.
          </Text>
          <Button title="Back to app" onPress={() => router.replace("/(tabs)")} testID="failed-continue" style={{ marginTop: 24, minWidth: 200 }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  circle: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
});
