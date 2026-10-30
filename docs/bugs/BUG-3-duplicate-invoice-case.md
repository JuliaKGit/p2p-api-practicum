# Duplicate invoice number accepted when only letter case differs

**Rule broken:** `duplicate_invoice_detection`

**Severity:** High — the same vendor bill can be recorded twice under `INV-7` and `inv-7` (full invoice amount at risk per duplicate, e.g. $23.80 each in the repro).

**Basis:** executed

## Steps to reproduce

```bash
curl -s -X POST http://localhost:8000/admin/reset

# First PO + invoice INV-7
curl -s -X POST http://localhost:8000/purchase-orders \
  -H 'Content-Type: application/json' \
  -d '{"vendor_id":"vnd-001","line_items":[{"sku":"CEM-30KG","quantity":2,"unit_price":11.9}]}'
# → example po-92eb5dd5

curl -s -X POST http://localhost:8000/purchase-orders/po-92eb5dd5/submit
curl -s -X POST http://localhost:8000/purchase-orders/po-92eb5dd5/receive \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"CEM-30KG","quantity":2}]}'

curl -s -w "\nHTTP:%{http_code}\n" -X POST http://localhost:8000/invoices \
  -H 'Content-Type: application/json' \
  -d '{"po_id":"po-92eb5dd5","invoice_number":"INV-7","line_items":[{"sku":"CEM-30KG","quantity":2,"unit_price":11.9}]}'
# → 201, example inv-8e7418f7

# Second PO + invoice inv-7 (same vendor)
curl -s -X POST http://localhost:8000/purchase-orders \
  -H 'Content-Type: application/json' \
  -d '{"vendor_id":"vnd-001","line_items":[{"sku":"CEM-30KG","quantity":2,"unit_price":11.9}]}'
# → example po-2c0740e3

curl -s -X POST http://localhost:8000/purchase-orders/po-2c0740e3/submit
curl -s -X POST http://localhost:8000/purchase-orders/po-2c0740e3/receive \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"CEM-30KG","quantity":2}]}'

curl -s -w "\nHTTP:%{http_code}\n" -X POST http://localhost:8000/invoices \
  -H 'Content-Type: application/json' \
  -d '{"po_id":"po-2c0740e3","invoice_number":"inv-7","line_items":[{"sku":"CEM-30KG","quantity":2,"unit_price":11.9}]}'
```

Replace PO ids with your create responses.

## Expected

From `docs/API.md` Business rules #6 (`duplicate_invoice_detection`):

> A vendor cannot submit the same invoice number twice. Numbers are compared ignoring upper or lower case and surrounding spaces, so `INV-7`, `inv-7` and ` INV-7 ` are the same number.

Second invoice should be **400** with `rule: "duplicate_invoice_detection"`.

## Actual

Second request **HTTP 201**:

```json
{
  "id": "inv-b9fbec24",
  "po_id": "po-2c0740e3",
  "vendor_id": "vnd-001",
  "invoice_number": "inv-7",
  "status": "received",
  "total_amount": 23.8,
  "matched": false,
  "partial_receipt": null
}
```

(Separate repro: invoice number ` INV-7 ` with surrounding spaces was also accepted with 201 after `INV-7`.)

## What this proves

Case-normalisation (and, in a related run, surrounding spaces) is not applied when detecting duplicate invoice numbers for the same vendor.

## What this does not prove

Duplicate detection across different vendors (same number on two vendors is allowed by docs).

## Open question

Should stored invoice numbers be normalised on write, or only compared normalised on duplicate check?
