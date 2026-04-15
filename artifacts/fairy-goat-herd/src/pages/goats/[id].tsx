import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { AlertTriangle, ArrowLeft, Calendar, Edit3, Milk, ShieldAlert, Stethoscope, Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { GoatForm } from "@/components/goat-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetBreedBreakdownQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetGoatQueryKey,
  getListGoatsQueryKey,
  useDeleteGoat,
  useGetGoat,
  useUpdateGoat,
} from "@workspace/api-client-react";
import { breedLabels } from "@/pages/goats/index";

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

  const statusColors = {
    healthy: "bg-chart-1 text-primary-foreground",
    watch: "bg-secondary text-secondary-foreground",
    treatment: "bg-destructive text-destructive-foreground",
    dry: "bg-muted text-muted-foreground",
  };

  const milkProgress = Math.min(100, (goat.milkPerDay / 10) * 100);
  const pedigreeRows = [
    { label: "Dam", value: goat.damName },
    { label: "Sire", value: goat.sireName },
    { label: "Maternal Granddam", value: goat.maternalGranddamName },
    { label: "Maternal Grandsire", value: goat.maternalGrandsireName },
    { label: "Paternal Granddam", value: goat.paternalGranddamName },
    { label: "Paternal Grandsire", value: goat.paternalGrandsireName },
  ];
  const hasPedigree = pedigreeRows.some((row) => row.value);

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/goats")} className="text-muted-foreground hover:text-foreground self-start -ml-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Herd
          </Button>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
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
                  <div className="absolute top-4 right-4">
                    <Badge className={`${statusColors[goat.status]} shadow-md px-3 py-1 text-sm capitalize`}>{goat.status}</Badge>
                  </div>
                </div>
                <CardContent className="p-6">
                  <h1 className="text-3xl font-serif font-bold text-foreground mb-4">{goat.name}</h1>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-border">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm"><Milk className="h-4 w-4" /> Breed</span>
                      <Badge variant="outline" className="capitalize font-medium">{breedLabels[goat.breed]}</Badge>
                    </div>

                    <div className="flex justify-between items-center pb-3 border-b border-border">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm"><ShieldAlert className="h-4 w-4" /> Lactation</span>
                      <span className="font-medium capitalize text-foreground">{goat.lactationStatus}</span>
                    </div>

                    <div className="flex justify-between items-center pb-3 border-b border-border">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm"><Calendar className="h-4 w-4" /> Age</span>
                      <span className="font-medium text-foreground">{goat.age} years</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <Card className="border-primary/10 shadow-md">
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-primary" /> Production Record
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-sm font-medium text-muted-foreground">Daily Milk Production</span>
                      <span className="text-2xl font-serif font-bold text-primary">{goat.milkPerDay} <span className="text-sm text-muted-foreground font-sans font-normal">qt/day</span></span>
                    </div>
                    <Progress value={milkProgress} className="h-3 bg-primary/10" />
                  </div>

                  <div className="bg-card/50 p-4 rounded-xl border border-border">
                    <h4 className="text-sm font-medium text-foreground mb-2">Production Assessment</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {goat.milkPerDay < 1 && "Low current production. This may be expected for dry, young, or recovering goats."}
                      {goat.milkPerDay >= 1 && goat.milkPerDay < 3 && "Moderate production. Keep feed, minerals, and milking routine consistent."}
                      {goat.milkPerDay >= 3 && goat.milkPerDay < 5 && "Strong production. Monitor body condition and hydration during peak output."}
                      {goat.milkPerDay >= 5 && "High production. Prioritize nutrition, udder checks, and careful production tracking."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/10 shadow-md">
                <CardHeader>
                  <CardTitle className="font-serif text-lg">Breeding Information</CardTitle>
                </CardHeader>
                <CardContent>
                  {hasPedigree ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pedigreeRows.map((row) => (
                        <div key={row.label} className="rounded-xl border border-border bg-card/50 p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{row.label}</div>
                          <div className="font-medium text-foreground">{row.value || "Not recorded"}</div>
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
