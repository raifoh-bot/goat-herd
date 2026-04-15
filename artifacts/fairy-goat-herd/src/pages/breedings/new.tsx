import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListBreedingsQueryKey,
  getListGoatsQueryKey,
  useCreateBreeding,
  useListGoats,
} from "@workspace/api-client-react";

const formSchema = z.object({
  doeId: z.coerce.number().int().positive("Please select a doe"),
  sireName: z.string().min(1, "Sire name is required"),
  breedingDate: z.string().min(1, "Breeding date is required"),
  expectedKiddingDate: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function BreedingNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBreeding = useCreateBreeding();

  const { data: goats } = useListGoats(
    {},
    { query: { queryKey: getListGoatsQueryKey() } }
  );

  const does = goats?.filter((g) => g.lactationStatus !== "kid") ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sireName: "",
      breedingDate: new Date().toISOString().slice(0, 10),
      expectedKiddingDate: "",
      notes: "",
    },
  });

  const breedingDate = form.watch("breedingDate");

  const computedExpected = (() => {
    if (!breedingDate) return "";
    const d = new Date(breedingDate);
    d.setDate(d.getDate() + 150);
    return d.toISOString().slice(0, 10);
  })();

  const handleSubmit = (data: FormValues) => {
    createBreeding.mutate(
      {
        data: {
          doeId: data.doeId,
          sireName: data.sireName,
          breedingDate: new Date(data.breedingDate).toISOString(),
          expectedKiddingDate: data.expectedKiddingDate
            ? new Date(data.expectedKiddingDate).toISOString()
            : undefined,
          notes: data.notes,
        },
      },
      {
        onSuccess: (breeding) => {
          toast({ title: "Breeding recorded", description: `Breeding has been saved.` });
          queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
          setLocation(`/breedings/${breeding.id}`);
        },
        onError: () => {
          toast({ title: "Save failed", description: "There was an error saving the breeding record.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/breedings")} className="text-muted-foreground hover:text-foreground -ml-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Breedings
        </Button>

        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Record Breeding</h2>
          <p className="text-muted-foreground">Log a doe being bred to a buck. The doe's lactation status will automatically update to pregnant.</p>
        </div>

        <Card className="border-primary/10 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-accent" />
          <CardHeader className="pb-4 pt-8">
            <CardTitle className="font-serif">Breeding Details</CardTitle>
            <CardDescription>Select the doe and enter information about the buck and breeding date.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="doeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Doe</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v, 10))} value={field.value?.toString() ?? ""}>
                          <FormControl>
                            <SelectTrigger className="bg-background/50">
                              <SelectValue placeholder="Select a doe from your herd" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {does.length === 0 ? (
                              <SelectItem value="0" disabled>No does available — add one first</SelectItem>
                            ) : (
                              does.map((g) => (
                                <SelectItem key={g.id} value={g.id.toString()}>
                                  {g.name} ({g.breed})
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sireName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sire (Buck)</FormLabel>
                        <FormControl>
                          <Input placeholder="Buck's name or registration" {...field} className="bg-background/50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="breedingDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Breeding Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="bg-background/50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expectedKiddingDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Kidding Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            placeholder={computedExpected}
                            className="bg-background/50"
                          />
                        </FormControl>
                        <FormDescription>
                          {computedExpected ? `~150 days after breeding: ${new Date(computedExpected + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : "Leave blank to auto-calculate"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Breeding method, buck's registry info, observations..." className="resize-none bg-background/50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Button type="submit" disabled={createBreeding.isPending} size="lg" className="min-w-[200px] shadow-md">
                    {createBreeding.isPending ? "Saving..." : "Record Breeding"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
