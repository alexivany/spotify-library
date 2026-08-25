import { Sidebar } from "@/components/sidebar";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// The authenticated app chrome. Lives in a route group so /login (outside the
// group) renders on the bare root layout without the sidebar — which would
// otherwise leak folder and tag names to an unauthenticated visitor.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = getSupabaseServerClient();
  const [{ data: folders }, { data: tags }] = await Promise.all([
    supabase.from("folders").select("id,name").order("name"),
    supabase.from("tags").select("id,name").order("name"),
  ]);

  return (
    <div className="flex h-full min-h-screen bg-sidebar">
      <Sidebar folders={folders ?? []} tags={tags ?? []} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:p-2 md:pl-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background md:rounded-lg">
          <SiteHeader folders={folders ?? []} tags={tags ?? []} />
          {children}
        </div>
      </div>
    </div>
  );
}
