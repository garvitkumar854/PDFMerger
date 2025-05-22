"use client";

import { motion } from "framer-motion";
import { ShieldIcon, DatabaseIcon, CookieIcon, EyeIcon, LockIcon } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
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
          <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <DatabaseIcon className="h-5 w-5 text-primary mt-1" />
              <p className="text-muted-foreground">
                We collect minimal information necessary to provide our service, including:
              </p>
            </div>
            <ul className="list-disc list-inside text-muted-foreground ml-8 space-y-2">
              <li>Account information (email, name) when you sign up</li>
              <li>Usage data to improve our service</li>
              <li>PDF files that you choose to merge (processed in browser only)</li>
            </ul>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <EyeIcon className="h-5 w-5 text-primary mt-1" />
              <p className="text-muted-foreground">
                We use your information to:
              </p>
            </div>
            <ul className="list-disc list-inside text-muted-foreground ml-8 space-y-2">
              <li>Provide and maintain our service</li>
              <li>Improve user experience</li>
              <li>Send important updates and notifications</li>
              <li>Respond to your inquiries and support requests</li>
            </ul>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">3. Data Security</h2>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <ShieldIcon className="h-5 w-5 text-primary mt-1" />
              <p className="text-muted-foreground">
                We implement appropriate security measures to protect your information:
              </p>
            </div>
            <ul className="list-disc list-inside text-muted-foreground ml-8 space-y-2">
              <li>All PDF processing is done in your browser</li>
              <li>We use secure HTTPS connections</li>
              <li>Regular security audits and updates</li>
              <li>No permanent storage of your PDF files</li>
            </ul>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">4. Cookies and Tracking</h2>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <CookieIcon className="h-5 w-5 text-primary mt-1" />
              <p className="text-muted-foreground">
                We use essential cookies to:
              </p>
            </div>
            <ul className="list-disc list-inside text-muted-foreground ml-8 space-y-2">
              <li>Maintain your session</li>
              <li>Remember your preferences</li>
              <li>Improve service performance</li>
            </ul>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">5. Your Rights</h2>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <LockIcon className="h-5 w-5 text-primary mt-1" />
              <p className="text-muted-foreground">
                You have the right to:
              </p>
            </div>
            <ul className="list-disc list-inside text-muted-foreground ml-8 space-y-2">
              <li>Access your personal information</li>
              <li>Request deletion of your data</li>
              <li>Opt-out of non-essential communications</li>
              <li>Export your data</li>
            </ul>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">6. Changes to Privacy Policy</h2>
          <p className="text-muted-foreground mb-4">
            We may update this privacy policy from time to time. We will notify you of any changes
            by posting the new policy on this page and updating the &quot;Last updated&quot; date.
          </p>

        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="bg-card rounded-lg p-6 shadow-sm"
        >
          <h2 className="text-2xl font-semibold mb-4">7. Contact Us</h2>
          <p className="text-muted-foreground">
            If you have any questions about this Privacy Policy, please contact us at{" "}
            <a href="mailto:privacy@pdfmerger.com" className="text-primary hover:underline">
              privacy@pdfmerger.com
            </a>
          </p>
        </motion.section>
      </div>
    </div>
  );
} 