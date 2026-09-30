import { users, type User } from '../tables/user.table';

/**
 * What a user is, seen from OUTSIDE this module.
 *
 * This replaces a rule that was written three times, in three comments, in
 * three endpoints — name the columns, the password must not leave the process
 * — while the one place that legitimately needs the hash looked exactly like a
 * place that had forgotten. Here the safe shape is the default and the
 * exception has a name.
 *
 * Nothing in this file runs a query or touches `db`. It declares which columns
 * a caller may ask for, and converts a row someone already has. That is what
 * makes it testable with no database, and what makes it the same artifact
 * whether the caller is another module or something outside the process.
 */
export const publicColumns = {
  id: users.id,
  username: users.username,
  fullName: users.fullName,
  role: users.role,
};

export type PublicUser = Pick<User, 'id' | 'username' | 'fullName' | 'role'>;

/**
 * The only shape that carries the hash — named after the case that needs it,
 * not after the field, so `grep loginColumns` is the entire audit of who may
 * see it. A sensitive column added to the table joins neither set on its own.
 */
export const loginColumns = { ...publicColumns, password: users.password };

export type LoginUser = PublicUser & Pick<User, 'password'>;

/**
 * For a row already in hand.
 *
 * Written out field by field, never spread: a spread carries whatever the row
 * happens to have, which is the failure this file exists to prevent.
 */
export const asPublic = (row: PublicUser): PublicUser => ({
  id: row.id,
  username: row.username,
  fullName: row.fullName,
  role: row.role,
});
