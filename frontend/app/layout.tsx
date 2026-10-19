import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Fjalla_One, PT_Serif } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FiltersProvider } from "@/lib/filters";
import { Shell } from "@/components/shell";
import "./globals.css";
import { cn } from "@/lib/utils";

const fjalla = Fjalla_One({ subsets: ['latin'], weight: '400', variable: '--font-fjalla' });
const ptserif = PT_Serif({ subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'], variable: '--font-ptserif' });

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "RiskLens | Fraud & transaction risk analytics",
  description: "Portfolio project: fraud analytics, risk scoring and model evaluation on a public synthetic transactions dataset. Historical data, not a live system.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(sans.variable, mono.variable, "font-sans", fjalla.variable, ptserif.variable)}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <TooltipProvider><FiltersProvider><Shell>{children}</Shell></FiltersProvider></TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
