# PROPERTY MOTION — ARCHITECT BRIEFING

## 1. PRODUCT OVERVIEW
Product: Property Motion
Category: Australian real estate listing video SaaS
Status: Pre-launch (not yet live on a public domain)
What it does: Generates cinematic Ken Burns-style listing videos from agent-uploaded property photos, with AI-powered camera motion, voiceover scripts, and text-to-speech narration. Agents upload photos → AI generates a polished 15-second Instagram-ready listing video.
Target Market: Australian real estate agents and agencies
Distribution Strategy:
- 3 Instagram accounts (handles TBD, not yet live)
- VA-driven cold outreach with personalised demo videos sent directly to agents

---

## 2. TECH STACK

| Layer | Technology | Details |
|---|---|---|
| Frontend | React + TypeScript | Built in Lovable, deployed on Vercel |
| UI Library | shadcn/ui + Tailwind CSS | Component library with Radix primitives |
| Backend | Supabase | Auth, Postgres DB, Edge Functions (Deno), Storage |
| Payments | Stripe | Checkout Sessions, Customer Portal, Webhooks |
| Video Rendering | Shotstack | Final video assembly, Ken Burns transforms, templates |
| AI Video | Runway ML Gen4 Turbo | Image-to-video generation with camera motion prompts |
| AI Scripting | Anthropic Claude Sonnet 4.5 | Property voiceover script generation |
| Text-to-Speech | ElevenLabs | Australian/British/American voice options |
| Routing | React Router DOM | Client-side SPA routing |
| State | TanStack Query | Server state management |
| Forms | React Hook Form + Zod | Form handling and validation |

---

## 3. ARCHITECTURE

### 3.1 Frontend (React SPA on Vercel)
- Source: /src/
- Entry: /src/App.tsx → React Router
- Key Pages: Dashboard, Create Video, Properties, Billing, Settings
- Auth Context: /src/contexts/AuthContext.tsx — Supabase auth state listener, session refresh, useAuth() hook
- Edge Function Client: /src/lib/invokeEdgeFunction.ts — Centralised wrapper with auto-401-retry and session refresh

### 3.2 Backend (Supabase Edge Functions — 28 functions)

**Video Pipeline Functions**

| Function | Purpose |
|---|---|
| generate-video | Orchestrator (787 lines) — routes to Ken Burns, Canvas, or Runway pipeline |
| generate-runway-batch | Sends images to Runway Gen4 Turbo with camera motion prompts |
| generate-shotstack-batch | Alternative provider using Shotstack's Stable Video Diffusion |
| stitch-video | Assembles clips into final video with audio/music overlay via Shotstack |
| video-status | Polls Runway/Shotstack for completion, updates DB |
| check-runway-batch | Batch status checker for Runway jobs |

**AI & Audio Functions**

| Function | Purpose |
|---|---|
| generate-script | Claude Sonnet 4.5 — generates 15-second voiceover scripts (35-40 words) |
| generate-audio | ElevenLabs TTS — converts script to audio, uploads to Supabase Storage |
| preview-voice | Voice preview for UI selection |

**Photo Functions**

| Function | Purpose |
|---|---|
| enhance-photo | Photo quality enhancement |
| stage-room | Virtual staging |
| detect-room-types | Room type classification |
| smart-crop-portrait | 9:16 portrait crop for social media |
| crop-image | General image cropping |

**Billing Functions**

| Function | Purpose |
|---|---|
| create-checkout-session | Creates Stripe Checkout for subscriptions + top-ups |
| create-portal-session | Generates Stripe billing portal URL |
| stripe-webhook | Processes Stripe webhook events |

**Scraping Functions**

| Function | Purpose |
|---|---|
| scrape-property | Property data scraping |
| scrape-listing-images | Listing image extraction |

**Shared Utilities (/supabase/functions/_shared/)**
- auth.ts — JWT validation (requireAuth()), SSRF-safe image URL allowlist
- rate-limit.ts — Database-backed sliding window rate limiting
- send-email.ts — Email notifications
- cors.ts — CORS headers

### 3.3 Database Schema (Supabase Postgres)

**Core Tables**

`user_preferences` (primary user table)
- Auth: links to Supabase auth.users
- Stripe: stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan, subscription_tier, subscription_period_start/end, subscription_cancel_at_period_end
- Usage: videos_used_this_period, period_reset_date, videos_limit
- Payment: payment_method_last4, payment_method_brand
- Free trial: free_video_used, signup_ip_hash (SHA-256 for abuse detection)

`videos`
- Status: queued → processing → completed | failed
- Provider: shotstack, luma, runway
- Media: video_url, thumbnail_url, duration, script
- Agent: agent_name, agent_phone, agent_email, agent_photo_url
- Template/style metadata, render_id for Shotstack job recovery

`properties` — Address, price, bedrooms, bathrooms, parking, features, images
`scraping_jobs` — Property scraping request tracking
`photo_jobs` — Photo enhance/stage jobs with JSONB options
`rate_limits` — Sliding window rate limit entries (auto-cleanup > 24h)

