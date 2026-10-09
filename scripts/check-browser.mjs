import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

const runtime = createRequire("/Users/parkmini/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json");
const { chromium } = runtime("playwright");
const port = 3002, origin = `http://localhost:${port}`;
const dataDir = await mkdtemp(path.join(tmpdir(), "okinawa-browser-qa-"));
const outputDir = path.join(process.cwd(), "test-results");
await mkdir(outputDir, { recursive: true });
let server, browser;
let serverOutput = "";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (value) => String(value).replace(/AIza[\w-]+/g, "[maps-key]");

async function startServer(password = "") {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "0.0.0.0", "--port", String(port)], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: "development", TRIP_DATA_DIR: dataDir, OKINAWA_BUILD_DIR: ".next-qa", FAMILY_PASSWORD: password, SESSION_SECRET: randomBytes(32).toString("hex"), NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(redact(serverOutput));
    try { if ((await fetch(`${origin}/api/session`)).ok) return; } catch {}
    await pause(250);
  }
  throw new Error("QA server did not start");
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const current = server;
  const ended = new Promise((resolve) => current.once("exit", resolve));
  current.kill("SIGTERM");
  await Promise.race([ended, pause(4000)]);
  if (current.exitCode === null) current.kill("SIGKILL");
}
async function bodyState(page) {
  return page.evaluate(async () => (await (await fetch("/api/trip")).json()).state);
}
async function saved(page) {
  await page.locator('dialog').waitFor({ state: "hidden" });
}

