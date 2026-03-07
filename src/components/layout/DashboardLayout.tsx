import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Video,
  Users,
  CreditCard,
  HelpCircle,
  Flame,
  ChevronDown,
  LogOut,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface DashboardLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: "/dashboard", label: "Videos", icon: Video },
];

const BOTTOM_NAV = [
  { to: "/team", label: "Team", icon: Users },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/support", label: "Support", icon: HelpCircle },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const handleLogout = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-[200px] bg-card border-r border-border flex flex-col z-40">
        {/* Logo */}
        <div className="px-4 pt-4 pb-2">
          <Link to="/">
            <img
              src="/logo-no-text.png"
              alt="Property Motion"
              className="h-12 w-12 rounded-xl"
            />
          </Link>
        </div>

        {/* Main Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="px-3 pb-2 space-y-1">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Credits */}
        <div className="px-3 py-3 border-t border-border">
          <div className="flex items-center gap-2 px-3">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-semibold text-foreground">450</span>
            <span className="text-xs text-muted-foreground">|</span>
            <button
              onClick={() => navigate("/billing")}
              className="text-xs text-primary hover:text-primary/80 font-medium"
            >
              Add credits
            </button>
          </div>
        </div>

        {/* User / Team */}
        <div className="px-3 pb-3 border-t border-border pt-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors text-left">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary uppercase">
                  {user?.email?.[0] || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user?.user_metadata?.team_name || "My Team"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.email || "user@example.com"}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-48">
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-[200px]">
        {children}
      </main>
    </div>
  );
}
