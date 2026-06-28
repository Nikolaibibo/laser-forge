/**
 * GeneratorGallery.tsx — searchable, keyboard-navigable overlay for switching generators.
 * Opens when galleryOpen=true in the app store; triggered by the ▸ button on the source node.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useApp } from "../state/store";
import { GENERATOR_GROUPS } from "../generators/registry";
import { artworkToThumbDataUrl } from "./previewThumb";

// ---------------------------------------------------------------------------
// Flat entry type used for filtering + keyboard nav
// ---------------------------------------------------------------------------
type FlatEntry = { id: string; name: string; group: string };

/** Build the flat list from GENERATOR_GROUPS once — stable reference. */
const FLAT_ALL: FlatEntry[] = GENERATOR_GROUPS.flatMap((g) =>
  g.items.map((it) => ({ id: it.id, name: it.name, group: g.title })),
);

// ---------------------------------------------------------------------------
// Pure filter function — exported for unit testing
// ---------------------------------------------------------------------------
/**
 * Case-insensitive match on name OR group. Empty query returns all (order preserved).
 */
export function filterGenerators(all: FlatEntry[], query: string): FlatEntry[] {
  if (!query) return all;
  const q = query.toLowerCase();
  return all.filter(
    (e) => e.name.toLowerCase().includes(q) || e.group.toLowerCase().includes(q),
  );
}

// ---------------------------------------------------------------------------
// GeneratorGallery component
// ---------------------------------------------------------------------------
export function GeneratorGallery() {
  const galleryOpen = useApp((s) => s.galleryOpen);
  const setGalleryOpen = useApp((s) => s.setGalleryOpen);
  const generatorId = useApp((s) => s.generatorId);
  const setGenerator = useApp((s) => s.setGenerator);

  const [query, setQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const highlightedRef = useRef<HTMLButtonElement>(null);

  // Filtered flat list for keyboard nav
  const filtered = filterGenerators(FLAT_ALL, query);

  // Reset state when opening
  useEffect(() => {
    if (galleryOpen) {
      setQuery("");
      setHighlightedId(null);
      // Autofocus after render
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [galleryOpen]);

  // Scroll highlighted card into view
  useEffect(() => {
    if (highlightedId) {
      highlightedRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedId]);

  const close = useCallback(() => setGalleryOpen(false), [setGalleryOpen]);

  const selectGenerator = useCallback(
    (id: string) => {
      setGenerator(id);
      setGalleryOpen(false);
    },
    [setGenerator, setGalleryOpen],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentIdx = highlightedId ? filtered.findIndex((e) => e.id === highlightedId) : -1;
        let nextIdx: number;
        if (e.key === "ArrowDown") {
          nextIdx = currentIdx < filtered.length - 1 ? currentIdx + 1 : 0;
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : filtered.length - 1;
        }
        setHighlightedId(filtered[nextIdx]?.id ?? null);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (highlightedId) {
          selectGenerator(highlightedId);
        } else if (filtered.length === 1) {
          selectGenerator(filtered[0].id);
        }
      }
    },
    [close, filtered, highlightedId, selectGenerator],
  );

  if (!galleryOpen) return null;

  // Build sections from GENERATOR_GROUPS, filtered by query
  const sections = GENERATOR_GROUPS.map((group) => {
    const items = group.items.filter((it) => filtered.some((f) => f.id === it.id));
    return { title: group.title, items };
  }).filter((s) => s.items.length > 0);

  return (
    <div
      className="lf-gallery-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="lf-gallery" role="dialog" aria-modal="true" aria-label="Generator Gallery">
        {/* Header */}
        <div className="lf-gallery__header">
          <span className="lf-gallery__title">Generators</span>
          <button className="lf-gallery__close" onClick={close} title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="lf-gallery__search-wrap">
          <input
            ref={searchRef}
            className="lf-gallery__search"
            type="search"
            placeholder="Search generators…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedId(null);
            }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Content: group sections */}
        <div className="lf-gallery__content scroller">
          {sections.length === 0 && (
            <div className="lf-gallery__empty">No generators match "{query}"</div>
          )}
          {sections.map((section) => (
            <div key={section.title} className="lf-gallery__section">
              <div className="lf-gallery__section-title">{section.title}</div>
              <div className="lf-gallery__grid">
                {section.items.map((gen) => {
                  const isActive = gen.id === generatorId;
                  const isHighlighted = gen.id === highlightedId;
                  const thumb = artworkToThumbDataUrl(gen, 120);
                  return (
                    <button
                      key={gen.id}
                      ref={isHighlighted ? highlightedRef : undefined}
                      className={`lf-gallery__card${isActive ? " lf-gallery__card--active" : ""}${isHighlighted ? " lf-gallery__card--highlighted" : ""}`}
                      onClick={() => selectGenerator(gen.id)}
                      title={gen.description}
                    >
                      <div className="lf-gallery__thumb-wrap">
                        {thumb ? (
                          <img
                            className="lf-gallery__thumb"
                            src={thumb}
                            alt={gen.name}
                            width={120}
                            height={120}
                          />
                        ) : (
                          <div className="lf-gallery__thumb-placeholder" aria-hidden="true">
                            ◆
                          </div>
                        )}
                      </div>
                      <span className="lf-gallery__card-name">{gen.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
