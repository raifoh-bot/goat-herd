import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Settings, Zap, Home, Scale, CalendarClock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_FARM_NAME,
  DEFAULT_GESTATION_DAYS,
  type WeightUnit,
} from "@/lib/settings";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const [farmName, setFarmName] = useState("");
  const [gestationDays, setGestationDays] = useState("");

  // Keep the editable fields in sync once the saved settings load in.
  useEffect(() => {
    if (settings) {
      setFarmName(settings.farmName ?? DEFAULT_FARM_NAME);
      setGestationDays(String(settings.gestationDays ?? DEFAULT_GESTATION_DAYS));
    }
  }, [settings]);

  // Farm Hands have no business here.
  if (!isManager) {
    setLocation("/");
    return null;
  }

  const busy = isLoading || updateSettings.isPending;

  const save = (
    data: Parameters<typeof updateSettings.mutate>[0]["data"],
    { title, description }: { title: string; description: string },
  ) => {
    updateSettings.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title, description });
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

  const handleToggleAi = (usesAi: boolean) => {
    save(
      { usesAi },
      {
        title: usesAi ? "AI breeding enabled" : "AI breeding disabled",
        description: usesAi
          ? "Artificial insemination tools are now visible across the app."
          : "AI tools are now hidden. Breedings default to natural service.",
      },
    );
  };

  const handleSaveFarmName = () => {
    const trimmed = farmName.trim();
    if (!trimmed) {
      toast({
        title: "Enter a farm name",
        description: "The farm name cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    save(
      { farmName: trimmed },
      { title: "Farm name saved", description: `Your herd is now shown as "${trimmed}".` },
    );
  };

  const handleSelectWeightUnit = (weightUnit: WeightUnit) => {
    save(
      { weightUnit },
      {
        title: "Weight unit saved",
        description:
          weightUnit === "kg"
            ? "Weights are now shown in kilograms."
            : "Weights are now shown in pounds.",
      },
    );
  };

  const handleSaveGestation = () => {
    const days = Number(gestationDays);
    if (!Number.isInteger(days) || days < 100 || days > 250) {
      toast({
        title: "Check the gestation length",
        description: "Enter a whole number of days between 100 and 250.",
        variant: "destructive",
      });
      return;
    }
    save(
      { gestationDays: days },
      {
        title: "Gestation length saved",
        description: `Expected kidding dates now use ${days} days.`,
      },
    );
  };

  const currentWeightUnit: WeightUnit =
    (settings?.weightUnit as WeightUnit) ?? "lb";

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
              <Home className="h-4 w-4 text-primary" /> Farm
            </CardTitle>
            <CardDescription>The name shown in the app header and branding.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 rounded-lg border border-border p-4">
              <Label htmlFor="farm-name" className="text-base font-medium">
                Farm / herd name
              </Label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  id="farm-name"
                  value={farmName}
                  disabled={busy}
                  maxLength={100}
                  placeholder={DEFAULT_FARM_NAME}
                  onChange={(e) => setFarmName(e.target.value)}
                  className="bg-background/50 sm:max-w-sm"
                />
                <Button
                  onClick={handleSaveFarmName}
                  disabled={busy || farmName.trim() === (settings?.farmName ?? "")}
                >
                  Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/10 shadow-lg">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" /> Units
            </CardTitle>
            <CardDescription>
              The unit used for birth weights and milk production across the app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-6 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <Label htmlFor="weight-unit" className="text-base font-medium">
                  Weight unit
                </Label>
                <p className="text-sm text-muted-foreground">
                  Existing values are not converted — only the label shown next to them changes.
                </p>
              </div>
              <Select
                value={currentWeightUnit}
                disabled={busy}
                onValueChange={(v) => handleSelectWeightUnit(v as WeightUnit)}
              >
                <SelectTrigger id="weight-unit" className="w-40 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lb">Pounds (lbs)</SelectItem>
                  <SelectItem value="kg">Kilograms (kg)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/10 shadow-lg">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" /> Breeding
            </CardTitle>
            <CardDescription>
              Defaults that drive the breeding workflow for the whole farm.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-lg border border-border p-4">
              <Label htmlFor="gestation-days" className="text-base font-medium">
                Default gestation length (days)
              </Label>
              <p className="text-sm text-muted-foreground">
                Used to auto-calculate the expected kidding date when recording a breeding.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  id="gestation-days"
                  type="number"
                  min={100}
                  max={250}
                  step={1}
                  value={gestationDays}
                  disabled={busy}
                  onChange={(e) => setGestationDays(e.target.value)}
                  className="bg-background/50 sm:max-w-[160px]"
                />
                <Button
                  onClick={handleSaveGestation}
                  disabled={busy || gestationDays === String(settings?.gestationDays ?? "")}
                >
                  Save
                </Button>
              </div>
            </div>

            <div className="flex items-start justify-between gap-6 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <Label htmlFor="uses-ai" className="text-base font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> This farm uses artificial insemination
                </Label>
                <p className="text-sm text-muted-foreground">
                  When off, the Semen Inventory, the Natural/AI breeding toggle, and AI-specific
                  fields and badges are hidden. Existing AI records are kept and still work.
                </p>
              </div>
              <Switch
                id="uses-ai"
                checked={settings?.usesAi ?? true}
                disabled={busy}
                onCheckedChange={handleToggleAi}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
