"use client";

import { motion } from "framer-motion";
import { FileText, Shield, Zap, Users, Code, Heart, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AboutPage() {
  const features = [
    {
      icon: FileText,
      title: "PDF Merging Made Simple",
      description: "Our intuitive interface makes merging PDFs as easy as drag and drop. No technical knowledge required.",
      gradient: "from-blue-500/10 to-cyan-500/10",
      iconColor: "text-blue-500"
    },
    {
      icon: Shield,
      title: "Privacy First",
      description: "Your files never leave your browser. We process everything locally to ensure maximum security.",
      gradient: "from-green-500/10 to-emerald-500/10",
      iconColor: "text-green-500"
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Built with modern technology to handle your PDFs quickly and efficiently.",
      gradient: "from-yellow-500/10 to-orange-500/10",
      iconColor: "text-yellow-500"
    },
    {
      icon: Users,
      title: "User-Centric Design",
      description: "Every feature is designed with our users in mind, making the experience smooth and enjoyable.",
      gradient: "from-purple-500/10 to-pink-500/10",
      iconColor: "text-purple-500"
    },
    {
      icon: Code,
      title: "Open Source",
      description: "Our code is open source, allowing for transparency and community contributions.",
      gradient: "from-indigo-500/10 to-blue-500/10",
      iconColor: "text-indigo-500"
    },
    {
      icon: Heart,
      title: "Made with Love",
      description: "We're passionate about creating tools that make your life easier.",
      gradient: "from-red-500/10 to-pink-500/10",
      iconColor: "text-red-500"
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-background pt-24 md:pt-32 pb-16">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle at center, rgba(var(--primary-rgb), 0.05) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="space-y-6"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20"
              >
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">About Our Mission</span>
              </motion.div>

              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
                About
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  {' '}
                  PDF Merger
                </span>
              </h1>
              
              <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-xl mx-auto">
                A modern solution for combining PDF files, built with simplicity and security in mind.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="py-16 sm:py-20 px-4 sm:px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-2xl bg-card/80 backdrop-blur-sm border border-border/50 p-8 sm:p-12"
          >
            <h2 className="text-3xl font-bold mb-6">
              Our
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> Mission</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              We believe that managing PDF documents should be simple and accessible to everyone. 
              Our mission is to provide a secure, fast, and user-friendly tool that makes PDF merging 
              effortless while maintaining the highest standards of privacy and security.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-muted/20">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Why Choose
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> Our Tool?</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Discover what makes our PDF merger the best choice for your document needs.
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{
                  y: -3,
                  transition: { duration: 0.15 }
                }}
                className="relative group"
              >
                <div className="p-6 space-y-5 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl hover:border-primary/30 transition-all duration-200 hover:shadow-lg">
                  <div className={`p-3 w-fit rounded-xl bg-gradient-to-br ${feature.gradient} group-hover:scale-105 transition-transform duration-150`}>
                    <feature.icon className={`h-6 w-6 ${feature.iconColor}`} />
                  </div>
                  <h3 className="text-xl font-bold group-hover:text-primary transition-colors duration-150">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="py-16 sm:py-20 px-4 sm:px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-2xl bg-card/80 backdrop-blur-sm border border-border/50 p-8 sm:p-12"
          >
            <h2 className="text-3xl font-bold mb-8">
              Built with
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> Modern Technology</span>
            </h2>
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-primary">Frontend</h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    Next.js 14 with App Router
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    React with TypeScript
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    Tailwind CSS for styling
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    Framer Motion for animations
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4 text-primary">Features</h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    PDF.js for PDF processing
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    Client-side PDF merging
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    Dark mode support
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    Responsive design
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-muted/20">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <h2 className="text-3xl sm:text-4xl font-bold">
              Ready to
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> Try It Out?</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Experience the simplicity of PDF Merger for yourself.
            </p>
            <Link href="/merge">
              <Button 
                size="lg" 
                className="group h-12 px-8 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
              >
                <span className="flex items-center gap-2">
                  Start Merging PDFs
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  );
} 