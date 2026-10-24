import { expect, test } from '@playwright/test';
import { expectSchema } from './helpers/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SEED_SKUS = [
  { sku: 'LUM-2X4-8', description: '2x4 stud, 8 ft', unit_price: 4.75 },
  { sku: 'PLY-12-4X8', description: 'Plywood sheet, 1/2 in, 4x8 ft', unit_price: 22.4 },
  { sku: 'CEM-30KG', description: 'Cement bag, 30 kg', unit_price: 11.9 },
  { sku: 'REB-10MM-6', description: 'Rebar, 10 mm, 6 m', unit_price: 18.25 },
  { sku: 'SCR-DECK-1LB', description: 'Deck screws, 1 lb box', unit_price: 9.99 },
] as const;

function findVendorById(vendors: unknown[], id: string): Record<string, unknown> | undefined {
  for (const vendor of vendors) {
    if (isRecord(vendor) && vendor.id === id) {
      return vendor;
    }
  }
  return undefined;
}

test('VND-GET-01 GET /vendors returns seed vendors', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/vendors');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  if (!Array.isArray(body)) {
    return;
  }
  expect(body.length).toBeGreaterThanOrEqual(2);
  const maple = findVendorById(body, 'vnd-001');
  const quarry = findVendorById(body, 'vnd-002');
  expect(maple).toEqual({ id: 'vnd-001', name: 'Maple Ridge Supply', active: true });
  expect(quarry).toEqual({ id: 'vnd-002', name: 'Old Quarry Materials', active: false });
});

test('VND-GET-02 GET /vendors every item matches Vendor schema', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/vendors');
  expect(response.status()).toBe(200);
  const vendors: unknown = await response.json();
  expect(Array.isArray(vendors)).toBe(true);
  if (!Array.isArray(vendors)) {
    return;
  }
  for (const vendor of vendors) {
    await expectSchema(request, vendor, 'Vendor');
  }
});

test('VND-GET-03 GET /vendors lists vendor after POST /vendors', { tag: '@api' }, async ({ request }) => {
  const name = `QA Vendor ${Date.now()}`;
  const create = await request.post('/vendors', { data: { name } });
  expect(create.status()).toBe(201);
  const created: unknown = await create.json();
  await expectSchema(request, created, 'Vendor');
  if (!isRecord(created) || typeof created.id !== 'string') {
    throw new Error('POST /vendors did not return a vendor with id');
  }
  expect(created.id.startsWith('vnd-')).toBe(true);

  const list = await request.get('/vendors');
  expect(list.status()).toBe(200);
  const vendors: unknown = await list.json();
  expect(Array.isArray(vendors)).toBe(true);
  if (!Array.isArray(vendors)) {
    return;
  }
  const found = vendors.find((v) => isRecord(v) && v.name === name);
  expect(found).toBeDefined();
  if (isRecord(found)) {
    expect(found.id).toBe(created.id);
  }
});

test('VND-GET-E01 GET unknown vendors subpath returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/vendors/not-a-route');
  expect(response.status()).toBe(404);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('404 body was not an object');
  }
  expect(typeof body.detail).toBe('string');
  expect(body.detail).not.toHaveLength(0);
  expect(body.rule).toBeUndefined();
});

test('VND-POST-01 POST /vendors creates active vendor', { tag: '@api' }, async ({ request }) => {
  const name = `QA Create ${Date.now()}`;
  const response = await request.post('/vendors', { data: { name } });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Vendor');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  expect(body.name).toBe(name);
  expect(body.active).toBe(true);
  expect(typeof body.id).toBe('string');
  expect((body.id as string).startsWith('vnd-')).toBe(true);
});

test('VND-POST-02 POST /vendors accepts active false', { tag: '@api' }, async ({ request }) => {
  const name = `QA Inactive ${Date.now()}`;
  const response = await request.post('/vendors', { data: { name, active: false } });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Vendor');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  expect(body.name).toBe(name);
  expect(body.active).toBe(false);
  expect(typeof body.id).toBe('string');
  expect((body.id as string).startsWith('vnd-')).toBe(true);
});

