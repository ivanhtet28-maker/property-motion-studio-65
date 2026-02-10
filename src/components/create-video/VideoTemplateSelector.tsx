import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  duration: string;
  image?: string;
}

const templates: VideoTemplate[] = [
  {
    id: "modern-luxe",
    name: "Modern Luxe",
    description: "4-5 sec intro",
    duration: "Sleek & contemporary",
  },
  {
    id: "just-listed",
    name: "Just Listed",
    description: "3-4 sec intro",
    duration: "Cinematic opening",
  },
  {
    id: "minimalist",
    name: "Minimalist",
    description: "2-3 sec intro",
    duration: "Clean aesthetic",
  },
  {
    id: "cinematic",
    name: "Cinematic",
    description: "5-6 sec intro",
    duration: "Dynamic cameras",
  },
  {
    id: "luxury",
    name: "Luxury",
    description: "4-5 sec intro",
    duration: "Gold accents",
  },
  {
    id: "real-estate-pro",
    name: "Real Estate Pro",
    description: "3-4 sec intro",
    duration: "Professional",
  },
];

interface VideoTemplateSelectorProps {
  selectedTemplate: string;
  onSelectTemplate: (templateId: string) => void;
}

export function VideoTemplateSelector({
  selectedTemplate,
  onSelectTemplate,
}: VideoTemplateSelectorProps) {
  const currentIndex = templates.findIndex(t => t.id === selectedTemplate);
  const currentTemplate = templates[currentIndex] || templates[0];

  const handlePrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : templates.length - 1;
    onSelectTemplate(templates[newIndex].id);
  };

  const handleNext = () => {
    const newIndex = currentIndex < templates.length - 1 ? currentIndex + 1 : 0;
    onSelectTemplate(templates[newIndex].id);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium flex items-center gap-2">
          🎬 Video Template Style
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Choose how your video will look
        </p>
      </div>

      {/* Carousel Container */}
      <div className="relative">
        {/* Navigation Buttons */}
        <Button
          variant="outline"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm"
          onClick={handlePrevious}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm"
          onClick={handleNext}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        {/* Template Preview Card */}
        <div className="relative rounded-xl border-2 border-primary bg-primary/5 p-4">
          {/* Checkmark */}
          <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center z-10">
            <Check className="w-4 h-4 text-primary-foreground" />
          </div>

          {/* Large Template Preview with Property Details */}
          <div className="w-full aspect-[9/16] max-h-[400px] rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex flex-col items-center justify-center relative overflow-hidden p-6">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"100\" height=\"100\" viewBox=\"0 0 100 100\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h50v50H0z\" fill=\"%23fff\" opacity=\".1\"/%3E%3C/svg%3E')",
                backgroundSize: "20px 20px"
              }}
            />
            <div className="z-10 text-center space-y-2">
              <div className="text-2xl font-bold text-white mb-3" style={{ textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
                {currentTemplate.name}
              </div>
              <div className="text-[11px] font-semibold text-white mb-2" style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}>
                123 Sample Street, Suburb, State
              </div>
              <div className="text-lg font-bold text-white mb-2" style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}>
                $750,000
              </div>
              <div className="text-xs font-medium text-white" style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}>
                3 Bedrooms | 2 Bathrooms
              </div>
              <div className="text-xs font-medium text-white" style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}>
                2 Car Spaces | 450m² Land Size
              </div>
            </div>
          </div>

          {/* Template Info Below Preview */}
          <div className="mt-4 text-center space-y-1">
            <p className="text-sm font-medium text-foreground">
              {currentTemplate.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {currentTemplate.description}
            </p>
            <p className="text-xs text-primary/70">
              {currentTemplate.duration}
            </p>
          </div>
        </div>

        {/* Dots Indicator */}
        <div className="flex justify-center gap-1.5 mt-3">
          {templates.map((template, index) => (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template.id)}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                index === currentIndex
                  ? "bg-primary w-6"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
              aria-label={`Select ${template.name}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
