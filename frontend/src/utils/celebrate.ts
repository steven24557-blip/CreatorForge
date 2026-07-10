// Picks the single most rewarding celebration from a generation response (Hooked variable reward).
// Priority: milestone unlock > variable surprise > streak milestone.
export type Celebration = { title: string; desc: string; reward?: string } | null;

export function pickCelebration(res: any, milestones?: Record<string, any>): Celebration {
  if (res?.newly_unlocked?.length && milestones) {
    const m = milestones[res.newly_unlocked[0]];
    if (m) return { title: m.title, desc: m.desc, reward: m.reward };
  }
  if (res?.surprise) {
    return { title: res.surprise.title, desc: res.surprise.desc, reward: res.surprise.reward };
  }
  if (res?.streak_event?.is_milestone) {
    return {
      title: `${res.streak_event.count}-Day Streak!`,
      desc: "You're building a powerful creative habit. Keep the flame alive!",
      reward: "Streak reward",
    };
  }
  return null;
}

// Smart, non-annoying next-action trigger computed from state (internal trigger).
export function computeNudge(usage: any, projects: any[]) {
  if (!usage) return null;
  const c = usage.counters || {};
  const streak = usage.streak?.count || 0;
  const today = new Date().toISOString().slice(0, 10);

  if (streak > 0 && usage.streak?.last_date !== today) {
    return { icon: "flame", text: `Keep your ${streak}-day streak alive — create something today`, cta: "Forge now", route: "/agent" };
  }
  const ideas = c.ideas_created || 0;
  if (ideas < 5) {
    return { icon: "sparkles", text: `${5 - ideas} more idea${5 - ideas === 1 ? "" : "s"} to unlock the Spark Pack`, cta: "New idea", route: "/capture" };
  }
  const toVault = 10 - (c.assets_generated || 0);
  if (toVault > 0 && toVault <= 4) {
    return { icon: "lock-open", text: `Only ${toVault} asset${toVault === 1 ? "" : "s"} from unlocking the Creator Vault!`, cta: "Create asset", route: "/(tabs)/studio" };
  }
  const draft = (projects || []).find((p) => p.status === "idea");
  if (draft) {
    return { icon: "color-wand", text: `Turn "${draft.title}" into a full brand`, cta: "Brand it", route: `/project/${draft.id}` };
  }
  return { icon: "rocket", text: "Spin up a fresh idea → brand in under a minute", cta: "Try the agent", route: "/agent" };
}
