/**
 * T Pfigu finance opening-balance migration: DRY RUN ONLY.
 *
 * Reads the firm's Excel books, maps them to LexZim opening balances, validates totals,
 * detects duplicates across files and against existing clients, and writes an import record.
 * It never writes to the database.
 *
 *   FIN_MIG_DIR="<folder with the workbooks>" npx tsx scripts/finance-migration-dryrun.ts
 *
 * Output: FIN_MIG_OUT (default %TEMP%/finance_migration_dryrun.json).
 */
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import postgres from "postgres";

config({ path: ".env.local" });

const DIR =
  process.env.FIN_MIG_DIR ??
  "C:\\Users\\Administrator\\Desktop\\STUFF\\WORK\\Accounts\\Accounts at 28-09-2026";
const OUT = process.env.FIN_MIG_OUT ?? `${process.env.TEMP}\\finance_migration_dryrun.json`;
const FIRM_NAME = "T Pfigu";

const FILES = {
  trust: "Bank - Trust Accounts 2026.xlsx",
  debtors: "Debtors Recon Statements 2026.xlsx",
  disb: "Disbursement Account Ledger as at 25092026.xlsx",
  cash: "Cash Log Books 21 - 25  September 2026.xlsx",
};

type Issue = { severity: "error" | "warning" | "decision"; file: string; detail: string };
type Row = {
  file: string;
  sheet: string;
  row: number;
  sourceName: string;
  clientKey: string;
  target: string;
  amountCents: number;
  note?: string;
};

const issues: Issue[] = [];
const rows: Row[] = [];

function val(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object" && "result" in v) return (v as { result: unknown }).result;
  if (v && typeof v === "object" && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
  }
  return v;
}
const num = (v: ExcelJS.CellValue) => {
  const x = val(v);
  return typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" && !isNaN(Number(x)) ? Number(x) : null;
};
const str = (v: ExcelJS.CellValue) => {
  const x = val(v);
  return x == null ? "" : String(x).trim();
};
const cents = (n: number) => Math.round(n * 100);

const TITLES = /\b(mr|mrs|ms|miss|dr|eng|rev|estate|late|the|of|p\/l|pl|pvt|ltd|and)\b\.?/g;
/** Surname-style key used to match the same client across books. */
function clientKey(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(TITLES, " ")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const alias: Record<string, string> = { jefferey: "jeffery", jeffrey: "jeffery", harishni: "harishri", harishi: "harishri" };
  const parts = cleaned.split(" ").filter((p) => p.length > 1);
  const known = parts.find((p) => KNOWN_SURNAMES.has(alias[p] ?? p));
  const pick = known ?? parts[parts.length - 1] ?? cleaned;
  return alias[pick] ?? pick;
}
const KNOWN_SURNAMES = new Set([
  "chikwama", "bristow", "mundawarara", "chikandiwa", "mafuka", "nyanyiwa", "jeffery", "harishri",
  "scholtz", "chirima", "maradze", "danet", "mhaka", "chipanga", "mutanga", "mandizha", "ndagurwa",
  "nyabadza", "mwasoya", "matemezano", "mupetesi", "musindo", "gumbo", "chidziva", "kauraro",
  "rodrigues", "dandajena", "banda", "kasipo", "chigariro", "zokwa", "pfukwa", "paradza",
  "chiomberegwa", "gweme", "taguta", "granola", "kahembe",
]);

/** Names like "Rev Musindo Danet (TP)" mention two parties and need a human to pick the client. */
function countKnown(name: string) {
  const alias: Record<string, string> = { harishi: "harishri", harishni: "harishri" };
  const tokens = name.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/);
  return new Set(tokens.map((t) => alias[t] ?? t).filter((t) => KNOWN_SURNAMES.has(t))).size;
}

async function load(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(`${DIR}\\${file}`);
  return wb;
}

