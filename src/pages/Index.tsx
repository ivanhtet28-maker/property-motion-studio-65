import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Play, Link2, Wand2, Download, Check, X, Star, ChevronRight, Loader2, Tag, ArrowRight } from "lucide-react";
import { useState } from "react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const steps = [
  {
    icon: Link2,
    title: "Paste URL or Upload Photos",
    description: "Simply paste your realestate.com.au or domain.com.au listing URL, or upload photos directly.",
  },
  {
    icon: Wand2,
    title: "Customize Your Video",
    description: "Choose from 5 professional templates, add your branding, and select background music.",
  },
  {
    icon: Download,
    title: "Download & Share",
    description: "Get your HD video in 60 seconds. Share directly to social media or download for later.",
  },
];

const features = [
  {
    title: "Paste Listing URL",
    description: "Works with realestate.com.au & domain.com.au",
  },
  {
    title: "Professional Templates",
    description: "5 stunning video styles to choose from",
  },
  {
    title: "60 Second Generation",
    description: "Your video ready in under a minute",
  },
  {
    title: "Agent Branding",
    description: "Add your photo, logo and contact details",
  },
  {
    title: "HD Quality",
    description: "1080p professional videos every time",
  },
  {
    title: "Mobile Friendly",
    description: "Create videos on any device",
  },
];

const testimonials = [
  {
    quote: "This saves me 2 hours per listing!",
    name: "Sarah M.",
    role: "Melbourne Agent",
    rating: 5,
  },
  {
    quote: "My listings get 3x more engagement now.",
    name: "James T.",
    role: "Sydney Agent",
    rating: 5,
  },
  {
    quote: "Game changer for my business.",
    name: "Emma L.",
    role: "Brisbane Agent",
    rating: 5,
  },
];

const faqs = [
  {
    question: "How long does it take to generate a video?",
    answer: "Most videos are ready in 60-90 seconds. Our AI processes your listing photos and property details to create a professional walkthrough video almost instantly.",
  },
  {
    question: "Can I use this on mobile?",
    answer: "Yes! Our app works on any device - desktop, tablet, or mobile. Create professional listing videos wherever you are.",
  },
  {
    question: "What listing sites are supported?",
    answer: "We support realestate.com.au and domain.com.au. Simply paste your listing URL and we'll automatically extract all photos and property details.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes, cancel your subscription anytime with no questions asked. You'll continue to have access until the end of your billing period.",
  },
  {
    question: "Do I need video editing skills?",
    answer: "No! Just paste your listing URL and we handle everything. Choose a template, add your branding, and your professional video is ready in seconds.",
  },
];

interface PlanFeature {
  text: string;
  included: boolean;
}

interface PlanTier {
  id: string;
  name: string;
  description: string;
  monthly: {
    price: number;
    perVideo: number;
    videosLabel: string;
    videosCount: string;
    additionalVideoPrice: number | null;
    rollover: string;
  };
  yearly: {
    price: number;
    perVideo: number;
    videosLabel: string;
    videosCount: string;
    additionalVideoPrice: number | null;
    discount: number;
    rollover: string;
  };
  features: PlanFeature[];
  highlighted?: boolean;
  badge?: string;
}

