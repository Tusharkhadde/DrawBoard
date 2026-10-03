import Link from "next/link";
import { ArrowUpRight, Github } from "lucide-react";
import { Brand } from "./Brand";
import { Separator } from "@/components/ui/separator";

const columns = [
  { title: "Product", links: [{ label: "Features", href: "/features" }, { label: "How it works", href: "/#how-it-works" }, { label: "Quick sketch", href: "/canvas/guest" }] },
  { title: "Company", links: [{ label: "About", href: "/about" }, { label: "GitHub", href: "https://github.com/Tusharkhadde/DrawBoard", external: true }] },
  { title: "Account", links: [{ label: "Log in", href: "/signin" }, { label: "Create an account", href: "/signup" }] },
];

export default function LandingFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="container py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Brand />
            <p className="prose-muted mt-4 text-sm">A little space for your next big idea. Sketch, plan, and think together — in the browser, in real time.</p>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-sm font-semibold">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      target={"external" in l && l.external ? "_blank" : undefined}
                      rel={"external" in l && l.external ? "noreferrer" : undefined}
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label === "GitHub" && <Github className="size-3.5" />}
                      {l.label}
                      {"external" in l && l.external && <ArrowUpRight className="size-3" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <Separator className="my-10" />
        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Drawboard. Open source.</span>
          <span className="font-serif text-sm italic text-muted-foreground/80">Less friction. More imagination.</span>
        </div>
      </div>
    </footer>
  );
}
