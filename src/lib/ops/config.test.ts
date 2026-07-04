import { afterEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  COMPANY_OPS_ENABLED: '',
  COMPANY_OPS_ALLOWLIST: '',
  COMPANY_OPS_MEMBERS: '',
  COMPANY_OPS_SLACK_WEBHOOK: '',
  COMPANY_OPS_MCP_TOKENS: '',
};

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

import {
  isCompanyOpsEnabled,
  isStaff,
  staffAllowlist,
  members,
  memberByEmail,
  mcpTokens,
  founderEmailForToken,
} from './config';

afterEach(() => {
  envMock.COMPANY_OPS_ENABLED = '';
  envMock.COMPANY_OPS_ALLOWLIST = '';
  envMock.COMPANY_OPS_MEMBERS = '';
  envMock.COMPANY_OPS_MCP_TOKENS = '';
});

describe('isCompanyOpsEnabled', () => {
  it('is false unless the flag is exactly "true"', () => {
    expect(isCompanyOpsEnabled()).toBe(false);
    envMock.COMPANY_OPS_ENABLED = 'yes';
    expect(isCompanyOpsEnabled()).toBe(false);
    envMock.COMPANY_OPS_ENABLED = 'true';
    expect(isCompanyOpsEnabled()).toBe(true);
  });
});

describe('staffAllowlist / isStaff', () => {
  it('parses a comma-separated, case-insensitive, trimmed list', () => {
    envMock.COMPANY_OPS_ALLOWLIST = ' Reuben@Contact.xyz , joe@contact.xyz,,';
    expect(staffAllowlist()).toEqual(['reuben@contact.xyz', 'joe@contact.xyz']);
    expect(isStaff('REUBEN@CONTACT.XYZ')).toBe(true);
    expect(isStaff('umar@contact.xyz')).toBe(false);
    expect(isStaff(null)).toBe(false);
    expect(isStaff(undefined)).toBe(false);
  });
});

describe('members / memberByEmail', () => {
  it('parses the JSON member list and looks up case-insensitively', () => {
    envMock.COMPANY_OPS_MEMBERS = JSON.stringify([{ email: 'joe@contact.xyz', name: 'Joe', slackId: 'U1' }]);
    expect(members()).toHaveLength(1);
    expect(memberByEmail('JOE@contact.xyz')?.name).toBe('Joe');
    expect(memberByEmail('nobody@example.com')).toBeUndefined();
  });

  it('degrades to an empty list on malformed JSON rather than throwing', () => {
    envMock.COMPANY_OPS_MEMBERS = '{not valid json';
    expect(members()).toEqual([]);
  });
});

describe('mcpTokens / founderEmailForToken', () => {
  it('resolves a raw token to its founder email', () => {
    envMock.COMPANY_OPS_MCP_TOKENS = JSON.stringify([{ email: 'joe@contact.xyz', token: 'joe-token' }]);
    expect(mcpTokens()).toHaveLength(1);
    expect(founderEmailForToken('joe-token')).toBe('joe@contact.xyz');
    expect(founderEmailForToken('unknown-token')).toBeNull();
  });
});
