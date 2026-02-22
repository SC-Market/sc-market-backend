import { Controller, Get, Route, Tags } from "tsoa";

/**
 * Health check controller
 * This is a placeholder controller to enable TSOA generation
 */
@Route("api/v1/health")
@Tags("Health")
export class HealthController extends Controller {
  /**
   * Health check endpoint
   * @summary Check if the API is running
   */
  @Get()
  public async getHealth(): Promise<{ status: string; timestamp: string }> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