**Views**
- `users` — Backward-compatible VIEW aliasing user_preferences columns

**RLS Policies**
- All user tables: auth.uid() = user_id
- rate_limits: service_role only
- Webhook operations: service_role key (bypasses RLS)

**Key RPC Functions**
- increment_video_count(p_user_id UUID) — Atomic video counter increment

**Migrations Timeline (13 files)**
- /supabase/migrations/ — Feb 3 → Mar 12, 2026

---

## 4. VIDEO GENERATION PIPELINE (3 Modes)

### Mode 1: Ken Burns (Direct Shotstack, No AI)
Photos → Mathematical zoom/pan transforms → Shotstack hard-cuts at 3.5s/image → stitch-video → Final MP4
- Fastest, cheapest — no AI API calls for video
- Still uses Claude for script + ElevenLabs for voiceover

### Mode 2: Canvas (Pre-Generated Clips)
Pre-generated video URLs → stitch-video → Final MP4
- Accepts externally generated clips, stitches with audio/music

### Mode 3: Runway Gen4 Turbo (Main AI Pipeline)
Photos → smart-crop-portrait (9:16) → generate-runway-batch → [poll video-status] → stitch-video → Final MP4
↘️ generate-script (Claude) → generate-audio (ElevenLabs) ↗️
- 5-second clips per image (73% consistency vs drift at 10s)
- Positive-only prompting with stability suffix

### Camera Motion Presets

| Preset | Description |
|---|---|
| push-in | Forward dolly, centered frame |
| pull-out | Backward dolly, revealing space |
| tracking | Lateral tracking shot |
| orbit | Slow cinematic 20° arc |
| drone-up | Aerial vertical rise and reveal |
| static | Locked tripod (Shotstack only) |

### Shotstack Video Templates
"Open House", "Elegant Classic", "Big and Bold", "Simple White", "Modern Treehouse", "Just Listed", "Minimalist", "Cinematic", "Luxury", "Real Estate Pro", "Warm Elegance"

---

## 5. PRICING & STRIPE

### Subscription Plans (AUD)

| Plan | Monthly | Yearly (per month) | Videos/Period |
|---|---|---|---|
| Starter | A$49 | A$39 (20% off) | Monthly: 3, Yearly: 25 |
| Growth | A$99 | A$79 (20% off) | Monthly: 10, Yearly: 100 |
| Pro | A$179 | A$149 (17% off) | Monthly: 20, Yearly: 200 |
| Enterprise | Custom | Custom | Custom (100 default) |

### Top-Up Credit Packs

| Pack | Price | Videos |
|---|---|---|
| Single | A$8 | 1 video |
| 5-Pack | A$35 | 5 videos |

### 8 Stripe Price IDs
- 3 monthly subscription prices (starter, growth, pro)
- 3 yearly subscription prices (starter_yearly, growth_yearly, pro_yearly)
- 2 top-up prices (topup_1, topup_5)

### Free Trial
- 7-day trial on all subscription plans (via Stripe Checkout)
- 1 free video for unsubscribed users (IP-hash abuse detection, max 3 per IP)

### Stripe Webhook Events Handled
- checkout.session.completed — Provisions subscription or adds top-up credits
- customer.subscription.created — Sets plan, resets usage counter
- customer.subscription.updated — Updates plan/payment details
- customer.subscription.deleted — Downgrades to free tier (2 video limit)
- invoice.payment_succeeded — Resets billing cycle usage
- invoice.payment_failed — Marks subscription past_due

---

## 6. AI INTEGRATIONS

### Claude (Anthropic) — Script Generation
- Model: Claude Sonnet 4.5
- Endpoint: /supabase/functions/generate-script/
- Prompt: 15-second script, 35-40 words, warm/enthusiastic, 2 short sentences, strong CTA, plain text
- Input: Property details (address, price, beds, baths, size, features, description)

### ElevenLabs — Text-to-Speech
- Model: eleven_monolingual_v1
- Voices: 6 options — Australian (M/F), British (M/F), American (M/F)
- Settings: Stability 0.5, Similarity boost 0.75
- Output: Uploaded to audio/voiceover-{videoId}.mp3 in Supabase Storage

### Runway ML — Image-to-Video
- Model: Gen4 Turbo
- Endpoint: https://api.dev.runwayml.com/v1/image_to_video
- Clips: 5 seconds each, positive-only prompts with stability suffix
- Retry: Exponential backoff on 429 (15s × 2^attempt), retry on 5xx (2s delay), max 2 retries

---

## 7. SECURITY

