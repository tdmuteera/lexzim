import "server-only";

import { and, asc, eq, exists, isNotNull, isNull, sql } from "drizzle-orm";
import { clientDisplayLabel, clientDisplayName } from "@/lib/clients/display";
import { zwHolidayDatesForYear } from "@/lib/crm/zw-holidays";
import { getDb } from "@/lib/db";
import { clients, firmHolidays, matters, users } from "@/lib/db/schema";

export type BirthdayRow = {
  clientId: string;
  clientNumber: string;
  displayName: string;
  displayLabel: string;
  dateOfBirth: string;
  dayOfMonth: number;
  month: number;
  ageTurning: number | null;
  responsibleLawyers: string[];
};

export type CrmBirthdayReport = {
  month: number;
  monthLabel: string;
  year: number;
  rows: BirthdayRow[];
};

export type FirmHolidayRow = {
  id: string;
  holidayDate: string;
  name: string;
  country: string;
};

function monthLabel(month: number): string {
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleString(undefined, { month: "long" });
}

function ageTurningOnBirthday(dob: Date, refYear: number, refMonth: number): number | null {
  const birthYear = dob.getUTCFullYear();
  if (birthYear < 1900) return null;
  let age = refYear - birthYear;
  const birthMonth = dob.getUTCMonth() + 1;
  const birthDay = dob.getUTCDate();
  const nowDay = new Date().getUTCDate();
  const nowMonth = new Date().getUTCMonth() + 1;
  if (
    refMonth === nowMonth &&
    (birthMonth > nowMonth || (birthMonth === nowMonth && birthDay > nowDay))
  ) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

async function loadBirthdayRows(
  firmId: string,
  month: number,
  opts?: { responsibleLawyerId?: string },
): Promise<BirthdayRow[]> {
  const db = getDb();
  const lawyerFilter = opts?.responsibleLawyerId
    ? exists(
        db
          .select({ id: matters.id })
          .from(matters)
          .where(
            and(
              eq(matters.firmId, firmId),
              eq(matters.clientId, clients.id),
              eq(matters.responsibleLawyerId, opts.responsibleLawyerId),
            ),
          ),
      )
    : undefined;

  const rows = await db
    .select({ client: clients })
    .from(clients)
    .where(
      and(
        eq(clients.firmId, firmId),
        isNull(clients.archivedAt),
        isNotNull(clients.dateOfBirth),
        sql`extract(month from ${clients.dateOfBirth}) = ${month}`,
        lawyerFilter,
      ),
    )
    .orderBy(sql`extract(day from ${clients.dateOfBirth})`, asc(clients.clientNumber));

  const refYear = new Date().getFullYear();
  const results: BirthdayRow[] = [];

  for (const row of rows) {
    const c = row.client;
    const dob = c.dateOfBirth!;
    const matterLawyers = await db
      .select({ fullName: users.fullName, email: users.email })
      .from(matters)
      .innerJoin(users, eq(users.id, matters.responsibleLawyerId))
      .where(and(eq(matters.firmId, firmId), eq(matters.clientId, c.id)));

    const names = [
      ...new Set(
        matterLawyers.map((l) => l.fullName?.trim() || l.email || "Unknown").filter(Boolean),
      ),
    ];

    results.push({
      clientId: c.id,
      clientNumber: c.clientNumber,
      displayName: clientDisplayName(c),
      displayLabel: clientDisplayLabel(c),
      dateOfBirth: dob.toISOString(),
      dayOfMonth: dob.getUTCDate(),
      month,
      ageTurning: c.clientType === "individual" ? ageTurningOnBirthday(dob, refYear, month) : null,
      responsibleLawyers: names,
    });
  }

  return results;
}

export async function buildBirthdayReport(
  firmId: string,
  month: number,
  opts?: { responsibleLawyerId?: string },
): Promise<CrmBirthdayReport> {
  const year = new Date().getFullYear();
  const rows = await loadBirthdayRows(firmId, month, opts);
  return { month, monthLabel: monthLabel(month), year, rows };
}

export async function buildCrmOverview(
  firmId: string,
  opts?: { responsibleLawyerId?: string },
) {
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const nextMonth = thisMonth === 12 ? 1 : thisMonth + 1;

  const [thisMonthRows, nextMonthRows, holidaysThisMonth] = await Promise.all([
    loadBirthdayRows(firmId, thisMonth, opts),
    loadBirthdayRows(firmId, nextMonth, opts),
    listHolidaysForMonth(firmId, now.getFullYear(), thisMonth),
  ]);

  return {
    thisMonth: {
      month: thisMonth,
      monthLabel: monthLabel(thisMonth),
      count: thisMonthRows.length,
      rows: thisMonthRows,
    },
    nextMonth: {
      month: nextMonth,
      monthLabel: monthLabel(nextMonth),
      count: nextMonthRows.length,
      rows: nextMonthRows,
    },
    holidaysThisMonth,
  };
}

export async function ensureFirmHolidaysSeeded(firmId: string, userId?: string) {
  const db = getDb();
  const existing = await db
    .select({ id: firmHolidays.id })
    .from(firmHolidays)
    .where(eq(firmHolidays.firmId, firmId))
    .limit(1);
  if (existing[0]) return;

  const year = new Date().getFullYear();
  const seeds = [...zwHolidayDatesForYear(year), ...zwHolidayDatesForYear(year + 1)];

  await db.insert(firmHolidays).values(
    seeds.map((s) => ({
      firmId,
      holidayDate: s.date,
      name: s.name,
      country: "ZW",
      createdBy: userId ?? null,
      updatedAt: new Date(),
    })),
  );
}

export async function listHolidaysForMonth(
  firmId: string,
  year: number,
  month: number,
): Promise<FirmHolidayRow[]> {
  await ensureFirmHolidaysSeeded(firmId);
  const db = getDb();
  const rows = await db
    .select()
    .from(firmHolidays)
    .where(
      and(
        eq(firmHolidays.firmId, firmId),
        sql`extract(year from ${firmHolidays.holidayDate}) = ${year}`,
        sql`extract(month from ${firmHolidays.holidayDate}) = ${month}`,
      ),
    )
    .orderBy(asc(firmHolidays.holidayDate));

  return rows.map((r) => ({
    id: r.id,
    holidayDate: r.holidayDate.toISOString(),
    name: r.name,
    country: r.country,
  }));
}

export async function listFirmHolidays(firmId: string, year?: number) {
  await ensureFirmHolidaysSeeded(firmId);
  const db = getDb();
  const conditions = [eq(firmHolidays.firmId, firmId)];
  if (year) {
    conditions.push(sql`extract(year from ${firmHolidays.holidayDate}) = ${year}`);
  }
  return db
    .select()
    .from(firmHolidays)
    .where(and(...conditions))
    .orderBy(asc(firmHolidays.holidayDate));
}

export async function createFirmHoliday(
  firmId: string,
  userId: string,
  input: { holidayDate: Date; name: string; country?: string },
) {
  const db = getDb();
  const rows = await db
    .insert(firmHolidays)
    .values({
      firmId,
      holidayDate: input.holidayDate,
      name: input.name.trim(),
      country: input.country?.trim() || "ZW",
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function deleteFirmHoliday(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .delete(firmHolidays)
    .where(and(eq(firmHolidays.firmId, firmId), eq(firmHolidays.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function listLawyersForCrmFilter(firmId: string) {
  const db = getDb();
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
    })
    .from(users)
    .where(and(eq(users.firmId, firmId), eq(users.isActive, true)))
    .orderBy(asc(users.fullName));
}
