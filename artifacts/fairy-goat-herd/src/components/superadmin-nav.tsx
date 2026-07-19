import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

/**
 * Tab-style navigation between the super-admin panel's sections. Rendered in
 * the header of every /superadmin page.
 */
export function SuperadminNav() {
  const [location] = useLocation();

  const tabs = [
    { href: "/superadmin/farms", label: "Farms" },
    { href: "/superadmin/users", label: "Users" },
  ];

  return (
    <nav className="flex items-center gap-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            location === tab.href
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
