import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sidebar",
  description:
    "Prediction markets on the sh*t your groupchat is already talking about.",
  openGraph: {
    title: "Sidebar",
    description:
      "Prediction markets on the sh*t your groupchat is already talking about.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        {/* Enabling these in the dashboard provisions the endpoints but does
            not instrument anything on Next — the tracker only loads if the
            component is mounted, which is why /_vercel/insights was being
            served to nobody. Both are cookieless, so neither needs a consent
            banner. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