const pricingPlans: PlanTier[] = [
  {
    id: "free",
    name: "FREE",
    description: "For people who want to see how it works.",
    monthly: { price: 0, perVideo: 0, videosLabel: "/month", videosCount: "2 videos", additionalVideoPrice: null, rollover: "Credits reset every month" },
    yearly: { price: 0, perVideo: 0, videosLabel: "/month", videosCount: "2 videos", additionalVideoPrice: null, discount: 0, rollover: "Credits reset every month" },
    features: [
      { text: "2 videos/month included", included: true },
      { text: "5 images per video", included: true },
      { text: "Up to 15 seconds per video", included: true },
      { text: "720p video resolution", included: false },
      { text: "5 AI photo edits", included: true },
      { text: "No additional videos", included: false },
      { text: "Exports with watermark", included: false },
      { text: "Credits reset every month", included: true },
      { text: "Upload images up to 10MB", included: false },
      { text: "Standard support", included: false },
    ],
  },
  {
    id: "starter",
    name: "STARTER",
    description: "For individuals ready to publish a few videos each month.",
    monthly: { price: 49, perVideo: 16, videosLabel: "/month", videosCount: "3 videos", additionalVideoPrice: 8, rollover: "Credits rollover for 3 months" },
    yearly: { price: 39, perVideo: 19, videosLabel: "/year", videosCount: "25 videos", additionalVideoPrice: 8, discount: 20, rollover: "Credits rollover for 1 year" },
    features: [
      { text: "{{videos}} included", included: true },
      { text: "20 images per video", included: true },
      { text: "Up to 60 seconds per video", included: true },
      { text: "1080p video resolution", included: true },
      { text: "Unlimited AI photo edits", included: true },
      { text: "{{additionalPrice}} per additional video", included: true },
      { text: "Exports without watermark", included: true },
      { text: "{{rollover}}", included: true },
      { text: "Upload images up to 10MB", included: false },
      { text: "Standard support", included: false },
    ],
  },
  {
    id: "growth",
    name: "GROWTH",
    description: "For growing individuals and small teams scaling their video content.",
    highlighted: true,
    badge: "MOST POPULAR",
    monthly: { price: 99, perVideo: 10, videosLabel: "/month", videosCount: "10 videos", additionalVideoPrice: 8, rollover: "Credits rollover for 3 months" },
    yearly: { price: 79, perVideo: 9, videosLabel: "/year", videosCount: "100 videos", additionalVideoPrice: 7, discount: 20, rollover: "Credits rollover for 1 year" },
    features: [
      { text: "{{videos}} included", included: true },
      { text: "20 images per video", included: true },
      { text: "Up to 60 seconds per video", included: true },
      { text: "1080p video resolution", included: true },
      { text: "Unlimited AI photo edits", included: true },
      { text: "{{additionalPrice}} per additional video", included: true },
      { text: "Exports without watermark", included: true },
      { text: "{{rollover}}", included: true },
      { text: "Upload images up to 25MB", included: true },
      { text: "Priority human support", included: true },
    ],
  },
  {
    id: "pro",
    name: "PRO",
    description: "For top producers, teams, and agencies creating videos at scale.",
    monthly: { price: 179, perVideo: 9, videosLabel: "/month", videosCount: "20 videos", additionalVideoPrice: 7, rollover: "Credits rollover for 3 months" },
    yearly: { price: 149, perVideo: 9, videosLabel: "/year", videosCount: "200 videos", additionalVideoPrice: 7, discount: 17, rollover: "Credits rollover for 1 year" },
    features: [
      { text: "{{videos}} included", included: true },
      { text: "20 images per video", included: true },
      { text: "Up to 60 seconds per video", included: true },
      { text: "1080p video resolution", included: true },
      { text: "Unlimited AI photo edits", included: true },
      { text: "{{additionalPrice}} per additional video", included: true },
      { text: "Exports without watermark", included: true },
      { text: "{{rollover}}", included: true },
      { text: "Upload images up to 25MB", included: true },
      { text: "Priority human support", included: true },
    ],
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    description: "For teams and principals at scale. Custom videos, seats and integrations.",
    monthly: { price: -1, perVideo: 0, videosLabel: "", videosCount: "Custom", additionalVideoPrice: null, rollover: "" },
    yearly: { price: -1, perVideo: 0, videosLabel: "", videosCount: "Custom", additionalVideoPrice: null, discount: 0, rollover: "" },
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

function resolveFeatureText(text: string, plan: PlanTier, isYearly: boolean): string {
  const tier = isYearly ? plan.yearly : plan.monthly;
  return text
    .replace("{{videos}}", `${tier.videosCount}${tier.videosLabel}`)
    .replace("{{additionalPrice}}", tier.additionalVideoPrice ? `A$${tier.additionalVideoPrice}` : "N/A")
    .replace("{{rollover}}", tier.rollover);
}

export default function Index() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  const handleSelectPlan = async (planId: string) => {
    // Free plan goes straight to signup
    if (planId === "free") {
      navigate(user ? "/create" : "/signup");
      return;
    }

    // Check if user is logged in
    if (!user) {
      navigate("/signup");
      return;
    }

    setLoadingPlan(planId);

    try {
      const data = await invokeEdgeFunction<{ url?: string }>("create-checkout-session", {
        body: {
          plan: planId,
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
      console.error("Checkout error:", error);
      toast({
        title: "Checkout Error",
        description: error instanceof Error ? error.message : "Failed to start checkout",
        variant: "destructive",
      });
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground max-w-4xl mx-auto leading-tight animate-slide-up">
            Turn Any Australian Property Listing Into a Professional Video in{" "}
            <span className="text-gradient">60 Seconds</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Just paste your realestate.com.au or domain.com.au URL. No editing skills required.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <Button asChild variant="hero" size="xl">
              <Link to="/signup">Start Free Trial</Link>
            </Button>
            <Button asChild variant="hero-outline" size="xl">
              <Link to="#demo">
                <Play className="w-5 h-5" />
                Watch Demo
              </Link>
            </Button>
          </div>

          {/* Hero Image Placeholder */}
          <div className="mt-16 relative max-w-4xl mx-auto animate-slide-up" style={{ animationDelay: "0.3s" }}>
            <div className="aspect-video bg-secondary rounded-2xl shadow-2xl overflow-hidden border border-border">
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Play className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-muted-foreground">Video Preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three-Step Process */}
      <section className="py-20 bg-secondary">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-16">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div
                key={index}
                className="relative bg-card rounded-2xl p-8 shadow-card hover-lift text-center"
              >
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  {index + 1}
                </div>
                <div className="w-16 h-16 rounded-xl bg-accent flex items-center justify-center mx-auto mt-4">
                  <step.icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-foreground">{step.title}</h3>
                <p className="mt-3 text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-4">
            Start for free, upgrade when you love it.
          </h2>

          {/* Monthly / Yearly Toggle */}
          <div className="flex items-center justify-center gap-1 mt-8 mb-12">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                billingPeriod === "monthly"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("yearly")}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                billingPeriod === "yearly"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly &middot; up to 30% off
            </button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-5 max-w-7xl mx-auto items-start">
            {pricingPlans.map((plan) => {
              const isYearly = billingPeriod === "yearly";
              const tier = isYearly ? plan.yearly : plan.monthly;
              const isFree = plan.id === "free";
              const isEnterprise = plan.id === "enterprise";
              const isHighlighted = plan.highlighted;

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl p-7 transition-all duration-300 ${
                    isHighlighted
                      ? "border-2 border-primary shadow-xl"
                      : "border border-border shadow-card"
                  } bg-card`}
                >
                  {/* MOST POPULAR badge */}
                  {plan.badge && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">
                      {plan.badge}
                    </span>
                  )}

                  {/* Header: name + discount badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-primary">{plan.name}</h3>
                    {isYearly && tier.discount > 0 && (
                      <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">
                        <Tag className="w-3 h-3" />
                        {tier.discount}% OFF
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mb-4 min-h-[40px]">
                    {plan.description}
                  </p>

                  {/* Video count */}
                  <div className="mb-4">
                    <span className="text-3xl font-bold text-foreground">{tier.videosCount}</span>
                    <span className="text-sm text-muted-foreground ml-2">{tier.videosLabel}</span>
                  </div>

                  {/* Price pills */}
                  {isEnterprise ? (
                    <div className="mb-1">
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-secondary text-sm font-bold text-foreground">
                        Custom pricing
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-secondary text-sm font-bold text-foreground">
                        A${tier.price} <span className="font-normal text-muted-foreground ml-1">/ month</span>
                      </span>
                      {!isFree && (
                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-secondary text-sm font-bold text-foreground">
                          A${tier.perVideo} <span className="font-normal text-muted-foreground ml-1">/ video</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Strikethrough prices for yearly */}
                  {isYearly && !isFree && !isEnterprise && tier.discount > 0 && (
                    <div className="flex items-center gap-3 mt-1 mb-3">
                      <span className="text-sm text-muted-foreground line-through">A${plan.monthly.price}/month</span>
                      <span className="text-sm text-muted-foreground line-through">A${plan.monthly.perVideo}/video</span>
                    </div>
                  )}
                  {(!isYearly || isFree || isEnterprise || tier.discount === 0) && <div className="h-4 mb-3" />}

                  {/* CTA Button */}
                  {isEnterprise ? (
                    <>
                      <Button
                        variant="hero-outline"
                        size="lg"
                        className="w-full mb-2"
                        asChild
                      >
                        <a href="mailto:hello@propertymotion.com.au">
                          Contact Us <ArrowRight className="w-4 h-4" />
                        </a>
                      </Button>
                      <div className="h-5 mb-5" />
                    </>
                  ) : (
                    <>
                      <Button
                        variant="hero"
                        size="lg"
                        className="w-full mb-2"
                        onClick={() => handleSelectPlan(isFree ? "free" : isYearly ? `${plan.id}_yearly` : plan.id)}
                        disabled={!!loadingPlan}
                      >
                        {loadingPlan === plan.id || loadingPlan === `${plan.id}_yearly` ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading...
                          </>
                        ) : isFree ? (
                          <>Try Now <ArrowRight className="w-4 h-4" /></>
                        ) : (
                          <>Start Free Trial <ArrowRight className="w-4 h-4" /></>
                        )}
                      </Button>
                      {!isFree && (
                        <p className="text-xs text-muted-foreground text-center mb-5">
                          7-day free trial — cancel anytime*
                        </p>
                      )}
                      {isFree && <div className="h-5 mb-5" />}
                    </>
                  )}

                  {/* Feature list */}
                  <ul className="space-y-2.5 border-t border-border pt-5">
                    {plan.features.map((feature, index) => {
                      const text = resolveFeatureText(feature.text, plan, isYearly);
                      return (
                        <li key={index} className="flex items-start gap-2.5 text-sm">
                          {feature.included ? (
                            <Check className="w-4 h-4 flex-shrink-0 text-primary mt-0.5" />
                          ) : (
                            <X className="w-4 h-4 flex-shrink-0 text-destructive/50 mt-0.5" />
                          )}
                          <span className={feature.included ? "text-foreground" : "text-muted-foreground"}>
                            {text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 bg-secondary">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-16">
            Everything You Need
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-card rounded-xl p-6 shadow-card hover-lift border border-border"
              >
                <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center mb-4">
                  <Check className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-muted-foreground text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <p className="text-center text-muted-foreground mb-8">
            Trusted by <span className="font-semibold text-foreground">500+</span> Australian Real Estate Agents
          </p>

          {/* Logo Cloud */}
          <div className="flex flex-wrap justify-center items-center gap-8 mb-16 opacity-50">
            {["Century 21", "Ray White", "LJ Hooker", "McGrath", "Harcourts"].map((brand) => (
              <div key={brand} className="text-lg font-bold text-muted-foreground">
                {brand}
              </div>
            ))}
          </div>

          {/* Testimonials */}
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-card rounded-2xl p-8 shadow-card hover-lift border border-border"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-warning text-warning" />
                  ))}
                </div>
                <p className="text-foreground text-lg font-medium mb-6">"{testimonial.quote}"</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                    <span className="text-lg font-bold text-muted-foreground">
                      {testimonial.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-secondary">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-16">
            Frequently Asked Questions
          </h2>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="bg-card rounded-xl px-6 border border-border"
                >
                  <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-6">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-6">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="bg-primary rounded-3xl p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Ready to Transform Your Listings?
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
              Join 500+ Australian agents creating professional property videos in seconds.
            </p>
            <Button asChild variant="secondary" size="xl" className="text-primary">
              <Link to="/signup">
                Start Your Free Trial
                <ChevronRight className="w-5 h-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
