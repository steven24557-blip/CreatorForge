import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, setToken } from "@/src/api/client";

type User = any;
type AuthShape = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthShape | null>(null);
const AUTH_BASE = "https://auth.emergentagent.com";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      setUser(null);
      await setToken(null);
    }
  }, []);

  const processGoogleSession = useCallback(async (sessionId: string) => {
    const { token, user } = await api.google(sessionId);
    await setToken(token);
    setUser(user);
  }, []);

  useEffect(() => {
    (async () => {
      // Web: process ?session_id / #session_id first
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const hash = window.location.hash || "";
        const search = window.location.search || "";
        const match = (hash + "&" + search).match(/session_id=([^&]+)/);
        if (match) {
          try {
            await processGoogleSession(decodeURIComponent(match[1]));
            window.history.replaceState(null, "", window.location.pathname);
          } catch {}
          setLoading(false);
          return;
        }
      }
      await loadMe();
      setLoading(false);
    })();
  }, [loadMe, processGoogleSession]);

  const login = async (email: string, password: string) => {
    const { token, user } = await api.login(email, password);
    await setToken(token);
    setUser(user);
  };

  const signup = async (email: string, password: string, name: string) => {
    const { token, user } = await api.register(email, password, name);
    await setToken(token);
    setUser(user);
  };

  const loginWithGoogle = async () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const redirect = window.location.origin + "/";
      window.location.href = `${AUTH_BASE}/?redirect=${encodeURIComponent(redirect)}`;
      return;
    }
    const redirectUrl = Linking.createURL("auth");
    const authUrl = `${AUTH_BASE}/?redirect=${encodeURIComponent(redirectUrl)}`;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === "success" && result.url) {
      const m = result.url.match(/session_id=([^&]+)/);
      if (m) await processGoogleSession(decodeURIComponent(m[1]));
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {}
    await setToken(null);
    setUser(null);
  };

  const refresh = loadMe;

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, loginWithGoogle, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
