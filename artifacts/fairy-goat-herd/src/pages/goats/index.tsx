import { useState } from "react";
import { Link } from "wouter";
import { Plus, Search, Filter } from "lucide-react";
import { useListGoats, getListGoatsQueryKey } from "@workspace/api-client-react";
import type { Goat, ListGoatsElement, ListGoatsStatus } from "@workspace/api-client-react/src/generated/api.schemas";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { GoatCard } from "@/components/goat-card";

export default function GoatsList() {
  const [statusFilter, setStatusFilter] = useState<ListGoatsStatus | undefined>();
  const [elementFilter, setElementFilter] = useState<ListGoatsElement | undefined>();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: goats, isLoading } = useListGoats(
    { status: statusFilter, element: elementFilter },
    { query: { queryKey: getListGoatsQueryKey({ status: statusFilter, element: elementFilter }) } }
  );

  const filteredGoats = goats?.filter(goat => 
    searchQuery === "" || goat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground mb-2">The Herd</h2>
            <p className="text-muted-foreground">Manage and observe your enchanted companions.</p>
          </div>
          <Link href="/goats/new">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
              <Plus className="mr-2 h-4 w-4" />
              New Enchantment
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name..." 
              className="pl-9 bg-background/50 border-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Select 
              value={elementFilter || "all"} 
              onValueChange={(val) => setElementFilter(val === "all" ? undefined : val as ListGoatsElement)}
            >
              <SelectTrigger className="w-[140px] bg-background/50 border-input">
                <SelectValue placeholder="Element" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Elements</SelectItem>
                <SelectItem value="fire">Fire</SelectItem>
                <SelectItem value="water">Water</SelectItem>
                <SelectItem value="earth">Earth</SelectItem>
                <SelectItem value="air">Air</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="shadow">Shadow</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={statusFilter || "all"} 
              onValueChange={(val) => setStatusFilter(val === "all" ? undefined : val as ListGoatsStatus)}
            >
              <SelectTrigger className="w-[140px] bg-background/50 border-input">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="healthy">Healthy</SelectItem>
                <SelectItem value="sick">Sick</SelectItem>
                <SelectItem value="resting">Resting</SelectItem>
                <SelectItem value="enchanted">Enchanted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="flex flex-col gap-2 bg-card rounded-xl p-4 border border-border">
                <Skeleton className="h-48 w-full rounded-lg" />
                <Skeleton className="h-6 w-3/4 mt-4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex gap-2 mt-4">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredGoats && filteredGoats.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredGoats.map((goat, i) => (
              <div key={goat.id} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 50}ms` }}>
                <GoatCard goat={goat} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-card/50 rounded-xl border border-dashed border-primary/20">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Filter className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No goats found</h3>
            <p className="text-muted-foreground max-w-md">
              We couldn't find any fairy goats matching your current filters. Try adjusting them or add a new goat to the herd.
            </p>
            <Button 
              variant="outline" 
              className="mt-6"
              onClick={() => {
                setSearchQuery("");
                setElementFilter(undefined);
                setStatusFilter(undefined);
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
