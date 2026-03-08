import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import FloatingNav from "@/components/FloatingNav";
import HydrationProvider from "@/components/HydrationProvider";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

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
        <HydrationProvider>
          {children}
        </HydrationProvider>
        <FloatingNav />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
