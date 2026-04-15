import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BookOpen, Sparkles, Sprout, List, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Sanctuary", icon: BookOpen },
    { href: "/goats", label: "The Herd", icon: List },
    { href: "/goats/new", label: "New Enchantment", icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-sidebar text-sidebar-foreground flex-shrink-0 border-r border-sidebar-border shadow-xl z-10 relative">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shadow-inner">
              <Sprout className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-serif font-semibold text-lg text-sidebar-foreground">Fairy Goat</h1>
              <p className="text-xs text-sidebar-primary font-medium tracking-wider uppercase">Sanctuary</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium",
                    isActive 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md" 
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="mt-auto p-6">
          <div className="rounded-xl bg-sidebar-accent/50 p-4 border border-sidebar-accent border-dashed">
            <h3 className="font-serif text-sm font-medium text-sidebar-primary mb-1">Keeper's Note</h3>
            <p className="text-xs text-sidebar-foreground/70 leading-relaxed">
              Remember to offer fresh moon-dew to the shadow elementals before midnight.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-12 relative z-0">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
