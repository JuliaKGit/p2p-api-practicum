# Invoice totalling one cent over received value is accepted (201)

**Rule broken:** `overpayment_protection`

**Severity:** High — the business can be invoiced and pay up to small per-line overages the docs forbid; a $0.10 overage on a $47.50 receipt was accepted and could be matched and posted.

**Basis:** executed

## Steps to reproduce

```bash
curl -s -X POST http://localhost:8000/admin/reset

curl -s -X POST http://localhost:8000/purchase-orders \
  -H 'Content-Type: application/json' \
  -d '{"vendor_id":"vnd-001","line_items":[{"sku":"LUM-2X4-8","quantity":10,"unit_price":4.75}]}'
# → note po id from response (example: po-877ef0cf)

curl -s -X POST http://localhost:8000/purchase-orders/po-877ef0cf/submit

curl -s -X POST http://localhost:8000/purchase-orders/po-877ef0cf/receive \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"LUM-2X4-8","quantity":10}]}'
# received_value 47.50

curl -s -w "\nHTTP:%{http_code}\n" -X POST http://localhost:8000/invoices \
  -H 'Content-Type: application/json' \
  -d '{"po_id":"po-877ef0cf","invoice_number":"INV-REPRO-CENT","line_items":[{"sku":"LUM-2X4-8","quantity":10,"unit_price":4.76}]}'
```

Replace `po-877ef0cf` with the id from your PO create response.

## Expected

From `docs/API.md` Business rules #3 (`overpayment_protection`):

> Everything invoiced on a PO never exceeds what was received: not per line quantity, and not in total value. **There is no tolerance.**

Request should be rejected with **400** and `rule: "overpayment_protection"`.

## Actual

**HTTP 201** — invoice created with `total_amount: 47.6` while received value was **47.5** (repro run: `inv-0a5fd757`, `INV-REPRO-CENT`).

```json
{
  "id": "inv-0a5fd757",
  "po_id": "po-877ef0cf",
  "vendor_id": "vnd-001",
  "invoice_number": "INV-REPRO-CENT",
  "status": "received",
  "total_amount": 47.6,
  "matched": false,
  "partial_receipt": null
}
```

## What this proves

The API does not enforce zero tolerance on **invoice total value** when quantity matches receipt but **unit price** exceeds what was received on the PO line.

## What this does not prove

The exact upper bound of any undocumented tolerance (e.g. percentage caps); only that at least a one-cent-per-unit overage is accepted at invoice create.

## Open question

Does the same gap allow match and approve to complete for the overage, and is there a hidden percentage threshold between ~0.2% and 5%?
