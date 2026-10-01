import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { ARTWORK_LIMITS as L } from "../src/limits";
import { validateProject } from "../src/model";
import { dictionaries } from "../src/i18n";

async function ready(page: Page) {
  await page.goto("./");
  await expect(
    page.getByText(dictionaries.en.saved, { exact: true }),
  ).toBeVisible();
}
async function download(page: Page, name: string, artifact?: string) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const d = await waiting;
  expect(await d.failure()).toBeNull();
  const bytes = await fs.readFile((await d.path())!);
  if (artifact) {
    await fs.mkdir("test-results/uploads", { recursive: true });
    await fs.writeFile("test-results/uploads/" + artifact, bytes);
  }
  return bytes;
}
async function project(page: Page) {
  return validateProject(
    JSON.parse(
      (await download(page, dictionaries.en.project)).toString("utf8"),
    ),
  );
}
async function raster(
  page: Page,
  type: string,
  entropy = true,
  width = 1600,
  height = 1200,
) {
  const result = await page.evaluate(
    async ({ type, entropy, width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      const image = ctx.createImageData(width, height);
      let state = 0x2a9f0713;
      const random = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state & 255;
      };
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const p = (y * width + x) * 4;
          image.data[p] = entropy ? random() : 180;
          image.data[p + 1] = entropy ? random() : 80;
          image.data[p + 2] = entropy ? random() : 50;
          image.data[p + 3] =
            type === "image/png" && entropy
              ? x < 64 && y < 64
                ? 0
                : 40 + (random() % 180)
              : 255;
        }
      ctx.putImageData(image, 0, 0);
      const data = canvas.toDataURL(type, 1);
      const decoded = new Image();
      decoded.src = data;
      await decoded.decode();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(decoded, 0, 0);
      return {
        data,
        oldNormalizedCharacters: canvas.toDataURL("image/png").length,
      };
    },
    { type, entropy, width, height },
  );
  return {
    buffer: Buffer.from(result.data.split(",")[1], "base64"),
    oldNormalizedCharacters: result.oldNormalizedCharacters,
  };
}

