"use client";

import { motion } from "framer-motion";
import { FileText, Shield, AlertCircle, Clock, Sparkles, Mail, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function TermsPage() {
  const sections = [
    {
      icon: CheckCircle,
      title: "Acceptance of Terms",
      description: "By accessing and using PDF Merger, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this service.",
      gradient: "from-green-500/10 to-emerald-500/10",
      iconColor: "text-green-500"
    },
    {
      icon: FileText,
      title: "Service Description",
      description: "PDF Merger provides a web-based service for merging PDF documents. The service is provided &quot;as is&quot; and we make no warranties, expressed or implied, regarding the operation of the service or the information, content, or materials included.",
      gradient: "from-blue-500/10 to-cyan-500/10",
      iconColor: "text-blue-500"
    },
    {
      icon: Shield,
      title: "User Responsibilities",
      description: "You are responsible for ensuring you have the right to use and merge the PDF files you upload to our service. You must not use the service for any illegal purposes or to violate any laws.",
      items: [
        "Ensure you have rights to use uploaded PDF files",
        "Not use the service for illegal purposes",
        "Maintain confidentiality of account information"
      ],
      gradient: "from-purple-500/10 to-pink-500/10",
      iconColor: "text-purple-500"
    },
    {
      icon: FileText,
      title: "Data Processing",
      description: "All PDF processing is done in your browser. We do not store your files on our servers. However, we may temporarily process your files in memory to provide the merging service.",
      gradient: "from-indigo-500/10 to-blue-500/10",
      iconColor: "text-indigo-500"
    },
    {
      icon: Clock,
      title: "Service Limitations",
      description: "We reserve the right to limit the number of files that can be merged in a single session. We may impose restrictions on file sizes and types to ensure optimal service performance.",
      gradient: "from-yellow-500/10 to-orange-500/10",
      iconColor: "text-yellow-500"
    },
    {
      icon: AlertCircle,
      title: "Changes to Terms",
      description: "We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the new Terms of Service on this page.",
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
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Terms & Conditions</span>
              </motion.div>

              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
                Terms of
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  {' '}
                  Service
                </span>
              </h1>
              
              <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-xl mx-auto">
                Please read these terms carefully before using our PDF merger service.
              </p>
              <p className="text-sm text-muted-foreground">
                Last updated: {new Date().toLocaleDateString()}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Terms Sections */}
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
                    {section.items && (
                      <ul className="space-y-2">
                        {section.items.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-muted-foreground">
                            <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

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
                  <h2 className="text-2xl font-bold text-primary">Contact Information</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    If you have any questions about these Terms of Service, please contact us at{" "}
                    <a href="mailto:support@pdfmerger.com" className="text-primary hover:underline font-medium">
                      support@pdfmerger.com
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