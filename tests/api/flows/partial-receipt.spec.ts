import { expect, test } from '@playwright/test';
import { expectSchema } from '../helpers/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LINE_ONE = { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 };
const LINE_TWO = { sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 };
const ORDERED_VALUE = 10 * 4.75 + 4 * 11.9;
const PARTIAL_CEM_QTY = 2;
const RECEIVED_VALUE = 10 * 4.75 + PARTIAL_CEM_QTY * 11.9;

test.describe('partial receipt P2P flow', () => {
  test.describe.configure({ mode: 'serial' });

  let vendorId: string;
  let poId: string;
  let invoiceId: string;

  test('create vendor', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post('/vendors', {
      data: { name: `E2E Partial ${Date.now()}` },
    });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Vendor');
    if (!isRecord(body) || typeof body.id !== 'string') {
      throw new Error('POST /vendors did not return vendor id');
    }
    vendorId = body.id;
  });

  test('create purchase order with two lines', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post('/purchase-orders', {
      data: { vendor_id: vendorId, line_items: [LINE_ONE, LINE_TWO] },
    });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'PurchaseOrder');
    if (!isRecord(body) || typeof body.id !== 'string') {
      throw new Error('POST /purchase-orders did not return po id');
    }
    poId = body.id;
  });

  test('submit purchase order', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post(`/purchase-orders/${poId}/submit`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'PurchaseOrder');
    if (!isRecord(body)) {
      throw new Error('Submit response was not an object');
    }
    expect(body.status).toBe('submitted');
  });

  test('receive first line in full and part of the second', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post(`/purchase-orders/${poId}/receive`, {
      data: {
        items: [
          { sku: LINE_ONE.sku, quantity: LINE_ONE.quantity },
          { sku: LINE_TWO.sku, quantity: PARTIAL_CEM_QTY },
        ],
      },
    });
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'PurchaseOrder');
    if (!isRecord(body)) {
      throw new Error('Receive response was not an object');
    }
    expect(body.status).toBe('submitted');
    expect(body.fully_received).toBe(false);
    expect(body.received_value).toBe(RECEIVED_VALUE);
    expect(body.ordered_value).toBe(ORDERED_VALUE);
  });

  test('invoice only what was received', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post('/invoices', {
      data: {
        po_id: poId,
        invoice_number: `INV-PART-${Date.now()}`,
        line_items: [
          LINE_ONE,
          { sku: LINE_TWO.sku, quantity: PARTIAL_CEM_QTY, unit_price: LINE_TWO.unit_price },
        ],
      },
    });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Invoice');
    if (!isRecord(body) || typeof body.id !== 'string') {
      throw new Error('POST /invoices did not return invoice id');
    }
    expect(body.total_amount).toBe(RECEIVED_VALUE);
    invoiceId = body.id;
  });

  test('3-way match flags partial receipt', { tag: '@e2e' }, async ({ request }) => {
    test.fail(true, 'BUG-2: match sets partial_receipt false while a PO line is still open');
    const response = await request.post(`/invoices/${invoiceId}/match`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'MatchResult');
    if (!isRecord(body)) {
      throw new Error('Match response was not an object');
    }
    expect(body.partial_receipt).toBe(true);
    expect(body.ordered_value).toBe(ORDERED_VALUE);
    expect(body.received_value).toBe(RECEIVED_VALUE);
    expect(body.invoice_total).toBe(RECEIVED_VALUE);
  });

  test('approve and exposure reflects received value only', { tag: '@e2e' }, async ({ request }) => {
    const approve = await request.post(`/invoices/${invoiceId}/approve`);
    expect(approve.status()).toBe(200);
    const body: unknown = await approve.json();
    await expectSchema(request, body, 'ApproveResult');
    if (!isRecord(body)) {
      throw new Error('Approve response was not an object');
    }
    expect(body.vendor_exposure).toBe(RECEIVED_VALUE);
    expect(body.vendor_exposure).not.toBe(ORDERED_VALUE);

    const exposure = await request.get(`/vendors/${vendorId}/exposure`);
    expect(exposure.status()).toBe(200);
    const exposureBody: unknown = await exposure.json();
    await expectSchema(request, exposureBody, 'VendorExposure');
    if (!isRecord(exposureBody)) {
      throw new Error('Exposure response was not an object');
    }
    expect(exposureBody.open_ap_liability).toBe(RECEIVED_VALUE);
    expect(exposureBody.open_ap_liability).not.toBe(ORDERED_VALUE);
  });
});
