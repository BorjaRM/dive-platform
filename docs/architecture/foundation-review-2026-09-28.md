# Revision de la base arquitectonica del monorepo

- Fecha: 2026-09-28. Revision estatica de `main`, commit `a47f0d8`.
- Alcance: aplicaciones, paquetes, limites de dependencia, modularidad comercial, tests, migraciones, seguridad y riesgos de rendimiento.
- No se han ejecutado tests, builds, migraciones, Drizzle Kit ni pruebas de rendimiento. No se ha conectado a PostgreSQL ni a proveedores externos.
- Documento de analisis, no una SPEC ni una aprobacion para implementar. `Documented` identifica hechos y contratos enlazados; `Derived` identifica conclusiones de la inspeccion; todas las recomendaciones son `Proposed`, no normativas y pendientes de aprobacion. No se cambian estados, permisos ni requisitos.
- Lectura selectiva de caminos representativos y busqueda transversal de dependencias/tests. No equivale a una auditoria exhaustiva de seguridad ni a certificar el estado de una base desplegada. Que los tests pasan es informacion del usuario, no una ejecucion de esta revision.

## Dictamen

**La eleccion de monolito modular es adecuada; no recomiendo una reescritura ni microservicios. La base tiene controles valiosos, pero la modularidad todavia es parcial y hay defectos concretos que conviene resolver antes de ampliar funcionalidades.**

La prioridad no es crear mas paquetes: es que los casos de uso compartan los controles correctos, que las migraciones conserven una historia coherente y que cada funcionalidad tenga un contrato publico pequeno. Los modulos opcionales necesitan una decision de producto que hoy no esta definida.

Hallazgos principales, ordenados por impacto:

| Ref. local | Prioridad | Hallazgo | Naturaleza |
|---|---|---|---|
| F1 | Alta | La creacion publica escribe en tablas para las que el rol runtime no tiene permisos | Defecto actual deducido del codigo y SQL |
| F2 | Alta | El flujo publico devuelve al pool la conexion incluso si falla el rollback | Defecto actual de manejo de fallos |
| F3 | Alta antes de generar mas migraciones | Journal completo, pero snapshots y esquema SQL/TypeScript desalineados | Defecto actual del flujo de evolucion |
| F4 | Alta antes de datos reales | Excepcion de RLS forzada pendiente de resolver o aprobar | Riesgo conocido, con controles compensatorios |
| F5 | Media | Reglas, persistencia y contratos mezclados; limites entre features permeables | Deuda estructural actual |
| F6 | Media antes de un segundo modulo opcional | Falta un modelo de habilitacion de funcionalidades | Decision de producto pendiente |
| F7 | Media; alta para creacion publica | Tests buenos en varias fronteras, pero huecos y acoplamientos concretos | Deficiencia de cobertura/diseno |
| F8 | Media | El timeout HTTP del dashboard termina antes de leer el cuerpo | Defecto actual del limite temporal |
| F9 | Baja | Documentacion de arquitectura y migraciones describe estados antiguos | Riesgo de orientacion incorrecta |

Estas referencias son identificadores locales del informe, no nuevos requisitos `DIVE-*` o `MT-REQ-*`.

## Hallazgos Justificados

### F1. La reserva publica no respeta la frontera de escritura de IAM

