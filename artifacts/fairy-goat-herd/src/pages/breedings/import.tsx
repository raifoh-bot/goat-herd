import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronRight, X, Heart, Baby } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useImportBreedings,
  useImportKids,
  getListBreedingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type Mode = "breedings" | "kids";
type Step = "upload" | "map" | "preview" | "done";

const BREEDING_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "doeName", label: "Doe / Dam Name", required: true },
  { key: "sireName", label: "Sire / Buck Name" },
  { key: "breedingDate", label: "Breeding Date", required: true },
  { key: "expectedKiddingDate", label: "Expected Kidding Date" },
  { key: "breedingMethod", label: "Method (natural/AI)" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
];

const KID_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "doeName", label: "Doe / Dam Name", required: true },
  { key: "breedingDate", label: "Breeding Date", required: true },
  { key: "name", label: "Kid Name" },
  { key: "sex", label: "Sex (doe/buck)", required: true },
  { key: "kidStatus", label: "Status (alive/dead/DOA/sold)" },
  { key: "birthDate", label: "Birth Date" },
  { key: "birthWeight", label: "Birth Weight" },
  { key: "notes", label: "Notes" },
];

const BREEDING_AUTO_MAP: Record<string, string> = {
  "doe": "doeName", "dam": "doeName", "doe name": "doeName", "dam name": "doeName", "mother": "doeName", "female": "doeName",
  "sire": "sireName", "buck": "sireName", "sire name": "sireName", "buck name": "sireName", "father": "sireName",
  "bred": "breedingDate", "breeding date": "breedingDate", "breed date": "breedingDate", "date bred": "breedingDate", "service date": "breedingDate", "cover date": "breedingDate", "mating date": "breedingDate",
  "due": "expectedKiddingDate", "due date": "expectedKiddingDate", "kidding date": "expectedKiddingDate", "expected kidding": "expectedKiddingDate", "expected kidding date": "expectedKiddingDate", "expected due": "expectedKiddingDate",
  "method": "breedingMethod", "breeding method": "breedingMethod", "ai": "breedingMethod",
  "status": "status",
  "notes": "notes", "note": "notes", "comments": "notes", "remarks": "notes",
};

const KID_AUTO_MAP: Record<string, string> = {
  "doe": "doeName", "dam": "doeName", "doe name": "doeName", "dam name": "doeName", "mother": "doeName",
  "bred": "breedingDate", "breeding date": "breedingDate", "breed date": "breedingDate", "date bred": "breedingDate", "service date": "breedingDate", "cover date": "breedingDate",
  "kid": "name", "kid name": "name", "name": "name",
  "sex": "sex", "gender": "sex",
  "status": "kidStatus", "kid status": "kidStatus", "outcome": "kidStatus", "result": "kidStatus",
  "birth date": "birthDate", "born": "birthDate", "kidding date": "birthDate", "dob": "birthDate", "date of birth": "birthDate",
  "weight": "birthWeight", "birth weight": "birthWeight", "wt": "birthWeight",
  "notes": "notes", "note": "notes", "comments": "notes", "remarks": "notes",
};

