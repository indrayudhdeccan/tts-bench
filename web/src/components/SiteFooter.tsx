import { DeccanLogo } from "@/components/DeccanLogo";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black px-4 py-10 text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <DeccanLogo variant="dark" href="https://www.deccan.ai" />
        <p className="font-mono text-xs uppercase tracking-widest text-[#93c5fd]">
          // Accuracy is Intelligence
        </p>
      </div>
      <p className="mx-auto mt-6 max-w-6xl text-center text-xs text-white/40">
        Project Beatles (TTS Bench) · Deccan AI
      </p>
    </footer>
  );
}
