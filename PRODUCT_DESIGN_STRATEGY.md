# Morning Form — Product Design Strategy

---

## 1. Product Definition

**One sentence:**
Morning Form is a precision state-optimization system that assesses your neurophysiological patterns, generates a personal protocol, and guides you through daily practice to improve focus, sleep, training output, and recovery — without noise, hype, or guesswork.

**Expanded:**
Morning Form exists for people who already take their performance seriously but are exhausted by the fragmentation of wellness advice, the bro-science of supplement stacks, and the shallow gamification of health apps. It is not a supplement brand with an app bolted on. It is a systems-level platform that treats the human body as a state machine — you enter states (focus, sleep, activation, calm), sustain them, exit them, and recover baseline. The product begins before any hardware: a structured assessment infers your state-transition patterns, sensitivities, and constraints, then generates a personalized protocol with clear rationale. Daily guidance adapts over time through lightweight check-ins and feedback loops. The emotional register is calm clinical confidence — the feeling of walking into a world-class diagnostic clinic where everything is precise, unhurried, and designed to earn trust through restraint.

**Who it is for:**
High-agency adults (25–50) who value performance, aesthetics, and rigor. They are likely already tracking sleep (Whoop, Oura), have tried nootropics or adaptogens, and are frustrated by the gap between "biohacking" culture and credible science. They are design-conscious. They distrust anything that looks like a supplement store.

**What job it does:**
Replaces the fragmented self-experimentation loop (research → buy → try → forget → repeat) with a structured, personalized, adaptive system that tells you what to take, when, why, and what to expect — then learns from your feedback.

**Why it is different:**
- Not a supplement brand selling products through content marketing
- Not a quiz that maps you to a SKU
- Not a tracker that shows data without action
- A closed-loop system: assess → recommend → guide → check → adapt
- Protocol-first, not product-first
- Explains mechanism, not just benefit
- Treats safety and constraints as first-class design elements

**Emotional tone:**
Calm authority. Medical-grade trust. Editorial beauty. The product should feel like it knows more than it says — and reveals information at exactly the right moment.

---

## 2. UX Principles

### 2.1 Constrain before you personalize
The system must establish boundaries (safety, contraindications, schedule constraints) before it recommends anything. Personalization without constraint is reckless.

### 2.2 Explain without overwhelming
Every recommendation has a rationale. But the rationale is layered: one sentence visible, mechanism detail available on tap, full evidence behind a further tap. Never dump.

### 2.3 Quiet authority over gamified hype
No streaks. No badges. No confetti. Progress is communicated through calm data and reflective language. The product earns trust by being restrained, not by being exciting.

### 2.4 Protocol over hack
The language is "protocol," "practice," "system" — never "hack," "stack," "boost," or "unlock." This frames the product as a serious practice, not a shortcut.

### 2.5 Reduce decision fatigue
The product makes one clear recommendation. Alternatives exist but are deprioritized. The user should never feel they need to choose between ten options.

### 2.6 Progressive disclosure everywhere
Every screen has a clear primary layer. Detail is always available but never forced. The product respects the user's attention as a finite resource.

### 2.7 System language over supplement language
Frame everything in terms of states, transitions, and systems. "Your protocol supports the downshift from activation to recovery" — not "this supplement helps you relax."

### 2.8 Credibility through transparency
Show confidence levels. Say "we recommend this based on your profile and current evidence" rather than making absolute claims. Acknowledge uncertainty — it builds trust.

### 2.9 Premium through restraint
Every element earns its place. White space is a feature. If a screen feels sparse, it might be exactly right. Density is reserved for data views where the user has opted in.

### 2.10 Feedback is a gift, not a chore
Check-ins should take under 15 seconds. The product should make the user feel that their input directly shapes their experience — because it does.

### 2.11 Safety is never an afterthought
Contraindication flags, medication interactions, and "not for you right now" moments are designed with the same care as the recommendation reveal. They are premium, calm, and definitive.

### 2.12 Time-aware, not time-aggressive
The product knows what time of day it is, what day of the week it is, and where the user is in their protocol cycle. It never sends a focus protocol reminder at 10pm.

---

## 3. Core User Journey

### Stage 1: Landing / Entry

| Dimension | Detail |
|---|---|
| **User goal** | Understand what this is and whether it's for me |
| **Product goal** | Communicate credibility, differentiation, and premium positioning in <10 seconds |
| **Emotional state** | Curious but skeptical — they've seen many wellness products |
| **Key UX risks** | Looking like a supplement brand; looking like a generic quiz; overselling |
| **Design response** | Editorial landing page. One clear statement. No product shots of pills. No testimonials with headshots. Instead: precise language, strong typography, and a single CTA — "Begin Assessment." The page should feel like opening a monograph, not visiting a store. |

### Stage 2: Onboarding

| Dimension | Detail |
|---|---|
| **User goal** | Know what I'm signing up for and what I'll get |
| **Product goal** | Set expectations: this is a system, not a quiz; your data shapes your protocol; this takes ~8 minutes |
| **Emotional state** | Willing but impatient — don't waste their time with a tour |
| **Key UX risks** | Generic onboarding slides; too many steps before value |
| **Design response** | Three screens maximum. Screen 1: "Morning Form builds a protocol around your biology, not around a product catalog." Screen 2: "The assessment takes 8 minutes. Your answers shape everything." Screen 3: "Your data stays yours. We explain every recommendation." Then straight into assessment. No account creation until after assessment completion — reduce commitment barrier. |

### Stage 3: Assessment

| Dimension | Detail |
|---|---|
| **User goal** | Answer honestly and quickly, feel like this is legitimate |
| **Product goal** | Capture state-pattern data, sensitivities, constraints, and goals with enough signal to generate a credible recommendation |
| **Emotional state** | Engaged if the questions feel intelligent; disengaged if they feel generic |
| **Key UX risks** | Too long; too clinical; too trivial; feeling like a BuzzFeed quiz |
| **Design response** | Detailed in Section 5 below. Key: grouped by theme, paced with visual transitions, using cards and sliders over checkboxes, with a persistent but unobtrusive progress indicator. |

### Stage 4: Processing / Analysis

| Dimension | Detail |
|---|---|
| **User goal** | Know the system is actually doing something with my data |
| **Product goal** | Build anticipation; prevent the recommendation from feeling instant and therefore cheap |
| **Emotional state** | Anticipation — this is a designed pause |
| **Key UX risks** | Fake loading screen; feeling gimmicky; taking too long |
| **Design response** | A 6–10 second transition. Not a spinner. A quiet sequence: "Mapping state patterns" → "Identifying sensitivities" → "Building your protocol." Typographic, minimal animation. Feels like a system thinking, not a wheel spinning. |

### Stage 5: Recommendation / Protocol Reveal

| Dimension | Detail |
|---|---|
| **User goal** | See what the system recommends and understand why |
| **Product goal** | Deliver a high-trust, high-clarity recommendation that feels personalized, credible, and actionable |
| **Emotional state** | Peak engagement — this is the payoff moment |
| **Key UX risks** | Feeling generic; feeling like a sales pitch; information overload; no clear next action |
| **Design response** | Detailed in Section 6. Key: state profile first, then protocol, then rationale, then what to expect. One clear CTA to begin. |

### Stage 6: Habit Setup

| Dimension | Detail |
|---|---|
| **User goal** | Know when and how to follow the protocol |
| **Product goal** | Integrate the protocol into the user's actual schedule |
| **Emotional state** | Motivated but practical — "how does this fit my life?" |
| **Key UX risks** | Overcomplicating; requiring too many decisions; not respecting existing routines |
| **Design response** | Ask two questions: "When do you typically wake?" and "When do you typically start winding down?" Map protocol timing to these anchors. Show a simple daily timeline. Allow adjustment but don't require it. |

### Stage 7: Daily Guidance

| Dimension | Detail |
|---|---|
| **User goal** | Know what to do today without thinking about it |
| **Product goal** | Deliver the right nudge at the right time; collect implicit engagement data |
| **Emotional state** | Varies — could be energized, stressed, tired, or neutral |
| **Key UX risks** | Notification fatigue; irrelevant timing; feeling repetitive |
| **Design response** | Detailed in Section 7. Key: one morning prompt, contextual protocol reminders, evening reflection. All lightweight. |

### Stage 8: Check-ins

| Dimension | Detail |
|---|---|
| **User goal** | Report how I'm feeling without it being a chore |
| **Product goal** | Capture subjective state data for adaptation |
| **Emotional state** | Low-effort tolerance — this must be fast |
| **Key UX risks** | Too many questions; feeling like homework; no visible impact |
| **Design response** | Single-screen check-in. 2–3 taps maximum. Visual selectors (not text input). Immediate acknowledgment: "Noted. This shapes tomorrow's guidance." |