function excelDateToISO(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const d = new Date(Date.UTC(date.y, date.m - 1, date.d));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

function normalizeMethod(value: unknown): "natural" | "ai" | undefined {
  if (!value) return undefined;
  const v = String(value).toLowerCase().trim();
  if (v === "ai" || v === "a.i." || v === "artificial" || v.includes("insemin")) return "ai";
  if (v === "natural" || v === "live" || v === "buck" || v === "pen") return "natural";
  return undefined;
}

function normalizeBreedingStatus(value: unknown): "bred" | "confirmed-pregnant" | "kidded" | "open" | undefined {
  if (!value) return undefined;
  const v = String(value).toLowerCase().trim();
  if (v === "bred" || v === "serviced" || v === "exposed") return "bred";
  if (v.includes("pregnant") || v === "confirmed" || v === "preg") return "confirmed-pregnant";
  if (v === "kidded" || v === "kid" || v === "delivered" || v === "freshened") return "kidded";
  if (v === "open" || v === "empty" || v === "failed") return "open";
  return undefined;
}

function normalizeKidSex(value: unknown): "doe" | "buck" | undefined {
  if (!value) return undefined;
  const v = String(value).toLowerCase().trim();
  if (v === "f" || v === "female" || v === "doe" || v === "doeling") return "doe";
  if (v === "m" || v === "male" || v === "buck" || v === "buckling") return "buck";
  return undefined;
}

function normalizeKidStatus(value: unknown): "alive" | "dead" | "doa" | "sold" | undefined {
  if (!value) return undefined;
  const v = String(value).toLowerCase().trim();
  if (v === "alive" || v === "live" || v === "living" || v === "ok") return "alive";
  if (v === "doa" || v === "stillborn" || v === "dead on arrival") return "doa";
  if (v === "dead" || v === "died" || v === "deceased") return "dead";
  if (v === "sold") return "sold";
  return undefined;
}

function applyBreedingMapping(row: Record<string, unknown>, colMapping: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [col, field] of Object.entries(colMapping)) {
    if (!field || field === "_ignore") continue;
    const val = row[col];
    if (val === null || val === undefined || val === "") continue;
    if (field === "breedingDate" || field === "expectedKiddingDate") {
      result[field] = excelDateToISO(val);
    } else if (field === "breedingMethod") {
      const m = normalizeMethod(val);
      if (m) result[field] = m;
    } else if (field === "status") {
      const s = normalizeBreedingStatus(val);
      if (s) result[field] = s;
    } else {
      result[field] = String(val).trim() || undefined;
    }
  }
  return result;
}

function applyKidMapping(row: Record<string, unknown>, colMapping: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [col, field] of Object.entries(colMapping)) {
    if (!field || field === "_ignore") continue;
    const val = row[col];
    if (val === null || val === undefined || val === "") continue;
    if (field === "breedingDate" || field === "birthDate") {
      result[field] = excelDateToISO(val);
    } else if (field === "sex") {
      const s = normalizeKidSex(val);
      if (s) result[field] = s;
    } else if (field === "kidStatus") {
      const s = normalizeKidStatus(val);
      if (s) result[field] = s;
    } else if (field === "birthWeight") {
      const n = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.]/g, ""));
      if (!isNaN(n)) result[field] = n;
    } else {
      result[field] = String(val).trim() || undefined;
    }
  }
  return result;
}