| Measure | Implementation |
|---|---|
| Authentication | Supabase Auth + JWT verification in each edge function |
| Row Level Security | All user tables enforce auth.uid() = user_id |
| Rate Limiting | DB-backed sliding window: 20/user/hour, 30/IP/hour |
| SSRF Protection | Image URL allowlist (supabase.co, reastatic.net, domainstatic.com.au, cloudinary.com) |
| Stripe Webhooks | HMAC-SHA256 signature verification + 5-min timestamp check |
| Free Trial Abuse | SHA-256 IP hashing, max 3 free videos per IP |
| Session Security | Auto-refresh on 401, single retry with fresh token |
| JWT Handling | Infrastructure-level JWT disabled; manual verification in code (workaround for SDK issues) |

---

## 8. ENVIRONMENT VARIABLES REQUIRED

| Variable | Service |
|---|---|
| SUPABASE_URL | Supabase project URL |
| SUPABASE_ANON_KEY | Supabase anonymous key |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role (edge functions) |
| STRIPE_SECRET_KEY | Stripe API key |
| STRIPE_WEBHOOK_SECRET | Stripe webhook signing secret |
| SHOTSTACK_API_KEY | Shotstack rendering |
| RUNWAY_API_KEY | Runway ML video generation |
| ANTHROPIC_API_KEY | Claude script generation |
| ELEVENLABS_API_KEY | ElevenLabs TTS |

---

## 9. OUTSTANDING WORK

### P0 — Must Complete Before Launch

1. **Stripe Webhook End-to-End Testing** — Webhook handler code exists for all 6 event types but needs verification against real Stripe events. Set up Stripe CLI for local webhook forwarding and test each flow.
2. **End-to-End Video Generation Pipeline Test** — Full flow from photo upload → AI script → TTS → Runway/Ken Burns → Shotstack stitch → final video URL. Verify each handoff point.
3. **Agent Onboarding Flow Polish** — First-run experience, free trial video flow, subscription upgrade path.

### P1 — Pre-Launch Polish

1. **Domain & Deployment** — Not yet live on a public domain. Vercel deployment needs production URL configuration.
2. **Instagram Account Setup** — 3 accounts planned but handles not yet finalised.
3. **Billing History** — Currently hardcoded demo data in /src/pages/Billing.tsx; needs real Stripe invoice data.

### P2 — Post-Launch

1. **VA Outreach Tooling** — Process for personalised demo video generation and cold outreach.
2. **Enterprise Tier** — Currently "Contact us" only; no Stripe price ID. Needs custom quoting flow.
3. **Luma Integration** — Edge functions exist (generate-luma-batch, check-luma-batch, generate-luma-intro) but appear to be alternative/experimental pipeline.

---

## 10. KEY FILE PATHS

```
/src/                          # React frontend
├── components/
│   └── SubscriptionModal.tsx  # Plan selection UI
├── contexts/
│   └── AuthContext.tsx        # Auth state management
├── lib/
│   └── invokeEdgeFunction.ts  # Edge function client wrapper
├── pages/
│   ├── Billing.tsx            # Subscription management
│   └── Settings.tsx           # User settings + plan tab
└── integrations/
    └── supabase/client.ts     # Supabase client init

/supabase/
├── config.toml                # Edge function config (JWT disabled at infra level)
├── migrations/                # 13 migration files (Feb 3 → Mar 12)
└── functions/
    ├── _shared/               # auth.ts, rate-limit.ts, send-email.ts, cors.ts
    ├── generate-video/        # Main orchestrator (787 lines)
    ├── generate-runway-batch/ # Runway API integration
    ├── generate-shotstack-batch/ # Shotstack video generation
    ├── stitch-video/          # Final video assembly
    ├── video-status/          # Status polling
    ├── generate-script/       # Claude script generation
    ├── generate-audio/        # ElevenLabs TTS
    ├── create-checkout-session/ # Stripe checkout
    ├── create-portal-session/ # Stripe billing portal
    ├── stripe-webhook/        # Stripe event handler
    ├── enhance-photo/         # Photo enhancement
    ├── stage-room/            # Virtual staging
    ├── smart-crop-portrait/   # 9:16 crop
    └── [+ 14 more functions]
```

---

## 11. ARCHITECTURAL DECISIONS & CONSTRAINTS

- **JWT verification is manual** — Infrastructure-level JWT was disabled across all edge functions due to SDK token rejection issues. Every function calls requireAuth() from _shared/auth.ts instead. Do not re-enable infra-level JWT without testing.
- **External images are re-uploaded** — Property photos from CDNs (reastatic.net, domainstatic.com.au) are re-uploaded to Supabase Storage before sending to Runway/Shotstack, ensuring reliable access.
- **5-second Runway clips** — Hardcoded at 5s based on research showing 73% motion consistency at 5s vs significant drift at 10s. Do not change without testing.
- **Positive-only Runway prompts** — Negative instructions cause unpredictable results. All motion prompts use positive phrasing with a stability suffix.
- **Video quota enforcement is backend-only** — The edge function validates videos_used_this_period vs videos_limit before allowing generation. Frontend displays are informational only.
- **Music lives in Supabase Storage** — video-assets/music/ bucket. Custom user uploads supported with trim points.