try {
  await startServer();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [], mapErrors = [];
  page.on("pageerror", (error) => errors.push(redact(error.message)));
  page.on("console", (message) => { if (message.type() === "error" && message.text().includes("Google Maps")) mapErrors.push(redact(message.text())); });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "우리 가족의 오키나와", exact: true }).waitFor();
  await page.locator('.trip-map[data-ready="true"]').waitFor();
  await page.screenshot({ path: path.join(outputDir, "desktop.png"), fullPage: true });
  assert.equal(await page.locator(".timeline-entry").count(), 4);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log(JSON.stringify({ stage: "desktop", mapErrors, browserErrors: errors, mapPins: await page.locator(".map-pin").count() }));

  await page.getByRole("button", { name: "준비물", exact: true }).first().click();
  await page.getByRole("checkbox", { name: "여권과 항공권 확인", exact: true }).click();
  await page.getByText("1 / 12개 준비 완료", { exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "준비물", exact: true }).first().click();
  assert.equal(await page.getByRole("checkbox", { name: "여권과 항공권 확인", exact: true }).isChecked(), true);
  await page.getByRole("button", { name: "준비물 추가", exact: true }).click();
  await page.locator("dialog").getByLabel("준비물", { exact: true }).fill("QA 카메라 배터리");
  await page.getByLabel("담당자", { exact: true }).fill("가족");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await saved(page);
  assert((await bodyState(page)).packing.some((item) => item.label === "QA 카메라 배터리"));
  await page.getByRole("button", { name: "QA 카메라 배터리 수정", exact: true }).click();
  await page.locator("dialog").getByLabel("준비물", { exact: true }).fill("QA 예비 배터리");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "QA 예비 배터리 삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await saved(page);
  assert(!(await bodyState(page)).packing.some((item) => item.label.includes("QA")));
  console.log("PASS checklist add/edit/delete and reload persistence");

  await page.getByRole("button", { name: "저장한 장소", exact: true }).first().click();
  await page.getByRole("button", { name: "장소 추가", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "장소 등록", exact: true }).isEnabled(), false);
  assert.equal(await page.getByLabel("장소 이름", { exact: true }).count(), 0);
  await page.getByLabel("Google 지도 링크", { exact: true }).fill("https://www.google.com/maps/place/QA+가족+사진+장소/data=!3d26.214!4d127.6812");
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await page.getByRole("heading", { name: "QA 가족 사진 장소", exact: true }).waitFor();
  await page.getByLabel("분류", { exact: true }).selectOption("photo");
  await page.getByRole("button", { name: "장소 등록", exact: true }).click();
  await saved(page);
  const created = (await bodyState(page)).places.find((place) => place.name === "QA 가족 사진 장소");
  assert(created);
  await page.getByRole("button", { name: "QA 가족 사진 장소", exact: true }).click();
  await page.getByRole("button", { name: "일정에 추가", exact: true }).last().click();
  await page.getByLabel("시작 시간", { exact: true }).fill("19:00");
  await page.getByRole("button", { name: "일정에 추가", exact: true }).last().click();
  await saved(page);
  assert((await bodyState(page)).schedule.some((item) => item.placeId === created.id));
  await page.getByRole("button", { name: "여행 일정", exact: true }).first().click();
  await page.getByRole("button", { name: "QA 가족 사진 장소 일정 수정", exact: true }).click();
  await page.getByLabel("시작 시간", { exact: true }).fill("18:30");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await saved(page);
  assert((await bodyState(page)).schedule.some((item) => item.placeId === created.id && item.time === "18:30"));
  await page.getByRole("button", { name: "저장한 장소", exact: true }).first().click();
  await page.getByRole("button", { name: "QA 가족 사진 장소", exact: true }).click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await saved(page);
  const cleaned = await bodyState(page);
  assert(!cleaned.places.some((item) => item.id === created.id));
  assert(!cleaned.schedule.some((item) => item.placeId === created.id));
  console.log("PASS place creation and itinerary add/edit/cascade deletion");

  await page.getByRole("button", { name: "여행 정보 수정", exact: true }).click();
  await page.getByLabel("출발 날짜", { exact: true }).fill("2026-11-10");
  await page.getByLabel("여행 인원", { exact: true }).fill("4");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await saved(page);
  assert.equal((await bodyState(page)).trip.startDate, "2026-11-10");
  await page.getByRole("button", { name: "여행 정보 수정", exact: true }).click();
  await page.getByLabel("여행 일수", { exact: true }).fill("2");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.locator("dialog .form-error").waitFor();
  assert.equal(await page.getByLabel("여행 일수", { exact: true }).inputValue(), "2");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  console.log("PASS trip settings and invalid day reduction preserving draft");

  // Simulate another family member's save while this editor retains a draft.
  await page.getByRole("button", { name: "여행 정보 수정", exact: true }).click();
  await page.getByLabel("여행 이름", { exact: true }).fill("충돌 후 보존할 이름");
  const conflict = await page.evaluate(async () => {
    const current = (await (await fetch("/api/trip")).json()).state;
    current.trip.notes = "다른 가족이 저장한 메모";
    return (await fetch("/api/trip", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: current, expectedVersion: current.version }) })).status;
  });
  assert.equal(conflict, 200);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.locator("dialog .form-error").waitFor();
  assert.equal(await page.getByLabel("여행 이름", { exact: true }).inputValue(), "충돌 후 보존할 이름");
  assert.equal((await bodyState(page)).trip.notes, "다른 가족이 저장한 메모");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  console.log("PASS stale save rejection and unsaved draft preservation");

  await page.getByRole("button", { name: "여행 설정", exact: true }).click();
  const imported = await bodyState(page);
  imported.version = 1000;
  imported.trip.notes = "파일에서 불러온 가족 메모";
  await page.locator('input[type="file"]').setInputFiles({ name: "okinawa-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await saved(page);
  assert.equal((await bodyState(page)).trip.notes, imported.trip.notes);
  assert((await bodyState(page)).version < 1000);
  await page.getByRole("button", { name: "여행 정보 수정", exact: true }).click();
  await page.getByLabel("여행 이름", { exact: true }).fill("연결 실패 후 남길 제목");
  await page.route("**/api/trip", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.locator("dialog .form-error").waitFor();
  assert.equal(await page.getByLabel("여행 이름", { exact: true }).inputValue(), "연결 실패 후 남길 제목");
  await page.unroute("**/api/trip");
  await page.getByLabel("여행 이름", { exact: true }).fill("우리 가족의 오키나와");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await saved(page);
  console.log("PASS backup import and preserving input across network failure/retry");

  await page.getByRole("button", { name: "사진 명소", exact: true }).first().click();
  await page.screenshot({ path: path.join(outputDir, "photo-spots.png"), fullPage: true });
  const imageReport = await page.locator(".place-card img").evaluateAll((images) => images.map((img) => ({ alt: img.alt, loaded: img.complete && img.naturalWidth > 0 })));
  assert(imageReport.every((img) => img.loaded));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "여행 일정", exact: true }).click();
  await page.locator('.trip-map[data-ready="true"]').waitFor();
  await page.locator(".map-pin").first().waitFor();
  if (await page.getByRole("button", { name: "알림 닫기", exact: true }).count()) await page.getByRole("button", { name: "알림 닫기", exact: true }).click();
  await page.screenshot({ path: path.join(outputDir, "mobile.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: "준비물", exact: true }).last().click();
  await page.screenshot({ path: path.join(outputDir, "mobile-packing.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: "여행 정보 수정", exact: true }).click();
  assert.equal(await page.locator("dialog").evaluate((dialog) => dialog.scrollWidth > dialog.clientWidth), false);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: "여행 일정", exact: true }).click();
  await page.evaluate(() => window.gm_authFailure?.());
  await page.locator(".leaflet-marker-icon").first().waitFor();
  await page.screenshot({ path: path.join(outputDir, "map-fallback.png"), fullPage: true });
  console.log("PASS map authorization fallback and mobile editor layout");
  console.log(JSON.stringify({ stage: "mobile", images: imageReport, errors }));
  assert.equal(errors.length, 0);
  await context.close();

  await stopServer();
  await startServer("qa-family-password");
  const protectedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const protectedPage = await protectedContext.newPage();
  await protectedPage.goto(origin, { waitUntil: "networkidle" });
  await protectedPage.getByLabel("가족 비밀번호").waitFor();
  assert.equal((await protectedContext.request.get(`${origin}/api/trip`)).status(), 401);
  await protectedPage.getByLabel("가족 비밀번호").fill("wrong-password");
  await protectedPage.getByRole("button", { name: "여행 열기", exact: true }).click();
  await protectedPage.getByText("비밀번호가 맞지 않습니다.", { exact: true }).waitFor();
  await protectedPage.getByLabel("가족 비밀번호").fill("qa-family-password");
  await protectedPage.getByRole("button", { name: "여행 열기", exact: true }).click();
  await protectedPage.getByRole("heading", { name: "우리 가족의 오키나와", exact: true }).waitFor();
  const cookies = await protectedContext.cookies();
  const cookie = cookies.find((item) => item.name === "okinawa_session");
  assert(cookie?.httpOnly && cookie.sameSite === "Lax");
  const rejected = await protectedContext.request.put(`${origin}/api/trip`, { headers: { Origin: "https://example.org" }, data: { state: cleaned, expectedVersion: cleaned.version } });
  assert.equal(rejected.status(), 403);
  console.log("PASS shared password login, HttpOnly cookie, unauthorized access and cross-origin rejection");
  await protectedPage.getByRole("button", { name: "여행 정보 수정", exact: true }).click();
  await protectedPage.getByLabel("여행 이름", { exact: true }).fill("로그인 후에도 남길 여행");
  await protectedContext.clearCookies();
  await protectedPage.getByRole("button", { name: "저장", exact: true }).click();
  await protectedPage.getByLabel("가족 비밀번호").waitFor();
  let releaseRenewal, capturedRenewal;
  const renewalGate = new Promise((resolve) => { releaseRenewal = resolve; });
  const renewalCaptured = new Promise((resolve) => { capturedRenewal = resolve; });
  await protectedPage.route("**/api/trip", async (route) => {
    if (route.request().method() === "GET") {
      const snapshot = await route.fetch();
      capturedRenewal();
      await renewalGate;
      await route.fulfill({ response: snapshot });
    } else {
      if (route.request().method() === "PUT") await pause(700);
      await route.continue();
    }
  });
  await protectedPage.getByLabel("가족 비밀번호").fill("qa-family-password");
  await protectedPage.getByRole("button", { name: "여행 열기", exact: true }).click();
  await renewalCaptured;
  await protectedPage.getByLabel("여행 이름", { exact: true }).waitFor();
  assert.equal(await protectedPage.getByLabel("여행 이름", { exact: true }).inputValue(), "로그인 후에도 남길 여행");
  console.log("PASS editor draft retention across session renewal");
  await protectedPage.getByRole("button", { name: "저장", exact: true }).click();
  assert.equal(await protectedPage.getByLabel("여행 이름", { exact: true }).isDisabled(), true);
  await saved(protectedPage);
  const staleReadCompleted = protectedPage.waitForResponse((response) => response.url().endsWith("/api/trip") && response.request().method() === "GET");
  releaseRenewal();
  await staleReadCompleted;
  await protectedPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await protectedPage.getByRole("heading", { name: "로그인 후에도 남길 여행", exact: true }).isVisible(), true);
  await protectedPage.unroute("**/api/trip");
  console.log("PASS editing controls locked while saving and stale renewal read ignored");
  console.log(JSON.stringify({ status: "passed", screenshots: outputDir, googleMapErrors: mapErrors }));
} catch (error) {
  console.error(redact(error.stack || error));
  if (browser) {
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stopServer();
}
