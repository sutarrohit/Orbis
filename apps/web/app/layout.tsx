import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/providers";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: {
    default: "Orbis",
    template: "%s · Orbis"
  },
  description:
    "Orbis runs AI agents that find, engage, and convert leads across your Telegram and Discord communities.",
  applicationName: "Orbis",
  openGraph: {
    type: "website",
    siteName: "Orbis",
    title: "Orbis",
    description:
      "Orbis runs AI agents that find, engage, and convert leads across your Telegram and Discord communities."
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang='en'
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-mono", jetbrainsMono.variable)}
      suppressHydrationWarning
    >
      <body className='min-h-full flex flex-col'>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
