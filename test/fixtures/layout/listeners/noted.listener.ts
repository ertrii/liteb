import { event, Listener, On } from '../../../../lib';

export const Noted = event<{ id: number }>('layout.noted');

@On(Noted)
export default class NotedListener extends Listener<{ id: number }> {
  public async on(): Promise<void> {
    // nada
  }
}
