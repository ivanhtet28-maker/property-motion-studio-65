import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Play, Link2, Wand2, Download, Check, X, Star, ChevronRight, Loader2, Tag, ArrowRight, Plus, Minus, ChevronLeft, Quote } from "lucide-react";
import { useState, useRef } from "react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
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
    quote: "Property Motion transforms photos into beautiful, realistic video walkthroughs. The AI enhancement is truly incredible! A must-have tool for realtors in a digital-first world.",
    name: "Sarah Mitchell",
    role: "Senior Agent, Ray White",
    initials: "SM",
  },
  {
    quote: "It literally takes 5 minutes on the backend to produce a great product to offer to your real estate agents. The cost is affordable and the developers are quick to respond.",
    name: "James Thompson",
    role: "Director, LJ Hooker",
    initials: "JT",
  },
  {
    quote: "It's quick, cost-effective, and perfect for generating professional-quality videos. I can create multiple videos in minutes, maintaining a strong online presence.",
    name: "Emma Liu",
    role: "Principal, McGrath",
    initials: "EL",
  },
  {
    quote: "Property Motion has enhanced our video services uniquely. The team behind it is super responsive and is always looking to improve the product and its AI capabilities.",
    name: "David Park",
    role: "Marketing Manager, Harcourts",
    initials: "DP",
  },
  {
    quote: "This saves me 2 hours per listing! My clients love the professional videos and it helps properties sell faster. Absolutely recommend for any modern agent.",
    name: "Nicole Adams",
    role: "Agent, Century 21",
    initials: "NA",
  },
];

