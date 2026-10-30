# P2P adversary attack plan

Base URL: `http://localhost:8000`. Health checked `GET /health` → 200 `{"status":"ok"}` before this plan. No attack traffic before this file.

Each attack starts with `POST /admin/reset`. Vendor ids, inactive flag, and SKUs come from `GET /vendors` and `GET /skus` in that attack (seed expectation: `vnd-001` active, `vnd-002` inactive; catalog prices from the live list). Decisive call is the last request named below.

Money is dollars rounded to cents. No tolerance on overpayment. Quantity must be > 0 and ≤ 10,000; unit price 0–100,000 (OpenAPI `validation_error` when those bounds fail).

## Required four (CHALLENGE.md)

### 1. Approve an invoice that was never matched
- **Rule:** `three_way_match_gate`
- **Setup:** Active vendor. PO one line `LUM-2X4-8` qty 10 at catalog price. Submit. Receive 10. Invoice `INV-NOMATCH` for the same line. Do not call match.
- **Decisive:** `POST /invoices/{id}/approve`
- **Expect:** 400, `rule` = `three_way_match_gate`

### 2. Receive more than was ordered
- **Rule:** `receive_quantity_limit`
- **Setup:** Active vendor. PO `LUM-2X4-8` qty 10. Submit.
- **Decisive:** `POST /purchase-orders/{id}/receive` with quantity 11
- **Expect:** 400, `rule` = `receive_quantity_limit`. PO received quantity stays 0.

### 3. Invoice more than the received value
- **Rule:** `overpayment_protection`
- **Setup:** PO `LUM-2X4-8` qty 10 at 4.75. Submit. Receive 10 (received value 47.50).
- **Decisive:** `POST /invoices` qty 10 at unit price 10.00 (invoice value 100.00 > 47.50)
- **Expect:** 400, `rule` = `overpayment_protection`

### 4. Purchase order for an inactive vendor
- **Rule:** `inactive_vendor_gate`
- **Setup:** `GET /vendors`, pick the vendor with `active: false` (seed `vnd-002`).
- **Decisive:** `POST /purchase-orders` for that vendor, one valid line
- **Expect:** 400, `rule` = `inactive_vendor_gate`

## inactive_vendor_gate

### 5. Newly created inactive vendor
- **Rule:** `inactive_vendor_gate`
- **Setup:** `POST /vendors` `{"name":"Adv Dormant Co","active":false}`.
- **Decisive:** `POST /purchase-orders` using the returned id
- **Expect:** 400, `rule` = `inactive_vendor_gate`

### 6. Unknown vendor id
- **Rule:** `inactive_vendor_gate` (existence is documented as 404, not this rule)
- **Setup:** Reset only.
- **Decisive:** `POST /purchase-orders` with `vendor_id` `vnd-does-not-exist`
- **Expect:** 404 and no business-rule acceptance. A 201 is a breach. A 400 `inactive_vendor_gate` is the wrong gate (vendor is missing, not inactive).

## receive_quantity_limit

### 7. One unit over ordered quantity
- **Rule:** `receive_quantity_limit`
- **Setup:** PO qty 5 of `CEM-30KG`. Submit.
- **Decisive:** Receive quantity 6
- **Expect:** 400, `rule` = `receive_quantity_limit`

### 8. Cumulative receipts exceed ordered quantity
- **Rule:** `receive_quantity_limit`
- **Setup:** PO qty 10 of `PLY-12-4X8`. Submit. Receive 6 (should succeed).
- **Decisive:** Second receive of 5 (6+5=11 > 10)
- **Expect:** 400, `rule` = `receive_quantity_limit`. First receipt remains 6.

### 9. Receive exactly the ordered quantity (boundary, should hold by accepting)
- **Rule:** `receive_quantity_limit`
- **Setup:** PO qty 10. Submit.
- **Decisive:** Receive 10
- **Expect:** 200, `fully_received` true, `received_quantity` 10, status `closed`

### 10. Receive a SKU that is not on the PO
- **Rule:** `receive_quantity_limit` (docs: every receive SKU must be on the PO; OpenAPI 400)
- **Setup:** PO only `LUM-2X4-8`. Submit.
- **Decisive:** Receive `CEM-30KG` qty 1
- **Expect:** 400. Not a 200 that records the foreign SKU. Rule name is not specified beyond invalid body; `validation_error` or a specific rule both count as a refusal. 200 is a breach.

