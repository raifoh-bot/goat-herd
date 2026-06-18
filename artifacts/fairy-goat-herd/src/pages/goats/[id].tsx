import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { AlertTriangle, ArrowLeft, Baby, Calendar, CheckCircle2, Edit3, Heart, Milk, Printer, Tag, Trash2, User, XCircle, Zap } from "lucide-react";
import { Layout } from "@/components/layout";
import { ReportHeader } from "@/components/report-header";
import { GoatForm } from "@/components/goat-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetBreedBreakdownQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetGoatQueryKey,
  getListBreedingsQueryKey,
  getListGoatsQueryKey,
  useDeleteGoat,
  useGetGoat,
  useListBreedings,
  useUpdateGoat,
} from "@workspace/api-client-react";
import { breedLabels } from "@/lib/breeds";
import { formatAge } from "@/lib/age";
import { formatDate } from "@/lib/date";
import { useFarmSettings } from "@/lib/settings";

const breedingStatusConfig = {
  bred: { label: "Bred", icon: Heart, className: "bg-secondary text-secondary-foreground" },
  "confirmed-pregnant": { label: "Pregnant", icon: CheckCircle2, className: "bg-chart-1 text-primary-foreground" },
  kidded: { label: "Kidded", icon: Baby, className: "bg-primary text-primary-foreground" },
  open: { label: "Open", icon: XCircle, className: "bg-destructive text-destructive-foreground" },
};