### Stage 9: Progress Reflection

| Dimension | Detail |
|---|---|
| **User goal** | See if this is working — am I changing? |
| **Product goal** | Demonstrate value; reinforce continued use; surface patterns |
| **Emotional state** | Reflective — wants signal, not noise |
| **Key UX risks** | Vanity metrics; no clear narrative; overwhelming charts |
| **Design response** | Weekly review. One clear headline: "Your focus consistency improved 18% this week." Supporting detail available on tap. No dashboard of twelve charts. |

### Stage 10: Re-routing / Adjustment

| Dimension | Detail |
|---|---|
| **User goal** | Know the system is adapting to me, not just repeating the same thing |
| **Product goal** | Demonstrate personalization; maintain relevance; prevent churn |
| **Emotional state** | Either frustrated (not working) or habituated (plateau) |
| **Key UX risks** | Silent changes (erodes trust); too-frequent changes (erodes stability); no explanation |
| **Design response** | When the protocol adjusts, show a clear notification: "Based on your check-ins, we're adjusting your evening protocol. Here's why." Link to detail. Never change silently. |

---

## 4. Information Architecture

### Primary Navigation (Bottom tab bar, mobile)

```
Home    Protocol    Check-in    Insights    You
```

Five tabs. No more. Each has a clear, singular purpose.

### Home
- Today's view: what's relevant right now based on time of day
- Next protocol action (with countdown or contextual trigger)
- Quick check-in entry point (if due)
- Weekly summary card (appears on Sundays/Mondays)

### Protocol
- Current active protocol overview
- Daily schedule view (timeline)
- Individual protocol items (tap for detail: what, when, why, mechanism, evidence tier)
- Protocol history (past adjustments with rationale)

### Check-in
- Quick state capture (morning or evening, context-dependent)
- Structured feedback on specific protocol items (periodic, not daily)
- Opens directly to the relevant check-in — no menu

### Insights
- Weekly trends (focus, sleep quality, energy, recovery — self-reported)
- Protocol adherence (simple, not shaming)
- Pattern detection: "You report better focus on days you complete your morning protocol before 8am"
- Long-term trajectory (30-day, 90-day views)

### You (Profile)
- State profile summary
- Sensitivity flags
- Safety constraints
- Current goals
- Account settings
- Data & privacy
- Support / contact
- Protocol adjustment request

### Secondary / Contextual

**Library / Learn** — Accessible from Protocol detail and chatbot. Not a primary nav item. Contains:
- Mechanism explainers (e.g., "How L-theanine modulates alpha wave activity")
- State education (e.g., "Understanding your cortisol curve")
- Protocol philosophy (e.g., "Why we sequence, not stack")

**Chatbot (Guide)** — Floating entry point, available on every screen. Not a tab. A subtle icon in the top-right or as a contextual prompt within Protocol and Check-in screens.

**Safety / Constraints** — Lives within "You" profile. Also surfaces contextually during assessment and protocol adjustments. Not hidden, but not a primary navigation item.

**Settings** — Within "You." Contains: notification preferences, data export, account management, help. Minimal.

### IA Principles
- No more than 5 primary sections
- "Learn" content is contextual, not a destination — it appears when relevant
- The chatbot is a layer, not a section
- Every screen answers: "What should I do right now?" or "How am I doing?"
- No settings sprawl — group aggressively

---

## 5. Assessment Flow

### Overview
The assessment is the product's first impression of intelligence. It must feel like a conversation with a thoughtful clinician — not a form, not a quiz, not a survey. The quality of the questions signals the quality of the system.

**Duration:** 7–9 minutes
**Total questions:** 28–34 (varies by branching)
**Interaction pace:** One question per screen (with exceptions for grouped items)
**Progress:** Subtle top bar, no percentage — just a thin line advancing

### Question Groups

#### Group 1: Intent (3 questions)
*"What brings you here"*

1. **Primary goal** — Card selector, single select
   - "I want to focus more consistently"
   - "I want to sleep better"
   - "I want to recover faster"
   - "I want to feel more regulated"
   - "I want to perform better physically"
   - "I'm not sure — I want to understand my patterns"

2. **Biggest friction point** — Card selector, single select
   - "I crash in the afternoon"
   - "I can't fall asleep easily"
   - "I wake up and don't feel rested"
   - "I feel wired but tired"
   - "My energy is unpredictable"
   - "I can't sustain focus for long periods"
   - "I struggle to wind down after intense work or training"

3. **What you've tried** — Multi-select chips
   - Caffeine management / Melatonin / Adaptogens / Nootropics / Breath work / Cold exposure / Meditation / Therapy / Prescription medication / Nothing specific

#### Group 2: Baseline Patterns (8 questions)
*"How your days typically run"*

4. **Wake time** — Time selector (scroll wheel)
5. **Sleep time** — Time selector (scroll wheel)
6. **Sleep quality self-assessment** — 5-point scale, labeled anchors ("Poor" to "Excellent"), horizontal slider
7. **Time to fall asleep** — Card selector: <10 min / 10–20 min / 20–40 min / 40+ min
8. **Night waking frequency** — Card selector: Rarely / 1–2x / 3+ times / Variable
9. **Morning energy** — 5-point scale: "I need 30+ minutes to feel awake" → "I wake up sharp"
10. **Afternoon energy** — 5-point scale: "Significant dip" → "Consistent through the day"
11. **Caffeine consumption** — Card selector: None / 1 cup / 2–3 cups / 4+ cups / Variable — with follow-up: "Last caffeine typically before:" (time selector)

#### Group 3: Training & Physical Load (4 questions)
*"How your body moves"*

12. **Training frequency** — Card selector: None / 1–2x week / 3–4x / 5+ / Variable
13. **Training type** — Multi-select chips: Strength / Endurance / HIIT / Yoga-Pilates / Sport-specific / Walking only
14. **Training time of day** — Card selector: Morning / Midday / Afternoon / Evening / Variable
15. **Recovery perception** — 5-point scale: "I often feel overtrained" → "I recover well"

#### Group 4: Stress & Nervous System (5 questions)
*"How your system responds to load"*

16. **Stress level (current)** — 5-point horizontal scale, no numbers — labeled "Low" to "High"
17. **Stress pattern** — Card selector: "Constant low hum" / "Spikes and crashes" / "Mostly calm with occasional overwhelm" / "Persistently elevated"
18. **Anxiety frequency** — Card selector: Rarely / Sometimes / Often / Daily
19. **Stimulant sensitivity** — Card selector: "I can drink coffee at 5pm" / "Afternoon caffeine disrupts my sleep" / "I'm very sensitive to stimulants" / "I don't know"
20. **Wind-down ability** — 5-point scale: "I struggle to switch off" → "I transition easily"

#### Group 5: Current Inputs (4 questions)
*"What's already in your system"*

21. **Current supplements** — Multi-select chips with common options + free text "Other"
   - Magnesium / Vitamin D / Omega-3 / B vitamins / Zinc / Ashwagandha / L-theanine / Creatine / Melatonin / CBD / Protein powder / None
22. **Current medications** — Free text with explicit note: "We ask this only to flag interactions. We are not a medical service." + option "Prefer not to say"
23. **Alcohol frequency** — Card selector: Never / Rarely / 1–2x week / 3+ / Daily
24. **Diet pattern** — Card selector: No restrictions / Vegetarian / Vegan / Keto-low-carb / Intermittent fasting / Other

#### Group 6: Safety & Constraints (4–6 questions, conditional)
*"Boundaries we respect"*

25. **Pregnancy or planning pregnancy** — Yes / No / Prefer not to say
26. **Diagnosed conditions** — Multi-select: None / Thyroid condition / Autoimmune condition / Heart condition / Seizure disorder / Psychiatric condition / Other (free text) / Prefer not to say
27. **Allergies or intolerances** — Free text + common chips: Shellfish / Soy / Gluten / Dairy / None
28. **Anything else we should know** — Optional free text, large input field

*Conditional questions appear based on earlier answers — e.g., if anxiety = "Often" or "Daily," a follow-up asks about current treatment.*

### Interaction Patterns
- **Cards** for categorical choices — large tap targets, one selection highlights with a subtle border shift, not a checkbox
- **Horizontal sliders** for spectrum questions — custom-styled, with labeled anchors at each end, no numeric values shown
- **Time selectors** for schedule questions — native scroll wheel feel
- **Multi-select chips** for "select all that apply" — pill-shaped, toggleable
- **Free text** only where genuinely needed (medications, allergies, open notes) — with a clear "skip" option

