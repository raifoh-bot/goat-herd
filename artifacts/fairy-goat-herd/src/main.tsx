import { createRoot } from "react-dom/client";
import App from "./App";
import { initFarmSlug } from "./lib/farm";
import "./index.css";

// Apply the persisted farm slug (dev preview) before the first API call.
initFarmSlug();

createRoot(document.getElementById("root")!).render(<App />);
