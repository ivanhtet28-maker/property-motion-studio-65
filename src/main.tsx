import { createRoot } from "react-dom/client";
import { initSentry } from "./lib/sentry";
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry before rendering (no-op if VITE_SENTRY_DSN is not set)
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
