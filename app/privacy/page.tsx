"use client";

import { motion } from "framer-motion";
import { Shield, Database, Cookie, Eye, Lock, Sparkles, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function PrivacyPage() {
  const sections = [
    {
      icon: Database,
      title: "Information We Collect",
      description: "We collect minimal information necessary to provide our service, including:",
      items: [
        "Account information (email, name) when you sign up",
        "Usage data to improve our service",
        "PDF files that you choose to merge (processed in browser only)"
      ],
      gradient: "from-blue-500/10 to-cyan-500/10",
      iconColor: "text-blue-500"
    },
    {
      icon: Eye,
      title: "How We Use Your Information",
      description: "We use your information to:",
      items: [
        "Provide and maintain our service",
        "Improve user experience",
        "Send important updates and notifications",
        "Respond to your inquiries and support requests"
      ],
      gradient: "from-green-500/10 to-emerald-500/10",
      iconColor: "text-green-500"
    },
    {
      icon: Shield,
      title: "Data Security",
      description: "We implement appropriate security measures to protect your information:",
      items: [
        "All PDF processing is done in your browser",
        "We use secure HTTPS connections",
        "Regular security audits and updates",
        "No permanent storage of your PDF files"
      ],
      gradient: "from-purple-500/10 to-pink-500/10",
      iconColor: "text-purple-500"
    },
    {
      icon: Cookie,
      title: "Cookies and Tracking",
      description: "We use essential cookies to:",
      items: [
        "Maintain your session",
        "Remember your preferences",
        "Improve service performance"
      ],
      gradient: "from-yellow-500/10 to-orange-500/10",
      iconColor: "text-yellow-500"
    },
    {
      icon: Lock,
      title: "Your Rights",
      description: "You have the right to:",
      items: [
        "Access your personal information",
        "Request deletion of your data",
        "Opt-out of non-essential communications",
        "Export your data"
      ],
      gradient: "from-red-500/10 to-pink-500/10",
      iconColor: "text-red-500"
    }
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
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Your Privacy Matters</span>
              </motion.div>

              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
                Privacy
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  {' '}
                  Policy
                </span>
              </h1>
              
              <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-xl mx-auto">
                We are committed to protecting your privacy and ensuring the security of your data.
              </p>
              <p className="text-sm text-muted-foreground">
                Last updated: {new Date().toLocaleDateString()}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Privacy Sections */}
      <section className="py-16 sm:py-20 px-4 sm:px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="space-y-8">
            {sections.map((section, index) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="relative overflow-hidden rounded-2xl bg-card/80 backdrop-blur-sm border border-border/50 p-8 hover:border-primary/30 transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${section.gradient} flex-shrink-0`}>
                    <section.icon className={`h-6 w-6 ${section.iconColor}`} />
                  </div>
                  <div className="space-y-4 flex-1">
                    <h2 className="text-2xl font-bold text-primary">{section.title}</h2>
                    <p className="text-muted-foreground leading-relaxed">{section.description}</p>
                    <ul className="space-y-2">
                      {section.items.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-muted-foreground">
                          <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Changes to Privacy Policy */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              viewport={{ once: true }}
              className="relative overflow-hidden rounded-2xl bg-card/80 backdrop-blur-sm border border-border/50 p-8 hover:border-primary/30 transition-all duration-200"
            >
              <h2 className="text-2xl font-bold text-primary mb-4">Changes to Privacy Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this privacy policy from time to time. We will notify you of any changes
                by posting the new policy on this page and updating the &quot;Last updated&quot; date.
              </p>
            </motion.div>

            {/* Contact Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 }}
              viewport={{ once: true }}
              className="relative overflow-hidden rounded-2xl bg-card/80 backdrop-blur-sm border border-border/50 p-8 hover:border-primary/30 transition-all duration-200"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/10 to-blue-500/10 flex-shrink-0">
                  <Mail className="h-6 w-6 text-indigo-500" />
                </div>
                <div className="space-y-4 flex-1">
                  <h2 className="text-2xl font-bold text-primary">Contact Us</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    If you have any questions about this Privacy Policy, please contact us at{" "}
                    <a href="mailto:privacy@pdfmerger.com" className="text-primary hover:underline font-medium">
                      privacy@pdfmerger.com
                    </a>
                  </p>
                  <Link href="/contact">
                    <Button 
                      variant="outline"
                      className="mt-4"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Contact Support
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
} 