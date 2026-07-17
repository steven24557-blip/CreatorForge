# CreatorForge — Product Requirements Document

## Original Problem Statement
An all-in-one AI workspace for creators, entrepreneurs, and small business owners that combines
idea/project incubation with professional branding + visual creation in one seamless flow:
capture ideas → refine into plans/pitches → generate consistent branded visuals and assets.
Core navigation: Dashboard → Ideas/Projects → Branding Studio → Exports.

## User Choices
- Text AI: Anthropic Claude Sonnet 4.6 (via Emergent Universal LLM key)
- Image AI: Gemini Nano Banana (gemini-3.1-flash-image-preview)
- Voice: OpenAI Whisper (whisper-1)
- Auth: JWT email/password + Emergent-managed Google login
- Payments: Stripe (Emergent test key `sk_test_emergent`), $14.99/mo & $149/yr
- Theme: dark-first with light-mode toggle

## Architecture
- Frontend: Expo Router (iOS/Android/Web), custom Fraunces+Geist fonts, "Glass/Luxe DARK" design system.
  Contexts: Theme, Auth, Feedback (toast + confetti celebrations). API client in `src/api/client.ts`.
- Backend: FastAPI (`server.py` + `ai_service.py` + `auth_utils.py` + `seed.py`), MongoDB (uuid string ids).
  Unified Bearer auth (accepts our JWT OR Emergent Google session_token).
- AI is modular in `ai_service.py`. NVIDIA Inception optimization notes documented there
  (TensorRT-LLM / NIM swap points, prompt/token minimization, caching).

## User Personas
- Solo founder turning a raw idea into a pitch + brand.
- Content creator needing on-brand social visuals fast.
- Small business owner building a cohesive brand kit.

## Core Requirements (static)
- Idea capture (text + voice) → AI structured refinement (plan/pitch/tasks).
- Project management: status (idea/branding/done), tasks toggle, search/filter, conversational refinement.
- Brand Kits: AI palette/fonts/style rules, logo generation, taglines.
- On-brand asset generation (logo/social/mockup/slide) with brand-context injection.
- Exports: per-asset PNG (view-shot, watermark for free tier) + plan PDF (expo-print), share.
- Freemium: 5 free generations/day + watermarks; Premium unlimited + no watermark via Stripe.
- Milestones/easter eggs with confetti (spark_pack, forge_badge, creator_vault) + bonus credits.
- Legal: Privacy, Terms/Subscription, AI Disclaimer, age 13+.

## Implemented (2026-06)
- [x] JWT + Google auth, unified token dependency, seeded demo account.
- [x] Dashboard (hero, usage bar, quick-start, milestone tracker, recent projects).
- [x] Incubator (search + status chips, project cards, FAB, capture w/ voice→Whisper→refine).
- [x] Project detail (status, tasks, refinement thread, brand kit link, assets, PDF export).
- [x] Branding Studio (brand kits grid, create modal, asset gallery) + brand kit screen
      (swatches, fonts, logo gen, taglines, asset generation, per-asset export/delete).
- [x] Paywall (monthly/yearly, savings), Stripe checkout + payment-success polling.
- [x] Profile (plan, restore, theme toggle, legal), Surprises milestone screen, Legal docs.
- [x] Freemium limits (402 on cap) + generation credit refund on image failure.
- [x] Full backend+frontend regression tested (iteration_1.json — PASS).

## Implemented (2026-06 — Accessibility & Compliance layer)
- [x] WCAG 2.2 AA across app: accessibilityRole/label/state on all interactive primitives
      (Button, Card, Chip, Field, Switch, tabs, toast, celebration modal, icon buttons),
      header semantics, decorative images hidden, generated images labeled, 44dp+ targets,
      live-region toasts/loaders, inline per-field form errors on login.
- [x] Light-theme brand darkened to #8A6A3B for ≥4.5:1 text/label contrast.
- [x] Expanded legal: Privacy (GDPR+CCPA/CPRA, AI sub-processors, voice, security), Terms,
      full Subscription Agreement, AI Disclaimer, Accessibility Statement (/legal?doc=…).
- [x] AI disclaimers on Capture + Brand Kit; prominent Restore Purchases (paywall + profile);
      auto-renew/cancellation/refund disclosures; age 13+ stated.
