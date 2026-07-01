// src/util/blueprintMeta.ts — round-trip provenance for Layout-generator SVGs.
// The export embeds `<metadata id="lf-blueprint">` (CDATA-wrapped JSON) so a
// re-imported SVG can restore the exact generator params. The motif itself is
// NOT stored (re-upload if needed) — matches the v1 no-persistence scope.
// Spec: docs/superpowers/specs/2026-06-30-blueprint-config-vpype-design.md

export type BlueprintSource = { generator: string; params: Record<string, unknown> };

const META_VERSION = 1;

/** JSON payload for the <metadata id="lf-blueprint"> element (no XML wrapping). */
export const serializeMeta = (src: BlueprintSource): string =>
  JSON.stringify({ version: META_VERSION, generator: src.generator, params: src.params });

/** Extract blueprint/layout provenance from an SVG string, or null if absent/invalid. */
export const parseMeta = (svgText: string): BlueprintSource | null => {
  const m = svgText.match(
    /<metadata\b[^>]*\bid="lf-blueprint"[^>]*>(?:\s*<!\[CDATA\[)?([\s\S]*?)(?:\]\]>\s*)?<\/metadata>/,
  );
  if (!m) return null;
  try {
    const o = JSON.parse(m[1].trim());
    if (o && typeof o.generator === "string" && o.params && typeof o.params === "object") {
      return { generator: o.generator, params: o.params as Record<string, unknown> };
    }
  } catch {
    /* malformed metadata → treat as absent */
  }
  return null;
};
