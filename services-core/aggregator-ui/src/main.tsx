/** @file Mounts the application with global theme and contextual help providers. */

import { createRoot } from "react-dom/client";
import App from "./app/App";
import ContextualHelpProvider from "./components/about/core/ContextualHelpProvider";
import ThemeProvider from "./shared/theme/ThemeProvider";
import { loadRuntimeConfig } from "./shared/runtimeConfig";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element "#root" was not found');
}

void loadRuntimeConfig()
  .then(() => {
    createRoot(rootElement).render(
      <ThemeProvider>
        <ContextualHelpProvider>
          <App />
        </ContextualHelpProvider>
      </ThemeProvider>,
    );
  })
  .catch((error: unknown) => {
    console.error("Unable to start UI:", error);
    rootElement.textContent = "Unable to load application configuration.";
  });
