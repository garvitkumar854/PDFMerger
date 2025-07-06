"use client";

import ContactForm from "@/components/ContactForm";
import { motion } from "framer-motion";
import { Mail, MessageSquare, Phone, MapPin, Sparkles, Send } from "lucide-react";

export default function ContactPage() {
  const contactInfo = [
    {
      icon: Mail,
      title: "Email Us",
      description: "Send us an email anytime",
      value: "support@pdfmerger.com",
      gradient: "from-blue-500/10 to-cyan-500/10",
      iconColor: "text-blue-500"
    },
    {
      icon: MessageSquare,
      title: "Live Chat",
      description: "Get instant help",
      value: "Available 24/7",
      gradient: "from-green-500/10 to-emerald-500/10",
      iconColor: "text-green-500"
    },
    {
      icon: Phone,
      title: "Call Us",
      description: "Speak with our team",
      value: "+1 (555) 123-4567",
      gradient: "from-purple-500/10 to-pink-500/10",
      iconColor: "text-purple-500"
    },
    {
      icon: MapPin,
      title: "Office",
      description: "Visit our headquarters",
      value: "San Francisco, CA",
      gradient: "from-orange-500/10 to-red-500/10",
      iconColor: "text-orange-500"
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
                <span className="text-sm font-medium text-primary">Get In Touch</span>
              </motion.div>

              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
                Contact
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  {' '}
                  Us
                </span>
              </h1>
              
              <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-xl mx-auto">
                Have a question or need help? We&apos;re here to assist you with any inquiries about our PDF merger tool.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Contact Info Section */}
      <section className="py-16 sm:py-20 px-4 sm:px-6">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16"
          >
            {contactInfo.map((info, index) => (
              <motion.div
                key={info.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{
                  y: -3,
                  transition: { duration: 0.15 }
                }}
                className="relative group"
              >
                <div className="p-6 space-y-4 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl hover:border-primary/30 transition-all duration-200 hover:shadow-lg text-center">
                  <div className={`p-3 w-fit rounded-xl bg-gradient-to-br ${info.gradient} group-hover:scale-105 transition-transform duration-150 mx-auto`}>
                    <info.icon className={`h-6 w-6 ${info.iconColor}`} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold group-hover:text-primary transition-colors duration-150">{info.title}</h3>
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                    <p className="text-sm font-medium">{info.value}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-muted/20">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6"
            >
              <Send className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Send us a message</span>
            </motion.div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Let&apos;s Start a
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> Conversation</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Fill out the form below and we&apos;ll get back to you as soon as possible. 
              We typically respond within 24 hours.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-2xl bg-card/80 backdrop-blur-sm border border-border/50 p-8 sm:p-12"
          >
            <ContactForm />
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 sm:py-20 px-4 sm:px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Frequently Asked
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> Questions</span>
            </h2>
            <p className="text-lg text-muted-foreground">
              Find quick answers to common questions about our PDF merger tool.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            {[
              {
                question: "How secure is my data?",
                answer: "Your files are processed entirely in your browser and never uploaded to our servers. We use client-side processing to ensure maximum privacy and security."
              },
              {
                question: "What file formats are supported?",
                answer: "We support PDF files for merging. You can upload multiple PDF files and combine them into a single document."
              },
              {
                question: "Is there a file size limit?",
                answer: "There are no file size limits. However, very large files may take longer to process depending on your device&apos;s performance."
              },
              {
                question: "Can I reorder pages before merging?",
                answer: "Yes! You can drag and drop to reorder pages before merging. You can also rotate pages and preview them before finalizing."
              },
              {
                question: "Is this service really free?",
                answer: "Yes, our PDF merger is completely free to use with no hidden costs, watermarks, or limitations."
              }
            ].map((faq, index) => (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="p-6 bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl hover:border-primary/30 transition-all duration-200"
              >
                <h3 className="text-lg font-bold mb-2 text-primary">{faq.question}</h3>
                <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
    </div>
  );
} 