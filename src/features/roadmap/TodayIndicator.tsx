interface Props {
  left: number;
}

export function TodayIndicator({ left }: Props) {
  return (
    <div
      data-testid="roadmap-today"
      className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500/70 z-10"
      style={{ left }}
    >
      <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-red-500/80" />
    </div>
  );
}
