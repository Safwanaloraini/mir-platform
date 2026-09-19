import type { Metadata } from "next";
import { Tajawal, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["200", "300", "400", "500", "700", "800", "900"],
  display: "swap",
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "مير — منصة إدارة الأعمال",
  description: "مركز إدارة موحد لتحويل القرارات إلى مهام، ومتابعة الاعتمادات والتشغيل والمالية.",
  keywords: ["مير", "إدارة الأعمال", "المهام", "الاعتمادات", "المالية"],
  authors: [{ name: "مير" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${tajawal.variable} ${ibmPlexArabic.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
