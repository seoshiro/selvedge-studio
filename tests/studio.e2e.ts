import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { validateProject, type Project } from "../src/model";
const ready = async (page: Page) => {
  await page.goto("./");
  await expect(
    page.getByText("Saved in this browser", { exact: true }),
  ).toBeVisible();
};
async function artwork(
  page: Page,
  type = "image/png",
  width = 640,
  height = 400,
) {
  const data = await page.evaluate(
    ({ type, width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const x = c.getContext("2d")!;
      x.fillStyle = "#a64930";
      x.fillRect(0, 0, width, height);
      x.fillStyle = "#f4dfaa";
      x.fillRect(width * 0.12, height * 0.2, width * 0.76, height * 0.6);
      x.fillStyle = "#243b36";
      x.font = "bold 48px Arial";
      x.fillText("NIGHT FIELD", width * 0.15, height * 0.6);
      return c.toDataURL(type);
    },
    { type, width, height },
  );
  return Buffer.from(data.split(",")[1], "base64");
}
async function download(page: Page, name: string, file?: string) {
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const d = await promise;
  expect(await d.failure()).toBeNull();
  const path = await d.path();
  const bytes = await fs.readFile(path!);
  if (file) {
    await fs.mkdir("test-results/downloads", { recursive: true });
    await fs.writeFile("test-results/downloads/" + file, bytes);
  }
  return bytes;
}
async function project(page: Page) {
  return validateProject(
    JSON.parse((await download(page, "Portable project")).toString("utf8")),
  );
}
async function number(page: Page, name: string, value: number) {
  await page.getByRole("spinbutton", { name, exact: true }).fill(String(value));
}

test("golden path: upload, both sides, colorways, revisions, real downloads and exact restore", async ({
  page,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith(process.env.LIVE_URL || "http://127.0.0.1:5279")
    )
      requests.push(r.url());
  });
  await ready(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "night-field.png",
      mimeType: "image/png",
      buffer: await artwork(page),
    });
  await expect(page.locator(".asset-row")).toContainText("night-field.png");
  await number(page, "Print width", 28);
  await number(page, "Horizontal offset", 3.5);
  await number(page, "Below collar", 12);
  await number(page, "Rotation", 7);
  await page
    .getByRole("button", { name: "Apply placement to all", exact: true })
    .click();
  await page
    .locator(".stage-toolbar")
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "back-mark.jpg",
      mimeType: "image/jpeg",
      buffer: await artwork(page, "image/jpeg", 512, 320),
    });
  await expect(page.locator(".asset-row")).toContainText("back-mark.jpg");
  await number(page, "Print width", 12);
  await number(page, "Below collar", 8);
  await page
    .getByRole("button", { name: "Apply placement to all", exact: true })
    .click();
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Night Field / 002");
  await page
    .getByLabel("Proof notes", { exact: true })
    .fill("Organic cotton. Two colors.\nConfirm final size with printer.");
  await page.getByLabel("Custom color", { exact: true }).fill("#526755");
  await page.getByLabel("Color name", { exact: true }).fill("Forest");
  await page.getByRole("button", { name: "Add colorway", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove colorway", exact: true })
    .click();
  await page
    .getByLabel("Revision name", { exact: true })
    .fill("Print study 02");
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await number(page, "Print width", 20);
  await page
    .locator(".revision-open")
    .filter({ hasText: "Print study 02" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .locator("dialog")
    .getByRole("button", { name: "Front", exact: true })
    .click();
  await expect(page.locator(".compare-grid svg")).toHaveCount(2);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Restore revision", exact: true })
    .click();
  const before = await project(page);
  expect(before.snapshot.variants).toHaveLength(3);
  expect(
    before.snapshot.variants.every(
      (v) => v.front.width === 28 && v.front.angle === 7 && v.back.width === 12,
    ),
  ).toBe(true);
  expect(before.assets).toHaveLength(3);
  expect(before.revisions).toHaveLength(2);
  const png = await download(
    page,
    "Contact sheet · PNG",
    "golden-contact-sheet.png",
  );
  expect(png.readUInt32BE(0)).toBe(0x89504e47);
  expect(png.readUInt32BE(16)).toBe(1600);
  expect(png.length).toBeGreaterThan(40_000);
  const pdf = await download(page, "Visual proof · PDF", "golden-proof.pdf");
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length).toBe(
    3,
  );
  await expect(
    page.getByText("Saved in this browser", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Collection name", { exact: true })).toHaveValue(
    "Night Field / 002",
  );
  expect((await project(page)).snapshot).toEqual(before.snapshot);
  await page
    .getByRole("button", { name: "Start a fresh study", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep working", exact: true }).click();
  expect((await project(page)).snapshot).toEqual(before.snapshot);
  await page
    .getByRole("button", { name: "Start a fresh study", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Replace study", exact: true })
    .click();
  expect((await project(page)).assets).toHaveLength(0);
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "restore.selvedge.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(before)),
    });
  await page
    .getByRole("button", { name: "Replace study", exact: true })
    .click();
  const after = await project(page);
  expect(after).toEqual(before);
  await expect(
    page.getByText("Saved in this browser", { exact: true }),
  ).toBeVisible();
  await page.reload();
  expect(await project(page)).toEqual(before);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});
test("artwork retained when a revision is deleted then upload is undone", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "new.png",
      mimeType: "image/png",
      buffer: await artwork(page),
    });
  await expect(page.locator(".asset-row")).toContainText("new.png");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete revision: First study", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const p = await project(page);
  expect(p.snapshot.variants[0].front.asset).toBe("after-hours");
  expect(p.assets.some((a) => a.id === "after-hours")).toBe(true);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await project(page)).snapshot.variants[0].front.asset).not.toBe(
    "after-hours",
  );
});
test("raster edge cases, forged imports, empty sides, cancellation, and all editor controls", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "line.png",
      mimeType: "image/png",
      buffer: await artwork(page, "image/png", 1, 8192),
    });
  await expect(page.locator(".asset-row")).toContainText("line.png");
  let p = await project(page);
  expect(p.assets.at(-1)?.width).toBe(1);
  expect(p.assets.at(-1)?.height).toBe(2048);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "webp-mark.webp",
      mimeType: "image/webp",
      buffer: await artwork(page, "image/webp", 320, 200),
    });
  await expect(page.locator(".asset-row")).toContainText("webp-mark.webp");
  const jpeg = await artwork(page, "image/jpeg", 20, 30);
  const oriented = Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from(
      "ffe1002245786966000049492a0008000000010012010300010000000600000000000000",
      "hex",
    ),
    jpeg.subarray(2),
  ]);
  await page.locator("input[type=file]").first().setInputFiles({
    name: "oriented.jpg",
    mimeType: "image/jpeg",
    buffer: oriented,
  });
  await expect(page.locator(".asset-row")).toContainText("oriented.jpg");
  const orientedProject = await project(page);
  expect(orientedProject.assets.at(-1)?.width).toBe(30);
  expect(orientedProject.assets.at(-1)?.height).toBe(20);
  await page
    .getByRole("button", { name: "Remove artwork", exact: true })
    .click();
  await expect(
    page.getByText("Add artwork to this side", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByRole("button", { name: "Center artwork", exact: true })
    .click();
  await page.getByRole("button", { name: "Guides", exact: true }).click();
  expect(
    await page
      .getByRole("button", { name: "Guides", exact: true })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "unsafe.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    });
  await expect(page.getByRole("alert")).toContainText("valid PNG");
  await page.getByRole("alert").getByRole("button", { name: "Close" }).click();
  p = await project(page);
  const forged: Project = structuredClone(p);
  forged.assets[0].data = "https://evil.example/image.png";
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(forged)),
    });
  await expect(page.getByRole("alert")).toContainText("Invalid or unsupported");
  expect((await project(page)).snapshot).toEqual(p.snapshot);
  await page.getByRole("alert").getByRole("button", { name: "Close" }).click();
  await page
    .getByRole("button", { name: "Add colorway: Mist", exact: true })
    .click();
  await expect(page.getByLabel("Color name", { exact: true })).toHaveValue(
    "Mist",
  );
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your artwork stays yours",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("cross-tab writes preserve the first writer and offer export on conflict", async ({
  page,
  context,
}) => {
  await ready(page);
  const tab = await context.newPage();
  await ready(tab);
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("First writer");
  await expect(
    page.getByText("Saved in this browser", { exact: true }),
  ).toBeVisible();
  await tab
    .getByLabel("Collection name", { exact: true })
    .fill("Second writer");
  await expect(tab.getByRole("alert")).toContainText("changed in another tab");
  expect((await project(tab)).snapshot.name).toBe("Second writer");
  await page.reload();
  await expect(page.getByLabel("Collection name", { exact: true })).toHaveValue(
    "First writer",
  );
  await tab.close();
});
test("mouse placement, pointer cancellation, and keyboard undo", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#studio").scrollIntoViewIfNeeded();
  const svg = page.locator(".stage>svg"),
    box = (await svg.boundingBox())!;
  const x = box.x + box.width * 0.5,
    y = box.y + box.height * 0.44;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y + 15, { steps: 4 });
  await page.mouse.up();
  expect(
    Number(
      await page
        .getByRole("spinbutton", { name: "Horizontal offset", exact: true })
        .inputValue(),
    ),
  ).not.toBe(0);
  await page.locator(".stage").click({ position: { x: 10, y: 10 } });
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("spinbutton", { name: "Horizontal offset", exact: true }),
  ).toHaveValue("0");
});
test("responsive locales, zoom, reduced motion, keyboard, and accessibility", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  for (const locale of ["en", "ru", "kk"]) {
    await page.locator(".nav select").selectOption(locale);
    for (const width of [320, 360, 390, 414, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.locator("#studio").scrollIntoViewIfNeeded();
      expect(await page.locator(".stage>svg").isVisible()).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.locator(".nav select").selectOption("en");
  await page.setViewportSize({ width: 844, height: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 720, height: 500 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1";
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".hero-visual")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.goto("./");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await fs.writeFile(
    "test-results/axe.json",
    JSON.stringify(results.violations, null, 2),
  );
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});
test("touch placement keeps the active finger when another finger lifts", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });
  await page
    .locator(".stage-tools")
    .getByRole("button", { name: "Placement", exact: true })
    .click();
  const svg = page.locator(".stage>svg");
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height * 0.43;
  const first = { x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [first],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      first,
      { x: x + 30, y: y + 20, id: 2, radiusX: 2, radiusY: 2, force: 1 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [
      { x: x + 30, y: y + 20, id: 2, radiusX: 2, radiusY: 2, force: 1 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...first, x: x + 25, y: y + 15 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    Number(
      await page
        .getByRole("spinbutton", { name: "Horizontal offset", exact: true })
        .inputValue(),
    ),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Horizontal offset", exact: true }),
  ).toHaveValue("0");
});
test("long notes and long locale strings export all content with extra PDF note pages", async ({
  page,
}) => {
  await ready(page);
  const notes = Array.from(
    { length: 40 },
    (_, i) => `Line ${i + 1}: Ұзын ескертпе / длинная заметка`,
  )
    .join("\n")
    .slice(0, 1000);
  await page.getByLabel("Proof notes", { exact: true }).fill(notes);
  await page
    .getByLabel("Color name", { exact: true })
    .fill("VeryLongUnbrokenColorNameForOverflowCheck");
  const png = await download(page, "Contact sheet · PNG", "long-notes.png");
  expect(png.readUInt32BE(20)).toBeGreaterThan(2200);
  const pdf = await download(page, "Visual proof · PDF", "long-notes.pdf");
  expect(
    (pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length,
  ).toBeGreaterThan(3);
  expect((await project(page)).snapshot.notes).toEqual(notes);
});