test("complex JPEG/WebP/transparent PNG: review, preserve alpha, save, reload and real export/import", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [],
    external: string[] = [],
    metrics: unknown[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith(process.env.LIVE_URL || "http://127.0.0.1:5279")
    )
      external.push(r.url());
  });
  await ready(page);
  const baseline = await project(page);
  for (const [type, name, width, height] of [
    ["image/jpeg", "complex.jpg", 1600, 1200],
    ["image/webp", "complex.webp", 1600, 1200],
    ["image/png", "transparent.png", 1400, 1100],
  ] as const) {
    const locale =
      type === "image/webp" ? "ru" : type === "image/png" ? "kk" : "en";
    await page.locator(".nav select").selectOption(locale);
    const copy = dictionaries[locale];
    const fixture = await raster(page, type, true, width, height);
    expect(fixture.buffer.length).toBeLessThanOrEqual(L.sourceBytes);
    expect(fixture.oldNormalizedCharacters).toBeGreaterThan(
      L.normalizedCharacters,
    );
    const file = { name, mimeType: type, buffer: fixture.buffer };
    await page.locator("input[type=file]").first().setInputFiles(file);
    const dialog = page.getByRole("dialog", { name: copy.resizeTitle });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(copy.resizeBody);
    await expect(dialog).toContainText(`${width} × ${height} px →`);
    if (type === "image/jpeg") {
      await dialog
        .getByRole("button", { name: dictionaries.en.cancel, exact: true })
        .click();
      expect(await project(page)).toEqual(baseline);
      await page.locator("input[type=file]").first().setInputFiles(file);
      await expect(dialog).toBeVisible();
      const violations = (
        await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
      ).violations;
      expect(violations).toEqual([]);
    }
    if (type === "image/png") {
      await page.setViewportSize({ width: 360, height: 780 });
      expect(
        await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
      ).toBe(true);
      await fs.mkdir("test-results/uploads", { recursive: true });
      await dialog.screenshot({
        path: "test-results/uploads/review-kk-mobile.png",
      });
    }
    await dialog
      .getByRole("button", { name: copy.resizeAccept, exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(".nav select").selectOption("en");
    await expect(page.locator(".asset-row")).toContainText(name);
    await page.getByLabel("Revision name", { exact: true }).fill(name);
    await page
      .getByRole("button", { name: dictionaries.en.saveRevision, exact: true })
      .click();
    const p = await project(page),
      asset = p.assets.find((a) => a.name === name)!;
    expect(asset.data.length).toBeLessThanOrEqual(L.normalizedCharacters);
    expect(Math.max(asset.width, asset.height)).toBeGreaterThanOrEqual(
      L.minimumAdaptiveEdge,
    );
    expect(Math.max(asset.width, asset.height)).toBeLessThan(
      Math.max(width, height),
    );
    expect(
      Math.abs(asset.height - (asset.width * height) / width),
    ).toBeLessThanOrEqual(1);
    await expect(page.locator(".raster-info")).toContainText(
      `${asset.width} × ${asset.height} px`,
    );
    await expect(page.locator(".raster-info")).toContainText(
      `${Math.round(asset.width / (30 / 2.54))} DPI`,
    );
    if (type === "image/png") {
      const alpha = await page.evaluate(async (data) => {
        const i = new Image();
        i.src = data;
        await i.decode();
        const c = document.createElement("canvas");
        c.width = i.naturalWidth;
        c.height = i.naturalHeight;
        const x = c.getContext("2d")!;
        x.drawImage(i, 0, 0);
        return [
          x.getImageData(0, 0, 1, 1).data[3],
          x.getImageData(c.width >> 1, c.height >> 1, 1, 1).data[3],
        ];
      }, asset.data);
      expect(alpha[0]).toBe(0);
      expect(alpha[1]).toBeGreaterThan(0);
      expect(alpha[1]).toBeLessThan(255);
    }
    metrics.push({
      name,
      sourceBytes: fixture.buffer.length,
      oldNormalizedCharacters: fixture.oldNormalizedCharacters,
      storedCharacters: asset.data.length,
      width: asset.width,
      height: asset.height,
    });
    await expect(
      page.getByText(dictionaries.en.saved, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText(dictionaries.en.saved, { exact: true }),
    ).toBeVisible();
    expect(await project(page)).toEqual(p);
  }
  await page
    .locator(".stage-toolbar")
    .getByRole("button", { name: "Back", exact: true })
    .click();
  const back = await raster(page, "image/jpeg", false, 320, 200);
  await page.locator("input[type=file]").first().setInputFiles({
    name: "back.jpg",
    mimeType: "image/jpeg",
    buffer: back.buffer,
  });
  await expect(page.locator(".asset-row")).toContainText("back.jpg");
  const before = await project(page);
  const portable = await download(
    page,
    dictionaries.en.project,
    "complex.selvedge.json",
  );
  const png = await download(
    page,
    dictionaries.en.png,
    "complex-contact-sheet.png",
  );
  expect(png.readUInt32BE(0)).toBe(0x89504e47);
  expect(png.readUInt32BE(16)).toBe(1600);
  const pdf = await download(page, dictionaries.en.pdf, "complex-proof.pdf");
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length).toBe(
    3,
  );
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Temporary edit");
  await page.locator("input[type=file]").nth(1).setInputFiles({
    name: "complex.selvedge.json",
    mimeType: "application/json",
    buffer: portable,
  });
  await page
    .getByRole("button", { name: dictionaries.en.confirm, exact: true })
    .click();
  expect(await project(page)).toEqual(before);
  await expect(
    page.getByText(dictionaries.en.saved, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(dictionaries.en.saved, { exact: true }),
  ).toBeVisible();
  expect(await project(page)).toEqual(before);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await fs.writeFile(
    "test-results/uploads/metrics.json",
    JSON.stringify({ metrics, errors, external }, null, 2),
  );
});

test("source bounds and localized failures preserve artwork and the entire project", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await ready(page);
  const small = await raster(page, "image/png", false, 32, 24);
  const atLimit = Buffer.concat([
    small.buffer,
    Buffer.alloc(L.sourceBytes - small.buffer.length),
  ]);
  await page.locator("input[type=file]").first().setInputFiles({
    name: "exact-8mb.png",
    mimeType: "image/png",
    buffer: atLimit,
  });
  await expect(page.locator(".asset-row")).toContainText("exact-8mb.png");
  // An actual 16 MP image remains allowed and follows the documented 2048 px ceiling.
  const maxPixels = await raster(page, "image/jpeg", false, 4000, 4000);
  await page.locator("input[type=file]").first().setInputFiles({
    name: "exact-16mp.jpg",
    mimeType: "image/jpeg",
    buffer: maxPixels.buffer,
  });
  await expect(page.locator(".asset-row")).toContainText("exact-16mp.jpg");
  const before = await project(page);
  expect(before.assets.find((a) => a.name === "exact-16mp.jpg")?.width).toBe(
    L.normalizedEdge,
  );
  const fake = (w: number, h: number) => {
    const b = Buffer.from(small.buffer);
    b.writeUInt32BE(w, 16);
    b.writeUInt32BE(h, 20);
    return b;
  };
  for (const locale of ["en", "ru", "kk"] as const) {
    await page.locator(".nav select").selectOption(locale);
    const t = dictionaries[locale];
    for (const [buffer, message] of [
      [Buffer.concat([atLimit, Buffer.from([0])]), t.artworkSize],
      [Buffer.alloc(0), t.artworkSize],
      [fake(4001, 4000), t.artworkPixels],
      [fake(8193, 1), t.artworkPixels],
      [Buffer.from("<svg/>"), t.artworkFormat],
      [fake(20, 20), t.artworkDecode],
    ] as const) {
      await page
        .locator("input[type=file]")
        .first()
        .setInputFiles({ name: "rejected.png", mimeType: "image/png", buffer });
      await expect(page.getByRole("alert")).toContainText(message);
      await expect(page.locator(".asset-row")).toContainText("exact-16mp.jpg");
      await page
        .getByRole("alert")
        .getByRole("button", { name: t.close })
        .click();
    }
    await page.locator(".nav select").selectOption("en");
    expect(await project(page)).toEqual(before);
  }
});

