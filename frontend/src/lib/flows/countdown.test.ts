import { describe, expect, it } from "vitest";
import { msUntilNextTick, remainingUntil } from "./countdown";

const NOW = Date.parse("2026-10-06T12:00:00Z");

describe("remainingUntil", () => {
  it("splits the time left into hours and minutes, rounding minutes up", () => {
    expect(remainingUntil("2026-10-07T11:12:00Z", NOW)).toEqual({
      expired: false,
      ms: (23 * 60 + 12) * 60_000,
      hours: 23,
      minutes: 12,
    });
    // 23h 11m 01s left -> still shows 23h 12m (never 0m while the link works).
    expect(remainingUntil("2026-10-07T11:11:01Z", NOW)).toMatchObject({ hours: 23, minutes: 12 });
    expect(remainingUntil("2026-10-06T12:00:30Z", NOW)).toMatchObject({ hours: 0, minutes: 1 });
    expect(remainingUntil("2026-10-06T13:00:00Z", NOW)).toMatchObject({ hours: 1, minutes: 0 });
  });

  it("accepts offsets and Date objects", () => {
    expect(remainingUntil("2026-10-06T15:30:00+03:00", NOW)).toMatchObject({
      hours: 0,
      minutes: 30,
    });
    expect(remainingUntil(new Date(NOW + 90 * 60_000), NOW)).toMatchObject({
      hours: 1,
      minutes: 30,
    });
  });

  it("reports expiry and ignores missing or invalid values", () => {
    expect(remainingUntil("2026-10-06T12:00:00Z", NOW)).toEqual({
      expired: true,
      ms: 0,
      hours: 0,
      minutes: 0,
    });
    expect(remainingUntil("2026-10-05T12:00:00Z", NOW)?.expired).toBe(true);
    expect(remainingUntil(null, NOW)).toBeNull();
    expect(remainingUntil("not a date", NOW)).toBeNull();
  });
});

describe("msUntilNextTick", () => {
  it("waits until the displayed minute changes", () => {
    const r = remainingUntil(new Date(NOW + 2 * 60_000 + 5_000), NOW)!;
    expect(r.minutes).toBe(3);
    expect(msUntilNextTick(r)).toBe(5_000);
    expect(msUntilNextTick(remainingUntil(new Date(NOW + 120_000), NOW)!)).toBe(60_000);
    expect(msUntilNextTick(remainingUntil(new Date(NOW + 120_200), NOW)!)).toBe(1_000);
    expect(msUntilNextTick(remainingUntil(new Date(NOW - 1), NOW)!)).toBe(0);
  });
});
