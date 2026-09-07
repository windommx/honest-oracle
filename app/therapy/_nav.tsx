"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/therapy/assess", th: "ประเมิน" },
  { href: "/therapy/interventions", th: "การรักษา" },
  { href: "/therapy/session", th: "ดนตรี/หายใจ" },
  { href: "/therapy/sleep", th: "นอนหลับ" },
  { href: "/therapy/progress", th: "ความคืบหน้า" },
  { href: "/therapy/safety", th: "ความปลอดภัย" },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur">
      <nav aria-label="MindBridge" className="max-w-6xl mx-auto px-4 sm:px-5 h-14 flex items-center gap-3">
        <Link href="/therapy" className="shrink-0 font-serif text-xl tracking-tight">
          Mind<span className="text-gold">Bridge</span>
        </Link>

        {/* Horizontal scroll rather than a hamburger: six destinations is few
            enough to keep visible, and hiding the safety page behind a menu tap
            is the wrong trade on a mental-health product. */}
        <ul className="flex-1 flex items-center gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`px-3 py-1.5 rounded-full transition whitespace-nowrap ${
                    active ? "bg-gold text-black font-medium" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {l.th}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
