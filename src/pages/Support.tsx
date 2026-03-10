import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { HelpCircle, Mail, MessageSquare, FileText } from "lucide-react";

export default function Support() {
  return (
    <DashboardLayout>
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-foreground mb-2">Support</h1>
        <p className="text-muted-foreground mb-8">
          Need help? We're here for you.
        </p>

        <div className="space-y-4">
          <a
            href="mailto:support@propertymotion.com.au"
            className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Email Us</p>
              <p className="text-xs text-muted-foreground">
                support@propertymotion.com.au
              </p>
            </div>
          </a>

          <a
            href="https://propertymotion.com.au/faq"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">FAQ</p>
              <p className="text-xs text-muted-foreground">
                Browse frequently asked questions
              </p>
            </div>
          </a>
        </div>
      </div>
    </DashboardLayout>
  );
}
