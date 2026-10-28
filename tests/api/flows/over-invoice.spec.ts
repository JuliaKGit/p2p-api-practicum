import { expect, test } from '@playwright/test';
import { expectSchema } from '../helpers/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LINE = { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 };
const RECEIVED_VALUE = LINE.quantity * LINE.unit_price;

test.describe('over-invoice protection flow', () => {
  test.describe.configure({ mode: 'serial' });

  let vendorId: string;
  let poId: string;
  let invoiceId: string;
  const overInvoiceNumber = `INV-OVER-${Date.now()}`;
  const goodInvoiceNumber = `INV-OK-${Date.now()}`;

  test('create vendor', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post('/vendors', {
      data: { name: `E2E Over ${Date.now()}` },
    });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Vendor');
    if (!isRecord(body) || typeof body.id !== 'string') {
      throw new Error('POST /vendors did not return vendor id');
    }
    vendorId = body.id;
  });

  test('create and submit purchase order', { tag: '@e2e' }, async ({ request }) => {
    const create = await request.post('/purchase-orders', {
      data: { vendor_id: vendorId, line_items: [LINE] },
    });
    expect(create.status()).toBe(201);
    const created: unknown = await create.json();
    await expectSchema(request, created, 'PurchaseOrder');
    if (!isRecord(created) || typeof created.id !== 'string') {
      throw new Error('POST /purchase-orders did not return po id');
    }
    poId = created.id;

    const submit = await request.post(`/purchase-orders/${poId}/submit`);
    expect(submit.status()).toBe(200);
    const submitted: unknown = await submit.json();
    await expectSchema(request, submitted, 'PurchaseOrder');
    if (!isRecord(submitted)) {
      throw new Error('Submit response was not an object');
    }
    expect(submitted.status).toBe('submitted');
  });

  test('receive everything on the purchase order', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post(`/purchase-orders/${poId}/receive`, {
      data: { items: [{ sku: LINE.sku, quantity: LINE.quantity }] },
    });
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'PurchaseOrder');
    if (!isRecord(body)) {
      throw new Error('Receive response was not an object');
    }
    expect(body.fully_received).toBe(true);
    expect(body.received_value).toBe(RECEIVED_VALUE);
  });

  test('reject invoice for one unit more than received', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post('/invoices', {
      data: {
        po_id: poId,
        invoice_number: overInvoiceNumber,
        line_items: [{ sku: LINE.sku, quantity: LINE.quantity + 1, unit_price: LINE.unit_price }],
      },
    });
    expect(response.status()).toBe(400);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Error');
    if (!isRecord(body)) {
      throw new Error('400 body was not an object');
    }
    expect(body.rule).toBe('overpayment_protection');

    const exposure = await request.get(`/vendors/${vendorId}/exposure`);
    expect(exposure.status()).toBe(200);
    const exposureBody: unknown = await exposure.json();
    await expectSchema(request, exposureBody, 'VendorExposure');
    if (!isRecord(exposureBody)) {
      throw new Error('Exposure response was not an object');
    }
    expect(exposureBody.open_ap_liability).toBe(0);
    expect(exposureBody.approved_invoices).toEqual([]);
  });

  test('accept correct invoice, match, and approve', { tag: '@e2e' }, async ({ request }) => {
    const create = await request.post('/invoices', {
      data: {
        po_id: poId,
        invoice_number: goodInvoiceNumber,
        line_items: [LINE],
      },
    });
    expect(create.status()).toBe(201);
    const invoice: unknown = await create.json();
    await expectSchema(request, invoice, 'Invoice');
    if (!isRecord(invoice) || typeof invoice.id !== 'string') {
      throw new Error('POST /invoices did not return invoice id');
    }
    invoiceId = invoice.id;
    expect(invoice.total_amount).toBe(RECEIVED_VALUE);

    const match = await request.post(`/invoices/${invoiceId}/match`);
    expect(match.status()).toBe(200);
    const matchBody: unknown = await match.json();
    await expectSchema(request, matchBody, 'MatchResult');
    if (!isRecord(matchBody)) {
      throw new Error('Match response was not an object');
    }
    expect(matchBody.partial_receipt).toBe(false);

    const approve = await request.post(`/invoices/${invoiceId}/approve`);
    expect(approve.status()).toBe(200);
    const approveBody: unknown = await approve.json();
    await expectSchema(request, approveBody, 'ApproveResult');
    if (!isRecord(approveBody)) {
      throw new Error('Approve response was not an object');
    }
    expect(approveBody.vendor_exposure).toBe(RECEIVED_VALUE);

    const exposure = await request.get(`/vendors/${vendorId}/exposure`);
    expect(exposure.status()).toBe(200);
    const exposureBody: unknown = await exposure.json();
    await expectSchema(request, exposureBody, 'VendorExposure');
    if (!isRecord(exposureBody)) {
      throw new Error('Exposure response was not an object');
    }
    expect(exposureBody.open_ap_liability).toBe(RECEIVED_VALUE);
    expect(exposureBody.approved_invoices).toEqual([invoiceId]);
  });
});
