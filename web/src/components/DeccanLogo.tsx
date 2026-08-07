import Image from "next/image";
import Link from "next/link";

interface DeccanLogoProps {
  variant?: "dark" | "light";
  href?: string;
}

export function DeccanLogo({ variant = "dark", href = "https://www.deccan.ai" }: DeccanLogoProps) {
  const content = (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/deccan-logo.png"
        alt="Deccan AI"
        width={32}
        height={32}
        className="h-8 w-8"
        priority
      />
      <span className={`text-base font-semibold tracking-tight ${variant === "dark" ? "text-white" : "text-[#111827]"}`}>
        Deccan AI
      </span>
    </span>
  );

  if (href.startsWith("http")) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0">
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className="inline-flex shrink-0">
      {content}
    </Link>
  );
}
