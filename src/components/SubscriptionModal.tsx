import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Zap, Crown } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
    price: "$299",
    period: "month",
    videos: 10,
    icon: Sparkles,
    features: [
      "10 videos per month",
      "All camera angles",
      "Custom durations",
      "Agent branding",
      "Background music",
      "AI voiceovers",
    ],
    priceId: "price_1Syaj2GkPU4YhgKfafjlmn2s",
  },
  {
    id: "growth",
    name: "Growth",
    price: "$499",
    period: "month",
    videos: 30,
    icon: Zap,
    badge: "⭐ RECOMMENDED",
    features: [
      "30 videos per month",
      "Priority processing",
      "All Starter features",
      "Faster rendering",
      "Email support",
      "Custom templates",
    ],
    priceId: "price_1SyajHGkPU4YhgKfesr95mxL",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    videos: -1,
    icon: Crown,
    features: [
      "Unlimited videos",
      "Dedicated support",
      "Custom branding",
      "API access",
      "Team collaboration",
      "White-label option",
    ],
  },
];

export function SubscriptionModal({ open, onOpenChange }: SubscriptionModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      navigate("/login");
      return;
    }

    if (planId === "enterprise") {
      // For enterprise, close modal and navigate to contact
      onOpenChange(false);
      toast({
        title: "Contact Us",
        description: "We'll be in touch about Enterprise pricing",
      });
      return;
    }

    setIsSubscribing(true);
    setSelectedPlan(planId);

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          plan: planId,
          userId: user.id,
          email: user.email,
        },
      });

      if (error) throw error;

      if (data.url) {
        // Redirect to Stripe checkout
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

        <div className="grid md:grid-cols-3 gap-6 mt-8">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isSelected = selectedPlan === plan.id;
            const isLoading = isSubscribing && isSelected;

            return (
              <div
                key={plan.id}
                className={`relative border-2 rounded-2xl p-6 transition-all ${
                  plan.badge
                    ? "border-primary bg-primary/5 shadow-lg scale-105"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold">
                    {plan.badge}
                  </div>
                )}

                <div className="flex items-center justify-center mb-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    plan.badge ? "bg-primary/20" : "bg-secondary"
                  }`}>
                    <Icon className={`w-8 h-8 ${plan.badge ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                </div>

                <h3 className="text-2xl font-bold text-center mb-2">{plan.name}</h3>

                <div className="text-center mb-6">
                  <span className="text-4xl font-bold">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-muted-foreground">/{plan.period}</span>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    {plan.videos === -1 ? "Unlimited videos" : `${plan.videos} videos/month`}
                  </p>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

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
                  ) : plan.id === "enterprise" ? (
                    "Contact Sales"
                  ) : (
                    `Subscribe to ${plan.name}`
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-secondary/50 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            ✨ <strong>Your free trial video is ready!</strong> Subscribe now to download it and continue creating amazing property videos.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
