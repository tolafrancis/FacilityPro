**Inventory** tracks your spare parts and consumables: how many you have, where they go and when to reorder. **Purchasing** (in Financial) takes you from a request for quotation to parts on the shelf.

**Who can use it:** Everyone on staff sees stock, and technicians log parts on work orders. Administrators and Managers add parts, restock and manage purchasing.

**Where:** Menu → **Parts** and **Financial**.

## The parts list

![Parts & inventory](/help/screens/parts.webp)

① New part · ② Category filter · ③ Low stock · ④ Quantity to add · ⑤ Restock · ⑥ Transaction history

Each row shows the part, its supplier and category, **SKU**, **In stock**, **Reorder at** and **Unit cost**. A part at or below its reorder level shows **Low stock** ③.

## Adding a part

1. Click **New part** ①.
2. Enter the **Name**, **SKU (optional)** and **Unit** (e.g. *pcs*, *L*, *kg*).
3. Enter the **Initial stock**, **Reorder level** and **Unit cost**.
4. Choose a **Category** (or **Create new category**) and a **Preferred supplier**.
5. Save.

## Restocking

1. Find the part.
2. Type the quantity received in the box ④.
3. Click **Restock** ⑤. The stock goes up and a *Received* line is added to the history.

## Using parts on a work order

Technicians log parts on the work order under **Parts used** ([Work orders → Step 4](/help/guide/work-orders#step-4-doing-the-work-technician)). Stock goes down straight away and the part's cost is added to the job.

For planned maintenance, a schedule's **Required parts** appear as **Suggested parts** on the work order; click **Use** to fill them in.

## Transaction history

![Transaction history](/help/screens/parts-history.webp)

Click the arrow ⑥ on a row to see every stock movement: **Issued** (used on work orders), **Received**, **Adjustment** and **Cycle count**, with date and quantity.

> **Tip:** Set up the *Parts quantity* workflow to email your storekeeper when a part runs low ([Workflows](/help/guide/settings#workflows-automation)).

## Purchase orders

![Procurement](/help/screens/financial.webp)

① Budget, committed spend and open POs · ② New PO · ③ PO number · ④ Status

Purchase orders live in **Financial → Procurement**. Each one moves through **RFQ** (request for quotation) → **PO** → **Approved** → **Received**.

1. Click **New PO** ②. Enter the title, choose the vendor and cost center, and add lines (part or description, quantity, unit cost).
2. Save. A PO number such as *PO-2026-0102* is given when it becomes a purchase order ③.
3. Open the PO and move it on as it is quoted, ordered and approved.
4. When the goods arrive, record a **receipt**, with the quantity received for each line. Part stock goes up automatically.

![A purchase order](/help/screens/financial-po.webp)

> **Note:** Invoices and payments are recorded in Financial as well. See [Reports → Financial](/help/guide/reports#financial-overview).
