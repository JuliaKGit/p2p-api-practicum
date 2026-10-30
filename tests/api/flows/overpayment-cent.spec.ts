import { expect, test } from '@playwright/test';
import { expectSchema } from '../helpers/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LINE = { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 };

test('reject invoice when unit price exceeds received value by one cent', { tag: '@api' }, async ({ request }) => {
  test.fail(true, 'BUG-1: invoice totalling 47.60 accepted against 47.50 received');

  const createPo = await request.post('/purchase-orders', {
    data: { vendor_id: 'vnd-001', line_items: [LINE] },
  });
  expect(createPo.status()).toBe(201);
  const po: unknown = await createPo.json();
  if (!isRecord(po) || typeof po.id !== 'string') {
    throw new Error('POST /purchase-orders did not return po id');
  }

  const submit = await request.post(`/purchase-orders/${po.id}/submit`);
  expect(submit.status()).toBe(200);

  const receive = await request.post(`/purchase-orders/${po.id}/receive`, {
    data: { items: [{ sku: LINE.sku, quantity: LINE.quantity }] },
  });
  expect(receive.status()).toBe(200);

  const response = await request.post('/invoices', {
    data: {
      po_id: po.id,
      invoice_number: `INV-CENT-${Date.now()}`,
      line_items: [{ sku: LINE.sku, quantity: LINE.quantity, unit_price: 4.76 }],
    },
  });
  expect(response.status()).toBe(400);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('400 body was not an object');
  }
  expect(body.rule).toBe('overpayment_protection');
});
