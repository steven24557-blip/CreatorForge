# CreatorForge — Accessibility (WCAG 2.2 AA) Audit & Checklist

Scope: React Native (Expo) app across iOS (VoiceOver), Android (TalkBack), and Web.
Status legend: ✅ implemented · ➖ inherent/handled by platform · 🔜 backlog

## 1. Perceivable
- ✅ Text alternatives: generated images (logos/assets) have descriptive `accessibilityLabel`
  (type + prompt/brand). Decorative/hero/background images use `accessibilityElementsHidden`
  + `importantForAccessibility="no-hide-descendants"`. Icons inside labeled controls are
  marked `importantForAccessibility="no"` so the control's label isn't duplicated.
- ✅ Info & relationships: screen titles and section titles use `accessibilityRole="header"`;
  legal docs render `# ` lines as real headings for logical structure.
- ✅ Meaningful sequence / reading order: single-column layouts, DOM/native order matches visual order.
- ✅ Contrast (4.5:1 normal text): dark theme text (#FFFFFF/#EAEAEA/#9A9A9A) and gold (#C5A880)
  all exceed 4.5:1 on #0F0F0F/#1C1C1C. Light-theme brand darkened to #8A6A3B so brand-colored
  text AND white-on-brand button labels both pass ≥4.5:1 (was 3.1:1).
- ✅ Resize text to 200%: `allowFontScaling` left enabled (default); layouts use flex/wrapping,
  no fixed-height text clipping; web supports browser zoom.
- ➖ Non-text contrast: borders/controls use borderStrong tokens; focus visible on web.

## 2. Operable
- ✅ Keyboard/focus (web): all controls are focusable Pressables/inputs; no mouse-only handlers
  (onPress everywhere, never onClick). Tab order follows source order.
- ✅ Target size (WCAG 2.2 – 2.5.8 AA ≥24px; we exceed with 44–52px): primary buttons 52dp,
  chips raised to 44dp + hitSlop, icon buttons use hitSlop to reach ≥44dp.
- ✅ Focus not obscured (2.4.11): sticky headers/tab bar don't overlap content; bottom padding added.
- ✅ Modals/sheets: create-kit sheet and celebration modal use `accessibilityViewIsModal`;
  overlays labeled; `onRequestClose` handles back/escape.
- ➖ No keyboard traps; native gestures have button equivalents.

## 3. Understandable
- ✅ Labels/instructions: form fields have visible labels + `accessibilityLabel`.
- ✅ Error identification & suggestion (3.3.1/3.3.3): login shows inline, per-field error text
  with `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"` and specific guidance.
- ✅ Status messages (4.1.3): toasts announce via `accessibilityLiveRegion="assertive"` +
  role `alert`; loading views use `accessibilityLiveRegion="polite"`.
- ✅ Consistent navigation: bottom tabs + consistent back/header pattern.

## 4. Robust
- ✅ Name/Role/Value: `accessibilityRole` (button/header/switch/link/alert) and
  `accessibilityState` (disabled/busy/selected/checked) set on interactive components.
- ✅ Reused primitives (Button, Card, Chip, Field, SectionTitle, Loading, EmptyState,
  Disclaimer, toast, celebration) carry a11y props centrally → consistent coverage.

## Screen reader smoke test (manual, recommended before store submission)
- [ ] Login: fields, errors, buttons, "Continue with Google" announce correctly.
- [ ] Dashboard: greeting header, plan button, quick actions, milestone stats.
- [ ] Capture: mic button announces record/stop + busy; AI result + disclaimer readable.
- [ ] Brand kit: swatches, logo/asset images have labels; export/delete buttons labeled.
- [ ] Paywall: plan selection state, subscribe, Restore Purchases, legal links.
- [ ] Milestone celebration modal announces as alert; confetti hidden from SR.
- [ ] Legal docs: headings navigable via rotor/headings menu.

## Known limitations / backlog
- 🔜 AI-generated images: labels are derived from prompt/type, not full visual description.
- 🔜 Web focus-visible ring styling could be enhanced for custom Pressables.
- 🔜 Full automated axe/Accessibility Scanner pass on a device build.

## Compliance additions (this iteration)
- Legal: Privacy Policy (GDPR + CCPA/CPRA, AI sub-processors, voice data, security),
  Terms of Service, full Subscription Agreement (auto-renew, cancellation, refunds,
  billing disputes, price changes, restore), AI Disclaimer, Accessibility Statement.
- Age rating: intended for 13+ (stated in Terms, Disclaimer, Privacy).
- Store compliance: prominent Restore Purchases (paywall + profile), clear pricing,
  auto-renew disclosure, no misleading claims.
- Security notes: bcrypt password hashing, signed bearer tokens over HTTPS/TLS,
  secure keychain token storage, no card data stored (Stripe).