## overpayment_protection

### 11. One cent over received value
- **Rule:** `overpayment_protection`
- **Setup:** PO qty 10 `LUM-2X4-8` at 4.75. Submit. Receive 10. Received value 47.50.
- **Decisive:** Invoice qty 10 at 4.76 (47.60, one cent over)
- **Expect:** 400, `rule` = `overpayment_protection`

### 12. Small percentage over received value
- **Rule:** `overpayment_protection`
- **Setup:** PO qty 10 `SCR-DECK-1LB` at catalog 9.99. Submit. Receive 10. Received value 99.90.
- **Decisive:** Invoice qty 10 at 10.49 (~5% over)
- **Expect:** 400, `rule` = `overpayment_protection`

### 13. Line quantity over received even when extended price is under received value
- **Rule:** `overpayment_protection` (per line quantity, not only total value)
- **Setup:** PO qty 10 at 10.00. Submit. Receive 5 (received value 50.00).
- **Decisive:** Invoice qty 6 at unit price 1.00 (value 6.00 < 50.00, quantity 6 > 5 received)
- **Expect:** 400, `rule` = `overpayment_protection`

### 14. Two invoices whose combined total exceeds what was received
- **Rule:** `overpayment_protection`
- **Setup:** PO qty 10 at 10.00. Submit. Receive 10 (100.00). First invoice qty 6 at 10.00 (60.00) should be 201.
- **Decisive:** Second invoice qty 5 at 10.00 (50.00; combined 110.00 and combined qty 11)
- **Expect:** 400, `rule` = `overpayment_protection`

### 15. Invoice when nothing has been received
- **Rule:** `overpayment_protection`
- **Setup:** PO qty 4 at 11.90. Submit. No receive.
- **Decisive:** Invoice the full ordered line
- **Expect:** 400, `rule` = `overpayment_protection`

### 16. Invoice exactly equal to received value (boundary)
- **Rule:** `overpayment_protection`
- **Setup:** PO qty 4 `CEM-30KG` at 11.90. Submit. Receive 4.
- **Decisive:** Invoice qty 4 at 11.90
- **Expect:** 201, `total_amount` 47.60, status `received`

### 17. Rounding: prices 0.10 and 0.20
- **Rule:** `overpayment_protection` (and amounts must stay in cents)
- **Setup:** PO two lines, `LUM-2X4-8` qty 1 at 0.10 and `CEM-30KG` qty 1 at 0.20. Submit. Receive both.
- **Decisive:** Invoice the same two lines
- **Expect:** 201. `total_amount` 0.30. `ordered_value` and `received_value` 0.30. A total of 0.30000000000000004 or a refusal of an exact invoice is a breach.

## three_way_match_gate

### 18. Approve while invoice is still `received` (confirm flag)
- **Rule:** `three_way_match_gate`
- **Setup:** Full receive and invoice. `GET` invoice shows `matched: false`, `status: received`.
- **Decisive:** `POST /invoices/{id}/approve` (same shape as attack 1; kept so the flag is evidenced)
- **Expect:** 400, `rule` = `three_way_match_gate`. Status stays `received`.

## partial_receipt_flag

### 19. Short line received, long line not
- **Rule:** `partial_receipt_flag`
- **Setup:** PO `SCR-DECK-1LB` qty 2 at 9.99 and `PLY-12-4X8` qty 10 at 22.40. Submit. Receive only the short line qty 2. Invoice only that line.
- **Decisive:** `POST /invoices/{id}/match`
- **Expect:** 200, `matched` true, `partial_receipt` true

### 20. After the long line is received last, partial flag clears
- **Rule:** `partial_receipt_flag`
- **Setup:** Same two-line PO. Receive short line qty 2 first. Then receive the long line qty 10. Invoice only the long line (short line has no invoice; received value of long line is 224.00). Both lines are fully received before match.
- **Decisive:** `POST /invoices/{id}/match`
- **Expect:** 200, `partial_receipt` false (no line is short)

### 21. Fully received single line
- **Rule:** `partial_receipt_flag`
- **Setup:** One line, receive all, invoice all, match.
- **Decisive:** `POST /invoices/{id}/match`
- **Expect:** 200, `partial_receipt` false

## duplicate_invoice_detection

