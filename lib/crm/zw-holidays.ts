/** Zimbabwe public holidays seed (v1 static list for CRM). */

export type HolidaySeed = { month: number; day: number; name: string };

/** Fixed-date public holidays observed in Zimbabwe. */
export const ZW_FIXED_HOLIDAYS: HolidaySeed[] = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 4, day: 18, name: "Independence Day" },
  { month: 5, day: 1, name: "Workers' Day" },
  { month: 5, day: 25, name: "Africa Day" },
  { month: 8, day: 11, name: "Heroes' Day" },
  { month: 8, day: 12, name: "Defence Forces Day" },
  { month: 12, day: 22, name: "Unity Day" },
  { month: 12, day: 25, name: "Christmas Day" },
  { month: 12, day: 26, name: "Boxing Day" },
];

export function zwHolidayDatesForYear(year: number): Array<{ date: Date; name: string }> {
  return ZW_FIXED_HOLIDAYS.map((h) => ({
    date: new Date(Date.UTC(year, h.month - 1, h.day, 12, 0, 0)),
    name: h.name,
  }));
}
