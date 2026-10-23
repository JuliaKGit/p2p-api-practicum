import { test, expect } from '@playwright/test';

test('GET /health returns ok', { tag: '@api' }, async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});
