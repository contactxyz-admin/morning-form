---
date: 2026-04-15
topic: health-graph-pivot
---

# MorningForm Health Graph — v1 Requirements

## Problem Frame

Personal health data is fragmented across GP records, lab reports, wearables, scans, apps, and memory. Existing tools either (a) show isolated biomarkers without context (health apps/dashboards), (b) answer one-off questions without retaining context (general-purpose chatbots), or (c) live inside clinical systems patients can't meaningfully query themselves. None compile a user's health data into a persistent, queryable, longitudinal record.

MorningForm pivots from a check-in + wearable dashboard to a **health-record-first knowledge graph**: a living Digital Product Passport for the body. Users port their health data in once — lab PDFs, wearable streams, free-text medical history, GP-record exports — and the product compiles it into a structured graph of symptoms, biomarkers, conditions, interventions, and records. Topic pages and a daily brief sit on top as the primary surface; an explorable graph view exposes relationships as a secondary surface; provenance is first-class so every claim traces back to its source.

The LLM is the presentation and reasoning layer, not the product. The durable asset is the compiled record.

Conceptual lineage: Karpathy's LLM Wiki gist (raw sources → compiled, interlinked knowledge base), Graphify (folders → navigable graph + wiki + Q&A), Seam's node/edge model (SUPPORTS edges for provenance, major/minor node classification by graph position). UK positioning: information + decision-support layer, not a medical device; amplifies the patient-clinician relationship rather than substituting for it.

## Requirements

**Graph Model**

- R1. The system maintains a per-user **Health Graph** composed of typed nodes (symptoms, biomarkers, conditions, medications, interventions, lifestyle factors, source documents, topic clusters) and typed edges (SUPPORTS for provenance from source chunks to nodes; associative edges between symptoms/biomarkers/interventions; temporal edges for longitudinal change).
- R2. Every substantive node carries **provenance**: at least one SUPPORTS edge to a source chunk (an intake answer, a lab line, a wearable metric window, a document excerpt). Nodes without provenance are treated as provisional and visibly marked in the UI.
- R3. Nodes are classified as **substrate** or **topic** based on graph position and confidence. Substrate nodes exist in the graph but do not produce a topic page. Topic nodes drive full topic-page rendering.

**Progressive Graph Onboarding**

- R4. Baseline intake generates a **partial Health Graph** immediately, before any document upload. Symptoms, history, medications, lifestyle factors, and goals are captured and added as nodes with provenance to the intake itself.
- R5. Completing baseline intake unlocks **tentative topic stubs** for the three v1 domains (see R12) plus a "What we know / What we need" brief showing which areas are provisional and which source types would strengthen them.
- R6. Uploading clinical evidence (lab PDF, GP-record export, scan, doctor letter) **promotes** relevant tentative topic stubs into full topic pages by attaching biomarker/evidence nodes and SUPPORTS edges. Promotion is visible in the UI as a state transition, not a silent re-render.
- R7. The product never blocks value behind upload. Intake alone produces a usable partial graph, a partial daily brief, and tentative topic stubs.

**Import Surfaces (v1)**

- R8. v1 ingests four import surfaces: **lab PDFs** (blood panels, extracted into biomarker nodes with values, units, reference ranges, collection dates), **existing wearable integrations** (Whoop/Oura/Fitbit/Dexcom/Libre — already shipped, feed the living layer), **free-text medical history** (LLM-extracted into condition/symptom/medication/event nodes with provenance back to the text), and a **GP-record import path** (pragmatic v1 form: patient-exported documents and guided import from what users can already access via the NHS App or approved patient-facing services in England).
- R9. A **hybrid structured fallback** captures essentials that users with incomplete imports must provide: current medications, known diagnoses, allergies, and primary goals. Tightly scoped conversational probes fill narrative gaps in symptom / sleep / energy / mental-health domains; probes write directly into graph nodes, not chat history.
- R10. Direct NHS-linked ingestion (GP Connect / IM1 / equivalent APIs) is **explicitly on the roadmap but not in v1**. v1 establishes the import workflow and positioning so direct integration is additive later.
- R11. Existing wearable integrations continue to operate and power the daily brief. No wearable work is deprecated by this pivot.

**Output: Topic Pages, Daily Brief, Graph View, Action Plans**

