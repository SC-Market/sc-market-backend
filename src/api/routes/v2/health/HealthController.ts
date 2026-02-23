/**
 * Health Check Controller
 *
 * Simple controller to verify TSOA setup is working correctly.
 */

import { Controller, Get, Route, Tags } from "tsoa"

interface HealthResponse {
  status: string
  version: string
  timestamp: string
}

@Route("health")
@Tags("Health")
export class HealthController extends Controller {
  /**
   * Health check endpoint
   * @summary Check API health status
   */
  @Get()
  public async getHealth(): Promise<HealthResponse> {
    return {
      status: "ok",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
    }
  }
}
