import { Link } from "react-router-dom";
import type { WebMemory } from "../data/webMemories";

const THEMES = [
  {
    card: "from-rose-500/25 via-pink-500/10 to-purple-500/20",
    dot: "bg-rose-400/70"
  },
  {
    card: "from-sky-500/20 via-cyan-500/10 to-indigo-500/20",
    dot: "bg-sky-400/70"
  },
  {
    card: "from-amber-500/20 via-orange-500/10 to-rose-500/20",
    dot: "bg-amber-400/70"
  },
  {
    card: "from-emerald-500/20 via-teal-500/10 to-cyan-500/20",
    dot: "bg-emerald-400/70"
  }
];

export default function WebCard({
  memory,
  index
}: {
  memory: WebMemory;
  index: number;
}) {
  const theme = THEMES[index % THEMES.length];

  return (
    <Link
      to={`/web/${memory.slug}`}
      className="block glass-card overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className={`p-4 bg-gradient-to-br ${theme.card}`}>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-white/50">
          <span className={`h-2 w-2 rounded-full ${theme.dot}`} />
          Web Memory
        </div>
        <div className="mt-3 text-base font-medium text-white/90">
          {memory.title}
        </div>
        {memory.subtitle ? (
          <div className="mt-1 text-sm text-white/60">
            {memory.subtitle}
          </div>
        ) : null}
      </div>
      <div className="px-4 pb-4 text-xs text-white/50">
        Nhấn để mở
      </div>
    </Link>
  );
}