### Visual Pacing
- Each question group is introduced with a brief section header — one line, calm typography, slight pause
- Between groups, a subtle full-screen transition (fade or gentle slide) signals "new territory"
- No back-and-forth jarring — smooth, continuous scroll feel within groups
- Progress bar is a thin line at the very top — moves continuously, never resets

### Assessment Completion
Final screen before processing:
- "That's everything. We're building your profile now."
- Prompt to create account (email + password, or SSO) — *this is the first time account creation is requested*
- Below: "Your answers are encrypted and never shared. You can update them anytime."

---

## 6. Recommendation Experience

### The Reveal Sequence

This is the product's highest-stakes moment. It must feel earned, intelligent, and trustworthy.

#### Screen 1: Processing Transition
- Dark background, light typography
- Sequential lines appear with 1.5s intervals:
  - "Analyzing your state patterns"
  - "Mapping sensitivities"
  - "Building your protocol"
- Subtle typographic animation — letters resolving, not bouncing
- Duration: 8–10 seconds total
- No fake progress bar. No percentage.

#### Screen 2: State Profile
- Headline: "Your State Profile"
- Below: A clean, structured summary — not a personality type, not an archetype name

**Layout:**
```
YOUR STATE PROFILE

Primary pattern
Sustained activation with impaired downshift
—
You maintain high output during the day but
struggle to transition into rest. Your system
stays "on" longer than it should.

Key observations
· High afternoon energy but poor sleep onset
· Stimulant sensitivity: moderate-high
· Recovery perception: below baseline
· Stress pattern: constant low-level elevation

Constraints noted
· Caffeine cutoff recommended before 1pm
· No contraindicated conditions flagged

[Continue →]
```

- Language is precise but human — not robotic, not warm-and-fuzzy
- No archetype name. No emoji. No "type."
- The profile reads like a clinical summary written by someone who respects your intelligence

#### Screen 3: Protocol Overview
- Headline: "Your Protocol"
- Subhead: "Designed for sustained activation → clean downshift"

**Layout:**
```
YOUR PROTOCOL

Morning — Activation Support
L-tyrosine 500mg + Alpha-GPC 300mg
Before breakfast · Supports dopamine and
acetylcholine for sustained focus

Afternoon — Transition Buffer
L-theanine 200mg
After lunch · Smooths the cortisol curve
without sedation

Evening — Downshift Protocol
Magnesium L-threonate 200mg + Apigenin 50mg
90 minutes before bed · Supports GABA activity
and melatonin onset

[See full protocol detail →]
```

- Three time blocks, each with: compound(s), dose, timing cue, one-line mechanism
- Clean card layout, generous spacing
- Each item is tappable for deeper explanation

#### Screen 4: Why This Protocol
- Headline: "Why we recommend this"
- 3–4 concise paragraphs connecting profile observations to protocol choices
- Example: "Your profile suggests sustained sympathetic activation through the afternoon. L-theanine at midday creates a buffer — reducing norepinephrine without impairing alertness — making your evening downshift protocol more effective."
- Ends with: "Confidence: High — your profile maps clearly to well-studied compounds with strong evidence for this pattern."

#### Screen 5: What to Expect
- Headline: "What to expect"
- Timeline:

```
Week 1–2
Adjustment period. You may notice subtle
shifts in sleep onset and morning clarity.
Don't over-index on daily variation.

Week 3–4
Patterns should stabilize. Focus duration
and sleep quality are the first reliable
signals.

Week 5+
This is where feedback loops matter. Your
check-ins will shape protocol refinement.
```

- Followed by: "What this protocol does NOT do" — brief, honest, trust-building
  - "It does not replace sleep hygiene fundamentals"
  - "It does not treat clinical anxiety or insomnia"
  - "It is not a stimulant — you won't feel a 'hit'"

#### Screen 6: Begin
- Clean CTA: "Start Your Protocol"
- Below: "You can adjust timing and preferences after you begin"
- Secondary link: "View alternative protocol" (for users who want to see the second-best option)
- Tertiary link: "Talk to our guide" (opens chatbot for questions)

---

## 7. Daily Product Loop

### Design Philosophy
The daily loop must create a rhythm, not a burden. It should feel like a brief, useful conversation with a system that understands your day — not like a task manager with health content.

### Morning Prompt
**Trigger:** 15 minutes after typical wake time (learned from assessment + adjusted over time)
**Duration:** <15 seconds to complete
**Format:** Single screen

```
Good morning.

How did you sleep?
[Poorly]  [OK]  [Well]  [Great]

How are you feeling right now?
[Low]  [Flat]  [Steady]  [Sharp]

[Done]
```

- Two questions. Tap-only. No text.
- After submission: "Your morning protocol: L-tyrosine + Alpha-GPC, before breakfast."
- If the user reported "Poorly" for sleep: contextual note — "After poor sleep, your focus window may be shorter today. Consider front-loading important work."
- This contextual adaptation is the product's key differentiator in daily use.

### Protocol Reminders
- Appear at the user's configured times (set during habit setup, adjustable)
- Quiet notification: "Afternoon protocol: L-theanine 200mg"
- Tapping opens the protocol detail with the "why" visible
- No nagging. One notification per protocol item. If dismissed, gone.

### Contextual Nudges (Selective, not daily)
- Triggered by patterns, not by schedule
- Example: After 3 days of reporting "Low" morning energy → "You've reported low energy three mornings in a row. This sometimes indicates under-recovery. Would you like to review your evening protocol?"
- Example: After a week of consistent "Well/Great" sleep → "Your sleep pattern has been strong this week. Your current protocol is working — keep it steady."
- These appear as cards on the Home screen, not as push notifications
- Maximum 2 per week. Restraint is critical.

### Evening Reflection
**Trigger:** 2 hours before typical sleep time
**Duration:** <20 seconds
**Format:** Single screen

```
Evening check-in

How was your focus today?
[Scattered]  [Variable]  [Good]  [Locked in]

Energy through the afternoon?
[Crashed]  [Dipped]  [Steady]  [Strong]

Did you follow your protocol today?
[Fully]  [Mostly]  [Partially]  [Skipped]

[Done]
```

- Three questions. All tap-only.
- After submission: "Your evening protocol: Magnesium L-threonate + Apigenin, 90 minutes before bed."
- No judgment on "Skipped." The system notes it and moves on.

### Good Day Experience
- Morning prompt → green-tinted acknowledgment → protocol reminder at configured times → no contextual nudge → evening check-in → "Consistent day. Keep building."
- The product is nearly invisible on good days. This is intentional.

### Stressed Day Experience
- Morning prompt: user reports "Low" or "Flat" → contextual morning note: "Stress compounds across days. Your protocol is designed to buffer this — don't skip the afternoon dose."
- Midday: No extra notification. The morning note is enough.
- Evening check-in: If focus was "Scattered" → "Noted. Single off-days don't indicate protocol failure. We look at weekly patterns."

### Low-Energy Day Experience
- Morning prompt: "Low" energy + "Poorly" sleep → "Low energy after poor sleep is expected. Consider: shorter focus blocks today, keep your afternoon protocol, and prioritize your evening protocol tonight."
- No additional nudges. The product acknowledges and adapts, not lectures.

### Post-Bad-Sleep Day Experience
- Morning prompt response includes: "Sleep disruption affects focus and mood for 24–48 hours. Your protocol supports recovery — today is about mitigation, not optimization."
- Evening check-in may include one extra question: "Were you able to follow your wind-down routine?" — to capture whether the feedback loop is intact.

### Weekly Review
**Trigger:** Sunday evening or Monday morning (user preference)
**Format:** Multi-screen scroll

```
WEEK IN REVIEW

Sleep quality
▰▰▰▰▰▱▱  — 5 of 7 nights rated "Well" or better
Trend: Improving ↑

Focus consistency
▰▰▰▰▱▱▱  — 4 of 7 days rated "Good" or better
Trend: Stable →

Protocol adherence
▰▰▰▰▰▰▱  — 6 of 7 days "Fully" or "Mostly"
Trend: Strong

Pattern detected
"Your best focus days followed nights where
you completed your evening protocol before
10pm."

[See detailed insights →]

Protocol status: No changes recommended
Your next review: in 7 days
```

- One headline metric, three supporting metrics, one pattern insight
- No charts in the summary — charts live in Insights for those who want them
- Clean, typographic, minimal

---

## 8. Personalization Logic

