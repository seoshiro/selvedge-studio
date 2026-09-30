import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
await fs.mkdir("docs/gallery", { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => console.log("ERROR", e.message));
await page.goto(process.env.LIVE_URL || "http://127.0.0.1:5279");
await page.getByText("Saved in this browser", { exact: true }).waitFor();
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "docs/gallery/01-home.png" });
await page.locator("#studio").scrollIntoViewIfNeeded();
await page.screenshot({ path: "docs/gallery/02-studio.png" });
await page
  .getByRole("button", { name: "First study", exact: false })
  .first()
  .click();
await page
  .locator("dialog")
  .screenshot({ path: "docs/gallery/03-revisions.png" });
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => scrollTo(0, 0));
await page.screenshot({ path: "docs/gallery/04-mobile.png" });
await page.locator("#studio").scrollIntoViewIfNeeded();
await page.screenshot({ path: "docs/gallery/05-mobile-studio.png" });
await page.setViewportSize({ width: 1440, height: 1000 });
await page.locator(".nav select").selectOption("kk");
await page.locator("#studio").scrollIntoViewIfNeeded();
await page.screenshot({ path: "docs/gallery/06-kazakh.png" });
console.log(
  JSON.stringify({
    captured: 4,
    scrollWidth: await page.evaluate(
      () => document.documentElement.scrollWidth,
    ),
  }),
);
await browser.close();
