import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryKey,
  getGetSettingsQueryKey,
  useUpdateDashboardLayout,
  useUpdateSettings,
  type DashboardWidget,
} from "@workspace/api-client-react";
import {
  defaultDashboardLayout,
  getWidgetDef,
  resolveDashboardLayout,
} from "@/lib/dashboard-widgets";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";

interface CustomizeDashboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The farm-wide default layout (managers can edit this). */
  farmLayout: DashboardWidget[] | null | undefined;
  /** This user's personal override, or null/undefined when they use the farm default. */
  personalLayout: DashboardWidget[] | null | undefined;
  /** Whether the current user may edit the farm-wide default. */
  isManager: boolean;
}

type Scope = "personal" | "farm";

export function CustomizeDashboard({
  open,
  onOpenChange,
  farmLayout,
  personalLayout,
  isManager,
}: CustomizeDashboardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updatePersonal = useUpdateDashboardLayout();
  const updateFarm = useUpdateSettings();

  const [scope, setScope] = useState<Scope>("personal");
  // When true the user has no personal override and follows the farm default.
  const [useFarmDefault, setUseFarmDefault] = useState(personalLayout == null);
  const [personalDraft, setPersonalDraft] = useState<DashboardWidget[]>(() =>
    resolveDashboardLayout(personalLayout ?? farmLayout),
  );
  const [farmDraft, setFarmDraft] = useState<DashboardWidget[]>(() =>
    resolveDashboardLayout(farmLayout),
  );

  // Re-seed the working copies whenever the panel opens or the saved layouts
  // change, so a cancelled edit never lingers into the next open.
  useEffect(() => {
    if (!open) return;
    setScope("personal");
    setUseFarmDefault(personalLayout == null);
    setPersonalDraft(resolveDashboardLayout(personalLayout ?? farmLayout));
    setFarmDraft(resolveDashboardLayout(farmLayout));
  }, [open, personalLayout, farmLayout]);

  const isPending = updatePersonal.isPending || updateFarm.isPending;
  const editingFarm = scope === "farm";
  const editingDisabled = editingFarm ? false : useFarmDefault;
  const draft = editingFarm ? farmDraft : personalDraft;
  const setDraft = editingFarm ? setFarmDraft : setPersonalDraft;

  const handleReset = () => {
    setDraft(defaultDashboardLayout());
  };

  const handleSave = () => {
    if (editingFarm) {
      updateFarm.mutate(
        { data: { dashboardLayout: farmDraft } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
            toast({
              title: "Farm dashboard saved",
              description: "The farm-wide default layout has been updated for everyone.",
            });
            onOpenChange(false);
          },
          onError: () =>
            toast({
              title: "Could not save layout",
              description: "Your dashboard changes could not be saved.",
              variant: "destructive",
            }),
        },
      );
      return;
    }

    updatePersonal.mutate(
      { data: { dashboardLayout: useFarmDefault ? null : personalDraft } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          toast({
            title: "Dashboard saved",
            description: useFarmDefault
              ? "Your dashboard now follows the farm's shared layout."
              : "Your personal dashboard layout has been updated.",
          });
          onOpenChange(false);
        },
        onError: () =>
          toast({
            title: "Could not save layout",
            description: "Your dashboard changes could not be saved.",
            variant: "destructive",
          }),
      },
    );
  };

  const editor = (
    <WidgetEditor draft={draft} setDraft={setDraft} disabled={editingDisabled} />
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif">Customize Dashboard</SheetTitle>
          <SheetDescription>
            Show or hide the widgets on your herd overview. Use "Edit layout" on
            the dashboard to drag and resize them.
          </SheetDescription>
        </SheetHeader>

        {isManager ? (
          <Tabs
            value={scope}
            onValueChange={(v) => setScope(v as Scope)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="personal">My dashboard</TabsTrigger>
              <TabsTrigger value="farm">Farm default</TabsTrigger>
            </TabsList>

            <TabsContent
              value="personal"
              className="flex-1 overflow-y-auto data-[state=inactive]:hidden"
            >
              <PersonalControls
                useFarmDefault={useFarmDefault}
                onToggle={setUseFarmDefault}
                disabled={isPending}
              />
              {editor}
            </TabsContent>

            <TabsContent
              value="farm"
              className="flex-1 overflow-y-auto data-[state=inactive]:hidden"
            >
              <p className="px-1 py-3 text-sm text-muted-foreground">
                This layout is the shared default for everyone on your farm who hasn't set a
                personal one.
              </p>
              {editor}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <PersonalControls
              useFarmDefault={useFarmDefault}
              onToggle={setUseFarmDefault}
              disabled={isPending}
            />
            <div className="flex-1 overflow-y-auto">{editor}</div>
          </div>
        )}

        <SheetFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:space-x-0">
          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={isPending || editingDisabled}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving…" : "Save layout"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PersonalControls({
  useFarmDefault,
  onToggle,
  disabled,
}: {
  useFarmDefault: boolean;
  onToggle: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="space-y-0.5">
        <Label htmlFor="use-farm-default" className="text-sm font-medium">
          Use the farm's shared layout
        </Label>
        <p className="text-xs text-muted-foreground">
          {useFarmDefault
            ? "You're following the farm default. Turn this off to arrange your own."
            : "You have a personal layout. Turn this on to follow the farm default instead."}
        </p>
      </div>
      <Switch
        id="use-farm-default"
        checked={useFarmDefault}
        onCheckedChange={onToggle}
        disabled={disabled}
        aria-label="Use the farm's shared layout"
      />
    </div>
  );
}

function WidgetEditor({
  draft,
  setDraft,
  disabled,
}: {
  draft: DashboardWidget[];
  setDraft: (updater: (prev: DashboardWidget[]) => DashboardWidget[]) => void;
  disabled: boolean;
}) {
  const toggleVisible = (id: string, visible: boolean) => {
    setDraft((prev) => prev.map((w) => (w.id === id ? { ...w, visible } : w)));
  };

  return (
    <div
      className={`-mx-1 px-1 py-4 ${disabled ? "pointer-events-none opacity-50" : ""}`}
      aria-disabled={disabled}
    >
      <ul className="space-y-2">
        {draft.map((widget) => (
          <WidgetRow key={widget.id} widget={widget} onToggle={toggleVisible} />
        ))}
      </ul>
    </div>
  );
}

function WidgetRow({
  widget,
  onToggle,
}: {
  widget: DashboardWidget;
  onToggle: (id: string, visible: boolean) => void;
}) {
  const def = getWidgetDef(widget.id);

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{def?.label ?? widget.id}</p>
        {def?.description && (
          <p className="text-xs text-muted-foreground">{def.description}</p>
        )}
      </div>
      <Switch
        checked={widget.visible}
        onCheckedChange={(checked) => onToggle(widget.id, checked)}
        aria-label={`Toggle ${def?.label ?? widget.id}`}
      />
    </li>
  );
}
