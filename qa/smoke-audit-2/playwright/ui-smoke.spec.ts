import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const shotDir = path.join(process.cwd(), 'screenshots');
const evidenceDir = path.join(process.cwd(), 'evidence');
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

const viewports = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
  { name: '320x568', width: 320, height: 568 },
];

const consoleLog: { page: string; type: string; text: string }[] = [];

async function login(page, email: string) {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(admin|employee)/, { timeout: 20000 });
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowX: doc.scrollWidth - doc.clientWidth,
    };
  });
}

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleLog.push({ page: page.url(), type: msg.type(), text: msg.text().slice(0, 300) });
    }
  });
  page.on('pageerror', (err) => {
    consoleLog.push({ page: page.url(), type: 'pageerror', text: String(err).slice(0, 300) });
  });
  page.on('dialog', async (dialog) => {
    consoleLog.push({ page: page.url(), type: 'dialog', text: dialog.message() });
    await dialog.dismiss();
  });
});

test('company picker, login, role walls, bulletin text, viewports', async ({ page }) => {
  const notes: Record<string, unknown> = {};

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/');
  await expect(page.getByRole('heading', { name: 'Open a company' })).toBeVisible();
  await page.screenshot({ path: path.join(shotDir, 'company-picker-1440x900.png'), fullPage: true });

  await page.goto('http://aithworld.localhost:3000/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Aith World')).toBeVisible();
  notes.loginOverflow1440 = await overflow(page);
  await page.screenshot({ path: path.join(shotDir, 'login-1440x900.png'), fullPage: true });

  await login(page, 'employee@gostaff.local');
  await expect(page).toHaveURL(/\/employee/);
  notes.employeeHomeOverflow = await overflow(page);
  await page.screenshot({ path: path.join(shotDir, 'employee-home-1440x900.png'), fullPage: true });

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('gs_user') || '';
    return {
      hasToken: Boolean(localStorage.getItem('gs_token')),
      hasAadhaarKey: raw.includes('aadhaarNumber'),
      hasPanKey: raw.includes('panNumber'),
      hasBankKey: raw.includes('bankAccountNumber'),
    };
  });
  notes.localStorageKycKeys = stored;

  let alerted = false;
  page.on('dialog', () => { alerted = true; });
  const bulletin = page.getByRole('button', { name: /announcement|bulletin|company/i }).first();
  if (await bulletin.count()) {
    await bulletin.click().catch(() => undefined);
  }
  await page.getByText('Smoke bulletin').first().waitFor({ timeout: 8000 }).catch(() => undefined);
  notes.xssDialog = alerted;
  notes.bulletinVisible = await page.getByText('Smoke bulletin').count();
  const scriptText = await page.getByText('<script>alert(1)</script>').count();
  notes.scriptShownAsText = scriptText;

  await page.goto('/admin');
  await page.waitForTimeout(1500);
  notes.employeeAdminUrl = page.url();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: path.join(shotDir, 'employee-blocked-admin-1440x900.png'), fullPage: true });

  await login(page, 'employee@gostaff.local');
  await page.getByRole('button', { name: 'Logout' }).click();
  await page.waitForURL(/\/login/);
  const afterLogout = await page.evaluate(() => ({
    token: localStorage.getItem('gs_token'),
    user: localStorage.getItem('gs_user'),
  }));
  notes.afterLogoutStorage = { tokenCleared: !afterLogout.token, userCleared: !afterLogout.user };
  await page.goto('/employee');
  await page.waitForTimeout(1000);
  notes.employeeAfterLogoutUrl = page.url();
  await expect(page).toHaveURL(/\/login/);

  await login(page, 'connect@aithworld.com');
  await expect(page).toHaveURL(/\/admin/);
  notes.adminOverflow = await overflow(page);
  await page.screenshot({ path: path.join(shotDir, 'admin-dashboard-1440x900.png'), fullPage: true });

  await page.goto('/admin/revenue');
  await page.waitForTimeout(1000);
  notes.ownerRevenueUrl = page.url();
  await expect(page).toHaveURL(/\/admin\/revenue/);
  await page.screenshot({ path: path.join(shotDir, 'admin-revenue-1440x900.png'), fullPage: true });

  await page.goto('/admin/integrations');
  await page.waitForTimeout(1000);
  notes.ownerIntegrationsUrl = page.url();
  await page.screenshot({ path: path.join(shotDir, 'admin-integrations-1440x900.png'), fullPage: true });

  await page.evaluate(() => localStorage.clear());
  await login(page, 'deptmgr@smoke.local');
  await page.goto('/admin/revenue');
  await page.waitForTimeout(1200);
  notes.deptRevenueUrl = page.url();
  await page.screenshot({ path: path.join(shotDir, 'dept-manager-revenue-redirect-1440x900.png'), fullPage: true });

  await page.evaluate(() => localStorage.clear());
  await login(page, 'lead@smoke.local');
  notes.teamLeaderHomeUrl = page.url();
  await page.goto('/admin/attendance');
  await page.waitForTimeout(1200);
  notes.teamLeaderAdminUrl = page.url();
  await page.screenshot({ path: path.join(shotDir, 'team-leader-admin-blocked-1440x900.png'), fullPage: true });

  const responsive: Record<string, unknown>[] = [];
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
    const loginBox = await overflow(page);
    await page.screenshot({ path: path.join(shotDir, `login-${vp.name}.png`), fullPage: true });
    await login(page, 'employee@gostaff.local');
    const homeBox = await overflow(page);
    await page.screenshot({ path: path.join(shotDir, `employee-home-${vp.name}.png`), fullPage: true });
    await page.goto('/employee/leave');
    await page.waitForTimeout(500);
    const leaveBox = await overflow(page);
    await page.screenshot({ path: path.join(shotDir, `employee-leave-${vp.name}.png`), fullPage: true });
    await page.goto('/employee/support');
    await page.waitForTimeout(400);
    const supportBox = await overflow(page);
    await page.screenshot({ path: path.join(shotDir, `employee-support-${vp.name}.png`), fullPage: true });
    responsive.push({ viewport: vp.name, login: loginBox, home: homeBox, leave: leaveBox, support: supportBox });
  }
  notes.responsive = responsive;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.clear());
  await login(page, 'connect@aithworld.com');
  notes.adminMobileOverflow = await overflow(page);
  await page.screenshot({ path: path.join(shotDir, 'admin-dashboard-390x844.png'), fullPage: true });
  const menu = page.getByRole('button', { name: /menu|open navigation|navigation/i });
  notes.mobileMenuButton = await menu.count();

  fs.writeFileSync(path.join(evidenceDir, 'ui-notes.json'), JSON.stringify({ notes, consoleLog }, null, 2));
  fs.writeFileSync(path.join(evidenceDir, 'console.json'), JSON.stringify(consoleLog, null, 2));
});
