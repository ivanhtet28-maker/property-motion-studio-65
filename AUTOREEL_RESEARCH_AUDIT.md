# AutoReel Research Audit: Competitor Comparison

## Context
Comparing Property Motion Studio's video generation workflow against two key competitors — **Amplifiles** and **AutoReel** — to identify whether our approach is better or if we should adopt elements of theirs.

---

## Core Technical Difference

| | **Property Motion (Ours)** | **Amplifiles** | **AutoReel** |
|---|---|---|---|
| **Core Engine** | **Runway Gen4 Turbo** (generative AI) | Depth-based 3D parallax (custom) | Depth-based 3D parallax (custom) |
| **How it works** | AI model generates video frames from image + text prompt | Depth map → 3D scene → virtual camera → inpaint edges | Depth map → deterministic motion vectors → render |

This is the **fundamental split**: we use a generative AI model; they both use depth estimation + 3D reconstruction.

---

## Feature-by-Feature Comparison

| Feature | **Ours** | **Amplifiles** | **AutoReel** |
|---|---|---|---|
| Camera Motions | 8 (push-in, pull-out, glide-L/R, orbit-L/R, drone-up, static) | 7 (push-in, rotate, truck-L/R, pull-out, static, pedestal, drone) | 5+ (push-in, pull-out, lateral pan, orbit-L/R in v25) |
| Output Quality | 1080p (Shotstack stitch) | 1080p | 720p (API) |
| Clip Duration | 5s per image | ~4-5s per image | ~5s per image |
| Voiceover | ✅ Claude script + ElevenLabs TTS (6 voices, 3 accents) | ✅ AI voiceover (multi-language) | ❌ Not in API |
| Music Library | ✅ 12 tracks, 5 categories | ✅ Background music | ❌ Not mentioned |
| Branding Overlays | ✅ Agent name, phone, email, photo, logo | ✅ Logo, agent info, contact | ❌ Not mentioned |
| Templates | ✅ 11 Shotstack templates | Unknown | Unknown |
| Aspect Ratios | 9:16 + 16:9 | Horizontal, Vertical, Square | Landscape + Portrait |
| Listing Import | ✅ domain.com.au scraping | ✅ Zillow/MLS URL import | ✅ Zillow/Realtor.com |
| Virtual Staging | ✅ (enhance-photo, stage-room) | ❌ | ❌ |
| Public API | ❌ | ❌ | ✅ Documented REST API |
| Pricing | A$49-179/mo (3-20 videos) | $1.50/image | ~$19/mo+ |
| Free Trial | 1 free video | 1200 free credits | Unknown |
| Market | Australia | Global (Finland-based) | Global |

---

## Where We're BETTER

### 1. Richer Motion Vocabulary
We have **8 motions** including both glide-left/right AND orbit-left/right, plus drone-up. AutoReel only added orbit in v25. We match or exceed both competitors.

### 2. Superior Output Polish
Our pipeline produces a **complete, branded video** — not just motion clips:
- AI-generated voiceover script (Claude) tuned for real estate
- Professional TTS (ElevenLabs) with accent options
- Background music selection
- Agent branding overlays
- 11 professional templates
- **None of the competitors offer this full stack in one workflow**

### 3. Virtual Staging
We offer photo enhancement and virtual staging — **neither competitor does this**. This is a genuine differentiator.

### 4. Higher Resolution
Our output is 1080p. AutoReel's API only outputs 720p.

### 5. Ken Burns Fallback
We have a free/instant Ken Burns mode for budget-conscious agents. Competitors don't offer a non-AI tier.

### 6. More Motion Control
Per-image camera motion selection + landscape-specific prompt tuning (wider orbits for 16:9). This level of per-clip control is comparable to both competitors.

---

## Where THEY'RE Better (and what we should consider)

### 1. Deterministic Output (Their Depth-Based Approach)
**Their advantage**: Depth-based 3D parallax produces **100% predictable, repeatable** results. Same input always gives same output. No hallucinated objects, no AI drift.

