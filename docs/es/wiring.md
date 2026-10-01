# Cableado entre módulos

Dos módulos instalables tienen que poder hablarse sin conocerse. Esta página es
el detalle de las tres formas de hacerlo — **contrato**, **evento** y **slot** —,
qué garantiza cada una, qué se rompe al arrancar y qué se rompe recién en
producción.

La versión corta está en [la guía](./guide.md#llamar-a-otro-módulo). Acá está el
por qué de cada regla, y lo que pasa en los bordes.

| | |
| --- | --- |
| [1. Por qué no se importan](#1-por-qué-no-se-importan) | el costo de un import directo |
| [2. Las tres formas](#2-las-tres-formas) | y cómo elegir entre ellas |
| [3. El token](#3-el-token-lo-único-que-cruza-el-límite) | lo único que cruza el límite |
| [4. Contratos](#4-contratos) | una capacidad, un proveedor |
| [5. Slots](#5-slots) | un punto de extensión, muchos aportes |
| [6. Eventos](#6-eventos) | un anuncio, sin respuesta |
| [7. Quién alcanza qué](#7-quién-alcanza-qué) | la tabla de inyecciones |
| [8. Qué se ve al arrancar](#8-qué-se-ve-al-arrancar) | y qué significa el silencio |
| [9. Quitar un módulo](#9-quitar-un-módulo) | qué desaparece con él |
| [10. Los errores](#10-los-errores-palabra-por-palabra) | palabra por palabra |
| [11. Antipatrones](#11-antipatrones) | lo que parece funcionar |
| [12. Un flujo completo](#12-un-flujo-completo) | los tres mecanismos juntos |

---

## 1. Por qué no se importan

Supongamos que `sales` necesita emitir un cargo y lo hace derecho:

```typescript
// ❌ sales/endpoints/create-sale.endpoint.ts
import { BillingServiceProvider } from '../../billing/providers/billing-service.provider';
```

Compila, anda, y a partir de ahí:

- **`billing` no se puede apagar.** Apagarlo no saca el import, así que `sales`
  sigue construyendo ese proveedor a mano y usando una implementación que la
  aplicación cree desactivada.
- **No se puede reemplazar.** Cambiar de proveedor implica editar a todos los que
  lo llaman, y si `billing` es un módulo que instalaste, editar código que no es
  tuyo.
- **Se arrastra su árbol entero.** El import trae las entidades, la configuración
  y lo que ese archivo importe a su vez, al arrancar, aunque la petición nunca
  pase por ahí.
- **El orden de carga empieza a importar**, y con dos imports cruzados aparece un
  `undefined` en tiempo de módulo que no dice nada sobre la causa.
- **El CLI no puede instalar uno sin el otro**, porque la dependencia no está
  declarada en ningún lado: está adentro de un `import`.

El cableado parte esa dependencia en dos mitades. Una **promesa**, que se
importa: una interfaz y un token. Un **cumplimiento**, que no se importa nunca:
la clase que la responde. Quien llama depende de la promesa, y la promesa no
depende de nada.

### Cuándo un import directo SÍ va

La lista de arriba no se aplica entera a cualquier aplicación, y tratarla como
si se aplicara es lo que llena de ceremonia un proyecto que no la necesita.
Empecemos por la pregunta de la que cuelga todo:

> **Un módulo es la unidad de instalación. La prueba es: ¿puede estar ausente?**

Si la respuesta es "nunca", eso no es un módulo instalable: es una **carpeta**,
una división del código para que la gente se oriente. Las dos cosas se declaran
igual en liteb —`defineModule()`— y ahí está la trampa: la palabra hace dos
trabajos.

Para una aplicación donde **ningún módulo se apaga** (todos `core: true`, y quién
ve qué lo deciden los permisos, no la instalación), de los cinco costos de arriba
sobreviven dos y medio:

| Costo del import directo | ¿Sigue valiendo con módulos siempre presentes? |
| --- | --- |
| no se puede apagar | **no** — nada se apaga |
| el CLI no puede instalar uno sin el otro | **no** — se instalan juntos siempre |
| no se puede reemplazar | **a medias** — es disciplina, no necesidad, si el código es tuyo |
| arrastra su árbol entero al arrancar | **sí** — el import carga todo aunque la petición nunca pase |
| el orden de carga empieza a importar | **sí** — dos imports cruzados siguen dando un `undefined` mudo |

O sea: quedan un costo de arranque y un riesgo de ciclos. Reales, pero no son el
argumento de "dos módulos tienen que poder no conocerse", porque en ese
escenario **siempre se conocen**.

De ahí la regla:

> **Si dos módulos siempre van juntos y ninguno va a estar sin el otro,
> importá directo. El cableado no se justifica solo.**
>
> **Las tres formas de esta página son la superficie de EXTENSIÓN** — lo que
> permite que algo que no escribiste, o que puede no estar instalado, participe.
> No son el tejido por defecto entre carpetas del mismo producto.

Un cableado bien puesto es la excepción visible, y por eso se lee con atención.
Cuando es el tejido por defecto, deja de decir nada: si todo pasa por un token,
el token dejó de señalar un límite.

Dónde sigue valiendo la pena aunque nada se apague:

- Cuando de verdad querés poder **cambiar la implementación** sin tocar a quien
  llama — una pasarela, un proveedor de mensajería, un almacenamiento.
- Cuando el otro lado lo escribe **alguien más**, ahora o después.
- Cuando el que avisa **no debe romperse** si quien reacciona falla: eso es un
  evento, y no tiene sustituto por import.

## 2. Las tres formas

| | Qué dice | Cuántos responden | Quién lee | Si no hay nadie | Si falla |
| --- | --- | --- | --- | --- | --- |
| **Contrato** `this.get()` | «dame esto» | exactamente uno | quien llama, y espera | error | falla quien llamó |
| **Slot** `this.all()` | «quien pueda, que se presente» | los que haya | el módulo que lo abrió | arreglo vacío, normal | falla quien leyó |
| **Evento** `this.emit()` | «esto pasó» | los oyentes que haya | nadie | normal | se registra, nadie falla |

Tres preguntas alcanzan para elegir:

1. **¿Necesitás la respuesta para seguir?** → contrato. Si el resultado cambia lo
   que contestás, no es un aviso.
2. **¿Vas a enumerar a quien esté instalado?** → slot. Si la lista puede crecer
   con un módulo que todavía no existe, no es un contrato.
3. **¿Terminaste tu trabajo y sólo querés que otros se enteren?** → evento.

El caso límite útil: si escribís `await this.emit(...)` y después necesitás saber
si salió bien, elegiste mal. Un evento no tiene respuesta y no propaga fallos;
pedirle las dos cosas es un contrato escrito al revés.

## 3. El token: lo único que cruza el límite

```typescript
// billing/tokens/billing-service.token.ts
import { token } from 'liteb';

export interface BillingService {
  issueCharge(input: IssueChargeInput): Promise<Charge>;
}

export const BillingService = token<BillingService>(
  'billing.service',
  'contract',
);
```

**La interfaz y la constante comparten nombre a propósito.** TypeScript guarda
tipos y valores en espacios separados, así que un solo import te da las dos
cosas: la forma que chequea el compilador y la identidad que resuelve el
contenedor. No hay un `BillingServiceToken` al lado de un `IBillingService`.

Lo que lleva el token:

- **`id`** — la identidad en tiempo de ejecución, y lo único que aparece en los
  errores y en el log de arranque. Poné el id del módulo de prefijo
  (`billing.service`), porque todos los módulos comparten un mismo espacio de ids
  y el prefijo es lo que evita que dos reclamen el mismo.
- **`T`** — sólo en tiempo de compilación, en un campo fantasma que nunca se
  escribe. Es lo que hace que `this.get(BillingService)` devuelva el tipo correcto
  sin un cast.
- **`kind`** — `'contract'`, `'slot'` o `'event'`, que es el segundo argumento
  de `token()`. Sin ese campo los tres serían estructuralmente idénticos y cada
  uno se podría pasar donde va otro, que es la única confusión que importa acá.

Los tres se declaran con **una sola función**, porque se diferencian en una sola
cosa: cuántos pueden responder. Nombrarlo en la llamada lo convierte en una
propiedad del token, que es de donde lo lee todo lo demás — `@Provides` para
saber si registra la única implementación o una de varias, y el contenedor para
decidir entre devolver una instancia y devolver una lista. Nada lo repite: un
segundo lugar donde decirlo sería un segundo lugar donde decirlo mal.

```typescript
token<BillingService>('billing.service', 'contract'); // exactamente uno
token<ProductBadge>('catalog.product-badges', 'slot'); // los que haya
token<ProductRestocked>('catalog.product.restocked', 'event'); // sin respuesta
```

Dónde vive cada archivo, y qué comando lo escribe:

| Carpeta | Qué hay | Comando |
| --- | --- | --- |
| `tokens/*.token.ts` | los tres: contratos, slots y eventos | [`liteb token`](./cli.md#liteb-token-modulename-kind) |
| `providers/*.provider.ts` | lo que responde un contrato o llena un slot | [`liteb provider`](./cli.md#liteb-provider-modulename) |
| `listeners/*.listener.ts` | lo que reacciona a un evento | [`liteb listener`](./cli.md#liteb-listener-modulename) |

`providers/` y `listeners/` son globs: la carpeta es lo que los registra, y el
decorador dice a qué token responden. `tokens/` **no** es un glob — un token se
importa por nombre, así que no hay nada que descubrir. Es una convención para
las personas, y es donde el CLI los escribe.

**Los tres tipos van juntos ahí.** Tuvieron una carpeta cada uno, y era pedirte
archivar una decisión que ya está tomada dentro del archivo: el segundo
argumento de `token()` dice cuántos pueden responder, y eso es lo único en lo
que se diferencian.

> **La regla, en una línea:** de otro módulo importás su token y nada más. Si te
> encontrás importando su proveedor, su entidad o su DTO, falta cableado.

## 4. Contratos

### Las dos mitades

```typescript
// billing/providers/billing-service.provider.ts — cómo se cumple
@Provides(BillingService)
export class BillingServiceProvider
  extends Provider
  implements BillingService
{
  async issueCharge(input: IssueChargeInput) {
    // ...
  }
}
```

Nada lista esta clase. La carpeta la encuentra, `@Provides` dice qué contrato
responde, y el nombre del archivo no importa mientras termine en `.provider.ts`.

Lo mismo vale para un aporte a un slot: misma clase base, misma carpeta y el
mismo decorador — ver
[El contribuyente es un `Provider`](#el-contribuyente-es-un-provider).

Un `Provider` sin `@Provides` se saltea con un aviso en vez de detener el
arranque, igual que un endpoint sin verbo: un archivo a medio escribir no es una
instalación rota.

```
[WARN] Provider BillingServiceProvider in module "billing" has no
@Provides(token) and was skipped.
```

### Quien llama

```typescript
@Group('sales')
@HttpPost('/')
export default class CreateSale extends Endpoint<never, CreateSaleDto> {
  async main() {
    const billing = this.get(BillingService);
    const charge = await billing.issueCharge({ ... });
    return { chargeId: charge.id };
  }
}
```

`this.get()` está en un endpoint, una rutina, un proveedor y un oyente — ver
[la tabla de inyecciones](#7-quién-alcanza-qué).

### `consumes`: mover el fallo al arranque

```typescript
// sales/module.ts
export default defineModule({
  id: 'sales',
  version: '1.0.0',
  dir: __dirname,
  consumes: [BillingService],
});
```

liteb no puede ver qué contratos llama un módulo leyendo su código: `this.get()`
corre adentro de un método, cuando ya hay una petición en curso. Declararlo es lo
que compra la comprobación al arrancar:

```
ContractError: Module "sales" consumes the contract "billing.service",
which no enabled module provides.
```

Sin `consumes`, esa misma falta aparece en la primera petición que la necesitó —
en producción, en el endpoint al que llegó el primer usuario, como un 500:

```
ContractError: No module provides the contract "billing.service". Check that
the module providing it is installed and enabled.
```

Es lo mismo, reportado en dos momentos muy distintos. `consumes` es una
declaración, no lógica, y por eso vive en el manifiesto.

### Exactamente un proveedor

```
ContractError: Contract "billing.service" is provided by both "billing" and
"billing-legacy". Exactly one module can provide it.
```

Dos módulos respondiendo el mismo contrato se rechaza al registrar, no se
resuelve por orden de carga. Si se resolviera por orden, quien llama recibiría
uno de los dos según cómo quedó la topología de dependencias ese día, y eso
cambia entre despliegues sin que nadie toque el código.

Reemplazar una implementación es entonces explícito: apagás el módulo que la
provee y encendés el otro.

### Se construye tarde, y se reutiliza

La implementación se construye **la primera vez que alguien la pide**, no al
arrancar, y desde ahí se reutiliza la misma instancia.

- Un contrato que nadie llama no cuesta nada: ni una conexión, ni un repositorio,
  ni el import de lo que ese archivo necesite.
- El arranque no se cuelga por algo que necesita un solo endpoint.
- Como es una instancia por aplicación, un proveedor puede cachear adentro. Lo que
  no puede es guardar estado por petición: no hay una instancia por petición.

### La inyección llega antes del constructor

`db`, `container` y `events` se ponen en el **prototipo** antes de construir, y
después se copian en la instancia. Eso es lo que hace que un inicializador de
campo funcione:

```typescript
export class BillingServiceProvider extends Provider {
  // Esto corre antes del cuerpo del constructor, y `this.db` ya está. Acá se
  // nota para qué sirve: la consulta se PREPARA una sola vez, cuando se
  // construye la clase, y cada llamada reusa el plan.
  private readonly pendientes = this.db
    .select()
    .from(charges)
    .where(isNull(charges.paidAt))
    .prepare('cargos_pendientes');
}
```

Se copian en la instancia además de dejarlos en el prototipo para **fijarlos**:
si una segunda aplicación en el mismo proceso registra la misma clase, no cambia
lo que esta ya construyó.

### Un contenedor por aplicación

No hay un singleton de proceso. Dos aplicaciones en el mismo proceso — una suite
de tests y un servidor, o un worker al lado — no ven las implementaciones de la
otra. Es lo que hace que un test pueda arrancar una aplicación con otro conjunto
de módulos sin ensuciar a la siguiente.

Si un proveedor o un oyente se construye fuera de una aplicación, `this.get()` lo
dice con la causa en vez de dejar un `undefined`:

```
Cannot resolve the contract "billing.service": this application has no modules.
Start it with Liteb.create({ modules }).
```

### Ciclos

Dos implementaciones pidiéndose entre sí recursionarían hasta agotar la pila, con
una traza que no nombra ningún contrato. Se corta y se nombra:

```
ContractError: Contract "billing.service" is being resolved while it is still
being built: its implementation depends on itself.
```

El mensaje dice «depende de sí mismo» porque desde el contenedor eso es lo único
observable: el ciclo se detecta en el token que se estaba construyendo cuando se
lo volvió a pedir. Si son dos contratos en círculo, empezá por ese.

Salir de un ciclo real es casi siempre una de tres: mover lo compartido a un
tercer módulo del que dependan los dos, convertir una de las dos direcciones en un
evento (si esa dirección era sólo un aviso), o abrir un slot (si era «el core
llamando a su extensión»).

### Diagnóstico

```typescript
this.container.has(BillingService); // ¿alguien lo provee?
this.container.providerOf(BillingService); // 'billing' | null
this.container.ids(); // todos los contratos registrados
```

`providerOf()` es para cuando la pregunta es _cuál_ de dos módulos quedó
respondiendo, que es lo que querés saber mientras migrás una implementación.

## 5. Slots

Un slot es un punto de extensión: un lugar que un módulo **abre** y que muchos
pueden llenar.

```typescript
// catalog/tokens/product-badges.token.ts
export interface ProductBadge {
  id: string;
  for(product: { id: number; stock: number }): string | null;
}

export const ProductBadges = token<ProductBadge>(
  'catalog.product-badges',
  'slot',
);
```

```typescript
// reports/providers/low-stock-badge.provider.ts
@Provides(ProductBadges)
export class LowStockBadge extends Provider implements ProductBadge {
  readonly id = 'low-stock';

  for(product) {
    return product.stock < 10 ? 'Low stock' : null;
  }
}
```

```typescript
// catalog lee a quien haya aparecido
const badges = this.all(ProductBadges);
```

### La dirección de la dependencia

Es lo único que hay que entender de un slot, y es al revés de lo que parece.

**El módulo que abre el slot no depende de nadie.** `catalog` no sabe qué badges
van a existir, no los importa y no cambia cuando aparece uno nuevo. Son las
extensiones las que dependen de `catalog`: `reports` importa su token.

Si fuera al revés — `catalog` importando sus badges — el core dependería de sus
propias extensiones, ninguna se podría quitar, e instalar una nueva implicaría
editar `catalog`.

### Dos nombres, no uno

Un contrato tiene un nombre. Un slot tiene **dos**, y confundirlos es el error
típico:

| | Qué es | Quién lo usa |
| --- | --- | --- |
| `ProductBadge` | la forma de **un** aporte | lo `implements` un contribuyente |
| `ProductBadges` | el token de la **colección** | va en `@Provides` y en `this.all()` |

El plural en el token de la colección es una convención, no una regla: lo que
liteb chequea es `kind`, no el nombre.

### El contribuyente es un `Provider`

Un aporte no es una clase nueva que haya que aprender: es un
[`Provider`](#4-contratos) como el que responde un contrato, y todo lo de la
sección anterior vale igual.

| | Responder un contrato | Llenar un slot |
| --- | --- | --- |
| Clase base | `extends Provider` | `extends Provider` |
| Carpeta | `providers/*.provider.ts` | `providers/*.provider.ts` |
| Decorador | `@Provides(Contrato)` | `@Provides(Slot)` — el mismo |
| Qué `implements` | la interfaz del contrato | la interfaz de **un** aporte |
| Cuántos por token | exactamente uno | los que haya |
| Se construye | en el primer `this.get()` | en el primer `this.all()` |
| Inyecciones | `db`, `get()`, `all()`, `emit()` | las mismas |
| Comando | `liteb provider <mod>/<name>` | el mismo con `--slot <name>` |

No hay una carpeta `contributions/`, ni una clase `Contribution`, ni un segundo
decorador. `@Provides` sirve para los dos porque es **una sola pregunta** —de qué
token es la implementación esta clase— y el token ya dice si tiene un proveedor o
muchos: el contenedor decide entre una instancia y una lista mirando `kind`, no
mirando cómo se declaró la clase.

Lo único que `@Provides` rechaza es un token de evento, porque un evento no lo
provee nadie:

```
@Provides() takes a contract or an extension point, and got an event. Nothing
provides an event: a module announces it with this.emit(), and a Listener
reacts to it with @On().
```

> Antes había dos decoradores, y `@Contributes` existía para atajar el caso de
> pasar un slot donde iba un contrato. Ese error desapareció solo al mover el
> `kind` al token: se afirmaba en dos lugares —el token y el nombre del
> decorador— y dos lugares que pueden discrepar son la única razón por la que
> hacía falta un error de "los cruzaste".

**Lo único que importás es el archivo del slot**, del módulo que lo abrió. Ese
import te da las dos mitades a la vez — la interfaz que vas a `implements` y el
token que va en el decorador:

```typescript
// reports/providers/low-stock-badge.provider.ts
import { Provider, Provides } from 'liteb';
import {
  ProductBadge,
  ProductBadges,
} from '@/catalog/tokens/product-badges.token';

@Provides(ProductBadges)
export class LowStockBadge extends Provider implements ProductBadge {
  readonly id = 'low-stock';

  for(product: { id: number; stock: number }) {
    return product.stock < 10 ? 'Low stock' : null;
  }
}
```

El comando lo escribe con ese import como marcador, para que reemplaces
`<module>` por el módulo que abrió el slot:

```bash
npx liteb provider reports/low-stock --slot product-badges
```

- **`--slot` es el nombre del slot, no el del aporte.** De ahí salen el archivo
  (`tokens/product-badges.token`), el token (`ProductBadges`) y la interfaz
  (`ProductBadge`); el `<module>/<name>` de adelante sigue siendo tu módulo y tu
  clase.
- **La forma la define el slot, no liteb.** El `id` de los ejemplos está porque
  `ProductBadge` lo pide; el framework no le exige ningún campo a un aporte.
- **Un token por clase.** El decorador guarda uno solo, así que apilar dos no
  suma: para llenar dos slots, dos clases.
- **Un mismo módulo puede aportar varias veces al mismo slot** — dos clases, dos
  entradas en el arreglo. Es lo normal en un módulo que agrega, por ejemplo, dos
  métodos de pago.

### Nada que declarar, y qué declarar igual

En el manifiesto **no existe un `contributes`**, y tampoco un `consumes` para
slots. Es a propósito: un aporte que falta es un arreglo más corto, no un fallo,
así que no hay nada que comprobar al arrancar.

Lo que sí conviene declarar es la dependencia entre los módulos, cuando el tuyo
existe sólo para llenar ese punto:

```typescript
// reports/module.ts
requires: ['catalog'],
```

Es lo más cercano a un `consumes` que hay para un slot. Con eso, un `catalog`
que no está se reporta al arrancar, antes de que falle el import del token:

```
ModuleResolutionError: Module "reports" requires "catalog", which is not installed.
ModuleResolutionError: Module "reports" requires "catalog", which is not installed.
```

Sin `requires`, apagar `catalog` deja a `reports` registrando un aporte que
nadie lee — inofensivo, pero silencioso.

### Vacío es una respuesta

Un slot que nadie llenó devuelve `[]`, y eso es normal: es una función que nadie
instaló. El módulo que lo abre tiene que leerlo así — un `[]` no es un caso de
error que haya que reportar, es la página sin badges.

### El orden, la caché y los ciclos

- **El orden es el de registro**, que a esa altura es orden de dependencias, así
  que es estable entre arranques. No lo uses como prioridad: si el orden importa
  de verdad, poné el criterio en la interfaz del aporte (un `order`, un
  `priority`) y ordená al leer.
- Los aportes **se construyen en la primera lectura y se cachean**, igual que la
  implementación de un contrato.
- Un aporte que pide el slot al que pertenece se corta y se nombra, en vez de
  agotar la pila:

```
ContractError: Extension point "catalog.product-badges" is being filled while
it is still being filled: a contribution asks for the slot it belongs to.
```

### Cuándo un slot y cuándo un contrato

| Si… | Entonces |
| --- | --- |
| hay una sola respuesta correcta y la necesitás | contrato |
| la lista puede crecer con un módulo que todavía no existe | slot |
| quien lee es el que abrió el punto | slot |
| quien lee es un tercero que pide una capacidad | contrato |
| un cero significa «nadie lo instaló» | slot |
| un cero significa «falta un módulo» | contrato, declarado en `consumes` |

## 6. Eventos

```typescript
// catalog/tokens/product-restocked.token.ts
export interface ProductRestocked {
  productId: number;
  quantity: number;
}

export const ProductRestocked = token<ProductRestocked>(
  'catalog.product.restocked',
  'event',
);
```

```typescript
// en un endpoint, una rutina o un proveedor de `catalog`
await this.emit(ProductRestocked, { productId, quantity });
```

```typescript
// reports/listeners/restock-log.listener.ts
@On(ProductRestocked)
export class RestockLog extends Listener<ProductRestocked> {
  async on(payload: ProductRestocked) {
    // ...
  }
}
```

No hay nada que declarar en el manifiesto: el archivo va en `listeners/` y el
decorador dice a qué token responde. Uno sin `@On` se saltea con un aviso, como
un proveedor sin decorador.

### Emitir es avisar

- **Todos los oyentes corren**, en paralelo, y `emit()` resuelve cuando todos
  terminaron. No hay orden garantizado entre ellos.
- **Un oyente que lanza no hace fallar a quien emitió.** El fallo se registra con
  el nombre de la clase, el módulo y el evento, y la petición sigue:

```
[ERROR] Listener RestockLog (module "reports") failed on
"catalog.product.restocked"
```

- **Un evento que nadie escucha no es un error.** Es el punto: `emit()` con cero
  oyentes vuelve enseguida.
- `await` sobre `emit()` te espera a los efectos, no a un resultado: no hay
  resultado. Si te importa el resultado, era un contrato.

### El tipado de la carga

El genérico ata el token con el oyente. Un oyente que **declara** su parámetro se
chequea contra el token, así que un campo renombrado no puede llegar en silencio
a un manejador que todavía espera el viejo.

Un oyente que ignora la carga (`on() {}`) compila contra cualquier token, y eso
es inofensivo: no puede malinterpretar un campo que nunca lee.

### Un oyente no emite

Un `Listener` tiene `db`, `get()` y `all()`, pero **no** `emit()`. El efecto es
que una cadena de eventos no se arma sola: para que un oyente provoque otro
anuncio tiene que pasar por un contrato, donde el módulo dueño de ese evento
decide si corresponde emitirlo. Un endpoint, una rutina y un proveedor sí emiten.

### La trampa de la transacción

Los oyentes leen en **su propia conexión**. Emitir adentro de `db.transaction()`
significa que no van a ver las filas sin confirmar:

```typescript
// ❌ el oyente busca el cargo y no lo encuentra
await this.db.transaction(async (manager) => {
  const charge = await manager.save(newCharge);
  await this.emit(ChargeCreated, { chargeId: charge.id });
});

// ✅ emitir después de que confirme
const charge = await this.db.transaction((manager) => manager.save(newCharge));
await this.emit(ChargeCreated, { chargeId: charge.id });
```

La otra salida es poner en la carga todo lo que el oyente necesita, y que no
tenga que leer nada. Sirve para cargas chicas; en cuanto el oyente necesita el
resto de la fila, emitir después es más simple que hacer crecer la carga.

### Lo que un evento no es

El bus es **en proceso**: no hay cola, no hay reintento, no persiste y no cruza
al worker de al lado. Si el proceso se cae entre el commit y el `emit()`, ese
efecto se perdió y nada lo va a recuperar.

Para un efecto que no se puede perder, el patrón es escribir la intención en una
fila dentro de la misma transacción y que una [rutina](./guide.md#rutinas) la
procese. El evento sirve para el resto, que es la mayoría: un log, un aviso, un
contador, una caché que se invalida.

## 7. Quién alcanza qué

| | `this.db` | `this.get()` | `this.all()` | `this.emit()` |
| --- | --- | --- | --- | --- |
| `Endpoint` | ✅ | ✅ | ✅ | ✅ |
| `Routine` | ✅ | ✅ | ✅ | ✅ |
| `Provider` | ✅ | ✅ | ✅ | ✅ |
| `Listener` | ✅ | ✅ | ✅ | — |

Las cuatro reciben lo mismo por la misma vía y antes de construir la instancia,
así que un inicializador de campo puede alcanzar un repositorio en cualquiera de
ellas.

## 8. Qué se ve al arrancar

```
[INFO] Modules: identity, catalog (2 of 3)
[INFO] Wiring: 2 contracts, 1 extension point, 1 event, 5 permissions
[INFO] Serving on :5050 - 11 routes, 1 routine, docs at /docs (1.4s)
```

**Cada parte vacía se omite**, y el silencio es informativo:

| No aparece | Significa |
| --- | --- |
| `contracts` | ningún módulo encendido tiene un `Provider` con `@Provides` |
| `extension points` | nadie aportó a ningún slot — no que no haya slots |
| `events` | nadie escucha nada; los `emit()` vuelven enseguida |

`extension points` cuenta los slots **que alguien llenó**, no los que se
declararon: un slot abierto y vacío no aparece en ningún lado, porque un token es
sólo una constante y liteb no tiene cómo enumerarlos.

Son cuentas y no nombres a propósito. El caso en que el nombre importa —
un módulo que declara `consumes` de un contrato que nadie provee — **no llega a
esta línea**: `buildContainer()` corta el arranque con un error que nombra el
contrato y el módulo. Esto es el resumen, no el diagnóstico.

Y `routes` en cero es la falla que solía parecer un arranque sano: un glob que
no encontró nada, la aplicación contestando 404 a todo, y el log diciendo
`Done!`.

## 9. Quitar un módulo

No hay encender ni apagar: lo que está en el código, corre. Lo que sí pasa es
que un módulo **deje de estar** — lo sacaste del despliegue, o del `modules` de
`Liteb.create()`. Por mecanismo:

| Mecanismo | Qué pasa cuando el módulo ya no está |
| --- | --- |
| Contrato que provee | nadie lo registra. Un consumidor que lo declaró en `consumes` no arranca; uno que no, falla en la petición |
| Contrato que consume | nada: nadie lo llama |
| Slot que llena | su aporte desaparece de `this.all()` — el método de pago, el canal, el badge |
| Slot que abre | el slot deja de leerse, porque nadie lo lee |
| Oyentes | no reaccionan más |
| Permisos | **desaparecen del catálogo**, porque salen de los manifiestos presentes |
| Sus datos | **intactos**. La fila en `_modules` tampoco se borra: se reporta como huérfana, y qué hacer con esas tablas lo decide quien opera la instalación |

Esa última fila es la que importa: quitar código nunca borra datos.

## 10. Los errores, palabra por palabra

| Mensaje | Cuándo | Qué hacer |
| --- | --- | --- |
| `Module "x" consumes the contract "y", which no module provides.` | al arrancar | agregar el módulo que lo provee, o sacarlo de `consumes` |
| `No module provides the contract "y". Check that the module providing it is installed.` | en una petición | lo mismo, y declararlo en `consumes` para que la próxima vez sea al arrancar |
| `Contract "y" is provided by both "a" and "b". Exactly one module can provide it.` | al arrancar | quitar uno de los dos, o partir el contrato en dos |
| `Contract "y" is being resolved while it is still being built: its implementation depends on itself.` | primera resolución | romper el ciclo: tercer módulo, evento, o slot |
| `Extension point "z" is being filled while it is still being filled: a contribution asks for the slot it belongs to.` | primera lectura | un aporte no puede leer su propio slot |
| `@Provides() takes a contract or an extension point, and got an event. …` | al importar el archivo | un evento no se provee: se emite, y se escucha con `@On` |
| `token(): the id must be a non-empty string …` | al importar el archivo | el id va con el prefijo del módulo |
| `token("x"): unknown kind "…"` | al importar el archivo | es `'contract'`, `'slot'` o `'event'` |
| `Cannot resolve the contract "y": this application has no modules. Start it with Liteb.create({ modules }).` | fuera de una aplicación | construir la aplicación con sus módulos |
| `Provider X in module "m" has no @Provides(token) and was skipped.` | aviso al arrancar | falta el decorador — el archivo no quedó registrado |
| `Listener X in module "m" has no @On(event) and was skipped.` | aviso al arrancar | falta `@On` |
| `Listener X (module "m") failed on "e"` | en tiempo de ejecución | el oyente lanzó; quien emitió no se enteró |

Todos los `ContractError` llevan el `contractId` como propiedad, así que un
manejador puede distinguirlos sin parsear el mensaje.

## 11. Antipatrones

**Un evento para conseguir un resultado.** `emit()` y después leer la base
esperando que el oyente ya escribió. Los oyentes corren en paralelo y sus fallos
no llegan: lo que querías era un contrato.

**Un contrato para avisar.** Un `NotificationService` que quien llama invoca «por
si acaso» y cuyo fallo le tira abajo la petición. Si el resultado no cambia lo que
contestás, un fallo ahí tampoco debería cambiarlo.

**Un slot donde hay una sola respuesta correcta.** Si el módulo que lee tiene que
elegir uno del arreglo, esa elección es la lógica que faltaba modelar: o es un
contrato, o el criterio va en la interfaz del aporte.

**Importar el proveedor «sólo para el tipo».** `import type` no deja rastro en el
JavaScript emitido, pero sí en la cabeza de quien lee: el tipo que necesitás es
la interfaz del contrato, que está en el archivo que sí podés importar.

**Un contrato que devuelve la entidad de otro módulo.** El tipo de retorno es
parte de la promesa: si es una entidad ajena, quien llama termina importándola y
se acopló al esquema. Devolvé la forma que el contrato define.

**Emitir adentro de la transacción.** Ver
[la trampa](#la-trampa-de-la-transacción). Es el error más caro de esta página,
porque anda en desarrollo — donde el oyente suele llegar más tarde que el commit
— y falla en producción.

## 12. Un flujo completo

Una venta: `sales` cobra por contrato, anuncia lo que pasó, y `billing` arma su
vitrina de métodos de pago con un slot que llena quien quiera.

```
src/modules/
├── billing/
│   ├── tokens/billing-service.token.ts          BillingService
│   ├── tokens/payment-methods.token.ts          PaymentMethod · PaymentMethods
│   └── providers/billing-service.provider.ts    @Provides(BillingService)
├── sales/
│   ├── tokens/sale-closed.token.ts              SaleClosed
│   ├── endpoints/create-sale.endpoint.ts        this.get() · this.emit()
│   └── module.ts                                consumes: [BillingService]
├── cash/
│   └── providers/cash-method.provider.ts        @Provides(PaymentMethods)
└── reports/
    └── listeners/sale-log.listener.ts           @On(SaleClosed)
```

```typescript
// sales/endpoints/create-sale.endpoint.ts
@Group('sales')
@HttpPost('/')
export default class CreateSale extends Endpoint<never, CreateSaleDto> {
  async main() {
    const charge = await this.get(BillingService).issueCharge({
      customerId: this.body.customerId,
      amount: this.body.amount,
    });

    // Después de que la transacción de issueCharge confirmó.
    await this.emit(SaleClosed, { chargeId: charge.id, amount: charge.amount });

    return { chargeId: charge.id };
  }
}
```

```typescript
// billing/endpoints/payment-methods.endpoint.ts — el que abrió el slot lo lee
@Group('billing')
@HttpGet('/payment-methods')
export default class ListPaymentMethods extends Endpoint {
  async main() {
    return this.all(PaymentMethods).map((method) => ({
      id: method.id,
      label: method.label,
    }));
  }
}
```

Lo que este armado te deja hacer:

- **Apagar `cash`** y la vitrina queda sin efectivo, sin tocar `billing`.
- **Apagar `reports`** y la venta se cierra igual, sin su log.
- **Apagar `billing`** y `sales` no arranca, con el nombre del contrato que falta
  — porque lo declaró en `consumes`.
- **Instalar `card`** mañana, que llena `PaymentMethods`, y que aparezca en la
  vitrina sin que `billing` cambie.

---

Seguir leyendo: [la guía](./guide.md#módulos) para todo lo demás de un módulo,
[el CLI](./cli.md) para los comandos que escriben estos archivos, y
[la API](./api.md#5-cableado-entre-módulos) para las firmas.
