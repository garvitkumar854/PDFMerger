"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";

const footerLinks = [
  { name: "Terms", href: "/terms" },
  { name: "Privacy", href: "/privacy" },
  { name: "About", href: "/about" },
  { name: "Contact", href: "/contact" },
];

export default function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center py-4">
          {/* Logo */}
          <div className="flex items-center justify-center mb-3">
            <Link href="/" className="flex items-center gap-2">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
              >
                <FileText className="h-4 w-4 text-primary" />
              </motion.div>
              <span className="font-bold text-base bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                PDF Merger
              </span>
            </Link>
          </div>

          {/* Links */}
          <div className="flex items-center justify-center mb-3">
            <nav className="flex items-center justify-center gap-6">
              {footerLinks.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors text-center"
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>

          {/* Copyright */}
          <div className="flex items-center justify-center">
            <p className="text-xs text-muted-foreground text-center">
              © {new Date().getFullYear()} PDF Merger. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
} 