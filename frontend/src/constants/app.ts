export const ASSET_TYPES = [
  { key: "logo", label: "Logo", icon: "aperture" },
  { key: "social", label: "Social Post", icon: "share-social" },
  { key: "mockup", label: "Product Mockup", icon: "cube" },
  { key: "slide", label: "Pitch Slide", icon: "easel" },
] as const;

export const STATUS = {
  idea: { label: "Idea", tone: "muted" as const },
  branding: { label: "Branding", tone: "brand" as const },
  done: { label: "Complete", tone: "success" as const },
};

export const MILESTONE_ORDER = ["spark_pack", "forge_badge", "creator_vault"] as const;

export const MILESTONE_ICONS: Record<string, string> = {
  spark_pack: "sparkles",
  forge_badge: "ribbon",
  creator_vault: "lock-open",
};

export const HERO_IMAGE =
  "https://images.unsplash.com/photo-1710438399422-2fca27686bcd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODF8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRhcmslMjBnbGFzcyUyMHRleHR1cmV8ZW58MHx8fHwxNzgzNTc4Njc2fDA&ixlib=rb-4.1.0&q=85";
