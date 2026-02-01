import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PropertyDetails {
  streetAddress: string;
  suburb: string;
  state: string;
  price: string;
  bedrooms: number;
  bathrooms: number;
  carSpaces: number;
  landSize: string;
  features: string[];
}

const bedroomOptions = [0, 1, 2, 3, 4, 5];
const bathroomOptions = [0, 1, 2, 3, 4, 5];
const carOptions = [0, 1, 2, 3, 4, 5];

const featureOptions = [
  "Pool",
  "Garage",
  "Renovated Kitchen",
  "Ocean View",
  "Garden",
  "Solar",
  "Fireplace",
  "Smart Home",
];

interface PropertyDetailsFormProps {
  details: PropertyDetails;
  onChange: (details: PropertyDetails) => void;
}

export function PropertyDetailsForm({ details, onChange }: PropertyDetailsFormProps) {
  const toggleFeature = (feature: string) => {
    const newFeatures = details.features.includes(feature)
      ? details.features.filter((f) => f !== feature)
      : [...details.features, feature];
    onChange({ ...details, features: newFeatures });
  };

  const ToggleButtonGroup = ({
    label,
    options,
    value,
    onChange: onValueChange,
    suffix,
  }: {
    label: string;
    options: number[];
    value: number;
    onChange: (val: number) => void;
    suffix?: string;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onValueChange(opt)}
            className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all ${
              value === opt
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            }`}
          >
            {opt === 5 ? "5+" : opt}
            {suffix}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Property Details</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-4 mb-4">Enter address and key details</p>

      {/* Address Row */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="street">Street Address</Label>
          <Input
            id="street"
            placeholder="27 Alamanda Boulevard"
            value={details.streetAddress}
            onChange={(e) => onChange({ ...details, streetAddress: e.target.value })}
            className="h-11"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="suburb">Suburb</Label>
            <Input
              id="suburb"
              placeholder="Point Cook"
              value={details.suburb}
              onChange={(e) => onChange({ ...details, suburb: e.target.value })}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              placeholder="VIC"
              value={details.state}
              onChange={(e) => onChange({ ...details, state: e.target.value })}
              className="h-11"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="price"
              placeholder="1,250,000"
              value={details.price}
              onChange={(e) => onChange({ ...details, price: e.target.value })}
              className="h-11 pl-7"
            />
          </div>
        </div>
      </div>

      {/* Property Stats */}
      <div className="space-y-4">
        <ToggleButtonGroup
          label="Bedrooms"
          options={bedroomOptions}
          value={details.bedrooms}
          onChange={(val) => onChange({ ...details, bedrooms: val })}
        />
        <ToggleButtonGroup
          label="Bathrooms"
          options={bathroomOptions}
          value={details.bathrooms}
          onChange={(val) => onChange({ ...details, bathrooms: val })}
        />
        <ToggleButtonGroup
          label="Car Spaces"
          options={carOptions}
          value={details.carSpaces}
          onChange={(val) => onChange({ ...details, carSpaces: val })}
        />

        <div className="space-y-2">
          <Label htmlFor="landSize">Land Size</Label>
          <div className="relative">
            <Input
              id="landSize"
              placeholder="372"
              value={details.landSize}
              onChange={(e) => onChange({ ...details, landSize: e.target.value })}
              className="h-11 pr-12"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              m²
            </span>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-3">
        <Label>Features</Label>
        <div className="flex flex-wrap gap-2">
          {featureOptions.map((feature) => (
            <button
              key={feature}
              onClick={() => toggleFeature(feature)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                details.features.includes(feature)
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              }`}
            >
              {details.features.includes(feature) && "✓ "}
              {feature}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
