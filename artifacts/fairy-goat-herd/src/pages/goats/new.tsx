import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { GoatForm } from "@/components/goat-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getGetBreedBreakdownQueryKey, getGetDashboardSummaryQueryKey, getListGoatsQueryKey, useCreateGoat } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function GoatNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createGoat = useCreateGoat();

  const handleSubmit = (data: any) => {
    createGoat.mutate({ data }, {
      onSuccess: (newGoat) => {
        toast({
          title: "Goat added",
          description: `${newGoat.name} has been added to the herd.`,
        });
        queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBreedBreakdownQueryKey() });
        setLocation(`/goats/${newGoat.id}`);
      },
      onError: () => {
        toast({
          title: "Save failed",
          description: "There was an error recording this goat.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/goats")} className="text-muted-foreground hover:text-foreground -ml-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Herd
        </Button>

        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Add Goat</h2>
          <p className="text-muted-foreground">Record breed, production, health, and herd notes for a new goat.</p>
        </div>

        <Card className="border-primary/10 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-accent" />
          <CardHeader className="pb-4 pt-8">
            <CardTitle className="font-serif">Goat Record</CardTitle>
            <CardDescription>All fields are required unless marked otherwise.</CardDescription>
          </CardHeader>
          <CardContent>
            <GoatForm onSubmit={handleSubmit} isSubmitting={createGoat.isPending} />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
