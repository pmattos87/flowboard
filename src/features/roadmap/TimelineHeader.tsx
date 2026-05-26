import {
  PX_PER_DAY,
  dateToPx,
  daysBetween,
  formatDayLabel,
  formatMonthLabel,
  formatQuarterLabel,
  monthsBetween,
  quartersBetween,
  weeksBetween,
  type Scale,
} from "./utils/dateMath";

interface Props {
  origin: string;
  end: string;
  scale: Scale;
}

export function TimelineHeader({ origin, end, scale }: Props) {
  const px = PX_PER_DAY[scale];

  if (scale === "week") {
    const months = monthsBetween(origin, end);
    const weeks = weeksBetween(origin, end);
    return (
      <div className="flex flex-col text-xs select-none">
        <div className="relative h-6 border-b border-gray-800">
          {months.map((m, i) => {
            const left = Math.max(0, dateToPx(m, origin, scale));
            const next = months[i + 1] ?? end;
            const width = dateToPx(next, origin, scale) - left;
            return (
              <div
                key={m}
                className="absolute top-0 bottom-0 px-2 flex items-center text-gray-300 font-medium border-r border-gray-800"
                style={{ left, width }}
              >
                {formatMonthLabel(m)}
              </div>
            );
          })}
        </div>
        <div className="relative h-6">
          {weeks.map((w) => {
            const left = dateToPx(w, origin, scale);
            return (
              <div
                key={w}
                className="absolute top-0 bottom-0 flex items-center px-1 text-[10px] text-gray-500 border-r border-gray-800/70"
                style={{ left, width: px * 7 }}
              >
                {formatDayLabel(w)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (scale === "month") {
    const months = monthsBetween(origin, end);
    return (
      <div className="flex flex-col text-xs select-none">
        <div className="relative h-6 border-b border-gray-800">
          {months.map((m, i) => {
            const left = dateToPx(m, origin, scale);
            const next = months[i + 1] ?? end;
            const width = (daysBetween(m, next)) * px;
            return (
              <div
                key={m}
                className="absolute top-0 bottom-0 px-2 flex items-center text-gray-300 font-medium border-r border-gray-800"
                style={{ left, width }}
              >
                {formatMonthLabel(m)}
              </div>
            );
          })}
        </div>
        <div className="relative h-6">
          {months.map((m) => {
            const left = dateToPx(m, origin, scale);
            const next = months[months.indexOf(m) + 1] ?? end;
            const width = daysBetween(m, next) * px;
            return (
              <div
                key={m}
                className="absolute top-0 bottom-0 border-r border-gray-800/70"
                style={{ left, width }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // quarter
  const quarters = quartersBetween(origin, end);
  const months = monthsBetween(origin, end);
  return (
    <div className="flex flex-col text-xs select-none">
      <div className="relative h-6 border-b border-gray-800">
        {quarters.map((q, i) => {
          const left = dateToPx(q, origin, scale);
          const next = quarters[i + 1] ?? end;
          const width = daysBetween(q, next) * px;
          return (
            <div
              key={q}
              className="absolute top-0 bottom-0 px-2 flex items-center text-gray-300 font-medium border-r border-gray-800"
              style={{ left, width }}
            >
              {formatQuarterLabel(q)}
            </div>
          );
        })}
      </div>
      <div className="relative h-6">
        {months.map((m) => {
          const left = dateToPx(m, origin, scale);
          return (
            <div
              key={m}
              className="absolute top-0 bottom-0 border-r border-gray-800/60"
              style={{ left }}
            />
          );
        })}
      </div>
    </div>
  );
}
