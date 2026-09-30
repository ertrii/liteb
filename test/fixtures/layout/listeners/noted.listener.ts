import { token, Listener, On } from '../../../../lib';

export const Noted = token<{ id: number }>('layout.noted', 'event');

@On(Noted)
export default class NotedListener extends Listener<{ id: number }> {
  public async on(): Promise<void> {
    // nada
  }
}
