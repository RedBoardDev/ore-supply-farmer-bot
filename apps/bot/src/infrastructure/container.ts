/**
 * Dependency Injection Container
 *
 * IoC container for dependency management.
 */

type Constructor<T = any> = new (...args: any[]) => T;
type Factory<T = any> = () => T;
type Token<T = any> = string | symbol | Constructor<T>;

interface Registration<T> {
  singleton: boolean;
  instance?: T;
  factory: Factory<T>;
}

export class Container {
  private registrations = new Map<Token<any>, Registration<any>>();
  private instances = new Map<Token<any>, any>();

  register<T>(
    token: Token<T>,
    factory: Factory<T>,
    options: { singleton?: boolean } = {}
  ): this {
    this.registrations.set(token, {
      singleton: options.singleton ?? true,
      factory,
    });
    return this;
  }

  registerInstance<T>(token: Token<T>, instance: T): this {
    this.registrations.set(token, {
      singleton: true,
      instance,
      factory: () => instance,
    });
    return this;
  }

  resolve<T>(token: Token<T>): T {
    // Singleton checker
    if (this.instances.has(token)) {
      return this.instances.get(token);
    }

    // Registration checker
    const registration = this.registrations.get(token);
    if (!registration) {
      throw new Error(`No registration found for token: ${String(token)}`);
    }

    // Instance creator
    const instance = registration.factory();

    // Singleton storage
    if (registration.singleton && instance !== undefined) {
      this.instances.set(token, instance);
    }

    return instance;
  }

  has(token: Token<any>): boolean {
    return this.registrations.has(token);
  }

  clear(): void {
    this.registrations.clear();
    this.instances.clear();
  }
}

// Singleton container instance
let globalContainer: Container | null = null;

export function getGlobalContainer(): Container {
  if (!globalContainer) {
    globalContainer = new Container();
  }
  return globalContainer;
}

export function setGlobalContainer(container: Container): void {
  globalContainer = container;
}