### 22. Same invoice number twice
- **Rule:** `duplicate_invoice_detection`
- **Setup:** PO submitted and fully received so the first invoice is valid. Invoice number `INV-7`.
- **Decisive:** Second `POST /invoices` with `INV-7` on the same vendor (qty within remaining received — first invoice takes the full receipt, so the duplicate may also trip overpayment). Use two POs for the same vendor so the second invoice is valid except for the number: PO-A invoice `INV-7`, PO-B invoice `INV-7`.
- **Expect:** 400, `rule` = `duplicate_invoice_detection`

### 23. Case-only difference
- **Rule:** `duplicate_invoice_detection`
- **Setup:** Two POs, same vendor, each fully received. First invoice `INV-7`.
- **Decisive:** Second invoice `inv-7`
- **Expect:** 400, `rule` = `duplicate_invoice_detection`

### 24. Surrounding spaces
- **Rule:** `duplicate_invoice_detection`
- **Setup:** Two POs, same vendor, each fully received. First invoice `INV-7`.
- **Decisive:** Second invoice ` INV-7 `
- **Expect:** 400, `rule` = `duplicate_invoice_detection`

### 25. Same number on two different vendors
- **Rule:** `duplicate_invoice_detection` (uniqueness is per vendor)
- **Setup:** Seed vendor invoices `INV-SHARED`. Create a second active vendor, its own PO, submit, receive, invoice `INV-SHARED`.
- **Decisive:** The second vendor's `POST /invoices`
- **Expect:** 201. A 400 duplicate rule is a breach (docs limit the check to one vendor).

## gl_balance

### 26. Approval ledger balances
- **Rule:** `gl_balance`
- **Setup:** Happy path, invoice total 47.50 (`LUM-2X4-8` × 10 × 4.75). Match.
- **Decisive:** `POST /invoices/{id}/approve`
- **Expect:** 200, `gl_entry.balanced` true, debit sum = credit sum = 47.50, accounts Materials Expense and Accounts Payable

### 27. Rounding on approve (0.10 + 0.20)
- **Rule:** `gl_balance`
- **Setup:** PO lines 0.10 and 0.20, full receive, invoice total 0.30, match.
- **Decisive:** `POST /invoices/{id}/approve`
- **Expect:** 200, `balanced` true, debit and credit amounts 0.30 (cents, not a binary float)

## invoice_line_validation

### 28. SKU not on the purchase order
- **Rule:** `invoice_line_validation`
- **Setup:** PO only `LUM-2X4-8`, submitted and fully received.
- **Decisive:** Invoice line `REB-10MM-6`
- **Expect:** 400, `rule` = `invoice_line_validation`

### 29. Same SKU twice on one invoice
- **Rule:** `invoice_line_validation`
- **Setup:** PO `LUM-2X4-8` qty 10, fully received.
- **Decisive:** Invoice with two lines of `LUM-2X4-8` qty 1 at 4.75
- **Expect:** 400, `rule` = `invoice_line_validation`

### 30. Duplicate SKU on the purchase order itself
- **Rule:** documented “each SKU once” on PO create (OpenAPI 400). Not one of the 11 named rules.
- **Setup:** Reset.
- **Decisive:** `POST /purchase-orders` with two `LUM-2X4-8` lines
- **Expect:** 400 (`validation_error` or similar). 201 is a breach of the documented once-per-PO constraint.

## duplicate_approval

### 31. Approve the same invoice twice
- **Rule:** `duplicate_approval`
- **Setup:** Happy path through first approve (must be 200).
- **Decisive:** Second `POST /invoices/{id}/approve`
- **Expect:** 400, `rule` = `duplicate_approval`. Exposure must not double.

## workflow_gate

### 32. Submit twice
- **Rule:** `workflow_gate`
- **Setup:** Create PO, submit once (200, status submitted).
- **Decisive:** `POST /purchase-orders/{id}/submit` again
- **Expect:** 400, `rule` = `workflow_gate`

### 33. Receive on a draft
- **Rule:** `workflow_gate`
- **Setup:** Create PO, leave it `draft`.
- **Decisive:** `POST /purchase-orders/{id}/receive` qty within the order
- **Expect:** 400, `rule` = `workflow_gate`

