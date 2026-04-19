/**
 * DOM polyfills for pdfjs-dist running in Node serverless.
 *
 * pdfjs-dist@5 (which `pdf-parse@2` wraps) references `DOMMatrix`, `ImageData`,
 * and `Path2D` at module-load time when its ESM legacy build is imported. On
 * Vercel's Node runtime these globals are undefined, so importing `pdf-parse`
 * throws `ReferenceError: DOMMatrix is not defined` before the route handler
 * ever runs. pdfjs-dist ships an internal polyfill that tries to dynamically
 * require `@napi-rs/canvas`, but the ESM dynamic-require path doesn't resolve
 * in time to beat the top-level class definition.
 *
 * Fix: install the globals eagerly from `@napi-rs/canvas` before `pdf-parse`
 * is imported. Must be imported *first* in `pdf-extract.ts` -- ESM evaluates
 * imports in source order, so this polyfill has to precede the `pdf-parse`
 * import statement.
 *
 * We only use pdf-parse for text extraction, not rendering, so the polyfill
 * classes are never actually instantiated on our hot path; their existence is
 * enough to satisfy pdfjs-dist's load-time references.
 */
import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

const g = globalThis as unknown as {
  DOMMatrix?: unknown;
  ImageData?: unknown;
  Path2D?: unknown;
};

if (typeof g.DOMMatrix === 'undefined') g.DOMMatrix = DOMMatrix;
if (typeof g.ImageData === 'undefined') g.ImageData = ImageData;
if (typeof g.Path2D === 'undefined') g.Path2D = Path2D;
