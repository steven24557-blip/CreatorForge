import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
export const TOKEN_KEY = "cf_token";

let cachedToken: string | null = null;

export async function setToken(t: string | null) {
  cachedToken = t;
  if (t) await storage.secureSet(TOKEN_KEY, t);
  else await storage.secureRemove(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const t = await storage.secureGet<string>(TOKEN_KEY, "");
  cachedToken = t || null;
  return cachedToken;
}

async function request(path: string, opts: RequestInit = {}, auth = true): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (auth) {
    const t = await getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    const err: any = new Error(typeof detail === "string" ? detail : "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

// Offline-first GET: caches successful reads and serves the last snapshot when the
// network is unreachable (fetch rejects with no HTTP status). Real HTTP errors bubble up.
async function cachedGet(path: string): Promise<any> {
  const key = `cf_cache:${path}`;
  try {
    const data = await request(path);
    if (data && typeof data === "object") storage.setItem(key, { data, at: Date.now() });
    return data;
  } catch (e: any) {
    if (e && e.status) throw e; // auth/404/etc — do not mask with cache
    const cached = await storage.getItem<any>(key, null);
    if (cached && cached.data && typeof cached.data === "object") {
      return { ...cached.data, _offline: true, _cachedAt: cached.at };
    }
    throw e;
  }
}

export const api = {
  // auth
  register: (email: string, password: string, name: string) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }, false),
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  google: (session_id: string) =>
    request("/auth/google", { method: "POST", body: JSON.stringify({ session_id }) }, false),
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
  deleteAccount: () => request("/auth/account", { method: "DELETE" }),
  analytics: () => request("/analytics"),
  setTheme: (theme: string) => request("/auth/theme", { method: "PATCH", body: JSON.stringify({ theme }) }),

  // ai
  refine: (raw_idea: string, mode: string) =>
    request("/ai/refine", { method: "POST", body: JSON.stringify({ raw_idea, mode }) }),
  refineProject: (project_id: string, message: string) =>
    request("/ai/refine-project", { method: "POST", body: JSON.stringify({ project_id, message }) }),
  taglines: (context: string) =>
    request("/ai/taglines", { method: "POST", body: JSON.stringify({ context }) }),
  transcribe: async (uri: string, name: string, type: string) => {
    const form = new FormData();
    // @ts-ignore RN FormData file
    form.append("file", { uri, name, type } as any);
    const t = await getToken();
    const res = await fetch(`${BASE}/voice/transcribe`, {
      method: "POST",
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: form,
    });
    if (!res.ok) throw new Error("Transcription failed");
    return res.json();
  },
  transcribeBlob: async (blob: Blob, name: string) => {
    const form = new FormData();
    form.append("file", blob, name);
    const t = await getToken();
    const res = await fetch(`${BASE}/voice/transcribe`, {
      method: "POST",
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: form,
    });
    if (!res.ok) throw new Error("Transcription failed");
    return res.json();
  },

  // projects
  projects: (q = "", status = "") =>
    cachedGet(`/projects?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  project: (id: string) => cachedGet(`/projects/${id}`),
  createProject: (payload: any) =>
    request("/projects", { method: "POST", body: JSON.stringify(payload) }),
  patchProject: (id: string, payload: any) =>
    request(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteProject: (id: string) => request(`/projects/${id}`, { method: "DELETE" }),

  // brand kits
  brandKits: () => cachedGet("/brand-kits"),
  brandKit: (id: string) => cachedGet(`/brand-kits/${id}`),
  createBrandKit: (payload: any) =>
    request("/brand-kits", { method: "POST", body: JSON.stringify(payload) }),
  patchBrandKit: (id: string, payload: any) =>
    request(`/brand-kits/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteBrandKit: (id: string) => request(`/brand-kits/${id}`, { method: "DELETE" }),
  generateLogo: (id: string) => request(`/brand-kits/${id}/logo`, { method: "POST" }),
  publishKit: (id: string, publicFlag: boolean, alias?: string) =>
    request(`/brand-kits/${id}/publish`, { method: "POST", body: JSON.stringify({ public: publicFlag, alias: alias || null }) }),
  gallery: () => request("/gallery", {}, false),
  flags: () => request("/config/flags", {}, false),
  admtInfo: () => request("/privacy/admt"),
  admtOptOut: (opt_out: boolean) =>
    request("/privacy/admt-optout", { method: "POST", body: JSON.stringify({ opt_out }) }),
  remixKit: (id: string) => request(`/gallery/${id}/remix`, { method: "POST" }),
  reportKit: (id: string, reason?: string) =>
    request(`/gallery/${id}/report`, { method: "POST", body: JSON.stringify({ reason: reason || null }) }),

  // assets
  assets: (project_id = "", brand_kit_id = "") =>
    request(`/assets?project_id=${project_id}&brand_kit_id=${brand_kit_id}`),
  asset: (id: string) => request(`/assets/${id}`),
  generateAsset: (payload: any) =>
    request("/assets/generate", { method: "POST", body: JSON.stringify(payload) }),
  deleteAsset: (id: string) => request(`/assets/${id}`, { method: "DELETE" }),
  assetVersions: (id: string) => request(`/assets/${id}/versions`),
  regenerateAsset: (id: string, prompt?: string) =>
    request(`/assets/${id}/regenerate`, { method: "POST", body: JSON.stringify({ prompt: prompt || null }) }),
  revertAsset: (id: string, version_id: string) =>
    request(`/assets/${id}/revert`, { method: "POST", body: JSON.stringify({ version_id }) }),

  // usage & payments
  usage: () => cachedGet("/usage"),
  brandMemory: () => request("/brand-memory"),
  updateBrandMemory: (payload: any) =>
    request("/brand-memory", { method: "PATCH", body: JSON.stringify(payload) }),
  packages: () => request("/payments/packages"),
  checkout: (plan: string, origin_url: string) =>
    request("/payments/checkout", { method: "POST", body: JSON.stringify({ plan, origin_url }) }),
  paymentStatus: (session_id: string) => request(`/payments/status/${session_id}`),
  iapProducts: () => request("/payments/iap/products"),
  iapVerify: (payload: {
    platform: string;
    product_id: string;
    transaction_id?: string | null;
    purchase_token?: string | null;
    receipt?: string | null;
  }) => request("/payments/iap/verify", { method: "POST", body: JSON.stringify(payload) }),
};
