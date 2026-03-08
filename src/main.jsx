import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../opening_range_box_dashboard.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
