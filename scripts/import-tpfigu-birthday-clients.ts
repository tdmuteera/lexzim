/**
 * Import partial KYC clients from the T Pfigu birthday spreadsheet.
 *
 * Usage:
 *   npx tsx scripts/import-tpfigu-birthday-clients.ts --dry-run
 *   npx tsx scripts/import-tpfigu-birthday-clients.ts --execute
 */
import { config } from "dotenv";
import ExcelJS from "exceljs";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { parseClientInput } from "../lib/clients/validation";
import { clients, firms, users } from "../lib/db/schema";

config({ path: ".env.local" });

const DEFAULT_XLSX =
  "C:\\Users\\Administrator\\Desktop\\STUFF\\WORK\\Accounts\\Client Information -Birthdays.xlsx";
const FIRM_SLUG = "t-pfigu-attorneys";
const KYC_NOTE =
  "Imported from Client Information - Birthdays spreadsheet. Partial KYC; complete missing fields in LexZim.";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function cellText(value: ExcelJS.CellValue): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t || null;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    const t = value.text.trim();
    return t || null;
  }
  if (typeof value === "object" && "result" in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  return String(value).trim() || null;
}

function parseDob(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  // Store noon UTC to avoid off-by-one on DOB display in Harare.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T12:00:00.000Z`;
}

/** Normalize spreadsheet phones into a display string. */
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    return digits;
  }
  // Excel often drops leading 0 (e.g. 781206609 -> 0781206609).
  if (/^7\d{8}$/.test(digits)) return `0${digits}`;
  if (/^7\d{9}$/.test(digits)) return `0${digits}`;
  if (/^0\d{9}$/.test(digits)) return digits;
  // UK / intl numbers stored without +
  if (/^44\d{9,12}$/.test(digits) || /^1\d{10}$/.test(digits)) return `+${digits}`;
  return digits;
}

function splitIndividualName(full: string): {
  firstName: string;
  surname: string;
  otherNames: string | null;
  fullName: string;
} {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0]!, surname: parts[0]!, otherNames: null, fullName: parts[0]! };
  }
  if (parts.length === 2) {
    return {
      firstName: parts[0]!,
      surname: parts[1]!,
      otherNames: null,
      fullName: `${parts[0]} ${parts[1]}`,
    };
  }
  return {
    firstName: parts[0]!,
    surname: parts[parts.length - 1]!,
    otherNames: parts.slice(1, -1).join(" "),
    fullName: parts.join(" "),
  };
}

type SheetRow = {
  client: string;
  clientType: string | null;
  email: string | null;
  dob: string | null;
  phone: string | null;
  address: string | null;
};

async function readSheet(path: string): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Workbook has no sheets.");

  const headerRow = ws.getRow(1);
  const headers: Record<number, string> = {};
  headerRow.eachCell((cell, col) => {
    const h = cellText(cell.value)?.toLowerCase() ?? "";
    headers[col] = h;
  });

  const col = (names: string[]) => {
    for (const [idx, h] of Object.entries(headers)) {
      if (names.includes(h)) return Number(idx);
    }
    return null;
  };

  const cClient = col(["client"]);
  const cType = col(["client type"]);
  const cEmail = col(["email"]);
  const cDob = col(["dob", "date of birth"]);
  const cPhone = col(["phone number", "phone"]);
  const cAddress = col(["address"]);
  if (!cClient) throw new Error("Missing Client column.");

  const out: SheetRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const client = cellText(row.getCell(cClient).value);
    if (!client) return;
    out.push({
      client,
      clientType: cType ? cellText(row.getCell(cType).value) : null,
      email: cEmail ? cellText(row.getCell(cEmail).value) : null,
      dob: cDob ? cellText(row.getCell(cDob).value) : null,
      phone: cPhone ? cellText(row.getCell(cPhone).value) : null,
      address: cAddress ? cellText(row.getCell(cAddress).value) : null,
    });
  });
  return out;
}

