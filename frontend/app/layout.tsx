import type { Metadata } from "next";
import { Fraunces, Schibsted_Grotesk } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FiltersProvider } from "@/lib/filters";
import { Shell } from "@/components/shell";
import "./globals.css";
import { cn } from "@/lib/utils";

const display = Fraunces({ subsets: ['latin'], axes: ['opsz', 'SOFT'], style: ['normal', 'italic'], variable: '--font-display' });
const ui = Schibsted_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-ui' });


export const metadata: Metadata = {
  title: "RiskLens | Fraud & transaction risk analytics",
  description: "Portfolio project: fraud analytics, risk scoring and model evaluation on a public synthetic transactions dataset. Historical data, not a live system.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", display.variable, ui.variable)}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <TooltipProvider><FiltersProvider><Shell>{children}</Shell></FiltersProvider></TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
