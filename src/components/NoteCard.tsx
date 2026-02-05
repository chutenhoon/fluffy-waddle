export type NoteItem = {
  id: string;
  title: string;
  content: string;
  created_at: string;
};

export default function NoteCard({
  note,
  compact = false
}: {
  note: NoteItem;
  compact?: boolean;
}) {
  return (
    <div className="glass-card p-4 space-y-2">
      <div className="text-sm font-medium text-white/90">{note.title}</div>
      <div
        className={`text-sm text-white/60 whitespace-pre-line ${
          compact ? "max-h-24 overflow-hidden" : ""
        }`}
      >
        {note.content}
      </div>
    </div>
  );
}