const faqs = [
  {
    question: "How long does video processing take?",
    answer: "Most videos are ready in 60-90 seconds. Our AI processes your listing photos and property details to create a professional walkthrough video almost instantly.",
  },
  {
    question: "Does Property Motion support portrait mode?",
    answer: "Yes! We support both landscape and portrait/vertical video formats, perfect for Instagram Reels, TikTok, and other social media platforms.",
  },
  {
    question: "How many images can I use per video?",
    answer: "Free plans support up to 5 images per video. All paid plans support up to 20 images per video for richer, more detailed property tours.",
  },
  {
    question: "How long is each video?",
    answer: "Free plan videos are up to 15 seconds. All paid plans support videos up to 60 seconds, giving you plenty of time to showcase every room and feature.",
  },
  {
    question: "Is there a free trial?",
    answer: "Yes! All paid plans come with a 7-day free trial. You can also use our Free plan with 2 videos per month to test things out before committing.",
  },
  {
    question: "Do I need a credit card to sign up?",
    answer: "No credit card is required for the Free plan. You only need a credit card when you upgrade to a paid plan or start a free trial.",
  },
  {
    question: "Is there a file size limit for images?",
    answer: "Free and Starter plans support images up to 10MB each. Growth and Pro plans support up to 25MB per image for higher resolution photos.",
  },
  {
    question: "How do I get rid of the watermark in the video?",
    answer: "Watermarks are only on the Free plan. Upgrade to any paid plan (Starter, Growth, or Pro) to export videos without watermarks.",
  },
  {
    question: "What makes Property Motion a better real estate video editor than generic editing tools?",
    answer: "Property Motion is purpose-built for Australian real estate. It automatically imports listings from realestate.com.au and domain.com.au, adds agent branding, and creates professional videos in seconds — no editing skills required.",
  },
  {
    question: "My question isn't answered here. How can I get help?",
    answer: "Reach out to us at hello@propertymotion.com.au and we'll get back to you within 24 hours. Growth and Pro plan members also have access to priority human support.",
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
      { text: "Credits reset every month", included: false },
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
];

const enterpriseFeatures = [
  "100+ videos/month included",
  "20+ images per video",
  "60+ seconds per video",
  "Custom billing cycles",
  "Early access to new features",
  "API access",
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
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const testimonialRef = useRef<HTMLDivElement>(null);

  const handleSelectPlan = async (planId: string) => {
    if (planId === "free") {
      navigate(user ? "/create" : "/signup");
      return;
    }

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

  const scrollTestimonials = (direction: "left" | "right") => {
    const maxIndex = testimonials.length - 1;
    if (direction === "left") {
      setTestimonialIndex(Math.max(0, testimonialIndex - 1));
    } else {
      setTestimonialIndex(Math.min(maxIndex, testimonialIndex + 1));
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
          <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-3">
            Choose the <span className="text-gradient">perfect</span> plan for your needs
          </h2>
          <p className="text-center text-muted-foreground mb-8">
            Start for free, upgrade when you love it.
          </p>

          {/* Monthly / Yearly Toggle */}
          <div className="flex items-center justify-center mt-4 mb-12">
            <div className="inline-flex items-center bg-secondary rounded-full p-1">
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
                    : "text-primary hover:text-foreground"
                }`}
              >
                Yearly &middot; up to 30% off
              </button>
            </div>
          </div>

          {/* 4-Column Pricing Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto items-start">
            {pricingPlans.map((plan) => {
              const isYearly = billingPeriod === "yearly";
              const tier = isYearly ? plan.yearly : plan.monthly;
              const isFree = plan.id === "free";
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

                  {/* Strikethrough prices for yearly */}
                  {isYearly && !isFree && tier.discount > 0 && (
                    <div className="flex items-center gap-3 mt-1 mb-3">
                      <span className="text-sm text-muted-foreground line-through">A${plan.monthly.price}/month</span>
                      <span className="text-sm text-muted-foreground line-through">A${plan.monthly.perVideo}/video</span>
                    </div>
                  )}
                  {(!isYearly || isFree || tier.discount === 0) && <div className="h-4 mb-3" />}

                  {/* CTA Button */}
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

          {/* Enterprise Section */}
          <div className="max-w-6xl mx-auto mt-10">
            <div className="bg-card rounded-2xl border border-border p-8 md:p-10">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
                <div className="md:max-w-md">
                  <h3 className="text-xl font-bold text-primary mb-2">ENTERPRISE / API ACCESS</h3>
                  <p className="text-muted-foreground mb-6">
                    Need more? Get in touch for custom plans for your business needs.
                  </p>
                  <Button
                    variant="hero"
                    size="lg"
                    className="w-full md:w-auto"
                    asChild
                  >
                    <a href="mailto:hello@propertymotion.com.au">
                      Contact Us <ArrowRight className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-x-12 gap-y-3">
                  {enterpriseFeatures.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2.5 text-sm">
                      <Check className="w-4 h-4 flex-shrink-0 text-primary" />
                      <span className="text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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

      {/* Testimonials Section */}
      <section className="py-20 bg-primary/5">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 rounded-full border border-primary/30 text-primary text-sm font-semibold mb-6">
              TESTIMONIALS
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              What our users are saying
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Real estate media businesses, photographers, and agents are using Property Motion every day to boost their video marketing.
            </p>
          </div>

          {/* Testimonial Cards */}
          <div className="relative overflow-hidden">
            <div
              ref={testimonialRef}
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${testimonialIndex * (100 / 3)}%)` }}
            >
              {testimonials.map((testimonial, index) => (
                <div
                  key={index}
                  className="w-full md:w-1/3 flex-shrink-0 px-3"
                >
                  <div className="bg-card rounded-2xl p-8 shadow-card border border-border h-full">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary">
                          {testimonial.initials}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{testimonial.name}</p>
                        <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                      </div>
                    </div>
                    <p className="text-foreground leading-relaxed">
                      {testimonial.quote}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Carousel Controls */}
          <div className="flex items-center justify-center gap-4 mt-10">
            <button
              onClick={() => scrollTestimonials("left")}
              className="w-10 h-10 rounded-full border border-border bg-card flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-30"
              disabled={testimonialIndex === 0}
            >
              <ChevronLeft className="w-5 h-5 text-foreground" />
            </button>
            <div className="flex gap-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setTestimonialIndex(index)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    index === testimonialIndex
                      ? "bg-primary w-6"
                      : "bg-border hover:bg-muted-foreground"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => scrollTestimonials("right")}
              className="w-10 h-10 rounded-full border border-border bg-card flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-30"
              disabled={testimonialIndex >= testimonials.length - 1}
            >
              <ChevronRight className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 rounded-full border border-primary/30 text-primary text-sm font-semibold mb-6">
              FAQ
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Got questions? We've got <span className="text-gradient">answers</span>.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Everything you need to know about Property Motion in a nutshell.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 max-w-5xl mx-auto">
            {faqs.map((faq, index) => (
              <button
                key={index}
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-card transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <h4 className="font-semibold text-foreground text-sm">{faq.question}</h4>
                  <div className="flex-shrink-0 w-6 h-6 rounded-full border border-border flex items-center justify-center">
                    {openFaq === index ? (
                      <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                </div>
                {openFaq === index && (
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative">
        <div className="bg-gradient-to-br from-primary to-primary/80 rounded-t-[3rem] py-20 px-6">
          <div className="container mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Create your AI property videos today
            </h2>
            <p className="text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
              Property Motion helps creators, marketers, and real estate pros turn raw content into polished, platform-ready reels in minutes.
            </p>
            <Button asChild variant="secondary" size="xl" className="text-primary font-semibold">
              <Link to={user ? "/create" : "/signup"}>
                {user ? "Go to dashboard" : "Start Your Free Trial"}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
