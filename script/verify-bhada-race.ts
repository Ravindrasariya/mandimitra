/**
 * Manual race check for the Freight/Bhada payment guards.
 *
 * Creates a throwaway business with one farmer card, then fires a bhada payout and a conflicting lot-side
 * change (bhada cut / archive / delete) at the same instant, and asserts the card never ends up with more
 * paid than it owes. Run with: npx tsx script/verify-bhada-race.ts   (dev server must be running)
 */
import { db } from "../server/db";
import { businesses, users, farmers, lots, cashEntries } from "@shared/schema";
import { hashPassword } from "../server/auth";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:5000";
const PASSWORD = "RaceTest#12345";
const DATE = "2031-01-15";

async function main() {
  const stamp = Date.now();
  const [biz] = await db.insert(businesses).values({ merchantId: `RACE${stamp}`, name: "Race Test Mandi" }).returning();
  const username = `racetest${stamp}`;
  await db.insert(users).values({
    username, name: "Race Test", password: await hashPassword(PASSWORD),
    businessId: biz.id, role: "admin", mustChangePassword: false,
  });

  const [farmer] = await db.insert(farmers).values({
    businessId: biz.id, farmerId: `F${stamp}`, name: "Race Farmer", phone: "9000000000",
  }).returning();

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status} ${await loginRes.text()}`);
  const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];

  const api = (path: string, method: string, body?: any) => fetch(`${BASE}${path}`, {
    method, headers: { "Content-Type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  let serial = 1;
  const makeLot = async () => {
    const [lot] = await db.insert(lots).values({
      businessId: biz.id, lotId: `L${stamp}-${serial}`, serialNumber: serial++, farmerId: farmer.id,
      date: DATE, crop: "Soyabean", numberOfBags: 10, remainingBags: 10,
      vehicleNumber: `MP09RACE${serial}`, vehicleBhadaRate: "1000",
    }).returning();
    return lot;
  };

  const payBhada = () => api("/api/cash-entries", "POST", {
    category: "outward", type: "Farmer Payment", outflowType: "Freight/Bhada",
    farmerId: farmer.id, stockDate: DATE, amount: "1000", paymentMode: "Cash", date: DATE,
  });

  const cardPaid = async () => {
    const rows = await db.select().from(cashEntries).where(and(
      eq(cashEntries.businessId, biz.id), eq(cashEntries.farmerId, farmer.id),
      eq(cashEntries.isReversed, false), eq(cashEntries.isArchived, false),
    ));
    return rows.reduce((s, r) => s + Number(r.amount), 0);
  };
  const cardOwed = async () => {
    const rows = await db.select().from(lots).where(and(
      eq(lots.businessId, biz.id), eq(lots.farmerId, farmer.id), eq(lots.date, DATE), eq(lots.isArchived, false),
    ));
    const byVehicle = new Map<string, number>();
    for (const l of rows) byVehicle.set(l.vehicleNumber || "", Number(l.vehicleBhadaRate || 0));
    return [...byVehicle.values()].reduce((s, v) => s + v, 0);
  };
  const clearPayments = () => db.delete(cashEntries).where(eq(cashEntries.businessId, biz.id));
  const resetCard = async () => {
    await db.execute(`delete from lot_edit_history where business_id = ${biz.id}` as any);
    await db.delete(lots).where(eq(lots.businessId, biz.id));
  };

  const scenarios: { name: string; run: (lotId: number) => Promise<any> }[] = [
    { name: "cut bhada to 0", run: (id) => api(`/api/lots/${id}`, "PATCH", { vehicleBhadaRate: "0" }) },
    { name: "move stock date", run: (id) => api(`/api/lots/${id}`, "PATCH", { date: "2031-02-02" }) },
    { name: "archive lot", run: (id) => api(`/api/lots/${id}`, "PATCH", { isArchived: true }) },
    { name: "bulk archive", run: (id) => api(`/api/lots/bulk-archive`, "POST", { lotIds: [id], isArchived: true }) },
    { name: "archive farmer", run: () => api(`/api/farmers/${farmer.id}`, "PATCH", { isArchived: true }) },
    { name: "delete lot", run: (id) => api(`/api/lots/${id}`, "DELETE") },
  ];

  let failures = 0;
  for (const s of scenarios) {
    for (const payFirst of [false, true]) {
      // Each round starts from a clean card holding exactly one lot worth ₹1000, so the invariant is
      // sharp: any guard that lets both operations through shows up immediately as paid > owed.
      await clearPayments();
      await resetCard();
      const lot = await makeLot();
      const ops = payFirst
        ? [payBhada(), s.run(lot.id)]
        : [s.run(lot.id), payBhada()];
      const [a, b] = await Promise.all(ops);
      const paid = await cardPaid();
      const owed = await cardOwed();
      const ok = paid <= owed + 0.01;
      if (!ok) failures++;
      console.log(
        `${ok ? "OK  " : "FAIL"} ${s.name.padEnd(16)} (${payFirst ? "pay first" : "lot first"}) ` +
        `paid=${paid} owed=${owed} statuses=${a.status ?? "?"}/${b.status ?? "?"}`
      );
      await db.update(farmers).set({ isArchived: false }).where(eq(farmers.id, farmer.id));
    }
  }

  // Cleanup
  await db.delete(cashEntries).where(eq(cashEntries.businessId, biz.id));
  await db.execute(`delete from lot_edit_history where business_id = ${biz.id}` as any);
  await db.execute(`delete from farmer_edit_history where business_id = ${biz.id}` as any);
  await db.delete(lots).where(eq(lots.businessId, biz.id));
  await db.delete(farmers).where(eq(farmers.businessId, biz.id));
  await db.delete(users).where(eq(users.businessId, biz.id));
  await db.delete(businesses).where(eq(businesses.id, biz.id));

  console.log(failures === 0 ? "\nAll scenarios held the invariant (paid <= owed)." : `\n${failures} scenario(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
