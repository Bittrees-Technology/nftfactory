import type { StatusItem } from "../lib/statusItems";

export default function StatusStack({
  items,
  className = ""
}: {
  items: StatusItem[];
  className?: string;
}) {
  const visible = items.filter((item) => String(item.message || "").trim().length > 0);
  if (visible.length === 0) return null;

  return (
    <div className={className}>
      {visible.map((item, index) => (
        <p key={item.key || `${item.tone}:${index}`} className={item.tone}>
          {item.message}
        </p>
      ))}
    </div>
  );
}