- [x] Accessibility audit checklist at /app/memory/ACCESSIBILITY_AUDIT.md.
- [x] Fixed logout navigation; frontend regression (iteration_2.json — PASS).

## Implemented (2026-06 — Feature expansion & polish)
- [x] Delete My Account (GDPR/CCPA erasure): DELETE /api/auth/account wipes user + projects +
      brand kits + assets + transactions + sessions; Profile confirm modal → returns to login.
- [x] Template library: 16 categorized starter templates (src/constants/templates.ts) that
      seed the Capture screen (deep-link params seed/mode).
- [x] Palette Generator: client-side color-harmony engine (analogous/complementary/triadic/
      monochromatic) — cost-free, saves as a custom-color brand kit (backend now accepts colors).
- [x] Analytics/Insights dashboard: GET /api/analytics (status pipeline, asset types, 7-day
      activity, task completion) rendered with custom bars (no chart dep).
- [x] Studio upgrades: Creative Tools row, Asset Library search + type filter, batch Download all (web).
- [x] One-time onboarding welcome modal (3-step); responsive max-width containers for tablet/desktop web.
- [x] Accessibility maintained on all new UI (roles/labels/state, modals, larger targets).
- [x] Tested iteration_3.json — ALL PASS (backend 5/5, frontend 10/10). Demo data cleaned.

## Backlog / Remaining (updated)
- P1: Native IAP for true auto-renew subscriptions; asset version history/compare view.
- P2: Project tags/folders; mood boards; voice commands; light collaboration (share links/comments).
- P2: Automated axe/Accessibility Scanner pass on device build; richer AI image alt text.

## Implemented (2026-06 — Idea→Brand Agent & Smart Brand Memory)
- [x] Idea→Brand AI Agent (`app/agent.tsx`): one input runs a live 5-step stepper —
      refine (Claude) → create project → brand kit palette (Claude) → taglines (Claude) →
      hero visual (Gemini) — then shows a result card (palette, hero image, taglines,
      Open Project / Brand Kit). Resilient to the free-tier limit (saves partial + upsell).
- [x] Smart Brand Memory: per-user {enabled, tone, keywords, colors} that LEARNS from every
      project (brand_keywords) and brand kit (colors + style rules), most-recent-first & capped,
      and is INJECTED into palette/image/tagline/refine prompts for cross-generation consistency.
      Endpoints GET/PATCH /api/brand-memory; editor screen `app/brand-memory.tsx` (toggle, tone,
      keyword chips, signature colors).
- [x] Entry points: Dashboard "AI Agent" quick action; Profile "Smart Brand Memory"; agent memory chip.
- [x] Tested iteration_4.json — ALL PASS (backend 8/8, frontend agent + memory + regression). Demo preserved.

## Implemented (2026-06 — Habit-forming design: Hooked Model + Tiny Habits)
- [x] Trigger (smart, non-annoying): dashboard `smart-nudge-card` computes the next-best action
      (keep streak alive / ideas to Spark Pack / assets to Vault / brand a draft) — in-app only, no OS spam.
- [x] Action (quick win): onboarding "Create my first brand →" launches the Idea→Brand Agent
      pre-filled with a sample idea, delivering a full creation in under ~2 minutes.
- [x] Variable reward: server-side surprise engine (~25%, capped 2/day) returns a `surprise` on
      asset generation (bonus credits / hidden style / kudos) with a delightful celebration.
- [x] Streak: `streak_event {count, extended, is_milestone}` on project/asset creation; milestone
      days (3/7/14/30/60/100) fire a beautiful confetti celebration; streak visible on dashboard/surprises.
- [x] Investment: existing brand kits (customizable), project history, and Smart Brand Memory deepen
      the more you use it; reward priority handled centrally via `src/utils/celebrate.ts`.
- [x] Personalization: greeting + progress + contextual nudge make the dashboard feel like a creative home.
- [x] Tested iteration_5.json — ALL PASS (backend 6/6, frontend onboarding/nudge/regression). WCAG AA maintained.

