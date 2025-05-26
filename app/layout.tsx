import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ThemeProvider } from "@/components/theme-provider";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ClerkProvider } from "@clerk/nextjs";

const inter = Inter({ subsets: ["latin"] });

// Use environment variable for base URL with fallback
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'PDF Merger - Combine PDF Files Online',
    template: '%s | PDF Merger',
  },
  description: "Merge multiple PDF files into one document online. Fast, secure, and free PDF merging tool.",
  keywords: ["PDF merger", "combine PDF", "merge PDF files", "PDF tool", "online PDF merger"],
  authors: [{ name: "PDF Merger" }],
  creator: "PDF Merger",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: baseUrl,
    title: "PDF Merger - Combine PDF Files Online",
    description: "Merge multiple PDF files into one document online. Fast, secure, and free PDF merging tool.",
    siteName: "PDF Merger",
  },
  twitter: {
    card: "summary_large_image",
    title: "PDF Merger - Combine PDF Files Online",
    description: "Merge multiple PDF files into one document online. Fast, secure, and free PDF merging tool.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // Allow zooming for better accessibility
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ClerkProvider>
          <ErrorBoundary>
            <ThemeProvider>
              <div className="relative min-h-screen flex flex-col">
                <Navbar />
                <main className="flex-1">
                  {children}
                </main>
                <Footer />
              </div>
              <Toaster />
            </ThemeProvider>
          </ErrorBoundary>
        </ClerkProvider>
      </body>
    </html>
  );
}