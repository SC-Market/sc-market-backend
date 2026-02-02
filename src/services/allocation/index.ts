/**
 * Allocation Service Module
 * 
 * Exports allocation service, repository, and types.
 */

export { AllocationService, InsufficientStockError, AllocationValidationError } from './allocation.service.js'
export { AllocationRepository } from './repository.js'
export * from './types.js'
