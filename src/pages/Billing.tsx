import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { CreditCard, Download, ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

const billingHistory = [
  { date: "Feb 15, 2026", description: "Growth Plan", amount: "$139.00" },
  { date: "Jan 15, 2026", description: "Growth Plan", amount: "$139.00" },
  { date: "Dec 15, 2025", description: "Essential Plan", amount: "$59.00" },
];

export default function Billing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [subscriptionData, setSubscriptionData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isManaging, setIsManaging] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single();
        if (error) throw error;
        setSubscriptionData(data);
      } catch (err) {
        console.error("Failed to load subscription:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user]);

  const handleManageSubscription = async () => {
    if (!user?.id) return;
    setIsManaging(true);
    try {
      const data = await invokeEdgeFunction<{ url?: string }>("create-portal-session", {
        body: { userId: user.id },
      });
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to open subscription management",
        variant: "destructive",
      });
      setIsManaging(false);
    }
  };

  const currentPlan = subscriptionData?.subscription_plan || "free";
  const isActive = subscriptionData?.subscription_status === "active" || subscriptionData?.subscription_status === "trialing";

  return (
    <DashboardLayout>
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-foreground mb-8">Billing</h1>

        {/* Current Plan */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-muted-foreground">Current plan</h2>
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin mt-2" />
              ) : (
                <>
                  <p className="text-xl font-bold text-foreground mt-1 capitalize">
                    {currentPlan} Plan
                  </p>
                  {isActive && subscriptionData?.subscription_period_end && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {subscriptionData.subscription_cancel_at_period_end
                        ? `Cancels on ${new Date(subscriptionData.subscription_period_end).toLocaleDateString()}`
                        : `Renews on ${new Date(subscriptionData.subscription_period_end).toLocaleDateString()}`}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleManageSubscription}
                disabled={isManaging || isLoading}
              >
                {isManaging ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    Manage
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => navigate("/settings?tab=plan")}>
                Change plan
              </Button>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Payment method</h2>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : subscriptionData?.payment_method_last4 ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-7 bg-secondary rounded flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {subscriptionData.payment_method_brand?.toUpperCase() || "Card"} ****{" "}
                    {subscriptionData.payment_method_last4}
                  </p>
                  <p className="text-xs text-muted-foreground">Via Stripe</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleManageSubscription}
                disabled={isManaging}
              >
                Update
              </Button>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-3">No payment method on file</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/#pricing")}>
                Choose a Plan
              </Button>
            </div>
          )}
        </div>

        {/* Billing History */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-medium text-muted-foreground">Billing history</h2>
          </div>
          <div className="divide-y divide-border">
            {billingHistory.map((item, index) => (
              <div key={index} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.description}</p>
                  <p className="text-xs text-muted-foreground">{item.date}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground">{item.amount}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
