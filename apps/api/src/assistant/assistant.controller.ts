import { Controller, Get } from "@nestjs/common";

@Controller("assistant")
export class AssistantController {
  @Get("status")
  status() {
    const provider = process.env.AI_PROVIDER ?? "disabled";
    return {
      status: provider === "disabled" ? "not_configured" : "configured",
      provider,
      mode: "rag",
      credentialsExposedToClient: false,
      fallback: "document_search",
    };
  }
}
