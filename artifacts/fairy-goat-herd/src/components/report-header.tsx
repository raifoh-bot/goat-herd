import { GoatIcon } from "@/components/goat-icon";
import { useFarmSettings } from "@/lib/settings";
import { formatDate } from "@/lib/date";

interface ReportHeaderProps {
  /** Title shown on the right of the report header (e.g. "Lineage Report"). */
  title: string;
}

/**
 * Branded header for printed / exported reports. Hidden on screen and only
 * rendered when printing (or saving to PDF). Shows the farm logo and ADGA #
 * from Farm Settings, falling back to the default icon / omitting the ADGA
 * line when those values are unset.
 */
export function ReportHeader({ title }: ReportHeaderProps) {
  const { farmName, adgaNumber, logoUrl } = useFarmSettings();

  return (
    <div className="report-header hidden print:flex items-center gap-4 mb-6 pb-4 border-b-2 border-foreground/20">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${farmName} logo`}
          className="h-16 w-16 rounded-lg object-cover shrink-0"
        />
      ) : (
        <div className="h-16 w-16 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
          <GoatIcon className="h-9 w-9" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="font-serif text-2xl font-bold text-foreground leading-tight">{farmName}</h1>
        {adgaNumber && <p className="text-sm text-muted-foreground">ADGA #{adgaNumber}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="font-serif text-lg font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(new Date(), { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>
    </div>
  );
}
