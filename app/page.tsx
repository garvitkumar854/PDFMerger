"use client";

import { Hero } from "@/components/hero";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Shield, Zap, CheckCircle, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Hero />

      {/* Features Section */}
      <section className="py-12 sm:py-24 px-3 sm:px-4">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Why Choose Our PDF Merger?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Experience the most intuitive and powerful PDF merging tool available online
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {[
              {
                icon: Zap,
                title: "Lightning Fast",
                description: "Merge your PDFs in seconds with our optimized processing engine",
                features: ["Client-side processing", "Instant preview", "Quick downloads"],
              },
              {
                icon: Shield,
                title: "Secure & Private",
                description: "Your files are processed locally and never stored on our servers",
                features: ["No file uploads", "End-to-end encryption", "GDPR compliant"],
              },
              {
                icon: FileText,
                title: "Advanced Features",
                description: "Powerful tools to handle your PDF needs",
                features: ["Page reordering", "Rotation support", "Preview thumbnails"],
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="relative group"
              >
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-primary/10 to-transparent -z-10 group-hover:from-primary/20 transition-colors" />
                <div className="p-6 sm:p-8 space-y-4 sm:space-y-6">
                  <div className="p-3 w-fit rounded-2xl bg-primary/10">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                  <ul className="space-y-3">
                    {feature.features.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-24 px-3 sm:px-4 bg-muted/30">
        <div className="container mx-auto">
                      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 sm:p-8 md:p-12">
            <div className="absolute inset-0 bg-grid-white/10" />
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="max-w-2xl space-y-4">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">Ready to merge your PDFs?</h2>
                <p className="text-muted-foreground text-lg">
                  Start combining your PDF files now with our easy-to-use tool.
                  No registration required.
                </p>
              </div>
              <Link href="/merge">
                <Button size="lg" className="group h-12 px-8 text-lg">
                  Start Merging
                  <ArrowUpRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}