# CreatorForge — ADMT Risk Assessment & Cybersecurity Audit Template

> Draft template to support California CPPA/CCPA compliance (ADMT regulations effective Jan 1, 2026;
> ADMT-for-significant-decisions obligations mandatory Jan 1, 2027). **Not legal advice** — have
> qualified privacy counsel review and finalize before relying on it.

---

## Part A — ADMT Risk Assessment (Cal. Civ. Code §1798.185; CPPA risk-assessment regs)

### 1. Processing overview
- **Business / service:** CreatorForge (AI idea-to-brand workspace).
- **What ADMT is used:** Anthropic Claude (text generation), Google Gemini (image generation), OpenAI Whisper (speech-to-text).
- **Purpose:** Generate editable brand content (plans, palettes, taglines, logos, images) from user-submitted ideas/text/voice.
- **Is this a "significant decision"?** No. ADMT does not produce legal or similarly significant effects (employment, housing, credit, insurance, healthcare, education, essential goods/services). It produces optional creative suggestions the user fully controls.
- **Is it "extensive profiling" / "profiling for behavioral advertising" / "training"?** No behavioral-advertising profiling; no training of models on user data. Optional personalization (Smart Brand Memory) tailors output to the user's own saved style only.

### 2. Categories of personal information processed
| Category | Example | Source | Retention |
|---|---|---|---|
| Account data | email, name | user | until account deletion |
| User content | idea text, project titles/descriptions | user | until user deletes |
| Voice input | audio → transcribed text (audio not retained) | user | transcript retained with content |
| Style preferences | Smart Brand Memory (tone/keywords/colors) | derived from user activity | until deletion or opt-out |
| Generated assets | images/text (base64) | ADMT output | until user deletes |

### 3. Purpose & necessity
- Processing is necessary to deliver the core creative feature the user requests.
- Personalization is **optional** and **opt-out** at any time.

### 4. Benefits (to consumer, business, public)
- Consumer: faster, cohesive brand creation; full control/editability.
- Business: core product value; freemium conversion.

### 5. Risks to consumers & safeguards
| Risk | Likelihood | Impact | Safeguards / mitigations |
|---|---|---|---|
| Inaccurate/low-quality output | Med | Low | Outputs are suggestions; user reviews/edits/regenerates; AI Disclaimer shown |
| Over-collection / profiling | Low | Low | Only user-submitted data; opt-out disables personalization & stops style storage |
| Unauthorized access | Low | Med | bcrypt password hashing, TLS, signed tokens, access controls, account-scoped queries |
| Bias in generated imagery/text | Med | Low | Human-in-the-loop; user controls final output; no consequential automated action |
| Data retention beyond need | Low | Low | User delete controls; full account erasure endpoint (GDPR/CCPA) |

### 6. Human involvement / oversight
- User is in the loop at every step; no output is finalized or acted upon automatically.

### 7. Consumer rights implemented
- Pre-use notice (in-app at point of collection + Privacy Policy §8).
- Right to opt out of automated personalization (in-app toggle + email).
- Right to access ADMT logic/data/outputs (in-app "Automated Decisions & AI" screen; `GET /api/privacy/admt`).
- No-retaliation commitment.
- Alternatives available (manual tools) when opted out.

### 8. Determination
- Residual risk: **Low**. ADMT not used for significant decisions; robust transparency + opt-out in place.
- Reviewer / approver: __________________  Date: __________
- Next review date: __________ (review at least every 3 years or upon material change).

---

## Part B — Cybersecurity Audit (CPPA cybersecurity-audit regs)

### 1. Scope & systems
- Frontend (Expo/React Native + web), FastAPI backend, MongoDB, third-party AI APIs (Emergent-managed keys), Stripe/native IAP.

### 2. Controls checklist
| Domain | Control | Status | Notes |
|---|---|---|---|
| Authentication | Password hashing (bcrypt) | ✅ | no plaintext |
| Authentication | Signed bearer tokens over TLS | ✅ | secure storage on device |
| Authorization | Per-user data scoping on all queries | ✅ | verify on new endpoints |
| Secrets mgmt | API keys server-side only; never in EXPO_PUBLIC_* | ✅ | ADMIN_API_KEY, store creds in backend/.env |
| Admin access | Feature-flag admin gated by X-Admin-Key | ✅ | rotate key periodically |
| Transport | HTTPS/TLS enforced | ✅ | ingress-terminated |
| Data minimization | Only user-submitted data; opt-out honored | ✅ | |
| Data deletion | Account erasure endpoint | ✅ | `/api/auth/account` |
| Logging/monitoring | Server logs; flag-change audit log | ⚠️ | add alerting before scale |
| Backup/recovery | MongoDB backups | ⬜ | confirm cadence in prod |
| Vendor mgmt | Review AI/payment processors' DPAs | ⬜ | counsel to confirm |
| Incident response | IR plan + breach-notification workflow | ⬜ | document before launch |
| Vulnerability mgmt | Dependency scanning / patching | ⚠️ | schedule recurring |

Legend: ✅ implemented · ⚠️ partial · ⬜ to do

### 3. Findings & remediation
- (List gaps, owners, and target dates here.)

### 4. Attestation
- Auditor: __________________  Independent? Y/N  Date: __________
- Report retained for the period required by regulation.