## Implemented (2026-06 — Native IAP + Asset Version History + Offline)
- [x] Native In-App Purchases scaffolded (`expo-iap`): product IDs `pro.monthly` ($14.99) &
      `pro.yearly` ($149) configured; app.json plugin added. Paywall uses IAP on native
      dev/prod builds and Stripe web checkout on web/Expo Go (IAP_AVAILABLE gate).
      Backend `GET /api/payments/iap/products`, `POST /api/payments/iap/verify` (Apple
      verifyReceipt + Google Play Developer API, idempotent iap_transactions, 503 when store
      creds not yet configured). Store credentials env placeholders in backend/.env — device
      testing requires a build (cannot be validated in Expo Go/web).
- [x] Asset version history & compare: regenerate saves prior image into a capped (10) `versions`
      array; new screen `app/asset/[id].tsx` (large preview, export, tweak-prompt regenerate,
      horizontal version filmstrip, side-by-side compare + restore). Endpoints
      `GET /api/assets/{id}/versions`, `POST /api/assets/{id}/regenerate`, `POST /api/assets/{id}/revert`.
      Entry points: Studio asset tiles + Brand Kit asset history button.
- [x] Offline core viewing: `cachedGet` in api client caches projects/brand kits/usage snapshots
      to AsyncStorage and serves them when the network is unreachable; OfflineBanner (WCAG live
      region) shown on Dashboard, Incubator, Studio when `_offline`.

## Implemented (2026-06 — Phase A delight & hooks polish)
- [x] Instant smart personalization on the AI Agent (`src/utils/suggest.ts`): as the user types,
      a zero-AI engine infers a brand "vibe" (label + harmony palette + best-matching template)
      and shows a `smart-suggestion` card. "Apply this vibe" saves colors+tone to Smart Brand
      Memory so the run leans into it (PATCH /api/brand-memory).
- [x] Magic moments during creation: rotating insightful `CREATION_TIPS` + creation-tip banner
      shown while the stepper runs (WCAG live region).
- [x] One-tap shareable "Creation Story" card (`app/story/[id].tsx`): auto-composed PNG with brand
      name, palette, logo/hero, tagline, streak badge + "Made with CreatorForge"; export/share via
      view-shot. Entry points: agent result ("Share your creation story") + Brand Kit header.
- [x] Frictionless polish: web Cmd/Ctrl+Enter to forge; upgraded Studio empty state (Try AI Agent /
      New kit CTAs). All ADA/WCAG AA maintained.
- [x] Tested iteration_7 — backend 9/9 PASS (brand-memory PATCH), frontend PASS (suggestion,
      apply-vibe, story render + share export confirmed working via manual verify).

## Implemented (2026-06 — Before→After + Phase B social gallery)
- [x] Creation Story "before → after" framing (`app/story/[id].tsx`): a toggleable, accessible
      Switch adds a "THE IDEA → BECOMES" block (raw idea/summary of the linked project) above the
      branded card, making shares more compelling. Included in the exported PNG when enabled.
- [x] Opt-in, privacy-first community gallery + remix:
      - Backend: POST /api/brand-kits/{id}/publish (is_public + anonymous gallery_alias, default
        "A CreatorForge maker"), GET /api/gallery (no-auth, exposes ONLY non-personal fields —
        never user_id/email/name), POST /api/gallery/{id}/remix (clones palette/fonts/style_rules,
        logo=null, increments remix_count, learns into brand memory), POST /api/gallery/{id}/report
        (auto-unpublish at 3 reports for moderation).
      - Frontend: `app/gallery.tsx` (grid, Remix + Report), publish opt-in Switch on Brand Kit page
        with privacy explainer, Studio "Community Gallery" tool entry.
- [x] Tested iteration_8 — backend 8/8 PASS (privacy asserted, report bug found+fixed), frontend
      100% (before/after toggle, publish→gallery→remix flow, celebration). WCAG AA maintained.

## Launch Prep (2026-06)
- [x] Trending this week row on Community Gallery (GET /api/gallery returns `trending` =
      remix_count≥1 sorted desc, top 8; horizontal 🔥 row with one-tap Remix; hides when empty).
- [x] Final pre-launch regression (iteration_9): backend 14/14 PASS, all frontend flows verified,
      exactly 2 image generations consumed. Ship-ready, no blocking issues.
