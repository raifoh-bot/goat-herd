import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronRight, X } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useImportGoats, getListGoatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getBreedOptions } from "@/lib/breeds";
import { useFarmSettings } from "@/lib/settings";

const SEX_OPTIONS = ["doe", "buck", "wether"] as const;
const LACTATION_OPTIONS = ["milking", "dry", "kid", "retired"] as const;

const GOAT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "name", label: "Barn Name", required: true },
  { key: "registeredName", label: "Registered Name" },
  { key: "adgaId", label: "ADGA / Reg ID" },
  { key: "sex", label: "Sex" },
  { key: "breed", label: "Breed" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "damName", label: "Dam Name" },
  { key: "sireName", label: "Sire Name" },
  { key: "maternalGranddamName", label: "Maternal Granddam" },
  { key: "maternalGrandsireName", label: "Maternal Grandsire" },
  { key: "paternalGranddamName", label: "Paternal Granddam" },
  { key: "paternalGrandsireName", label: "Paternal Grandsire" },
  { key: "rightEarTattoo", label: "Right Ear Tattoo" },
  { key: "leftEarTattoo", label: "Left Ear Tattoo" },
  { key: "rightTailTattoo", label: "Right Tail Tattoo" },
  { key: "leftTailTattoo", label: "Left Tail Tattoo" },
  { key: "centerTailTattoo", label: "Center Tail Tattoo" },
  { key: "eidNumber", label: "EID / Microchip" },
];

const AUTO_MAP: Record<string, string> = {
  "farm name": "name", "barn name": "name", "name": "name",
  "registered name": "registeredName", "reg name": "registeredName",
  "reg id": "adgaId", "adga": "adgaId", "registration id": "adgaId",
  "dob": "dateOfBirth", "date of birth": "dateOfBirth", "birthday": "dateOfBirth", "birth date": "dateOfBirth",
  "tat re": "rightEarTattoo", "re tattoo": "rightEarTattoo", "right ear": "rightEarTattoo", "right ear tattoo": "rightEarTattoo",
  "tat le": "leftEarTattoo", "le tattoo": "leftEarTattoo", "left ear": "leftEarTattoo", "left ear tattoo": "leftEarTattoo",
  "tat rt": "rightTailTattoo", "rt tattoo": "rightTailTattoo", "right tail": "rightTailTattoo", "right tail tattoo": "rightTailTattoo",
  "tat lt": "leftTailTattoo", "lt tattoo": "leftTailTattoo", "left tail": "leftTailTattoo", "left tail tattoo": "leftTailTattoo",
  "tat ct": "centerTailTattoo", "ct tattoo": "centerTailTattoo", "center tail": "centerTailTattoo", "center tail tattoo": "centerTailTattoo", "centre tail": "centerTailTattoo",
  "eid": "eidNumber", "eid number": "eidNumber", "microchip": "eidNumber", "microchip id": "eidNumber", "chip": "eidNumber", "chip id": "eidNumber",
  "sex": "sex", "gender": "sex",
  "breed": "breed",
  "dam": "damName", "dam name": "damName", "mother": "damName",
  "sire": "sireName", "sire name": "sireName", "father": "sireName",
  "grand dam": "maternalGranddamName", "granddam": "maternalGranddamName", "maternal granddam": "maternalGranddamName", "mat granddam": "maternalGranddamName", "mat. granddam": "maternalGranddamName",
  "grand sire": "maternalGrandsireName", "grandsire": "maternalGrandsireName", "maternal grandsire": "maternalGrandsireName", "mat grandsire": "maternalGrandsireName", "mat. grandsire": "maternalGrandsireName",
  "paternal granddam": "paternalGranddamName", "pat granddam": "paternalGranddamName", "pat. granddam": "paternalGranddamName",
  "paternal grandsire": "paternalGrandsireName", "pat grandsire": "paternalGrandsireName", "pat. grandsire": "paternalGrandsireName",
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
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

function normalizeSex(value: unknown): "doe" | "buck" | "wether" | undefined {
  if (!value) return undefined;
  const v = String(value).toLowerCase().trim();
  if (v === "f" || v === "female" || v === "doe") return "doe";
  if (v === "m" || v === "male" || v === "buck") return "buck";
  if (v === "w" || v === "wether" || v === "neutered") return "wether";
  return undefined;
}

function normalizeBreed(value: unknown, allowedBreeds: readonly string[]): string | undefined {
  if (!value) return undefined;
  const v = String(value).toLowerCase().trim().replace(/\s+/g, "-");
  for (const b of allowedBreeds) {
    if (v === b || v.includes(b) || b.includes(v)) return b;
  }
  return undefined;
}

function applyMapping(
  row: Record<string, unknown>,
  colMapping: Record<string, string>,
  defaultSex: string,
  defaultBreed: string,
  allowedBreeds: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [col, field] of Object.entries(colMapping)) {
    if (!field || field === "_ignore") continue;
    const val = row[col];
    if (val === null || val === undefined || val === "") continue;
    if (field === "dateOfBirth") {
      result[field] = excelDateToISO(val);
    } else if (field === "sex") {
      result[field] = normalizeSex(val);
    } else if (field === "breed") {
      const normalized = normalizeBreed(val, allowedBreeds);
      if (normalized) result[field] = normalized;
    } else if (
      field === "rightEarTattoo" ||
      field === "leftEarTattoo" ||
      field === "rightTailTattoo" ||
      field === "leftTailTattoo" ||
      field === "centerTailTattoo"
    ) {
      result[field] = String(val).slice(0, 4);
    } else {
      result[field] = String(val).trim() || undefined;
    }
  }
  if (!result.sex && defaultSex) result.sex = defaultSex;
  if (!result.breed && defaultBreed) result.breed = defaultBreed;
  return result;
}

