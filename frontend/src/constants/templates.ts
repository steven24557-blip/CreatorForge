// Curated, categorized starter templates. Tapping one seeds the Capture screen.
export type Template = {
  id: string;
  title: string;
  category: string;
  mode: "plan" | "pitch" | "tasks";
  seed: string;
};

export const TEMPLATE_CATEGORIES = [
  "Startup",
  "Product",
  "Personal Brand",
  "Local Business",
  "Content",
  "Event",
];

export const TEMPLATES: Template[] = [
  { id: "t1", title: "SaaS Startup", category: "Startup", mode: "pitch", seed: "A SaaS product that helps small teams automate their weekly reporting so they save hours every Monday." },
  { id: "t2", title: "Mobile App Idea", category: "Startup", mode: "plan", seed: "A mobile app that gamifies daily habits with streaks, gentle reminders, and social accountability." },
  { id: "t3", title: "Marketplace", category: "Startup", mode: "plan", seed: "A two-sided marketplace connecting local artisans with buyers who want handmade, sustainable goods." },

  { id: "t4", title: "Physical Product", category: "Product", mode: "plan", seed: "An eco-friendly reusable water bottle with a built-in habit tracker and premium minimalist design." },
  { id: "t5", title: "Subscription Box", category: "Product", mode: "pitch", seed: "A monthly subscription box delivering curated indie board games and a designer spotlight card." },
  { id: "t6", title: "Beauty / Skincare Line", category: "Product", mode: "plan", seed: "A clean skincare line for sensitive skin using science-backed, minimal-ingredient formulas." },

  { id: "t7", title: "Creator Personal Brand", category: "Personal Brand", mode: "plan", seed: "A personal brand for a design educator sharing bite-sized UI tips across short-form video." },
  { id: "t8", title: "Consultant / Coach", category: "Personal Brand", mode: "pitch", seed: "A career coaching brand helping mid-career professionals confidently switch industries." },

  { id: "t9", title: "Coffee Shop", category: "Local Business", mode: "plan", seed: "A neighborhood coffee shop focused on single-origin beans and a warm, artisanal in-store experience." },
  { id: "t10", title: "Fitness Studio", category: "Local Business", mode: "tasks", seed: "A boutique fitness studio offering small-group strength classes with a strong community vibe." },
  { id: "t11", title: "Restaurant / Cafe", category: "Local Business", mode: "plan", seed: "A cozy farm-to-table brunch cafe with seasonal menus and locally sourced ingredients." },

  { id: "t12", title: "Newsletter", category: "Content", mode: "pitch", seed: "A weekly newsletter curating the best tools and ideas for indie makers building in public." },
  { id: "t13", title: "Podcast", category: "Content", mode: "plan", seed: "A podcast interviewing first-time founders about the messy early days of building a company." },
  { id: "t14", title: "YouTube Channel", category: "Content", mode: "tasks", seed: "A YouTube channel teaching beginner woodworking through calm, cinematic project builds." },

  { id: "t15", title: "Workshop / Course", category: "Event", mode: "plan", seed: "An online cohort-based course teaching non-designers how to create a professional brand identity." },
  { id: "t16", title: "Pop-up Event", category: "Event", mode: "tasks", seed: "A weekend pop-up market showcasing emerging local designers, food, and live music." },
];
