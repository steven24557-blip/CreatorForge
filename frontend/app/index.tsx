import { Redirect } from "expo-router";
import { View } from "react-native";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { Loading } from "@/src/components/ui";

export default function Index() {
  const { user, loading } = useAuth();
  const { c } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Loading label="Firing up the forge…" />
      </View>
    );
  }
  return <Redirect href={user ? "/(tabs)" : "/login"} />;
}
