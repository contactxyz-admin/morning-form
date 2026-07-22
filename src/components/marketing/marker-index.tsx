"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Market } from "@/lib/marketing/constants";
import { MONO_EYEBROW } from "./marketing-header";
import { buildMoleculeSvg } from "@/lib/marketing/molecule-svg";
import { MARKER_MOLECULES } from "../../../content/marketing/marker-molecules";
import {
  markerCategories,
  type MarkerEntry,
} from "../../../content/marketing/testing-markers";

interface MarkerIndexProps {
  market: Market;
  markers: ReadonlyArray<MarkerEntry>;
  /** Seeds the search box — exists so tests can render straight into the no-results state without simulating typing. */
  initialQuery?: string;
}

const PREVIEW_MIN_TOP = 6;
const PREVIEW_FALLBACK_HEIGHT = 190;
const PREVIEW_MIN_VIEWPORT_WIDTH = 760;

// The preview-position correction only ever matters once a pointer can
// hover a row, which means a browser — useLayoutEffect on the server just
// warns and no-ops, so fall back to useEffect there.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Searchable index of marker groups in the baseline panel, organised as a
 * two-level accordion — category rows (the seven panels) expand to reveal
 * their own marker groups. Hovering a category row (desktop only) shows a
 * floating hand-drawn molecule illustration tied to that panel.
 */
