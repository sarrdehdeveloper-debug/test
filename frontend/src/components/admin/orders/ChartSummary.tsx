import { AnimalIcon } from "@/components/zodiac/AnimalIcon";
import { SignIcon } from "@/components/zodiac/SignIcon";
import { humanize } from "@/lib/admin/format";
import type { AdminChartSummary } from "@/lib/admin/types";
import { DetailList } from "./DetailList";
import { CHINESE_ANIMALS, WESTERN_SIGNS, type ChineseAnimal, type WesternSign } from "@/lib/types";

const YEAR_BOUNDARY: Record<string, string> = {
  lichun: "Lichun (Start of Spring)",
  lunar_new_year: "Chinese New Year",
};
const DAY_BOUNDARY: Record<string, string> = {
  midnight: "Midnight",
  zi_23: "Rat hour (23:00)",
};

function isSign(value: string | null): value is WesternSign {
  return !!value && (WESTERN_SIGNS as readonly string[]).includes(value);
}
function isAnimal(value: string | null): value is ChineseAnimal {
  return !!value && (CHINESE_ANIMALS as readonly string[]).includes(value);
}

function Placement({
  label,
  value,
  kind,
}: {
  label: string;
  value: string | null;
  kind: "sign" | "animal";
}) {
  return (
    <li className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-stone-200/80 bg-ivory/50 px-1.5 py-2.5 text-center">
      {kind === "sign" && isSign(value) ? (
        <SignIcon sign={value} size="sm" />
      ) : kind === "animal" && isAnimal(value) ? (
        <AnimalIcon animal={value} size="sm" />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full bg-stone-100 text-stone-400"
        >
          ?
        </span>
      )}
      <span className="min-w-0 max-w-full">
        <span className="block text-[0.65rem] font-semibold tracking-wider text-ink-soft uppercase">
          {label}
        </span>
        <span className="block truncate text-[0.8125rem] font-medium text-ink">
          {value ? humanize(value) : "—"}
        </span>
      </span>
    </li>
  );
}

/** Western + Chinese placements of an order and the calculation conventions it used. */
export function ChartSummary({ chart }: { chart: AdminChartSummary }) {
  const { signs } = chart;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold text-ink-soft">Western</h3>
        <ul className="grid grid-cols-3 gap-2">
          <Placement label="Sun" value={signs.sun} kind="sign" />
          <Placement label="Moon" value={signs.moon} kind="sign" />
          <Placement label="Ascendant" value={signs.ascendant} kind="sign" />
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold text-ink-soft">Chinese</h3>
        <ul className="grid grid-cols-3 gap-2">
          <Placement label="Year" value={signs.year_animal} kind="animal" />
          <Placement label="Month" value={signs.month_animal} kind="animal" />
          <Placement label="Day" value={signs.day_animal} kind="animal" />
        </ul>
      </div>
      <DetailList
        className="border-t border-stone-100 pt-3"
        items={[
          {
            label: "Year begins at",
            value: chart.year_boundary
              ? (YEAR_BOUNDARY[chart.year_boundary] ?? chart.year_boundary)
              : null,
          },
          {
            label: "Day begins at",
            value: chart.day_boundary
              ? (DAY_BOUNDARY[chart.day_boundary] ?? chart.day_boundary)
              : null,
          },
          { label: "Calculation", value: chart.calc_version, mono: true },
        ]}
      />
      {chart.warnings.length ? (
        <ul className="space-y-1.5 rounded-lg border border-warning/25 bg-warning-soft/60 px-3 py-2 text-[0.8125rem] text-warning">
          {chart.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
