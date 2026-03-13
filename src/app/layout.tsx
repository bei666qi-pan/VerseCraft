import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import HydrationProvider from "@/components/HydrationProvider";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { StorageDegradedBanner } from "@/components/StorageDegradedBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "文界工坊 (VerseCraft)",
  description: "锻造可能，实现幻想 - 规则怪谈文字冒险",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-background text-foreground antialiased min-h-screen flex flex-col`}
      >
        <svg aria-hidden className="absolute size-0 overflow-hidden" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="liquid-glass-refract" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
        <StorageDegradedBanner />
        <HydrationProvider>
          {children}
        </HydrationProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
