import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const context = await browser.newContext({
  viewport: { width: 720, height: 500 },
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:5279");
await page.getByText("Saved in this browser", { exact: true }).waitFor();
await page.evaluate(() => (document.documentElement.style.zoom = "2"));
console.log(
  JSON.stringify(
    await page.evaluate(() => ({
      inner: innerWidth,
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      elements: [...document.querySelectorAll("body *")]
        .map((e) => ({
          tag: e.tagName,
          cls: e.className,
          text: e.textContent?.slice(0, 80),
          parent: e.parentElement?.className,
          left: e.getBoundingClientRect().left,
          right: e.getBoundingClientRect().right,
        }))
        .filter((e) => e.right > innerWidth + 3 && e.tag === "SPAN")
        .slice(0, 25),
    })),
    null,
    2,
  ),
);
await page.evaluate(() => (document.documentElement.style.zoom = "1"));
await page.setViewportSize({ width: 1440, height: 1000 });
const r = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
  .analyze();
await fs.writeFile(
  "test-results/axe.json",
  JSON.stringify(r.violations, null, 2),
);
console.log(
  JSON.stringify(
    r.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    null,
    2,
  ),
);
await browser.close();