export function MarkerIndex({ market, markers, initialQuery = "" }: MarkerIndexProps) {
  const [query, setQuery] = useState(initialQuery);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [hoverCategoryId, setHoverCategoryId] = useState<string | null>(null);
  const [previewTop, setPreviewTop] = useState(PREVIEW_MIN_TOP);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const hoverAnchorRef = useRef<{ top: number; height: number } | null>(null);

  const categories = useMemo(() => markerCategories(market), [market]);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const groups = useMemo(() => {
    return categories.map((category) => {
      let categoryMarkers = markers.filter((m) => m.categoryId === category.id);
      const total = categoryMarkers.length;
      if (searching) {
        categoryMarkers = categoryMarkers.filter((m) =>
          `${m.name} ${m.description}`.toLowerCase().includes(q),
        );
      }
      const isOpen = searching ? categoryMarkers.length > 0 : openCategoryId === category.id;
      return {
        category,
        markers: categoryMarkers,
        countLabel:
          category.id === "genomics"
            ? `${total} · once`
            : `${total} ${total === 1 ? "group" : "groups"}`,
        isOpen,
      };
    }).filter((g) => (searching ? g.markers.length > 0 : true));
  }, [categories, markers, q, searching, openCategoryId]);

  const totalMatching = groups.reduce((sum, g) => sum + g.markers.length, 0);
  const countLabel = searching
    ? `${totalMatching} matching`
    : `${categories.length} panels · 60+ measurements${market === "us" ? " + genomics" : ""}`;
  const noResults = searching && groups.length === 0;

  const hoveredMolecule = hoverCategoryId ? MARKER_MOLECULES[hoverCategoryId] : undefined;
  const hoveredCategory = hoverCategoryId
    ? categories.find((c) => c.id === hoverCategoryId)
    : undefined;
  const hoveredMoleculeSvg = useMemo(
    () => (hoveredMolecule ? buildMoleculeSvg(hoveredMolecule.spec) : ""),
    [hoveredMolecule],
  );

  // Position the floating preview against the hovered row, then correct
  // once its real height is known — mirrors the reference's measure-after-
  // paint approach so the panel never renders off past the first frame.
  useIsomorphicLayoutEffect(() => {
    if (!hoveredMolecule || !hoverAnchorRef.current) return;
    const height = previewRef.current?.offsetHeight ?? PREVIEW_FALLBACK_HEIGHT;
    const { top: anchorTop, height: anchorHeight } = hoverAnchorRef.current;
    const top = Math.max(PREVIEW_MIN_TOP, anchorTop + anchorHeight / 2 - height / 2);
    setPreviewTop(top);
  }, [hoveredMolecule]);

  // A row can disappear out from under the pointer — typing a search query
  // that filters out the category currently being hovered — without ever
  // firing mouseleave. Drop a hover that's no longer backed by a rendered row.
  useEffect(() => {
    if (hoverCategoryId && !groups.some((g) => g.category.id === hoverCategoryId)) {
      setHoverCategoryId(null);
      hoverAnchorRef.current = null;
    }
  }, [groups, hoverCategoryId]);

  function handleCategoryEnter(categoryId: string, target: HTMLElement) {
    if (typeof window === "undefined" || window.innerWidth < PREVIEW_MIN_VIEWPORT_WIDTH) return;
    if (!MARKER_MOLECULES[categoryId]) return;
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const anchorTop = targetRect.top - containerRect.top;
    hoverAnchorRef.current = { top: anchorTop, height: targetRect.height };
    setPreviewTop(
      Math.max(PREVIEW_MIN_TOP, anchorTop + targetRect.height / 2 - PREVIEW_FALLBACK_HEIGHT / 2),
    );
    setHoverCategoryId(categoryId);
  }

  function handleCategoryLeave() {
    setHoverCategoryId(null);
    hoverAnchorRef.current = null;
  }

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
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand-grey-300"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markers — glucose, iron, thyroid…"
            aria-label="Search markers"
            aria-controls="marker-group-results"
            className="w-full box-border py-3 pl-11 pr-4 rounded-chip border border-border bg-surface font-sans text-body text-text-primary placeholder:text-brand-grey-200 transition-[border-color,box-shadow] duration-300 ease-spring focus:outline-none focus:border-brand-blue-500 focus:shadow-ring-focus"
          />
        </div>
        <span
          className={`${MONO_EYEBROW} whitespace-nowrap`}
          aria-live="polite"
          aria-atomic="true"
        >
          {countLabel}
        </span>
      </div>

      <div
        ref={containerRef}
        id="marker-group-results"
        className="relative mt-7 overflow-visible rounded-card bg-surface shadow-hairline"
      >
        {hoveredMolecule && hoveredCategory && (
          <div
            ref={previewRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 z-10 w-[clamp(168px,21vw,229px)] -translate-x-1/2 transition-[top,opacity] duration-200 ease-standard"
            style={{ top: previewTop }}
          >
            <div className="rounded-card-sm border border-border bg-surface p-3.5 pb-2.5 shadow-modal">
              <div
                className="rounded-input p-3"
                style={{
                  background: `radial-gradient(130% 130% at 50% 30%, color-mix(in srgb, ${hoveredCategory.dotHex} 20%, #fff) 0%, color-mix(in srgb, ${hoveredCategory.dotHex} 10%, #fff) 58%, color-mix(in srgb, ${hoveredCategory.dotHex} 6%, #fff) 100%)`,
                }}
                // Generated from a fixed, developer-authored spec — not user input.
                dangerouslySetInnerHTML={{ __html: hoveredMoleculeSvg }}
              />
              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <span className="font-display text-[17px] -tracking-[0.01em] text-text-primary">
                  {hoveredMolecule.name}
                </span>
                <span className="font-mono text-[11px] text-text-secondary">
                  {hoveredMolecule.formula}
                </span>
              </div>
            </div>
          </div>
        )}

        {groups.map((group, i) => (
          <div
            key={group.category.id}
            className={i > 0 ? "border-t border-border" : ""}
          >
            <button
              onClick={() =>
                setOpenCategoryId((current) =>
                  current === group.category.id ? null : group.category.id,
                )
              }
              onMouseEnter={(e) => handleCategoryEnter(group.category.id, e.currentTarget)}
              onMouseLeave={handleCategoryLeave}
              aria-expanded={group.isOpen}
              className="flex w-full box-border items-center gap-3.5 px-4 sm:px-7 py-4 bg-transparent border-none cursor-pointer text-left font-sans transition-colors duration-200 ease-standard hover:bg-bg-deep focus:outline-none focus:ring-2 focus:ring-inset focus:ring-button-focus"
            >
              <span
                className={`h-2.5 w-2.5 flex-none rounded-full ${group.category.dotClass}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-body-lg font-medium text-text-primary">
                {group.category.label}
              </span>
              <span className="hidden flex-none font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-secondary sm:inline">
                {group.countLabel}
              </span>
              <span
                className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full border border-border font-mono text-sm leading-none text-brand-grey-300"
                aria-hidden="true"
              >
                {group.isOpen ? "−" : "+"}
              </span>
            </button>
            {group.isOpen && (
              <div className="px-4 pb-3.5 pl-[34px] sm:px-7 sm:pl-[46px]">
                {group.markers.map((m, mi) => (
                  <div
                    key={m.id}
                    className={mi > 0 ? "border-t border-border py-3" : "py-3"}
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 text-body font-medium text-text-primary">
                        {m.name}
                      </span>
                      {m.sub && (
                        <span className="flex-none font-mono text-[10px] uppercase tracking-[0.1em] text-brand-grey-300">
                          {m.sub}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 max-w-[46em] text-caption leading-relaxed text-text-secondary">
                      {m.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {noResults && (
          <div className="px-7 py-11 text-center">
            <p className="text-body text-text-secondary">
              No markers match that search.
            </p>
            <button
              onClick={() => setQuery("")}
              className="mt-3 rounded-sm font-mono text-[11px] uppercase tracking-[0.12em] text-brand-blue-700 focus:outline-none focus:shadow-ring-focus"
            >
              Clear search
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
