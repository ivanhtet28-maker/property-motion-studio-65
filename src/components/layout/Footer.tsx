import { Link } from "react-router-dom";
import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-navy text-navy-foreground">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Logo & Description */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="mb-4 inline-block">
              <img src="/logo.svg" alt="Property Motion" className="h-12 w-auto" />
            </Link>
            <p className="text-navy-foreground/60 text-sm leading-relaxed">
              Turn real estate photos into stunning marketing videos in minutes.
            </p>
            <div className="flex items-center gap-3 mt-6">
              {[
                { icon: Facebook, href: "https://facebook.com", label: "Facebook" },
                { icon: Instagram, href: "https://instagram.com", label: "Instagram" },
                { icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn" },
                { icon: Youtube, href: "https://youtube.com", label: "YouTube" },
              ].map(({ icon: Icon, href, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-navy-foreground/10 flex items-center justify-center text-navy-foreground/60 hover:text-navy-foreground hover:bg-navy-foreground/20 transition-all" aria-label={label}>
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-navy-foreground/80">Who It's For</h4>
            <ul className="space-y-2.5">
              {["Real Estate Agents", "Photographers", "Property Managers"].map(item => (
                <li key={item}><Link to="/#features" className="text-navy-foreground/60 hover:text-primary transition-colors text-sm">{item}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-navy-foreground/80">Features</h4>
            <ul className="space-y-2.5">
              {[
                { label: "Overview", to: "/#features" },
                { label: "Create a Video", to: "/create" },
                { label: "Branded Videos", to: "/#features" },
                { label: "Photo Edits", to: "/#features" },
              ].map(item => (
                <li key={item.label}><Link to={item.to} className="text-navy-foreground/60 hover:text-primary transition-colors text-sm">{item.label}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-navy-foreground/80">Help</h4>
            <ul className="space-y-2.5">
              {[
                { label: "FAQ", to: "/#faq" },
                { label: "Contact", to: "mailto:hello@propertymotion.com.au" },
              ].map(item => (
                <li key={item.label}><Link to={item.to} className="text-navy-foreground/60 hover:text-primary transition-colors text-sm">{item.label}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-navy-foreground/80">Company</h4>
            <ul className="space-y-2.5">
              {[
                { label: "Pricing", to: "/#pricing" },
                { label: "Terms", to: "/terms" },
                { label: "Privacy", to: "/privacy" },
              ].map(item => (
                <li key={item.label}><Link to={item.to} className="text-navy-foreground/60 hover:text-primary transition-colors text-sm">{item.label}</Link></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-navy-foreground/10">
          <p className="text-navy-foreground/40 text-sm text-center">
            &copy; {new Date().getFullYear()} Property Motion. Built for Australian Real Estate Agents.
          </p>
        </div>
      </div>
    </footer>
  );
}