**Our situation**: Runway Gen4 Turbo is generative — it can:
- Hallucinate objects (ceiling fans, furniture) that don't exist
- Drift from source image at longer durations (why we cap at 5s)
- Produce inconsistent results between runs
- Cost more per generation

**Verdict**: This is their strongest advantage. For real estate, accuracy is critical — agents can't show rooms with hallucinated features. However, our 5s cap + positive-only prompting mitigates this significantly. **Worth monitoring but not worth switching our entire pipeline.**

### 2. AutoReel's Public API
They offer a documented REST API at `api.autoreelapp.com/api/v1/` with clear endpoints. We don't have a public API.

**Recommendation**: Not a priority pre-launch, but **worth building for enterprise tier** post-launch. Could also be a revenue stream.

### 3. Per-Image Pricing (Amplifiles)
Amplifiles charges $1.50/image — simple, predictable. Our subscription model (A$49/mo for 3 videos) works out to ~A$16/video at the starter tier.

**Verdict**: Our subscription model is fine for our target market (Australian agents with recurring needs). Per-image pricing could be a good add-on for occasional users.

### 4. Processing Speed
AutoReel claims faster rendering because depth-based approaches are computationally simpler than generative AI. Our Runway pipeline takes 5+ minutes per video.

**Verdict**: Acceptable for our use case. Agents don't need instant video — they're creating listing content.

### 5. AI Engine Versioning (AutoReel)
AutoReel lets users pick between v24 and v25 engines. We don't offer engine selection.

**Recommendation**: Not critical, but **useful for rollback** if a new Runway model version has issues. Could track internally.

---

## Should We Adopt Their Approach?

### NO — Don't switch to depth-based 3D parallax

**Reasons:**
1. **We'd need to build an entire custom pipeline** — depth estimation, 3D reconstruction, inpainting, rendering. Massive engineering effort.
2. **Runway Gen4 Turbo produces more cinematic, natural-looking motion** than depth-based parallax, which can look "flat" at edges.
3. **Our 5s clip cap + positive-only prompting** already mitigates the hallucination risk.
4. **We have competitive feature parity** on motions and exceed them on the full-stack experience (voiceover, music, templates, staging).
5. **Our differentiator is the complete package**, not just the motion generation.

### YES — Adopt these specific elements

| Element | From | Priority | Rationale |
|---|---|---|---|
| Public API (enterprise) | AutoReel | P2 (post-launch) | Revenue opportunity, enterprise sales |
| Per-image pricing option | Amplifiles | P2 | Capture occasional-use segment |
| Square aspect ratio (1:1) | Amplifiles | P1 | They offer it, we don't — useful for ads |
| AI auto-suggest motion | Amplifiles | P1 | They analyze scene composition to pick best motion per image — we should do this with Claude vision |
| Engine versioning/rollback | AutoReel | P2 | Track Runway model versions, allow rollback |

---

## Recommended Actions

### P0 — Before Launch
- No changes needed. Our pipeline is competitive and in some ways superior.

### P1 — Near-term Improvements
1. **Add AI auto-suggest camera motion** — Use Claude vision to analyze each image and recommend the best camera motion (Amplifiles does this). Quick win using existing Claude integration.
2. **Add 1:1 square aspect ratio** — Amplifiles offers it for ads. Simple addition to our pipeline.

### P2 — Post-launch
3. **Build public API** — Follow AutoReel's model: `/create_video`, `/get_video/{uuid}`, `/combine_clips`. Enterprise tier feature.
4. **Add per-image pricing option** — $2-3 AUD/image for non-subscribers.
5. **Track Runway engine versions** — Store model version per video for debugging and potential rollback.

---

## Verdict

**Our workflow is better for the end user.** We produce a more complete, polished product (branded video with voiceover, music, templates) vs. competitors who primarily generate motion clips. The generative AI approach (Runway) produces more cinematic results, with acceptable trade-offs on determinism that our 5s cap mitigates.

**Don't switch engines.** The depth-based 3D parallax approach would require massive engineering investment for marginal quality gains. Our competitive advantage is the full-stack experience, not just the motion generation.

**Cherry-pick their best ideas:** AI motion auto-suggest, square format, and eventually a public API.
