import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Download,
  Edit3,
  Loader2,
  Printer,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListGoatSales,
  useUpdateGoatSale,
  useDeleteGoatSale,
  getListGoatSalesQueryKey,
  getListGoatsQueryKey,
  getGetGoatQueryKey,
  getGetGoatSaleQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetBreedBreakdownQueryKey,
} from "@workspace/api-client-react";
import type { GoatSaleWithGoat } from "@workspace/api-client-react/src/generated/api.schemas";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ReportHeader } from "@/components/report-header";
import { useToast } from "@/hooks/use-toast";
import { useIsManager } from "@/lib/auth";
import { formatDate } from "@/lib/date";
import { downloadCsv, buildCsvFileName } from "@/lib/csvDownload";
import {
  formatSalePrice,
  formFromSale,
  SaleFormFields,
  type SaleFormValues,
} from "@/components/goat-sale";

type SortKey = "saleDate" | "goatName" | "buyerName" | "salePrice";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "saleDate", label: "Sale Date" },
  { key: "goatName", label: "Goat" },
  { key: "buyerName", label: "Buyer" },
  { key: "salePrice", label: "Price" },
];

function sortSales(sales: GoatSaleWithGoat[], key: SortKey, dir: SortDir): GoatSaleWithGoat[] {
  return [...sales].sort((a, b) => {
    let cmp: number;
    if (key === "saleDate") {
      cmp = new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime();
    } else if (key === "salePrice") {
      // Sales without a recorded price sort last so real figures group together.
      const aVal = a.salePrice ?? Number.NEGATIVE_INFINITY;
      const bVal = b.salePrice ?? Number.NEGATIVE_INFINITY;
      cmp = aVal - bVal;
    } else {
      cmp = (a[key] ?? "").localeCompare(b[key] ?? "", undefined, { numeric: true });
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 text-primary" />;
}

export default function SalesLogReport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isManager = useIsManager();
  const [sortKey, setSortKey] = useState<SortKey>("saleDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [isExporting, setIsExporting] = useState(false);

  // Edit dialog state
  const [editingSale, setEditingSale] = useState<GoatSaleWithGoat | null>(null);
  const [form, setForm] = useState<SaleFormValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingSale, setDeletingSale] = useState<GoatSaleWithGoat | null>(null);

  const { data: sales, isLoading } = useListGoatSales({
    query: { queryKey: getListGoatSalesQueryKey() },
  });
  const updateSale = useUpdateGoatSale();
  const deleteSale = useDeleteGoatSale();

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "saleDate" ? "desc" : "asc");
    }
  }

  const sorted = useMemo(
    () => (sales ? sortSales(sales, sortKey, sortDir) : []),
    [sales, sortKey, sortDir],
  );
  const totalRevenue = useMemo(
    () => (sales ?? []).reduce((sum, s) => sum + (s.salePrice ?? 0), 0),
    [sales],
  );
  const missingPrices = (sales ?? []).filter((s) => s.salePrice == null).length;

  // A sale edit or removal touches the goat's status too, so refresh both the
  // sales log and the goat-facing queries.
  const refreshAfterChange = (goatId: number) => {
    queryClient.invalidateQueries({ queryKey: getListGoatSalesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGoatQueryKey(goatId) });
    queryClient.invalidateQueries({ queryKey: getGetGoatSaleQueryKey(goatId) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBreedBreakdownQueryKey() });
  };

  const openEdit = (sale: GoatSaleWithGoat) => {
    setEditingSale(sale);
    setForm(formFromSale(sale));
    setFormError(null);
  };

  const handleEditSubmit = () => {
    if (!editingSale || !form) return;
    if (!form.saleDate) {
      setFormError("Please choose the sale date.");
      return;
    }
    if (!form.buyerName.trim()) {
      setFormError("Please enter the buyer's name.");
      return;
    }
    const price = form.salePrice.trim() === "" ? null : Number(form.salePrice);
    if (price != null && (Number.isNaN(price) || price < 0)) {
      setFormError("The sale price must be a positive number.");
      return;
    }
    setFormError(null);

    updateSale.mutate(
      {
        id: editingSale.id,
        data: {
          saleDate: new Date(`${form.saleDate}T12:00:00`).toISOString(),
          buyerName: form.buyerName.trim(),
          buyerContact: form.buyerContact.trim() || null,
          salePrice: price,
          registrationTransferred: form.registrationTransferred,
          notes: form.notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Sale updated",
            description: `${editingSale.goatName}'s sale record has been updated.`,
          });
          refreshAfterChange(editingSale.goatId);
          setEditingSale(null);
        },
        onError: () => {
          toast({
            title: "Update failed",
            description: "Could not update the sale record.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deletingSale) return;
    deleteSale.mutate(
      { id: deletingSale.id },
      {
        onSuccess: () => {
          toast({
            title: "Sale removed",
            description: `${deletingSale.goatName}'s sale record was removed from the log.`,
          });
          refreshAfterChange(deletingSale.goatId);
          setDeletingSale(null);
        },
        onError: () => {
          toast({
            title: "Delete failed",
            description: "Could not remove the sale record.",
            variant: "destructive",
          });
          setDeletingSale(null);
        },
      },
    );
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadCsv("/api/goat-sales/export", buildCsvFileName("sales"));
    } catch {
      toast({
        title: "Export failed",
        description: "The sales log could not be downloaded. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const columnCount = COLUMNS.length + 1 + (isManager ? 1 : 0);

  return (
    <Layout>
      <ReportHeader title="Sales Log" />

      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Sales Log</h1>
          <p className="text-muted-foreground text-sm">
            Every recorded goat sale for your farm. Click any column header to sort.
          </p>
        </div>
        <div className="no-print flex items-center gap-2 self-start shrink-0">
          <Button variant="outline" onClick={handleExport} disabled={isExporting || isLoading}>
            {isExporting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Downloading...</>
            ) : (
              <><Download className="mr-2 h-4 w-4" /> Download CSV</>
            )}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/10 shadow-md bg-card overflow-hidden print:border-0 print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1.5">
                      {col.label}
                      <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                  Registration
                </th>
                {isManager && (
                  <th className="no-print px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: columnCount }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-12 text-center text-muted-foreground">
                    No sales recorded yet. Record a sale from any goat's detail page.
                  </td>
                </tr>
              ) : (
                sorted.map((sale) => (
                  <tr key={sale.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap align-top">
                      {formatDate(sale.saleDate, { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 font-medium align-top">
                      <Link href={`/goats/${sale.goatId}`} className="text-foreground hover:text-primary transition-colors">
                        {sale.goatName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-foreground">{sale.buyerName}</div>
                      {sale.buyerContact && (
                        <div className="text-xs text-muted-foreground break-all">{sale.buyerContact}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap align-top text-foreground">
                      {formatSalePrice(sale.salePrice)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      {sale.registrationTransferred ? (
                        <Badge className="bg-chart-1 text-primary-foreground">Transferred</Badge>
                      ) : (
                        <Badge variant="secondary">Not Transferred</Badge>
                      )}
                    </td>
                    {isManager && (
                      <td className="no-print px-4 py-3 whitespace-nowrap align-top text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => openEdit(sale)}
                            aria-label={`Edit sale of ${sale.goatName}`}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-destructive hover:text-destructive"
                            onClick={() => setDeletingSale(sale)}
                            aria-label={`Delete sale of ${sale.goatName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && sorted.length > 0 && (
          <div className="flex flex-col gap-1 px-4 py-3 border-t border-border/50 bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {sorted.length} sale{sorted.length !== 1 ? "s" : ""}
              {missingPrices > 0 && (
                <span className="ml-2">· {missingPrices} without a recorded price</span>
              )}
            </span>
            <span className="text-sm font-semibold text-foreground">
              Total revenue: {formatSalePrice(totalRevenue)}
            </span>
          </div>
        )}
      </div>

      {/* Edit sale dialog */}
      <Dialog open={!!editingSale} onOpenChange={(open) => !open && setEditingSale(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">
              Edit Sale — {editingSale?.goatName}
            </DialogTitle>
            <DialogDescription>
              Update the buyer, price, or registration details for this sale.
            </DialogDescription>
          </DialogHeader>
          {form && <SaleFormFields values={form} onChange={setForm} />}
          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setEditingSale(null)} disabled={updateSale.isPending}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={updateSale.isPending}>
              {updateSale.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingSale} onOpenChange={(open) => !open && setDeletingSale(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this sale record?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {deletingSale?.goatName}'s sale from the log permanently. If{" "}
              {deletingSale?.goatName} is still marked as sold, the herd status will be set back
              to On Farm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSale.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteSale.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSale.isPending ? "Removing..." : "Remove Sale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
