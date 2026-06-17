import { useLocation } from "wouter";
import { Settings, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function AdminSettings() {
  const { user: currentUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isManager = currentUser.role === "admin" || currentUser.role === "owner";

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey(), enabled: isManager },
  });
  const updateSettings = useUpdateSettings();

  // Farm Hands have no business here.
  if (!isManager) {
    setLocation("/");
    return null;
  }

  const handleToggleAi = (usesAi: boolean) => {
    updateSettings.mutate(
      { data: { usesAi } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({
            title: usesAi ? "AI breeding enabled" : "AI breeding disabled",
            description: usesAi
              ? "Artificial insemination tools are now visible across the app."
              : "AI tools are now hidden. Breedings default to natural service.",
          });
        },
        onError: () =>
          toast({
            title: "Could not save setting",
            description: "That change could not be saved.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground">Farm Settings</h2>
            <p className="text-muted-foreground">Configure how MyGoatHerd works for your farm.</p>
          </div>
        </div>

        <Card className="border-primary/10 shadow-lg">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Breeding
            </CardTitle>
            <CardDescription>
              Turn artificial insemination tools on or off for the whole farm.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-6 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <Label htmlFor="uses-ai" className="text-base font-medium">
                  This farm uses artificial insemination
                </Label>
                <p className="text-sm text-muted-foreground">
                  When off, the Semen Inventory, the Natural/AI breeding toggle, and AI-specific
                  fields and badges are hidden. Existing AI records are kept and still work.
                </p>
              </div>
              <Switch
                id="uses-ai"
                checked={settings?.usesAi ?? true}
                disabled={isLoading || updateSettings.isPending}
                onCheckedChange={handleToggleAi}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
