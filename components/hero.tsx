import { motion } from 'framer-motion';
import { FileUp, Merge, Download, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function Hero() {
  const features = [
    {
      icon: FileUp,
      title: 'Upload PDFs',
      description: 'Drag and drop multiple PDF files',
      color: 'from-blue-500/10 to-cyan-500/10',
      iconColor: 'text-blue-500'
    },
    {
      icon: Merge,
      title: 'Merge & Edit',
      description: 'Combine, reorder, and edit pages',
      color: 'from-purple-500/10 to-pink-500/10',
      iconColor: 'text-purple-500'
    },
    {
      icon: Download,
      title: 'Download',
      description: 'Get your merged PDF instantly',
      color: 'from-green-500/10 to-emerald-500/10',
      iconColor: 'text-green-500'
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
              <span className="text-sm font-medium text-primary">The Ultimate PDF Merger</span>
            </motion.div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Merge PDFs with
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                {' '}
                Ease
              </span>
            </h1>
            
            <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-xl mx-auto">
              Combine multiple PDF files into one document quickly and securely.
              No file size limits, no watermarks, completely free.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button
              asChild
              size="lg"
              className="group rounded-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 px-8 py-6 text-lg font-semibold transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-lg"
            >
              <Link href="/merge" className="flex items-center gap-2">
                Get Started
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="rounded-full hover:bg-primary/10 transition-all duration-200 ease-in-out hover:scale-105 hover:text-primary px-8 py-6 text-lg"
            >
              <Link href="/about">Learn more</Link>
            </Button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mx-auto mt-16 max-w-5xl grid grid-cols-1 gap-6 sm:grid-cols-3"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 + index * 0.1 }}
              whileHover={{
                y: -4,
                transition: { duration: 0.2 }
              }}
              className="relative group"
            >
              <div className="relative rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 group-hover:border-primary/30 transition-all duration-200 hover:shadow-lg">
                <div className={`p-3 w-fit rounded-xl bg-gradient-to-br ${feature.color} group-hover:scale-105 transition-transform duration-200`}>
                  <feature.icon className={`h-6 w-6 ${feature.iconColor}`} />
                </div>
                <h3 className="mt-4 text-xl font-bold tracking-tight transition-colors duration-200 group-hover:text-primary">
                  {feature.title}
                </h3>
                <p className="mt-2 text-muted-foreground transition-colors duration-200 group-hover:text-foreground/80">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
} 