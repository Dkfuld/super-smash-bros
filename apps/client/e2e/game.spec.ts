import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * End-to-end tests across the required device viewports, exercising the real
 * server + built client: landing, host flow, player onboarding, match start,
 * portrait gate, and touch controls.
 */

const VIEWPORTS = [
  { name: "iPhone 15 Pro", width: 852, height: 393 }, // landscape
  { name: "iPhone standard", width: 844, height: 390 },
  { name: "iPhone SE", width: 667, height: 375 },
  { name: "Galaxy S23", width: 915, height: 412 },
  { name: "midrange Android", width: 800, height: 360 },
  { name: "tablet", width: 1180, height: 820 },
  { name: "desktop spectator", width: 1440, height: 900 },
];

const NAMES = Array.from({ length: 12 }, (_, i) => `Member ${i + 1}`);

async function createRoomAsHost(browser: Browser): Promise<{ hostPage: Page; code: string }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const hostPage = await ctx.newPage();
  await hostPage.goto("/");
  await hostPage.click("text=Host a Draft Night");
  await hostPage.fill('input[placeholder*="Basement"]', "E2E League");
  await hostPage.fill("textarea", NAMES.join("\n"));
  await hostPage.click("text=Create the Dome");
  const codeEl = hostPage.locator(".room-code");
  await expect(codeEl).toBeVisible({ timeout: 10_000 });
  const code = (await codeEl.textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  return { hostPage, code };
}

