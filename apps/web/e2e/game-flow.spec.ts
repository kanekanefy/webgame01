import { test, expect } from '@playwright/test';

test.describe('R1 数值闭环关键路径', () => {
  test('E2E-01: 新建对局显示初始数值', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-game-btn').click();
    await expect(page.getByTestId('stat-year')).toContainText('1560');
    await expect(page.getByTestId('stat-season')).toContainText('春');
    await expect(page.getByTestId('stat-koku')).toContainText('500');
    await expect(page.getByTestId('stat-levy')).toContainText('120');
    await expect(page.getByTestId('stat-status')).toContainText('治世');
  });

  test('E2E-02: 选 set_tax 推进一季 → 季节变夏，回报区有"税率"', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-game-btn').click();
    await page.getByTestId('action-select').selectOption('set_tax');
    await page.getByTestId('param-rate').fill('50');
    await page.getByTestId('advance-turn-btn').click();
    await expect(page.getByTestId('stat-season')).toContainText('夏');
    await expect(page.getByTestId('report-facts').first()).toContainText('税率');
  });

  test('E2E-03: 自由文本下令（征兵 50）→ 兵力增加', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-game-btn').click();
    await page.getByTestId('command-input').fill('征兵 50');
    await page.getByTestId('command-submit').click();
    await expect(page.getByTestId('stat-levy')).toContainText('170'); // 120 + 50
  });

  test('E2E-04: 时代不符的口令被驳回，不推进', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-game-btn').click();
    await page.getByTestId('command-input').fill('给家臣发电报');
    await page.getByTestId('command-submit').click();
    await expect(page.getByTestId('report-rejection')).toBeVisible();
    await expect(page.getByTestId('stat-season')).toContainText('春'); // 未推进
  });

  test('E2E-05: 连续推进至结局（won/lost）', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-game-btn').click();
    for (let i = 0; i < 40; i++) {
      const status = await page.getByTestId('stat-status').textContent();
      if (status && !status.includes('治世')) break;
      await page.getByTestId('skip-turn-btn').click();
      await page.waitForTimeout(50);
    }
    await expect(page.getByTestId('ending-title')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('移动端冒烟', () => {
  test('E2E-06: 375px 关键元素可见无溢出', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.getByTestId('new-game-btn').click();
    await expect(page.getByTestId('stat-koku')).toBeVisible();
    await expect(page.getByTestId('advance-turn-btn')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
