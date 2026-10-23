import { test as setup, expect } from '@playwright/test';

setup('reset data to seed state', async ({ request }) => {
  const res = await request.post('/admin/reset');
  expect(res.status()).toBe(200);
});
