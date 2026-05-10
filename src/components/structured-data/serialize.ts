/**
 * JSON-LD payload serializer with `</` escape (R3).
 *
 * Pure helper — kept in a separate `.ts` file so unit tests don't drag
 * the JSX-bearing JsonLd component through the vitest parser.
 */
export function serializeJsonLdPayload(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
