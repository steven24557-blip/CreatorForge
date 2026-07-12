import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Modal, Pressable, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import ConfettiCannon from "react-native-confetti-cannon";
import { useTheme } from "@/src/theme/ThemeContext";

type Celebration = { title: string; desc: string; reward?: string };
type FeedbackShape = {
  toast: (message: string, type?: "info" | "error" | "success") => void;
  celebrate: (c: Celebration) => void;
};

const FeedbackContext = createContext<FeedbackShape | null>(null);

const haptic = (kind: "success" | "error" | "light") => {
  if (Platform.OS === "web") return;
  if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { c, spacing, radius, fonts } = useTheme();
  const [toastMsg, setToastMsg] = useState<{ message: string; type: string } | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const slide = useRef(new Animated.Value(-120)).current;
  const timer = useRef<any>(null);

  const toast = useCallback(
    (message: string, type: "info" | "error" | "success" = "info") => {
      haptic(type === "error" ? "error" : type === "success" ? "success" : "light");
      setToastMsg({ message, type });
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, tension: 60, friction: 9 }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(slide, { toValue: -120, duration: 250, useNativeDriver: true }).start(() =>
          setToastMsg(null)
        );
      }, 2800);
    },
    [slide]
  );

  const celebrate = useCallback((cel: Celebration) => {
    haptic("success");
    setCelebration(cel);
  }, []);

  const toastColor =
    toastMsg?.type === "error" ? c.error : toastMsg?.type === "success" ? c.success : c.card2;
  const toastIcon =
    toastMsg?.type === "error" ? "alert-circle" : toastMsg?.type === "success" ? "checkmark-circle" : "information-circle";

  return (
    <FeedbackContext.Provider value={{ toast, celebrate }}>
      {children}

      {toastMsg && (
        <Animated.View
          style={[styles.toastWrap, { transform: [{ translateY: slide }], pointerEvents: "box-none" }]}
        >
          <View
            testID="app-toast"
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            accessibilityLabel={toastMsg.message}
            style={[styles.toast, { backgroundColor: c.card, borderColor: c.borderStrong }]}
          >
            <Ionicons name={toastIcon as any} size={20} color={toastColor === c.card2 ? c.brand : toastColor} importantForAccessibility="no" />
            <Text style={[styles.toastText, { color: c.text, fontFamily: fonts.body }]} numberOfLines={2}>
              {toastMsg.message}
            </Text>
          </View>
        </Animated.View>
      )}

      <Modal visible={!!celebration} transparent animationType="fade" onRequestClose={() => setCelebration(null)}>
        <View style={[styles.celebrateOverlay, { backgroundColor: "rgba(0,0,0,0.75)" }]}>
          {celebration && (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
              <ConfettiCannon
                count={120}
                origin={{ x: 180, y: 0 }}
                fadeOut
                autoStart
                colors={["#C5A880", "#A3865D", "#F3E9DC", "#FFFFFF"]}
              />
            </View>
          )}
          <View
            accessibilityViewIsModal
            accessibilityRole="alert"
            style={[styles.celebrateCard, { backgroundColor: c.card, borderColor: c.brand, borderRadius: radius.lg }]}
          >
            <View style={[styles.badge, { backgroundColor: c.brandSoft, borderRadius: radius.pill }]}>
              <Ionicons name="trophy" size={40} color={c.brand} importantForAccessibility="no" />
            </View>
            <Text accessibilityRole="header" style={[styles.celebrateTitle, { color: c.text, fontFamily: fonts.display }]}>
              {celebration?.title}
            </Text>
            <Text style={[styles.celebrateDesc, { color: c.textDim, fontFamily: fonts.body }]}>
              {celebration?.desc}
            </Text>
            {!!celebration?.reward && (
              <View style={[styles.rewardPill, { backgroundColor: c.brandSoft, borderRadius: radius.pill }]}>
                <Ionicons name="gift" size={16} color={c.brand} />
                <Text style={[styles.rewardText, { color: c.brand, fontFamily: fonts.body }]}>
                  {celebration.reward}
                </Text>
              </View>
            )}
            <Pressable
              testID="celebrate-dismiss-button"
              accessibilityRole="button"
              accessibilityLabel="Dismiss celebration"
              onPress={() => setCelebration(null)}
              style={[styles.celebrateBtn, { backgroundColor: c.brand, borderRadius: radius.md }]}
            >
              <Text style={[styles.celebrateBtnText, { color: c.onBrand, fontFamily: fonts.body }]}>
                Awesome!
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within FeedbackProvider");
  return ctx;
}

const styles = StyleSheet.create({
  toastWrap: { position: "absolute", top: 52, left: 16, right: 16, alignItems: "center", zIndex: 9999 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 480,
    width: "100%",
  },
  toastText: { flex: 1, fontSize: 14 },
  celebrateOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  celebrateCard: { width: "100%", maxWidth: 380, alignItems: "center", padding: 28, borderWidth: 1 },
  badge: { width: 80, height: 80, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  celebrateTitle: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  celebrateDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 16 },
  rewardPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 20 },
  rewardText: { fontSize: 13, fontWeight: "600" },
  celebrateBtn: { width: "100%", paddingVertical: 15, alignItems: "center" },
  celebrateBtnText: { fontSize: 16, fontWeight: "700" },
});
