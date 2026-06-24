import { useEffect, useState } from "react";
import { GripVertical, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getGetSettingsQueryKey,
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
  savedLayout: DashboardWidget[] | null | undefined;
}

export function CustomizeDashboard({ open, onOpenChange, savedLayout }: CustomizeDashboardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSettings = useUpdateSettings();

  const [layout, setLayout] = useState<DashboardWidget[]>(() => resolveDashboardLayout(savedLayout));

  // Re-seed the working copy whenever the panel opens or the saved layout
  // changes, so a cancelled edit never lingers into the next open.
  useEffect(() => {
    if (open) setLayout(resolveDashboardLayout(savedLayout));
  }, [open, savedLayout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLayout((prev) => {
      const oldIndex = prev.findIndex((w) => w.id === active.id);
      const newIndex = prev.findIndex((w) => w.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const toggleVisible = (id: string, visible: boolean) => {
    setLayout((prev) => prev.map((w) => (w.id === id ? { ...w, visible } : w)));
  };

  const handleReset = () => {
    setLayout(defaultDashboardLayout());
  };

  const handleSave = () => {
    updateSettings.mutate(
      { data: { dashboardLayout: layout } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({
            title: "Dashboard saved",
            description: "Your dashboard layout has been updated for the whole farm.",
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif">Customize Dashboard</SheetTitle>
          <SheetDescription>
            Show, hide, and reorder the widgets on your herd overview. This layout applies to
            everyone on your farm.
          </SheetDescription>
        </SheetHeader>

        <div className="-mx-1 flex-1 overflow-y-auto px-1 py-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={layout.map((w) => w.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {layout.map((widget) => (
                  <SortableWidgetRow
                    key={widget.id}
                    widget={widget}
                    onToggle={toggleVisible}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:space-x-0">
          <Button variant="ghost" onClick={handleReset} disabled={updateSettings.isPending}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateSettings.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving…" : "Save layout"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SortableWidgetRow({
  widget,
  onToggle,
}: {
  widget: DashboardWidget;
  onToggle: (id: string, visible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });
  const def = getWidgetDef(widget.id);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border border-border bg-card p-3 ${
        isDragging ? "z-10 shadow-lg" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Reorder ${def?.label ?? widget.id}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
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
