import { expect, test } from '@playwright/test';
import { expectSchema } from './helpers/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LINE = { sku: 'CEM-30KG', quantity: 2, unit_price: 11.9 };

async function poReadyForInvoice(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const create = await request.post('/purchase-orders', {
    data: { vendor_id: 'vnd-001', line_items: [LINE] },
  });
  expect(create.status()).toBe(201);
  const created: unknown = await create.json();
  await expectSchema(request, created, 'PurchaseOrder');
  if (!isRecord(created) || typeof created.id !== 'string') {
    throw new Error('POST /purchase-orders did not return po id');
  }
  const poId = created.id;

  const submit = await request.post(`/purchase-orders/${poId}/submit`);
  expect(submit.status()).toBe(200);

  const receive = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: LINE.sku, quantity: LINE.quantity }] },
  });
  expect(receive.status()).toBe(200);

  return poId;
}

test('INV-POST-N01 rejects inv-7 when INV-7 already exists for same vendor', { tag: '@api' }, async ({ request }) => {
  test.fail(true, 'BUG-3: inv-7 accepted after INV-7 for same vendor');

  const poFirst = await poReadyForInvoice(request);
  const first = await request.post('/invoices', {
    data: {
      po_id: poFirst,
      invoice_number: 'INV-7',
      line_items: [LINE],
    },
  });
  expect(first.status()).toBe(201);

  const poSecond = await poReadyForInvoice(request);
  const second = await request.post('/invoices', {
    data: {
      po_id: poSecond,
      invoice_number: 'inv-7',
      line_items: [LINE],
    },
  });
  expect(second.status()).toBe(400);
  const body: unknown = await second.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('400 body was not an object');
  }
  expect(body.rule).toBe('duplicate_invoice_detection');
});
