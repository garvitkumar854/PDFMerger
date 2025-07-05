"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { UserButton, SignInButton, useUser } from "@clerk/nextjs";

const navItems = [
  { name: "Home", href: "/" },
  { name: "Merge PDF", href: "/merge" },
  { name: "About", href: "/about" },
  { name: "Contact", href: "/contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isSignedIn } = useUser();

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="container mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
              >
                <FileText className="h-6 w-6 text-primary" />
              </motion.div>
              <span className="font-bold text-lg sm:text-xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                PDF Merger
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center justify-center flex-1">
            <div className="flex items-center justify-center gap-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-base font-medium transition-colors hover:text-primary relative text-center w-24",
                    pathname === item.href
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  {pathname === item.href && (
                    <motion.div
                      layoutId="navbar-indicator"
                      className="absolute -bottom-[1.5px] left-0 right-0 h-0.5 bg-primary"
                      transition={{ type: "spring", duration: 0.5 }}
                    />
                  )}
                  {item.name}
                </Link>
              ))}
            </div>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <ModeToggle />
            {isSignedIn ? (
              <UserButton afterSignOutUrl="/" />
            ) : (
              <SignInButton mode="modal">
                <Button variant="outline">Sign In</Button>
              </SignInButton>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <motion.div
        initial={false}
        animate={{ height: isMenuOpen ? "auto" : 0 }}
        className="md:hidden overflow-hidden"
      >
        <nav className="container mx-auto px-3 sm:px-4 py-4 space-y-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMenuOpen(false)}
              className={cn(
                "block text-base font-medium transition-colors hover:text-primary text-center py-2",
                pathname === item.href
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </motion.div>
    </motion.header>
  );
} 