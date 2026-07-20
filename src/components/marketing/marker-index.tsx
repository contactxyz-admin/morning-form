'use client';

import { useMemo, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { MARKER_CATEGORIES, type MarkerEntry } from '../../../content/marketing/testing-markers';

interface MarkerIndexProps {
  markers: ReadonlyArray<MarkerEntry>;
}

const MONO_EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary';

/**
 * Searchable, filterable, expandable index of every marker in the
 * baseline panel — the interactive replacement for a flat list of
 * marker names. Client-only (search/filter/expand state); the ~32-item
 * dataset is small enough that every keystroke just re-filters in place.
 */
export function MarkerIndex({ markers }: MarkerIndexProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(markers[0]?.id ?? null);

  const categoryById = useMemo(() => new Map(MARKER_CATEGORIES.map((c) => [c.id, c])), []);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of markers) counts.set(m.categoryId, (counts.get(m.categoryId) ?? 0) + 1);
    return counts;
  }, [markers]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return markers.filter((m) => {
      if (filter !== 'all' && m.categoryId !== filter) return false;
      if (!q) return true;
      const label = categoryById.get(m.categoryId)?.label ?? '';
      return `${m.name} ${m.description} ${label}`.toLowerCase().includes(q);
    });
  }, [markers, query, filter, categoryById]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px] max-w-[460px]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-grey-300"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markers — glucose, iron, thyroid…"
            aria-label="Search markers"
            className="w-full box-border py-3 pl-11 pr-4 rounded-chip border border-border bg-surface font-sans text-body text-text-primary placeholder:text-brand-grey-200 transition-[border-color,box-shadow] duration-300 ease-spring focus:outline-none focus:border-brand-blue-500 focus:shadow-ring-focus"
          />
        </div>
        <span className={`${MONO_EYEBROW} whitespace-nowrap`}>
          {rows.length} of {markers.length} markers
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
          All markers <span className="ml-1 opacity-55">{markers.length}</span>
        </Chip>
        {MARKER_CATEGORIES.map((c) => (
          <Chip key={c.id} selected={filter === c.id} onClick={() => setFilter(c.id)}>
            {c.label} <span className="ml-1 opacity-55">{categoryCounts.get(c.id) ?? 0}</span>
          </Chip>
        ))}
      </div>

      <div className="mt-7 overflow-hidden rounded-card bg-surface shadow-hairline">
        {rows.map((m, i) => {
          const cat = categoryById.get(m.categoryId);
          const isOpen = expandedId === m.id;
          return (
            <div key={m.id} className={i > 0 ? 'border-t border-border' : ''}>
              <button
                onClick={() => setExpandedId(isOpen ? null : m.id)}
                aria-expanded={isOpen}
                className="flex w-full box-border items-center gap-3.5 px-4 sm:px-6 py-4 bg-transparent border-none cursor-pointer text-left font-sans transition-colors duration-200 ease-standard hover:bg-bg-deep"
              >
                <span className={`h-2 w-2 flex-none rounded-full ${cat?.dotClass ?? ''}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-body text-text-primary">{m.name}</span>
                {m.sub && (
                  <span className="hidden flex-none font-mono text-[10.5px] uppercase tracking-[0.1em] text-brand-grey-300 sm:inline">
                    {m.sub}
                  </span>
                )}
                <span className="hidden min-w-[9em] flex-none text-right font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-secondary sm:inline">
                  {cat?.label}
                </span>
                <span
                  className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full border border-border font-mono text-sm leading-none text-brand-grey-300"
                  aria-hidden="true"
                >
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen && (
                <div className="px-4 pb-5 pl-[46px] sm:px-6 sm:pl-[58px]">
                  <p className="max-w-[44em] text-body leading-relaxed text-text-secondary">
                    {m.description}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="px-7 py-11 text-center">
            <p className="text-body text-text-secondary">No markers match that search.</p>
            <button
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
              className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-brand-blue-700"
            >
              Clear search
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