- [x] Polish pass: removed RN-web `shadow*` deprecation (Platform.select → boxShadow on web),
      moved `pointerEvents` props → `style.pointerEvents` across app code (shadow warnings now 0;
      remaining 2 pointerEvents warnings are library-internal/non-fixable). Cleaned test kits from
      gallery; linked demo brand kits to projects so the Creation Story before→after is demoable.
      WCAG AA sweep on gallery, trending, and story (roles/labels/live regions) verified.
- [x] App Store assets: listing copy (name, subtitle, keywords, full description, subscription
      disclosure, screenshot captions) in `/app/memory/APP_STORE_LISTING.md`. Preview screenshots
      of 5 key screens captured (dashboard, agent, brand kit, gallery/trending, Creation Story).
      NOTE: final store-resolution screenshots (e.g., 1290×2796) must be generated from a device/
      simulator build; native IAP on-device purchase testing also requires a published build + store creds.

## Feature Flags + Beta Build behavior (2026-06)
- [x] Backend feature-flags system: single Mongo `app_config` doc (`_id=feature_flags`), process cache
      with 10s TTL (picks up DB-side toggles without restart). Flags: `beta_premium_enabled`,
      `demo_account_visible`, `allow_new_signups`.
- [x] Beta grant: when `beta_premium_enabled`, `is_premium()` returns true for all authenticated users
      → testers get Premium (unlimited generations, no watermark) with no payment; new users stamped
      `beta_premium:true`.
- [x] Demo hidden: login with `demo@creatorforge.app` rejected (generic 401) + "Try the demo account"
      button removed from /login when `demo_account_visible=false`; demo DATA retained. `allow_new_signups=false`
      gates register + Google new-user (403) and hides the "Create an account" toggle.
- [x] Admin control: `GET/PATCH /api/admin/feature-flags` protected by `X-Admin-Key` (ADMIN_API_KEY in
      backend/.env, server-only); public `GET /api/config/flags` for the app; also toggleable via the Mongo doc.
- [x] Build defaults: beta_premium_enabled=true, demo_account_visible=false, allow_new_signups=true.
- [x] Tested iteration_10 — backend 12/12 PASS, frontend PASS, no paid generations, flags restored.
- [x] Beta badge: subtle accessible "🧪 BETA" pill on the dashboard header (next to plan pill) and a
      BETA chip + explanatory copy on the Profile plan card — shown only while `beta_premium_enabled`.
      Verified via fresh-tester signup screenshot.

## ADMT / Automated Decision Transparency (CCPA — 2026/2027) (2026-06)
- [x] Pre-use notice at point of collection: "How AI uses your input" link on the Agent input, full
      notice screen `app/privacy-admt.tsx`, and Privacy Policy §8 ADMT section in `legal.tsx`.
- [x] Opt-out (2 methods): in-app toggle (Profile → "Automated Decisions & AI") + email. Backend
      `POST /api/privacy/admt-optout` sets `admt_opt_out` (+timestamp) and turns Smart Brand Memory off;
      `memory_context()` returns "" and `learn_brand_memory()` stores nothing when opted out (AI still works).
- [x] Right to access: `GET /api/privacy/admt`. No-retaliation statement + manual-tool alternatives included.
- [x] Risk Assessment + Cybersecurity Audit template at `/app/memory/ADMT_RISK_ASSESSMENT_TEMPLATE.md` (legal review).
- [x] Verified: UI screen + toggle + toast; backend opt-out suppresses personalization (unit-checked).
- NOTE: AI here generates creative content, not "significant decisions" — mandatory opt-out likely not
      strictly triggered, but transparency + controls implemented for readiness. Not legal advice.


## Backlog / Remaining
- P1: Finalize iOS StoreKit2 JWS verification (App Store Server API) at build time once creds provided.
- Phase C (deferred by user): variant explosions (multi-variant generation) gated behind Premium.
- P2: Project tags/folders; mood boards; reference-image editing (Gemini); split server.py into routers.
- Launch: generate final store-resolution screenshots from a device build; add 1024px icon + feature graphic.

## Test Credentials
demo@creatorforge.app / creator123 (see /app/memory/test_credentials.md)
