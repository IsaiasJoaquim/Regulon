import { createAiGatewayProvider } from './src/lib/ai-gateway.server.ts';

try {
  const provider = createAiGatewayProvider();
  console.log("Provider created successfully!");
} catch (e) {
  console.error("Error creating provider:", e.message);
}
