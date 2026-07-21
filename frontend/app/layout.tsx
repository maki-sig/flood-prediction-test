import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { cn } from "@/lib/utils";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FloodVisor",
  description: "ML-powered flood prediction platform for Villa Karangahan Subd., Philippines. Real-time XGBoost probability forecasts, 72-hour telemetry timelines, and interactive cartographic risk maps.",
  keywords: ["flood prediction", "Villa Karangahan Subd.", "machine learning", "XGBoost", "Philippines", "disaster preparedness", "FloodVisor"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={cn("h-full", "antialiased", jetBrainsMono.variable, plusJakartaSans.variable, "font-sans")}>
      <body className="min-h-full flex flex-col">
        <script
          // Initialize theme as early as possible to avoid flash
          dangerouslySetInnerHTML={{
            __html: `(function(){try{const t=localStorage.getItem('theme');const m=window.matchMedia('(prefers-color-scheme: dark)').matches;const apply=(theme)=>{const isDark=theme==='dark'||((theme!=='light'&&theme!=='dark')&&m);if(isDark)document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');const applied=(theme==='dark'||theme==='light')?theme:(m?'dark':'light');document.documentElement.setAttribute('data-theme',applied);};apply(t);window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').addEventListener&&window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(){const current=localStorage.getItem('theme');if(current!=='dark'&&current!=='light')apply(null);});}catch(e){}})();`,
          }}
        />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
