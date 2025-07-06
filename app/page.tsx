"use client";

import { Hero } from "@/components/hero";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Shield, Zap, CheckCircle, ArrowUpRight, Sparkles, Users, Clock, Star, Lock, Globe, Smartphone } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

// Optimized animation variants for better performance
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut"
    }
  }
};

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Hero />

      {/* Enhanced Features Section */}
      <section className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true, margin: "-80px" }}
            className="text-center mb-20"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Why Choose Our PDF Merger?</span>
            </motion.div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
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
            viewport={{ once: true, margin: "-40px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10"
          >
            {[
              {
                icon: Zap,
                title: "Lightning Fast",
                description: "Merge your PDFs in seconds with our optimized processing engine",
                features: ["Client-side processing", "Instant preview", "Quick downloads"],
                gradient: "from-yellow-500/10 to-orange-500/10",
                iconColor: "text-yellow-500"
              },
              {
                icon: Shield,
                title: "Secure & Private",
                description: "Your files are processed locally and never stored on our servers",
                features: ["No file uploads", "End-to-end encryption", "GDPR compliant"],
                gradient: "from-green-500/10 to-emerald-500/10",
                iconColor: "text-green-500"
              },
              {
                icon: FileText,
                title: "Advanced Features",
                description: "Powerful tools to handle your PDF needs",
                features: ["Page reordering", "Rotation support", "Preview thumbnails"],
                gradient: "from-blue-500/10 to-indigo-500/10",
                iconColor: "text-blue-500"
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                variants={itemVariants}
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
                  <ul className="space-y-3">
                    {feature.features.map((item, idx) => (
                      <li 
                        key={item} 
                        className="flex items-center gap-3 text-sm"
                      >
                        <div className="p-1 rounded-full bg-primary/10">
                          <CheckCircle className="h-3 w-3 text-primary" />
                        </div>
                        <span className="font-medium">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Enhanced Stats Section */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 bg-muted/20">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
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
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.08 }}
                viewport={{ once: true }}
                className="space-y-3"
              >
                <div className="inline-flex p-3 rounded-xl bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="text-2xl md:text-3xl font-bold text-primary">
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Enhanced Benefits Section */}
      <section className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true, margin: "-80px" }}
            className="text-center mb-20"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">More Than Just Merging</span>
            </motion.div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
              Everything You Need for
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> PDF Management</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Our comprehensive toolset goes beyond simple merging to provide a complete PDF solution.
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10"
          >
            {[
              {
                icon: Lock,
                title: "Privacy First",
                description: "Your documents never leave your device. Complete privacy and security guaranteed.",
                gradient: "from-red-500/10 to-pink-500/10",
                iconColor: "text-red-500"
              },
              {
                icon: Globe,
                title: "Works Everywhere",
                description: "Access from any device, anywhere. No downloads or installations required.",
                gradient: "from-purple-500/10 to-violet-500/10",
                iconColor: "text-purple-500"
              },
              {
                icon: Smartphone,
                title: "Mobile Friendly",
                description: "Optimized for touch devices. Perfect for on-the-go PDF management.",
                gradient: "from-indigo-500/10 to-blue-500/10",
                iconColor: "text-indigo-500"
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                variants={itemVariants}
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
          </motion.div>
        </div>
      </section>

      {/* Enhanced CTA Section */}
      <section className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm border border-border/50 p-8 sm:p-12"
          >
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
              <motion.div 
                className="max-w-2xl space-y-4"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                viewport={{ once: true }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 w-fit">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span className="text-xs font-medium text-primary">Ready to get started?</span>
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight">
                  Ready to merge your 
                  <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> PDFs?</span>
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Start combining your PDF files now with our easy-to-use tool.
                  No registration required, completely free, and secure.
                </p>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: true }}
              >
                <Link href="/merge">
                  <Button 
                    size="lg" 
                    className="group h-12 px-8 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                  >
                    <span className="flex items-center gap-2">
                      Start Merging
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
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