- R12. v1 ships **three full topic pages**: **Iron status** (clinical proof — ferritin, haemoglobin, transferrin saturation, MCV, related symptoms and interventions), **Sleep & recovery** (living-signal proof — wearable-informed, connects sleep architecture, HRV, RHR, subjective energy), **Energy & fatigue** (graph-native synthesis — pulls across iron, sleep, glucose, thyroid, mood, medications, symptoms, history). Inflammation, cardiometabolic, hormones, and gut exist as graph substrate in v1 but are not promoted to full pages.
- R13. Every topic page has a consistent three-section structure:
  - **Understanding** — what the relevant nodes and values mean in the context of this user's record, with inline provenance citations to source chunks.
  - **What you can do now** — non-clinical actions (diet, sleep hygiene, movement, symptom logging, retest timing prompts). No drug names, no dosages, no treatment instructions.
  - **Discuss with a clinician** — a first-class **GP appointment prep** output: specific questions to raise, relevant history to mention, follow-up tests or issues worth discussing, in a printable/shareable form.
- R14. A **daily brief** sits on the home surface. It is lightweight (wearable-informed in v1: sleep quality, recovery signal, notable deltas) and explicitly secondary to the compiled record — the durable product is the graph, not the brief.
- R15. A secondary **Health Graph view** is accessible from the home surface. It renders nodes and edges (force-directed or equivalent), lets users click any node to open its detail and provenance, and marks provisional nodes distinctly. It is not the default landing surface.
- R16. Every claim on every topic page is **traceable to its source** via inline provenance (clickable citations that open the supporting chunk: the intake answer, the lab line, the wearable metric window, the document excerpt).

**Regulatory Posture & Copy**

- R17. MorningForm's **stated intended purpose** (in labeling, copy, onboarding, marketing, and settings) is a health *information, interpretation, and decision-support* layer that helps users understand results in the context of their record, identify low-risk lifestyle actions, and prepare for clinical conversations. It is explicitly not a diagnostic tool and does not recommend treatment.
- R18. Action-plan copy never includes drug names, dosages, treatment instructions, or imperative clinical directions. Retest-timing *prompts* (e.g., "ferritin is commonly reviewed 8–12 weeks after intervention — consider discussing timing with your GP") are permitted within the "What you can do now" and "Discuss with a clinician" tiers.
- R19. Every topic page and action plan surfaces a clear, persistent disclaimer that MorningForm is not a medical device and does not replace clinical advice.

**Relationship to Existing App (Phased Absorb)**

- R20. The Health Graph experience (import-first intake → partial graph → topic pages → daily brief → graph view → tiered action plans) becomes the **primary surface** of MorningForm at v1 launch.
- R21. Existing check-ins are **not deleted**. They are reframed as ongoing inputs that write directly into graph nodes (symptom, mood, energy, lifestyle). Their UI is progressively de-emphasized in favor of graph-native logging surfaces as the pivot matures.
- R22. Existing protocols are reframed as **intervention nodes** on the graph with outcome-tracking edges to relevant biomarker/symptom nodes, so the system can connect "what you tried" to "what changed" over time.
- R23. In-flight Stripe/subscription work applies to the **unified product**, not a legacy feature set. No separate subscription for the Health Graph vs. legacy features.

## Success Criteria

- A first-time user completes intake (no uploads) and sees a partial Health Graph with provenance, three tentative topic stubs, and a lightweight daily brief — within a single session, without hitting a blank or empty state.
- A user who uploads a single blood panel sees at least one tentative topic stub promoted to a full topic page within minutes, with every biomarker claim traceable back to a specific line in the uploaded PDF.
- Each of the three v1 topic pages renders all three tiers (Understanding / What you can do now / Discuss with a clinician) for at least 80% of target users with representative inputs, and the Discuss-with-a-clinician tier produces a genuinely usable GP appointment prep that users would print or share.
- The product does not produce drug names, dosages, or treatment directives in any action plan output under normal operation.
- Power users testing the graph view can trace any recommendation on any topic page back to its underlying evidence chunks in ≤3 clicks.

## Scope Boundaries

- Not a diagnostic tool; does not label conditions the user does not already have on record.
- Does not generate drug or dose recommendations, treatment instructions, or imperative clinical directives.
- No direct NHS-linked API integration in v1 (GP Connect / IM1 / equivalent) — patient-export path only.
- No full-suite topic pages for inflammation, cardiometabolic, hormones, or gut health in v1 (substrate only).
- No new wearable integrations in v1 — existing five are sufficient.
- No clinician-facing product in v1. MorningForm addresses the patient/consumer; the GP prep output is for the user to take to their clinician.
- No mobile-native apps in v1 unless already part of the shipped surface. Web-first.
- No deletion of existing check-ins or protocols — reframe, don't remove.

