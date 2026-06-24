import { useRef, useState } from "react";
import Papa from "papaparse";
import { Upload, FileSpreadsheet, Download, AlertCircle, X } from "lucide-react";
import { useImportSemenStraws } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const TEMPLATE_COLUMNS = [
  "sireName",
  "count",
  "strawId",
  "supplier",
  "tankLocation",
  "notes",
  "sireDamName",
  "sireSireName",
  "sirePatGranddamName",
  "sirePatGrandsireName",
] as const;

const TEMPLATE_SAMPLE: Record<(typeof TEMPLATE_COLUMNS)[number], string> = {
  sireName: "GCH Example Buck",
  count: "10",
  strawId: "LOT-2024-01",
  supplier: "Sample Stud",
  tankLocation: "Canister 1 / Cane A",
  notes: "Collected spring 2024",
  sireDamName: "Example Dam",
  sireSireName: "Example Grandsire",
  sirePatGranddamName: "Example Pat. Granddam",
  sirePatGrandsireName: "Example Pat. Grandsire",
};

const HEADER_ALIASES: Record<string, (typeof TEMPLATE_COLUMNS)[number]> = {
  sirename: "sireName",
  sire: "sireName",
  "sire name": "sireName",
  buck: "sireName",
  name: "sireName",
  count: "count",
  straws: "count",
  quantity: "count",
  qty: "count",
  strawid: "strawId",
  "straw id": "strawId",
  "batch id": "strawId",
  lot: "strawId",
  supplier: "supplier",
  stud: "supplier",
  tanklocation: "tankLocation",
  "tank location": "tankLocation",
  location: "tankLocation",
  notes: "notes",
  note: "notes",
  siredamname: "sireDamName",
  "sire dam": "sireDamName",
  "sire's dam": "sireDamName",
  siresirename: "sireSireName",
  "sire sire": "sireSireName",
  "sire's sire": "sireSireName",
  sirepatgranddamname: "sirePatGranddamName",
  "paternal granddam": "sirePatGranddamName",
  sirepatgrandsirename: "sirePatGrandsireName",
  "paternal grandsire": "sirePatGrandsireName",
};

type ParsedRow = {
  sireName?: string;
  count?: number;
  strawId?: string;
  supplier?: string;
  tankLocation?: string;
  notes?: string;
  sireDamName?: string;
  sireSireName?: string;
  sirePatGranddamName?: string;
  sirePatGrandsireName?: string;
};

type PreviewRow = {
  data: ParsedRow;
  errors: string[];
};

function normalizeHeader(raw: string): (typeof TEMPLATE_COLUMNS)[number] | null {
  const trimmed = raw.trim();
  const exact = TEMPLATE_COLUMNS.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  return HEADER_ALIASES[trimmed.toLowerCase()] ?? null;
}

function buildPreview(raw: Record<string, string>[]): PreviewRow[] {
  return raw.map((rawRow) => {
    const data: ParsedRow = {};
    for (const [header, value] of Object.entries(rawRow)) {
      const field = normalizeHeader(header);
      if (!field) continue;
      const v = (value ?? "").trim();
      if (!v) continue;
      if (field === "count") {
        const n = Number(v);
        data.count = Number.isFinite(n) ? n : NaN;
      } else {
        data[field] = v;
      }
    }

    const errors: string[] = [];
    if (!data.sireName) errors.push("Sire name is required");
    if (data.count === undefined || Number.isNaN(data.count)) {
      errors.push("Count must be a number");
    } else if (!Number.isInteger(data.count) || data.count < 0) {
      errors.push("Count must be a whole number ≥ 0");
    }

    return { data, errors };
  });
}

