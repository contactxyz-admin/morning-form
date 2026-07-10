import { describe, expect, it } from 'vitest';
import type { OpsTaskDto } from '@/app/ops/board-client';
import type { OpsContactDto } from '@/app/ops/contacts-client';
import { buildOpsDigest } from './digest';

// Thursday inside pilot week 3 (W3 = 6 Jul – 12 Jul 2026).
const NOW = new Date('2026-07-09T10:00:00Z');

function task(overrides: Partial<OpsTaskDto> & Pick<OpsTaskDto, 'id' | 'title'>): OpsTaskDto {
  return {
    board: 'pilot',
    detail: '',
    phase: '',
    ownerEmail: null,
    status: 'not_started',
    dueDate: null,
    orderIndex: 0,
    ...overrides,
  };
}

function contact(overrides: Partial<OpsContactDto> & Pick<OpsContactDto, 'id' | 'org' | 'status'>): OpsContactDto {
  return {
    contact: '',
    type: 'Partner',
    nextStep: '',
    orderIndex: 0,
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('buildOpsDigest', () => {
  it('covers clock, tracker, attention, contacts, and focus in text and html', () => {
    const digest = buildOpsDigest({
      tasks: [
        task({ id: 'a', title: 'Signed the deck off', status: 'done' }),
        task({ id: 'b', title: 'Chase TDL quote', status: 'in_progress', dueDate: '2026-07-01T00:00:00.000Z', ownerEmail: 'reuben@contact.xyz' }),
        task({ id: 'c', title: 'Gym contract', status: 'blocked' }),
      ],
      contacts: [
        contact({ id: 'c1', org: 'TDL', status: 'Replied', nextStep: 'Book the Teams call' }),
        contact({ id: 'c2', org: 'Inuvi', status: 'Sent', updatedAt: '2026-07-01T00:00:00.000Z' }),
        contact({ id: 'c3', org: 'Kolsi', status: 'Done' }),
      ],
      doneThisWeek: ['Signed the deck off'],
      focusItems: ['Send outreach', 'Design deck'],
      appUrl: 'https://morning-form.vercel.app/',
      now: NOW,
    });

    expect(digest.subject).toBe('Ops digest — W3 of 12: 1/3 done · 1 overdue · 1 contacts need action');
    expect(digest.text).toContain('W3 of 12 · 39 days to Pilot LIVE (17 Aug) · Next milestone: Partner signed (W3)');
    expect(digest.text).toContain('TRACKER — 1/3 tasks done · 1 overdue · 1 blocked');
    expect(digest.text).toContain('MARKED DONE THIS WEEK');
    expect(digest.text).toContain('[OVERDUE 1 Jul] Chase TDL quote — reuben@contact.xyz');
    expect(digest.text).toContain('[BLOCKED] Gym contract — unassigned');
    expect(digest.text).toContain('CONTACTS — 1 need action · 1 in play untouched 5+ days');
    expect(digest.text).toContain('TDL (Replied) — Book the Teams call');
    expect(digest.text).toContain("THIS WEEK'S 3");
    expect(digest.text).toContain('https://morning-form.vercel.app/ops');
    expect(digest.html).toContain('<strong>Needs attention</strong>');
    expect(digest.html).toContain('Book the Teams call');
  });

  it('renders the all-clear line and skips empty sections', () => {
    const digest = buildOpsDigest({
      tasks: [task({ id: 'a', title: 'Future thing', dueDate: '2026-09-01T00:00:00.000Z' })],
      contacts: [],
      doneThisWeek: [],
      focusItems: null,
      appUrl: 'https://x.test',
      now: NOW,
    });
    expect(digest.text).toContain('Nothing overdue, blocked, or due in the next 7 days.');
    expect(digest.text).not.toContain('MARKED DONE');
    expect(digest.text).not.toContain("THIS WEEK'S 3");
    expect(digest.html).not.toContain('<ol>');
  });

  it('escapes HTML in titles and org names', () => {
    const digest = buildOpsDigest({
      tasks: [task({ id: 'a', title: '<script>alert(1)</script>', status: 'blocked' })],
      contacts: [contact({ id: 'c1', org: 'A&B <Labs>', status: 'Replied' })],
      doneThisWeek: [],
      focusItems: null,
      appUrl: 'https://x.test',
      now: NOW,
    });
    expect(digest.html).not.toContain('<script>');
    expect(digest.html).toContain('&lt;script&gt;');
    expect(digest.html).toContain('A&amp;B &lt;Labs&gt;');
  });
});
