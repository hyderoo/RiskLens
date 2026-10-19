import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FiltersProvider } from "@/lib/filters";
import { Shell } from "@/components/shell";
import "./globals.css";
import { cn } from "@/lib/utils";

const serif = Newsreader({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-newsreader' });

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "RiskLens | Fraud & transaction risk analytics",
  description: "Portfolio project: fraud analytics, risk scoring and model evaluation on a public synthetic transactions dataset. Historical data, not a live system.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(sans.variable, mono.variable, "font-sans", serif.variable)}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <TooltipProvider><FiltersProvider><Shell>{children}</Shell></FiltersProvider></TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
