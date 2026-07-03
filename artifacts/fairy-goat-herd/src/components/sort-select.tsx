import { ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Shared sort dropdown used across list pages (Breedings, AI Inventory, Users)
 * so the sort control looks and behaves consistently everywhere.
 */
export function SortSelect<T extends string>({
  value,
  onChange,
  options,
  className,
  triggerClassName,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SortOption<T>[];
  className?: string;
  triggerClassName?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <ArrowUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground hidden sm:inline">Sort by</span>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className={`w-[220px] bg-background/50 border-input ${triggerClassName ?? ""}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
