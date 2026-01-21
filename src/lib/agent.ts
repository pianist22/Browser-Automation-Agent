
import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import fs from "fs/promises";
import path from "path";

// ==================== EXECUTION LOG (NEW) ====================

export type ToolLogItem = {
  toolName: string;
  args: any;
  result?: any;
  error?: string;
  timestamp: string;
};

let executionLog: ToolLogItem[] = [];

/** ✅ Call this at the start of each automation request */
export function resetExecutionLog() {
  executionLog = [];
}

/** ✅ Use this in API response */
export function getExecutionLog() {
  return executionLog;
}

function logToolStart(toolName: string, args: any) {
  executionLog.push({
    toolName,
    args,
    timestamp: new Date().toISOString(),
  });
}

function logToolSuccess(toolName: string, result: any) {
  for (let i = executionLog.length - 1; i >= 0; i--) {
    if (
      executionLog[i].toolName === toolName &&
      executionLog[i].result == null &&
      executionLog[i].error == null
    ) {
      executionLog[i].result = result;
      return;
    }
  }

  executionLog.push({
    toolName,
    args: null,
    result,
    timestamp: new Date().toISOString(),
  });
}

function logToolError(toolName: string, error: string) {
  for (let i = executionLog.length - 1; i >= 0; i--) {
    if (
      executionLog[i].toolName === toolName &&
      executionLog[i].result == null &&
      executionLog[i].error == null
    ) {
      executionLog[i].error = error;
      return;
    }
  }

  executionLog.push({
    toolName,
    args: null,
    error,
    timestamp: new Date().toISOString(),
  });
}

// ==================== SCREENSHOT DIRECTORY ====================

const screenshotsDir = "./playwright/screenshots";
// await fs.mkdir(screenshotsDir, { recursive: true });

async function ensureReady() {
  await fs.mkdir(screenshotsDir, { recursive: true });
  await initializeBrowser();
}

// ==================== GLOBAL BROWSER STATE ====================

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

async function initializeBrowser(): Promise<void> {
  if (!browser) {
    browser = await chromium.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    page = await context.newPage();
  }
}

// ✅ Pass page explicitly
async function safeWaitNetwork(p: Page): Promise<void> {
  await p.waitForLoadState("domcontentloaded").catch(() => {});
  await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
}

async function safeScreenshot(p: Page, tag = "step"): Promise<string> {
  const timestamp = Date.now();
  const filename = `screenshot_${tag}_${timestamp}.png`;
  const filepath = path.join(screenshotsDir, filename);

  await p.screenshot({ path: filepath, fullPage: true });

  // ✅ you are serving screenshots via API already
  return `/api/screenshot/${filename}`;
}

await initializeBrowser();

// ==================== TOOLS (WITH LOGGING ADDED) ====================

export const openURL = tool({
  name: "open_url",
  description: "Navigate to URL safely",
  parameters: z.object({ url: z.string() }),
  async execute({ url }) {
    const toolName = "open_url";
    logToolStart(toolName, { url });

    try {
      await ensureReady();
      if (!page) throw new Error("Page not initialized");

      await page.goto(url, { waitUntil: "domcontentloaded" });
      await safeWaitNetwork(page);

      const shot = await safeScreenshot(page, "open_url");

      const result = { success: true, currentUrl: page.url(), screenshot: shot };
      logToolSuccess(toolName, result);
      return result;
    } catch (err: any) {
      const message = err?.message || "Failed to open URL";
      logToolError(toolName, message);
      throw err;
    }
  },
});

export const takeScreenshot = tool({
  name: "take_screenshot",
  description: "Take a screenshot",
  parameters: z.object({}),
  async execute() {
    const toolName = "take_screenshot";
    logToolStart(toolName, {});

    try {
      await ensureReady();
      if (!page) throw new Error("Page not initialized");

      const shot = await safeScreenshot(page, "manual");
      const result = { success: true, screenshot: shot, url: page.url() };

      logToolSuccess(toolName, result);
      return result;
    } catch (err: any) {
      const message = err?.message || "Screenshot failed";
      logToolError(toolName, message);
      throw err;
    }
  },
});

