import { contract } from '../../../../lib';

/**
 * What other modules may ask about users — WITHOUT importing anything else
 * from here. They import this file; the implementation stays private.
 *
 * The interface and the token share a name on purpose: TypeScript keeps types
 * and values in separate namespaces, so one import gives you both the shape
 * the compiler checks and the identity the container resolves.
 */
export interface UserDirectory {
  count(): Promise<number>;
  nameOf(userId: number): Promise<string | null>;
}

export const UserDirectory = contract<UserDirectory>('identity.directory');
