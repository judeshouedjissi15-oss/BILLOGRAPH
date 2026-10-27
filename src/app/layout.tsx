import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BILLOGRAPH — Vendez vos produits numériques et physiques en Afrique francophone",
  description:
    "BILLOGRAPH est la plateforme e-commerce qui permet aux entrepreneurs du Bénin et d'Afrique francophone de créer leur boutique en ligne et de vendre ebooks, formations, logiciels et produits physiques en FCFA.",
  keywords: [
    "BILLOGRAPH",
    "e-commerce",
    "Bénin",
    "Afrique francophone",
    "produits numériques",
    "boutique en ligne",
    "FCFA",
    "Mobile Money",
  ],
  authors: [{ name: "BILLOGRAPH" }],
  openGraph: {
    title: "BILLOGRAPH — Votre boutique, vos revenus",
    description:
      "Créez votre boutique en ligne et vendez vos produits numériques et physiques en FCFA.",
    siteName: "BILLOGRAPH",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
