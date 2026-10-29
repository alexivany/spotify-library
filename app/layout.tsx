import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Keep font downloads out of builds; see fonts/README.md for sources and licenses.
const inter = localFont({
  src: "./fonts/Inter-Variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

const outfit = localFont({
  src: "./fonts/Outfit-Variable.woff2",
  variable: "--font-outfit",
  weight: "500 800",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spotify Library Manager",
  description: "Browse, filter, and organize your Spotify library",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="h-full min-h-screen bg-sidebar">{children}</body>
    </html>
  );
}
