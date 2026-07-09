import React from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  TextInputProps,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/ThemeContext";

const tap = () => {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: any;
  testID?: string;
  style?: ViewStyle;
}) {
  const { c, radius, fonts } = useTheme();
  const bg =
    variant === "primary" ? c.brand : variant === "secondary" ? c.card2 : "transparent";
  const fg = variant === "primary" ? c.onBrand : c.text;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (isDisabled) return;
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderColor: c.borderStrong,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[styles.btnText, { color: fg, fontFamily: fonts.body }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
  onPress,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  testID?: string;
}) {
  const { c, radius } = useTheme();
  const base: ViewStyle = {
    backgroundColor: c.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
  };
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[base, style]}>
      {children}
    </View>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label?: string }) {
  const { c, radius, fonts } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      {label && (
        <Text style={[styles.label, { color: c.textDim, fontFamily: fonts.body }]}>{label}</Text>
      )}
      <TextInput
        placeholderTextColor={c.textMute}
        style={[
          styles.input,
          {
            backgroundColor: c.card,
            borderColor: c.border,
            borderRadius: radius.md,
            color: c.text,
            fontFamily: fonts.body,
          },
        ]}
        {...props}
      />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { c, radius, fonts } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        height: 36,
        justifyContent: "center",
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        backgroundColor: active ? c.brand : c.card,
        borderWidth: 1,
        borderColor: active ? c.brand : c.border,
        flexShrink: 0,
      }}
    >
      <Text style={{ color: active ? c.onBrand : c.textDim, fontSize: 13, fontFamily: fonts.body, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const { c, fonts } = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: c.text, fontFamily: fonts.display }]}>{children}</Text>
      {right}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const { c, fonts } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={c.brand} size="large" />
      {label && <Text style={{ color: c.textMute, marginTop: 12, fontFamily: fonts.body }}>{label}</Text>}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  cta,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  cta?: React.ReactNode;
}) {
  const { c, fonts } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.card }]}>
        <Ionicons name={icon} size={34} color={c.brand} />
      </View>
      <Text style={[styles.emptyTitle, { color: c.text, fontFamily: fonts.display }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.emptySub, { color: c.textMute, fontFamily: fonts.body }]}>{subtitle}</Text>
      )}
      {cta}
    </View>
  );
}

export function Badge({ label, tone = "brand" }: { label: string; tone?: "brand" | "muted" | "success" }) {
  const { c, radius, fonts } = useTheme();
  const bg = tone === "brand" ? c.brandSoft : tone === "success" ? c.success : c.card2;
  const fg = tone === "brand" ? c.brand : tone === "success" ? c.onSuccess : c.textMute;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "700", fontFamily: fonts.body, textTransform: "capitalize" }}>
        {label}
      </Text>
    </View>
  );
}

export { ScrollView };

const styles = StyleSheet.create({
  btn: { height: 52, justifyContent: "center", paddingHorizontal: 20 },
  btnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnText: { fontSize: 16, fontWeight: "700" },
  label: { fontSize: 13, marginBottom: 6, fontWeight: "600" },
  input: { height: 52, borderWidth: 1, paddingHorizontal: 16, fontSize: 15 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sectionTitle: { fontSize: 20, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20, maxWidth: 300 },
});