test("portable import accepts artwork just below the shared cap and rejects overflow without mutation", async ({
  page,
}) => {
  await ready(page);
  const p = await project(page);
  const tiny = await raster(page, "image/png", false, 32, 24);
  const prefix = "data:image/png;base64,";
  const bytes = Math.floor((L.normalizedCharacters - prefix.length) / 4) * 3;
  const padded = Buffer.concat([
    tiny.buffer,
    Buffer.alloc(bytes - tiny.buffer.length),
  ]);
  p.assets = [
    {
      id: "boundary",
      name: "boundary.png",
      width: 32,
      height: 24,
      data: prefix + padded.toString("base64"),
    },
  ];
  p.revisions = [];
  p.snapshot.variants.forEach((v) => {
    v.front.asset = "boundary";
    v.back.asset = null;
  });
  expect(p.assets[0].data.length).toBeLessThanOrEqual(L.normalizedCharacters);
  expect(p.assets[0].data.length).toBeGreaterThan(L.normalizedCharacters - 4);
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "boundary.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await page
    .getByRole("button", { name: dictionaries.en.confirm, exact: true })
    .click();
  expect(await project(page)).toEqual(p);
  await expect(
    page.getByText(dictionaries.en.saved, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(dictionaries.en.saved, { exact: true }),
  ).toBeVisible();
  expect(await project(page)).toEqual(p);
  const tooLarge = structuredClone(p);
  tooLarge.assets[0].data += "AAAA";
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "overflow.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(tooLarge)),
    });
  await expect(page.getByRole("alert")).toContainText(
    "Invalid or unsupported project",
  );
  expect(await project(page)).toEqual(p);
});
