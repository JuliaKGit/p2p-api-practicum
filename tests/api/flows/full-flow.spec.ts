import { expect, test } from '@playwright/test';
import { expectSchema } from '../helpers/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sumGlAmounts(lines: unknown): number {
  if (!Array.isArray(lines)) {
    throw new Error('GL lines must be an array');
  }
  let sum = 0;
  for (const line of lines) {
    if (!isRecord(line) || typeof line.amount !== 'number') {
      throw new Error('Invalid GL line');
    }
    sum += line.amount;
  }
  return sum;
}

const LINE_ONE = { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 };
const LINE_TWO = { sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 };
const ORDERED_VALUE = 10 * 4.75 + 4 * 11.9;

test.describe('full P2P flow', () => {
  test.describe.configure({ mode: 'serial' });

  let vendorId: string;
  let poId: string;
  let invoiceId: string;
  let invoiceTotal: number;

  test('create vendor', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post('/vendors', {
      data: { name: `E2E Full ${Date.now()}` },
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
    expect(body.status).toBe('draft');
    expect(body.ordered_value).toBe(ORDERED_VALUE);
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
    expect(body.id).toBe(poId);
  });

  test('receive all line items', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post(`/purchase-orders/${poId}/receive`, {
      data: {
        items: [
          { sku: LINE_ONE.sku, quantity: LINE_ONE.quantity },
          { sku: LINE_TWO.sku, quantity: LINE_TWO.quantity },
        ],
      },
    });
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'PurchaseOrder');
    if (!isRecord(body)) {
      throw new Error('Receive response was not an object');
    }
    expect(body.status).toBe('closed');
    expect(body.fully_received).toBe(true);
    expect(body.received_value).toBe(ORDERED_VALUE);
  });

  test('invoice for everything received', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post('/invoices', {
      data: {
        po_id: poId,
        invoice_number: `INV-FULL-${Date.now()}`,
        line_items: [LINE_ONE, LINE_TWO],
      },
    });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Invoice');
    if (!isRecord(body) || typeof body.id !== 'string' || typeof body.total_amount !== 'number') {
      throw new Error('POST /invoices did not return invoice id and total');
    }
    expect(body.status).toBe('received');
    expect(body.matched).toBe(false);
    expect(body.partial_receipt).toBeNull();
    expect(body.total_amount).toBe(ORDERED_VALUE);
    invoiceId = body.id;
    invoiceTotal = body.total_amount;
  });

  test('3-way match with full receipt', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post(`/invoices/${invoiceId}/match`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'MatchResult');
    if (!isRecord(body)) {
      throw new Error('Match response was not an object');
    }
    expect(body.partial_receipt).toBe(false);
    expect(body.invoice_id).toBe(invoiceId);
    expect(body.po_id).toBe(poId);
    expect(body.invoice_total).toBe(invoiceTotal);
    expect(body.ordered_value).toBe(ORDERED_VALUE);
    expect(body.received_value).toBe(ORDERED_VALUE);
  });

  test('approve and verify ledger and exposure', { tag: '@e2e' }, async ({ request }) => {
    const approve = await request.post(`/invoices/${invoiceId}/approve`);
    expect(approve.status()).toBe(200);
    const body: unknown = await approve.json();
    await expectSchema(request, body, 'ApproveResult');
    if (!isRecord(body) || !isRecord(body.gl_entry)) {
      throw new Error('Approve response missing gl_entry');
    }
    const entry = body.gl_entry;
    expect(entry.balanced).toBe(true);
    const debitTotal = sumGlAmounts(entry.debits);
    const creditTotal = sumGlAmounts(entry.credits);
    expect(debitTotal).toBe(invoiceTotal);
    expect(creditTotal).toBe(invoiceTotal);
    expect(body.vendor_exposure).toBe(invoiceTotal);

    const exposure = await request.get(`/vendors/${vendorId}/exposure`);
    expect(exposure.status()).toBe(200);
    const exposureBody: unknown = await exposure.json();
    await expectSchema(request, exposureBody, 'VendorExposure');
    if (!isRecord(exposureBody)) {
      throw new Error('Exposure response was not an object');
    }
    expect(exposureBody.open_ap_liability).toBe(invoiceTotal);
    expect(exposureBody.approved_invoices).toEqual([invoiceId]);
  });
});
