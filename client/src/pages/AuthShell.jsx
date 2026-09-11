import { motion } from "framer-motion";
import { Mail, ShieldCheck, Clock, BarChart3, Sparkles } from "lucide-react";

const FEATURES = [
  { icon: Clock, text: "Schedule daily sends and walk away" },
  { icon: ShieldCheck, text: "Stops instantly if a send fails" },
  { icon: BarChart3, text: "Live analytics for every campaign" },
];

export default function AuthShell({ children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-gradient p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-white/10 blur-3xl"
        />

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative flex items-center gap-2 text-lg font-semibold"
        >
          <Mail className="size-6" />
          Automator Email
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative grid gap-6"
        >
          <h1 className="max-w-md text-3xl font-semibold leading-tight">
            Send campaigns from your own Gmail — on your schedule.
          </h1>
          <p className="max-w-sm text-white/80">
            Upload a resume and a recipient list, write once, and let it send
            in controlled batches — live, scheduled, or both.
          </p>
          <ul className="grid gap-3">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                className="flex items-center gap-3 text-sm text-white/90"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Icon className="size-4" />
                </span>
                {text}
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative flex items-center gap-1.5 text-xs text-white/70"
        >
          <Sparkles className="size-3.5" /> Your Gmail App Password is
          encrypted at rest and used only to send your own campaigns.
        </motion.p>
      </div>

      <div className="flex items-center justify-center bg-muted/30 p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
