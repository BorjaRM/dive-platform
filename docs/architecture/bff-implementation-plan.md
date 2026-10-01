# Plan de implementacion del BFF y sus pruebas

Fecha: 2026-09-30. Elaborado a solicitud del product owner para planificar los cambios y las pruebas del BFF.

**Proposed, Draft:** este documento propone una secuencia de trabajo, no requisitos nuevos, un Development Brief ni autorizacion de implementacion o publicacion. No modifica estados de SPEC/ADR. Los contratos aprobados y las propuestas pendientes conservan su autoridad en los documentos enlazados; documentar un paso no aprueba una decision abierta. Ninguna tarea o prueba del BFF se considera ejecutada por la existencia de este plan.

**Documented -- Decisiones posteriores:** el product owner aprobo el 2026-09-30 el protocolo, procedimiento de credenciales y boundary de navegador, junto con implementacion local acotada sin issue ni Development Brief. La [SPEC propietaria registra esa aprobacion y sus limites](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#approved-bff-protocol-and-browser-boundary); este plan no es su fuente de autoridad. La [aprobacion de clasificaciones](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#proposed-exception-inventory-with-normative-authority) del 2026-10-01 cierra las excepciones enumeradas, no las propuestas restantes de inventario, root, superficies de framework o rollout. No se autoriza publicacion, despliegue ni promocion de estados.

**Documented -- Navegacion de implementacion:** los [README de API](../../apps/api/README.md#bff-admission) y [web](../../apps/web/README.md#server-side-bff-configuration) describen la configuracion y los consumidores actuales; [TRACE](../../specs/traceability/TRACE-DIVE-MVP-001.md#demonstrated-coverage) enlaza las pruebas por slice y conserva sus limites. La secuencia siguiente permanece como plan, no como registro de ejecucion. La [politica JWT aprobada](../../specs/iam/SPEC-DIVE-IAM-001.md#dashboard-jwt-validity-boundary) del 2026-10-01 gobierna autenticacion y revocacion externa; los casos de sesion del plan se interpretan bajo esa politica, sin asumir rechazo inmediato de un JWT aun vigente.

## 1. Fuentes y alcance

**Documented:** las fuentes del plan son:

| Fuente | Uso en el plan |
|---|---|
| [SPEC-DIVE-IAM-DASHBOARD-001](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md), `DIVE-IAM-REQ-030..032` | Scope de aplicacion, BFF seleccionado, bootstrap y decisiones pendientes. Consultar [contrato simple](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#simple-bff-contract), [admision aprobada](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#approved-service-admission-and-bootstrap), [controles contra omisiones](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#avoiding-route-omissions), [protocolo/credenciales aprobados](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#approved-bff-protocol-and-browser-boundary) y [clasificaciones aprobadas y propuestas restantes](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#proposed-exception-inventory-with-normative-authority). |
| [ADR-DIVE-008](../../specs/architecture/adrs/ADR-DIVE-008.md) y [ADR-DIVE-017](../../specs/architecture/adrs/ADR-DIVE-017.md) | Transporte y lifecycle de contextos, entrada por centro y unico despliegue Next.js. |
| [SPEC-DIVE-IAM-001](../../specs/iam/SPEC-DIVE-IAM-001.md) | Identidad, permisos, membresias y scopes actuales; el BFF no cambia roles. |
| [ADR-DIVE-001](../../specs/architecture/adrs/ADR-DIVE-001.md), [multitenancy](../../specs/foundation/multitenancy-architecture.md) y [MT-SPIKE-001](../../specs/multitenancy/MT-SPIKE-001-requirements.md) | Aislamiento por tenant y prueba de invariantes compartidas. Mantener los resultados `MT-REQ-*` separados de `DIVE-*`. |
| [Arquitectura](overview.md), [ADR-DIVE-002](../../specs/architecture/adrs/ADR-DIVE-002.md) y [ADR-DIVE-003](../../specs/architecture/adrs/ADR-DIVE-003.md) | Limites de features, contratos, transacciones y efectos existentes. |
| [Workflow](../sdd/how-we-work.md), [autorizacion explicita](../sdd/development-brief-template.md#explicit-chat-authorization) y [coordinacion](../../.github/agents/README.md) | Entrada de implementacion, validacion proporcional y cambios de responsable con confirmacion. |

**Proposed, Draft -- In:** admision del BFF en API, scope server-resolved, cobertura de todas las operaciones afectadas, transporte servidor de Next.js, consumidores del dashboard, pruebas, configuracion y rollout.

**Proposed, Draft -- Out:** aplicaciones nativas, administracion multicentro, un BFF o credencial por centro, firmas por peticion, nonces, nuevos TTL de sesion, cookies de tenant context, cambios de lifecycle de mappings, nuevos roles y cualquier implementacion de OPS Deferred. Public/widget y webhooks no se convierten en endpoints privados del BFF; conservar sus contratos y probar las excepciones que realmente correspondan.

## 2. Punto de partida y reutilizacion

**Documented:** esta inspeccion local encontro los siguientes puntos de extension; no acredita seguridad transversal ni despliegue real.

| Superficie actual | Cambio propuesto y decision de reutilizacion |
|---|---|
| [AppModule](../../apps/api/src/app/app.module.ts) y [ClerkAuthGuard](../../apps/api/src/common/auth/auth.guard.ts) | Reutilizar el proveedor de identidad. La composicion inspeccionada no registra admision BFF global; incorporar el control compartido en el modulo propietario, manteniendo AppModule como composicion. |
| [Catalog access](../../apps/api/src/catalog/catalog-access.service.ts) y [centers](../../apps/api/src/iam/centers/centers.service.ts) | Reutilizar autorizacion y consultas de sus features. Sustituir la dependencia de Origin como restriccion de aplicacion por scope autenticado; no mover decisiones de dominio al proxy. |
| [Tenant context](../../apps/api/src/iam/tenant-context/tenant-context.service.ts) | Reutilizar emision, resolucion, revocacion y asociacion identidad/sesion. No crear un segundo handle. |
| [Cliente dashboard](../../apps/web/src/features/dashboard/tenant-context.ts) | Reutilizar transporte, token source, sessionStorage, cancelacion y errores; migrar llamadas aplicables al BFF same-origin. El cliente actualmente construye la URL desde `baseUrl`. |
| [Application hosts](../../apps/web/src/lib/application-hosts.ts) | Reutilizar parsing y politica de hosts donde coincidan las semanticas. Separar admision de entrada activa de ownership retenido; no usar un probe CORS como autoridad para cada operacion. |
| [CI](../../.github/workflows/ci.yml) | Ya ejecuta build/check/test y un job PostgreSQL 18 con integracion de DB/API. Todavia no demuestra el recorrido navegador-BFF-API. |

**Proposed, Draft -- Limites:** mantener el transporte del BFF local a apps/web y la admision transversal en el propietario compartido de apps/api. No crear un paquete compartido sin consumidor concreto. Pasar el scope resuelto intacto a los casos de uso; no combinarlo con tenant/actor/center autoritativos duplicados. Cualquier cambio de persistencia preserva las primitivas tenant-scoped existentes y sus contratos RLS. No se anticipa una nueva tabla de credenciales ni un nuevo evento outbox; reevaluar solo ante una decision aprobada que lo requiera.

## 3. Secuencia de trabajo

Todas las fases siguientes son **Proposed, Draft** como plan de ejecucion. Sus pruebas verifican los contratos propietarios; no los sustituyen.

### Fase 0. Cerrar decisiones y entrada de implementacion

Responsables propuestos: Product/Security para decisiones; Backend y Frontend para revisar viabilidad.

- Aplicar el protocolo y procedimiento de credenciales ya aprobados en la SPEC; completar configuracion real del proveedor de secretos, rol operativo y cadencia si corresponde, sin introducir valores por defecto.
- Verificar ingress, Host/forwarded headers y TLS, y la proteccion de mutaciones aprobada; concretar el mapping de errores de servicio preservando la separacion respecto a sesion de usuario.
- Verificar la integracion Clerk y su admision de origen entre autenticacion y dos centros, sin seleccionar `azp` como autoridad ni desactivar verificaciones. Distinguir este control del mapping activo de entrada.
- Seleccionar y comprobar el mecanismo de retirada de instancias/traffic ante compromiso. No llamar inmediata a la propagacion asincrona de variables de entorno.
- Registrar la clasificacion y autoridad de cada excepcion real; resolver operaciones aparentemente globales que devuelvan datos de centro.
- Usar la autorizacion local sin issue/Brief ya registrada en la SPEC para el alcance aprobado. Este plan no reemplaza esa autoridad ni los gates restantes; las decisiones abiertas bloquean las partes que dependan de ellas.

Salida propuesta: contratos/configuracion concretos y autorizacion de la primera porcion implementable. No activar produccion por haber terminado esta fase documental.

### Fase 1. Inventariar rutas y construir el test contra omisiones

Responsable propuesto: Backend.

- Descubrir automaticamente las operaciones HTTP de la aplicacion real. Revisar tambien middleware, handlers fuera de controllers, adaptadores y metodos alternativos registrados.
- Definir metadata de clasificacion en el propietario de admision y un inventario unico, respaldado por contratos, para excepciones no-center.
- Distinguir bootstrap de centro, operaciones privadas de centro y los mecanismos propios de identidad/operador, public/capability, webhooks e infraestructura. No convertir una clasificacion candidata en una excepcion aprobada.
- Crear el test que compara descubrimiento, metadata e inventario; cubrir metadata ausente, contradictoria y excepcion sin propietario. Probar composicion real y no solo un mock de guard.

Dependencia: autoridad de excepciones de fase 0. Salida propuesta: inventario verificable y prueba que detecta una nueva ruta olvidada; aun no es prueba de enforcement de recursos.

### Fase 2. Admision global y scope en API

Responsable propuesto: Backend.

- Incorporar `APP_GUARD` desde el modulo compartido propietario. Hacer explicita la secuencia de clasificacion, servicio, identidad y contexto para cada clase de operacion; evitar repetir llamadas Clerk por guards locales y globales.
- Verificar la credencial de servicio y construir una unica asociacion confiable. Resolver tenant/center contra el registro antes de ejecutar operaciones privadas.
- Integrar bootstrap sin handle previo con el servicio existente, manteniendo las comprobaciones de entrada de su ADR. El resto del acceso center-data conserva su handle y autorizacion actual.
- Adaptar IAM center list/detail y cada feature afectada, incluido catalogo y ownership indirecto. Aplicar scope en consultas de listas, busquedas y agregados, no solo sobre el resultado.
- Preservar los scopes resueltos, RLS, unidad de trabajo, idempotencia, auditoria y outbox de los casos de uso existentes. La autenticacion de servicio no da permisos de producto.
- Mantener separados rechazo de autenticacion y fallo operativo; no convertir un fallo de verificador/resolver en una excepcion publica ni en autorizacion ampliada.

Salida propuesta: pruebas HTTP que rechazan bypass directo y scope A contra recursos B, incluso con permisos del usuario en ambos; regresion de excepciones autorizadas.

### Fase 3. Transporte BFF en el servidor Next.js

Responsable propuesto: Frontend, contra el contrato API ya comprobado.

- Implementar operaciones enumeradas con Route Handlers y codigo server-only en el unico despliegue Next.js. No exponer un proxy de URL arbitraria.
- Validar host/ingress, resolver la asociacion y eliminar metadata de servicio/scope recibida del navegador. Construir los headers upstream desde configuracion y contexto servidor, sin reenviar headers indiscriminadamente.
- Transmitir Clerk y tenant handle segun la clase de operacion. En bootstrap, validar y transmitir el Origin original requerido; no inventarlo si falta. No exigir Origin a todo GET por analogia con bootstrap.
- Fijar el upstream por configuracion confiable, evitar redirecciones a destinos que puedan recibir credenciales y controlar metodos, paths y parametros admitidos.
- Preservar codigos/DTO utiles, minimizar headers de respuesta y redaccion de secretos. Evitar cache compartida de respuestas privadas y de emision de handles.
- Propagar cancelacion y fallos dentro del contrato seleccionado, sin reintentos automaticos de mutaciones. Un timeout no demuestra que una escritura upstream no haya ocurrido.

Salida propuesta: tests de handlers y recorrido real Next.js-API con credenciales sinteticas; ningun secreto en navegador, respuestas o logs.

### Fase 4. Migrar consumidores web

Responsable propuesto: Frontend.

- Cambiar el cliente central y todos sus consumidores center-facing al BFF same-origin; inventariar fetches alternativos y llamadas servidor que pudieran evitarlo.
- Mantener almacenamiento del contexto, token source, revocacion/logout, errores, abort y proteccion frente a resultados obsoletos. No almacenar la credencial de servicio en estado UI.
- Mantener los flujos de identidad y operador segun su clasificacion aprobada, sin activar administracion multicentro.
- Probar navegacion entre hosts, centro no disponible, mapping disabled y retorno tras login. Conservar el lifecycle de contextos ya emitidos.

Salida propuesta: consumidores aplicables migrados, sin fallback a API privada directa, y regresion de comportamiento/accesibilidad del dashboard. No se propone redisenar estilos.

### Fase 5. Integracion, CI y activacion

Responsables propuestos: Backend/Frontend en sus superficies; rol de operaciones para despliegue.

- Incluir los tests de descubrimiento/admision en el test gate actual y los casos DB/API en la integracion PostgreSQL existente.
- Crear un recorrido Next.js-API reproducible con identidad determinista y DB aislada. No confundir los tests HTTP de Nest con un e2e completo de navegador.
- Validar Clerk real en sandbox y hosts de prueba. Usar el harness existente donde aplique; conservar prueba fechada del proveedor solo cuando tests y Validation no puedan representar el resultado.
- Provisionar secretos separados por entorno, aplicar la rotacion aprobada y comprobar retirada de la version anterior en todas las instancias/alias alcanzables. Comprobar rollback y revocacion de emergencia.
- Coordinar despliegue API/BFF y migracion sin ventana de acceso privado sin scope. No activar un guard exigente antes de que sus consumidores esten listos; un rollback conserva la proteccion o suspende el trafico afectado.
- Medir el coste del salto BFF, verificaciones Clerk, consultas de mappings y ownership, cancelaciones y propagacion de errores. No introducir budgets numericos ni caches de autorizacion sin contrato.

Salida propuesta: pruebas automatizadas y comprobaciones reales registradas con sus limitaciones. Actualizar TRACE solo con cobertura efectivamente ejecutada y no copiar logs.

## 4. Matriz de pruebas propuesta

Todos los casos son **Proposed, Draft -- pruebas pendientes**, no evidencia actual. Los errores concretos siguen los contratos que se cierren en fase 0.

| Area | Casos que preparar | Nivel y propietario |
|---|---|---|
| Descubrimiento y admision | Controller nuevo sin clasificacion, excepcion no inventariada, metadata contradictoria, falta de wiring global y superficies fuera de controllers. Controller olvidado denegado aun con credenciales validas. | Contrato/composicion real API; Backend. |
| Credencial de servicio | Ausente, invalida, de otro entorno o retirada; clave valida sin usuario/contexto aplicable; headers de navegador no establecen autoridad. | Unitario y HTTP API; Backend. |
| Clerk y contexto | Token invalido/expirado, sesion revocada, fallo de proveedor, handle de otra identidad/sesion y revocacion posterior a bootstrap. | Reutilizar suites identity/IAM y HTTP; Backend. |
| Bootstrap | Sin handle previo; host/Origin/body coherentes e incoherentes; Origin ausente; mapping desconocido/disabled; permiso o membership insuficiente; fallo del resolver sin emision. | Handler BFF y HTTP API con PostgreSQL; ambos propietarios. |
| Scope A/B en mismo tenant | Usuario limitado a A y usuario autorizado en A/B, incluidos roles amplios. Desde A, pedir B por ID, path, body o lookup indirecto; incluir center list, detalle, catalogo, listas y agregados. | HTTP API/DB con fixtures A/B; Backend. |
| Lifecycle de entrada | Disabled rechaza bootstrap nuevo; contexto previamente emitido conserva el comportamiento aprobado y no obtiene B; reactivacion y key reservado sin reasignacion. | Regresion IAM/DB y consumidor; ambos propietarios. |
| Mutaciones | Acceso B desde A rechazado sin cambios, auditoria de exito ni efectos outbox indebidos. Fallos de servicio/resolver no ejecutan el caso de uso. Error/timeout despues de una escritura no causa reintento duplicado. | Integracion de cada feature y transporte; Backend/Frontend. |
| Excepciones | Public/capability, webhook con firma, identidad y health conservan su mecanismo propietario; no heredan permiso para exponer datos privados de centro. OPTIONS/CORS no evita admision del metodo real. | HTTP sobre composicion real API; Backend. |
| Host e ingress | Host no admitido, forwarded host manipulado/duplicado y namespace de otro entorno. Separar tests del parser de la comprobacion del proxy real. | Unitario BFF y despliegue; Frontend/operaciones. |
| Proxy y secretos | Metodo/path/URL no admitidos, intento de redireccion de upstream, scope/credencial inyectados, cache privada, headers de respuesta y ausencia de secretos en bundle/respuestas/logs. | Handler BFF, build y recorrido real; Frontend. |
| Consumidor | Solo BFF para center-data; Clerk/contexto explicitos, sin secreto; 204 y errores; cancelacion, timeout, respuesta obsoleta, logout y almacenamiento existente. | Vitest del cliente/componentes; Frontend. |
| Rotacion y revocacion | Ambas versiones durante transicion, nueva tras migracion, antigua rechazada en cada API; BFF stale, autoscaling, alias y rollback no recuperan version retirada; emergencia sin solapamiento. | Verificador automatizado y ejercicio real de despliegue; Backend/operaciones. |
| Flujo completo | Login y retorno a A, bootstrap, lectura/escritura permitida, intento B rechazado, navegacion a B con autorizacion propia y sesion revocada. | Next.js-API-PostgreSQL y navegador con Clerk real; ambos propietarios. |
| Rendimiento y fallos | Comparar recorrido anterior/nuevo; comprobar consultas adicionales, doble validacion de identidad, indisponibilidad BFF/API y resultado de cancelacion. | Medicion previa a rollout; sin resultados ni budgets actuales. |

**Proposed, Draft -- Casos MT separados:** ante cambios de queries/persistencia, verificar acceso permitido en el mismo tenant, rechazo entre tenants, contexto ausente/vacio/malformado y limpieza de conexion pooled, conforme a [MT-SPIKE-001](../../specs/multitenancy/MT-SPIKE-001-requirements.md), especialmente `MT-REQ-010`. Si cambian primitivas, relaciones, politicas o funciones privilegiadas, actualizar los contratos de producto correspondientes: commit, rollback, error SQL, mismatch explicito y reutilizacion pooled. Un test de scope entre dos centros no prueba aislamiento entre tenants.

**Proposed, Draft -- Fixtures:** usar tenants distintos y centros A/B de un mismo tenant; identidad limitada, identidad multicentro/rol amplio y membership inactiva. Mantener fixtures en helpers/suites existentes. Las pruebas destructivas usan una DB temporal dedicada, nunca las bases locales con trabajo o datos reales.

## 5. Hogares de tests y comandos

**Documented:** existen [tenant-context API tests](../../apps/api/src/iam/tenant-context/tenant-context.service.spec.ts), [catalog access tests](../../apps/api/src/catalog/catalog-access.service.spec.ts), [IAM HTTP tests](../../apps/api/test/iam.e2e-spec.ts), [tenant-context web tests](../../apps/web/src/features/dashboard/tenant-context.test.ts), [host tests](../../apps/web/src/lib/application-hosts.test.ts) y [dashboard context tests](../../apps/web/src/features/dashboard/dashboard-tenant-context.test.tsx). Ampliarlos cuando sean propietarios del comportamiento; agregar tests colocados del nuevo guard/handler y un contrato compartido de inventario, no duplicar las invariantes en cada feature.

**Proposed, Draft -- Comandos de ejecucion futura:** los scripts de API/web y [CI](../../.github/workflows/ci.yml) inspeccionados permiten los siguientes gates. No se han ejecutado para un BFF implementado. Elegir primero los tests estrechos de la fase y despues el gate completo; los tests nuevos deben quedar incluidos en la configuracion real del runner.

```sh
# Unitarios y contratos, inicialmente filtrados a la porcion modificada
pnpm --filter @dive-center/api test
pnpm --filter @dive-center/web test

# DB dedicada, roles/migraciones preparados y variables de test verificadas
pnpm test:integration

# Gates existentes; usar la configuracion de build requerida por CI
pnpm build
pnpm check
pnpm test

# Solo cuando cambien artefactos normativos
node scripts/validate-spec-governance.mjs --all
```

**Documented -- Runner actual:** [package.json raiz](../../package.json) define `test:integration` como DB seguida de API e2e. El [runner API](../../apps/api/vitest.config.e2e.ts) incluye ahora [bff-next.e2e-spec.ts](../../apps/api/test/bff-next.e2e-spec.ts), un recorrido real Next.js/AppModule/PostgreSQL con identidad determinista y sin navegador. [API package.json](../../apps/api/package.json) tambien incluye `test:e2e:clerk:sandbox` y `test:e2e:bff:clerk:sandbox`; sus precondiciones y limites estan en el [harness Clerk](iam-clerk-sandbox-harness.md). [Web package.json](../../apps/web/package.json) conserva Vitest y build, sin script e2e de navegador. La existencia de los runners no acredita su ejecucion ni las comprobaciones de despliegue.

**Proposed, Draft -- Validacion Next.js:** durante implementacion, leer las guias locales requeridas por [apps/web/AGENTS.md](../../apps/web/AGENTS.md) y usar next-devtools para verificar Route Handlers, limites servidor/cliente, requests de navegador y errores de runtime. Si no esta disponible, usar comandos locales/browser y registrar la limitacion. Estas comprobaciones no reemplazan API, DB ni pruebas de aislamiento. Antes de una publicacion autorizada, aplicar `pnpm check:fix` y `pnpm check` conforme al workflow; no publicar desde este plan.

## 6. Dependencias y cierre

**Proposed, Draft -- Orden:** fase 0 desbloquea contratos; fase 1 precede el enforcement de fase 2; fase 3 depende del contrato API, y fase 4 del transporte BFF. Tests unitarios/HTTP se agregan con cada cambio, no al final. Fase 5 valida el conjunto y el despliegue. Entre Backend y Frontend, realizar el handoff confirmado del workflow; este plan no lo ejecuta ni asigna trabajos autonomamente.

**Proposed, Draft -- Revision previa a declarar la implementacion completa:** comprobar inventario y excepciones, aislamiento de centro y tenant, consumidores sin bypass, lifecycle conservado, secretos y retirada de instancias, ausencia de reintentos indebidos y legibilidad de estado/scope/errores. Registrar los comandos y resultados reales en Validation, los IDs cubiertos y los checks no ejecutados. Si falta una decision, una prueba requerida o la demostracion de revocacion del despliegue, declarar la porcion pendiente, no verificada.

**Documented -- Proveniencia de este entregable:** la entrega inicial fue solo planificacion solicitada el 2026-09-30, sin implementacion ni validacion acreditadas por este documento. La autorizacion local posterior y las decisiones aprobadas estan registradas en la SPEC propietaria, incluida la aprobacion de clasificaciones del 2026-10-01, separadas de las propuestas restantes y las pruebas/gates pendientes. Las referencias de implementacion/runner se actualizan desde los archivos enlazados; este plan no es un registro de ejecucion de sus fases, no crea evidencia ni cobertura adicional en TRACE y no autoriza publicacion o despliegue.