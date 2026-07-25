import { Anchor } from "lucide-react";

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Anchor size={17} strokeWidth={2.4} />
      </span>
      <span>Supabase Harbor</span>
    </div>
  );
}
