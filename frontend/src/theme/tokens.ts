// CreatorForge design tokens — "Glass / Luxe DARK" with a premium light mode.
export type Palette = {
  bg: string;
  card: string;
  card2: string;
  text: string;
  textDim: string;
  textMute: string;
  inverseBg: string;
  inverseText: string;
  brand: string;
  brandSoft: string;
  onBrand: string;
  success: string;
  onSuccess: string;
  warning: string;
  error: string;
  onError: string;
  border: string;
  borderStrong: string;
  divider: string;
};

export const DARK: Palette = {
  bg: "#0F0F0F",
  card: "#1C1C1C",
  card2: "#262626",
  text: "#FFFFFF",
  textDim: "#EAEAEA",
  textMute: "#9A9A9A",
  inverseBg: "#FAFAFA",
  inverseText: "#0F0F0F",
  brand: "#C5A880",
  brandSoft: "#3D3224",
  onBrand: "#1A140A",
  success: "#3E5C47",
  onSuccess: "#A5D6B4",
  warning: "#8A6033",
  error: "#7A3B3B",
  onError: "#EBA6A6",
  border: "#2A2A2A",
  borderStrong: "#3A3A3A",
  divider: "#1F1F1F",
};

export const LIGHT: Palette = {
  bg: "#FAFAFA",
  card: "#FFFFFF",
  card2: "#F0F0F0",
  text: "#0F0F0F",
  textDim: "#1A1A1A",
  textMute: "#6B6B6B",
  inverseBg: "#1C1C1C",
  inverseText: "#FAFAFA",
  brand: "#8A6A3B",
  brandSoft: "#F7F2EB",
  onBrand: "#FFFFFF",
  success: "#284D32",
  onSuccess: "#E0F5E6",
  warning: "#99682C",
  error: "#8A2C2C",
  onError: "#FCE8E8",
  border: "#EBEBEB",
  borderStrong: "#D6D6D6",
  divider: "#F5F5F5",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const fonts = {
  display: "Fraunces",
  body: "Geist",
};

export const type = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 38,
};
