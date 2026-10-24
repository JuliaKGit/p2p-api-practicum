import { test, expect } from '@playwright/test';
import { expectSchema } from './helpers/schema';

test('every vendor from GET /vendors matches Vendor', { tag: '@api' }, async ({ request }) => {
  const res = await request.get('/vendors');
  expect(res.status()).toBe(200);
  const vendors = await res.json();
  expect(Array.isArray(vendors)).toBe(true);
  for (const vendor of vendors) {
    await expectSchema(request, vendor, 'Vendor');
  }
});

test('Vendor schema rejects a body without active', { tag: '@api' }, async ({ request }) => {
  await expect(
    expectSchema(request, { id: 'vnd-test', name: 'No Active Field' }, 'Vendor'),
  ).rejects.toThrow();
});

test('expectSchema fails for an unknown schema name', { tag: '@api' }, async ({ request }) => {
  await expect(expectSchema(request, {}, 'NotARealSchema')).rejects.toThrow();
});