function downloadTemplate() {
  const csv = Papa.unparse({
    fields: [...TEMPLATE_COLUMNS],
    data: [TEMPLATE_COLUMNS.map((c) => TEMPLATE_SAMPLE[c])],
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ai-inventory-template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

export function ImportStrawsDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  const importStraws = useImportSemenStraws();

  const reset = () => {
    setFileName("");
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = buildPreview(results.data);
        if (rows.length === 0) {
          toast({
            title: "No rows found",
            description: "The file appears to be empty.",
            variant: "destructive",
          });
          reset();
          return;
        }
        setPreview(rows);
      },
      error: () => {
        toast({ title: "Could not read file", variant: "destructive" });
        reset();
      },
    });
  };

  const validRows = preview?.filter((r) => r.errors.length === 0) ?? [];
  const errorRows = preview?.filter((r) => r.errors.length > 0) ?? [];

  const handleImport = () => {
    if (validRows.length === 0) return;
    importStraws.mutate(
      {
        data: {
          straws: validRows.map((r) => ({
            sireName: r.data.sireName!,
            count: r.data.count!,
            strawId: r.data.strawId,
            supplier: r.data.supplier,
            tankLocation: r.data.tankLocation,
            notes: r.data.notes,
            sireDamName: r.data.sireDamName,
            sireSireName: r.data.sireSireName,
            sirePatGranddamName: r.data.sirePatGranddamName,
            sirePatGrandsireName: r.data.sirePatGrandsireName,
          })),
        },
      },
      {
        onSuccess: (res) => {
          toast({
            title: `${res.imported} ${res.imported === 1 ? "entry" : "entries"} imported`,
            description:
              res.skipped > 0
                ? `${res.skipped} row${res.skipped !== 1 ? "s" : ""} skipped.`
                : undefined,
            variant: res.imported === 0 ? "destructive" : undefined,
          });
          onImported();
          handleClose(false);
        },
        onError: () => toast({ title: "Import failed", variant: "destructive" }),
      }
    );
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Straws from CSV</DialogTitle>
          <DialogDescription>
            Bulk-load AI straw records from a spreadsheet. Download the template, fill it
            in, and upload it here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" /> Download Template
            </Button>
            <span className="text-xs text-muted-foreground">
              Required columns: <span className="font-medium text-foreground">sireName</span> and{" "}
              <span className="font-medium text-foreground">count</span>.
            </span>
          </div>

          {!preview ? (
            <div
              className="border-2 border-dashed border-primary/30 rounded-xl bg-card/50 cursor-pointer hover:border-primary/60 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f && f.name.toLowerCase().endsWith(".csv")) handleFile(f);
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-primary/60" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">Drop your CSV here</p>
                  <p className="text-xs text-muted-foreground">or click to browse — .csv only</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground min-w-0">
                  <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{fileName}</span>
                </div>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={reset}>
                  <X className="h-3.5 w-3.5 mr-1" /> Change file
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 font-medium">
                  {validRows.length} ready
                </span>
                {errorRows.length > 0 && (
                  <span className="rounded-full bg-destructive/10 text-destructive px-2.5 py-1 font-medium">
                    {errorRows.length} with errors (will be skipped)
                  </span>
                )}
              </div>

              <div className="max-h-72 overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="bg-muted/80 border-b border-border">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Sire</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Count</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Straw ID</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Supplier</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.map((row, i) => (
                      <tr
                        key={i}
                        className={row.errors.length > 0 ? "bg-destructive/5" : "bg-card"}
                      >
                        <td className="px-3 py-2 font-medium text-foreground">
                          {row.data.sireName ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.data.count === undefined || Number.isNaN(row.data.count)
                            ? "—"
                            : row.data.count}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.data.strawId ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.data.supplier ?? "—"}</td>
                        <td className="px-3 py-2">
                          {row.errors.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              {row.errors.join("; ")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {errorRows.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Rows with errors are skipped automatically — only the {validRows.length} valid
                    row{validRows.length !== 1 ? "s" : ""} will be imported.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!preview || validRows.length === 0 || importStraws.isPending}
          >
            {importStraws.isPending
              ? "Importing..."
              : `Import ${validRows.length} ${validRows.length === 1 ? "Entry" : "Entries"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