async function nextClientNumber(
  db: ReturnType<typeof drizzle>,
  firmId: string,
  used: Set<string>,
): Promise<string> {
  const existing = await db
    .select({ clientNumber: clients.clientNumber })
    .from(clients)
    .where(eq(clients.firmId, firmId));
  let max = 0;
  for (const row of existing) {
    const m = /^CL(\d+)$/.exec(row.clientNumber);
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (const n of used) {
    const m = /^CL(\d+)$/.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const next = max + 1;
  const num = `CL${String(next).padStart(4, "0")}`;
  used.add(num);
  return num;
}

async function main() {
  const dryRun = hasFlag("--dry-run") || !hasFlag("--execute");
  const path = argValue("--file") ?? DEFAULT_XLSX;

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL required");

  const sheetRows = await readSheet(path);
  console.log(`Read ${sheetRows.length} rows from ${path}`);

  const sql = postgres(url, { max: 1, ssl: "require" });
  const db = drizzle(sql);

  const firmRows = await db
    .select({ id: firms.id, name: firms.name, slug: firms.slug })
    .from(firms)
    .where(eq(firms.slug, FIRM_SLUG))
    .limit(1);
  const firm = firmRows[0];
  if (!firm) throw new Error(`Firm not found: ${FIRM_SLUG}`);

  const actorRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.firmId, firm.id), eq(users.email, "tp@tpfiguattorneys.com")))
    .limit(1);
  const actor =
    actorRows[0] ??
    (
      await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.firmId, firm.id), eq(users.isActive, true)))
        .limit(1)
    )[0];
  if (!actor) throw new Error("No active user found to attribute createdBy.");

  console.log(`Firm: ${firm.name} (${firm.slug})`);
  console.log(`Created by: ${actor.email}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);

  const existing = await db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      phone: clients.phone,
      email: clients.email,
      clientNumber: clients.clientNumber,
    })
    .from(clients)
    .where(and(eq(clients.firmId, firm.id), isNull(clients.archivedAt)));

  const existingNames = new Set(
    existing
      .map((c) => (c.fullName ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  const usedNumbers = new Set<string>();
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of sheetRows) {
    const name = row.client.trim();
    const key = name.toLowerCase();
    if (existingNames.has(key)) {
      console.log(`SKIP duplicate name: ${name}`);
      skipped += 1;
      continue;
    }

    const names = splitIndividualName(name);
    const phone = normalizePhone(row.phone);
    const email = row.email?.includes("@") ? row.email.trim().toLowerCase() : null;
    const dobIso = parseDob(row.dob);
    const address = row.address?.trim() || null;

    try {
      const input = parseClientInput(
        {
          clientType: "individual",
          firstName: names.firstName,
          surname: names.surname,
          otherNames: names.otherNames,
          fullName: names.fullName,
          dateOfBirth: dobIso,
          email,
          phone,
          residentialAddress: address,
          physicalAddress: address,
          kycStatus: "draft",
          kycNotes: KYC_NOTE,
          responsibleLawyerId: actor.id,
        },
        { requireKycCore: false },
      );

      const clientNumber = await nextClientNumber(db, firm.id, usedNumbers);
      console.log(
        `${dryRun ? "WOULD CREATE" : "CREATE"} ${clientNumber} ${names.fullName}` +
          `${dobIso ? ` dob=${dobIso.slice(0, 10)}` : ""}` +
          `${phone ? ` phone=${phone}` : ""}` +
          `${email ? ` email=${email}` : ""}`,
      );

      if (!dryRun) {
        await db.insert(clients).values({
          firmId: firm.id,
          clientNumber,
          clientType: input.clientType,
          firstName: input.firstName,
          surname: input.surname,
          otherNames: input.otherNames,
          maidenName: input.maidenName,
          dateOfBirth: input.dateOfBirth ?? null,
          nationality: input.nationality,
          idNumber: input.idNumber,
          fullName: input.fullName,
          legalName: input.legalName,
          registeredName: input.registeredName,
          tradingName: input.tradingName,
          nationalIdOrRegNumber: input.nationalIdOrRegNumber,
          regTaxNumber: input.regTaxNumber,
          taxNumber: input.taxNumber,
          incorporationDate: input.incorporationDate ?? null,
          incorporationCountry: input.incorporationCountry,
          email: input.email,
          phone: input.phone,
          whatsapp: input.whatsapp,
          altPhone: input.altPhone,
          residentialAddress: input.residentialAddress,
          registeredAddress: input.registeredAddress,
          businessAddress: input.businessAddress,
          physicalAddress: input.physicalAddress,
          postalAddress: input.postalAddress,
          occupation: input.occupation,
          employer: input.employer,
          industry: input.industry,
          responsibleLawyerId: actor.id,
          pepStatus: false,
          pepDetails: input.pepDetails,
          uboJson: input.uboJson ?? [],
          matterScopePurpose: input.matterScopePurpose,
          sourceOfFunds: input.sourceOfFunds,
          sourceOfFundsOther: input.sourceOfFundsOther,
          kycDocumentsJson: input.kycDocumentsJson ?? {},
          declarationSignedAt: null,
          declarationSignatory: null,
          kycStatus: "draft",
          kycNotes: KYC_NOTE,
          createdBy: actor.id,
        });
      }
      existingNames.add(key);
      created += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${name}: ${msg}`);
      console.error(`ERROR ${name}: ${msg}`);
    }
  }

  const after = await db
    .select({ n: clients.id })
    .from(clients)
    .where(and(eq(clients.firmId, firm.id), isNull(clients.archivedAt)));

  console.log(`---`);
  console.log(`${dryRun ? "Would create" : "Created"}: ${created}`);
  console.log(`Skipped duplicates: ${skipped}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Active clients now: ${after.length}`);

  await sql.end();
  if (errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