### 34. Invoice a draft purchase order
- **Rule:** `workflow_gate`
- **Setup:** Create PO, do not submit.
- **Decisive:** `POST /invoices` against that PO
- **Expect:** 400, `rule` = `workflow_gate`

### 35. Match an approved invoice again
- **Rule:** `workflow_gate`
- **Setup:** Happy path through approve.
- **Decisive:** `POST /invoices/{id}/match`
- **Expect:** 400, `rule` = `workflow_gate`

### 36. Receive again after the PO is closed
- **Rule:** `workflow_gate` (receive only on `submitted`). Also violates `receive_quantity_limit` because nothing remains.
- **Setup:** Submit and receive the full quantity so status is `closed`.
- **Decisive:** Receive 1 more of the same SKU
- **Expect:** 400. Either `workflow_gate` or `receive_quantity_limit` is a hold (both rules are truly violated; docs do not set precedence). 200 is a breach.

## vendor_exposure_math

### 37. Exposure equals one approved total
- **Rule:** `vendor_exposure_math`
- **Setup:** One invoice total 47.50, match, approve.
- **Decisive:** `GET /vendors/{id}/exposure` compared with approve `vendor_exposure` and invoice `total_amount`
- **Expect:** `open_ap_liability` 47.50, `vendor_exposure` 47.50, approved id listed. Before approve, exposure is 0 (checked in setup; mismatch on the GET is a breach).

### 38. Exposure equals the sum of two approved invoices and ignores an unapproved one
- **Rule:** `vendor_exposure_math`
- **Setup:** Two POs, each qty 2 `LUM-2X4-8` at 4.75 (9.50 each), both fully received, invoiced, matched, approved. Third PO same shape, invoiced and matched but not approved.
- **Decisive:** `GET /vendors/{id}/exposure`
- **Expect:** `open_ap_liability` 19.00 and exactly the two approved invoice ids. 28.50 (including the unapproved) is a breach.

### 39. Other vendor exposure stays zero
- **Rule:** `vendor_exposure_math`
- **Setup:** Approve an invoice for `vnd-001` only.
- **Decisive:** `GET /vendors/vnd-002/exposure` (id confirmed from `GET /vendors`)
- **Expect:** `open_ap_liability` 0 and empty `approved_invoices`

## Zero and negative quantities and prices

Docs: quantity greater than 0 and at most 10,000; unit price from 0 to 100,000; same limits on deliveries and invoice lines. OpenAPI: 400 `validation_error`. These are not the 11 business-rule names. Accepting a zero or negative is a breach of the documented limits.

### 40. PO quantity 0
- **Decisive:** `POST /purchase-orders` quantity 0
- **Expect:** 400 `validation_error` (or equivalent refusal). Not 201.

### 41. PO quantity negative
- **Decisive:** `POST /purchase-orders` quantity -1
- **Expect:** 400 refusal. Not 201.

### 42. PO unit price negative
- **Decisive:** `POST /purchase-orders` unit_price -0.01
- **Expect:** 400 refusal. Not 201.

### 43. Receive quantity 0
- **Setup:** Submitted PO.
- **Decisive:** Receive quantity 0
- **Expect:** 400 refusal. Not 200.

### 44. Receive quantity negative
- **Setup:** Submitted PO.
- **Decisive:** Receive quantity -1
- **Expect:** 400 refusal. Not 200.

### 45. Invoice quantity 0
- **Setup:** Submitted and fully received PO.
- **Decisive:** Invoice quantity 0
- **Expect:** 400 refusal. Not 201.

### 46. Invoice unit price negative
- **Setup:** Submitted and fully received PO.
- **Decisive:** Invoice unit_price -1
- **Expect:** 400 refusal. Not 201.

## Undocumented (docs silent)

### 47. Match an invoice that is already matched but not approved
- **Rule:** none named. `workflow_gate` only says never match an **approved** invoice again. OpenAPI match 400 is described as “The invoice is already approved.”
- **Setup:** Happy path through match (status `matched`). Do not approve.
- **Decisive:** `POST /invoices/{id}/match` a second time
- **Expect:** Docs do not say. Record `undocumented` unless the call is a 200 rematch or a 400 that only restates approval (it is not approved). Do not treat either as a named-rule breach.

## Execution order

Attacks run in the numbered order above: challenge four (1–4), then the remaining rules. One JSON line appended to `qa-run/attacks.jsonl` after each attack.
