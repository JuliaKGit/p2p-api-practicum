import Ajv, { type ErrorObject } from 'ajv';
import type { APIRequestContext } from '@playwright/test';

let ajvPromise: Promise<Ajv> | null = null;

async function getAjv(request: APIRequestContext): Promise<Ajv> {
  if (!ajvPromise) {
    ajvPromise = (async () => {
      const res = await request.get('/openapi.json');
      if (!res.ok()) {
        throw new Error(`Failed to load OpenAPI document: GET /openapi.json → ${res.status()}`);
      }
      const doc = await res.json();
      const ajv = new Ajv({ strict: false, allErrors: true });
      ajv.addSchema(doc, 'openapi');
      return ajv;
    })();
  }
  return ajvPromise;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) {
    return 'unknown validation error';
  }
  return errors
    .map((err) => {
      const path = err.instancePath || '/';
      return `${path} ${err.message ?? 'invalid'}`.trim();
    })
    .join('; ');
}

export async function expectSchema(
  request: APIRequestContext,
  body: unknown,
  name: string,
): Promise<void> {
  const ref = `openapi#/components/schemas/${name}`;
  const ajv = await getAjv(request);
  const validate = ajv.getSchema(ref);
  if (!validate) {
    throw new Error(`OpenAPI schema not found: ${ref}`);
  }
  if (!validate(body)) {
    throw new Error(`Schema "${name}" validation failed: ${formatAjvErrors(validate.errors)}`);
  }
}
