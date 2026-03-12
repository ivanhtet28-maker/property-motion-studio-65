import { Link } from "react-router-dom";
import { Video, Facebook, Instagram, Linkedin, Youtube } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-gradient-to-b from-primary/90 to-primary text-primary-foreground">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Logo & Description */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                <Video className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold text-primary-foreground">Property Motion</span>
            </Link>
            <p className="text-primary-foreground/70 text-sm leading-relaxed">
              Turn real estate photos into stunning marketing videos in minutes.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="w-5 h-5" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-5 h-5" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                aria-label="YouTube"
              >
                <Youtube className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Who It's For */}
          <div>
            <h4 className="font-semibold text-primary-foreground mb-4 text-sm">Who It's For</h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/#features" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Real Estate Professionals
                </Link>
              </li>
              <li>
                <Link to="/#features" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Realtors
                </Link>
              </li>
              <li>
                <Link to="/#features" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Photographers
                </Link>
              </li>
            </ul>
          </div>

          {/* Features */}
          <div>
            <h4 className="font-semibold text-primary-foreground mb-4 text-sm">Features</h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/#features" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Overview
                </Link>
              </li>
              <li>
                <Link to="/create" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Create a Video
                </Link>
              </li>
              <li>
                <Link to="/#features" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Branded Videos
                </Link>
              </li>
              <li>
                <Link to="/#features" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Photo Edits
                </Link>
              </li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 className="font-semibold text-primary-foreground mb-4 text-sm">Help</h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/help" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Resources & FAQ
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-primary-foreground mb-4 text-sm">Company</h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/about" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  About
                </Link>
              </li>
              <li>
                <Link to="/#pricing" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Pricing
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Terms
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                  Privacy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-primary-foreground/20">
          <p className="text-primary-foreground/60 text-sm text-center">
            &copy; {new Date().getFullYear()} Property Motion. Built for Australian Real Estate Agents.
          </p>
        </div>
      </div>
    </footer>
  );
}
