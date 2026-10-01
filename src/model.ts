import { ARTWORK_LIMITS } from "./limits";
export type Side = "front" | "back";
export type Placement = {
  x: number;
  y: number;
  width: number;
  angle: number;
  asset: string | null;
};
export type Variant = {
  id: string;
  color: string;
  name: string;
  front: Placement;
  back: Placement;
};
export type Snapshot = { name: string; notes: string; variants: Variant[] };
export type Asset = {
  id: string;
  data: string;
  width: number;
  height: number;
  name: string;
};
export type Revision = {
  id: string;
  name: string;
  date: string;
  snapshot: Snapshot;
};
export type Project = {
  schema: 1;
  snapshot: Snapshot;
  assets: Asset[];
  revisions: Revision[];
};
export const COLORS = [
  { name: "Chalk", color: "#e7e2d4" },
  { name: "Washed ink", color: "#333c3c" },
  { name: "Oxblood", color: "#662f37" },
  { name: "Moss", color: "#72715c" },
  { name: "Clay", color: "#b97960" },
  { name: "Mist", color: "#a0b6bc" },
];
export const clone = <T>(v: T): T => structuredClone(v);
export const placement = (asset: string | null = null): Placement => ({
  x: 0,
  y: 14,
  width: 24,
  angle: 0,
  asset,
});
export const seed = (): Project => ({
  schema: 1,
  assets: [],
  revisions: [],
  snapshot: {
    name: "After Hours / 001",
    notes:
      "Heavyweight cotton · relaxed fit\nStudy of light, wings, and the hours in between.",
    variants: COLORS.slice(0, 3).map((c, i) => ({
      ...c,
      id: `color-${i}`,
      front: placement(),
      back: placement(),
    })),
  },
});
export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
export function geometry(p: Placement, a?: Asset) {
  const width = p.width * 4.7;
  const height = width * (a ? a.height / a.width : 1);
  return {
    x: 250 + p.x * 4.7 - width / 2,
    y: 82 + p.y * 4.7,
    width,
    height,
    cx: 250 + p.x * 4.7,
    cy: 82 + p.y * 4.7 + height / 2,
  };
}
export const dpi = (p: Placement, a?: Asset) =>
  a ? Math.round(a.width / (p.width / 2.54)) : null;
export function applyPlacement(
  s: Snapshot,
  id: string,
  side: Side,
  patch: Partial<Placement>,
  all = false,
): Snapshot {
  return {
    ...s,
    variants: s.variants.map((v) =>
      v.id === id || all ? { ...v, [side]: { ...v[side], ...patch } } : v,
    ),
  };
}
const fail = (): never => {
  throw new Error(
    "Invalid or unsupported project. Use a SELVEDGE project (up to 24 MB).",
  );
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail();
const str = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max ? v : fail();
const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : fail();
const identifier = (v: unknown) => {
  const id = str(v, 80);
  return id.length ? id : fail();
};
const list = (v: unknown, max: number): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : fail();
export function validateProject(value: unknown): Project {
  const root = obj(value);
  if (root.schema !== 1) fail();
  let total = 0;
  const assets: Asset[] = list(root.assets, ARTWORK_LIMITS.assets).map(
    (value) => {
      const a = obj(value),
        data = str(a.data, ARTWORK_LIMITS.normalizedCharacters);
      total += data.length;
      if (
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          data,
        ) ||
        total > ARTWORK_LIMITS.totalCharacters
      )
        fail();
      return {
        id: identifier(a.id),
        data,
        width: num(a.width, 1, ARTWORK_LIMITS.normalizedEdge),
        height: num(a.height, 1, ARTWORK_LIMITS.normalizedEdge),
        name: str(a.name, 120),
      };
    },
  );
  const ids = new Set(assets.map((a) => a.id));
  if (ids.size !== assets.length) fail();
  const parsePlacement = (value: unknown): Placement => {
    const p = obj(value),
      asset = p.asset === null ? null : identifier(p.asset);
    if (asset !== null && !ids.has(asset)) fail();
    return {
      x: num(p.x, -15, 15),
      y: num(p.y, 0, 55),
      width: num(p.width, 4, 36),
      angle: num(p.angle, -180, 180),
      asset,
    };
  };
  const parseSnapshot = (value: unknown): Snapshot => {
    const s = obj(value),
      variants = list(s.variants, 6).map((value) => {
        const v = obj(value),
          color = str(v.color, 7);
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) fail();
        return {
          id: identifier(v.id),
          name: str(v.name, 40),
          color,
          front: parsePlacement(v.front),
          back: parsePlacement(v.back),
        };
      });
    if (
      !variants.length ||
      new Set(variants.map((v) => v.id)).size !== variants.length
    )
      fail();
    return { name: str(s.name, 80), notes: str(s.notes, 1000), variants };
  };
  const revisions = list(root.revisions, 8).map((value) => {
    const r = obj(value),
      date = str(r.date, 40);
    if (!Number.isFinite(Date.parse(date))) fail();
    return {
      id: identifier(r.id),
      name: str(r.name, 60),
      date,
      snapshot: parseSnapshot(r.snapshot),
    };
  });
  if (new Set(revisions.map((r) => r.id)).size !== revisions.length) fail();
  return {
    schema: 1,
    assets,
    revisions,
    snapshot: parseSnapshot(root.snapshot),
  };
}
export function pruneAssets(p: Project): Project {
  const used = new Set(
    [p.snapshot, ...p.revisions.map((r) => r.snapshot)].flatMap((s) =>
      s.variants.flatMap((v) => [v.front.asset, v.back.asset]),
    ),
  );
  return { ...p, assets: p.assets.filter((a) => used.has(a.id)) };
}
