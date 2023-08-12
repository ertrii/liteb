export type Type<T = Record<any, any>> = {
  new (...args: any[]): T;
};
