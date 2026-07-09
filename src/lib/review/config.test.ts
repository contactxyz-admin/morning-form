import { afterEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  CLINICIAN_REVIEW_ENABLED: '',
  CLINICIAN_ALLOWLIST: '',
};

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

import { isClinicianReviewEnabled, clinicianAllowlist, isClinician } from './config';

afterEach(() => {
  envMock.CLINICIAN_REVIEW_ENABLED = '';
  envMock.CLINICIAN_ALLOWLIST = '';
});

describe('isClinicianReviewEnabled', () => {
  it('is false unless the flag is exactly "true"', () => {
    expect(isClinicianReviewEnabled()).toBe(false);
    envMock.CLINICIAN_REVIEW_ENABLED = 'yes';
    expect(isClinicianReviewEnabled()).toBe(false);
    envMock.CLINICIAN_REVIEW_ENABLED = 'true';
    expect(isClinicianReviewEnabled()).toBe(true);
  });
});

describe('clinicianAllowlist / isClinician', () => {
  it('parses comma-separated, case-insensitive, trimmed entries', () => {
    envMock.CLINICIAN_ALLOWLIST = ' Dr.Malak@Example.com ,, second@clinic.org ';
    expect(clinicianAllowlist()).toEqual(['dr.malak@example.com', 'second@clinic.org']);
    expect(isClinician('DR.MALAK@example.com')).toBe(true);
    expect(isClinician('nobody@example.com')).toBe(false);
    expect(isClinician(null)).toBe(false);
    expect(isClinician(undefined)).toBe(false);
  });

  it('fails closed on an empty allowlist — nobody is a clinician', () => {
    expect(isClinician('anyone@example.com')).toBe(false);
  });
});
