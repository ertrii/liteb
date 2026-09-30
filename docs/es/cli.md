# El CLI de liteb

Todo lo que `liteb` escribe, y nada más. Para lo que el framework *hace* con lo
que escribe, mirá [la guía](./guide.md).

El CLI hace dos cosas y se niega a hacer más: escribe archivos, y corre
compilaciones y migraciones.

Los generadores no saben nada de tu aplicación — ni base de datos, ni archivo de
configuración, ni registro de lo que existe. Leen argumentos y escriben archivos.
Los cuatro que SÍ llegan a la base (`migrate`, `migrate:status`,
`migration:generate`, y ninguno más) llegan de la misma forma: importan tu punto
de entrada y le piden la aplicación, que ya sabe dónde viven sus datos.

```bash
npx liteb@alpha init my-app     # la única vez que necesitás @alpha
cd my-app
npx liteb module billing
npm run dev
```

Después de `init`, liteb queda instalado en el proyecto, así que `npx liteb`
resuelve el binario local. La etiqueta `@alpha` es sólo para la primera llamada:
sin ella `npx liteb` trae la etiqueta `latest`, que es otro major con otro CLI.

---

## De un vistazo

| Comando | Qué escribe o hace |
| --- | --- |
| [`init [name]`](#liteb-init-name) | Un proyecto que corre: `package.json`, `tsconfig.json`, `.env`, punto de entrada |
| [`module <name>`](#liteb-module-name) | Un módulo: su manifiesto, sus permisos y un primer endpoint |
| [`endpoint <module>/<name>`](#liteb-endpoint-modulename) | Un endpoint HTTP |
| [`routine <module>/<name>`](#liteb-routine-modulename) | Trabajo con horario |
| [`entity <module>/<name>`](#liteb-entity-modulename) | Una entidad de TypeORM |
| [`migration <module>/<name>`](#liteb-migration-modulename) | Una migración con sello de tiempo |
| [`migration:generate <module>/<name>`](#liteb-migrationgenerate-modulename) | La misma, escrita por TypeORM desde tus entidades |
| [`contract <module>/<name>`](#liteb-contract-modulename) | Una capacidad que este módulo publica |
| [`provider <module>/<name>`](#liteb-provider-modulename) | La clase que la responde |
| [`event <module>/<name>`](#liteb-event-modulename) | Algo que este módulo anuncia |
| [`slot <module>/<name>`](#liteb-slot-modulename) | Un punto de extensión que otros pueden llenar |
| [`listener <module>/<name>`](#liteb-listener-modulename) | Una reacción a un evento |
| [`migrate`](#liteb-migrate) | Corre las migraciones pendientes |
| [`migrate:status`](#liteb-migratestatus) | Qué declara cada módulo, y qué ya corrió |
| [`build`](#liteb-build) | Compila, opcionalmente a bytecode de V8 |

Todos los generadores toman las mismas tres banderas:

| Bandera | Por defecto | Qué es |
| --- | --- | --- |
| `--dir <path>` | `src/modules` | dónde viven los módulos |
| `--from <specifier>` | `liteb` | de dónde importa liteb el código generado |
| `--force` | apagada | sobrescribir archivos que ya existen |

`--from` existe para un repositorio que trae liteb adentro en vez de instalarlo:
pasá `--from ../../lib` y los imports generados apuntan ahí. El resto no la
toca.

---

## Por qué casi ningún comando edita nada

Un generador escribe su archivo y para. No hay una lista en `module.ts` que
mantener sincronizada, porque **la carpeta es lo que registra el archivo**:

```
billing/
├── module.ts                   ← el cableado, y las claves de permiso
├── entities/*.entity.ts        migrations/*.ts
├── endpoints/*.endpoint.ts     routines/*.routine.ts     listeners/*.listener.ts
├── providers/*.provider.ts
└── contracts/*.contract.ts     events/*.event.ts         slots/*.slot.ts
```

Las dos primeras filas son globs que liteb lee al arrancar. La última no: un
token se importa por nombre, así que no hay nada que descubrir — esas carpetas
existen para que las encuentres, y el CLI es lo que las mantiene consistentes.

Sólo dos ediciones tocan un archivo que el generador no escribió, y las dos
tienen una forma lo bastante segura como para hacerlas sin parsear TypeScript:

- `liteb module` agrega el módulo a `modules: [ ]` en `src/index.ts`, y le añade
  un bloque a `src/config/permissions.ts`.
- `liteb endpoint --permission` agrega la clave al `permissions: []` del
  manifiesto del módulo.

Cualquier cosa menos segura se imprime como instrucción. Un andamiaje que
destroza en silencio un archivo que escribiste es peor que uno que te dice qué
agregar.

---

## `liteb init [name]`

```bash
npx liteb@alpha init my-app                 # dentro de ./my-app
npx liteb@alpha init                        # en la carpeta actual
npx liteb@alpha init my-app --skip-install  # escribe los archivos, el npm install lo corrés vos
npx liteb@alpha init my-app --dir src/bc    # los módulos viven en otro lado
```

| Bandera | Efecto |
| --- | --- |
| `--skip-install` | escribe los archivos y para |
| `--dir <path>` | dónde van a vivir los módulos (por defecto `src/modules`) |

Escribe:

```
package.json          scripts, y las dependencias que el framework necesita
tsconfig.json         las dos banderas de decoradores, y el alias @/
.gitattributes        el árbol de trabajo es LF, en cualquier máquina
.editorconfig         la forma de un archivo, para editores sin herramientas
.prettierrc           .prettierignore
eslint.config.mjs     flat config; el formato queda para Prettier
.vscode/              formatear al guardar, y las extensiones que lo hacen
.env  .env.template   NODE_ENV, puertos, orígenes CORS, base de datos
.gitignore
src/index.ts          createApp() separado de main()
src/config/permissions.ts
src/config/auth.ts
```

Tres cosas de ahí conviene conocerlas, porque equivocarse en cualquiera cuesta
una tarde.

**Las banderas de decoradores.** `experimentalDecorators` y
`emitDecoratorMetadata`. Sacá cualquiera de las dos y cada ruta y cada entidad
pasan a no hacer nada, en silencio — nada falla, nada contesta.

**`strictPropertyInitialization: false`.** Las entidades de TypeORM y los DTO
validados declaran campos que el constructor nunca asigna; los llena el ORM. Con
la bandera encendida, cada uno de ellos es un error.

**`createApp()` está separado de `main()`**, y `main()` sólo corre bajo
`if (require.main === module)`. Importar el archivo de entrada no tiene que
levantar un servidor — eso es lo que le permite a una prueba, a un script y a
`liteb migrate` construir la aplicación sin escuchar en un puerto.

**Permisos y `auth` vienen escritos, no comentados.** `src/config/auth.ts` tiene
un resolutor que deja pasar a **todos** con todos los permisos, y `src/index.ts`
se lo pasa. Eso no es autenticación — es lo que hace que `this.auth`,
`this.auth.assert(...)` y las claves de permiso chequeadas por el compilador
funcionen en la primera petición, así reemplazarlo después es un archivo y no una
migración de todos los endpoints que escribiste mientras tanto. Lo dice en el
log, una vez, la primera vez que deja pasar una petición.

`src/config/permissions.ts` arranca con su bloque `declare global` ya abierto.
Está vacío hasta el primer módulo; `liteb module` le añade un bloque por módulo y
la fusión de interfaces los junta, así que ninguna línea de ese archivo se vuelve
a abrir. Cada bloque **lee** las claves del manifiesto de ese módulo en vez de
repetirlas, así que una clave se escribe una sola vez.

### La forma de un archivo, decidida una vez

Cuatro archivos, y cada uno existe porque lo lee alguien distinto. Los cuatro
llevan los mismos valores, y esos valores son los que emiten los generadores —
así el primer `npm run format` no reescribe un archivo que `liteb module` acaba
de escribir.

| Archivo | Lo lee |
| --- | --- |
| `.editorconfig` | cualquier editor, incluidos los que no corren nada. Prettier también |
| `.prettierrc` | Prettier, que **gana** sobre `.editorconfig` donde se solapan |
| `eslint.config.mjs` | ESLint: lo que el código SIGNIFICA |
| `.gitattributes` | git, cuando escribe los archivos en disco |

**El que todo el mundo se saltea es `.gitattributes`.** `* text=auto eol=lf` hace
que el árbol de trabajo sea LF en cualquier máquina. Sin eso, git en Windows saca
los archivos con CRLF mientras `.editorconfig` y `.prettierrc` piden LF: el
formateador quiere reescribir todas las líneas de la mitad del proyecto, y cada
diff es ruido. `eol=lf` gana sobre lo que tenga `core.autocrlf` localmente, así
que dos máquinas coinciden sin que nadie configure git.

**Prettier no corre como regla de ESLint**, que es lo que
[Prettier mismo recomienda](https://prettier.io/docs/integrating-with-linters):
correrlo como regla es más lento, llena el editor de subrayados rojos por cosas
que se arreglan solas al guardar, y agrega una capa que se puede romper.
`eslint-config-prettier/flat` sólo APAGA las reglas de estilo que discutirían con
el formateador, y va última en el arreglo porque así es como funciona. El que
formatea es `npm run format`.

`eslint.config.mjs` es flat config, porque `.eslintrc` se eliminó en ESLint 10 —
y el `package.json` declara `node >=22.13`. Ese piso no es de ESLint: Node 20
llegó a fin de vida en abril de 2026, y 22 es la línea más vieja que todavía
recibe parches de seguridad. Corré 24, que es el LTS activo.

TypeScript queda en `^6`, no en `^7`. TypeScript 7 existe, pero
`typescript-eslint` — la única forma de tener reglas con tipos — pide como peer
`typescript <6.1.0`, así que ir a 7 significaría resignar
`no-floating-promises`. El `tsconfig.json` generado igual queda escrito pensando
en la mudanza: sin `baseUrl` (deprecado en 6, eliminado en 7), `paths` relativo
al propio archivo, y `rootDir` explícito. `moduleResolution` sigue en `node10`
detrás de un `ignoreDeprecations`, porque cambiar el resolver cambia cómo se
resuelve cada paquete y eso es una tarea aparte.

Tres reglas quedan puestas a mano en vez de dejarlas al preset, y cada una es una
decisión:

- **`no-namespace` con `allowDeclarations: true`.** `declare global { namespace
  LitebAuth { ... } }` es como una aplicación dice qué es un actor y qué claves
  de permiso existen. Las declaraciones ambiente siguen permitidas; un namespace
  usado como valor, no.
- **`no-empty-object-type` con `allowInterfaces: 'with-single-extends'`.**
  `interface Permissions extends PermissionsOf<typeof mod> {}` está vacía
  *porque* las claves vienen del `extends`, y hay un bloque así por módulo.
  Configurar la regla es mejor que apagarla: un `{}` de verdad se sigue
  reportando.
- **`no-floating-promises` como error.** La única regla que necesita información
  de tipos y vale lo que cuesta: una llamada al repositorio cuya promesa nadie
  esperó son datos que en silencio no se escribieron, y no hay otra cosa que lo
  vea. `await-thenable` viene por lo mismo. Todo el resto de lo que mira tipos
  está en `tseslint.configs.recommendedTypeChecked`, comentado en el archivo,
  para cuando el código esté listo para responder por los `any` que devuelve un
  ORM.

`no-explicit-any` y `no-unused-vars` son **advertencias**. Un build que falla por
un `any` enseña a escribir `as unknown as T`, que es peor que el `any`.

Cuatro scripts: `lint`, `lint:fix`, `format`, `format:check`.

También deja cableadas tres cosas que todo backend termina necesitando, para que
no sean tarea para después:

| | Dónde |
| --- | --- |
| **Chequeo de salud** | `/health` |
| **Documentación de la API** | `/docs`, la especificación en `/docs.json` |
| **Archivos de log** | `logs/` — `app`, `info`, `warn`, `error`, `router` |

Las tres quedan **encendidas**, en todos los entornos. Apagar una es una decisión
que tomás mirando `src/index.ts`, no una que venga tomada de fábrica y te
sorprenda el día que despliegues.

**`/health`** contesta 200 mientras la aplicación puede atender y 503 mientras no
— que es lo que lee un balanceador, un runtime de contenedores o un chequeo de
disponibilidad. Queda fuera de `basePath`, no necesita credenciales (un
balanceador no puede iniciar sesión) y se mantiene fuera del log de accesos,
porque si no una sonda cada pocos segundos entierra cada petición real.

Dos detalles que hace bien y que uno escrito a mano suele no hacer: el chequeo de
la base es un **viaje de ida y vuelta**, no `isInitialized` — esa bandera sigue
en true después de que se cae la conexión, así que un chequeo que la lee reporta
`pass` durante la única caída para la que existe. Y pasa a 503 **apenas empieza
el apagado**, antes de que el servidor deje de aceptar, que es la ventana que un
balanceador necesita para drenar.

El cuerpo es deliberadamente flaco: `{ status, uptime }`, más `checks`
nombrando qué falló. Versiones y cantidades de módulos son el mapa de tu
instalación para quien lo encuentre; `details: true` los agrega, para cuando está
detrás de una puerta.

liteb sólo puede responder por el proceso y la base. Cualquier otra cosa que esta
aplicación necesite para atender va en `health.checks` — el `index.ts` generado
muestra dónde:

```typescript
health: { path: '/health', checks: { queue: () => bridge.isConnected() } }
```

**`/docs`** se genera de los mismos decoradores que montan las rutas, así que no
puede separarse de lo que la API hace. Conviene saberlo antes de desplegar:
publica la forma completa de tu API a cualquiera que encuentre la URL. Ponelo
detrás de tu propia puerta, o sacá la opción, si no es lo que querés.

Cada línea de esos logs — y cada respuesta fallida — lleva el id de la petición a
la que pertenece, leído de `x-request-id` o generado. No hay nada que configurar;
es lo que ata a un usuario diciendo "falló" con las líneas que dicen por qué.

**`logs/`** tiene los archivos rotativos, y todos existen desde el primer
arranque, vacíos — un `error.log` vacío dice que no pasó nada malo, mientras que
uno que falta no dice nada:

```
logs/
├─ app.log        todos los niveles, en un solo hilo cronológico
├─ info.log
├─ warn.log
├─ error.log
└─ router.log     el mapa de rutas — el único con algo adentro al arrancar
```

`router.log` es el que vale la pena conocer: el mapa de qué contesta dónde, en
orden de registro — la respuesta más rápida a "por qué mi ruta da 404".
`app.log` es donde se lee qué pasó; los archivos separados son para grepear una
clase de cosa.

Esto viene encendido, así que la opción es sólo para moverlo (`dir`), renombrar o
sacar un archivo (`files: { error: 'errores' }`, `files: { info: false }`) o no
escribir ninguno con `dir: null` — que es lo que quiere un contenedor, donde el
disco no es donde nadie lee logs y los archivos se van con el contenedor.

### El alias `@/`

`init` lo escribe:

```jsonc
// tsconfig.json
"baseUrl": ".",
"paths": { "@/*": ["src/modules/*"] },
"ts-node": { "require": ["tsconfig-paths/register"] }
```

Para que el único import que cruza módulos deje de ser una escalera:

```typescript
import { UserDirectory } from '@/identity/contracts/user-directory.contract';
//                            ^ src/modules/, sin importar qué tan hondo esté el archivo
```

Sólo los imports entre módulos lo necesitan. Dentro de un módulo,
`../entities/charge.entity` es más corto y dice más.

**Un alias de `paths` existe sólo en tiempo de compilación.** `tsc` lo
typechequea y después emite `require("@/…")` tal cual, algo de lo que Node nunca
oyó hablar — una compilación que typechequea y se muere en su primer require.
liteb lo cierra de los dos lados:

- `npm run dev` — `ts-node` lo resuelve, por la línea `ts-node.require` de
  arriba.
- `liteb build` — reescribe los especificadores con alias a rutas relativas **en
  la salida**, así la aplicación compilada no necesita ni un loader, ni un
  envoltorio, ni una bandera.

Si cambiás el alias en `tsconfig.json`, eso es todo lo que cambiás: la
compilación lo lee de ahí.

---

## `liteb module <name>`

```bash
npx liteb module billing
npx liteb module reports --optional --label "Reports"
```

| Bandera | Efecto |
| --- | --- |
| `--label <text>` | nombre para personas, para una pantalla de "módulos" |
| `--optional` | se instala **apagado**, y se enciende a propósito |
| `--entry <file>` | el archivo con `Liteb.create({ modules: [...] })` (por defecto `src/index.ts`) |

Escribe `module.ts` y un primer endpoint que contesta en `/api/<name>`, después
registra el módulo en el punto de entrada y le añade a
`src/config/permissions.ts` un bloque que lleva sus claves al sistema de tipos.

Las claves viven en el manifiesto, como cadenas:
`permissions: ['billing.view']`. Una clave puede llevar texto para una pantalla
de roles cuando no lo puede decir sola —
`{ key: 'billing.void', label: 'Anular un cargo ya cobrado' }` — y el `label` es
opcional justamente porque la mayoría sí puede.

**`--optional` es la diferencia entre una función y una actualización que se
enciende sola.** Un módulo sin `core: true` se instala apagado: está en el
código, sus tablas existen, sus permisos están en el catálogo, y nada de él corre
hasta que alguien lo encienda. Los módulos core no se pueden apagar en absoluto.

El endpoint generado trae su línea `this.auth.assert(...)` **viva**. Funciona
desde la primera petición porque `init` escribió un resolutor que deja pasar a
todos — la puerta está puesta y abierta, que es el único orden en el que cerrarla
es un cambio de una línea. Pasá `--public` para los que sí tienen que estar
abiertos.

---

## `liteb endpoint <module>/<name>`

```bash
npx liteb endpoint billing/issue-charge --method post
npx liteb endpoint billing/find-one --path ":id"
npx liteb endpoint billing/list --permission billing.view
npx liteb endpoint public/health --public
```

| Bandera | Efecto |
| --- | --- |
| `--method <verb>` | `get`, `post`, `put`, `patch`, `delete`, `query` (por defecto `get`) |
| `--path <path>` | ruta bajo el grupo, p. ej. `:id` |
| `--group <name>` | prefijo de ruta (`@Group`); por defecto el id del módulo |
| `--permission <key>` | asertar esta clave desde el principio |
| `--public` | sin línea de permiso |

La URL es `<basePath>/<group>/<path>`, y **el grupo por defecto es el id del
módulo**, así que el andamiaje no escribe ningún `@Group`. Pasá `--group` sólo
cuando la URL no tiene que llevar el nombre del módulo — un módulo que sirve dos
recursos, o dos módulos que aportan a un mismo prefijo.

La aserción se escribe **viva** de las dos formas. Sin `--permission` aserta
`<module>.view`, la clave con la que arranca un módulo; con ella, aserta esa clave
y **la agrega** al arreglo `permissions` del manifiesto en la misma pasada — una
clave que ningún módulo declara es un 500 y no un 403, a propósito, porque es un
typo y no una concesión faltante.

Un endpoint que ESCRIBE quiere su propia clave, así que pasá `--permission`.
`--public` deja la línea afuera del todo.

---

## `liteb routine <module>/<name>`

```bash
npx liteb routine billing/nightly
npx liteb routine billing/hourly --cron "0 * * * *"
```

| Bandera | Efecto |
| --- | --- |
| `--cron <expression>` | expresión de node-cron (por defecto `0 7 * * *`) |

Trabajo que la aplicación hace por su cuenta, con reloj. Corre sólo mientras el
módulo está **encendido**, así que apagar un módulo detiene su horario sin tocar
ningún dato.

Dos cosas que el archivo generado te recuerda: poné una `timezone` en `@Cron`, o
la expresión se lee en la zona horaria de la máquina donde haya terminado el
proceso; y `now` no siempre es un `Date` — es `'init'` cuando la rutina se
declaró con `{ runOnInit: true }`.

---

## `liteb entity <module>/<name>`

```bash
npx liteb entity billing/charge
npx liteb entity billing/charge --table facturacion_cargos
```

| Bandera | Efecto |
| --- | --- |
| `--table <name>` | nombre de la tabla (por defecto `<module>_<name>`, en snake_case) |

Escribe la clase y no edita nada: `entities/*.entity.ts` es donde liteb mira.

**Declarar una entidad no crea su tabla.** liteb no te enciende `synchronize`
— cada tabla sale de una migración, que es lo que una instalación es. Seguile
con `liteb migration:generate`.

---

## `liteb migration <module>/<name>`

```bash
npx liteb migration billing/create-charges
```

Escribe `migrations/<timestamp>-<name>.ts`. Nada la lista.

**El sello de tiempo al final del nombre de la clase es el orden**, dentro de ese
módulo — liteb rechaza una clase de migración sin uno, porque el orden de
declaración no es un contrato. Entre módulos el orden es el de dependencias, así
que las tablas de un módulo existen antes de que un dependiente las toque. El
runner de TypeORM no puede hacer eso: ordena todas las migraciones del DataSource
globalmente, y un módulo escrito el año pasado migraría antes que la dependencia
que necesita.

**LANZA hasta que le escribas su SQL**, y eso no es cortesía. Una migración vacía
TIENE ÉXITO: una consulta que es sólo un comentario corre bien, así que liteb la
anota como aplicada y desde ahí no tiene razón para volver a correrla — el SQL
que escribas después no se ejecuta nunca, y `liteb migrate` sigue contestando
*nothing to migrate* sobre una tabla que jamás se creó. Fallar, en cambio,
revierte todo y no deja ninguna fila. Borrá el `throw` cuando el SQL esté.

---

## `liteb migration:generate <module>/<name>`

```bash
npx liteb migration:generate billing/add-due-date
npx liteb migration:generate billing/add-due-date --print
```

| Bandera | Efecto |
| --- | --- |
| `--entry <file>` | archivo que exporta `createApp()` |
| `--dir <path>` | dónde viven los módulos (por defecto `src/modules`) |
| `--print` | muestra el SQL y no escribe nada |
| `--force` | sobrescribe un archivo que ya existe |

**Este es el generador de TypeORM, archivado por módulo.** Conecta, le pide a
TypeORM que lea el esquema vivo, lo compare contra tus entidades y escriba el SQL
que cierra la diferencia — la misma maquinaria detrás de `synchronize: true`,
menos la parte donde corre a tus espaldas. Esa mitad es de TypeORM y la hace
mejor que cualquier cosa a mano.

Lo que TypeORM no puede hacer es decidir **dónde** va la migración: ve un solo
esquema, y los módulos no existen para él. Esa mitad es de liteb, y se decide con
lo único que lo sabe — qué módulo declara qué entidad. Entonces:

- un diff que cae entero en otro módulo se **rechaza**, y nombra al módulo que lo
  posee. Una migración en el módulo equivocado corre en el orden equivocado, o no
  corre si ese módulo está apagado, y eso aparece en producción sobre datos que
  ya existen;
- uno que además toca tablas de otro módulo se escribe, con un aviso que las
  nombra. Partirlo es criterio y liteb no lo ejerce por vos.

**Se niega mientras haya migraciones pendientes.** Una pendiente es un cambio que
la base no vio, así que el diff lo describiría una segunda vez y correrías el
mismo DDL dos veces. Primero `liteb migrate`.

> **Leé lo que escribe.** Un diff no distingue un rename de un drop más un add,
> así que una columna renombrada sale como perder una y ganar otra — y sobre una
> tabla con filas, eso son los datos.

---

## `liteb contract <module>/<name>`

```bash
npx liteb contract identity/directory
```

Lo que otros módulos le pueden pedir a este. Escribe
`contracts/<name>.contract.ts` con la interfaz y el token compartiendo nombre —
TypeScript tiene tipos y valores en espacios de nombres separados, así que un
import te da tanto la forma que el compilador chequea como la identidad que el
contenedor resuelve.

El consumidor importa este archivo y nada más de tu módulo. Cambiá cómo funciona
y nada fuera de tu módulo se mueve.

---

## `liteb provider <module>/<name>`

```bash
npx liteb provider identity/directory              # responde un contrato
npx liteb provider reports/low-stock --slot badges # llena un punto de extensión
```

| Bandera | Efecto |
| --- | --- |
| `--slot <name>` | llenar un punto de extensión en vez de responder un contrato |

La clase que cumple la promesa. Escribe `providers/<name>.provider.ts` con
`@Provides(Token)` — el mismo decorador, sea el token un contrato o, con `--slot`, un punto de extensión.

`this.db`, `this.get(Contract)`, `this.all(Slot)` y `this.emit(Event)` se
inyectan **antes** de construir la instancia, así que un inicializador de campo
ya puede alcanzar un repositorio:

```typescript
@Provides(UserDirectory)
export class UserDirectoryProvider extends Provider implements UserDirectory {
  private readonly users = this.db.getRepository(User);
}
```

Se construye la primera vez que alguien lo pide, y después se reutiliza — un
contrato que nadie llama no cuesta nada.

Con `--slot`, el import generado es un marcador que apunta a
`@/<module>/slots/…`: el slot pertenece al módulo que lo **abrió**, y una
extensión importa ese token, nunca al revés.

---

## `liteb event <module>/<name>`

```bash
npx liteb event billing/charge-issued
```

Algo que este módulo anuncia, para quien esté escuchando. Escribe
`events/<name>.event.ts`.

**Un evento no es una llamada.** No hay respuesta, un oyente que lanza no hace
fallar a quien emitió, y un evento que nadie escucha es normal. Cuando el
resultado le importa a quien llama, eso es un contrato.

La carga tiene que llevar lo que un oyente necesita: los oyentes leen en su
propia conexión, así que no pueden ver filas que una transacción todavía no
confirmó.

---

## `liteb slot <module>/<name>`

```bash
npx liteb slot catalog/product-badges
```

Un punto de extensión que este módulo abre para que otros lo llenen. Escribe
`slots/<name>.slot.ts` con dos nombres: la interfaz es la forma de **una**
contribución, el token nombra la colección.

**Mirá la dirección.** El módulo que abre el slot es del que dependen las
extensiones: no sabe nada de quién lo llena, que es lo que le permite ser core
mientras cada contribuyente sigue siendo removible. Al revés, el core dependería
de sus propias extensiones y ninguna se podría quitar.

Se lee con `this.all(Token)`. Un arreglo vacío es una respuesta normal.

---

## `liteb listener <module>/<name>`

```bash
npx liteb listener reports/restock-log
```

Reacciona a un evento que anunció otro módulo. Escribe
`listeners/<name>.listener.ts`.

El archivo generado declara un token marcador para que compile solo —
reemplazalo con el import real del módulo que anuncia el evento:

```typescript
import { ChargeIssued } from '@/billing/events/charge-issued.event';
```

Los oyentes corren sólo mientras su módulo está **encendido**, y leen en su
propia conexión: emitá **después** de que la transacción confirme, o no pueden
ver las filas.

---

## `liteb migrate`

```bash
npx liteb migrate
npx liteb migrate --dry-run
npx liteb migrate --entry src/main.ts
```

| Bandera | Efecto |
| --- | --- |
| `--entry <file>` | archivo que exporta `createApp()` (por defecto `src/index.ts`) |
| `--dry-run` | dice qué correría, no cambia nada |

Corre las migraciones pendientes de cada módulo **encendido**, en orden de
dependencias, sin levantar un servidor. El CLI nunca necesita saber dónde está tu
base de datos: le pide la aplicación a **tu** punto de entrada, que es por lo que
la plantilla de `init` separa `createApp()` de `main()`.

La base en sí tiene que existir. liteb crea tablas, no bases de datos.

---

## `liteb migrate:status`

```bash
npx liteb migrate:status
```

| Bandera | Efecto |
| --- | --- |
| `--entry <file>` | archivo que exporta `createApp()` |

Lista qué declara cada módulo y qué de eso ya corrió, marcando como tales los
módulos apagados — cuyas migraciones no corren.

Leer el estado nunca crea nada: en una base que nunca migró, la tabla de registro
no existe y la respuesta es sencillamente que todo está pendiente.

---

## `liteb build`

```bash
npx liteb build
npx liteb build --out dist
npx liteb build --bytecode
npx liteb build --bytecode --only modules/billing
```

| Bandera | Efecto |
| --- | --- |
| `--project <file>` | tsconfig con el que compilar (por defecto `tsconfig.json`) |
| `--out <dir>` | dónde va la compilación (por defecto `build`) |
| `--assets <dir>` | carpeta con lo que nunca fue TypeScript (por defecto `src`) |
| `--bytecode` | compila a `.jsc` y borra el `.js` legible |
| `--only <dir>` | limita el paso de bytecode a esta parte de la salida |

Tres pasos, y dos de ellos son la razón por la que este comando existe en vez de
un `tsc` pelado:

1. **Compilar** con el TypeScript del propio proyecto.
2. **Copiar lo que nunca fue TypeScript** — plantillas, archivos estáticos, JSON.
   `tsc` los deja atrás, y una compilación a la que le faltan sus vistas es una
   compilación que arranca y después tira 500.
3. **Resolver los alias de rutas.** `tsc` emite `require("@/…")` tal cual; esto
   los reescribe a rutas relativas para que la salida corra bajo `node` a secas.

### `--bytecode`

Compila la salida a bytecode de V8 y borra el `.js` legible. Dos cosas que te
toca a vos aceptar:

- **Un `.jsc` queda atado al Node/V8 que lo produjo.** Enviá el runtime con la
  compilación, o no va a cargar en el destino.
- **Es opacidad, no cifrado.** Las cadenas, los identificadores y los nombres de
  clase sobreviven, y las plantillas, el SQL y los archivos estáticos nunca
  fueron bytecode.

La aplicación tiene que hacer `require('bytenode')` antes de `start()`. liteb no
depende de eso: qué es un archivo `.jsc` depende del Node que lo produjo, y un
framework no tiene por qué decidir eso por su consumidor.

---

## Lo que el CLI no va a hacer

- **No conoce tu aplicación.** Ni conexión a base de datos, ni archivo de
  configuración, ni registro. `migrate` es la excepción, y aun ahí le pregunta a
  tu punto de entrada en vez de leer tu `.env` por su cuenta.
- **No reescribe código que no escribió**, más allá de las dos ediciones listadas
  arriba. Cuando no puede estar seguro, imprime la línea para que la agregues.
- **No crea bases de datos.** Sólo tablas, y sólo a través de migraciones.

> El CLI de 1.x se borró porque sus plantillas eran assets sueltos que nadie
> compilaba, y se fueron separando hasta generar decoradores que el framework ya
> no tenía. Estas plantillas son parte de la misma compilación que todo lo demás,
> y `test/cli.spec.ts` anda un módulo y lo **arranca** — una plantilla que deja
> de coincidir con el framework hace fallar la suite.
