import type { Project } from "@/types";
import { cn } from "@/lib/utils";

type BadgeProject = Pick<Project, "name" | "color" | "logo_data">;

/**
 * Small project identity square. Renders the project's logo when `logo_data`
 * is set, otherwise a colored square. Size and extra styling are passed via
 * `className` (default `h-5 w-5`).
 */
export function ProjectBadge({
  project,
  className,
}: {
  project: BadgeProject;
  className?: string;
}) {
  const base = "rounded-sm shrink-0";

  if (project.logo_data) {
    return (
      <img
        src={project.logo_data}
        alt={project.name}
        className={cn(base, "object-cover", className ?? "h-5 w-5")}
      />
    );
  }

  return (
    <span
      className={cn(base, className ?? "h-5 w-5")}
      style={{ backgroundColor: project.color || "#6366f1" }}
    />
  );
}
