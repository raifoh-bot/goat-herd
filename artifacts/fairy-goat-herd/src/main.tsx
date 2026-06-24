import { createRoot } from "react-dom/client";
import App from "./App";
import { initFarmSlug } from "./lib/farm";
import { initAuthToken } from "./lib/token";
import "./index.css";

// Apply the persisted farm slug and bearer token before the first API call.
initFarmSlug();
initAuthToken();

createRoot(document.getElementById("root")!).render(<App />);
