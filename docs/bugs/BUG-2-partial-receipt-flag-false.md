# 3-way match reports partial_receipt false when a PO line is still open

**Rule broken:** `partial_receipt_flag`

**Severity:** High — ~$224 of a $243.98 order can remain undelivered while match says “passed” with `partial_receipt: false`, hiding receipt shortfall from AP review.

**Basis:** executed

## Steps to reproduce

```bash
curl -s -X POST http://localhost:8000/admin/reset

curl -s -X POST http://localhost:8000/purchase-orders \
  -H 'Content-Type: application/json' \
  -d '{"vendor_id":"vnd-001","line_items":[{"sku":"SCR-DECK-1LB","quantity":2,"unit_price":9.99},{"sku":"PLY-12-4X8","quantity":10,"unit_price":22.4}]}'
# → example po-3e08b38c

curl -s -X POST http://localhost:8000/purchase-orders/po-3e08b38c/submit

curl -s -X POST http://localhost:8000/purchase-orders/po-3e08b38c/receive \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"SCR-DECK-1LB","quantity":2}]}'
# received_value 19.98, ordered_value 243.98 — plywood not received

curl -s -X POST http://localhost:8000/invoices \
  -H 'Content-Type: application/json' \
  -d '{"po_id":"po-3e08b38c","invoice_number":"INV-REPRO-PARTIAL","line_items":[{"sku":"SCR-DECK-1LB","quantity":2,"unit_price":9.99}]}'
# → example inv-3d0ee378

curl -s -w "\nHTTP:%{http_code}\n" -X POST http://localhost:8000/invoices/inv-3d0ee378/match
```

Replace PO and invoice ids with your create responses.

## Expected

From `docs/API.md` Business rules #5 (`partial_receipt_flag`):

> The match result sets `partial_receipt` to `true` when any line of the PO is not fully received.

**HTTP 200** with `partial_receipt: true` (and match should reflect the open PO line).

## Actual

**HTTP 200** with `partial_receipt: false` and message `"3-way match passed."`:

```json
{
  "invoice_id": "inv-3d0ee378",
  "po_id": "po-3e08b38c",
  "status": "matched",
  "matched": true,
  "partial_receipt": false,
  "ordered_value": 243.98,
  "received_value": 19.98,
  "invoice_total": 19.98,
  "message": "3-way match passed."
}
```

## What this proves

When only part of a multi-line PO is received, the match endpoint can still set `partial_receipt` to **false**.

## What this does not prove

Behavior for every partial-receipt shape (e.g. partial quantity on a single line only); only the screws-first / plywood-open scenario above.

## Open question

Should match still return `matched: true` when `partial_receipt` is true, or should a short PO block a “clean” pass?
