import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, X, Tag, ArrowRight } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface SubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const plans = [
  {
    id: "starter",
    name: "Starter",
    monthly: { price: 49, perVideo: 16, videos: "3 videos/month" },
    yearly: { price: 39, perVideo: 19, videos: "25 videos/year", discount: 20 },
    features: [
      { text: "20 images per video", included: true },
      { text: "Up to 60 seconds per video", included: true },
      { text: "1080p video resolution", included: true },
      { text: "Unlimited AI photo edits", included: true },
      { text: "Exports without watermark", included: true },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    badge: "MOST POPULAR",
    monthly: { price: 99, perVideo: 10, videos: "10 videos/month" },
    yearly: { price: 79, perVideo: 9, videos: "100 videos/year", discount: 20 },
    features: [
      { text: "20 images per video", included: true },
      { text: "Up to 60 seconds per video", included: true },
      { text: "1080p video resolution", included: true },
      { text: "Unlimited AI photo edits", included: true },
      { text: "Priority human support", included: true },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: { price: 179, perVideo: 9, videos: "20 videos/month" },
    yearly: { price: 149, perVideo: 9, videos: "200 videos/year", discount: 17 },
    features: [
      { text: "20 images per video", included: true },
      { text: "Up to 60 seconds per video", included: true },
      { text: "1080p video resolution", included: true },
      { text: "Unlimited AI photo edits", included: true },
      { text: "Priority human support", included: true },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: { price: -1, perVideo: 0, videos: "Custom" },
    yearly: { price: -1, perVideo: 0, videos: "Custom" },
    features: [
      { text: "Everything in Pro", included: true },
      { text: "Custom video limits", included: true },
      { text: "Multiple team seats", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "Custom integrations", included: true },
      { text: "SLA support", included: true },
    ],
  },
];

export function SubscriptionModal({ open, onOpenChange }: SubscriptionModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fullPlanId = billingPeriod === "yearly" ? `${planId}_yearly` : planId;

    setIsSubscribing(true);
    setSelectedPlan(planId);

    try {
      const data = await invokeEdgeFunction<{ url?: string }>("create-checkout-session", {
        body: {
          plan: fullPlanId,
          userId: user.id,
          email: user.email,
        },
      });

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error) {
      console.error("Subscription error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start checkout",
        variant: "destructive",
      });
      setIsSubscribing(false);
      setSelectedPlan(null);
    }
  };

  const isYearly = billingPeriod === "yearly";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold text-center">
            Subscribe to Download Your Video
          </DialogTitle>
          <DialogDescription className="text-center text-lg mt-2">
            Your video is ready! Choose a plan to download and create unlimited videos.
          </DialogDescription>
        </DialogHeader>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-1 mt-4 mb-6">
          <button
            onClick={() => setBillingPeriod("monthly")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
              billingPeriod === "monthly"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod("yearly")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
              billingPeriod === "yearly"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Yearly &middot; up to 30% off
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan) => {
            const tier = isYearly ? plan.yearly : plan.monthly;
            const isSelected = selectedPlan === plan.id;
            const isLoading = isSubscribing && isSelected;
            const isEnterprise = plan.id === "enterprise";

            return (
              <div
                key={plan.id}
                className={`relative border-2 rounded-2xl p-6 transition-all ${
                  plan.badge
                    ? "border-primary shadow-lg"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold">
                    {plan.badge}
                  </div>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-xl font-bold text-primary">{plan.name}</h3>
                  {!isEnterprise && isYearly && "discount" in tier && tier.discount > 0 && (
                    <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                      <Tag className="w-3 h-3" />
                      {tier.discount}% OFF
                    </span>
                  )}
                </div>

                <p className="text-sm text-muted-foreground mb-3">{tier.videos}</p>

                {isEnterprise ? (
                  <>
                    <div className="text-center mb-2">
                      <span className="text-2xl font-bold">Custom pricing</span>
                    </div>
                    <div className="h-5 mb-4" />
                  </>
                ) : (
                  <>
                    <div className="text-center mb-2">
                      <span className="text-4xl font-bold">A${tier.price}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    {isYearly && "discount" in tier && tier.discount > 0 && (
                      <p className="text-center text-sm text-muted-foreground line-through mb-4">
                        A${plan.monthly.price}/month
                      </p>
                    )}
                    {!isYearly && <div className="h-5 mb-4" />}
                  </>
                )}

                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      {feature.included ? (
                        <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      ) : (
                        <X className="w-4 h-4 text-destructive/50 flex-shrink-0 mt-0.5" />
                      )}
                      <span className="text-sm">{feature.text}</span>
                    </li>
                  ))}
                </ul>

                {isEnterprise ? (
                  <>
                    <Button
                      className="w-full"
                      variant="outline"
                      asChild
                    >
                      <a href="mailto:hello@propertymotion.com.au">
                        Contact Us <ArrowRight className="w-4 h-4" />
                      </a>
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      &nbsp;
                    </p>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={isSubscribing}
                      className="w-full"
                      variant={plan.badge ? "default" : "outline"}
                    >
                      {isLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                          Processing...
                        </>
                      ) : (
                        <>Start Free Trial <ArrowRight className="w-4 h-4" /></>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      7-day free trial — cancel anytime*
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-4 bg-secondary/50 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            All prices in AUD. Subscribe now to download your video and keep creating.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
