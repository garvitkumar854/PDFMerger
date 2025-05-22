"use client";

import { motion } from "framer-motion";
import { FileText, Shield, Zap, Users, Code, Heart } from "lucide-react";

export default function AboutPage() {
  const features = [
    {
      icon: FileText,
      title: "PDF Merging Made Simple",
      description: "Our intuitive interface makes merging PDFs as easy as drag and drop. No technical knowledge required.",
    },
    {
      icon: Shield,
      title: "Privacy First",
      description: "Your files never leave your browser. We process everything locally to ensure maximum security.",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Built with modern technology to handle your PDFs quickly and efficiently.",
    },
    {
      icon: Users,
      title: "User-Centric Design",
      description: "Every feature is designed with our users in mind, making the experience smooth and enjoyable.",
    },
    {
      icon: Code,
      title: "Open Source",
      description: "Our code is open source, allowing for transparency and community contributions.",
    },
    {
      icon: Heart,
      title: "Made with Love",
      description: "We're passionate about creating tools that make your life easier.",
    },
  ];

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-16">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-4"
        >
          <h1 className="text-4xl font-bold">About PDF Merger</h1>
          <p className="text-muted-foreground text-lg">
            A modern solution for combining PDF files, built with simplicity and security in mind.
          </p>
        </motion.div>

        {/* Mission Statement */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card rounded-lg p-8 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
          <p className="text-muted-foreground">
            We believe that managing PDF documents should be simple and accessible to everyone. 
            Our mission is to provide a secure, fast, and user-friendly tool that makes PDF merging 
            effortless while maintaining the highest standards of privacy and security.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 * index }}
              className="bg-card rounded-lg p-6 shadow-sm"
            >
              <div className="flex items-center mb-4">
                <feature.icon className="h-6 w-6 text-primary mr-3" />
                <h3 className="text-xl font-semibold">{feature.title}</h3>
              </div>
              <p className="text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>

        {/* Technology Stack */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="bg-card rounded-lg p-8 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-6">Built with Modern Technology</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-lg font-medium mb-2">Frontend</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Next.js 14 with App Router</li>
                <li>• React with TypeScript</li>
                <li>• Tailwind CSS for styling</li>
                <li>• Framer Motion for animations</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Features</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• PDF.js for PDF processing</li>
                <li>• Client-side PDF merging</li>
                <li>• Dark mode support</li>
                <li>• Responsive design</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="text-center space-y-4"
        >
          <h2 className="text-2xl font-semibold">Ready to Try It Out?</h2>
          <p className="text-muted-foreground">
            Experience the simplicity of PDF Merger for yourself.
          </p>
          <a
            href="/merge"
            className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Start Merging PDFs
          </a>
        </motion.div>
      </div>
    </div>
  );
} 