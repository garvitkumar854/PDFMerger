import ContactForm from "@/components/ContactForm";

export const metadata = {
  title: "Contact Us",
  description: "Get in touch with us for any questions or support.",
};

export default function ContactPage() {
  return (
    <div className="container max-w-2xl py-12">
      <div className="space-y-6 text-center mb-8">
        <h1 className="text-3xl font-bold">Contact Us</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Have a question or need help? Fill out the form below and we&apos;ll get back to you as soon as possible.
        </p>
      </div>
      <ContactForm />
    </div>
  );
} 