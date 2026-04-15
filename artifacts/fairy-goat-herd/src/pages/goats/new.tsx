import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { GoatForm } from "@/components/goat-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCreateGoat } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListGoatsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";

export default function GoatNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createGoat = useCreateGoat();

  const handleSubmit = (data: any) => {
    createGoat.mutate({ data }, {
      onSuccess: (newGoat) => {
        toast({
          title: "A new presence is felt!",
          description: `${newGoat.name} has joined the sanctuary.`,
        });
        
        // Invalidate lists to show new goat
        queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        
        setLocation(`/goats/${newGoat.id}`);
      },
      onError: () => {
        toast({
          title: "The summoning failed",
          description: "There was an error recording this new goat.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setLocation('/goats')}
          className="text-muted-foreground hover:text-foreground -ml-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Herd
        </Button>

        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Record New Enchantment</h2>
          <p className="text-muted-foreground">Carefully document the attributes of your newest fairy goat.</p>
        </div>

        <Card className="border-primary/10 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-accent" />
          <CardHeader className="pb-4 pt-8">
            <CardTitle className="font-serif">Vital Characteristics</CardTitle>
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
