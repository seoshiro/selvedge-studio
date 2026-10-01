// Shared upload/import bounds. Encoded limits include the data URL prefix.
export const ARTWORK_LIMITS = Object.freeze({
  sourceBytes: 8_000_000,
  sourcePixels: 16_000_000,
  sourceEdge: 8192,
  normalizedEdge: 2048,
  normalizedCharacters: 3_000_000,
  totalCharacters: 20_000_000,
  assets: 16,
  importBytes: 24_000_000,
  minimumAdaptiveEdge: 640,
  normalizationAttempts: 8,
});
