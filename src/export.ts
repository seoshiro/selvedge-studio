import { garmentSvg } from "./garment";
import { loadImage } from "./images";
import { dpi, type Project, type Side, type Variant } from "./model";
import type { Copy } from "./i18n";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
const filename = (s: string) =>
  s.replace(/[^a-zA-Z0-9\u0400-\u04ff-]+/g, "-").slice(0, 60) ||
  "selvedge-study";
export function wrapLines(
  ctx: CanvasRenderingContext2D,
  s: string,
  max: number,
  size: number,
) {
  ctx.font = `${size}px "DM Sans", Arial, sans-serif`;
  const lines: string[] = [];
  for (const paragraph of s
    .trim()
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      if (ctx.measureText(line + word).width > max && line) {
        lines.push(line.trimEnd());
        line = "";
      }
      if (ctx.measureText(word).width > max) {
        for (const char of word) {
          if (ctx.measureText(line + char).width > max) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
        line += " ";
      } else line += word + " ";
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  max: number,
  size = 20,
) {
  ctx.font = `${size}px "DM Sans", Arial, sans-serif`;
  for (const line of wrapLines(ctx, s, max, size)) {
    ctx.fillText(line, x, y);
    y += size * 1.5;
  }
  return y;
}
async function drawTee(
  ctx: CanvasRenderingContext2D,
  v: Variant,
  side: Side,
  p: Project,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const i = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(garmentSvg(v, side, p.assets))}`,
  );
  const scale = Math.min(w / 500, h / 560);
  ctx.drawImage(
    i,
    x + (w - 500 * scale) / 2,
    y + (h - 560 * scale) / 2,
    500 * scale,
    560 * scale,
  );
}
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4f1e9";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#242d2b";
  return { c, ctx };
}
function header(ctx: CanvasRenderingContext2D, p: Project, t: Copy, w: number) {
  ctx.font = '500 26px "DM Sans", Arial';
  ctx.fillText("SELVEDGE / COLLECTION PROOF", 64, 62);
  ctx.font = '72px "Instrument Serif", Georgia';
  ctx.fillText(p.snapshot.name, 64, 153, w - 128);
  ctx.strokeStyle = "#cfcac0";
  ctx.beginPath();
  ctx.moveTo(64, 186);
  ctx.lineTo(w - 64, 186);
  ctx.stroke();
  text(ctx, t.warning, 64, 226, w - 128, 21);
}
export async function exportPNG(p: Project, t: Copy) {
  await document.fonts.ready;
  const measure = canvas(1600, 1).ctx;
  const noteLines = wrapLines(
    measure,
    `${t.notes}\n${p.snapshot.notes}`,
    1472,
    20,
  );
  const rows = Math.ceil(p.snapshot.variants.length / 3),
    { c, ctx } = canvas(
      1600,
      330 + rows * 1100 + Math.max(120, noteLines.length * 30 + 70),
    );
  header(ctx, p, t, c.width);
  for (let i = 0; i < p.snapshot.variants.length; i++) {
    const v = p.snapshot.variants[i],
      x = 50 + (i % 3) * 500,
      y = 290 + Math.floor(i / 3) * 1100;
    ctx.fillStyle = "#242d2b";
    ctx.font = '500 26px "DM Sans", Arial';
    ctx.fillText(
      `${String(i + 1).padStart(2, "0")} / ${v.name}`,
      x + 24,
      y,
      450,
    );
    ctx.font = '18px "DM Sans", Arial';
    ctx.fillText(v.color.toUpperCase(), x + 24, y + 30);
    for (const [j, side] of (["front", "back"] as Side[]).entries()) {
      const top = y + 50 + j * 525;
      await drawTee(ctx, v, side, p, x, top, 480, 450);
      const a = p.assets.find((a) => a.id === v[side].asset);
      ctx.fillStyle = "#242d2b";
      text(
        ctx,
        `${t[side]} / ${a ? `${v[side].width} × ${((v[side].width * a.height) / a.width).toFixed(1)} cm · ${dpi(v[side], a)} DPI · x ${v[side].x} · y ${v[side].y} cm · ${v[side].angle}°` : t.noArt}`,
        x + 24,
        top + 450,
        430,
        17,
      );
    }
  }
  ctx.fillStyle = "#242d2b";
  text(
    ctx,
    `${t.notes}\n${p.snapshot.notes}`,
    64,
    330 + rows * 1100,
    c.width - 128,
    20,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG export failed."))),
      "image/png",
    ),
  );
  download(blob, `${filename(p.snapshot.name)}-contact-sheet.png`);
}
export async function exportPDF(p: Project, t: Copy) {
  const { jsPDF } = await import("jspdf");
  await document.fonts.ready;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const noteLines = wrapLines(
    canvas(1200, 1).ctx,
    `${t.notes}\n${p.snapshot.notes}`,
    1072,
    18,
  );
  for (const [i, v] of p.snapshot.variants.entries()) {
    if (i) pdf.addPage();
    const { c, ctx } = canvas(1200, 1697);
    header(ctx, p, t, c.width);
    ctx.font = '500 28px "DM Sans", Arial';
    ctx.fillText(
      `${String(i + 1).padStart(2, "0")} / ${v.name} / ${v.color.toUpperCase()}`,
      64,
      294,
      1072,
    );
    for (const [j, side] of (["front", "back"] as Side[]).entries()) {
      const x = 35 + j * 570;
      await drawTee(ctx, v, side, p, x, 350, 560, 620);
      ctx.fillStyle = "#242d2b";
      text(ctx, t[side], x + 40, 1010, 480, 28);
      const a = p.assets.find((a) => a.id === v[side].asset);
      text(
        ctx,
        a
          ? `${t.dimensions}: ${v[side].width} × ${((v[side].width * a.height) / a.width).toFixed(1)} cm\nX: ${v[side].x} cm / Y: ${v[side].y} cm / ${v[side].angle}°\n${t.raster}: ${dpi(v[side], a)} DPI`
          : t.noArt,
        x + 40,
        1060,
        480,
        22,
      );
    }
    text(
      ctx,
      noteLines.length <= 11
        ? `${t.notes}\n${p.snapshot.notes}`
        : `${t.notes} →\n${noteLines.slice(1, 3).join("\n")}…`,
      64,
      1250,
      1072,
      18,
    );
    text(ctx, t.normalized, 64, 1610, 1072, 16);
    pdf.addImage(c.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297);
  }
  if (noteLines.length > 11) {
    for (let offset = 0; offset < noteLines.length; offset += 42) {
      pdf.addPage();
      const { c, ctx } = canvas(1200, 1697);
      header(ctx, p, t, c.width);
      ctx.font = '18px "DM Sans", Arial, sans-serif';
      noteLines
        .slice(offset, offset + 42)
        .forEach((line, i) => ctx.fillText(line, 64, 310 + i * 27));
      pdf.addImage(c.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297);
    }
  }
  pdf.setProperties({
    title: p.snapshot.name,
    subject: "SELVEDGE visual collection proof",
    creator: "SELVEDGE browser-local studio",
  });
  download(pdf.output("blob"), `${filename(p.snapshot.name)}-visual-proof.pdf`);
}
export const exportProject = (p: Project) =>
  download(
    new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }),
    `${filename(p.snapshot.name)}.selvedge.json`,
  );
