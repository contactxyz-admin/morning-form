import { describe, expect, it } from 'vitest';
import { OuraClient } from './oura';
import { HEALTH_PROVIDERS } from './providers';

describe('OuraClient.getAuthUrl', () => {
  it('builds an Oura OAuth URL with expected params', () => {
    const client = new OuraClient('client-abc', 'secret');
    const url = new URL(client.getAuthUrl('https://app.example.com/cb'));
    expect(url.origin + url.pathname).toBe('https://cloud.ouraring.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/cb');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('requests only Oura-valid scopes — no "sleep" scope (sleep data is under "daily")', () => {
    const client = new OuraClient('client-abc', 'secret');
    const url = new URL(client.getAuthUrl('https://app.example.com/cb'));
    const scopes = (url.searchParams.get('scope') ?? '').split(' ');
    expect(scopes).not.toContain('sleep');
    expect(scopes).toEqual(['daily', 'heartrate', 'personal', 'session', 'workout']);
  });

  it('derives the auth-URL scope from HEALTH_PROVIDERS.oura.scopes (single source of truth — no drift)', () => {
    const client = new OuraClient('client-abc', 'secret');
    const url = new URL(client.getAuthUrl('https://app.example.com/cb'));
    expect(url.searchParams.get('scope')).toBe(HEALTH_PROVIDERS.oura.scopes.join(' '));
  });
});

describe('HEALTH_PROVIDERS.oura scopes', () => {
  it('does not declare a "sleep" scope', () => {
    expect(HEALTH_PROVIDERS.oura.scopes).not.toContain('sleep');
    expect(HEALTH_PROVIDERS.oura.scopes).toEqual([
      'daily',
      'heartrate',
      'personal',
      'session',
      'workout',
    ]);
  });
});
