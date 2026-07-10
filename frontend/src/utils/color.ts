// Cost-free color harmony generator (no AI needed) for the Palette Generator.

export function hexToHsl(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export type Harmony = "complementary" | "analogous" | "triadic" | "monochromatic";

export const HARMONIES: { key: Harmony; label: string }[] = [
  { key: "analogous", label: "Analogous" },
  { key: "complementary", label: "Complementary" },
  { key: "triadic", label: "Triadic" },
  { key: "monochromatic", label: "Monochromatic" },
];

// Returns 5 cohesive hex colors derived from a base color + harmony rule.
export function generateHarmony(base: string, type: Harmony): string[] {
  const [h, s, l] = hexToHsl(base);
  const sat = s < 0.15 ? 0.5 : s;
  switch (type) {
    case "complementary":
      return [
        hslToHex(h, sat, 0.55),
        hslToHex(h, sat * 0.6, 0.2),
        hslToHex(h + 180, sat, 0.55),
        hslToHex(h, 0.1, 0.92),
        hslToHex(h + 180, sat * 0.7, 0.35),
      ];
    case "triadic":
      return [
        hslToHex(h, sat, 0.55),
        hslToHex(h + 120, sat, 0.5),
        hslToHex(h + 240, sat, 0.5),
        hslToHex(h, 0.12, 0.15),
        hslToHex(h, 0.08, 0.94),
      ];
    case "monochromatic":
      return [
        hslToHex(h, sat, 0.7),
        hslToHex(h, sat, 0.55),
        hslToHex(h, sat, 0.4),
        hslToHex(h, sat * 0.8, 0.25),
        hslToHex(h, 0.1, 0.93),
      ];
    case "analogous":
    default:
      return [
        hslToHex(h - 30, sat, 0.55),
        hslToHex(h, sat, 0.55),
        hslToHex(h + 30, sat, 0.5),
        hslToHex(h, sat * 0.6, 0.2),
        hslToHex(h, 0.1, 0.93),
      ];
  }
}

export const BASE_SWATCHES = [
  "#C5A880", "#E86A5C", "#3B7A57", "#2E5A88",
  "#8A4FA3", "#D98E3A", "#1F1F1F", "#0E7C86",
];