type Step = "upload" | "map" | "preview" | "done";

export default function ImportGoats() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [colMapping, setColMapping] = useState<Record<string, string>>({});
  const [defaultSex, setDefaultSex] = useState("");
  const [defaultBreed, setDefaultBreed] = useState("");
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  const { enabledBreeds } = useFarmSettings();
  const breedOptions = getBreedOptions(enabledBreeds);
  const allowedBreeds = breedOptions.map((b) => b.slug);

  const importGoats = useImportGoats();

  const loadSheet = useCallback((wb: XLSX.WorkBook, sheetName: string) => {
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

    const autoMap: Record<string, string> = {};
    for (const h of headerRow) {
      const key = AUTO_MAP[h.toLowerCase().trim()];
      if (key) autoMap[h] = key;
    }
    setColMapping(autoMap);
  }, []);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      setWorkbook(wb);
      const firstSheet = wb.SheetNames[0];
      setSelectedSheet(firstSheet);
      loadSheet(wb, firstSheet);
      setStep("map");
    };
    reader.readAsArrayBuffer(file);
  }, [loadSheet]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleSheetChange = (name: string) => {
    setSelectedSheet(name);
    if (workbook) loadSheet(workbook, name);
  };

  const previewRows = rows.slice(0, 5).map((r) => applyMapping(r, colMapping, defaultSex, defaultBreed, allowedBreeds));

  const handleImport = () => {
    const goats = rows
      .map((r) => applyMapping(r, colMapping, defaultSex, defaultBreed, allowedBreeds))
      .filter((r) => r.name && r.breed);

    if (goats.length === 0) {
      toast({ title: "Nothing to import", description: "No valid rows found. Make sure Name and Breed are mapped.", variant: "destructive" });
      return;
    }

    importGoats.mutate(
      { data: { goats: goats as unknown as Parameters<typeof importGoats.mutate>[0]["data"]["goats"] } },
      {
        onSuccess: (res) => {
          setResult(res);
          setStep("done");
          queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
          toast({ title: `${res.imported} goat${res.imported !== 1 ? "s" : ""} imported!` });
        },
        onError: () => toast({ title: "Import failed", variant: "destructive" }),
      }
    );
  };

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/goats")} className="text-muted-foreground hover:text-foreground -ml-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to The Herd
          </Button>
        </div>

        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground mb-1">Import from Spreadsheet</h2>
          <p className="text-muted-foreground">Upload an Excel file, choose a sheet, map columns, and import goats into your herd.</p>
        </div>

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
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setStep("upload"); setWorkbook(null); setFileName(""); }}>
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
                <p className="text-sm text-muted-foreground">Columns detected in your sheet are listed below. Assign each to the matching herd field, or ignore it.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default Sex</p>
                    <p className="text-xs text-muted-foreground">Used when no sex column is mapped</p>
                    <Select value={defaultSex} onValueChange={setDefaultSex}>
                      <SelectTrigger className="bg-background/50">
                        <SelectValue placeholder="No default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">No default</SelectItem>
                        {SEX_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default Breed</p>
                    <p className="text-xs text-muted-foreground">Used when no breed column is mapped</p>
                    <Select value={defaultBreed} onValueChange={setDefaultBreed}>
                      <SelectTrigger className="bg-background/50">
                        <SelectValue placeholder="No default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">No default</SelectItem>
                        {breedOptions.map((b) => <SelectItem key={b.slug} value={b.slug}>{b.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Spreadsheet Column</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Maps to Herd Field</th>
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
                              <SelectTrigger className="h-8 bg-background/50 text-xs w-52">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_ignore" className="text-muted-foreground">— Ignore —</SelectItem>
                                {GOAT_FIELDS.map((f) => (
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
                  <Button onClick={() => setStep("preview")} disabled={!defaultBreed && !Object.values(colMapping).includes("breed")}>
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
              <p className="text-sm text-muted-foreground">Showing how the first rows will be imported. {rows.length} total rows ready.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {["Name", "Sex", "Breed", "DOB", "Dam", "Sire", "Mat. Granddam", "Mat. Grandsire", "Pat. Granddam", "Pat. Grandsire", "RE Tattoo", "LE Tattoo"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewRows.map((r, i) => (
                      <tr key={i} className={`bg-card ${!r.name || !r.breed ? "opacity-40" : ""}`}>
                        <td className="px-3 py-2 font-medium">{String(r.name ?? "—")}</td>
                        <td className="px-3 py-2 capitalize">{String(r.sex ?? "—")}</td>
                        <td className="px-3 py-2 capitalize">{String(r.breed ?? "—")}</td>
                        <td className="px-3 py-2">{r.dateOfBirth ? new Date(String(r.dateOfBirth)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                        <td className="px-3 py-2">{String(r.damName ?? "—")}</td>
                        <td className="px-3 py-2">{String(r.sireName ?? "—")}</td>
                        <td className="px-3 py-2">{String(r.maternalGranddamName ?? "—")}</td>
                        <td className="px-3 py-2">{String(r.maternalGrandsireName ?? "—")}</td>
                        <td className="px-3 py-2">{String(r.paternalGranddamName ?? "—")}</td>
                        <td className="px-3 py-2">{String(r.paternalGrandsireName ?? "—")}</td>
                        <td className="px-3 py-2 font-mono">{String(r.rightEarTattoo ?? "—")}</td>
                        <td className="px-3 py-2 font-mono">{String(r.leftEarTattoo ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewRows.some((r) => !r.name || !r.breed) && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Faded rows are missing a required Name or Breed and will be skipped during import.</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setStep("map")}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Mapping
                </Button>
                <Button onClick={handleImport} disabled={importGoats.isPending}>
                  {importGoats.isPending ? "Importing..." : `Import ${rows.filter((r) => applyMapping(r, colMapping, defaultSex, defaultBreed, allowedBreeds).name && applyMapping(r, colMapping, defaultSex, defaultBreed, allowedBreeds).breed).length} Goats`}
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
                  <span className="font-semibold text-foreground">{result.imported}</span> goat{result.imported !== 1 ? "s" : ""} added to your herd.
                  {result.skipped > 0 && ` ${result.skipped} row${result.skipped !== 1 ? "s" : ""} skipped.`}
                </p>
              </div>
              {result.errors.length > 0 && (
                <div className="w-full rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-left">
                  <p className="text-sm font-medium text-destructive mb-1">Errors ({result.errors.length})</p>
                  <ul className="text-xs text-destructive/80 space-y-0.5">
                    {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex gap-3">
                <Button onClick={() => setLocation("/goats")}>View The Herd</Button>
                <Button variant="outline" onClick={() => { setStep("upload"); setWorkbook(null); setFileName(""); setResult(null); }}>
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
