import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, User, Settings, CreditCard, LogOut, Video } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const isAuthenticated = !!user;

  const handleLogout = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/50">
      <div className="container mx-auto px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <img
              src="/logo.svg"
              alt="Property Motion"
              className="h-10 sm:h-11 w-auto"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {!isAuthenticated ? (
              <>
                <Link to="/#features" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary">
                  Features
                </Link>
                <Link to="/#pricing" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary">
                  Pricing
                </Link>
                <Link to="/#testimonials" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary">
                  Testimonials
                </Link>
                <Link to="/#faq" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary">
                  FAQ
                </Link>
                <div className="w-px h-6 bg-border mx-2" />
                <Link to="/login" className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors">
                  Sign In
                </Link>
                <Button asChild variant="hero" size="default">
                  <Link to="/signup">Start Free Trial</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="hero" size="default">
                  <Link to="/create">
                    <Video className="w-4 h-4 mr-1" />
                    Create Video
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full ml-2">
                      <User className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => navigate("/settings")}>
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/settings?tab=billing")}>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Billing
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border animate-slide-up">
            <div className="flex flex-col gap-2">
              {!isAuthenticated ? (
                <>
                  <Link to="/#features" className="text-muted-foreground hover:text-foreground transition-colors py-2 px-3 rounded-lg hover:bg-secondary" onClick={() => setMobileMenuOpen(false)}>Features</Link>
                  <Link to="/#pricing" className="text-muted-foreground hover:text-foreground transition-colors py-2 px-3 rounded-lg hover:bg-secondary" onClick={() => setMobileMenuOpen(false)}>Pricing</Link>
                  <Link to="/login" className="text-foreground font-medium py-2 px-3" onClick={() => setMobileMenuOpen(false)}>Sign In</Link>
                  <Button asChild variant="hero" size="lg" className="w-full mt-2">
                    <Link to="/signup" onClick={() => setMobileMenuOpen(false)}>Start Free Trial</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="hero" size="lg" className="w-full">
                    <Link to="/create" onClick={() => setMobileMenuOpen(false)}>
                      <Video className="w-4 h-4 mr-1" />
                      Create Video
                    </Link>
                  </Button>
                  <Link to="/settings" className="text-muted-foreground hover:text-foreground transition-colors py-2 px-3 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                    <Settings className="w-4 h-4" /> Settings
                  </Link>
                  <button onClick={() => { setMobileMenuOpen(false); handleLogout(); }} className="text-destructive py-2 px-3 flex items-center gap-2 text-left">
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
