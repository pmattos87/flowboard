import type { Person } from "@/types";
import { cn } from "@/lib/utils";

/** Up to two uppercase initials from a name ("Alice Bob" -> "AB", "Alice" -> "A"). */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type AvatarPerson = Pick<Person, "name" | "avatar_color" | "avatar_data">;

/**
 * Profile avatar. Renders the person's photo when `avatar_data` is set,
 * otherwise a colored circle with their initials. Size, text size and any
 * extra styling (e.g. ring) are passed via `className`.
 */
export function Avatar({
  person,
  className,
  title,
}: {
  person: AvatarPerson;
  className?: string;
  title?: string;
}) {
  const label = title ?? person.name;
  const base = "rounded-full flex items-center justify-center font-semibold text-white shrink-0";

  if (person.avatar_data) {
    return (
      <img
        src={person.avatar_data}
        alt={person.name}
        title={label}
        className={cn(base, "object-cover", className)}
      />
    );
  }

  return (
    <div
      title={label}
      className={cn(base, className)}
      style={{ backgroundColor: person.avatar_color || "#6366f1" }}
    >
      {initials(person.name)}
    </div>
  );
}
