import { Link } from "wouter";
import { Award, GitBranch, ClipboardList, ChevronRight, HeartPulse, Trophy, type LucideIcon } from "lucide-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

interface ReportEntry {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Registry of pre-configured farm reports. Adding a new report is a one-line
 * addition here — the hub renders a card for every entry automatically.
 */
const REPORTS: ReportEntry[] = [
  {
    href: "/reports/lineage",
    title: "Lineage Report",
    description: "Full pedigree listing for every goat in the herd, with printable output.",
    icon: GitBranch,
  },
  {
    href: "/reports/barn-worksheet",
    title: "Barn Worksheet",
    description: "Print-ready work day sheet: one row per goat with blank columns to mark off health tasks by hand.",
    icon: ClipboardList,
  },
  {
    href: "/reports/pedigree",
    title: "Pedigree Certificate",
    description: "Printable one-page pedigree for a single goat — for sales, shows, and registration paperwork.",
    icon: Award,
  },
  {
    href: "/reports/health-history",
    title: "Health History Report",
    description: "Printable health record for a single goat — ideal for providing to a buyer of an unregistered goat.",
    icon: HeartPulse,
  },
  {
    href: "/reports/show-time",
    title: "Show Time",
    description: "Print-ready show check-in sheet: one row per goat with tattoo IDs and each doe's kidding record.",
    icon: Trophy,
  },
];

export default function Reports() {
  return (
    <Layout>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Reports</h1>
        <p className="text-muted-foreground text-sm">Pre-configured reports for your herd. Pick one to view and print.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link key={report.href} href={report.href}>
              <Card className="h-full cursor-pointer border-primary/10 transition-all hover:border-primary/30 hover:shadow-md">
                <CardContent className="flex items-start gap-4 p-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-serif text-lg font-semibold text-foreground">{report.title}</h2>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </Layout>
  );
}
