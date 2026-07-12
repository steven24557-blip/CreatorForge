// Zero-AI, client-side personalization: infer a brand "vibe" (palette + template)
// from the user's first idea text, so we can suggest something instantly before
// spending any AI generation.
import { generateHarmony, Harmony } from "./color";
import { TEMPLATES, Template } from "@/src/constants/templates";

export type Vibe = {
  label: string;
  baseColor: string;
  harmony: Harmony;
  category: string;
  keywords: string[];
};

const VIBES: Vibe[] = [
  { label: "Warm & Artisanal", baseColor: "#D98E3A", harmony: "analogous", category: "Local Business", keywords: ["coffee", "cafe", "café", "restaurant", "bakery", "food", "brunch", "kitchen", "diner", "tea"] },
  { label: "Natural & Grounded", baseColor: "#3B7A57", harmony: "analogous", category: "Product", keywords: ["eco", "sustain", "plant", "green", "nature", "organic", "garden", "earth", "botanical", "farm"] },
  { label: "Modern & Trustworthy", baseColor: "#2E5A88", harmony: "complementary", category: "Startup", keywords: ["app", "saas", "software", "tech", "ai", "startup", "platform", "automate", "cloud", "data", "tool"] },
  { label: "Clean & Calming", baseColor: "#E4A7B0", harmony: "monochromatic", category: "Product", keywords: ["skincare", "beauty", "wellness", "spa", "self-care", "cosmetic", "clean", "gentle", "sensitive"] },
  { label: "Bold & Energetic", baseColor: "#E86A5C", harmony: "triadic", category: "Local Business", keywords: ["fitness", "gym", "workout", "sport", "training", "strength", "run", "yoga", "studio", "coach"] },
  { label: "Premium & Confident", baseColor: "#C5A880", harmony: "monochromatic", category: "Personal Brand", keywords: ["luxury", "premium", "elegant", "consult", "coaching", "finance", "professional", "executive", "boutique"] },
  { label: "Creative & Expressive", baseColor: "#8A4FA3", harmony: "triadic", category: "Content", keywords: ["podcast", "newsletter", "youtube", "content", "creator", "channel", "media", "video", "blog", "art"] },
  { label: "Vibrant & Engaging", baseColor: "#0E7C86", harmony: "complementary", category: "Event", keywords: ["event", "workshop", "course", "pop-up", "popup", "market", "festival", "conference", "class", "cohort"] },
];

const DEFAULT_VIBE: Vibe = { label: "Balanced & Versatile", baseColor: "#C5A880", harmony: "analogous", category: "Startup", keywords: [] };

export type Suggestion = {
  vibe: Vibe;
  palette: string[];
  template: Template | null;
};

export function suggestFromIdea(idea: string): Suggestion | null {
  const text = (idea || "").toLowerCase().trim();
  if (text.length < 8) return null;

  let best = DEFAULT_VIBE;
  let bestScore = 0;
  for (const v of VIBES) {
    const score = v.keywords.reduce((n, k) => (text.includes(k) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  const palette = generateHarmony(best.baseColor, best.harmony);
  const inCategory = TEMPLATES.filter((t) => t.category === best.category);
  // Pick the template within the category that best matches the idea words.
  let template: Template | null = inCategory[0] || null;
  let tScore = -1;
  for (const t of inCategory) {
    const hay = `${t.title} ${t.seed}`.toLowerCase();
    const words = text.split(/\W+/).filter((w) => w.length > 3);
    const score = words.reduce((n, w) => (hay.includes(w) ? n + 1 : n), 0);
    if (score > tScore) {
      tScore = score;
      template = t;
    }
  }
  return { vibe: best, palette, template };
}

// Rotating, insightful creation tips (shown during the agent stepper).
export const CREATION_TIPS = [
  "Consistent colors can lift brand recognition by up to 80%.",
  "A sharp tagline makes people remember what you do in seconds.",
  "Fewer, bolder colors read as more premium than many muted ones.",
  "Naming your audience sharpens every design decision.",
  "High contrast isn't just pretty — it's accessibility (WCAG AA).",
  "Your hero visual is the first impression — keep it on-brand.",
  "Great brands repeat one idea until it sticks.",
];
