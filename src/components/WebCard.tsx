import { Link } from "react-router-dom";
import type { WebMemory } from "../data/webMemories";

export default function WebCard({
  memory
}: {
  memory: WebMemory;
}) {
  return (
    <Link
      to={`/web/${memory.slug}`}
      className="block glass-card overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="p-4 bg-white/5 border-b border-white/10">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
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
      <div className="px-4 py-3 text-xs text-white/50">
        Nhấn để mở
      </div>
    </Link>
  );
}
