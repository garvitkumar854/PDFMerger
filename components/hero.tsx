import { motion } from 'framer-motion';
import { FileUp, Merge, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function Hero() {
  const features = [
    {
      icon: FileUp,
      title: 'Upload PDFs',
      description: 'Drag and drop multiple PDF files',
    },
    {
      icon: Merge,
      title: 'Merge & Edit',
      description: 'Combine, reorder, and edit pages',
    },
    {
      icon: Download,
      title: 'Download',
      description: 'Get your merged PDF instantly',
    },
  ];

  return (
    <div className="relative overflow-hidden bg-background pt-24 md:pt-32 pb-16">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at center, rgba(var(--primary-rgb), 0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
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
          >
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl bg-clip-text">
              Merge PDFs with
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                {' '}
                Ease
              </span>
            </h1>
            <p className="mt-8 text-lg leading-8 text-muted-foreground">
              Combine multiple PDF files into one document quickly and securely.
              No file size limits, no watermarks, completely free.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-12 flex items-center justify-center gap-x-6"
          >
            <Button
              asChild
              size="lg"
              className="rounded-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 px-8 transition-all duration-150 ease-in-out hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
            >
              <Link href="/merge">Get Started</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="rounded-full hover:bg-primary/10 transition-all duration-150 ease-in-out hover:scale-105 hover:text-primary"
            >
              <Link href="/about">Learn more</Link>
            </Button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mx-auto mt-20 max-w-5xl grid grid-cols-1 gap-8 sm:grid-cols-3"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{
                scale: 1.02,
                boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.4)',
                transition: {
                  duration: 0.15,
                  ease: [0.4, 0, 0.2, 1],
                  scale: {
                    type: "spring",
                    stiffness: 400,
                    damping: 25
                  }
                }
              }}
              className="relative rounded-2xl border border-primary/10 bg-card/95 p-8 backdrop-blur-sm group hover:bg-primary/[0.02]"
              style={{
                boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.3)'
              }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-all duration-150 ease-in-out group-hover:scale-110 group-hover:bg-primary/20">
                <feature.icon className="h-6 w-6 text-primary transition-transform duration-150 ease-in-out group-hover:scale-110" />
              </div>
              <h3 className="mt-6 text-2xl font-medium tracking-tight transition-colors duration-150 ease-in-out group-hover:text-primary">{feature.title}</h3>
              <p className="mt-3 text-muted-foreground transition-colors duration-150 ease-in-out group-hover:text-foreground/80">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
} 