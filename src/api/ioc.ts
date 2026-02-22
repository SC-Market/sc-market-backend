/**
 * Inversion of Control (IoC) container for TSOA
 * This module provides dependency injection for TSOA controllers
 */

import { IocContainer } from "@tsoa/runtime";

/**
 * Simple IoC container implementation
 * Controllers are instantiated directly without dependencies for now
 */
export const iocContainer: IocContainer = {
  get<T>(controller: { new (): T }): T {
    return new controller();
  },
};
