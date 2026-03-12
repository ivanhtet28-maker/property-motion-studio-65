import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Navbar } from "@/components/layout/Navbar";
import { User, CreditCard, Building2, Check, Loader2, Download, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

const plans = [
  {
    id: "free",
    name: "Free",
    price: 0,
    videos: 2,
    description: "Try it out",
  },
  {
    id: "starter",
    name: "Starter",
    price: 49,
    videos: 3,
    description: "For individuals",
  },
  {
    id: "growth",
    name: "Growth",
    price: 99,
    videos: 10,
    description: "For growing teams",
  },
  {
    id: "pro",
    name: "Pro",
    price: 179,
    videos: 20,
    description: "For agencies & teams",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom" as unknown as number,
    videos: -1,
    description: "Custom videos, seats & integrations",
  },
];

const billingHistory = [
  { date: "Feb 15, 2026", description: "Growth Plan", amount: "A$99.00" },
  { date: "Jan 15, 2026", description: "Growth Plan", amount: "A$99.00" },
  { date: "Dec 15, 2025", description: "Starter Plan", amount: "A$49.00" },
];

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "profile";
  const { toast } = useToast();
  const { user } = useAuth();

  const [agentName, setAgentName] = useState("John Smith");
  const [agentPhone, setAgentPhone] = useState("0412 345 678");
  const [agentEmail, setAgentEmail] = useState("john@raywhite.com.au");
  const [isSaving, setIsSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Subscription state
  const [subscriptionData, setSubscriptionData] = useState<Record<string, unknown> | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);

  // Load subscription data
  useEffect(() => {
    if (user?.id) {
      loadSubscriptionData();
    }
  }, [user]);

  const loadSubscriptionData = async () => {
    if (!user?.id) return;

    try {
      setIsLoadingSubscription(true);
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      setSubscriptionData(data);
    } catch (error) {
      console.error("Failed to load subscription:", error);
    } finally {
      setIsLoadingSubscription(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user?.id) return;

    setIsManagingSubscription(true);
    try {
      const data = await invokeEdgeFunction<{ url?: string }>("create-portal-session", {
        body: { userId: user.id },
      });

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Portal error:", error);
      toast({
        title: "Error",
        description: "Failed to open subscription management",
        variant: "destructive",
      });
      setIsManagingSubscription(false);
    }
  };

  // Determine current plan from subscription data
  const currentPlan = subscriptionData?.subscription_plan || "free";
  const subscriptionStatus = subscriptionData?.subscription_status;
  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trialing";

  const handleSaveProfile = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast({
      title: "Settings saved!",
      description: "Your profile has been updated.",
    });
  };

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }
    setIsUpdatingPassword(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsUpdatingPassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast({
      title: "Password updated!",
      description: "Your password has been changed.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-20 pb-12">
        <div className="container mx-auto px-6 max-w-4xl">
          <h1 className="text-3xl font-bold text-foreground mt-8 mb-8">Account Settings</h1>

          <Tabs defaultValue={defaultTab} className="space-y-8">
            <TabsList className="bg-secondary p-1 rounded-lg">
              <TabsTrigger value="profile" className="rounded-md">
                Profile
              </TabsTrigger>
              <TabsTrigger value="plan" className="rounded-md">
                Plan
              </TabsTrigger>
              <TabsTrigger value="billing" className="rounded-md">
                Billing
              </TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-8">
              {/* Email (Read Only) */}
              <div className="bg-card rounded-xl border border-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-muted-foreground">Signed in as</span>
                </div>
                <p className="font-medium text-foreground">john@example.com</p>
              </div>

              {/* Default Agent Details */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">Default Agent Branding</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  These details will be used for all new videos
                </p>

                <div className="space-y-6">
                  {/* Agent Photo */}
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
                      <User className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <Button variant="outline">Upload Photo</Button>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="agent-name">Agent Name</Label>
                      <Input
                        id="agent-name"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agent-phone">Phone Number</Label>
                      <Input
                        id="agent-phone"
                        value={agentPhone}
                        onChange={(e) => setAgentPhone(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="agent-email">Email</Label>
                      <Input
                        id="agent-email"
                        type="email"
                        value={agentEmail}
                        onChange={(e) => setAgentEmail(e.target.value)}
                        className="h-11"
                      />
                    </div>
                  </div>

                  {/* Agency Logo */}
                  <div className="flex items-center gap-4">
                    <div className="w-40 h-14 rounded-lg bg-secondary flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <Button variant="outline">Upload Logo</Button>
                  </div>

                  <Button onClick={handleSaveProfile} disabled={isSaving} variant="hero">
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </div>

              {/* Change Password */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-6">Change Password</h2>
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <Button
                    onClick={handleUpdatePassword}
                    disabled={isUpdatingPassword || !currentPassword || !newPassword}
                    variant="default"
                  >
                    {isUpdatingPassword ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Update Password"
                    )}
                  </Button>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="bg-card rounded-xl border border-destructive/30 p-6">
                <h2 className="text-lg font-semibold text-destructive mb-2">Danger Zone</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Once you delete your account, there is no going back. Please be certain.
                </p>
                <Button variant="destructive">Delete Account</Button>
              </div>
            </TabsContent>

            {/* Plan Tab */}
            <TabsContent value="plan" className="space-y-8">
              {/* Subscription Status */}
              {isLoadingSubscription ? (
                <div className="bg-card rounded-xl border border-border p-6 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-muted-foreground">Loading subscription...</p>
                </div>
              ) : subscriptionData && isActive ? (
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Active Subscription</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {subscriptionData.videos_used_this_period || 0} of{" "}
                        {currentPlan === "enterprise" ? "Custom" : currentPlan === "pro" ? "20" : currentPlan === "growth" ? "10" : currentPlan === "starter" ? "3" : "2"} videos used this period
                      </p>
                      {subscriptionData.subscription_period_end && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {subscriptionData.subscription_cancel_at_period_end
                            ? `Cancels on ${new Date(subscriptionData.subscription_period_end).toLocaleDateString()}`
                            : `Renews on ${new Date(subscriptionData.subscription_period_end).toLocaleDateString()}`
                          }
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleManageSubscription}
                      disabled={isManagingSubscription}
                    >
                      {isManagingSubscription ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Manage Subscription
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Current Plan */}
              <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
                {plans.map((plan) => {
                  const isCurrent = plan.id === currentPlan && isActive;
                  return (
                    <div
                      key={plan.id}
                      className={`rounded-xl p-6 ${
                        isCurrent
                          ? "bg-primary text-primary-foreground border-2 border-primary"
                          : "bg-card border border-border"
                      }`}
                    >
                      {isCurrent && (
                        <span className="inline-block px-2 py-1 bg-success text-success-foreground text-xs font-medium rounded-full mb-4">
                          Current Plan
                        </span>
                      )}
                      <h3 className={`text-lg font-bold ${isCurrent ? "" : "text-foreground"}`}>
                        {plan.name}
                      </h3>
                      <p className={`text-sm mt-1 ${isCurrent ? "opacity-80" : "text-muted-foreground"}`}>
                        {plan.description}
                      </p>
                      <div className="mt-4">
                        <span className="text-3xl font-bold">
                          {typeof plan.price === 'number' ? `A$${plan.price}` : plan.price}
                        </span>
                        {typeof plan.price === 'number' && (
                          <span className={`text-sm ${isCurrent ? "opacity-80" : "text-muted-foreground"}`}>
                            /month
                          </span>
                        )}
                      </div>
                      <p className={`mt-2 text-sm ${isCurrent ? "opacity-80" : "text-muted-foreground"}`}>
                        {plan.id === "enterprise" ? "Custom" : plan.videos} videos/month
                      </p>
                      {isCurrent ? (
                        <div className="mt-6 flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4" />
                          {subscriptionData?.videos_used_this_period || 0} of {plan.id === "enterprise" ? "custom" : plan.videos} used
                        </div>
                      ) : plan.id === "enterprise" ? (
                        <Button
                          variant="outline"
                          className="w-full mt-6"
                          asChild
                        >
                          <a href="mailto:hello@propertymotion.com.au">Contact Us</a>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full mt-6"
                          onClick={() => navigate("/#pricing")}
                        >
                          Change Plan
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Feature Comparison */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="p-6 border-b border-border">
                  <h3 className="font-semibold text-foreground">Feature Comparison</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-4 font-medium text-muted-foreground">Feature</th>
                        <th className="text-center p-4 font-medium text-muted-foreground">Free</th>
                        <th className="text-center p-4 font-medium text-muted-foreground">Starter</th>
                        <th className="text-center p-4 font-medium text-muted-foreground bg-accent">
                          Growth
                        </th>
                        <th className="text-center p-4 font-medium text-muted-foreground">Pro</th>
                        <th className="text-center p-4 font-medium text-muted-foreground">Enterprise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Videos per month", "2", "3", "10", "20", "Custom"],
                        ["Images per video", "5", "20", "20", "20", "Custom"],
                        ["Video length", "15s", "60s", "60s", "60s", "Custom"],
                        ["Resolution", "720p", "1080p", "1080p", "1080p", "1080p"],
                        ["AI Photo Edits", "5", "Unlimited", "Unlimited", "Unlimited", "Unlimited"],
                        ["No Watermark", "—", "✓", "✓", "✓", "✓"],
                        ["Credit Rollover", "—", "3 months", "3 months", "3 months", "✓"],
                        ["Upload limit", "10MB", "10MB", "25MB", "25MB", "Custom"],
                        ["Team Seats", "—", "—", "—", "—", "✓"],
                        ["Dedicated Account Manager", "—", "—", "—", "—", "✓"],
                        ["Custom Integrations", "—", "—", "—", "—", "✓"],
                        ["SLA Support", "—", "—", "✓", "✓", "✓"],
                      ].map(([feature, free, starter, growth, pro, enterprise], index) => (
                        <tr key={index} className="border-b border-border last:border-0">
                          <td className="p-4 text-foreground">{feature}</td>
                          <td className="p-4 text-center text-muted-foreground">{free}</td>
                          <td className="p-4 text-center text-muted-foreground">{starter}</td>
                          <td className="p-4 text-center bg-accent text-foreground">{growth}</td>
                          <td className="p-4 text-center text-muted-foreground">{pro}</td>
                          <td className="p-4 text-center text-muted-foreground">{enterprise}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing" className="space-y-8">
              {/* Payment Method */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-6">Payment Method</h2>
                {isLoadingSubscription ? (
                  <div className="text-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </div>
                ) : subscriptionData?.payment_method_last4 ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-8 bg-secondary rounded flex items-center justify-center">
                        <CreditCard className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {subscriptionData.payment_method_brand?.toUpperCase() || "Card"} •••• {subscriptionData.payment_method_last4}
                        </p>
                        <p className="text-sm text-muted-foreground">Via Stripe</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleManageSubscription}
                      disabled={isManagingSubscription}
                    >
                      {isManagingSubscription ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Update"
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">No payment method on file</p>
                    <Button variant="outline" onClick={() => navigate("/#pricing")}>
                      Choose a Plan
                    </Button>
                  </div>
                )}</div>

              {/* Video Top-Up Packs */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">Need More Videos?</h2>
                <p className="text-sm text-muted-foreground mb-4">Buy extra videos as a one-time purchase. Added to your current allowance instantly.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { id: "topup_1", videos: 1, price: 8, perVideo: 8 },
                    { id: "topup_5", videos: 5, price: 35, perVideo: 7 },
                  ].map((pack) => (
                    <div key={pack.id} className="border border-border rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{pack.videos} Video{pack.videos > 1 ? "s" : ""}</p>
                        <p className="text-sm text-muted-foreground">A${pack.perVideo}/video</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          if (!user) return;
                          try {
                            const data = await invokeEdgeFunction<{ url?: string }>("create-checkout-session", {
                              body: { plan: pack.id, userId: user.id, email: user.email },
                            });
                            if (data.url) window.location.href = data.url;
                          } catch (err) {
                            toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to start checkout", variant: "destructive" });
                          }
                        }}
                      >
                        A${pack.price}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Billing History */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="p-6 border-b border-border">
                  <h2 className="text-lg font-semibold text-foreground">Billing History</h2>
                </div>
                <div className="divide-y divide-border">
                  {billingHistory.map((item, index) => (
                    <div key={index} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{item.description}</p>
                        <p className="text-sm text-muted-foreground">{item.date}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-foreground">{item.amount}</span>
                        <Button variant="ghost" size="sm">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