for (const vp of VIEWPORTS) {
  test(`landing renders and is usable on ${vp.name} (${vp.width}x${vp.height})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator(".title")).toContainText("DISASTER DOME");
    await expect(page.locator("text=Host a Draft Night")).toBeVisible();
    await ctx.close();
  });
}

test("host creates a room with 12 participants, QR code and join link", async ({ browser }) => {
  const { hostPage } = await createRoomAsHost(browser);
  await expect(hostPage.locator(".slot-row")).toHaveCount(12);
  await expect(hostPage.locator(".qr-box img")).toBeVisible();
  await expect(hostPage.locator("text=Copy join link")).toBeVisible();
  await hostPage.context().close();
});

test("full flow: player joins on a phone, match starts, portrait gate + touch controls work", async ({ browser }) => {
  const { hostPage, code } = await createRoomAsHost(browser);

  // Player joins from a portrait phone.
  const phone = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
  const player = await phone.newPage();
  await player.goto(`/?room=${code}`);
  await player.fill('input[placeholder*="Wanda"]', "Phone Phil");
  await player.click("text=Enter the Dome");
  await player.click(`.slot-pick button:has-text("${NAMES[0]}")`);

  // Onboarding: customization + ready → drops into the walkable 3D lobby
  await expect(player.locator("text=You are Member 1")).toBeVisible({ timeout: 10_000 });
  await player.click(".choice-row .chip >> nth=1"); // change body
  await player.click("text=I'M READY");
  await expect(player.locator(".hud-top")).toContainText("ready", { timeout: 15_000 });
  await expect(player.locator("canvas.game-canvas")).toBeVisible(); // 3D pregame lobby

  // Host sees the claim, marks previous loser, fills AI, starts.
  await expect(hostPage.locator(".slot-row").first()).toContainText(/joined|ready/);
  await hostPage.locator(".slot-row").nth(3).locator(".loser-btn").click();
  await hostPage.click("text=Fill empty with AI");
  await hostPage.click("text=START THE MATCH");

  // Match starts → player is in the 3D game. Portrait phone → rotate gate visible.
  await expect(player.locator("canvas.game-canvas")).toBeVisible({ timeout: 15_000 });
  await expect(player.locator(".portrait-gate")).toBeVisible();
  await expect(player.locator(".portrait-gate")).toContainText("Rotate your phone");

  // Spectator joins right away (before the AI can finish the match).
  const specCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const spec = await specCtx.newPage();
  await spec.goto(`/?spectate=${code}`);
  await expect(spec.locator("canvas.game-canvas")).toBeVisible({ timeout: 15_000 });
  await expect(spec.locator(".spec-controls")).toBeVisible();

  // Rotate to landscape → gate disappears, touch controls available.
  await player.setViewportSize({ width: 852, height: 393 });
  await expect(player.locator(".portrait-gate")).toBeHidden();
  await expect(player.locator(".abtn.attack")).toBeVisible();
  await expect(player.locator(".joystick-zone")).toBeVisible();

  // Touch the attack button and tap the joystick zone — no crashes, HUD alive.
  await player.locator(".abtn.attack").tap();
  const zone = player.locator(".joystick-zone");
  const box = await zone.boundingBox();
  if (box) {
    await player.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect(player.locator(".hud-top")).toBeVisible({ timeout: 10_000 });

  // Host live controls work without errors.
  await hostPage.click("text=YIPPEE!");
  await hostPage.click("text=Skip intro");
  await expect(hostPage.locator("canvas.game-canvas")).toBeVisible();

  // Host cancels. If the AI already finished the match, the results screen with
  // the official draft order is the correct terminal state instead.
  hostPage.on("dialog", (d) => void d.accept());
  const cancelBtn = hostPage.locator("text=Cancel");
  if (await cancelBtn.isVisible().catch(() => false)) {
    await cancelBtn.click();
  }
  await expect(
    hostPage.locator("text=START THE MATCH").or(hostPage.locator("text=OFFICIAL DRAFT ORDER")).first(),
  ).toBeVisible({ timeout: 15_000 });

  await phone.close();
  await specCtx.close();
  await hostPage.context().close();
});

test("turbo AI match runs to completion and shows the official 12-pick draft order", async ({ browser }) => {
  test.setTimeout(300_000);
  const { hostPage } = await createRoomAsHost(browser);
  await hostPage.locator(".slot-row").nth(5).locator(".loser-btn").click(); // Member 6 wears the hat
  await hostPage.click("text=Match settings");
  await hostPage.click("text=⚡ Turbo");
  await hostPage.click("text=Fill empty with AI");
  await hostPage.click("text=START THE MATCH");
  await expect(hostPage.locator("canvas.game-canvas")).toBeVisible({ timeout: 15_000 });

  // Turbo settings guarantee termination (sudden death @60s + zone collapse).
  await expect(hostPage.locator("text=OFFICIAL DRAFT ORDER")).toBeVisible({ timeout: 240_000 });
  await expect(hostPage.locator(".result-row")).toHaveCount(12);
  await expect(hostPage.locator(".result-row.first")).toContainText("WINNER — FIRST PICK");
  await expect(hostPage.locator(".result-row").last()).toContainText("#12");
  // The hat wearer is marked in the results
  await expect(hostPage.locator(".results-list")).toContainText("🌈");
  // Exports available
  await expect(hostPage.locator("text=Copy as text")).toBeVisible();
  await expect(hostPage.locator("text=Results card (PNG)")).toBeVisible();
  // Shareable results link resolves via the API
  const matchIdText = await hostPage.locator(".subtitle").textContent();
  const matchId = matchIdText?.match(/match (\S+)/)?.[1];
  expect(matchId).toBeTruthy();
  const res = await fetch(`http://localhost:8787/api/results/${matchId}`);
  expect(res.ok).toBe(true);
  const results = (await res.json()) as { draftOrder: Array<{ pick: number }> };
  expect(results.draftOrder).toHaveLength(12);
  await hostPage.context().close();
});

test("audio does not start before user interaction", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } });
  const page = await ctx.newPage();
  await page.goto("/");
  const running = await page.evaluate(() => {
    // No AudioContext should exist/run before a gesture.
    return (window as unknown as { __audioStarted?: boolean }).__audioStarted ?? false;
  });
  expect(running).toBe(false);
  await ctx.close();
});

test("unknown room code shows an error instead of a broken screen", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } });
  const page = await ctx.newPage();
  await page.goto("/?room=ZZZZZZ");
  await page.fill('input[placeholder*="Wanda"]', "Lost Larry");
  await page.click("text=Enter the Dome");
  await expect(page.locator("text=Room not found")).toBeVisible({ timeout: 10_000 });
  await ctx.close();
});
