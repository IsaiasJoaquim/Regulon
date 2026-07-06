import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { createRoot } from "react-dom/client";

// Export startInstance so routeTree.gen.ts doesn't break
export const startInstance = { getOptions: () => ({}) };

const router = getRouter();

const rootElement = document.getElementById("root")!;

if (rootElement && !rootElement.hasAttribute("data-mounted")) {
  rootElement.setAttribute("data-mounted", "true");
  const root = createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
