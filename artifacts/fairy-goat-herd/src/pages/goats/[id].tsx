import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Edit3, Trash2, ShieldAlert, Sparkles, Moon, Calendar, AlertTriangle } from "lucide-react";
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
  useGetGoat, 
  useUpdateGoat, 
  useDeleteGoat,
  getGetGoatQueryKey, 
  getListGoatsQueryKey, 
  getGetDashboardSummaryQueryKey 
} from "@workspace/api-client-react";

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
      queryKey: getGetGoatQueryKey(id) 
    } 
  });

  const updateGoat = useUpdateGoat();
  const deleteGoat = useDeleteGoat();

  const handleUpdate = (data: any) => {
    updateGoat.mutate({ id, data }, {
      onSuccess: (updatedGoat) => {
        toast({
          title: "Records updated",
          description: `${updatedGoat.name}'s documentation has been refreshed.`,
        });
        setIsEditing(false);
        queryClient.setQueryData(getGetGoatQueryKey(id), updatedGoat);
        queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
      },
      onError: () => {
        toast({
          title: "Update failed",
          description: "There was an error updating the records.",
          variant: "destructive",
        });
      }
    });
  };

  const handleDelete = () => {
    deleteGoat.mutate({ id }, {
      onSuccess: () => {
        toast({
          title: "Departure recorded",
          description: `${goat?.name} has left the sanctuary.`,
        });
        queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        setLocation("/goats");
      },
      onError: () => {
        toast({
          title: "Departure failed",
          description: "Could not remove the records.",
          variant: "destructive",
        });
        setIsDeleteDialogOpen(false);
      }
    });
  };

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Record Not Found</h2>
          <p className="text-muted-foreground mb-6">These pages of the ledger seem to be missing.</p>
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

  const elementColors = {
    fire: "bg-chart-5/20 text-chart-5 border-chart-5/30",
    water: "bg-chart-4/20 text-chart-4 border-chart-4/30",
    earth: "bg-chart-1/20 text-chart-1 border-chart-1/30",
    air: "bg-muted text-muted-foreground border-muted-foreground/30",
    light: "bg-chart-2/20 text-chart-2 border-chart-2/30",
    shadow: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  };

  const statusColors = {
    healthy: "bg-chart-1 text-primary-foreground",
    sick: "bg-destructive text-destructive-foreground",
    resting: "bg-secondary text-secondary-foreground",
    enchanted: "bg-primary text-primary-foreground",
  };

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation('/goats')}
            className="text-muted-foreground hover:text-foreground self-start -ml-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Herd
          </Button>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit3 className="mr-2 h-4 w-4" /> Edit Ledger
                </Button>
                <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="icon" className="shadow-sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="font-serif">Confirm Departure</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to remove {goat.name} from the sanctuary ledger? This action cannot be undone and their magical signature will be lost.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-6">
                      <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                      <Button variant="destructive" onClick={handleDelete} disabled={deleteGoat.isPending}>
                        {deleteGoat.isPending ? "Recording..." : "Confirm Departure"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
            {isEditing && (
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel Editing
              </Button>
            )}
          </div>
        </div>

        {isEditing ? (
          <Card className="border-primary/10 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="font-serif">Revise Records for {goat.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <GoatForm defaultValues={goat} onSubmit={handleUpdate} isSubmitting={updateGoat.isPending} />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Sidebar Details */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="overflow-hidden border-primary/10 shadow-md">
                <div className="aspect-square bg-muted/30 relative">
                  {goat.imageUrl ? (
                    <img src={goat.imageUrl} alt={goat.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                      <Sparkles className="h-16 w-16 text-primary/40 mb-4" />
                      <span className="text-sm font-medium text-primary/50 uppercase tracking-widest">No Portrait</span>
                    </div>
                  )}
                  <div className="absolute top-4 right-4">
                    <Badge className={`${statusColors[goat.status]} shadow-md px-3 py-1 text-sm`}>
                      {goat.status}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-6">
                  <h1 className="text-3xl font-serif font-bold text-foreground mb-4">{goat.name}</h1>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-border">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4" /> Element</span>
                      <Badge variant="outline" className={`${elementColors[goat.element]} capitalize font-medium`}>{goat.element}</Badge>
                    </div>
                    
                    <div className="flex justify-between items-center pb-3 border-b border-border">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm"><ShieldAlert className="h-4 w-4" /> Wing Type</span>
                      <span className="font-medium capitalize text-foreground">{goat.wingType}</span>
                    </div>
                    
                    <div className="flex justify-between items-center pb-3 border-b border-border">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm"><Calendar className="h-4 w-4" /> Age</span>
                      <span className="font-medium text-foreground">{goat.age} moons</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-primary/10 shadow-md">
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    <Moon className="h-5 w-5 text-primary" /> Magical Resonance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-sm font-medium text-muted-foreground">Current Capacity</span>
                      <span className="text-2xl font-serif font-bold text-primary">{goat.magicLevel} <span className="text-sm text-muted-foreground font-sans font-normal">/ 100</span></span>
                    </div>
                    <Progress value={goat.magicLevel} className="h-3 bg-primary/10" />
                  </div>
                  
                  <div className="bg-card/50 p-4 rounded-xl border border-border">
                    <h4 className="text-sm font-medium text-foreground mb-2">Resonance Assessment</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {goat.magicLevel < 25 && "Weak resonance. Requires careful nurturing and elemental exposure to develop."}
                      {goat.magicLevel >= 25 && goat.magicLevel < 50 && "Developing resonance. Stable enough for basic sanctuary tasks but should avoid deep magical zones."}
                      {goat.magicLevel >= 50 && goat.magicLevel < 80 && "Strong resonance. A capable member of the herd with reliable elemental manifestation."}
                      {goat.magicLevel >= 80 && "Exceptional resonance. Radiates raw magic and serves as an anchor point for the entire sanctuary."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/10 shadow-md h-full">
                <CardHeader>
                  <CardTitle className="font-serif text-lg">Keeper's Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  {goat.description ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
                      {goat.description.split('\n').map((paragraph, idx) => (
                        <p key={idx}>{paragraph}</p>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Edit3 className="h-8 w-8 text-muted-foreground/30 mb-3" />
                      <p className="italic">The ledger pages are empty for this one.</p>
                      <Button variant="link" onClick={() => setIsEditing(true)} className="mt-2 text-primary">
                        Add notes
                      </Button>
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