export const typeInField = tool({
  name: "type_in_field",
  description:
    "Type into input/textarea using placeholder, label, name, id, aria-label (robust for modern UI forms)",
  parameters: z.object({
    field: z.string().describe("Field identifier like Name/Email/Password"),
    text: z.string(),
  }),
  async execute({ field, text }) {
    const toolName = "type_in_field";
    logToolStart(toolName, { field, text });

    try {
      await ensureReady();
      if (!page) throw new Error("Page not initialized");

      const f = field.trim();

      // ✅ 1) Best: Playwright built-in "getByLabel" style
      // Works even when label/input are not adjacent
      const byLabel = page.getByLabel(f, { exact: false }).first();
      if (await byLabel.count()) {
        await byLabel.scrollIntoViewIfNeeded().catch(() => {});
        await byLabel.click({ timeout: 3000 }).catch(() => {});
        await byLabel.fill(text);
        const shot = await safeScreenshot(page, "type");
        const result = { success: true, selectorUsed: `getByLabel(${f})`, screenshot: shot };
        logToolSuccess(toolName, result);
        return result;
      }

      // ✅ 2) Common selectors (placeholder / aria-label / name / id)
      const selectors = [
        `input[placeholder*="${f}"]`,
        `textarea[placeholder*="${f}"]`,

        `input[aria-label*="${f}"]`,
        `textarea[aria-label*="${f}"]`,

        `input[name*="${f}" i]`,
        `textarea[name*="${f}" i]`,

        `input[id*="${f}" i]`,
        `textarea[id*="${f}" i]`,
      ];

      // ✅ 3) Robust label container patterns
      // label wraps input OR label + div + input OR label inside a parent
      const labelPatterns = [
        `label:has-text("${f}") input`,
        `label:has-text("${f}") textarea`,
        `label:has-text("${f}") >> xpath=following::input[1]`,
        `label:has-text("${f}") >> xpath=following::textarea[1]`,
      ];

      const allSelectors = [...selectors, ...labelPatterns];

      for (const selector of allSelectors) {
        const loc = page.locator(selector).first();
        if (await loc.count()) {
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          await loc.click({ timeout: 3000 }).catch(() => {});
          await loc.fill(text);

          const shot = await safeScreenshot(page, "type");
          const result = { success: true, selectorUsed: selector, screenshot: shot };

          logToolSuccess(toolName, result);
          return result;
        }
      }

      // ✅ 4) Smart fallbacks for known fields
      // These help for pages that use generic placeholders
      const lower = f.toLowerCase();

      const smartFallbacks: string[] = [];

      if (lower.includes("email")) {
        smartFallbacks.push(`input[type="email"]`);
        smartFallbacks.push(`input[name="email"]`);
      }
      if (lower.includes("password")) {
        smartFallbacks.push(`input[type="password"]`);
        smartFallbacks.push(`input[name="password"]`);
      }
      if (lower.includes("name")) {
        smartFallbacks.push(`input[name="name"]`);
        smartFallbacks.push(`input[name*="name" i]`);
      }

      for (const selector of smartFallbacks) {
        const loc = page.locator(selector).first();
        if (await loc.count()) {
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          await loc.click({ timeout: 3000 }).catch(() => {});
          await loc.fill(text);

          const shot = await safeScreenshot(page, "type");
          const result = { success: true, selectorUsed: `smart:${selector}`, screenshot: shot };

          logToolSuccess(toolName, result);
          return result;
        }
      }

      throw new Error(`Input field not found: ${field}`);
    } catch (err: any) {
      const message = err?.message || "Typing failed";
      logToolError(toolName, message);
      throw err;
    }
  },
});


