import { describe, expect, it } from 'vitest';
import { OpsOwnerEmailSchema, OpsTaskCreateSchema, OpsTaskUpdateSchema } from './schema';

describe('OpsOwnerEmailSchema', () => {
  it('lowercases the email so owner-equality checks cannot be fooled by casing', () => {
    expect(OpsOwnerEmailSchema.parse('Joe@Contact.XYZ')).toBe('joe@contact.xyz');
  });

  it('rejects non-email strings', () => {
    expect(() => OpsOwnerEmailSchema.parse('not-an-email')).toThrow();
  });
});

describe('OpsTaskCreateSchema / OpsTaskUpdateSchema ownerEmail normalization', () => {
  it('lowercases ownerEmail on create', () => {
    const parsed = OpsTaskCreateSchema.parse({ title: 'x', ownerEmail: 'Joe@Contact.xyz' });
    expect(parsed.ownerEmail).toBe('joe@contact.xyz');
  });

  it('lowercases ownerEmail on update, preserves null and undefined', () => {
    expect(OpsTaskUpdateSchema.parse({ ownerEmail: 'JOE@CONTACT.XYZ' }).ownerEmail).toBe('joe@contact.xyz');
    expect(OpsTaskUpdateSchema.parse({ ownerEmail: null }).ownerEmail).toBeNull();
    expect(OpsTaskUpdateSchema.parse({}).ownerEmail).toBeUndefined();
  });
});
