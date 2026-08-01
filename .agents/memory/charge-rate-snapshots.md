---
name: Charge rate snapshots vs. freight
description: Why changing commission settings never alters past receipts, and why freight is the one charge that can drift.
---

# Charge rates are snapshotted per transaction; freight is not

There is no effective-date / rate-history table for charge settings. The business charge settings
row carries only created/updated timestamps and reads always take the latest row.

History is protected a different way: **each transaction stores its own rate snapshots** (the
farmer/buyer percentages and per-bag rates it was computed with). Hammali, Aadhat, Mandi and
Muddat-Anya are recomputed from those stored snapshots, so changing the global settings today
cannot alter a past receipt, a past ledger line, or even the result of re-saving an old card.

**Freight (bhada) is the exception.** It is not snapshotted — it is derived on every card save as
`vehicleBhadaRate x (this crop group's bags / totalBagsInVehicle)` and then persisted. That makes
it the one charge that can silently go stale if a save is rejected, and the reason vehicle-level
fields need their own edit guard rather than relying on a snapshot.

**Why:** a farmer receipt showed freight for only part of a vehicle's bags because some lots'
saves were rejected while others went through, and the card UI kept rendering freshly recalculated
numbers that were never written.

**How to apply:** when adding a new charge, decide up front whether it is snapshotted or derived.
Derived charges must be allowed to re-persist on every save, and their *inputs* must be guarded
instead. Never "fix" a stale derived amount by recomputing it at receipt/ledger render time — that
desyncs the printed figure from what was actually deducted.