### Recommendation Engine — Hybrid Model

**Layer 1: Archetype Mapping**
The assessment maps users to one of 6–8 state-pattern archetypes. These are internal system constructs, never exposed to the user. Examples:
- Sustained Activator (high output, poor downshift)
- Fragmented Sleeper (good energy, disrupted sleep architecture)
- Sympathetic Dominant (stress-driven, under-recovered)
- Flat Liner (low energy, low variability, possible burnout pattern)

Each archetype has a base protocol — a starting recommendation with evidence-backed compounds and timing.

**Layer 2: Modifier Rules**
Structured rules adjust the base protocol:
- Stimulant sensitivity → adjust caffeine-adjacent compounds, lower doses, shift timing
- Training load → add recovery-supporting compounds, adjust evening timing
- Medication flags → exclude contraindicated compounds (hard rules, non-negotiable)
- Pregnancy flag → exclude all except explicitly safe options (or recommend "no protocol — consult your provider")
- Sleep-onset difficulty → emphasize evening protocol, de-emphasize morning stimulating compounds

**Layer 3: Feedback Adaptation**
After 2+ weeks of check-in data:
- If sleep metrics improve but focus doesn't → adjust morning protocol (not evening)
- If adherence is low on one time slot → simplify that slot or suggest timing change
- If subjective ratings plateau → suggest guided reassessment of one dimension

**Adaptation cadence:**
- Week 1–2: No changes. Establish baseline.
- Week 3–4: First potential adjustment, based on check-in patterns. Always explained.
- Monthly: Full protocol review prompt. User can accept, defer, or request chat with guide.

### User Control

**Locked (non-adjustable by user):**
- Safety exclusions (contraindicated compounds)
- Dose ceilings (user cannot increase beyond recommended maximum)
- Timing constraints tied to safety (e.g., stimulating compounds not recommended after 2pm for sensitive users)

**Adjustable by user:**
- Reminder times (within a reasonable window)
- Protocol start date
- Skipping individual items (logged but not penalized)
- Requesting a reassessment

**Adjustable with guidance:**
- Dose adjustments within safe range (chatbot explains tradeoffs)
- Swapping compounds within the same functional category (chatbot explains differences)
- Adding a new goal dimension (triggers partial reassessment)

### Trust Communication
When the protocol changes:
- Always show what changed
- Always show why (linked to specific check-in data)
- Always show what to expect from the change
- Always allow the user to revert or defer
- Never change silently

---

## 9. Chatbot / Conversational Guide

### Identity
Name: "Guide" (never given a human name)
Role: An informed interpreter — not a doctor, not a coach, not a friend.
Tone: Precise, calm, helpful. Slightly formal. Never casual ("hey!"), never clinical ("based on the literature..."). Neutral warmth.

### Where it lives
- Subtle icon in the top-right corner of every screen (small circle, not a chat bubble)
- Contextual prompts within Protocol detail: "Have a question about this? Ask our guide."
- Prompted during adjustment notifications: "Want to understand this change?"
- Available from the profile screen for protocol questions

### When it appears proactively
- After assessment completion: "Any questions about your profile before we continue?"
- After first protocol adjustment: "We've made a change. Want to understand why?"
- After 3+ days of low ratings: "You've had a tough stretch. Want to talk through what might help?"
- Never more than once per day proactively. Usually less.

### What it should say (sample interactions)

**Interaction 1: Understanding a recommendation**
```
User: Why L-tyrosine and not caffeine?

Guide: Your profile suggests moderate-high stimulant sensitivity. Caffeine
would support alertness but risks disrupting your sleep — which is already
a friction point. L-tyrosine supports dopamine synthesis for focus without
the adrenergic stimulation. It's a cleaner input for your pattern.

Want to know more about how L-tyrosine works?
```

**Interaction 2: Wanting to change something**
```
User: Can I take the magnesium earlier, like after dinner?

Guide: You can. The current timing — 90 minutes before bed — is calibrated
to align with your natural melatonin onset window. Taking it earlier (say,
with dinner at 7pm) would still be effective but slightly less optimally
timed. If it's easier to remember with dinner, the tradeoff is small.

Would you like me to update your reminder timing?
```

**Interaction 3: Reporting a concern**
```
User: I've been getting headaches since starting the protocol.

Guide: That's worth noting. Headaches can sometimes occur when starting
L-tyrosine, particularly if you're sensitive to changes in dopamine
metabolism, or if hydration has decreased.

Two things I'd recommend:
1. Ensure you're drinking adequate water — L-tyrosine can mildly
   increase water needs.
2. If headaches persist beyond 3–4 days, we should reduce the dose
   or pause that compound.

I'm flagging this in your profile so we track it. Would you like to
reduce the dose now or monitor for another few days?
```

**Interaction 4: Off-scope question**
```
User: Should I stop taking my SSRI?

Guide: I can't advise on prescription medications — that's a conversation
for your prescribing doctor. What I can do is ensure your Morning Form
protocol doesn't include anything that interacts with SSRIs.

If you'd like, I can review your current protocol for any interaction
flags with your medication.
```

### What it explicitly refuses
- Diagnosing conditions
- Advising on prescription medication changes
- Making claims about curing or treating medical conditions
- Providing emergency mental health support (redirects to crisis resources)
- Giving specific medical advice ("should I see a doctor?" → "If you're concerned, yes — and here's how to frame the conversation")

### Handoff patterns
- "Want to understand the science?" → links to Library article
- "This is beyond what I can help with" → links to support contact
- "You might want to discuss this with your doctor" → offers a printable protocol summary for medical conversations

---

## 10. Visual System Direction

### Overall Visual Mood
Clinical calm meets editorial luxury. Think: the waiting room of a premium longevity clinic designed by a Scandinavian architecture firm. Everything is intentional. Nothing is decorative.

### Color Philosophy

