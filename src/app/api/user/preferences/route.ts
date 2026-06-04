import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

// HH:MM, 24-hour. Mirrors the format produced by the Settings TimePicker.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type Preferences = {
  wakeTime: string;
  windDownTime: string;
  timezone: string;
  notifyMorning: boolean;
  notifyProtocol: boolean;
  notifyEvening: boolean;
  notifyWeekly: boolean;
};

// Server-side defaults, kept in sync with the UserPreferences model defaults
// (prisma/schema.prisma) and the Settings UI defaults. Returned when the user
// has no row yet so the client always renders consistent state.
const DEFAULTS: Preferences = {
  wakeTime: '07:00',
  windDownTime: '22:00',
  timezone: 'UTC',
  notifyMorning: true,
  notifyProtocol: true,
  notifyEvening: true,
  notifyWeekly: true,
};

/**
 * Explicit write allowlist. Only the known UserPreferences model fields are
 * writable through this endpoint — a future schema addition must not become
 * silently writable. PUT bodies are validated field-by-field against this map;
 * unknown keys are ignored.
 */
const STRING_FIELDS = ['wakeTime', 'windDownTime', 'timezone'] as const;
const BOOLEAN_FIELDS = ['notifyMorning', 'notifyProtocol', 'notifyEvening', 'notifyWeekly'] as const;
const TIME_FIELDS = ['wakeTime', 'windDownTime'] as const;

/**
 * GET /api/user/preferences — return the current user's preferences, or the
 * defaults (matching the Settings UI) when no row exists yet.
 *
 * Also returns the authenticated user's `email` as a sibling field. The
 * Settings page already fetches this endpoint on mount and needs the real
 * session email to render the Account section; there is no other client-facing
 * route that exposes user identity, so we surface it here rather than adding a
 * dedicated `/api/user/me` endpoint. `email` is read-only (no PUT counterpart).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const row = await prisma.userPreferences.findUnique({ where: { userId: user.id } });
    const preferences: Preferences = row
      ? {
          wakeTime: row.wakeTime,
          windDownTime: row.windDownTime,
          timezone: row.timezone,
          notifyMorning: row.notifyMorning,
          notifyProtocol: row.notifyProtocol,
          notifyEvening: row.notifyEvening,
          notifyWeekly: row.notifyWeekly,
        }
      : { ...DEFAULTS };
    return NextResponse.json({ preferences, email: user.email ?? null });
  } catch (error) {
    console.error('[API] Preferences fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}

/**
 * PUT /api/user/preferences — upsert the current user's preferences.
 *
 * Applies an explicit field allowlist: only the known model fields are read
 * from the body, validated, and written. Unknown fields are ignored. Time
 * fields must be HH:MM (24-hour) → 400 on bad format.
 */
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be an object.' }, { status: 400 });
  }

  // Build the write payload field-by-field from the allowlist only.
  const data: Partial<Preferences> = {};

  for (const field of STRING_FIELDS) {
    if (body[field] === undefined) continue;
    const value = body[field];
    if (typeof value !== 'string') {
      return NextResponse.json({ error: `Field '${field}' must be a string.` }, { status: 400 });
    }
    if ((TIME_FIELDS as readonly string[]).includes(field) && !TIME_RE.test(value)) {
      return NextResponse.json(
        { error: `Field '${field}' must be a HH:MM time.` },
        { status: 400 },
      );
    }
    data[field] = value;
  }

  for (const field of BOOLEAN_FIELDS) {
    if (body[field] === undefined) continue;
    const value = body[field];
    if (typeof value !== 'boolean') {
      return NextResponse.json({ error: `Field '${field}' must be a boolean.` }, { status: 400 });
    }
    data[field] = value;
  }

  try {
    const row = await prisma.userPreferences.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });
    const preferences: Preferences = {
      wakeTime: row.wakeTime,
      windDownTime: row.windDownTime,
      timezone: row.timezone,
      notifyMorning: row.notifyMorning,
      notifyProtocol: row.notifyProtocol,
      notifyEvening: row.notifyEvening,
      notifyWeekly: row.notifyWeekly,
    };
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('[API] Preferences update error:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
