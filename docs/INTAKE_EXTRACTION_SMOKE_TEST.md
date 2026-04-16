# Intake extraction — live-LLM smoke test

The unit tests mock Claude with canned handlers. Before shipping U5 changes
that touch the extraction prompt, chunking, or schema, run this smoke test
end-to-end against the real Anthropic API at least once so you know the
prompt still elicits a schema-valid response.

## Prerequisites

```bash
export ANTHROPIC_API_KEY=sk-ant-...
unset MOCK_LLM
```

## Procedure

1. Start the dev server: `npm run dev`.
2. Sign in as the demo user (`demo@morningform.com`) or create a fresh user.
3. Go to `/intake`, fill all three tabs:
   - **Upload**: skip or attach a single PDF (lab result) — content is not yet
     used by U5; U6 will consume it.
   - **History**: paste 1–3 paragraphs of medical narrative. Use the canonical
     fixture below so diffs between runs are comparable.
   - **Essentials**: goals, at least one medication, one diagnosis, an allergy.
4. Click **Finish intake →**.
5. Expect a 200 response from `POST /api/intake/submit` within ~20 seconds.
6. Verify via `prisma studio` or a direct query that:
   - One `SourceDocument(kind: 'intake_text')` row exists for the user.
   - Its `SourceChunk` rows line up with the content you typed.
   - `GraphNode` rows cover the stated conditions, medications, and at least
     one symptom. Every node has ≥1 inbound SUPPORTS edge.
   - `TopicPage` stubs were created for any v1 topic (iron/sleep/energy) that
     has a matching node.

## Canonical history fixture

> I've had low afternoon energy for about six months. My sleep is fragmented — I
> wake up at 3am most nights and struggle to drop back off. Recent labs showed
> ferritin at 18 ug/L. My GP started me on metformin 500mg last year for type 2
> diabetes. I'm allergic to penicillin.

Expected extraction shape (not exhaustive — Claude will vary):

- nodes:
  - `symptom::low_afternoon_energy`
  - `symptom::fragmented_sleep`
  - `biomarker::ferritin` (attributes include latestValue ≈ 18, unit ug/L)
  - `medication::metformin` (attributes include dose 500mg)
  - `condition::type_2_diabetes`
- edges:
  - `medication::metformin -ASSOCIATED_WITH-> condition::type_2_diabetes`
- tentative topic stubs: `iron`, `sleep`, `energy`

## Red flags

- Any node lacking SUPPORTS edges → `LLMValidationError` was swallowed or the
  schema was weakened; investigate before merge.
- Claude invents diagnoses the fixture doesn't state (e.g. "depression",
  "anemia") → tighten the HARD RULES section of
  `src/lib/intake/prompts.ts#EXTRACTION_SYSTEM_PROMPT`.
- `droppedEdges > 0` in the response body → the model referenced canonical
  keys that don't exist. Log the dropped edge and check whether we should
  tighten the prompt or loosen the resolver.

## Idempotency check

Submit the same fixture again. Verify:
- HTTP 200.
- No new `SourceDocument` row (dedup on contentHash).
- No new `GraphNode` rows (upserted by canonicalKey).
- `TopicPage.status` does not regress from `ready` → `stub`.
