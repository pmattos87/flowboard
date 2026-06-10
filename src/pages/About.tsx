const TECH = [
  { name: "Tauri v2", url: "https://tauri.app" },
  { name: "React 18", url: "https://react.dev" },
  { name: "SQLite", url: "https://sqlite.org" },
  { name: "Recharts", url: "https://recharts.org" },
  { name: "shadcn/ui", url: "https://ui.shadcn.com" },
  { name: "Tailwind CSS", url: "https://tailwindcss.com" },
];

export default function About() {
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-white mb-6">About</h1>

      <div className="bg-gray-800 rounded-lg p-6 flex flex-col gap-6">
        <div className="flex flex-col items-start">
          {/* logo.png has baked-in transparent padding (~12px left, ~47px
              bottom at this size); negative margins pull the mark flush-left
              with the text below and tighten the gap. */}
          <img
            src="/logo.png"
            alt="FlowBoard logo"
            className="h-48 w-auto object-contain -ml-[12px] -mb-[40px]"
          />
          <p className="text-sm text-gray-400">Version 1.2.0</p>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed">
          A local-first, single-user project management app inspired by Jira.
          All data lives on your machine — no accounts, no cloud, no tracking.
        </p>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Built with
          </p>
          <div className="flex flex-wrap gap-2">
            {TECH.map((t) => (
              <span
                key={t.name}
                className="px-2.5 py-1 rounded-md bg-gray-700 text-xs text-gray-300"
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          Released under the{" "}
          <span className="text-gray-400">MIT Licence</span>. Free to use,
          modify, and distribute with attribution.
        </p>
      </div>
    </div>
  );
}
