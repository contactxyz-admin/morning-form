/**
 * Server-only JSON-LD emitter.
 *
 * Plan R3: every JSON-LD <script> block escapes `</` to `\\u003c/` so a
 * stray `</script>` substring in any string field cannot break out of
 * the script tag and inject HTML. The escape lives in `./serialize.ts`
 * for unit-testability without a React rig.
 */
import { serializeJsonLdPayload } from './serialize';

interface JsonLdProps {
  data: unknown;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: serializeJsonLdPayload(data) }}
    />
  );
}