function sheetRows(ws: ExcelJS.Worksheet) {
  const out: { n: number; cells: ExcelJS.CellValue[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (r, n) => {
    const cells: ExcelJS.CellValue[] = [];
    for (let c = 1; c <= Math.max(ws.columnCount, 8); c++) cells.push(r.getCell(c).value);
    out.push({ n, cells });
  });
  return out;
}

function checkTotal(file: string, label: string, computed: number, stated: number | null) {
  if (stated == null) {
    issues.push({ severity: "warning", file, detail: `${label}: no stated total to check against (computed ${computed}).` });
  } else if (Math.abs(computed - stated) > 0.005) {
    issues.push({ severity: "error", file, detail: `${label}: stated ${stated} but lines add to ${computed}.` });
  }
}

async function trustBank() {
  const ws = (await load(FILES.trust)).getWorksheet("Trust Balances")!;
  let sum = 0;
  let stated: number | null = null;
  for (const { n, cells } of sheetRows(ws)) {
    const name = str(cells[0]);
    const amt = num(cells[1]);
    if (!name || name === "NAME" || amt == null) continue;
    if (/^total$/i.test(name)) {
      stated = amt;
      continue;
    }
    sum += amt;
    rows.push({ file: FILES.trust, sheet: ws.name, row: n, sourceName: name, clientKey: clientKey(name), target: "trust_bank_opening", amountCents: cents(amt) });
  }
  checkTotal(FILES.trust, "Trust Balances", sum, stated);
  const heading = str(ws.getRow(1).getCell(1).value);
  if (/13\.8\.2026/.test(heading)) {
    issues.push({ severity: "warning", file: FILES.trust, detail: `Heading still reads "${heading.trim()}" although entries run into September. Cutover date must be confirmed.` });
  }
}

async function trustCash() {
  const wb = await load(FILES.disb);
  const ws = wb.getWorksheet("Cash Trust Account Balances")!;
  let sum = 0;
  let stated: number | null = null;
  const local: Row[] = [];
  for (const { n, cells } of sheetRows(ws)) {
    const name = str(cells[1]);
    const amt = num(cells[2]);
    if (!name || name === "Name" || amt == null) continue;
    if (/^total$/i.test(name)) {
      stated = amt;
      continue;
    }
    sum += amt;
    local.push({ file: FILES.disb, sheet: ws.name, row: n, sourceName: name, clientKey: clientKey(name), target: "trust_vault_opening", amountCents: cents(amt) });
  }
  checkTotal(FILES.disb, "Cash Trust Account Balances", sum, stated);

  const pot = wb.getWorksheet("Disbursement Account")!;
  let inflow = 0;
  let outflow = 0;
  let typedBalance: number | null = null;
  // Layout: B date, C receipt, D description, E amount (money in); F to I the same for money out.
  // Subtotal rows have no description, so only described lines are counted.
  for (const { cells } of sheetRows(pot)) {
    const inDesc = str(cells[3]).toLowerCase();
    const inAmt = num(cells[4]);
    const outDesc = str(cells[7]).toLowerCase();
    const outAmt = num(cells[8]);
    if (/balance b\/f/.test(inDesc) && inAmt != null) typedBalance = inAmt;
    else if (inDesc && !/total/.test(inDesc) && inAmt != null) inflow += inAmt;
    if (outDesc && !/total/.test(outDesc) && outAmt != null) outflow += outAmt;
  }
  const potBalance = Math.round((inflow - outflow) * 100) / 100;

  // Firm decision 29 Sep 2026: Zokwa 740 and Pfukwa 110 were deposited to bank trust, leaving 534 cash on hand.
  const gapMoves: Record<string, number> = { zokwa: 740, pfukwa: 110 };
  const moved = Object.values(gapMoves).reduce((a, b) => a + b, 0);
  for (const r of local) {
    const mv = gapMoves[r.clientKey];
    if (mv) {
      r.amountCents -= cents(mv);
      r.note = `reduced by ${mv}: deposited to bank trust (firm decision 29 Sep 2026)`;
      rows.push({ file: FILES.disb, sheet: ws.name, row: r.row, sourceName: r.sourceName, clientKey: r.clientKey, target: "trust_bank_opening", amountCents: cents(mv), note: "deposited from cash trust (firm decision 29 Sep 2026)" });
    }
    rows.push(r);
  }
  const vaultAfter = sum - moved;
  const onHand = typedBalance ?? potBalance;
  if (Math.abs(vaultAfter - onHand) > 0.005) {
    issues.push({ severity: "error", file: FILES.disb, detail: `Cash trust after the ${moved} deposit is ${vaultAfter} but cash on hand is ${onHand}.` });
  }
  if (typedBalance != null && Math.abs(typedBalance - potBalance) > 0.005) {
    issues.push({
      severity: "warning",
      file: FILES.disb,
      detail: `Cash on hand ${typedBalance} agrees with client balances; the ledger lines (in ${inflow}, out ${outflow}) add to ${potBalance}, so one line in the pot ledger is ${Math.abs(typedBalance - potBalance)} short. Fix the sheet line; the opening balance uses cash on hand.`,
    });
  }
  return { inflow, outflow, potBalance, typedBalance, vaultAfter };
}

async function debtors() {
  const wb = await load(FILES.debtors);
  const ws = wb.getWorksheet("Master Schedule")!;
  let bucket = "";
  let bucketSum = 0;
  let grand = 0;
  let statedGrand: number | null = null;
  for (const { n, cells } of sheetRows(ws)) {
    const name = str(cells[0]);
    const amt = num(cells[1]);
    if (/DAYS/.test(name) && amt == null) {
      bucket = name;
      bucketSum = 0;
      continue;
    }
    if (/^sub total$/i.test(name)) {
      checkTotal(FILES.debtors, `Master Schedule ${bucket} subtotal`, bucketSum, amt);
      continue;
    }
    if (/^grand total$/i.test(name)) {
      statedGrand = amt;
      continue;
    }
    if (!name || amt == null) continue;
    bucketSum += amt;
    grand += amt;
    const dateCell = str(cells[3]);
    if (/^2026-(1[0-2])-/.test(dateCell)) {
      issues.push({ severity: "warning", file: FILES.debtors, detail: `${name}: "date updated" ${dateCell.slice(0, 10)} is in the future; likely day and month swapped.` });
    }
    rows.push({ file: FILES.debtors, sheet: ws.name, row: n, sourceName: name, clientKey: clientKey(name), target: "ar_opening_invoice", amountCents: cents(amt), note: bucket });
  }
  checkTotal(FILES.debtors, "Master Schedule grand total", grand, statedGrand);

  const banda = wb.getWorksheet("Banda");
  if (banda) {
    let debit = 0;
    let credit = 0;
    let writeOff = 0;
    for (const { cells } of sheetRows(banda)) {
      const d = str(cells[1]).toLowerCase();
      const dr = num(cells[2]);
      const cr = num(cells[3]);
      if (dr != null) debit += dr;
      if (cr != null && /bad debt/.test(d)) writeOff = cr;
      else if (cr != null) credit += cr;
    }
    // Firm decision 29 Sep 2026: the true balance stands as the write-off; the sheet figure was a working error.
    const trueBalance = debit - credit;
    rows.push({
      file: FILES.debtors,
      sheet: "Banda",
      row: 0,
      sourceName: "Ms L Banda",
      clientKey: "banda",
      target: "bad_debt_written_off",
      amountCents: cents(trueBalance),
      note: `sheet wrote off ${writeOff}; corrected to true balance ${trueBalance} (firm decision 29 Sep 2026)`,
    });
    if (Math.abs(trueBalance - writeOff) > 0.005) {
      issues.push({ severity: "warning", file: FILES.debtors, detail: `Banda sheet: correct the bad debt line from ${writeOff} to ${trueBalance} (the first balance line subtracts the 1,000 payment twice).` });
    }
  }
  return { grand, statedGrand };
}

async function cashBooks() {
  const wb = await load(FILES.cash);
  const out: Record<string, { bf: number; in: number; out: number; closing: number; statedClosing: number | null }> = {};
  for (const [name, inCol, outCol, balCol] of [
    ["Cash Book", 5, 6, 7],
    ["Petty Cash B", 4, 5, 6],
  ] as const) {
    const ws = wb.getWorksheet(name)!;
    let bf = 0;
    let tin = 0;
    let tout = 0;
    let stated: number | null = null;
    for (const { cells } of sheetRows(ws)) {
      const all = cells.map(str).join(" ").toUpperCase();
      if (/BROUGHT FORWARD|B\/F/.test(all) && !/TOP/.test(all)) {
        bf = num(cells[balCol]) ?? 0;
        continue;
      }
      if (str(cells[0]).toUpperCase() === "TOTAL") {
        stated = num(cells[balCol]);
        continue;
      }
      if (!cells[0]) continue;
      tin += num(cells[inCol]) ?? 0;
      tout += num(cells[outCol]) ?? 0;
    }
    const closing = bf + tin - tout;
    out[name] = { bf, in: tin, out: tout, closing, statedClosing: stated };
    checkTotal(FILES.cash, `${name} closing balance`, closing, stated);
  }
  issues.push({ severity: "warning", file: FILES.cash, detail: "Cash on hand, difference, signed and checked blocks are blank in both books: no physical count recorded." });
  issues.push({ severity: "warning", file: FILES.cash, detail: "Receipt numbers 157 and 160 are reused across the cash book and petty cash book, so they cannot be used as unique import keys." });
  rows.push({ file: FILES.cash, sheet: "Cash Book", row: 0, sourceName: "Business cash", clientKey: "_firm", target: "business_cash_opening", amountCents: cents(out["Cash Book"]!.closing) });
  rows.push({ file: FILES.cash, sheet: "Petty Cash B", row: 0, sourceName: "Petty cash", clientKey: "_firm", target: "petty_cash_opening", amountCents: cents(out["Petty Cash B"]!.closing) });
  return out;
}

async function main() {
  const trustBankSummary = await trustBank();
  const pot = await trustCash();
  const ar = await debtors();
  const cash = await cashBooks();
  void trustBankSummary;

  // The pot's physical cash is the client cash trust already mapped above; booking it again as firm float would double count.
  // Firm decision 29 Sep 2026: the disbursement float (GL 1060) has not been funded yet.
  rows.push({ file: FILES.disb, sheet: "Disbursement Account", row: 0, sourceName: "Disbursement float", clientKey: "_firm", target: "disbursement_float_opening", amountCents: 0, note: "not yet funded (firm decision 29 Sep 2026)" });

  // Pot costs paid for clients with no or short deposits (findings 28 Sep 2026, section 5).
  const advances: { key: string; name: string; amount: number; action: "write_off" | "recover"; decided: boolean }[] = [
    { key: "harishri", name: "Harishri", amount: 284, action: "write_off", decided: true },
    { key: "mupetesi", name: "Mupetesi", amount: 51, action: "recover", decided: true },
    { key: "jeffery", name: "Mr Malcom Jeffery", amount: 323, action: "recover", decided: false },
    { key: "bristow", name: "Bristow", amount: 190, action: "recover", decided: false },
    { key: "taguta", name: "Taguta", amount: 30, action: "recover", decided: false },
    { key: "kahembe", name: "Kahembe", amount: 10, action: "recover", decided: false },
    { key: "granola", name: "Granola", amount: 10, action: "recover", decided: false },
    { key: "danet", name: "Danet", amount: 5, action: "recover", decided: false },
  ];
  for (const a of advances) {
    rows.push({
      file: FILES.disb,
      sheet: "Disbursement Account",
      row: 0,
      sourceName: a.name,
      clientKey: a.key,
      target: a.action === "write_off" ? "advance_written_off" : "recoverable_advance_opening",
      amountCents: cents(a.amount),
      note: a.decided
        ? a.action === "write_off"
          ? "written off (firm decision 29 Sep 2026)"
          : "recover from pending invoice payments (firm decision 29 Sep 2026)"
        : "recover by default; firm to confirm",
    });
  }
  const undecided = advances.filter((a) => !a.decided);
  if (undecided.length) {
    issues.push({
      severity: "decision",
      file: FILES.disb,
      detail: `Held as recoverable until confirmed: ${undecided.map((a) => `${a.name} ${a.amount}`).join(", ")}.`,
    });
  }

  // Duplicate detection within the import itself. Danet is one client with several matters (firm decision 29 Sep 2026).
  const seen = new Map<string, Row>();
  for (const r of rows) {
    if (r.clientKey === "_firm") continue;
    const k = `${r.target}:${r.clientKey}`;
    const prev = seen.get(k);
    if (prev && r.target !== "trust_bank_opening" && r.clientKey !== "danet") {
      issues.push({ severity: "warning", file: r.file, detail: `Possible duplicate ${r.target} for "${r.sourceName}" (also "${prev.sourceName}"). Review before import.` });
    }
    seen.set(k, r);
  }
  const chikwama = rows.filter((r) => r.clientKey === "chikwama" && r.target === "trust_bank_opening");
  if (chikwama.length > 1) {
    issues.push({ severity: "decision", file: FILES.trust, detail: `"Chikwama R" and "Chikwama M" share a surname. They are kept as two separate trust clients unless management confirms they are one.` });
  }
  for (const r of rows) {
    if (r.clientKey === "danet" && r.target === "ar_opening_invoice") {
      r.note = `${r.note ? `${r.note}; ` : ""}Danet matter: ${r.sourceName}`;
    }
    if (r.clientKey === "jeffery" && /jefferey|jeffrey/i.test(r.sourceName)) {
      r.note = `${r.note ? `${r.note}; ` : ""}spelling corrected to Mr Malcom Jeffery`;
    }
  }

  // Read-only check against existing T Pfigu records.
  const sql = postgres(process.env.DIRECT_URL || process.env.DATABASE_URL!, { max: 1, prepare: false });
  let existingClients: { client_number: string; name: string }[] = [];
  let finance: Record<string, number> = {};
  let firmId: string | null = null;
  try {
    const firm = await sql<{ id: string }[]>`select id from firms where name ilike ${FIRM_NAME + "%"} limit 1`;
    firmId = firm[0]?.id ?? null;
    if (firmId) {
      existingClients = await sql<{ client_number: string; name: string }[]>`
        select client_number, coalesce(full_name, registered_name, legal_name, trim(coalesce(first_name,'') || ' ' || coalesce(surname,''))) as name
        from clients where firm_id = ${firmId}`;
      const [c] = await sql<Record<string, number>[]>`
        select
          (select count(*)::int from trust_ledger_entries where firm_id = ${firmId}) as trust_entries,
          (select count(*)::int from invoices where firm_id = ${firmId}) as invoices,
          (select count(*)::int from fee_payments where firm_id = ${firmId}) as fee_payments,
          (select count(*)::int from gl_journal_entries where firm_id = ${firmId}) as gl_journals`;
      finance = c ?? {};
    }
  } finally {
    await sql.end();
  }

  const existingByKey = new Map<string, string[]>();
  for (const c of existingClients) {
    const k = clientKey(c.name ?? "");
    existingByKey.set(k, [...(existingByKey.get(k) ?? []), `${c.client_number} ${c.name}`]);
  }
  const register = new Map<string, { names: Set<string>; targets: Set<string>; existing: string[] }>();
  for (const r of rows) {
    if (r.clientKey === "_firm") continue;
    const e = register.get(r.clientKey) ?? { names: new Set(), targets: new Set(), existing: existingByKey.get(r.clientKey) ?? [] };
    e.names.add(r.sourceName.replace(/\s+/g, " ").trim());
    e.targets.add(r.target);
    register.set(r.clientKey, e);
  }
  if (Object.values(finance).some((n) => n > 0)) {
    issues.push({ severity: "error", file: "database", detail: `T Pfigu already has finance rows ${JSON.stringify(finance)}. Opening balances must not be imported on top without reconciliation.` });
  }

  const sum = (t: string) => rows.filter((r) => r.target === t).reduce((a, r) => a + r.amountCents, 0) / 100;
  const result = {
    mode: "dry_run",
    generatedAt: new Date().toISOString(),
    sourceDir: DIR,
    firm: { name: FIRM_NAME, id: firmId, existingClientCount: existingClients.length, existingFinanceRows: finance },
    totals: {
      trustBankOpening: sum("trust_bank_opening"),
      trustVaultOpening: sum("trust_vault_opening"),
      arOpening: sum("ar_opening_invoice"),
      arStatedGrandTotal: ar.statedGrand,
      badDebtWrittenOff: sum("bad_debt_written_off"),
      cashPotComputed: pot.potBalance,
      cashPotTyped: pot.typedBalance,
      cashPotInflow: pot.inflow,
      cashPotOutflow: pot.outflow,
      businessCash: cash["Cash Book"]?.closing,
      pettyCash: cash["Petty Cash B"]?.closing,
      disbursementFloat: sum("disbursement_float_opening"),
      recoverableAdvances: sum("recoverable_advance_opening"),
      advancesWrittenOff: sum("advance_written_off"),
    },
    clientRegister: [...register.entries()].map(([key, v]) => {
      const multiName = [...v.names].some((n) => countKnown(n) > 1);
      return {
        key,
        sourceNames: [...v.names],
        targets: [...v.targets],
        matchesExisting: v.existing,
        action: multiName || v.existing.length > 1 ? "review_ambiguous" : v.existing.length === 1 ? "link_existing" : "create_new",
      };
    }),
    rows,
    issues,
    importable: !issues.some((i) => i.severity === "error"),
  };
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ totals: result.totals, clients: result.clientRegister.length, issues: issues.length, importable: result.importable }, null, 2));
  console.log(`Import record: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
