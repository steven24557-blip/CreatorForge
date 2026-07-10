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

## Backlog / Remaining
- P1: Native IAP (App Store/Play) for true auto-renewing subscriptions (current Stripe web = one-time period grant).
- P1: Asset versioning/history for iterative refinement.
- P2: Split server.py into routers; boxShadow/pointerEvents web deprecation cleanup.
- P2: Reference-image editing for assets (Gemini supports it), team/collab, offline cache.

## Test Credentials
demo@creatorforge.app / creator123 (see /app/memory/test_credentials.md)