## Key Decisions

- **Graph-first architecture, pages-first UI.** The graph is the durable asset and substrate; topic pages are the primary user surface; the graph view is secondary. Avoids the risk of landing users inside a node map on day one while preserving the architectural story.
- **Progressive graph, not gated upload.** Intake alone produces a partial graph; uploads promote stubs to full pages. Avoids both the weak "intake alone" MVP and the friction-heavy "labs required" MVP.
- **Import-first with hybrid fallback.** Default experience is "bring your data here"; structured + conversational fallback fills gaps. Reinforces the trust/aggregation thesis and positions MorningForm as the canonical home for personal health context.
- **GP-record path in v1.** Pragmatic patient-export route, not full NHS API integration. Establishes the workflow and UK positioning without making the MVP hostage to NHS integration timelines.
- **Three topic pages, not seven.** One clinical (iron), one living (sleep & recovery), one graph-native synthesis (energy & fatigue). Each proves a distinct capability; full seven would produce a broad-but-shallow product.
- **Tiered action plan + GP prep as first-class output.** Understanding / What you can do now / Discuss with a clinician. GP prep lives inside the clinician tier. Keeps UK regulatory posture defensible under MHRA's intended-purpose framing while producing meaningfully more value than signposting alone.
- **Phased absorb, not replace.** Health Graph is the new primary surface; shipped check-ins and protocols are reframed as graph inputs rather than deleted. Preserves capital already invested while committing to the pivot.
- **LLM is the reasoning/presentation layer, not the product.** The compiled record is the product. Avoids the commodity "chatbot over files" trap.

## Dependencies / Assumptions

- Existing wearable integrations (Whoop/Oura/Fitbit/Dexcom/Libre) remain stable as v1 ships. No provider-side API changes mid-build.
- `HEALTH_TOKEN_ENCRYPTION_KEY` (or equivalent encryption-at-rest posture) extends to graph source chunks containing clinical content.
- Lab PDF extraction quality is sufficient to promote topic stubs reliably for common UK blood panels (NHS, BUPA, Medichecks, Thriva formats). Extraction strategy is a planning decision, not a product decision.
- In-flight Stripe/subscription work is on a feature branch prior to planning this pivot.
- Patient-export GP-record documents (PDF, potentially HTML or structured exports from the NHS App) are obtainable by users in a usable format. Validation during planning.

## Outstanding Questions

### Resolve Before Planning

(none — product direction is committed)

### Deferred to Planning

- [Affects R1, R2][Technical] Graph storage — relational (Postgres) with adjacency tables vs. dedicated graph store (Neo4j / similar) vs. hybrid with vector store for chunk retrieval. Seam uses Postgres + Neo4j + Qdrant; MorningForm may not need all three for v1.
- [Affects R8][Needs research] Lab PDF extraction strategy — LLM-first, OCR + rule-based, or hybrid. Scope: which UK lab providers are in v1's must-parse set.
- [Affects R8][Needs research] GP-record import format — what do NHS App patient exports and common approved patient-facing services actually produce? Formats, coverage, prospective-vs-historical access.
- [Affects R12, R13][Technical] Topic-page generation — per-topic compile pipeline vs. global compiler pass; caching and invalidation when a node is added/updated.
- [Affects R3, R6][Technical] Stub-to-page promotion logic — thresholds for confidence, number of supporting chunks, node centrality before a stub becomes a full page.
- [Affects R15][Technical] Graph view rendering — force-directed vs. hierarchical layout, client-side vs. pre-computed; scale limits for dense user graphs.
- [Affects R4, R9][Technical] Intake extraction — prompt structure and schema contract for turning free-text and conversational probes into typed graph nodes with provenance.
- [Affects R20–R22][Technical] Migration plan — how existing check-in/protocol data maps into graph nodes on first launch of the pivoted product for existing users.
- [Affects R17–R19][Needs research] Final regulatory sign-off — confirm with UK-regulation guidance (MHRA SaMD) that the tiered action-plan shape with GP prep output falls inside information/decision-support, not SaMD, for v1 launch copy.
- [Affects R23][Product→Planning] Pricing model for the unified product — free tier shape, paid tier features, graph-related paywall boundaries.

## Next Steps

-> `/ce:plan` for structured implementation planning.