**Documented:** [PublicBookingService.create](../../apps/api/src/booking/public-booking.service.ts#L166) inserta directamente en `iam_app.audit_records` y `iam_app.outbox_events`. La [migracion 0003](../../packages/database/drizzle/0003_add_iam_invitation_lifecycle.sql#L611) revoca el acceso directo a esas tablas. La [0016](../../packages/database/drizzle/0016_add_public_booking_create.sql#L124) concede permisos sobre tablas de booking y el resolver de canal, pero no restituye esas escrituras. El [test de privilegios IAM](../../packages/database/test/integration/iam-api.integration.test.ts#L167) espera explicitamente que ambos permisos de insercion sean falsos.

**Derived:** con la cadena versionada aplicada y el rol `dive_app`, una creacion valida que alcanza la auditoria deberia fallar por permisos y revertirse, en lugar de devolver la reserva. Es una incompatibilidad estatica de alta confianza; no se ha reproducido por HTTP en esta revision. Un grant manual en una base local ocultaria el problema y constituiria deriva respecto al repositorio.

**Proposed:** dar a la creacion publica una operacion de persistencia autorizada, acotada a su contexto de canal y transaccion, para registrar sus efectos atomicos. No arreglarlo concediendo INSERT general sobre auditoria/outbox ni usando el rol de migracion. El [comando de auditoria de catalogo](../../packages/database/drizzle/0014_add_booking_catalog_audit_command.sql#L18) tampoco se puede reutilizar sin mas: exige un miembro activo, y el publico no lo es. La frontera debe representar esa diferencia de actor.

Verificacion futura propuesta: creacion HTTP con `dive_app`, filas persistidas de reserva/verificadores/auditoria/outbox y rollback total si falla uno de esos pasos. Conservar por separado el test que prohibe escrituras IAM directas.

### F2. Gestion de transacciones duplicada y menos segura

**Documented:** los bloques de error de [PublicBookingService](../../apps/api/src/booking/public-booking.service.ts#L222), tanto en `create` como en `isOriginAllowed`, ejecutan `ROLLBACK` y llaman a `release()` en un `finally`. La utilidad existente [rollbackAndReleaseClient](../../packages/database/src/transaction-lifecycle.ts#L3) destruye la conexion con `release(true)` si el rollback falla; [withTenant](../../packages/database/src/unit-of-work.ts#L15) ya la utiliza.

**Derived:** la nueva ruta reintroduce el tipo de defecto corregido anteriormente: puede devolver una conexion de estado incierto al pool y sustituir el error original por el error de rollback. No demuestra una fuga activa entre tenants, pero debilita la garantia de limpieza que necesita ese aislamiento.

**Proposed:** concentrar el ciclo de conexion/transaccion en persistencia y reutilizar su tratamiento de fallos. Mantener explicita la diferencia entre contexto autorizado de miembro y contexto publico resuelto desde un canal; no sustituir ambos por un helper que acepte cualquier `tenantId` del cliente. Ampliar la prueba de fallo de rollback al camino publico, no solo al helper existente.

### F3. Drizzle: aplicar la historia y generar el siguiente cambio no son lo mismo

**Documented, aspectos correctos:**

- [drizzle.config.ts](../../packages/database/drizzle.config.ts#L3) genera desde el agregador de producto, no desde el harness.
- [migrateProduct](../../packages/database/src/migrate.ts#L19) usa el migrador oficial `drizzle-orm/node-postgres/migrator`, no un recorrido propio de SQL.
- La inspeccion del [journal](../../packages/database/drizzle/meta/_journal.json) encontro 17 entradas y 17 SQL correspondientes, sin SQL huerfanos ni ausentes, indices consecutivos y timestamps estrictamente crecientes.
- El [test de migraciones](../../packages/database/test/integration/migrations.integration.test.ts#L48) contempla una base vacia, segunda ejecucion sin nuevas entradas y rollback de una migracion fallida. Se ha leido, no ejecutado.
- Hay separacion de roles y SQL versionado para RLS, grants y funciones. SQL manual revisado es apropiado para estas capacidades; no todo debe expresarse con el ORM.

**Documented, problemas:** el ultimo [snapshot 0013](../../packages/database/drizzle/meta/0013_snapshot.json) no contiene `channels`, `bookings` ni `capability_verifiers`. Tampoco refleja los indices adicionales de [0015](../../packages/database/drizzle/0015_add_catalog_list_order_indexes.sql) ni la nueva nulabilidad del actor de auditoria en [0016](../../packages/database/drizzle/0016_add_public_booking_create.sql). El [esquema TypeScript](../../packages/database/src/booking-schema.ts#L176) si contiene las nuevas tablas. Ademas, `channels.confirmation_mode` tiene `DEFAULT 'immediate'` en SQL y no tiene default en TypeScript.

**Derived:** ejecutar la historia SQL puede funcionar mientras la siguiente generacion resulta incorrecta: Kit compara el esquema con snapshots, no con la realidad creada por SQL manual. Puede proponer recrear tablas o indices ya existentes y producir una migracion que falle al aplicarse. No se afirma que cada SQL deba tener snapshot: una migracion solo de funciones/grants puede no cambiar el modelo; aqui si hay cambios estructurales no representados.

**Proposed:** escoger una de las dos estrategias siguientes antes de generar otra migracion. Si alguna base persistente o compartida ya depende de la historia actual, reconciliar modelo TypeScript, ultimo snapshot e historia aplicada sin reescribir migraciones. Si todas las bases son desechables y solo contienen datos sinteticos, consolidar ahora la historia en una baseline unica es razonable y evita reparar snapshots intermedios que todavia no constituyen una interfaz publicada. En ambos casos hay que determinar expresamente si el default SQL de `confirmation_mode` forma parte del contrato. No usar `drizzle-kit push` para ocultar la deriva ni alterar timestamps para forzar ejecuciones.

#### Consolidacion pre-release propuesta

El journal no tiene que contener exactamente 17 entradas: actualmente tiene 17 porque existen 17 migraciones ordenadas. Puede quedar en una entrada que represente el estado inicial completo si se cumplen **todas** estas condiciones:

- no existe ninguna base persistente, compartida, de staging o de produccion que haya aplicado las migraciones actuales;
- no hay datos que deban conservarse ni otro consumidor que necesite actualizarse desde una version intermedia;
- las ramas activas que tocan esquema pueden coordinarse sobre la nueva baseline;
- se acepta explicitamente recrear las bases de desarrollo y CI desde cero.

Si alguna condicion no se cumple, no consolidar: conservar las 17 entradas como historia inmutable y corregir el estado final mediante una nueva migracion y metadata coherente.

**Procedimiento propuesto si se confirma que todo es desechable:**

1. Inventariar las bases y ramas consumidoras y registrar la confirmacion de que ninguna necesita la historia existente.
2. Cerrar primero el esquema TypeScript final, incluidos tablas, columnas, constraints, indices y defaults estructurales que Drizzle debe conocer.
3. Generar una migracion estructural inicial y su snapshot con la version instalada de Drizzle Kit. No construir la baseline concatenando ciegamente los 17 SQL.
4. Incorporar y revisar en esa misma baseline el SQL especifico de PostgreSQL que Kit no expresa adecuadamente: esquemas, RLS, policies, grants/revokes, roles aplicables, funciones `SECURITY DEFINER`, `search_path`, locks y comandos atomicos.
5. Sustituir el directorio de migraciones por un SQL inicial, un journal con una entrada y el snapshot final correspondiente. Conservar el harness `mt_spike` separado de las migraciones de producto.
6. Recrear una base desechable desde cero usando exclusivamente bootstrap + migrador. No modificar manualmente el registro `drizzle.__drizzle_migrations` de una base que se pretenda conservar.
7. Verificar estructura y comportamiento: segunda aplicacion sin cambios, rol runtime sin DDL/BYPASSRLS, grants minimos, RLS/policies, relaciones cross-tenant, contexto ausente o malformado, limpieza del pool y atomicidad negocio+auditoria+outbox.
8. Generar inmediatamente una migracion de prueba sin cambios. El resultado esperado es que Kit no proponga recrear tablas, constraints o indices ya presentes. Descartar esa migracion de prueba si esta vacia.
9. Actualizar README y CI para declarar la nueva baseline y eliminar referencias a numeros de migracion anteriores. A partir de ese punto, tratar la baseline como inmutable y anadir migraciones incrementales.

**Criterios de salida:** un SQL registrado, una entrada de journal, un snapshot final alineado, creacion correcta desde cero y diff de generacion posterior vacio. La consolidacion no autoriza a debilitar F1 o F4: los permisos restrictivos y la decision pendiente sobre `tenant_contexts` deben preservarse o resolverse de forma explicita.

Para cambios futuros: generar las diferencias estructurales con Kit, versionar SQL + metadata correspondientes y anadir el SQL especifico de PostgreSQL mediante el flujo de migraciones acordado. Un cambio concurrente de otra rama requiere reconciliar orden y snapshots antes del merge.

**Limite del journal:** registrar que una migracion se aplico no demuestra equivalencia entre la base, los snapshots y el esquema actual. La inspeccion realizada certifica correspondencia de ficheros, no el resultado SQL ni el estado de un entorno desplegado.

### F4. La excepcion de RLS sigue abierta

**Documented:** [0007](../../packages/database/drizzle/0007_add_tenant_contexts.sql#L22) habilita RLS en `iam_app.tenant_contexts`, pero declara `NO FORCE ROW LEVEL SECURITY`. Esto no cumple literalmente [MT-REQ-004](../../specs/multitenancy/MT-SPIKE-001-requirements.md#L51). La [auditoria anterior, DATA-01](application-risk-audit-2026-09-27.md) ya lo registra como pendiente.

Tambien hay controles reales: acceso directo revocado a `dive_app`, funciones privilegiadas con `search_path` fijo y [tests de aislamiento de los comandos](../../packages/database/test/integration/iam-api.integration.test.ts#L201). No es correcto describirlo como una fuga demostrada ni como ausencia total de RLS.

**Proposed:** cerrar la clasificacion/modelo de amenazas y aprobar formalmente la excepcion, o redisenar la resolucion para satisfacer el contrato. No cambiar simplemente el booleano esperado en un test para declarar conformidad. Los tests de controles compensatorios son utiles, pero no reemplazan una decision normativa pendiente.

### F5. Carpetas por feature, pero dependencia fuerte del detalle de persistencia

**Documented:** [ActivityCatalogService](../../apps/api/src/catalog/activities/activity-catalog.service.ts#L1) combina validacion, transiciones, DTO, SQL/Drizzle y efectos. [CatalogAccessService](../../apps/api/src/catalog/catalog-access.service.ts#L1) consulta directamente tablas IAM y entrega al callback un UoW con cliente/ORM. [PublicBookingService](../../apps/api/src/booking/public-booking.service.ts#L1) combina SQL crudo, transacciones, capacidad, tokens y respuesta HTTP. [domain](../../packages/domain/src/index.ts) y [application](../../packages/application/src/index.ts) siguen vacios.

Hay tambien dependencia directa de booking hacia detalles internos de catalogo, como [CatalogProblemFilter](../../apps/api/src/booking/public-booking.controller.ts#L20). El [indice publico de database](../../packages/database/src/index.ts) exporta todas las tablas y operaciones de bootstrap/migracion junto con operaciones runtime.

**Derived:** las carpetas Nest ayudan a navegar, pero no bastan como limite modular. Cambiar almacenamiento, transporte o forma de auditar obliga a tocar logica de negocio. Dar acceso a todas las tablas facilita que futuros modulos escriban en datos ajenos. F1 y F2 muestran un coste concreto, no solo una preferencia estetica.

**Proposed:** extraer de forma incremental reglas puras de negocio y operaciones de persistencia por caso de uso; mantener SQL, locks y RLS en su adaptador. Comenzar por creacion de reserva y su transaccion, no por un repositorio generico para cada tabla. Separar errores de negocio de su traduccion HTTP y publicar solamente contratos realmente consumidos entre features. No hacen falta capas repetidas ni interfaces para cada clase.

### F6. No hay habilitacion de modulos independiente de los permisos

**Documented:** [AppModule](../../apps/api/src/app/app.module.ts#L12) compone IAM, catalogo y reserva publica estaticamente. [IAM_PERMISSIONS y roles](../../packages/identity/src/index.ts#L171) expresan permisos, no funcionalidades contratadas. No se ha localizado un modelo de suscripcion/entitlements en las aplicaciones y paquetes inspeccionados.

**Derived:** esto es razonable para la primera funcionalidad, pero no permite afirmar que la base ya resuelve productos opcionales. Un rol con permisos de reservas no expresa si el operador contrato reservas; un menu oculto tampoco impide una llamada HTTP.

**Proposed:** definir el modelo antes del segundo modulo opcional. La propuesta concreta y sus decisiones pendientes se desarrollan mas abajo. Almacen y facturacion son ejemplos, no alcance aprobado; [SPEC-DIVE-OPS-001](../../specs/domain/SPEC-DIVE-OPS-001.md) permanece Deferred.

### F7. La estrategia de tests es razonable, su aplicacion es desigual

**Documented, hueco importante:** `PublicBookingModule` esta registrado, pero la busqueda de consumidores de `PublicBookingService`, de su endpoint y de sus resultados no localizo una prueba de creacion publica completa. Los tests actuales se concentran en [cripto](../../apps/api/src/booking/public-booking.crypto.spec.ts), [CORS](../../apps/api/src/booking/public-booking.cors.spec.ts), [validacion](../../apps/api/src/booking/public-booking.validation.pipe.spec.ts) y [aislamiento de persistencia](../../packages/database/test/integration/booking-catalog.integration.test.ts#L276). Insertar fixtures con admin y leerlas como tenant no ejecuta la creacion como `dive_app`; por eso no descubre F1.

**Documented, acoplamiento:** [catalog-access.service.spec.ts](../../apps/api/src/catalog/catalog-access.service.spec.ts#L44) fuerza con `as unknown as` el acceso al metodo privado `context`. Puede romperse con un refactor correcto y evita la entrada publica `authorized`. Probar las mismas respuestas/errores a traves de esa entrada mantendria el valor del test sin fijar su implementacion.

**Documented, alineacion incompleta:** [bookingTables](../../packages/database/test/integration/migrations.integration.test.ts#L28) solo incluye activities/slots; quedan fuera las tres tablas de 0016. El test compara nombres/nulabilidad de columnas y nombres de checks, no toda la equivalencia de tipos, defaults, expresiones, FK, indices o metadata de generacion. Es cobertura util, pero su nombre puede sugerir una garantia mayor.

**Proposed:** anadir cobertura en esas fronteras reales, organizar la suite por funcionalidad y usar tipos completos en los fakes. No perseguir un porcentaje de cobertura como sustituto de estas pruebas. La revision no aporta evidencia de que los tests se hayan manipulado deliberadamente para pasar; si encuentra pruebas parciales y una prueba sobre un detalle privado.

### F8. El timeout del dashboard no cubre la lectura del cuerpo

**Documented:** [createDashboardApi.request](../../apps/web/src/features/dashboard/tenant-context.ts#L196) limpia el timer y el listener de cancelacion al resolverse `fetch`, antes de `response.json()` o de leer Problem Details. `fetch` puede resolverse cuando llegan las cabeceras, antes de recibir todo el cuerpo.

**Derived:** un servidor que envia cabeceras y deja el cuerpo pendiente puede mantener la operacion abierta mas alla del timeout configurado; la cancelacion posterior del llamador tampoco se propaga mediante ese listener. No se ha simulado ese comportamiento durante esta revision.

**Proposed:** mantener el deadline y la cancelacion hasta terminar el consumo del cuerpo. La prueba discriminante futura es una respuesta con cabeceras inmediatas y cuerpo bloqueado, mas cancelacion despues de las cabeceras; no basta un mock de `fetch` que nunca resuelve.

### F9. La documentacion de orientacion ha quedado atras

**Documented:** [overview](overview.md#L16) todavia describe database como vacio; [ADR-DIVE-002](../../specs/architecture/adrs/ADR-DIVE-002.md#L27) conserva afirmaciones sobre CI/Compose diferidos, mientras [CI](../../.github/workflows/ci.yml) ya tiene build, checks y PostgreSQL. El [README de migraciones](../../packages/database/drizzle/README.md) menciona solo `iam-schema`, aunque la configuracion usa `product-schema`. El [README de database](../../packages/database/README.md) aun cita `IamService` y no describe completamente booking.

**Proposed:** actualizar la guia de estado actual y distinguir claramente el contexto historico de los ADR de las decisiones vigentes. Esto reduce instrucciones contradictorias para personas y agentes. No reescribir decisiones historicas ni promover estados en este informe.

## Organizacion Por Proyecto

Evaluacion `Derived` del estado observado; cambios de esta tabla `Proposed`.

| Proyecto | Evaluacion y siguiente paso proporcionado |
|---|---|
| `apps/api` | Buena separacion Nest por IAM/catalogo/booking y subcapacidades IAM. Conservarla. Reducir SQL/reglas mezclados y dependencias de internos de otra feature; un modulo Nest por si solo no impide imports arbitrarios. |
| `apps/web` | App Router para rutas y features para comportamiento es adecuado. Separar shell/sesion/tenant de catalogo: actualmente `createDashboardApi` agrega el API de catalogo y el contexto comun depende de ese agregado. Evitar que cada nueva funcionalidad agrande esa API central. |
| `apps/worker` | Es un stub que solo imprime un mensaje. Buena separacion como proceso futuro, pero no hay consumidor productivo. No atribuirle garantias de entrega. |
| `packages/domain` | Vacio. Reservarlo para reglas puras agrupadas por capacidad cuando se extraigan reglas reales; no llenarlo con DTO HTTP o modelos Drizzle. |
| `packages/application` | Vacio. Puede alojar casos de uso y sus puertos al extraer el flujo de reserva o compartirlo con worker. No es obligatorio mover todo de golpe solo para ocupar el paquete. |
| `packages/database` | Valiosos UoW, controles de roles y comandos atomicos. Demasiada superficie publica y mezcla fisica de runtime, migracion y harness. Subcarpetas y exports separados por responsabilidad bastan inicialmente; conservar la separacion funcional del harness ya existente. |
| `packages/identity` | Puerto real frente a Clerk, pero mezcla autenticacion, politica de autorizacion y adaptador. Separar internamente contrato, politica IAM y adaptador; exponer el concreto solo a la composicion. |
| `packages/contracts` | Pequeno vocabulario IAM sin SDK. Buen candidato para contratos de frontera por funcionalidad, no para un modelo universal compartido de todas las capas. |
| `packages/observability` | Ya contiene puerto, adaptador OpenTelemetry y correlacion con AsyncLocalStorage. No esta vacio. Mantenerlo transversal, sin convertir correlacion en fuente de autorizacion. La exportacion operativa de telemetria no queda demostrada por esta inspeccion. |
| `packages/config` | Vacio; la configuracion real esta junto a los consumidores API/DB/web. No centralizar secretos de servidor y valores publicos web indiscriminadamente. Extraer solo validaciones realmente compartidas. |
| `packages/email` | Vacio. Implementar el puerto/adaptador cuando exista el consumidor aprobado, desde worker y fuera de la transaccion SQL. |
| `packages/i18n` | Vacio. Definir diccionarios por funcionalidad cuando se introduzca i18n; no duplicar manualmente traducciones de cada modulo dentro del shell. |
| `packages/ui` | Vacio. Compartir primitivas visuales sin importar APIs, tenant-context o Clerk. Las pantallas de negocio permanecen en su feature. |
| `packages/testing` | Vacio. Extraer fixtures/factories solo ante duplicacion real; evitar un paquete de mocks que reproduzca la implementacion de negocio. |
| `packages/typescript-config` | Configuraciones estrictas compartidas: base adecuada. TypeScript no impide por si solo dependencias arquitectonicas incorrectas. |

Las configuraciones y exports se han inspeccionado en los manifiestos de las aplicaciones y paquetes. Los paquetes vacios no son por si mismos un fallo: documentarlos como reservados es suficiente. No recomiendo crear mas paquetes vacios ni separar uno por entidad.

En web, [CatalogPanel](../../apps/web/src/features/dashboard/catalog-panel.tsx) tiene 981 lineas y [DashboardTenantContext](../../apps/web/src/features/dashboard/dashboard-tenant-context.tsx) 616, combinando formularios, navegacion, consultas o recuperacion de sesion. Importan sus responsabilidades, no el numero aislado. La auditoria previa difiere el refactor de la UI temporal: aprovechar su reemplazo para separar esas piezas, sin reestructurar ahora pantallas que se van a descartar.

## Modulos Opcionales

Todo este apartado es **Proposed**, pendiente de decisiones comerciales. La arquitectura base no necesita un sistema de plugins, carga dinamica de Nest por usuario, tablas por cliente ni microservicios.

### Tres conceptos separados

| Concepto | Pregunta que responde | Lugar de decision propuesto |
|---|---|---|
| Habilitacion de funcionalidad | Que capacidades tiene disponibles el operador | Estado interno de la plataforma por tenant; granularidad exacta por decidir |
| Autorizacion | Que puede hacer esta identidad en este tenant/centro | Politica IAM y contexto autorizado |
| Preferencia de interfaz | Que quiere ver o usar normalmente esta persona | Preferencias de UI; nunca concede acceso |
| Flag de despliegue | Esta version de una capacidad esta habilitada tecnicamente | Configuracion de rollout; no sustituye contratacion ni permisos |

Para una accion protegida, comprobar conjuntamente tenant/contexto valido, funcionalidad habilitada, permiso/alcance y reglas del recurso. Aplicar la comprobacion en servidor/caso de uso, no solo en el menu. Web consume una proyeccion de capacidades para navegar y cargar pantallas; no decide la autoridad. Los canales publicos y jobs requieren su propia politica aplicable, no roles humanos ficticios.

### Limites sencillos

- Mantener features por capacidad de negocio. Catalogo y disponibilidad pueden seguir siendo subcapacidades de reservas; una carpeta no obliga a venderla como modulo separado.
- Una capacidad es propietaria de sus escrituras y expone operaciones publicas o eventos definidos. Facturacion no deberia actualizar tablas de reservas ni importar sus servicios internos.
- Las FK entre datos del mismo monolito son utiles, especialmente las compuestas que aseguran tenant. No eliminarlas para aparentar independencia.
- Usar colaboracion sincrona para invariantes que deben resolverse juntas. Usar outbox/eventos para efectos posteriores desacoplados, por ejemplo una notificacion; no sustituir toda llamada por eventos.
- Mantener todos los modulos instalados en el despliegue y restringir su uso por contexto es suficiente inicialmente. Las migraciones de la base compartida no dependen de que cada tenant active una pantalla.
- Al desactivar un modulo, no borrar sus datos por defecto. Acceso historico, exportacion, comandos en curso y mensajes pendientes requieren una decision explicita.

### Preguntas que si necesitan decision

1. La disponibilidad se contrata por operador, por centro, por usuario o combina niveles? La propuesta por tenant se apoya en [ADR-DIVE-001](../../specs/architecture/adrs/ADR-DIVE-001.md), pero no resuelve por si sola la politica comercial.
2. "No necesitar" significa no contratar, no tener permiso o simplemente ocultar la funcionalidad?
3. Que debe ocurrir con lecturas historicas, exportaciones, enlaces publicos y operaciones pendientes al desactivar una capacidad?
4. Puede facturacion funcionar sin reservas? Que dependencias son obligatorias y cuales integraciones opcionales?
5. Quien habilita funcionalidades y como se auditan sus cambios? Que comportamiento se espera si la fuente de habilitaciones no esta disponible?

Estas preguntas no bloquean el informe; si bloquean implementar una politica concreta sin inventar comportamiento.

## Sustituibilidad De Proveedores

**Clerk: proteccion real, pero no aislamiento total.** [IdentityProviderPort](../../packages/identity/src/index.ts#L45), el principal propio y la identidad interna por issuer/subject evitan que la logica de acceso dependa directamente del objeto de usuario de Clerk. En web, [SessionTokenSource](../../apps/web/src/features/dashboard/tenant-context.ts#L21) y [ClerkDashboardSession](../../apps/web/src/features/dashboard/clerk-dashboard-session.tsx#L3) proporcionan una frontera equivalente. El SDK queda principalmente en adaptadores y composicion; importarlo en el layout/proveedor que lo instala no es un fallo por si mismo.

**Derived:** la sustituibilidad se debilita porque el [indice identity](../../packages/identity/src/index.ts#L150) reexporta Clerk y contiene la matriz IAM; el puerto/evento de webhook se define en el propio [adaptador Clerk](../../packages/identity/src/clerk.ts#L41). Database depende del mismo paquete que instala el SDK. [CoreModule](../../apps/api/src/common/core.module.ts) publica tambien el adaptador concreto y usa un modulo global.

**Proposed:** contratos neutrales y politica IAM en archivos/exports separados; adaptador Clerk importado por la raiz de composicion. El guard puede llamarse por su responsabilidad de autenticacion, no por el proveedor. No crear una interfaz generica que copie cada metodo del SDK: conservar las operaciones que necesita el producto. La sustitucion de proveedor seguira requiriendo migrar vinculaciones de identidad, sesiones, webhooks y flujos de autenticacion; una fachada reduce el impacto, no lo elimina.

**Contratos web/API:** [catalog-api](../../apps/web/src/features/dashboard/catalog-api.ts#L1) redeclara tipos de estados/DTO y no depende de contracts. `response.json() as T` no valida datos. Propuesta: escoger una fuente de contrato por feature, bien contratos neutrales compartidos, bien cliente/tipos derivados de OpenAPI. No exportar clases Nest ni filas Drizzle al navegador. Mantener validacion servidor; el tipado compartido no sustituye validacion de entradas ni pruebas de compatibilidad.

**PostgreSQL/Drizzle:** no es un objetivo realista poder cambiar PostgreSQL sin trabajo cuando RLS, locks y funciones son parte deliberada de las garantias. El objetivo util es que las reglas de negocio y los consumidores no conozcan esos detalles, conservando SQL especializado donde aporta seguridad y atomicidad.

## Calidad Del Planteamiento De Tests

**Fortalezas observadas:**

- [HTTP IAM](../../apps/api/test/iam.e2e-spec.ts#L186) usa la aplicacion real, PostgreSQL y un proveedor de identidad sustituible. Mockear el proveedor externo es adecuado para probar autorizacion local.
- [Rollback IAM](../../apps/api/test/iam.e2e-spec.ts#L626) provoca un conflicto real de outbox y verifica que membresia y auditoria no queden parcialmente modificadas. No se limita a comprobar que se llamo a una funcion.
- [Concurrencia de propietarios](../../apps/api/test/iam.e2e-spec.ts#L697) dispara peticiones y comprueba el numero final de propietarios activos. El retardo SQL amplifica la ventana, aunque no constituye una barrera determinista de intercalado.
- [Persistencia booking](../../packages/database/test/integration/booking-catalog.integration.test.ts#L375) verifica filas tras rollback; los tests de aislamiento usan varios tenants. Inspeccionar grants, RLS o indices en tests de infraestructura es apropiado: ahi son parte del contrato, no detalles privados arbitrarios.
- [CatalogPanel tests](../../apps/web/src/features/dashboard/catalog-panel.test.tsx#L120) interactuan con controles visibles y comprueban peticiones a su frontera API. Los mocks del backend no prueban seguridad servidor y no necesitan hacerlo.
- [Test Clerk web](../../apps/web/src/features/dashboard/clerk-dashboard-session.test.tsx) solo prueba el adaptador simulado. [TRACE](../../specs/traceability/TRACE-DIVE-MVP-001.md) lo reconoce expresamente y separa la evidencia externa de sandbox.

**Mejoras propuestas, ademas de F7:**

- Dividir la suite HTTP IAM de 1447 lineas por capacidades, manteniendo fixtures comunes pequenos. No copiar un segundo harness entero por feature.
- Sustituir fakes parciales convertidos a interfaces grandes, como `as unknown as DashboardApi`, por dependencias estrechas y fakes tipados. Un cast para enviar entrada invalida deliberadamente es distinto y puede ser correcto.
- Probar ultima plaza y reintentos concurrentes por la entrada de creacion publica, consultando estado final, duplicados y atomicidad; las pruebas de propietarios o del harness de outbox no cubren ese caso.
- Para migraciones, enumerar todas las tablas de producto y comprobar tambien nuevas restricciones/defaults relevantes. Completar el camino desde una version anterior con datos representativos, no solo una base vacia, cuando aparezcan cambios destructivos o backfills.
- Conservar tests del contrato actual separados de pruebas de excepciones conocidas. Un resultado verde en DATA-01 no convierte `NO FORCE` en cumplimiento de `MT-REQ-004`.
- Revisar que una regresion concreta haria fallar el test: retirar un permiso, omitir el outbox, duplicar una reserva o cambiar un tenant deberia producir un resultado observable incorrecto. No se han hecho experimentos de mutacion en esta revision.

No se propone dejar de testear adaptadores ni prohibir todos los mocks. Se propone no confundir una prueba del adaptador con una prueba de la funcionalidad completa. Los directorios generales de tests no implican suites ejecutables: [CI](../../.github/workflows/ci.yml) ejecuta los scripts y patrones reales de cada proyecto.

## Seguridad Y Rendimiento

**Puntos fuertes resumidos:** roles runtime/migracion separados y comprobados al arrancar; consultas parametrizadas; contexto transaccional; FK compuestas; comandos sensibles; autenticacion separada de permisos internos; auditoria/outbox atomicos en caminos ya implementados; correlacion y configuracion defensiva. Son mejores fundamentos que confiar exclusivamente en filtros ORM o en permisos del frontend.

**Riesgos y recomendaciones propuestas, sin mediciones:**

- Resolver F1/F2/F4 antes de considerar esta base apta para flujos reales. RLS limita filas, pero no sustituye la autorizacion por accion ni garantiza que cualquier SQL emitido por una feature sea correcto.
- La consulta de plazas ocupadas en [PublicBookingService](../../apps/api/src/booking/public-booking.service.ts#L319) suma reservas bajo bloqueo del slot. Hay indice por tenant/slot/status y el lock es una base razonable de serializacion, pero el historial por slot aumentara el trabajo y la contencion. Medir antes de introducir contadores/materializaciones, y mantener todos los escritores de capacidad bajo un protocolo comun.
- La autenticacion [Clerk](../../packages/identity/src/clerk.ts#L268) revalida sesion y usuario, con llamadas paralelas despues de verificar el token. Es una decision de seguridad con coste de latencia/disponibilidad. No anadir caches que retrasen revocaciones sin cambiar primero el contrato. El [transporte por defecto](../../packages/identity/src/clerk.ts#L158) no utiliza los AbortSignal recibidos: un deadline limita espera, no necesariamente trabajo externo pendiente. Este residual ya aparece en la auditoria anterior.
- Revisar las claves de cache al crecer web: [centersQuery](../../apps/web/src/features/dashboard/dashboard-tenant-context.tsx#L185) usa una clave global y [catalogo](../../apps/web/src/features/dashboard/catalog-panel.tsx#L210) incluye recurso/filtros, no una particion explicita de sesion/tenant. Hoy se limpia la cache al cambiar contexto; no se demuestra una fuga. Una identidad segura de contexto/tenant y version de contrato, mas cancelacion/limpieza al cambiar, reduce la dependencia de que cada modulo recuerde invalidar todo. No usar el bearer ni el handle secreto como claves visibles en logs/devtools.
- [Worker](../../apps/worker/src/main.ts) aun no entrega efectos; [processOutboxOnce](../../packages/database/src/outbox-consumer.ts) opera sobre el harness y efectos SQL, no sobre email productivo. Antes de entrega real, cerrar idempotencia destino, reintentos, recuperacion de trabajos y fallo entre envio y confirmacion. No prometer exactly-once ni mantener transacciones abiertas durante una llamada al proveedor.
- Al crecer la cola, abordar indices de seleccion, retencion de payloads con PII, observabilidad y limites por tenant con decisiones aprobadas. La existencia de una fila outbox no demuestra entrega ni una politica de retencion.
- El [hot path de catalogo](../../apps/api/src/catalog/activities/activity-catalog.service.ts#L64) ya limita paginas y dispone de indices de orden. OFFSET profundo puede encarecerse; no cambiar a cursor sin necesidad medida y sin revisar el contrato publico.

Despliegue, secretos reales, backup/restauracion, aislamiento fuera de PostgreSQL y telemetria operativa requieren sus propias validaciones antes de un piloto. Se conservan como limites, no se inventan presupuestos numericos ni se repite aqui toda la [auditoria operativa previa](application-risk-audit-2026-09-27.md).

## Lo Promueven Los Agentes?

**Si, en las instrucciones; no esta garantizado en el codigo.** [Backend: Implementation design](../../.github/agents/backend-api-implementer.agent.md#L89) ya exige features por capacidad, controllers/adaptadores delgados, dominio sin SDK/persistencia, contratos publicos entre features y tests por entradas publicas. Las [instrucciones generales](../../.github/copilot-instructions.md) exigen direccion de dependencias, composicion y pruebas de comportamiento. [Test Engineer](../../.github/agents/test-evidence-engineer.agent.md) rechaza sustituir pruebas RLS/transacciones por mocks.

**Derived:** faltan mecanismos que hagan verificables esas reglas. Biome recomendado, TypeScript estricto y workspaces no impiden imports de internos de otra feature, SQL en servicios ni SDKs filtrados por exports. No se encontraron reglas ejecutables de arquitectura en la configuracion inspeccionada.

**Proposed:** no crear otro agente como primera solucion. Anadir pocos controles de imports con una herramienta existente, por ejemplo dependency-cruiser, despues de acordar los limites. Empezar por dominio sin framework/DB/SDK, web sin database, harness fuera del runtime, ausencia de ciclos y consumidores externos sin imports internos de features. Excepciones explicitas para composicion y adaptadores; no una prohibicion ciega de SQL o SDK en todo el monorepo.

Complementar el checklist actual con: propietario del dato/caso de uso, contrato publicado, efecto de desactivar la capacidad, transaccion autorizada reutilizada, cambios SQL coherentes con metadata y test que detecta una regresion observable. La decision comercial debe existir antes de pedir al agente que implemente entitlements.

## Orden De Trabajo Propuesto

1. **Corregir defectos concretos:** creacion publica y permisos de auditoria/outbox, rollback del pool y cobertura HTTP de esa transaccion. Mantener los permisos restrictivos.
2. **Sanear evolucion de datos:** confirmar si todas las bases son desechables. Si lo son, ejecutar la consolidacion pre-release de F3; si no, conservar la historia y reconciliar snapshots/SQL/modelo mediante una nueva migracion. En ambos casos, ampliar la alineacion de tablas/defaults y resolver por separado DATA-01 antes de datos reales.
3. **Hacer explicitos los limites ya necesarios:** extraer el caso de uso de reserva y su adaptador de persistencia; separar contratos neutrales de Clerk y contratos HTTP. Sin reescritura global.
4. **Definir modularidad comercial:** responder las preguntas de F6 y aprobar el contrato minimo antes del siguiente modulo opcional.
5. **Prevenir repeticion:** pequenos controles de imports, tests por frontera, timeout completo y documentacion actual. Aprovechar el reemplazo de UI para separar shell, tenant y catalogo.
6. **Antes de efectos externos/piloto:** worker real con garantias aprobadas, verificaciones operativas y cierre de los gates existentes. No confundir skeleton con producto desplegable completo.

No recomiendo ahora event sourcing, CQRS generalizado, un bus para todas las llamadas, repositorios genericos, bases por modulo/tenant ni una plataforma de plugins. Ninguno resuelve los defectos observados mejor que limites pequenos y pruebas de los caminos reales.

## Alcance De La Verificacion

Se leyeron fuentes, manifests, configuraciones, migraciones y tests; se buscaron imports y consumidores; se inspeccionaron JSON del journal/snapshots sin cargar codigo de producto. La comprobacion de metadata dio 17/17 ficheros registrados y orden correcto. Los hallazgos distinguen hechos de codigo, inferencias y propuestas.

No se ejecutaron tests por peticion expresa. Tampoco se probo el generador, la aplicacion de migraciones, el endpoint publico, la cancelacion HTTP, el navegador ni la carga. Las verificaciones futuras descritas son recomendaciones, no resultados obtenidos. Solo se ha creado este informe; no se han corregido codigo, configuraciones, agentes ni SPECs.