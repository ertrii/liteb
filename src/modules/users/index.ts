import { Module } from '../../../lib';
import { GetUsersApi } from './apis/get-users.api';

export const module = new Module('users');
module.set(GetUsersApi);