**Primary palette:**
- **Background:** Off-white (#FAFAF8) — warm enough to avoid sterile, cool enough to avoid cozy
- **Surface:** White (#FFFFFF) for cards and elevated elements
- **Primary text:** Near-black (#1A1A1A) — high contrast, never pure black
- **Secondary text:** Dark gray (#6B6B6B) — for supporting information
- **Tertiary text:** Medium gray (#9B9B9B) — for timestamps, labels, metadata

**Accent palette (minimal use):**
- **Primary accent:** Deep teal (#1A3A3A) — used for CTAs, active states, and the protocol timeline. Calm authority.
- **Positive signal:** Muted sage (#4A6B5A) — for positive trends, good states. Never bright green.
- **Caution signal:** Warm amber (#8B6B3A) — for warnings, adjustments. Never alarming orange.
- **Alert signal:** Deep clay (#8B4A3A) — for safety flags, contraindications. Serious but not panic-red.

**Dark mode (future):**
- Background: #0A0A0A
- Surface: #1A1A1A
- Text inverts. Accents remain similar but slightly desaturated.

**What to avoid:**
- Gradients (except extremely subtle background washes)
- Neon or saturated colors
- Blue-heavy palettes (reads as generic health-tech)
- Green-heavy palettes (reads as wellness/organic)

### Typography Philosophy

**Typeface direction:**
- Headlines: A refined, slightly editorial serif or geometric sans — something like Söhne, GT America, or Styrene A. Weight contrast is the primary expressive tool.
- Body: A clean, highly legible sans-serif at slightly generous sizing. Inter, Suisse Int'l, or similar.
- Monospace accents: For data, doses, timestamps — a clean monospace like JetBrains Mono or SF Mono. Used sparingly to signal precision.

**Hierarchy:**
- Page title: 28–32px, medium weight, tight tracking
- Section header: 20–22px, medium weight
- Card title: 16–18px, medium weight
- Body: 15–16px, regular weight, generous line-height (1.55–1.65)
- Caption/label: 12–13px, medium weight, slightly wider tracking, uppercase for labels only

**Rules:**
- Maximum two type sizes per screen (excluding labels/captions)
- Headlines are always the dominant visual element
- No bold body text — use weight contrast at the heading level only
- Line length capped at ~65 characters for readability

### Spacing System
- Base unit: 8px
- Component internal padding: 16–24px
- Section spacing: 48–64px
- Screen margins: 20px (mobile), 40px (tablet+)
- Generous vertical spacing between question groups in assessment
- Cards have 24px internal padding, 16px gap between cards

### Density
- Low density by default. One thought per screen in assessment.
- Protocol detail can be medium density — the user is seeking information.
- Insights can be medium-high density — the user is exploring data.
- Never high density on the Home screen.

### Imagery Guidance
- No stock photography. Ever.
- No illustrations of people, bodies, or brains.
- Abstract: If imagery is used, it should be abstract — subtle gradients, topographic textures, or quietly generative patterns. Think: album art for ambient electronic music.
- Photography: If used on the landing page, it should be architectural, textural, or material — close-ups of stone, water, light through glass. Not people exercising.
- Preferred approach: No imagery in the core product. Let typography, color, and space do the work.

### Motion Principles
- All transitions: 200–350ms, ease-out
- Page transitions: subtle fade or gentle slide (no bounces, no zooms)
- Micro-interactions: button press states (scale 0.98, 100ms), toggle animations, check-in selections
- Processing screen: typographic animation — lines appearing sequentially, characters resolving
- No parallax. No scroll-jacking. No particle effects.
- Loading states: thin progress lines or subtle opacity pulses. Never spinners.

### Component Style

**Cards:**
- White surface on off-white background
- 1px border: #E5E5E3 (barely visible, creates subtle lift)
- Border-radius: 12px
- No shadows (or extremely subtle: 0 1px 3px rgba(0,0,0,0.04))
- Hover state (web): border darkens to #CCCCCC

**Buttons:**
- Primary: Deep teal background, white text, 12px border-radius, 48px height
- Secondary: Transparent with 1px border, dark text
- No gradient buttons. No rounded-pill buttons. No icon-only buttons in primary actions.

**Form inputs:**
- Clean bottom-border style or subtle contained field
- 48px height minimum (touch-friendly)
- Label above, never inside (no floating labels)
- Validation: inline, calm, specific

**Selectors (assessment cards):**
- Large tap targets (minimum 56px height)
- Selected state: deep teal border + subtle teal background tint
- Unselected: light border, neutral background
- Transition: 150ms

### Iconography
- Line icons, 1.5px stroke weight
- Minimal set — only where icons genuinely aid comprehension
- No filled icons. No colored icons. No emoji as icons.
- Custom icon set preferred over a generic library
- Used for: navigation tabs, protocol timing indicators, trend arrows, safety flags

### Chart Style
- Minimal axes. No gridlines by default.
- Trend lines: 2px, smooth curves, protocol accent color
- Data points: small circles (6px), visible on hover/tap
- Bar charts: rounded tops (4px radius), muted fill, teal for current week
- Labels: caption-size, gray, positioned cleanly
- No 3D. No area fills. No multi-colored legends.
- Charts should feel like editorial data visualization, not a dashboard.

### Surfaces / Materiality
- Flat design with barely-perceptible depth
- Cards are the primary elevated surface
- Modal overlays: dark scrim (rgba(0,0,0,0.5)), white modal surface, 16px border-radius
- Bottom sheets (mobile): gentle spring animation, rounded top corners
- No glass-morphism. No blur effects. No textured backgrounds.

---

## 11. Screen Inventory

### V1 Required Screens

| # | Screen | Purpose | Priority | Major UI Modules | Key States |
|---|--------|---------|----------|-----------------|------------|
| 1 | **Landing Page** | Convert visitor to assessment start | P0 | Hero statement, value prop blocks, single CTA | Default, scrolled |
| 2 | **Onboarding Intro** (3 screens) | Set expectations before assessment | P0 | Statement text, progress dots, continue CTA | Screens 1/2/3 |
| 3 | **Assessment — Card Select** | Capture categorical answers | P0 | Question text, card options, progress bar, back/continue | Default, selected, error |
| 4 | **Assessment — Slider** | Capture spectrum answers | P0 | Question text, labeled slider, progress bar | Default, adjusted |
| 5 | **Assessment — Multi-select** | Capture multi-option answers | P0 | Question text, chip grid, progress bar | Default, selections made |
| 6 | **Assessment — Time Picker** | Capture schedule data | P0 | Question text, scroll wheel, progress bar | Default, time set |
| 7 | **Assessment — Free Text** | Capture medications/notes | P0 | Question text, text input, skip option, progress bar | Empty, filled, skipped |
| 8 | **Assessment — Section Transition** | Signal new question group | P0 | Section title, brief description, continue | Default |
| 9 | **Account Creation** | Capture email/password post-assessment | P0 | Email/password fields, SSO option, privacy note | Default, error, loading |
| 10 | **Processing / Analysis** | Build anticipation before reveal | P0 | Animated text sequence, dark background | Animating, complete |
| 11 | **State Profile** | Show user their inferred patterns | P0 | Profile summary, key observations, constraints | Default |
| 12 | **Protocol Overview** | Show recommended protocol | P0 | Time-block protocol cards, see-detail link | Default |
| 13 | **Protocol Rationale** | Explain why this protocol | P0 | Paragraph explanation, confidence signal | Default |
| 14 | **What to Expect** | Set timeline expectations | P0 | Week-by-week timeline, what it doesn't do | Default |
| 15 | **Begin / Confirm** | Start the protocol | P0 | Primary CTA, alternative protocol link, guide link | Default |
| 16 | **Habit Setup** | Configure timing anchors | P0 | Wake/wind-down time selectors, daily timeline preview | Default, configured |
| 17 | **Home** | Today's relevant information | P0 | Next action card, quick check-in entry, contextual nudge card, weekly summary card | Morning, afternoon, evening, post-check-in |
| 18 | **Morning Check-in** | Capture morning state | P0 | Sleep rating, current feeling, done CTA | Default, completed |
| 19 | **Evening Check-in** | Capture end-of-day state | P0 | Focus rating, energy rating, adherence rating, done CTA | Default, completed |
| 20 | **Protocol Detail** | Full protocol with explanations | P0 | Protocol timeline, individual item cards (expandable), guide link | Collapsed, expanded |
| 21 | **Protocol Item Detail** | Deep dive on single compound | P1 | Compound name, dose, timing, mechanism, evidence, safety notes | Default |
| 22 | **Insights — Weekly Review** | Summarize the week | P0 | Headline metric, supporting metrics, pattern insight, protocol status | Default, first-week (insufficient data) |
| 23 | **Insights — Trends** | Longer-term data views | P1 | Toggle: 7d/30d/90d, trend charts (sleep, focus, energy), adherence | Default, insufficient data |
| 24 | **Chatbot / Guide** | Conversational support | P0 | Message thread, input field, suggested prompts | Empty, active conversation, proactive prompt |
| 25 | **Profile (You)** | Account and state profile | P1 | State profile summary, goals, constraints, settings links | Default |
| 26 | **Settings** | Account and notification management | P1 | Notification prefs, data export, account, help link | Default |
| 27 | **Safety / Constraints** | View and edit safety data | P1 | Medication list, conditions, allergies, edit capability | Default, editing |
| 28 | **Protocol Adjustment Notification** | Communicate a protocol change | P0 | What changed, why, what to expect, accept/defer/revert | Default |
| 29 | **Library Article** | Educational content | P1 | Article title, body text, related protocol link | Default |
| 30 | **Empty State — Insights** | Before enough data exists | P0 | Explanation text, timeline to first review | Default |
| 31 | **Error / Offline** | Handle connectivity issues | P1 | Simple message, retry option | Offline, error |

---

## 12. Wireframe-Level Flow

### Landing Page

```
┌─────────────────────────────┐
│                             │
│  [Logo: MORNING FORM]       │ ← Top-left, minimal mark
│                             │
│                             │
│                             │
│  A system for              │
│  understanding your state.  │ ← Hero text: large serif/geometric
│                             │    28–36px, centered or left-aligned
│                             │
│  Morning Form assesses your │
│  patterns, builds a         │ ← Subtext: 16px, secondary color
│  personalized protocol, and │    max-width 480px
│  adapts with you over time. │
│                             │
│                             │
│  ┌──────────────────────┐   │
│  │  Begin Assessment →  │   │ ← Primary CTA, deep teal
│  └──────────────────────┘   │
│                             │
│  8 minutes · free ·        │ ← Caption text, gray
│  no commitment              │
│                             │
├─────────────────────────────┤ ← Scroll reveals
│                             │
│  THE PROBLEM                │ ← Section label, uppercase, small
│                             │
│  You've tried supplements,  │
│  tracked your sleep, read   │
│  the research. But nothing  │
│  connects into a system.    │
│                             │
├─────────────────────────────┤
│                             │
│  HOW IT WORKS               │
│                             │
│  1. Assess                  │ ← Three steps, minimal
│     8-minute intake         │
│                             │
│  2. Protocol                │
│     Personalized to your    │
│     state patterns          │
│                             │
│  3. Adapt                   │
│     Daily feedback refines  │
│     your protocol over time │
│                             │
├─────────────────────────────┤
│                             │
│  NOT A SUPPLEMENT BRAND.    │ ← Statement block, bold
│  A STATE SYSTEM.            │
│                             │
│  We don't sell products     │
│  through quizzes. We build  │
│  protocols through data.    │
│                             │
│  ┌──────────────────────┐   │
│  │  Begin Assessment →  │   │ ← Repeated CTA
│  └──────────────────────┘   │
│                             │
│  [Privacy] [About] [Contact]│ ← Footer, minimal
│                             │
└─────────────────────────────┘
```

### Onboarding (3 screens)

**Screen 1:**
```
┌─────────────────────────────┐
│                     [Skip →]│
│                             │
│                             │
│  Morning Form builds a      │
│  protocol around your       │ ← Large text, centered
│  biology, not around a      │
│  product catalog.           │
│                             │
│                             │
│        ● ○ ○                │ ← Progress dots
│                             │
│  ┌──────────────────────┐   │
│  │     Continue →        │   │
│  └──────────────────────┘   │
│                             │
└─────────────────────────────┘
```

**Screen 2:**
```
  The assessment takes
  8 minutes. Your answers
  shape everything.
        ○ ● ○
```

**Screen 3:**
```
  Your data stays yours.
  We explain every
  recommendation.
        ○ ○ ●
    [Begin Assessment →]
```

### Assessment — Card Select (Example: Primary Goal)

```
┌─────────────────────────────┐
│ ▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱      │ ← Thin progress line, top
│                             │
│  WHAT BRINGS YOU HERE       │ ← Section label, first time
│                             │
│  What's your primary goal?  │ ← Question, 20px
│                             │
│  ┌───────────────────────┐  │
│  │ I want to focus more  │  │ ← Card option, 56px+ height
│  │ consistently           │  │    1px border, 12px radius
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ I want to sleep       │  │
│  │ better                │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ I want to recover     │  │ ← Selected: teal border +
│  │ faster                │  │    subtle teal bg tint
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ I want to feel more   │  │
│  │ regulated             │  │
│  └───────────────────────┘  │
│                             │
│  [more options scroll]      │
│                             │
│  ┌──────────────────────┐   │
│  │     Continue →        │   │ ← Enabled only when selected
│  └──────────────────────┘   │
│                             │
└─────────────────────────────┘
```

### Assessment — Slider (Example: Sleep Quality)

```
┌─────────────────────────────┐
│ ▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱      │
│                             │
│  How would you rate your    │
│  typical sleep quality?     │
│                             │
│                             │
│  Poor                Great  │
│  ├────────●─────────────┤   │ ← Custom slider, large thumb
│                             │
│                             │
│  ┌──────────────────────┐   │
│  │     Continue →        │   │
│  └──────────────────────┘   │
│                             │
└─────────────────────────────┘
```

### Assessment — Multi-select Chips (Example: What You've Tried)

```
┌─────────────────────────────┐
│ ▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱      │
│                             │
│  What have you tried        │
│  before? Select all that    │
│  apply.                     │
│                             │
│  ┌──────────┐ ┌──────────┐  │
│  │ Caffeine │ │Melatonin │  │ ← Pill chips, toggleable
│  │management│ │          │  │    Selected: teal fill
│  └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐  │
│  │Adaptogens│ │Nootropics│  │
│  └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐  │
│  │Breathwork│ │  Cold     │  │
│  │          │ │ exposure  │  │
│  └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐  │
│  │Meditation│ │ Therapy  │  │
│  └──────────┘ └──────────┘  │
│  ┌──────────────────────┐   │
│  │ Nothing specific     │   │
│  └──────────────────────┘   │
│                             │
│  ┌──────────────────────┐   │
│  │     Continue →        │   │
│  └──────────────────────┘   │
│                             │
└─────────────────────────────┘
```

### Processing / Analysis

```
┌─────────────────────────────┐
│                             │
│           (dark bg)         │
│                             │
│                             │
│                             │
│                             │
│   Analyzing your state      │ ← Appears at t=0, light text
│   patterns                  │    Letters resolve subtly
│                             │
│   Mapping sensitivities     │ ← Appears at t=2s
│                             │
│   Building your protocol    │ ← Appears at t=4s
│                             │
│                             │
│                             │
│                             │
│                             │
│                             │ ← Auto-advances at t=8s
│                             │
└─────────────────────────────┘
```

### State Profile

```
┌─────────────────────────────┐
│                             │
│  YOUR STATE PROFILE         │ ← Large heading
│                             │
│  ─────────────────────────  │
│                             │
│  Primary pattern            │ ← Label, small, uppercase
│                             │
│  Sustained activation       │ ← Description, 18px
│  with impaired downshift    │
│                             │
│  You maintain high output   │ ← Explanation, 15px, gray
│  during the day but         │
│  struggle to transition     │
│  into rest. Your system     │
│  stays "on" longer than     │
│  it should.                 │
│                             │
│  ─────────────────────────  │
│                             │
│  Key observations           │
│                             │
│  · High afternoon energy    │ ← Bullet list, clean
│    but poor sleep onset     │
│  · Stimulant sensitivity:   │
│    moderate-high            │
│  · Recovery perception:     │
│    below baseline           │
│  · Stress pattern: constant │
│    low-level elevation      │
│                             │
│  ─────────────────────────  │
│                             │
│  Constraints noted          │
│                             │
│  · Caffeine cutoff          │ ← Amber accent for constraints
│    recommended before 1pm   │
│  · No contraindicated       │
│    conditions flagged       │
│                             │
│  ┌──────────────────────┐   │
│  │     Continue →        │   │
│  └──────────────────────┘   │
│                             │
└─────────────────────────────┘
```

### Home Screen

```
┌─────────────────────────────┐
│  MORNING FORM       [Guide] │ ← Logo left, guide icon right
│                             │
│  Good morning, [Name].      │ ← Time-aware greeting
│  Thursday, March 26         │
│                             │
│  ┌───────────────────────┐  │
│  │  MORNING CHECK-IN     │  │ ← Card, teal left border
│  │                       │  │
│  │  How did you sleep?   │  │
│  │  How are you feeling? │  │
│  │                       │  │
│  │  [Start check-in →]   │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  NEXT UP              │  │ ← Protocol action card
│  │                       │  │
│  │  Morning protocol     │  │
│  │  L-tyrosine 500mg +   │  │
│  │  Alpha-GPC 300mg      │  │
│  │                       │  │
│  │  Before breakfast      │  │
│  │                       │  │
│  │  [View detail →]      │  │
│  └───────────────────────┘  │
│                             │
│  (After check-in, contextual│
│   note appears here if      │
│   relevant — e.g., poor     │
│   sleep guidance)           │
│                             │
│                             │
│ ┌─────┬────────┬───────┬────┬───┐
│ │Home │Protocol│Check  │Ins.│You│ ← Bottom nav
│ │  ●  │       │  -in  │    │   │
│ └─────┴────────┴───────┴────┴───┘
└─────────────────────────────┘
```

### Morning Check-in

```
┌─────────────────────────────┐
│                      [×]    │ ← Close returns to home
│                             │
│  Morning check-in           │
│                             │
│                             │
│  How did you sleep?         │
│                             │
│  ┌──────┐┌────┐┌────┐┌─────┐
│  │Poorly││ OK ││Well││Great│ ← Large tap targets
│  └──────┘└────┘└────┘└─────┘    Single select, horizontal
│                             │
│                             │
│  How are you feeling        │
│  right now?                 │
│                             │
│  ┌────┐┌────┐┌──────┐┌─────┐
│  │Low ││Flat││Steady││Sharp│
│  └────┘└────┘└──────┘└─────┘
│                             │
│                             │
│  ┌──────────────────────┐   │
│  │       Done ✓         │   │
│  └──────────────────────┘   │
│                             │
└─────────────────────────────┘
```

### Post-Check-in Home State (poor sleep example)

```
┌─────────────────────────────┐
│  MORNING FORM       [Guide] │
│                             │
│  Good morning.              │
│  Thursday, March 26         │
│                             │
│  ┌───────────────────────┐  │
│  │  ✓ Check-in complete  │  │ ← Completed state, muted
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  After poor sleep,    │  │ ← Contextual guidance card
│  │  your focus window    │  │    Warm amber left border
│  │  may be shorter today.│  │
│  │  Consider front-      │  │
│  │  loading important    │  │
│  │  work.                │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  MORNING PROTOCOL     │  │
│  │                       │  │
│  │  L-tyrosine 500mg +   │  │
│  │  Alpha-GPC 300mg      │  │
│  │  Before breakfast      │  │
│  │                       │  │
│  │  [View detail →]      │  │
│  └───────────────────────┘  │
│                             │
│ ┌─────┬────────┬───────┬────┬───┐
│ │Home │Protocol│Check  │Ins.│You│
│ │  ●  │       │  -in  │    │   │
│ └─────┴────────┴───────┴────┴───┘
└─────────────────────────────┘
```

### Weekly Review

```
┌─────────────────────────────┐
│                      [×]    │
│                             │
│  WEEK IN REVIEW             │
│  March 20–26                │
│                             │
│  ─────────────────────────  │
│                             │
│  Sleep quality              │
│  ▰▰▰▰▰▱▱                   │ ← 5/7 visual bar
│  5 of 7 nights rated        │
│  "Well" or better           │
│  Trend: Improving ↑         │ ← Sage green arrow
│                             │
│  ─────────────────────────  │
│                             │
│  Focus consistency          │
│  ▰▰▰▰▱▱▱                   │
│  4 of 7 days rated          │
│  "Good" or better           │
│  Trend: Stable →            │
│                             │
│  ─────────────────────────  │
│                             │
│  Protocol adherence         │
│  ▰▰▰▰▰▰▱                   │
│  6 of 7 days "Fully"       │
│  or "Mostly"                │
│  Trend: Strong              │
│                             │
│  ─────────────────────────  │
│                             │
│  PATTERN DETECTED           │
│                             │
│  Your best focus days       │ ← Highlighted card
│  followed nights where you  │
│  completed your evening     │
│  protocol before 10pm.      │
│                             │
│  ─────────────────────────  │
│                             │
│  Protocol status            │
│  No changes recommended     │
│  Next review: in 7 days     │
│                             │
│  ┌──────────────────────┐   │
│  │  See detailed trends →│   │
│  └──────────────────────┘   │
│                             │
└─────────────────────────────┘
```

### Chatbot / Guide

```
┌─────────────────────────────┐
│  ← Back              Guide  │
│                             │
│  ┌───────────────────────┐  │
│  │ I'm your protocol     │  │ ← Guide intro (first time)
│  │ guide. I can explain  │  │
│  │ recommendations,      │  │
│  │ answer questions, and │  │
│  │ help adjust your      │  │
│  │ protocol.             │  │
│  └───────────────────────┘  │
│                             │
│  Suggested:                 │
│  ┌──────────────────────┐   │
│  │Why this protocol?    │   │ ← Suggestion chips
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │Can I adjust timing?  │   │
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │What should I expect? │   │
│  └──────────────────────┘   │
│                             │
│                             │
│                             │
│                             │
│  ┌───────────────────┐ [→]  │
│  │ Ask a question... │      │ ← Input field + send
│  └───────────────────┘      │
└─────────────────────────────┘
```

### Protocol Adjustment Notification

```
┌─────────────────────────────┐
│                             │
│  PROTOCOL UPDATE            │
│  March 26                   │
│                             │
│  ─────────────────────────  │
│                             │
│  What changed               │
│                             │
│  Your evening protocol      │
│  timing has been adjusted   │
│  from 90 to 60 minutes      │
│  before bed.                │
│                             │
│  ─────────────────────────  │
│                             │
│  Why                        │
│                             │
│  Your check-ins suggest     │ ← Connected to user data
│  you're consistently        │
│  taking the evening dose    │
│  late. Moving the window    │
│  closer makes adherence     │
│  easier without             │
│  significantly impacting    │
│  effectiveness.             │
│                             │
│  ─────────────────────────  │
│                             │
│  What to expect             │
│                             │
│  No change in effect.       │
│  Slightly easier to         │
│  maintain your routine.     │
│                             │
│  ┌──────────────────────┐   │
│  │    Accept change →    │   │ ← Primary
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │    Keep current       │   │ ← Secondary
│  └──────────────────────┘   │
│                             │
│  [Ask guide about this →]   │ ← Tertiary link
│                             │
└─────────────────────────────┘
```

---

## 13. Safety and Trust Layer

### Design Philosophy
Safety moments should feel like the system demonstrating intelligence and care — not like legal disclaimers or scare screens. A well-designed safety intervention *increases* trust.

### Contraindication Flags

**During assessment:**
When a user indicates a condition or medication that creates a contraindication:
- The assessment does not stop or alarm
- A subtle note appears below the input: "Noted. We'll account for this in your protocol."
- Internally, the system flags relevant compounds for exclusion

**During protocol reveal:**
If a constraint limits the protocol:
- Show in the "Constraints noted" section of the State Profile
- Frame positively: "Based on your thyroid condition, we've excluded compounds that may affect thyroid function."
- Do not list what was excluded — the user doesn't need to mourn options they never had

**If a new flag is added later:**
- System prompts a protocol review
- Notification: "You've updated your health information. We've reviewed your protocol for compatibility. [See changes]"

### Pregnancy / Planning Pregnancy

**Assessment response:**
- If "Yes" or "Prefer not to say" → system defaults to the most conservative path
- Protocol may be: "We recommend pausing supplementation and consulting your healthcare provider. Morning Form can support you with: sleep hygiene guidance, stress regulation techniques, and schedule optimization — all non-supplement."

**UX treatment:**
```
┌───────────────────────┐
│                       │
│  Given your current   │
│  situation, we        │
│  recommend a          │
│  non-supplement       │
│  protocol focused on  │
│  behavioral           │
│  optimization.        │
│                       │
│  This includes:       │
│  · Sleep scheduling   │
│  · Stress regulation  │
│  · Light exposure     │
│    guidance           │
│                       │
│  We can revisit       │
│  supplementation      │
│  when you're ready.   │
│                       │
│  [Continue with       │
│   behavioral          │
│   protocol →]         │
│                       │
└───────────────────────┘
```

Calm. No alarm. No red flags. Just clear, intelligent constraint.

### Medication Interactions

- During assessment: "We ask about medications to ensure your protocol is safe. We never share this information."
- If "Prefer not to say": system uses a conservative protocol that avoids compounds with common interaction risks
- Guide chatbot can discuss general interaction categories but always defers: "For specific medication questions, please consult your prescribing physician."

### "Not for you right now" Moments

When the system determines it cannot responsibly recommend a protocol:
- No dramatic warning screen
- A calm, clear message:

```
  Based on your responses, we're not able to
  recommend a supplement protocol at this time.

  This isn't a rejection — it's a responsibility.

  We can still support you with behavioral
  protocols, or you can revisit after consulting
  with your healthcare provider.

  [Explore behavioral protocols →]
  [Contact support →]
```

### Overuse Prevention
- The system tracks adherence but also flags if a user reports taking *more* than recommended
- Guide chatbot: "I notice you mentioned taking a double dose. More isn't more with this protocol — the doses are calibrated. Taking more than recommended doesn't increase effectiveness and may cause side effects."
- If overuse pattern persists: surface a gentle but firm card on Home

### When the System Should Say Less
- After a user's first "bad week" — don't over-explain or offer too many adjustments. "One week doesn't define a pattern. Stay the course."
- When the user is clearly just checking in quickly — don't interrupt with insights
- Late at night — no nudges, no suggestions. Silence is appropriate.
- During the first 48 hours — no feedback, no analysis. "We're gathering baseline data."

---

## 14. Data Capture Strategy

### Onboarding (Assessment)
| Data Point | Method | Friction Level |
|---|---|---|
| Primary goal | Card select | Very low |
| Friction point | Card select | Very low |
| Previous interventions | Multi-select chips | Low |
| Wake/sleep times | Time picker | Low |
| Sleep quality | Slider | Very low |
| Sleep onset latency | Card select | Very low |
| Night waking | Card select | Very low |
| Morning/afternoon energy | Slider | Very low |
| Caffeine habits | Card select + time picker | Low |
| Training frequency/type/time | Card select + chips | Low |
| Recovery perception | Slider | Very low |
| Stress level/pattern | Slider + card select | Low |
| Anxiety frequency | Card select | Very low |
| Stimulant sensitivity | Card select | Very low |
| Wind-down ability | Slider | Very low |
| Current supplements | Multi-select chips + text | Medium |
| Current medications | Free text (optional) | Medium |
| Alcohol frequency | Card select | Very low |
| Diet pattern | Card select | Very low |
| Health conditions | Multi-select + text | Medium |
| Allergies | Chips + text | Low |
| Pregnancy status | Card select | Very low |
| Open notes | Free text (optional) | Low |

### Daily Use
| Data Point | Method | Frequency | Friction |
|---|---|---|---|
| Sleep quality (subjective) | 4-option tap | Daily AM | <3 seconds |
| Morning state | 4-option tap | Daily AM | <3 seconds |
| Focus quality | 4-option tap | Daily PM | <3 seconds |
| Afternoon energy | 4-option tap | Daily PM | <3 seconds |
| Protocol adherence | 3-option tap | Daily PM | <3 seconds |

### Protocol Feedback (Periodic)
| Data Point | Method | Frequency | Friction |
|---|---|---|---|
| Specific compound feedback | Slider + optional text | Weekly (1 compound) | 15 seconds |
| Side effect report | Prompted card select | On-demand via guide | 30 seconds |
| Timing satisfaction | Card select | Bi-weekly | 10 seconds |

### Weekly Review (Passive)
- Aggregated from daily check-ins — no additional input required
- User can optionally add a note: "Anything else about this week?" (free text, always skippable)

### Future Hardware Integration Points
The data model should be designed to accommodate:
- Continuous HRV data (wearable)
- Sleep stage data (sleep tracker)
- Skin conductance / galvanic skin response
- Temperature variation
- Blood biomarkers (periodic)

These would augment, not replace, subjective check-ins. The subjective layer remains important — hardware tells you *what* happened; the user tells you *how it felt*.

**Data architecture note:** All subjective data should be timestamped, tagged with protocol version, and linked to the user's current state profile. This enables retrospective analysis when hardware data becomes available.

---

## 15. V1 Scope

### In V1

**Core flow:**
- Landing page
- 3-screen onboarding
- Full assessment (28–34 questions)
- Account creation (post-assessment)
- Processing transition
- State profile reveal
- Protocol recommendation (1 primary protocol)
- "Why this protocol" rationale
- "What to expect" timeline
- Habit setup (wake/wind-down anchors)

**Daily experience:**
- Home screen (time-aware)
- Morning check-in (2 questions)
- Evening check-in (3 questions)
- Protocol reminders (push notifications)
- Contextual guidance (post-poor-sleep, post-bad-day — max 4 scenarios)

**Protocol management:**
- Protocol overview with timeline
- Protocol item detail (compound, dose, timing, mechanism)
- Protocol adjustment notifications (system-initiated, after week 3+)

**Insights:**
- Weekly review (summary + 1 pattern insight)
- 7-day trend view (sleep, focus, energy, adherence)

**Guide / Chatbot:**
- Available on all screens
- Handles: protocol questions, timing adjustments, compound explanations, side effect reports
- Explicit boundaries: will not give medical advice, will refer to support

**Safety:**
- Contraindication flags during assessment
- Medication interaction awareness
- Pregnancy pathway (behavioral-only protocol)
- Conservative defaults for "prefer not to say" responses

**Profile:**
- State profile view
- Safety/constraint management
- Notification preferences
- Account settings

### NOT in V1

- Dark mode
- 30-day or 90-day trend views
- Multiple simultaneous protocols
- Protocol comparison / A-B testing
- Library / Learn content (chatbot covers explanation needs)
- Social features
- Integration with wearables / health apps
- E-commerce / supplement purchasing
- Hardware anything
- Multi-language support
- Desktop-optimized layout (mobile-first only)
- Referral system
- Custom protocol building
- Community features

### Test Manually Behind the Scenes Before Automating

- **Protocol generation:** V1 protocols should be human-reviewed before delivery. The "processing" screen buys time. Behind the scenes, a practitioner or algorithm + human review generates the protocol. Automate only after the recommendation engine is validated against 200+ profiles.
- **Protocol adjustments:** First 100 adjustments should be human-reviewed. The system proposes; a human approves. This is invisible to the user.
- **Chatbot responses:** The guide should use a curated response library with AI fill for common variations. Fully autonomous AI responses only after the response library covers 90%+ of observed queries.
- **Pattern detection:** "Pattern detected" insights should be from a verified ruleset, not ML. ML-generated insights only after validation against subjective user confirmation.

### Biggest UX/Product Risks

1. **Assessment drop-off:** 8 minutes is long. Risk: users quit at question 15. Mitigation: make every question feel intelligent and fast. Allow save-and-return. Show progress.

2. **Protocol trust gap:** If the recommendation feels generic, the entire product fails. Mitigation: the State Profile must feel genuinely personalized. The "why" section must reference the user's specific inputs.

3. **Check-in fatigue:** Daily check-ins feel good for 2 weeks, then become a chore. Mitigation: keep them under 15 seconds. Show that they directly cause protocol improvements. Occasionally skip a day's prompt to reduce habituation.

4. **Chatbot quality floor:** A bad chatbot response destroys trust faster than no chatbot at all. Mitigation: curated response library. Explicit boundaries. "I don't know" is a valid response. Hand off to support early.

5. **Perceived stasis:** After the initial protocol reveal, the product may feel static. Mitigation: contextual daily guidance (not just reminders), weekly reviews, and protocol adjustments starting at week 3.

6. **Safety liability:** Any perception that the product gave harmful advice is existential. Mitigation: conservative defaults, explicit "not medical advice" framing, human review of edge cases, and a zero-tolerance approach to contraindication handling.

---

## 16. Creative Direction for Prototype Build

### Implementation Brief

**Target:** High-fidelity interactive prototype (Figma or Framer) covering the complete first-time user flow and first-week daily experience.

**Priority screens for prototype (in order):**

1. Landing page
2. Onboarding (3 screens)
3. Assessment — 5 representative question types (card select, slider, multi-chip, time picker, free text)
4. Assessment section transitions (2)
5. Account creation
6. Processing/analysis transition
7. State profile reveal
8. Protocol overview
9. Protocol rationale ("Why this protocol")
10. What to expect
11. Begin / confirm
12. Habit setup
13. Home screen — morning state (pre-check-in)
14. Morning check-in
15. Home screen — post-check-in (contextual guidance visible)
16. Home screen — afternoon state (next protocol visible)
17. Evening check-in
18. Home screen — evening state
19. Protocol detail (full view)
20. Weekly review
21. Guide / chatbot (3-message exchange)
22. Protocol adjustment notification

**Design system to build first:**
- Color tokens (background, surface, text hierarchy, accent palette)
- Typography scale (5 sizes + 1 monospace)
- Spacing scale (8px base)
- Card component (3 variants: action, info, contextual)
- Button component (primary, secondary, text-link)
- Selection components: card selector, horizontal option bar, chip grid, slider, time picker
- Input component (text field, with label pattern)
- Navigation bar (5-tab bottom nav)
- Progress bar (thin top line)
- Icon set (12–16 icons: home, protocol, check-in, insights, profile, guide, close, back, arrow, check, clock, alert)

**Typography recommendation for prototype:**
- Headlines: Söhne or GT America (medium weight)
- Body: Inter (regular, 15–16px)
- Data/doses: JetBrains Mono (regular, 14px)
- If licensing is a constraint: use Inter throughout with weight variation

**Color tokens:**
```
--bg:           #FAFAF8
--surface:      #FFFFFF
--border:       #E5E5E3
--text-primary: #1A1A1A
--text-secondary: #6B6B6B
--text-tertiary: #9B9B9B
--accent:       #1A3A3A
--accent-light: #F0F5F5
--positive:     #4A6B5A
--caution:      #8B6B3A
--alert:        #8B4A3A
```

**Interaction notes for prototype:**
- Assessment: one question per screen, swipe or tap to advance, smooth fade transitions
- Processing: timed text reveal (CSS animation or After Effects for prototype)
- Check-ins: immediate response on tap — selection highlights, screen acknowledges, returns to home
- Chatbot: simulated conversation with pre-written exchanges
- All transitions: 250ms ease-out

**What the prototype must prove:**
1. The assessment feels intelligent and fast, not tedious
2. The protocol reveal feels earned, personalized, and trustworthy
3. The daily loop is lightweight enough to sustain
4. The visual system communicates premium credibility without medical coldness
5. The information hierarchy works — users always know what to do next

**What the prototype does NOT need:**
- Working backend
- Real personalization logic
- Responsive breakpoints beyond mobile (375px width)
- Settings, profile editing, or account management
- Error states or offline handling
- Accessibility audit (important, but post-prototype)

**Tone check for all copy in prototype:**
- Read every string aloud. If it sounds like a wellness app, rewrite it.
- Read every string aloud. If it sounds like a medical form, rewrite it.
- The voice is: a calm, intelligent colleague who explains clearly and never oversells.

---

*This document is the strategic foundation for Morning Form V1. Every screen, interaction, and word should be pressure-tested against the UX principles in Section 2. When in doubt: less, not more. Restrain, explain, and earn trust.*