export default function GoatDetails() {
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data: goat, isLoading, isError } = useGetGoat(id, {
    query: {
      enabled: !!id,
      queryKey: getGetGoatQueryKey(id),
    },
  });

  const { data: allBreedings } = useListBreedings({
    query: { queryKey: getListBreedingsQueryKey() },
  });
  const doeBreedings = (allBreedings ?? []).filter((b) => b.doeId === id);

  const { usesAi } = useFarmSettings();

  const updateGoat = useUpdateGoat();
  const deleteGoat = useDeleteGoat();

  const refreshGoatData = () => {
    queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBreedBreakdownQueryKey() });
  };

  const handleUpdate = (data: any) => {
    updateGoat.mutate({ id, data }, {
      onSuccess: (updatedGoat) => {
        toast({
          title: "Record updated",
          description: `${updatedGoat.name}'s herd record has been refreshed.`,
        });
        setIsEditing(false);
        queryClient.setQueryData(getGetGoatQueryKey(id), updatedGoat);
        refreshGoatData();
      },
      onError: () => {
        toast({
          title: "Update failed",
          description: "There was an error updating the record.",
          variant: "destructive",
        });
      },
    });
  };

  const handleDelete = () => {
    deleteGoat.mutate({ id }, {
      onSuccess: () => {
        toast({
          title: "Goat removed",
          description: `${goat?.name} has been removed from the herd.`,
        });
        refreshGoatData();
        setLocation("/goats");
      },
      onError: () => {
        toast({
          title: "Removal failed",
          description: "Could not remove the record.",
          variant: "destructive",
        });
        setIsDeleteDialogOpen(false);
      },
    });
  };

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Record Not Found</h2>
          <p className="text-muted-foreground mb-6">This herd record could not be found.</p>
          <Button onClick={() => setLocation("/goats")}>Return to Herd</Button>
        </div>
      </Layout>
    );
  }

  if (isLoading || !goat) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-32" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const pedigreeRows = [
    { label: "Dam", value: goat.damName, regNo: goat.damRegNo },
    { label: "Sire", value: goat.sireName, regNo: goat.sireRegNo },
    { label: "Maternal Granddam", value: goat.maternalGranddamName, regNo: goat.maternalGranddamRegNo },
    { label: "Maternal Grandsire", value: goat.maternalGrandsireName, regNo: goat.maternalGrandsireRegNo },
    { label: "Paternal Granddam", value: goat.paternalGranddamName, regNo: goat.paternalGranddamRegNo },
    { label: "Paternal Grandsire", value: goat.paternalGrandsireName, regNo: goat.paternalGrandsireRegNo },
  ];
  const hasPedigree = pedigreeRows.some((row) => row.value || row.regNo);

  return (
    <Layout>
      <ReportHeader title={`Pedigree — ${goat.name}`} />

      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/goats")} className="text-muted-foreground hover:text-foreground self-start -ml-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Herd
          </Button>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print / Export
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit3 className="mr-2 h-4 w-4" /> Edit Record
                </Button>
                <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="icon" className="shadow-sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="font-serif">Confirm Removal</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to remove {goat.name} from the herd records? This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-6">
                      <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                      <Button variant="destructive" onClick={handleDelete} disabled={deleteGoat.isPending}>
                        {deleteGoat.isPending ? "Removing..." : "Remove Goat"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
            {isEditing && <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel Editing</Button>}
          </div>
        </div>

        {isEditing ? (
          <Card className="border-primary/10 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="font-serif">Edit Record for {goat.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <GoatForm defaultValues={goat} onSubmit={handleUpdate} isSubmitting={updateGoat.isPending} />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              <Card className="overflow-hidden border-primary/10 shadow-md">
                <div className="aspect-square bg-muted/30 relative">
                  {goat.imageUrl ? (
                    <img src={goat.imageUrl} alt={goat.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                      <Milk className="h-16 w-16 text-primary/40 mb-4" />
                      <span className="text-sm font-medium text-primary/50 uppercase tracking-widest">No Photo</span>
                    </div>
                  )}
                </div>
                <CardContent className="p-6">
                  <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-1">{goat.name}</h1>
                  {goat.registeredName && (
                    <p className="text-sm text-muted-foreground italic mb-1">{goat.registeredName}</p>
                  )}
                  {goat.adgaId && (
                    <p className="text-xs font-mono text-muted-foreground/70 mb-4">ADGA #{goat.adgaId}</p>
                  )}
                  {!goat.registeredName && !goat.adgaId && <div className="mb-4" />}

                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-border">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm"><Milk className="h-4 w-4" /> Breed</span>
                      <Badge variant="outline" className="capitalize font-medium">{breedLabels[goat.breed]}</Badge>
                    </div>

                    {goat.sex && (
                      <div className="flex justify-between items-center pb-3 border-b border-border">
                        <span className="text-muted-foreground flex items-center gap-2 text-sm"><User className="h-4 w-4" /> Sex</span>
                        <Badge variant="outline" className="capitalize font-medium">{goat.sex === "doe" ? "Doe ♀" : goat.sex === "wether" ? "Wether ⚬" : "Buck ♂"}</Badge>
                      </div>
                    )}

                    <div className="flex justify-between items-center pb-3 border-b border-border">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm"><Tag className="h-4 w-4" /> Herd Status</span>
                      <span className="font-medium text-foreground">
                        {goat.herdStatus === "dead" ? "Dead"
                          : goat.herdStatus === "first-freshener" ? "First Freshener"
                          : goat.herdStatus === "leased" ? "Leased"
                          : goat.herdStatus === "on-farm" ? "On Farm"
                          : goat.herdStatus === "retired" ? "Retired"
                          : goat.herdStatus === "sold" ? "Sold"
                          : "—"}
                      </span>
                    </div>

                    {goat.lactationStatus && (
                      <div className="flex justify-between items-center pb-3 border-b border-border">
                        <span className="text-muted-foreground flex items-center gap-2 text-sm"><Milk className="h-4 w-4" /> Lactation Status</span>
                        <span className="font-medium text-foreground">
                          {goat.lactationStatus === "milking" ? "Milking"
                            : goat.lactationStatus === "dry" ? "Dry"
                            : goat.lactationStatus === "exposed" ? "Exposed"
                            : goat.lactationStatus === "serviced" ? "Serviced"
                            : goat.lactationStatus === "pregnant" ? "Pregnant"
                            : goat.lactationStatus === "kid" ? "Kid"
                            : goat.lactationStatus === "retired" ? "Retired"
                            : "—"}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pb-3 border-b border-border">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm"><Calendar className="h-4 w-4" /> Age</span>
                      <span className="font-medium text-foreground">{goat.dateOfBirth ? formatAge(goat.dateOfBirth) : `${goat.age} yr`}</span>
                    </div>

                    {(() => {
                      const tattoos = [
                        { label: "Right Ear", value: goat.rightEarTattoo },
                        { label: "Left Ear", value: goat.leftEarTattoo },
                        { label: "Right Tail", value: goat.rightTailTattoo },
                        { label: "Left Tail", value: goat.leftTailTattoo },
                        { label: "Center Tail", value: goat.centerTailTattoo },
                      ].filter((t) => t.value);
                      if (tattoos.length === 0 && !goat.eidNumber) return null;
                      return (
                        <div className="pt-1 space-y-3">
                          {tattoos.length > 0 && (
                            <div>
                              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Tattoo</div>
                              <div className="grid grid-cols-2 gap-2">
                                {tattoos.map((t) => (
                                  <div key={t.label} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
                                    <div className="text-xs text-muted-foreground mb-1">{t.label}</div>
                                    <div className="font-mono font-semibold text-foreground uppercase">{t.value}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {goat.eidNumber && (
                            <div>
                              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Microchip / EID</div>
                              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
                                <div className="font-mono font-semibold text-foreground break-all">{goat.eidNumber}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <Card className="border-primary/10 shadow-md">
                <CardHeader>
                  <CardTitle className="font-serif text-lg">Breeding Lines</CardTitle>
                </CardHeader>
                <CardContent>
                  {hasPedigree ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pedigreeRows.map((row) => (
                        <div key={row.label} className="rounded-xl border border-border bg-card/50 p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{row.label}</div>
                          <div className="font-medium text-foreground">{row.value || "Not recorded"}</div>
                          {row.regNo && (
                            <div className="mt-1 text-xs text-muted-foreground">Reg: {row.regNo}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Milk className="h-8 w-8 text-muted-foreground/30 mb-3" />
                      <p className="italic">No breeding information has been added yet.</p>
                      <Button variant="link" onClick={() => setIsEditing(true)} className="mt-2 text-primary">Add pedigree</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {goat.sex === "doe" && doeBreedings.length > 0 && (
                <Card className="border-primary/10 shadow-md">
                  <CardHeader>
                    <CardTitle className="font-serif text-lg">Kidding Records</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {doeBreedings
                      .slice()
                      .sort((a, b) => new Date(b.breedingDate).getTime() - new Date(a.breedingDate).getTime())
                      .map((breeding) => {
                        const config = breedingStatusConfig[breeding.status];
                        const StatusIcon = config.icon;
                        const breedingDate = new Date(breeding.breedingDate);
                        const expectedDate = breeding.expectedKiddingDate
                          ? new Date(breeding.expectedKiddingDate)
                          : new Date(breedingDate.getTime() + 145 * 24 * 60 * 60 * 1000);
                        const kiddingDate = breeding.kids && breeding.kids.length > 0 && breeding.kids[0].birthDate
                          ? new Date(breeding.kids[0].birthDate)
                          : null;
                        return (
                          <Link key={breeding.id} href={`/breedings/${breeding.id}`}>
                            <div className="rounded-xl border border-border bg-card/50 p-4 hover:bg-muted/30 transition-colors cursor-pointer">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="font-medium text-foreground text-sm">× {breeding.sireName}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {usesAi && breeding.breedingMethod === "ai" && (
                                    <Badge className="bg-violet-500/15 text-violet-700 border border-violet-400/40 flex items-center gap-1 px-2 py-0.5 text-xs dark:text-violet-300 dark:bg-violet-500/10">
                                      <Zap className="h-3 w-3" />
                                      AI
                                    </Badge>
                                  )}
                                  <Badge className={`${config.className} flex items-center gap-1 px-2 py-0.5 text-xs`}>
                                    <StatusIcon className="h-3 w-3" />
                                    {config.label}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Heart className="h-3 w-3" />
                                  Bred {formatDate(breedingDate, { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                                {kiddingDate ? (
                                  <span className="flex items-center gap-1">
                                    <Baby className="h-3 w-3" />
                                    Kidded {formatDate(kiddingDate, { month: "short", day: "numeric", year: "numeric" })}
                                  </span>
                                ) : breeding.status !== "open" && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Est. {formatDate(expectedDate, { month: "short", day: "numeric", year: "numeric" })}
                                  </span>
                                )}
                              </div>
                              {breeding.kids && breeding.kids.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {breeding.kids.map((kid, i) => (
                                    <span
                                      key={i}
                                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                        kid.kidStatus === "doa"
                                          ? "bg-destructive/10 text-destructive"
                                          : kid.sex === "doe"
                                          ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
                                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                      }`}
                                    >
                                      {kid.name || (kid.sex === "doe" ? "Doe ♀" : "Buck ♂")}
                                      {kid.kidStatus === "doa" && " · DOA"}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                  </CardContent>
                </Card>
              )}

              <Card className="border-primary/10 shadow-md h-full">
                <CardHeader>
                  <CardTitle className="font-serif text-lg">Herd Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  {goat.description ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
                      {goat.description.split("\n").map((paragraph, idx) => <p key={idx}>{paragraph}</p>)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Edit3 className="h-8 w-8 text-muted-foreground/30 mb-3" />
                      <p className="italic">No notes have been added for this goat yet.</p>
                      <Button variant="link" onClick={() => setIsEditing(true)} className="mt-2 text-primary">Add notes</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
