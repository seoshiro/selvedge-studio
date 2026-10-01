import { describe, expect, it } from "vitest";
import {
  applyPlacement,
  clone,
  dpi,
  geometry,
  placement,
  seed,
  validateProject,
  pruneAssets,
  type Asset,
} from "../src/model";
import { headerDimensions, readArtwork } from "../src/images";
import { ARTWORK_LIMITS as L } from "../src/limits";
const asset: Asset = {
  id: "test",
  data: "data:image/png;base64,iVBORw0KGgo=",
  width: 1000,
  height: 500,
  name: "test.png",
};
describe("collection geometry and revision model", () => {
  it("uses the shared normalized limits at exact import boundaries", () => {
    const p = seed();
    const prefix = "data:image/png;base64,";
    p.assets = [
      {
        ...asset,
        width: L.normalizedEdge,
        height: 1,
        data: prefix + "A".repeat(L.normalizedCharacters - prefix.length),
      },
    ];
    expect(validateProject(p).assets[0].data.length).toBe(
      L.normalizedCharacters,
    );
    p.assets[0].data += "A";
    expect(() => validateProject(p)).toThrow();
    p.assets[0] = { ...asset, width: L.normalizedEdge + 1 };
    expect(() => validateProject(p)).toThrow();
  });
  it("rejects source byte and pixel overflow before attempting a browser decode", async () => {
    await expect(readArtwork(new File([], "empty.png"))).rejects.toMatchObject({
      code: "artworkSize",
    });
    await expect(
      readArtwork(new File([new Uint8Array(L.sourceBytes + 1)], "large.png")),
    ).rejects.toMatchObject({ code: "artworkSize" });
    const b = new Uint8Array(32),
      d = new DataView(b.buffer);
    d.setUint32(0, 0x89504e47);
    d.setUint32(4, 0x0d0a1a0a);
    d.setUint32(16, 4001);
    d.setUint32(20, 4000);
    await expect(
      readArtwork(new File([b], "pixels.png")),
    ).rejects.toMatchObject({ code: "artworkPixels" });
    d.setUint32(16, 8193);
    d.setUint32(20, 1);
    await expect(readArtwork(new File([b], "edge.png"))).rejects.toMatchObject({
      code: "artworkPixels",
    });
  });
  it("rejects empty reference identifiers and aggregate asset overflow", () => {
    const p = seed();
    p.snapshot.variants[0].front.asset = "";
    expect(() => validateProject(p)).toThrow();
    const bad = seed();
    bad.snapshot.variants[0].id = "";
    expect(() => validateProject(bad)).toThrow();
    const huge = seed();
    huge.assets = Array.from({ length: 7 }, (_, i) => ({
      ...asset,
      id: String(i),
      data: "data:image/png;base64," + "A".repeat(2_999_970),
    }));
    expect(() => validateProject(huge)).toThrow();
  });
  it("maps authored cm dimensions proportionally and reports normalized DPI", () => {
    const p = placement("test"),
      g = geometry(p, asset);
    expect(g.width).toBeCloseTo(112.8);
    expect(g.height).toBeCloseTo(56.4);
    expect(g.cx).toBe(250);
    expect(dpi(p, asset)).toBe(106);
  });
  it("applies front placement to every variant without changing the back or snapshot", () => {
    const s = seed().snapshot,
      n = applyPlacement(s, "color-0", "front", { width: 32, x: 2 }, true);
    expect(
      n.variants.every((v) => v.front.width === 32 && v.front.x === 2),
    ).toBe(true);
    expect(n.variants.every((v) => v.back.width === 24)).toBe(true);
    expect(s.variants[0].front.width).toBe(24);
  });
  it("keeps revision snapshots independent of later edits", () => {
    const p = seed(),
      saved = clone(p.snapshot);
    p.snapshot = applyPlacement(p.snapshot, "color-0", "back", { width: 10 });
    expect(saved.variants[0].back.width).toBe(24);
  });
  it("rebuilds input objects and rejects unsupported versions, unsafe colors, unknown artwork and oversized lists", () => {
    const p = seed();
    expect(validateProject({ ...p, injected: "ignored" })).toEqual(p);
    for (const mutation of [
      (x: ReturnType<typeof seed>) => {
        x.schema = 2 as 1;
      },
      (x: ReturnType<typeof seed>) => {
        x.snapshot.variants[0].color = "url(x)";
      },
      (x: ReturnType<typeof seed>) => {
        x.snapshot.variants[0].front.asset = "missing";
      },
      (x: ReturnType<typeof seed>) => {
        x.snapshot.variants[0].front.width = Infinity;
      },
      (x: ReturnType<typeof seed>) => {
        x.snapshot.variants = Array(7).fill(x.snapshot.variants[0]);
      },
    ]) {
      const next = clone(p);
      mutation(next);
      expect(() => validateProject(next)).toThrow();
    }
  });
  it("rejects network assets and duplicate IDs", () => {
    const p = seed();
    p.assets = [{ ...asset, data: "https://example.com/art.png" }];
    expect(() => validateProject(p)).toThrow();
    p.assets = [asset, asset];
    expect(() => validateProject(p)).toThrow();
  });
  it("preserves referenced revision assets during pruning", () => {
    const p = seed();
    p.assets = [asset, { ...asset, id: "unused" }];
    p.revisions = [
      {
        id: "r",
        name: "r",
        date: new Date().toISOString(),
        snapshot: applyPlacement(p.snapshot, "color-0", "front", {
          asset: "test",
        }),
      },
    ];
    expect(pruneAssets(p).assets.map((a) => a.id)).toEqual(["test"]);
  });
  it("reads PNG dimensions before decoding and rejects forged SVG", () => {
    const b = new Uint8Array(32),
      d = new DataView(b.buffer);
    d.setUint32(0, 0x89504e47);
    d.setUint32(4, 0x0d0a1a0a);
    d.setUint32(16, 4000);
    d.setUint32(20, 3000);
    expect(headerDimensions(b)).toEqual([4000, 3000]);
    expect(() =>
      headerDimensions(new TextEncoder().encode("<svg/>")),
    ).toThrow();
  });
});
