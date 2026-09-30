import type { Asset } from "./model";
import { sampleSvg } from "./art";
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
export async function readArtwork(file: File): Promise<Asset> {
  if (file.size > 8_000_000 || !file.size)
    throw new Error("Image must be between 1 byte and 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    [w, h] = headerDimensions(bytes);
  if (!w || !h || w > 8192 || h > 8192 || w * h > 16_000_000)
    throw new Error(
      "Image is too large. Maximum 16 megapixels and 8192 pixels per edge.",
    );
  const url = URL.createObjectURL(file);
  try {
    const i = await loadImage(url),
      scale = Math.min(1, 2048 / Math.max(i.naturalWidth, i.naturalHeight));
    if (
      !(i.naturalWidth === w && i.naturalHeight === h) &&
      !(i.naturalWidth === h && i.naturalHeight === w)
    )
      throw new Error("Decoded image does not match its header.");
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(i.naturalWidth * scale));
    c.height = Math.max(1, Math.round(i.naturalHeight * scale));
    c.getContext("2d")!.drawImage(i, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/png");
    if (data.length > 3_000_000)
      throw new Error(
        "Artwork is too complex. Try a smaller image (normalized artwork limit: 2 MB).",
      );
    return {
      id: crypto.randomUUID(),
      name: file.name.slice(0, 120),
      width: c.width,
      height: c.height,
      data,
    };
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
