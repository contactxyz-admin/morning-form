import { describe, expect, it } from 'vitest';
import { serializeJsonLdPayload } from './serialize';

describe('serializeJsonLdPayload', () => {
  it('produces valid JSON for a plain object', () => {
    const out = serializeJsonLdPayload({ '@type': 'WebPage', name: 'hello' });
    expect(JSON.parse(out)).toEqual({ '@type': 'WebPage', name: 'hello' });
  });

  it('escapes </script> sequences so hostile data cannot break out', () => {
    const out = serializeJsonLdPayload({
      name: 'test </script><img src=x onerror=alert(1)>',
    });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c/script');
  });

  it('escapes every < character (defensive — not just /script)', () => {
    const out = serializeJsonLdPayload({ html: 'a</b>c' });
    expect(out).toContain('\\u003c/b');
    expect(out).not.toMatch(/[^\\]<\/b/);
  });

  it('preserves valid JSON-LD structure with escapes applied', () => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'What is X?', acceptedAnswer: { text: 'It is Y.' } },
      ],
    };
    const out = serializeJsonLdPayload(data);
    // The escape should not break round-tripping for normal payloads.
    expect(JSON.parse(out)).toEqual(data);
  });
});
