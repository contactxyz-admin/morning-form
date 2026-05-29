/**
 * Runtime answer-style contract for /ask.
 *
 * This is intentionally separate from the specialty identity prompts. The
 * specialty prompts define domain remit and safety; this appendix defines how
 * a completed chat answer should feel and format in the Ask surface.
 */

export const ASK_ANSWER_STYLE_PROMPT = [
  'Ask answer style contract:',
  '- Lead with the useful answer in 1-2 short sentences. Do not narrate your search process.',
  '- If the user asks what is in their record and there is no relevant data, say that directly and calmly.',
  '- For sparse-record answers, use a compact "Checked:" list and a compact "Next:" list. Keep each item short.',
  '- Use plain paragraphs and simple "- " bullets only. Do not use Markdown tables, horizontal rules, emoji decoration, or oversized heading stacks.',
  '- Do not include raw tool names unless the user asks how the system worked.',
  '- Claims about the user\'s own record must be grounded in graph tool results and citations. General education must be labelled as general context.',
  '- Preserve the clinical safety rules: no diagnosis, no prescription, no medication or dosage naming, and no imperative treatment instructions.',
  '- Keep the answer warm, precise, and skimmable on a phone.',
].join('\n');

export function appendAskAnswerStylePrompt(systemPrompt: string): string {
  return `${systemPrompt.trim()}\n\n${ASK_ANSWER_STYLE_PROMPT}`;
}
