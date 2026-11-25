import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { THEME_COOKIE, themeAttribute } from "@/lib/theme";
import "./globals.css";

// I font stanno nel progetto (app/fonts, licenza OFL): la build non scarica nulla da Google
// Fonts e non può fallire perché quel download non riesce. File variabili, sottoinsieme latino.
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  style: "normal",
  display: "swap",
});
const interTight = localFont({
  src: "./fonts/inter-tight-latin-wght-normal.woff2",
  variable: "--font-inter-tight",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Staff Cordusio", template: "%s · Staff Cordusio" },
  description: "Portale staff Salmoiraghi & Viganò — Piazza Cordusio",
  applicationName: "Staff Cordusio",
  appleWebApp: { capable: true, title: "Staff Cordusio", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = themeAttribute((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="it" data-theme={theme} suppressHydrationWarning>
      <body className={`${inter.variable} ${interTight.variable} min-h-dvh antialiased`}>
        {children}
      </body>
    </html>
  );
}
