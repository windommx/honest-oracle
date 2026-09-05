import Link from "next/link";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  BOOKISDOM LOGO — book + wisdom.                                   ║
// ║                                                                    ║
// ║  Mark: an open book whose spine rises into a point of light with   ║
// ║  three rays — the wisdom that comes out of the reading. Two page   ║
// ║  tones (fill + deep fill) give the book depth; spine and light use ║
// ║  the accent so the mark reads at 20px. Only palette hexes.         ║
// ║  Wordmark: "Book" in ink, "isdom" in gold — the portmanteau shown, ║
// ║  not explained. The tagline spells it out where there is room.     ║
// ╚══════════════════════════════════════════════════════════════════╝

export function BookisdomMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-labelledby="bookisdom-mark-title"
      className={className}
      fill="none"
    >
      <title id="bookisdom-mark-title">Bookisdom — book + wisdom</title>
      {/* light of wisdom rising from the spine */}
      <circle cx="16" cy="7" r="2.2" fill="#7a5c12" />
      <path d="M16 1.5v2.3M10.6 3.8l1.6 1.6M21.4 3.8l-1.6 1.6" stroke="#7a5c12" strokeWidth="1.6" strokeLinecap="round" />
      {/* left page (deeper) and right page */}
      <path d="M4 12.5c3.6-1.6 7.6-1.6 11.2 0v15.4c-3.6-1.6-7.6-1.6-11.2 0V12.5Z" fill="#c8901f" />
      <path d="M28 12.5c-3.6-1.6-7.6-1.6-11.2 0v15.4c3.6-1.6 7.6-1.6 11.2 0V12.5Z" fill="#d9a63a" />
      {/* spine */}
      <path d="M16 12.2v16" stroke="#7a5c12" strokeWidth="1.8" strokeLinecap="round" />
      {/* text lines — the wisdom being read */}
      <path d="M7 16.5c2-.6 4-.6 6 0M7 20c2-.6 4-.6 6 0M19 16.5c2-.6 4-.6 6 0M19 20c2-.6 4-.6 6 0" stroke="#7a5c12" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function BookisdomWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`} aria-label="Bookisdom">
      <span aria-hidden="true" className="text-[#14161c]">Book</span>
      <span aria-hidden="true" className="text-[#7a5c12]">isdom</span>
    </span>
  );
}

/** Nav logo: mark + wordmark, optionally with the origin tagline. Links to /bookisdom. */
export function BookisdomLogo({
  tagline = false,
  size = "md",
  href = "/bookisdom",
}: { tagline?: boolean; size?: "sm" | "md"; href?: string }) {
  const mark = size === "sm" ? 24 : 30;
  const text = size === "sm" ? "text-base" : "text-xl";
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="Bookisdom — หน้าแรก">
      <BookisdomMark size={mark} />
      <span className="flex flex-col leading-none">
        <BookisdomWordmark className={text} />
        {tagline && (
          <span className="text-[0.58rem] tracking-[0.18em] uppercase text-faint mt-1 font-medium">book + wisdom</span>
        )}
      </span>
    </Link>
  );
}