export default function ImportBreedings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("breedings");
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [colMapping, setColMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  const importBreedings = useImportBreedings();
  const importKids = useImportKids();

  const fields = mode === "breedings" ? BREEDING_FIELDS : KID_FIELDS;
  const autoMapTable = mode === "breedings" ? BREEDING_AUTO_MAP : KID_AUTO_MAP;
  const applyMapping = mode === "breedings" ? applyBreedingMapping : applyKidMapping;

  const loadSheet = useCallback((wb: XLSX.WorkBook, sheetName: string, autoMap: Record<string, string>) => {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1, defval: null });
    if (raw.length === 0) return;
    const headerRow = (raw[0] as unknown as unknown[]).map((h) => (h !== null && h !== undefined ? String(h) : "")).filter(Boolean);
    const dataRows = (raw.slice(1) as unknown as unknown[][])
      .filter((r) => r.some((c) => c !== null && c !== undefined && c !== ""))
      .map((r) => {
        const obj: Record<string, unknown> = {};
        headerRow.forEach((h, i) => { obj[h] = (r as unknown[])[i] ?? null; });
        return obj;
      });

    setHeaders(headerRow);
    setRows(dataRows);

    const mapping: Record<string, string> = {};
    for (const h of headerRow) {
      const key = autoMap[h.toLowerCase().trim()];
      if (key) mapping[h] = key;
    }
    setColMapping(mapping);
  }, []);

  const handleFile = useCallback((file: File, autoMap: Record<string, string>) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      setWorkbook(wb);
      const firstSheet = wb.SheetNames[0];
      setSelectedSheet(firstSheet);
      loadSheet(wb, firstSheet, autoMap);
      setStep("map");
    };
    reader.readAsArrayBuffer(file);
  }, [loadSheet]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
      handleFile(file, autoMapTable);
    }
  }, [handleFile, autoMapTable]);

  const handleSheetChange = (name: string) => {
    setSelectedSheet(name);
    if (workbook) loadSheet(workbook, name, autoMapTable);
  };

  const resetUpload = () => {
    setStep("upload");
    setWorkbook(null);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setColMapping({});
    setResult(null);
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    resetUpload();
  };

  const previewRows = rows.slice(0, 5).map((r) => applyMapping(r, colMapping));

  const isBreedingValid = (r: Record<string, unknown>) => !!r.doeName && !!r.breedingDate;
  const isKidValid = (r: Record<string, unknown>) => !!r.doeName && !!r.breedingDate && !!r.sex;
  const rowValid = mode === "breedings" ? isBreedingValid : isKidValid;

  const validCount = rows.filter((r) => rowValid(applyMapping(r, colMapping))).length;

  const handleImport = () => {
    const mapped = rows.map((r) => applyMapping(r, colMapping)).filter(rowValid);
    if (mapped.length === 0) {
      toast({
        title: "Nothing to import",
        description: mode === "breedings"
          ? "No valid rows found. Make sure Doe Name and Breeding Date are mapped."
          : "No valid rows found. Make sure Doe Name, Breeding Date and Sex are mapped.",
        variant: "destructive",
      });
      return;
    }

    if (mode === "breedings") {
      importBreedings.mutate(
        { data: { breedings: mapped as unknown as Parameters<typeof importBreedings.mutate>[0]["data"]["breedings"] } },
        {
          onSuccess: (res) => {
            setResult(res);
            setStep("done");
            queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
            toast({ title: `${res.imported} breeding${res.imported !== 1 ? "s" : ""} imported!` });
          },
          onError: () => toast({ title: "Import failed", variant: "destructive" }),
        }
      );
    } else {
      importKids.mutate(
        { data: { kids: mapped as unknown as Parameters<typeof importKids.mutate>[0]["data"]["kids"] } },
        {
          onSuccess: (res) => {
            setResult(res);
            setStep("done");
            queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
            toast({ title: `${res.imported} kid${res.imported !== 1 ? "s" : ""} imported!` });
          },
          onError: () => toast({ title: "Import failed", variant: "destructive" }),
        }
      );
    }
  };

  const isPending = importBreedings.isPending || importKids.isPending;

  const previewColumns = mode === "breedings"
    ? [
        { key: "doeName", label: "Doe" },
        { key: "sireName", label: "Sire" },
        { key: "breedingDate", label: "Bred", date: true },
        { key: "expectedKiddingDate", label: "Due", date: true },
        { key: "breedingMethod", label: "Method" },
        { key: "status", label: "Status" },
      ]
    : [
        { key: "doeName", label: "Doe" },
        { key: "breedingDate", label: "Bred", date: true },
        { key: "name", label: "Kid" },
        { key: "sex", label: "Sex" },
        { key: "kidStatus", label: "Status" },
        { key: "birthDate", label: "Born", date: true },
        { key: "birthWeight", label: "Weight" },
      ];

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/breedings")} className="text-muted-foreground hover:text-foreground -ml-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Kidding Records
          </Button>
        </div>

        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground mb-1">Import from Spreadsheet</h2>
          <p className="text-muted-foreground">Bring in breeding records or kidding outcomes in bulk from an Excel or CSV file.</p>
        </div>

        <div className="flex gap-2 rounded-xl border border-border bg-card p-1.5 w-fit">
          <button
            onClick={() => switchMode("breedings")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${mode === "breedings" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Heart className="h-4 w-4" /> Breeding Records
          </button>
          <button
            onClick={() => switchMode("kids")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${mode === "kids" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Baby className="h-4 w-4" /> Kidding Outcomes
          </button>
        </div>

        {mode === "kids" && step === "upload" && (
          <div className="flex items-start gap-2 rounded-lg bg-secondary/40 border border-border p-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Each kid is matched to an existing breeding by <strong className="text-foreground">doe name</strong> plus <strong className="text-foreground">breeding date</strong>. Import the breeding records first so the kids can find their breeding.</span>
          </div>
        )}

        {step === "upload" && (
          <Card
            className="border-2 border-dashed border-primary/30 bg-card/50 cursor-pointer hover:border-primary/60 transition-colors"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="h-8 w-8 text-primary/60" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground mb-1">Drop your spreadsheet here</p>
                <p className="text-sm text-muted-foreground">or click to browse — supports .xlsx, .xls, .csv</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f, autoMapTable); }} />
            </CardContent>
          </Card>
        )}

        {(step === "map" || step === "preview") && workbook && (
          <>
            <Card className="border-primary/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="font-serif flex items-center gap-2 text-base">
                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                    {fileName}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={resetUpload}>
                    <X className="h-3.5 w-3.5 mr-1" /> Change file
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-foreground whitespace-nowrap">Sheet:</label>
                  <Select value={selectedSheet} onValueChange={handleSheetChange}>
                    <SelectTrigger className="w-48 bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {workbook.SheetNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">{rows.length} rows detected</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/10">
              <CardHeader>
                <CardTitle className="font-serif text-lg">Map Columns to Fields</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Assign each spreadsheet column to the matching {mode === "breedings" ? "breeding" : "kidding"} field, or ignore it. Required fields are marked with *.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Spreadsheet Column</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Maps to Field</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {headers.map((h) => (
                        <tr key={h} className="bg-card hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs text-foreground">{h}</td>
                          <td className="px-4 py-2.5">
                            <Select
                              value={colMapping[h] ?? "_ignore"}
                              onValueChange={(v) => setColMapping((prev) => ({ ...prev, [h]: v === "_ignore" ? "" : v }))}
                            >
                              <SelectTrigger className="h-8 bg-background/50 text-xs w-56">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_ignore" className="text-muted-foreground">— Ignore —</SelectItem>
                                {fields.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>
                                    {f.label}{f.required ? " *" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => setStep("preview")}
                    disabled={
                      mode === "breedings"
                        ? !Object.values(colMapping).includes("doeName") || !Object.values(colMapping).includes("breedingDate")
                        : !Object.values(colMapping).includes("doeName") || !Object.values(colMapping).includes("breedingDate") || !Object.values(colMapping).includes("sex")
                    }
                  >
                    Preview Import <ChevronRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {step === "preview" && (
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="font-serif text-lg">Preview</CardTitle>
              <p className="text-sm text-muted-foreground">Showing how the first rows will be imported. {validCount} of {rows.length} rows are ready.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {previewColumns.map((c) => (
                        <th key={c.key} className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewRows.map((r, i) => (
                      <tr key={i} className={`bg-card ${!rowValid(r) ? "opacity-40" : ""}`}>
                        {previewColumns.map((c) => (
                          <td key={c.key} className="px-3 py-2 capitalize">
                            {c.date
                              ? (r[c.key] ? new Date(String(r[c.key])).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "—")
                              : String(r[c.key] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewRows.some((r) => !rowValid(r)) && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Faded rows are missing a required field
                    {mode === "breedings" ? " (Doe Name or Breeding Date)" : " (Doe Name, Breeding Date or Sex)"} and will be skipped.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setStep("map")}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Mapping
                </Button>
                <Button onClick={handleImport} disabled={isPending}>
                  {isPending
                    ? "Importing..."
                    : mode === "breedings"
                    ? `Import ${validCount} Breeding${validCount !== 1 ? "s" : ""}`
                    : `Import ${validCount} Kid${validCount !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && result && (
          <Card className="border-primary/10">
            <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-serif font-bold text-foreground mb-1">Import Complete</h3>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{result.imported}</span>{" "}
                  {mode === "breedings"
                    ? `breeding${result.imported !== 1 ? "s" : ""}`
                    : `kid${result.imported !== 1 ? "s" : ""}`}{" "}
                  imported.
                  {result.skipped > 0 && ` ${result.skipped} row${result.skipped !== 1 ? "s" : ""} skipped.`}
                </p>
              </div>
              {result.errors.length > 0 && (
                <div className="w-full rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-left">
                  <p className="text-sm font-medium text-destructive mb-1">Skipped / Errors ({result.errors.length})</p>
                  <ul className="text-xs text-destructive/80 space-y-0.5 max-h-48 overflow-y-auto">
                    {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex gap-3">
                <Button onClick={() => setLocation("/breedings")}>View Kidding Records</Button>
                <Button variant="outline" onClick={resetUpload}>
                  Import Another File
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
