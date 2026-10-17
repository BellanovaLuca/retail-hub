import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE, themeAttribute } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
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
