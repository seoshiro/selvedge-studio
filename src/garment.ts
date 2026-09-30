import { geometry, type Asset, type Side, type Variant } from "./model";
export const teePath =
  "M191 53Q250 75 309 53L371 75Q399 88 413 113L461 184L399 226L367 181L373 482Q372 505 354 510Q250 520 146 510Q128 505 127 482L133 181L101 226L39 184L87 113Q101 88 129 75Z";
const escape = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function garmentInner(
  v: Variant,
  side: Side,
  assets: Asset[],
  uid = "tee",
  guides = false,
) {
  const a = assets.find((a) => a.id === v[side].asset),
    g = geometry(v[side], a),
    dark = parseInt(v.color.slice(1, 3), 16) < 130;
  return `<defs><linearGradient id="${uid}-light" x1="0" y1="0" x2="1" y2=".5"><stop stop-color="#fff" stop-opacity=".19"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient><linearGradient id="${uid}-fold"><stop stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></linearGradient><pattern id="${uid}-grain" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1H4M1 0V4" stroke="${dark ? "#fff" : "#151a19"}" stroke-opacity=".035" stroke-width=".55"/></pattern><clipPath id="${uid}-clip"><path d="${teePath}"/></clipPath></defs>
  <path d="${teePath}" fill="#171c19" opacity=".08" transform="translate(0 12)"/>
  <path d="${teePath}" fill="${v.color}" stroke="#222a25" stroke-opacity=".18" stroke-width="1"/>
  <path d="${teePath}" fill="url(#${uid}-light)"/>
  <g clip-path="url(#${uid}-clip)"><path d="M134 149Q170 214 157 498L173 501Q164 277 146 180ZM365 148Q330 279 349 508L334 512Q323 290 355 182Z" fill="url(#${uid}-fold)"/>
  <path d="M127 111Q191 111 216 186M373 111Q309 111 284 186M139 230Q169 325 150 461M360 244Q329 331 350 483M189 467Q248 479 318 470" fill="none" stroke="#000" stroke-opacity=".065" stroke-width="3"/>
  <path d="${teePath}" fill="url(#${uid}-grain)"/>
  ${a ? `<image href="${escape(a.data)}" x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" preserveAspectRatio="none" transform="rotate(${v[side].angle} ${g.cx} ${g.cy})"/>` : ""}</g>
  <g fill="none" stroke="#141a17" stroke-opacity=".14" stroke-width="1.2"><path d="M194 58Q250 ${side === "front" ? 141 : 84} 306 58" stroke-width="8"/><path d="M193 56Q250 ${side === "front" ? 133 : 80} 307 56" stroke="${dark ? "#ffffff" : "#000000"}" stroke-opacity=".14" stroke-width="1"/><path d="M129 78L144 164M371 78L356 164M48 180L102 216M452 180L398 216M129 489Q250 500 371 489"/><path d="M131 493Q250 504 369 493M52 176L106 212M448 176L394 212" stroke-dasharray="2 3" stroke-opacity=".1"/></g>
  ${side === "back" ? '<path d="M239 69H261V77H239Z" fill="#fff" opacity=".2"/>' : ""}
  ${guides ? `<path d="M250 78V514" stroke="#8b453e" stroke-dasharray="4 6" opacity=".35"/><rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" transform="rotate(${v[side].angle} ${g.cx} ${g.cy})" fill="none" stroke="#943e35" stroke-dasharray="4 4" stroke-width="1.5"/>` : ""}`;
}
export const garmentSvg = (
  v: Variant,
  side: Side,
  assets: Asset[],
  uid = "export",
) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="560" viewBox="0 0 500 560">${garmentInner(v, side, assets, uid)}</svg>`;
