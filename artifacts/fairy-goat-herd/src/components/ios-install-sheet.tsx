import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { GoatIcon } from "@/components/goat-icon";

interface IosInstallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Step-by-step instructions for iOS Safari's Add to Home Screen flow. */
export function IosInstallSheet({ open, onOpenChange }: IosInstallSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        <SheetHeader className="text-left mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shadow-inner flex-shrink-0">
              <GoatIcon className="h-6 w-6" />
            </div>
            <SheetTitle className="font-serif text-xl">Add to Home Screen</SheetTitle>
          </div>
          <SheetDescription>
            Install MyGoatHerd for quick access — no App Store needed.
          </SheetDescription>
        </SheetHeader>

        <ol className="space-y-4">
          <li className="flex items-start gap-4">
            <span className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center">
              1
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Tap the Share button</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Find the{" "}
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  {/* Share icon SVG inline so it renders without a dependency */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-label="Share"
                  >
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                  Share
                </span>{" "}
                icon in the Safari toolbar at the bottom of the screen.
              </p>
            </div>
          </li>

          <li className="flex items-start gap-4">
            <span className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center">
              2
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Scroll and tap "Add to Home Screen"</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                In the share sheet that opens, scroll down and tap{" "}
                <span className="font-medium text-foreground">Add to Home Screen</span>.
              </p>
            </div>
          </li>

          <li className="flex items-start gap-4">
            <span className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center">
              3
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Tap "Add"</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Confirm the name and tap <span className="font-medium text-foreground">Add</span>{" "}
                in the top-right corner. The app icon will appear on your home screen.
              </p>
            </div>
          </li>
        </ol>
      </SheetContent>
    </Sheet>
  );
}
