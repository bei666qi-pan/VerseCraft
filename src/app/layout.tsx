import type { Metadata, Viewport } from "next";
import "./globals.css";
import HydrationProvider from "@/components/HydrationProvider";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { StorageDegradedBanner } from "@/components/StorageDegradedBanner";
import ChunkErrorHandler from "@/components/ChunkErrorHandler";
import { envRawFirst } from "@/lib/config/envRaw";

export const metadata: Metadata = {
  title: "文界工坊 (VerseCraft)",
  description: "锻造可能，实现幻想 - 规则怪谈文字冒险",
  metadataBase: new URL(envRawFirst(["APP_URL", "NEXT_PUBLIC_APP_URL"]) ?? "https://versecraft.cn"),
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
        className="bg-background text-foreground antialiased min-h-screen flex flex-col"
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
        <ChunkErrorHandler />
        <HydrationProvider>
          {children}
        </HydrationProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
