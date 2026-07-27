import { useState } from "react";
import { BadgeCheck, BadgeX, DollarSign, Edit3, HandCoins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetBreedBreakdownQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetGoatQueryKey,
  getGetGoatSaleQueryKey,
  getListGoatSalesQueryKey,
  getListGoatsQueryKey,
  useCreateGoatSale,
  useGetGoatSale,
  useUpdateGoatSale,
} from "@workspace/api-client-react";
import type { Goat, GoatSale } from "@workspace/api-client-react/src/generated/api.schemas";
import { formatDate } from "@/lib/date";

/** Formats a sale price for display, e.g. $350.00. */
export function formatSalePrice(price: number | null | undefined): string {
  if (price == null) return "—";
  return price.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

interface SaleFormValues {
  saleDate: string; // yyyy-mm-dd from the date input
  buyerName: string;
  buyerContact: string;
  salePrice: string;
  registrationTransferred: boolean;
  notes: string;
}

function emptyForm(): SaleFormValues {
  return {
    saleDate: new Date().toISOString().slice(0, 10),
    buyerName: "",
    buyerContact: "",
    salePrice: "",
    registrationTransferred: false,
    notes: "",
  };
}

function formFromSale(sale: GoatSale): SaleFormValues {
  return {
    saleDate: sale.saleDate ? new Date(sale.saleDate).toISOString().slice(0, 10) : "",
    buyerName: sale.buyerName,
    buyerContact: sale.buyerContact ?? "",
    salePrice: sale.salePrice != null ? String(sale.salePrice) : "",
    registrationTransferred: sale.registrationTransferred,
    notes: sale.notes ?? "",
  };
}

/**
 * Shared sale form fields for the record and edit dialogs. Only sale date and
 * buyer name are required; price, contact, and notes are optional.
 */
function SaleFormFields({
  values,
  onChange,
}: {
  values: SaleFormValues;
  onChange: (values: SaleFormValues) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sale-date">Sale Date *</Label>
          <Input
            id="sale-date"
            type="date"
            value={values.saleDate}
            onChange={(e) => onChange({ ...values, saleDate: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sale-price">Sale Price ($)</Label>
          <Input
            id="sale-price"
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional"
            value={values.salePrice}
            onChange={(e) => onChange({ ...values, salePrice: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="buyer-name">Buyer Name *</Label>
        <Input
          id="buyer-name"
          placeholder="Who bought this goat?"
          maxLength={200}
          value={values.buyerName}
          onChange={(e) => onChange({ ...values, buyerName: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="buyer-contact">Buyer Phone / Email</Label>
        <Input
          id="buyer-contact"
          placeholder="Optional"
          maxLength={300}
          value={values.buyerContact}
          onChange={(e) => onChange({ ...values, buyerContact: e.target.value })}
        />
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <Checkbox
          id="registration-transferred"
          checked={values.registrationTransferred}
          onCheckedChange={(checked) =>
            onChange({ ...values, registrationTransferred: checked === true })
          }
        />
        <div className="space-y-0.5">
          <Label htmlFor="registration-transferred" className="cursor-pointer">
            Registration papers transferred
          </Label>
          <p className="text-xs text-muted-foreground">
            Sets the herd status to Sold-Registered when checked, Sold-Not Registered otherwise.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sale-notes">Notes</Label>
        <Textarea
          id="sale-notes"
          placeholder="Optional"
          maxLength={2000}
          rows={3}
          value={values.notes}
          onChange={(e) => onChange({ ...values, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

/**
 * Sale section for the goat detail page:
 * - Managers see a "Record Sale" button while the goat is unsold.
 * - Once a sale exists, a Sale card shows the buyer, price, date, papers
 *   badge, and notes — with an Edit action for managers.
 */
export function GoatSaleSection({ goat, isManager }: { goat: Goat; isManager: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditingSale, setIsEditingSale] = useState(false);
  const [form, setForm] = useState<SaleFormValues>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const { data: sale } = useGetGoatSale(goat.id, {
    query: { queryKey: getGetGoatSaleQueryKey(goat.id), enabled: !!goat.id },
  });

  const createSale = useCreateGoatSale();
  const updateSale = useUpdateGoatSale();
  const isSaving = createSale.isPending || updateSale.isPending;

  const isSold = goat.herdStatus === "sold-registered" || goat.herdStatus === "sold-not-registered";

  const refreshAfterSale = () => {
    queryClient.invalidateQueries({ queryKey: getGetGoatQueryKey(goat.id) });
    queryClient.invalidateQueries({ queryKey: getGetGoatSaleQueryKey(goat.id) });
    queryClient.invalidateQueries({ queryKey: getListGoatSalesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBreedBreakdownQueryKey() });
  };

  const openRecordDialog = () => {
    setIsEditingSale(false);
    setForm(emptyForm());
    setFormError(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = () => {
    if (!sale) return;
    setIsEditingSale(true);
    setForm(formFromSale(sale));
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
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

    const payload = {
      saleDate: new Date(`${form.saleDate}T12:00:00`).toISOString(),
      buyerName: form.buyerName.trim(),
      buyerContact: form.buyerContact.trim() || null,
      salePrice: price,
      registrationTransferred: form.registrationTransferred,
      notes: form.notes.trim() || null,
    };

    if (isEditingSale && sale) {
      updateSale.mutate(
        { id: sale.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Sale updated", description: `${goat.name}'s sale record has been updated.` });
            setIsDialogOpen(false);
            refreshAfterSale();
          },
          onError: () => {
            toast({ title: "Update failed", description: "Could not update the sale record.", variant: "destructive" });
          },
        },
      );
    } else {
      createSale.mutate(
        { data: { ...payload, goatId: goat.id } },
        {
          onSuccess: () => {
            toast({
              title: "Sale recorded",
              description: `${goat.name} is now marked as ${form.registrationTransferred ? "Sold-Registered" : "Sold-Not Registered"}.`,
            });
            setIsDialogOpen(false);
            refreshAfterSale();
          },
          onError: () => {
            toast({ title: "Save failed", description: "Could not record the sale.", variant: "destructive" });
          },
        },
      );
    }
  };

  return (
    <>
      {sale ? (
        <Card className="border-primary/10 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-primary" /> Sale
            </CardTitle>
            {isManager && (
              <Button variant="outline" size="sm" className="no-print" onClick={openEditDialog}>
                <Edit3 className="mr-2 h-4 w-4" /> Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Sale Date</div>
                <div className="font-medium text-foreground">
                  {formatDate(sale.saleDate, { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Sale Price</div>
                <div className="font-medium text-foreground">{formatSalePrice(sale.salePrice)}</div>
              </div>
              <div className="rounded-xl border border-border bg-card/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Buyer</div>
                <div className="font-medium text-foreground">{sale.buyerName}</div>
                {sale.buyerContact && (
                  <div className="mt-1 text-xs text-muted-foreground break-all">{sale.buyerContact}</div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Registration</div>
                {sale.registrationTransferred ? (
                  <Badge className="bg-chart-1 text-primary-foreground gap-1">
                    <BadgeCheck className="h-3.5 w-3.5" /> Papers Transferred
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <BadgeX className="h-3.5 w-3.5" /> Not Transferred
                  </Badge>
                )}
              </div>
            </div>
            {sale.notes && (
              <div className="rounded-xl border border-border bg-card/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{sale.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        isManager &&
        !isSold && (
          <Button variant="outline" className="no-print" onClick={openRecordDialog}>
            <DollarSign className="mr-2 h-4 w-4" /> Record Sale
          </Button>
        )
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {isEditingSale ? `Edit Sale — ${goat.name}` : `Record Sale — ${goat.name}`}
            </DialogTitle>
            <DialogDescription>
              {isEditingSale
                ? "Update the buyer, price, or registration details for this sale."
                : `Log who bought ${goat.name} and update the herd status automatically.`}
            </DialogDescription>
          </DialogHeader>
          <SaleFormFields values={form} onChange={setForm} />
          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? "Saving..." : isEditingSale ? "Save Changes" : "Record Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
