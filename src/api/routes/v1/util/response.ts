export function createResponse(data: any) {
  return {
    data,
  }
}

export function createErrorResponse(error: any) {
  return { error }
}

export type APIResponse = { data: any } | { error: any }
