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

const baseUrl = "https://pdf-merger.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'PDF Merger - Combine PDF Files Online',
    template: '%s | PDF Merger',
  },
  description: "Merge multiple PDF files into one document online. Fast, secure, and free PDF merging tool.",
  keywords: ["PDF merger", "combine PDF", "merge PDF files", "PDF tool", "online PDF merger"],
  authors: [{ name: "Your Name" }],
  creator: "Your Name",
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
    creator: "@yourusername",
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
  verification: {
    google: "your-google-site-verification",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
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