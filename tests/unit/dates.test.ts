import { createFormatter } from "next-intl";
import { describe, expect, test } from "vitest";
import { formatDays, isIsoDate, today } from "@/lib/dates";

describe("days without a time of day", () => {
  test("only real days of the calendar are accepted", () => {
    expect(isIsoDate("2027-01-31")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    for (const value of [
      "",
      "2027-02-30",
      "2027-02-29",
      "2027-13-01",
      "27-01-31",
      "2027-1-5",
      "2027-01-31T00:00:00Z",
      "amanhã",
    ]) {
      expect(isIsoDate(value), value).toBe(false);
    }
  });

  test("today is the day it is in Lisbon, also around midnight", () => {
    // In winter Lisbon is on UTC; in summer it is an hour ahead, so its day turns at 23:00 UTC.
    expect(today(new Date("2027-01-15T23:30:00Z"))).toBe("2027-01-15");
    expect(today(new Date("2027-01-16T00:10:00Z"))).toBe("2027-01-16");
    expect(today(new Date("2027-07-15T22:30:00Z"))).toBe("2027-07-15");
    expect(today(new Date("2027-07-15T23:30:00Z"))).toBe("2027-07-16");
    expect(isIsoDate(today())).toBe(true);
  });

  test("a day, or a first and a last day, written out in the page's language", () => {
    const pt = createFormatter({ locale: "pt", timeZone: "Europe/Lisbon" });
    // A reader far to the west still gets the day that was stored, not the evening before.
    const en = createFormatter({ locale: "en", timeZone: "America/Los_Angeles" });

    expect(formatDays(pt, null, null)).toBeNull();
    expect(formatDays(pt, null, "2027-03-30")).toBeNull();
    expect(formatDays(pt, "2027-01-12", null)).toMatch(/^12 .*2027$/);
    expect(formatDays(en, "2027-01-12", null)).toBe("Jan 12, 2027");
    expect(formatDays(en, "2027-01-12", "2027-01-12")).toBe("Jan 12, 2027");
    expect(formatDays(en, "2027-01-12", "2027-03-30")).toMatch(/^Jan 12\s*–\s*Mar 30, 2027$/);
  });
});