test('VND-POST-03 POST /vendors accepts explicit active true', { tag: '@api' }, async ({ request }) => {
  const name = `QA Active ${Date.now()}`;
  const response = await request.post('/vendors', { data: { name, active: true } });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Vendor');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  expect(body.name).toBe(name);
  expect(body.active).toBe(true);
});

test('VND-POST-04 POST /vendors then GET /vendors includes created vendor', { tag: '@api' }, async ({ request }) => {
  const name = `QA List ${Date.now()}`;
  const create = await request.post('/vendors', { data: { name } });
  expect(create.status()).toBe(201);
  const created: unknown = await create.json();
  await expectSchema(request, created, 'Vendor');
  if (!isRecord(created) || typeof created.id !== 'string') {
    throw new Error('POST /vendors did not return id');
  }

  const list = await request.get('/vendors');
  expect(list.status()).toBe(200);
  const vendors: unknown = await list.json();
  expect(Array.isArray(vendors)).toBe(true);
  if (!Array.isArray(vendors)) {
    return;
  }
  const inList = findVendorById(vendors, created.id);
  expect(inList).toEqual({ id: created.id, name, active: true });
});

test('VND-POST-N01 POST /vendors rejects empty body', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/vendors', { data: {} });
  expect(response.status()).toBe(400);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('400 body was not an object');
  }
  expect(body.rule).toBe('validation_error');
  expect(typeof body.detail).toBe('string');
  expect(body.detail).not.toHaveLength(0);
});

test('VND-POST-N02 POST /vendors rejects empty name', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/vendors', { data: { name: '' } });
  expect(response.status()).toBe(400);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('400 body was not an object');
  }
  expect(body.rule).toBe('validation_error');
});

test('VND-POST-N03 POST /vendors rejects non-string name', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/vendors', { data: { name: 12345 } });
  expect(response.status()).toBe(400);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('400 body was not an object');
  }
  expect(body.rule).toBe('validation_error');
});

test('VND-POST-N04 POST /vendors rejects non-boolean active', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/vendors', {
    data: { name: 'Valid Name', active: 'yes' },
  });
  expect(response.status()).toBe(400);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('400 body was not an object');
  }
  expect(body.rule).toBe('validation_error');
});

test('VND-POST-N05 POST /vendors rejects null name', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/vendors', { data: { name: null } });
  expect(response.status()).toBe(400);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('400 body was not an object');
  }
  expect(body.rule).toBe('validation_error');
});

test('VND-POST-E01 POST unknown vendors subpath returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/vendors/extra', { data: { name: 'Unused' } });
  expect(response.status()).toBe(404);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('404 body was not an object');
  }
  expect(typeof body.detail).toBe('string');
  expect(body.rule).toBeUndefined();
});

test('SKU-GET-01 GET /skus returns five catalog items', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/skus');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  if (!Array.isArray(body)) {
    return;
  }
  expect(body).toHaveLength(5);
  for (const sku of body) {
    await expectSchema(request, sku, 'Sku');
  }
});

test('SKU-GET-02 GET /skus matches seed catalog', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/skus');
  expect(response.status()).toBe(200);
  const skus: unknown = await response.json();
  expect(Array.isArray(skus)).toBe(true);
  if (!Array.isArray(skus)) {
    return;
  }
  for (const expected of SEED_SKUS) {
    const row = skus.find((s) => isRecord(s) && s.sku === expected.sku);
    expect(row).toEqual(expected);
  }
});

test('SKU-GET-03 GET /skus every item matches Sku schema', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/skus');
  expect(response.status()).toBe(200);
  const skus: unknown = await response.json();
  expect(Array.isArray(skus)).toBe(true);
  if (!Array.isArray(skus)) {
    return;
  }
  for (const sku of skus) {
    await expectSchema(request, sku, 'Sku');
  }
});

test('SKU-GET-E01 GET unknown skus subpath returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/skus/extra');
  expect(response.status()).toBe(404);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('404 body was not an object');
  }
  expect(typeof body.detail).toBe('string');
  expect(body.rule).toBeUndefined();
});
