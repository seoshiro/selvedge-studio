import type { Asset } from "./model";
import { sampleSvg } from "./art";
import { ARTWORK_LIMITS as L } from "./limits";
export type ArtworkErrorCode =
  | "artworkSize"
  | "artworkPixels"
  | "artworkFormat"
  | "artworkDecode"
  | "artworkComplex";
export class ArtworkError extends Error {
  constructor(public code: ArtworkErrorCode) {
    super(code);
    this.name = "ArtworkError";
  }
}
export type ArtworkUpload = {
  asset: Asset;
  sourceWidth: number;
  sourceHeight: number;
  reducedToFit: boolean;
};
export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Image could not be decoded."));
    i.src = src;
  });
export async function sampleAsset(): Promise<Asset> {
  const image = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sampleSvg)}`,
  );
  const c = document.createElement("canvas");
  c.width = 1860;
  c.height = 2046;
  c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
  return {
    id: "after-hours",
    name: "After Hours — original study",
    width: c.width,
    height: c.height,
    data: c.toDataURL("image/png"),
  };
}
export function headerDimensions(bytes: Uint8Array): [number, number] {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length > 24 &&
    d.getUint32(0) === 0x89504e47 &&
    d.getUint32(4) === 0x0d0a1a0a
  )
    return [d.getUint32(16), d.getUint32(20)];
  if (bytes.length > 12 && bytes[0] === 255 && bytes[1] === 216) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i++] !== 255) throw new Error("Invalid JPEG header.");
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      if (marker === 217 || marker === 218) break;
      const len = d.getUint16(i);
      if (len < 2 || i + len > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      )
        return [d.getUint16(i + 5), d.getUint16(i + 3)];
      i += len;
    }
  }
  if (
    bytes.length > 30 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    const tag = String.fromCharCode(...bytes.slice(12, 16));
    if (tag === "VP8X")
      return [
        1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536,
        1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536,
      ];
    if (tag === "VP8L" && bytes[20] === 47)
      return [
        1 + bytes[21] + ((bytes[22] & 63) << 8),
        1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10),
      ];
    if (
      tag === "VP8 " &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    )
      return [d.getUint16(26, true) & 16383, d.getUint16(28, true) & 16383];
  }
  throw new Error("Choose a valid PNG, JPEG, or WebP raster image.");
}
export async function readArtwork(file: File): Promise<ArtworkUpload> {
  if (file.size > L.sourceBytes || !file.size)
    throw new ArtworkError("artworkSize");
  let w: number, h: number;
  try {
    [w, h] = headerDimensions(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new ArtworkError("artworkFormat");
  }
  if (
    !w ||
    !h ||
    w > L.sourceEdge ||
    h > L.sourceEdge ||
    w * h > L.sourcePixels
  )
    throw new ArtworkError("artworkPixels");
  const url = URL.createObjectURL(file);
  try {
    const i = await loadImage(url);
    if (
      !(i.naturalWidth === w && i.naturalHeight === h) &&
      !(i.naturalWidth === h && i.naturalHeight === w)
    )
      throw new ArtworkError("artworkDecode");
    const c = document.createElement("canvas");
    const originalEdge = Math.max(i.naturalWidth, i.naturalHeight);
    let edge = Math.min(originalEdge, L.normalizedEdge);
    const minimumEdge = Math.min(edge, L.minimumAdaptiveEdge);
    for (let attempt = 0; attempt < L.normalizationAttempts; attempt++) {
      const scale = edge / originalEdge;
      c.width = Math.max(1, Math.round(i.naturalWidth * scale));
      c.height = Math.max(1, Math.round(i.naturalHeight * scale));
      const context = c.getContext("2d");
      if (!context) throw new ArtworkError("artworkDecode");
      context.imageSmoothingQuality = "high";
      // Canvas dimensions reset pixels and alpha. Every pass samples the
      // original decoded image, never an already downsampled intermediate.
      context.drawImage(i, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/png");
      if (!data.startsWith("data:image/png;base64,"))
        throw new ArtworkError("artworkDecode");
      if (data.length <= L.normalizedCharacters)
        return {
          asset: {
            id: crypto.randomUUID(),
            name: file.name.slice(0, 120),
            width: c.width,
            height: c.height,
            data,
          },
          sourceWidth: i.naturalWidth,
          sourceHeight: i.naturalHeight,
          reducedToFit: attempt > 0,
        };
      if (edge <= minimumEdge) break;
      edge =
        attempt === L.normalizationAttempts - 2
          ? minimumEdge
          : Math.max(
              minimumEdge,
              Math.floor(
                edge *
                  Math.min(
                    0.95,
                    Math.sqrt(L.normalizedCharacters / data.length) * 0.96,
                  ),
              ),
            );
      // Allow the UI to paint its busy state between bounded encoding passes.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    throw new ArtworkError("artworkComplex");
  } catch (e) {
    if (e instanceof ArtworkError) throw e;
    throw new ArtworkError("artworkDecode");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function verifyAssets(assets: Asset[]) {
  for (const a of assets) {
    const bytes = Uint8Array.from(atob(a.data.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    const [w, h] = headerDimensions(bytes);
    if (
      !(w === a.width && h === a.height) &&
      !(w === a.height && h === a.width)
    )
      throw new Error("Artwork dimensions do not match the project.");
    const i = await loadImage(a.data);
    if (i.naturalWidth !== a.width || i.naturalHeight !== a.height)
      throw new Error("Invalid embedded artwork.");
  }
}
