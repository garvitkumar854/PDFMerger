"use client";

import { motion } from "framer-motion";
import { FileIcon, ShieldIcon, AlertCircleIcon, ClockIcon } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
        <p className="text-muted-foreground text-lg">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </motion.div>

      <div className="space-y-8">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
          <p className="text-muted-foreground mb-4">
            By accessing and using PDF Merger, you agree to be bound by these Terms of Service
            and all applicable laws and regulations. If you do not agree with any of these terms,
            you are prohibited from using or accessing this service.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">2. Service Description</h2>
          <p className="text-muted-foreground mb-4">
            PDF Merger provides a web-based service for merging PDF documents. The service is
            provided "as is" and we make no warranties, expressed or implied, regarding the
            operation of the service or the information, content, or materials included.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">3. User Responsibilities</h2>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <FileIcon className="h-5 w-5 text-primary mt-1" />
              <p className="text-muted-foreground">
                You are responsible for ensuring you have the right to use and merge the PDF files
                you upload to our service.
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <ShieldIcon className="h-5 w-5 text-primary mt-1" />
              <p className="text-muted-foreground">
                You must not use the service for any illegal purposes or to violate any laws.
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <AlertCircleIcon className="h-5 w-5 text-primary mt-1" />
              <p className="text-muted-foreground">
                You are responsible for maintaining the confidentiality of your account information.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">4. Data Processing</h2>
          <p className="text-muted-foreground mb-4">
            All PDF processing is done in your browser. We do not store your files on our servers.
            However, we may temporarily process your files in memory to provide the merging service.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">5. Service Limitations</h2>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <ClockIcon className="h-5 w-5 text-primary mt-1" />
              <p className="text-muted-foreground">
                We reserve the right to limit the number of files that can be merged in a single session.
              </p>
            </div>
            <p className="text-muted-foreground">
              We may impose restrictions on file sizes and types to ensure optimal service performance.
            </p>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">6. Changes to Terms</h2>
          <p className="text-muted-foreground mb-4">
            We reserve the right to modify these terms at any time. We will notify users of any
            material changes by posting the new Terms of Service on this page.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">7. Contact Information</h2>
          <p className="text-muted-foreground">
            If you have any questions about these Terms of Service, please contact us at{" "}
            <a href="mailto:support@pdfmerger.com" className="text-primary hover:underline">
              support@pdfmerger.com
            </a>
          </p>
        </motion.section>
      </div>
    </div>
  );
} 