import { Endpoint, HttpGet, Module } from '../../../lib';

@Module('yo')
@HttpGet('actual')
export class WhoAmIApi extends Endpoint {
  main() {
    return { userId: this.auth.actor.userId };
  }
}

/** Awaits mid-request, so two callers overlap inside `main()`. */
@Module('yo')
@HttpGet('lento')
export class SlowWhoAmIApi extends Endpoint {
  async main() {
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { userId: this.auth.actor.userId };
  }
}

@Module('yo')
@HttpGet('publico')
export class PublicApi extends Endpoint {
  main() {
    return {
      anonimo: !this.auth.isAuthenticated,
      actor: this.auth.optional,
    };
  }
}

@Module('yo')
@HttpGet('secreto')
export class SecretApi extends Endpoint {
  main() {
    this.auth.assert('secretos.ver');
    return { ok: true };
  }
}

/** Exige una clave que ningún módulo declara: un typo, básicamente. */
@Module('yo')
@HttpGet('roto')
export class TypoApi extends Endpoint {
  main() {
    this.auth.assert('secretos.vre');
    return { ok: true };
  }
}
