---
name: api-schema-validation
description: Checks that API responses match the shapes in /openapi.json, through one helper, expectSchema. Use when writing or reviewing an API test, when the user asks to validate a response, check a schema, a contract, field types or required fields, or when a response has a field nobody expected. Do NOT use to decide which cases to test — that is api-test-design.
paths: "tests/**"
---

# API schema validation

Helper: `tests/api/helpers/schema.ts` — `expectSchema(request, body, name)`.

## Steps

1. Find the schema name in `/openapi.json` (the response's `$ref` under paths → responses); never guess it. Rejected requests use `Error`.
2. Call `expectSchema` on every response body, success and error.
3. A schema check proves the shape, not the business: still assert the values that matter (status, rule, amounts, flags).
4. When a check fails, show the Ajv errors and ask the human whether the API or the docs are wrong. Never edit the schema or loosen the check to make it pass.

## Helper behavior

- Loads `GET /openapi.json` once per worker through Playwright's `request` and adds it to Ajv: `new Ajv({ strict: false, allErrors: true })`, `addSchema(doc, 'openapi')`. Strict mode is off because OpenAPI adds keywords such as `example` that aren't JSON Schema.
- Looks up `openapi#/components/schemas/<name>`; fails clearly if that schema doesn't exist; fails listing Ajv's errors (path and message) if the body doesn't match. No `any` type.

## Example

```typescript
import { expectSchema } from './helpers/schema.js';

const res = await request.get('/vendors');
const vendors = await res.json();
for (const vendor of vendors) {
  await expectSchema(request, vendor, 'Vendor');
}

const bad = await request.post('/purchase-orders', { data: { vendor_id: 'vnd-002', line_items: [] } });
await expectSchema(request, await bad.json(), 'Error');
expect((await bad.json()).rule).toBe('inactive_vendor_gate');
```

Proof tests: `tests/api/schema.spec.ts`.
