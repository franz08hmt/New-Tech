import { Controller, Get } from "@nestjs/common";

@Controller("assistant")
export class AssistantController {
  @Get("status")
  status() {
    return {
      status: "not_configured",
      provider: "disabled",
      mode: "preview",
      credentialsExposedToClient: false,
      fallback: "tasks_and_documents",
    };
  }
}