export const clickByText = tool({
  name: "click_by_text",
  description: "Click element by visible text (buttons, links, sidebar, menus)",
  parameters: z.object({
    text: z.string().describe("Visible text to click"),
  }),
  async execute({ text }) {
    const toolName = "click_by_text";
    logToolStart(toolName, { text });

    try {
      await ensureReady();
      if (!page) throw new Error("Page not initialized");

      const candidates = [
        `button:has-text("${text}")`,
        `a:has-text("${text}")`,
        `[role="button"]:has-text("${text}")`,
        `[role="menuitem"]:has-text("${text}")`,
        // `text=${text}`,
        `text=${text.toLowerCase()}`
      ];

      for (const selector of candidates) {
        const loc = page.locator(selector).first();
        if (await loc.count()) {
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          await loc.click({ timeout: 6000 });

          await safeWaitNetwork(page);
          const shot = await safeScreenshot(page, "click");

          const result = {
            success: true,
            selectorUsed: selector,
            clicked: text,
            url: page.url(),
            screenshot: shot,
          };

          logToolSuccess(toolName, result);
          return result;
        }
      }

      throw new Error(`Could not find clickable text: "${text}"`);
    } catch (err: any) {
      const message = err?.message || "Click failed";
      logToolError(toolName, message);
      throw err;
    }
  },
});

export const pressEnter = tool({
  name: "press_enter",
  description: "Press Enter key and wait for navigation/DOM changes",
  parameters: z.object({}),
  async execute() {
    const toolName = "press_enter";
    logToolStart(toolName, {});

    try {
      await ensureReady();
      if (!page) throw new Error("Page not initialized");

      const oldUrl = page.url();
      await page.keyboard.press("Enter");

      await safeWaitNetwork(page);
      const shot = await safeScreenshot(page, "enter");

      const result = { success: true, from: oldUrl, to: page.url(), screenshot: shot };
      logToolSuccess(toolName, result);
      return result;
    } catch (err: any) {
      const message = err?.message || "Press Enter failed";
      logToolError(toolName, message);
      throw err;
    }
  },
});

export const scrollPage = tool({
  name: "scroll_page",
  description: "Scroll page vertically by pixels",
  parameters: z.object({
    y: z.number().describe("Pixels to scroll down (negative = up)"),
  }),
  async execute({ y }) {
    const toolName = "scroll_page";
    logToolStart(toolName, { y });

    try {
      await ensureReady();
      if (!page) throw new Error("Page not initialized");

      await page.mouse.wheel(0, y);
      await safeWaitNetwork(page);
      const shot = await safeScreenshot(page, "scroll");

      const result = { success: true, scrolledBy: y, screenshot: shot };
      logToolSuccess(toolName, result);
      return result;
    } catch (err: any) {
      const message = err?.message || "Scroll failed";
      logToolError(toolName, message);
      throw err;
    }
  },
});

export const clickAt = tool({
  name: "click_at",
  description: "Click using x/y coordinates (fallback when DOM fails)",
  parameters: z.object({
    x: z.number(),
    y: z.number(),
  }),
  async execute({ x, y }) {
    const toolName = "click_at";
    logToolStart(toolName, { x, y });

    try {
      await ensureReady();
      if (!page) throw new Error("Page not initialized");

      await page.mouse.click(x, y);
      await safeWaitNetwork(page);
      const shot = await safeScreenshot(page, "click_at");

      const result = { success: true, x, y, url: page.url(), screenshot: shot };
      logToolSuccess(toolName, result);
      return result;
    } catch (err: any) {
      const message = err?.message || "Coordinate click failed";
      logToolError(toolName, message);
      throw err;
    }
  },
});

// export const waitForHuman = tool({
//   name: "wait_for_human",
//   description: "Wait for user to solve captcha manually",
//   parameters: z.object({}),
//   async execute() {
//     const toolName = "wait_for_human";
//     logToolStart(toolName, {});

//     try {
//       await initializeBrowser();
//       if (!page) throw new Error("Page not initialized");

