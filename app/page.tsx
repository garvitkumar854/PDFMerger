"use client";

import { Hero } from "@/components/hero";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Shield, Zap, CheckCircle, ArrowUpRight, Sparkles, Users, Clock, Star } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// Enhanced animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 20
    }
  }
};

const floatingVariants = {
  animate: {
    y: [-10, 10, -10],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen overflow-hidden">
      <Hero />

      {/* Enhanced Features Section */}
      <section className="py-16 sm:py-32 px-4 sm:px-6 relative">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl"
          />
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="absolute bottom-20 right-10 w-96 h-96 bg-primary/3 rounded-full blur-3xl"
          />
        </div>

        <div className="container mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Why Choose Our PDF Merger?</span>
            </motion.div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
              Experience the Future of
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> PDF Merging</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Discover the most intuitive and powerful PDF merging tool available online. 
              Built with cutting-edge technology for the best user experience.
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12"
          >
            {[
              {
                icon: Zap,
                title: "Lightning Fast",
                description: "Merge your PDFs in seconds with our optimized processing engine",
                features: ["Client-side processing", "Instant preview", "Quick downloads"],
                gradient: "from-yellow-500/20 to-orange-500/20",
                iconColor: "text-yellow-500"
              },
              {
                icon: Shield,
                title: "Secure & Private",
                description: "Your files are processed locally and never stored on our servers",
                features: ["No file uploads", "End-to-end encryption", "GDPR compliant"],
                gradient: "from-green-500/20 to-emerald-500/20",
                iconColor: "text-green-500"
              },
              {
                icon: FileText,
                title: "Advanced Features",
                description: "Powerful tools to handle your PDF needs",
                features: ["Page reordering", "Rotation support", "Preview thumbnails"],
                gradient: "from-blue-500/20 to-indigo-500/20",
                iconColor: "text-blue-500"
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                variants={itemVariants}
                whileHover={{ 
                  y: -8,
                  transition: { type: "spring", stiffness: 300, damping: 20 }
                }}
                className="relative group"
              >
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-all duration-500 blur-xl`} />
                <div className="relative p-8 space-y-6 bg-card/80 backdrop-blur-sm border border-border/50 rounded-3xl hover:border-primary/30 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10">
                  <motion.div 
                    className={`p-4 w-fit rounded-2xl bg-gradient-to-br ${feature.gradient} group-hover:scale-110 transition-transform duration-300`}
                    whileHover={{ rotate: 5 }}
                  >
                    <feature.icon className={`h-8 w-8 ${feature.iconColor}`} />
                  </motion.div>
                  <h3 className="text-2xl font-bold group-hover:text-primary transition-colors duration-300">{feature.title}</h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">{feature.description}</p>
                  <ul className="space-y-4">
                    {feature.features.map((item, idx) => (
                      <motion.li 
                        key={item} 
                        className="flex items-center gap-3 text-base"
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 + idx * 0.1 }}
                      >
                        <div className="p-1 rounded-full bg-primary/10">
                          <CheckCircle className="h-4 w-4 text-primary" />
                  </div>
                        <span className="font-medium">{item}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Enhanced Stats Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-br from-muted/30 to-muted/10">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center"
          >
            {[
              { icon: Users, value: "10K+", label: "Happy Users" },
              { icon: FileText, value: "50K+", label: "PDFs Merged" },
              { icon: Clock, value: "< 30s", label: "Average Time" },
              { icon: Star, value: "4.9/5", label: "User Rating" },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="space-y-3"
              >
                <motion.div
                  variants={floatingVariants}
                  animate="animate"
                  className="inline-flex p-3 rounded-2xl bg-primary/10"
                >
                  <stat.icon className="h-6 w-6 text-primary" />
                </motion.div>
                <div className="space-y-1">
                  <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Enhanced CTA Section */}
      <section className="py-16 sm:py-32 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent" />
        <div className="absolute inset-0">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 2 }}
            className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl"
          />
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 2, delay: 0.5 }}
            className="absolute bottom-0 right-1/4 w-80 h-80 bg-primary/8 rounded-full blur-3xl"
          />
        </div>

        <div className="container mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-sm border border-border/50 p-8 sm:p-12 md:p-16"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
            <div className="relative flex flex-col lg:flex-row items-center justify-between gap-8">
              <motion.div 
                className="max-w-2xl space-y-6"
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                viewport={{ once: true }}
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 w-fit">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Ready to get started?</span>
                </div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                  Ready to merge your 
                  <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> PDFs?</span>
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Start combining your PDF files now with our easy-to-use tool.
                  No registration required, completely free, and secure.
                </p>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                viewport={{ once: true }}
              >
              <Link href="/merge">
                  <Button 
                    size="lg" 
                    className="group h-14 px-10 text-lg font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-2xl shadow-lg hover:shadow-xl hover:shadow-primary/25 transition-all duration-300 hover:scale-105"
                  >
                    <span className="flex items-center gap-2">
                  Start Merging
                      <ArrowUpRight className="h-5 w-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                    </span>
                </Button>
              </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}