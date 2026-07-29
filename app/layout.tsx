import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import "./globals.css";

export const dynamic = "force-dynamic";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Spotify Library Manager",
  description: "Browse, filter, and organize your Spotify library",
};

export default async function RootLayout({
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
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-screen bg-sidebar">
        <Sidebar folders={folders ?? []} tags={tags ?? []} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-2 pl-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg bg-background">
            <SiteHeader />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