//       await Promise.race([
//         page.waitForSelector("#search", { timeout: 120000 }),
//         page.waitForURL((u) => !u.toString().includes("sorry"), { timeout: 120000 }),
//       ]).catch(() => {});

//       const result = { success: true, url: page.url() };
//       logToolSuccess(toolName, result);
//       return result;
//     } catch (err: any) {
//       const message = err?.message || "Wait for human failed";
//       logToolError(toolName, message);
//       throw err;
//     }
//   },
// });

export const getResponseData = tool({
  name: "get_response_data",
  description: "Get page title, URL, and visible text preview",
  parameters: z.object({}),
  async execute() {
    const toolName = "get_response_data";
    logToolStart(toolName, {});

    try {
      await ensureReady();
      if (!page) throw new Error("Page not initialized");

      const title = await page.title();
      const url = page.url();
      const visibleText = await page.evaluate(() => {
        const t = document.body?.innerText || "";
        return t.replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000);
      });

      const result = { success: true, title, url, visibleText };
      logToolSuccess(toolName, result);
      return result;
    } catch (err: any) {
      const message = err?.message || "Get response data failed";
      logToolError(toolName, message);
      throw err;
    }
  },
});

export const waitForHuman = tool({
  name: "wait_for_human",
  description: "Wait for user to solve captcha manually (supports loops)",
  parameters: z.object({}),
  async execute() {
    const toolName = "wait_for_human";
    logToolStart(toolName, {});

    try {
      await ensureReady();
      if (!page) throw new Error("Page not initialized");
      const p = page;

      const start = Date.now();
      const timeout = 120000; // 2 min

      // ✅ loop until captcha is solved or timeout
      while (Date.now() - start < timeout) {
        const url = p.url();

        // ✅ common captcha detections
        const hasCaptcha = await p
          .locator('iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]')
          .count()
          .then((c) => c > 0)
          .catch(() => false);

        const hasVerifyText = await p
          .locator(':text-matches("verify you are human|checking your browser|unusual traffic|captcha", "i")')
          .count()
          .then((c) => c > 0)
          .catch(() => false);

        // ✅ if captcha is still present, just wait a bit
        if (hasCaptcha || hasVerifyText || url.includes("sorry")) {
          await p.waitForTimeout(1500);
          continue;
        }

        // ✅ captcha solved
        const shot = await safeScreenshot(p, "human_done");
        const result = { success: true, url: p.url(), screenshot: shot };

        logToolSuccess(toolName, result);
        return result;
      }

      throw new Error("Captcha wait timed out after 2 minutes");
    } catch (err: any) {
      const message = err?.message || "Wait for human failed";
      logToolError(toolName, message);
      throw err;
    }
  },
});

// ==================== AGENT ====================

export const agent = new Agent({
  name: "Browser Automation Agent",
  model: "gpt-4o-mini",
  instructions: `You are a Browser Automation Agent that controls a real browser using ONLY the provided tools.

PRIMARY OBJECTIVE: Execute user's request exactly, step-by-step.

STRICT RULES:
1. DO ONLY what user asked - no extra steps
2. One action → screenshot → analyze → next action
3. Prefer click_by_text > scroll_page + retry > click_at (coordinates only if specified)
4. CAPTCHA: Use wait_for_human immediately
5. Errors: Retry once, then explain failure + current URL

TOOLS:
open_url, click_by_text, type_in_field, press_enter, scroll_page, click_at, take_screenshot, get_response_data, wait_for_human, `,
  tools: [
    openURL,
    clickByText,
    typeInField,
    pressEnter,
    scrollPage,
    clickAt,
    takeScreenshot,
    getResponseData,
    waitForHuman,

  ],
  handoffs: [],
});

// ==================== CLEANUP ====================

export async function cleanupBrowser() {
  try {
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  } finally {
    page = null;
    context = null;
    browser = null;
  }
}

