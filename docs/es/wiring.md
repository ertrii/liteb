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
| [9. Apagar un módulo](#9-apagar-un-módulo) | qué desaparece con él |
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
// billing/contracts/billing-service.contract.ts
import { contract } from 'liteb';

export interface BillingService {
  issueCharge(input: IssueChargeInput): Promise<Charge>;
}

export const BillingService = contract<BillingService>('billing.service');
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
- **`kind`** — `'contract'` o `'slot'`. Sin ese campo los dos serían
  estructuralmente idénticos y cada uno se podría pasar donde va el otro, que es
  la única confusión que importa acá: un contrato tiene un proveedor, un slot
  tiene muchos.

Dónde vive cada archivo, y qué comando lo escribe:

| Carpeta | Qué hay | Comando |
| --- | --- | --- |
| `contracts/*.contract.ts` | la interfaz y el token | [`liteb contract`](./cli.md#liteb-contract-modulename) |
| `slots/*.slot.ts` | la forma de un aporte, y el token de la colección | [`liteb slot`](./cli.md#liteb-slot-modulename) |
| `events/*.event.ts` | la carga y el token | [`liteb event`](./cli.md#liteb-event-modulename) |
| `providers/*.provider.ts` | lo que responde un contrato o llena un slot | [`liteb provider`](./cli.md#liteb-provider-modulename) |
| `listeners/*.listener.ts` | lo que reacciona a un evento | [`liteb listener`](./cli.md#liteb-listener-modulename) |

`providers/` y `listeners/` son globs: la carpeta es lo que los registra, y el
decorador dice a qué token responden. `contracts/`, `slots/` y `events/` **no**
son globs — un token se importa por nombre, así que no hay nada que descubrir.
Son una convención para las personas, y es donde el CLI los escribe.

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
  private readonly charges = this.db.getRepository(Charge);

  async issueCharge(input: IssueChargeInput) {
    // ...
  }
}
```

Nada lista esta clase. La carpeta la encuentra, `@Provides` dice qué contrato
responde, y el nombre del archivo no importa mientras termine en `.provider.ts`.

Un `Provider` sin `@Provides` ni `@Contributes` se saltea con un aviso en vez de
detener el arranque, igual que un endpoint sin verbo: un archivo a medio escribir
no es una instalación rota.

```
[WARN] Provider BillingServiceProvider in module "billing" has no
@Provides(contract) or @Contributes(slot) and was skipped.
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
  // Esto corre antes del cuerpo del constructor, y `this.db` ya está.
  private readonly charges = this.db.getRepository(Charge);
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
// catalog/slots/product-badges.slot.ts
export interface ProductBadge {
  id: string;
  for(product: { id: number; stock: number }): string | null;
}

export const ProductBadges = slot<ProductBadge>('catalog.product-badges');
```

```typescript
// reports/providers/low-stock-badge.provider.ts
@Contributes(ProductBadges)
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
| `ProductBadges` | el token de la **colección** | va en `@Contributes` y en `this.all()` |

Pasar un contrato donde va un slot falla en el decorador, con la diferencia
explicada en el mensaje:

```
@Provides() takes a contract, and got a slot. Contracts have one provider and
are declared with contract(); extension points take many and are declared with
slot().
```

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
// catalog/events/product-restocked.event.ts
export interface ProductRestocked {
  productId: number;
  quantity: number;
}

export const ProductRestocked = event<ProductRestocked>(
  'catalog.product.restocked',
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
[INFO] Contracts registered: billing.service, identity.directory
[INFO] Extension points filled: catalog.product-badges
[INFO] Events with listeners: catalog.product.restocked
```

Las tres líneas se omiten si están vacías, y el silencio es informativo:

| No aparece | Significa |
| --- | --- |
| `Contracts registered` | ningún módulo encendido tiene un `Provider` con `@Provides` |
| `Extension points filled` | nadie aportó a ningún slot — no que no haya slots |
| `Events with listeners` | nadie escucha nada; los `emit()` vuelven enseguida |

`Extension points filled` lista los slots **que alguien llenó**, no los que se
declararon: un slot abierto y vacío no aparece en ningún lado, porque un token es
sólo una constante y liteb no tiene cómo enumerarlos.

## 9. Apagar un módulo

Apagar decide qué corre. Por mecanismo:

| Mecanismo | Qué pasa al apagar el módulo |
| --- | --- |
| Contrato que provee | deja de estar registrado. Un consumidor que lo declaró en `consumes` no arranca; uno que no, falla en la petición |
| Contrato que consume | nada: nadie lo llama |
| Slot que llena | su aporte desaparece de `this.all()` — el método de pago, el canal, el badge |
| Slot que abre | el slot deja de leerse, porque nadie lo lee |
| Oyentes | no reaccionan más. Apagar tiene que detener los efectos secundarios, o «apagado» sería mentira |
| Permisos | **siguen existiendo**: apagar decide qué corre, no qué significa una clave |

La asimetría entre la última fila y el resto es a propósito, y está explicada en
[Autorización](./authorization.md).

## 10. Los errores, palabra por palabra

| Mensaje | Cuándo | Qué hacer |
| --- | --- | --- |
| `Module "x" consumes the contract "y", which no enabled module provides.` | al arrancar | instalar y encender el módulo que lo provee, o sacarlo de `consumes` |
| `No module provides the contract "y". Check that the module providing it is installed and enabled.` | en una petición | lo mismo, y declararlo en `consumes` para que la próxima vez sea al arrancar |
| `Contract "y" is provided by both "a" and "b". Exactly one module can provide it.` | al arrancar | apagar uno de los dos |
| `Contract "y" is being resolved while it is still being built: its implementation depends on itself.` | primera resolución | romper el ciclo: tercer módulo, evento, o slot |
| `Extension point "z" is being filled while it is still being filled: a contribution asks for the slot it belongs to.` | primera lectura | un aporte no puede leer su propio slot |
| `@Provides() takes a contract, and got a slot. …` | al importar el archivo | `@Contributes` para un slot, `@Provides` para un contrato |
| `Cannot resolve the contract "y": this application has no modules. Start it with Liteb.create({ modules }).` | fuera de una aplicación | construir la aplicación con sus módulos |
| `Provider X in module "m" has no @Provides(contract) or @Contributes(slot) and was skipped.` | aviso al arrancar | falta el decorador — el archivo no quedó registrado |
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
│   ├── contracts/billing-service.contract.ts    BillingService
│   ├── slots/payment-methods.slot.ts            PaymentMethod · PaymentMethods
│   └── providers/billing-service.provider.ts    @Provides(BillingService)
├── sales/
│   ├── events/sale-closed.event.ts              SaleClosed
│   ├── endpoints/create-sale.endpoint.ts        this.get() · this.emit()
│   └── module.ts                                consumes: [BillingService]
├── cash/
│   └── providers/cash-method.provider.ts        @Contributes(PaymentMethods)
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
