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
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="FlowBoard logo" className="h-14 w-14" />
          <div>
            <p className="text-lg font-semibold text-white">FlowBoard</p>
            <p className="text-sm text-gray-400">Version 0.9.0</p>
          </div>
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

        <p className="text-xs text-gray-600">
          © {new Date().getFullYear()} Pedro. All rights reserved.
        </p>
      </div>
    </div>
  );
}
