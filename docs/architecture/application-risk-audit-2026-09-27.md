# Auditoría técnica de la aplicación

- **Fecha:** 2026-09-27
- **Alcance:** `apps/api`, `apps/web`, `apps/worker`, `packages/*`, base de datos, CI, pruebas, configuración y gobierno SDD.
- **Naturaleza:** análisis no normativo. Las decisiones de producto y arquitectura continúan en `specs/`.

## Resumen ejecutivo

No se ha demostrado una vulnerabilidad crítica ni una fuga activa entre tenants. La base de aislamiento es, en general, sólida: hay RLS, claves compuestas, contexto transaccional, autorización server-side y pruebas con PostgreSQL real.

Sí existen **8 riesgos altos**, **7 medios** y **1 divergencia baja**. Los problemas más urgentes son transversales: CI ejecuta código de PR con permiso de escritura, CI no compila los artefactos desplegables, faltan límites de tiempo en PostgreSQL y Clerk, el rol de runtime no se verifica al arrancar y `tenant_contexts` conserva una excepción a RLS forzada incompatible con el criterio literal de `MT-REQ-004`.

El resumen y la tabla de prioridad describen el estado observado al inicio de la auditoría. Las correcciones aplicadas después se anotan en cada sección y no cambian retrospectivamente el recuento inicial.

### Prioridad recomendada

| Orden | ID | Severidad | Ámbito | Problema |
|---:|---|---|---|---|
| 1 | SEC-01 | Alta | CI / supply chain | Código de una PR se ejecuta con `contents: write` y puede auto-publicar cambios |
| 2 | DATA-01 | Alta | Multi-tenancy | `tenant_contexts` tiene RLS no forzada pese a `MT-REQ-004` |
| 3 | DATA-02 | Alta | Configuración DB | El API no acredita que usa el rol runtime restringido |
| 4 | REL-01 | Alta | Disponibilidad / DB | Pool, sentencias y locks carecen de deadlines explícitos |
| 5 | REL-02 | Alta | IAM / red | Clerk y el cliente web no tienen timeout; fallos operativos se degradan a autenticación inválida |
| 6 | SEC-02 | Alta | Seguridad HTTP | No hay evidencia versionada de headers seguros, rate limiting ni restricción de Swagger |
| 7 | QA-01 | Alta | CI / release | CI no ejecuta el build de API, web y worker |
| 8 | OBS-01 | Alta | Observabilidad | No está implementado el límite OpenTelemetry vendor-neutral ni una correlación HTTP extremo a extremo |
| 9 | DATA-03 | Media | Pooling | Una conexión se devuelve al pool aunque falle `ROLLBACK` |
| 10 | SEC-03 | Media | Supply chain | No hay gates de SAST, secretos, dependencias o SBOM exigidos por el baseline |
| 11 | SEC-04 | Media | Configuración | Producción puede aceptar placeholders, HMAC predecible y orígenes HTTP |
| 12 | PERF-01 | Media | Rendimiento | Índices y paginación no cubren bien consultas sin `status` ni offsets extremos |
| 13 | QA-02 | Media | Testing | La suite API ejecuta pruebas de dependencias workspace duplicadas |
| 14 | GOV-01 | Media | SDD | El validador de gobernanza ignora ADR y TRACE |
| 15 | ARCH-01 | Media | Frontend | Un componente concentra sesión, caché, almacenamiento, recuperación y presentación |
| 16 | DOC-01 | Baja | Configuración / SDD | ADR-DIVE-003 fija TypeScript 7.0.2, pero el workspace usa 6.0.3 |

## Seguridad y cadena de suministro

### SEC-01 — CI ejecuta código de PR con permiso global de escritura

**Evidencia.** El workflow declara `contents: write` para todos los jobs, hace checkout de la rama de la PR, instala dependencias, ejecuta scripts controlados por esa rama y finalmente hace `git push`: [ci.yml](../../.github/workflows/ci.yml#L13-L60). La regla del agente de CI además ordena conservar este comportamiento: [ci-cd-quality-automation.agent.md](../../.github/agents/ci-cd-quality-automation.agent.md#L54-L61).

**Impacto.** Una rama interna maliciosa o comprometida puede leer el token de escritura durante `install`, `check`, `test` o cualquier lifecycle script y modificar contenido del repositorio. Las protecciones externas de rama pueden reducir el impacto, pero no están versionadas ni sustituyen el mínimo privilegio.

**Procedimiento recomendado.**

1. Establecer `permissions: contents: read` en el workflow de validación.
2. Eliminar el commit automático: CI debe fallar si `pnpm check:fix` produciría cambios y el autor debe aplicarlos localmente.
3. Si se mantiene autofix, aislarlo en un workflow explícito que no ejecute código de la PR con credenciales de escritura. No usar `pull_request_target` para instalar o ejecutar contenido no confiable.
4. Probar una PR interna y una PR desde fork, verificando permisos efectivos y que ninguna validación hace push.

### SEC-02 — Frontera HTTP sin hardening demostrable

**Evidencia.** El bootstrap configura CORS exacto, pero expone Swagger incondicionalmente y no configura headers seguros ni rate limiting: [main.ts](../../apps/api/src/main.ts#L6-L29). No hay manifiestos de despliegue que acrediten esos controles en un proxy. El baseline exige validación estricta, headers seguros y límites por IP, identidad y tenant: [security-privacy-baseline.md](../../specs/foundation/security-privacy-baseline.md#L7-L20).

**Impacto.** Una exposición directa del API amplía reconocimiento, abuso de endpoints y agotamiento de Clerk/PostgreSQL. La ausencia de límites por tenant también permite noisy-neighbor.

**Procedimiento recomendado.**

1. Decidir y documentar qué controles pertenecen al proxy y cuáles a NestJS; no asumir infraestructura aún inexistente.
2. Añadir headers seguros y restringir o deshabilitar `/docs` fuera de entornos autorizados.
3. Definir límites por IP, identidad y tenant en el artefacto normativo correspondiente antes de escoger cifras.
4. Extraer una función de bootstrap reutilizable y probar preflight CORS, headers, acceso a Swagger y respuestas de límite. La suite actual crea `AppModule` directamente y omite el bootstrap real: [iam.e2e-spec.ts](../../apps/api/test/iam.e2e-spec.ts#L187-L210).

### SEC-03 — Sin gates de seguridad de dependencias y código

**Evidencia.** Los workflows solo ejecutan gobernanza, checks, tests e integración: [ci.yml](../../.github/workflows/ci.yml#L43-L106) y [spec-governance.yml](../../.github/workflows/spec-governance.yml#L1-L30). No existe configuración versionada de SAST, secret detection, dependency review o SBOM, aunque el baseline los exige: [security-privacy-baseline.md](../../specs/foundation/security-privacy-baseline.md#L17-L20).

**Impacto.** Una credencial añadida por error, una dependencia vulnerable o un patrón inseguro pueden llegar a `main` sin gate específico.

**Procedimiento recomendado.**

1. Activar detección de secretos y dependency review para PRs.
2. Añadir SAST compatible con TypeScript y generar SBOM por release.
3. Definir responsables y política de parcheo; separar avisos de producción y desarrollo.
4. Conservar `pnpm audit --prod` como señal auxiliar, no como sustituto de los demás controles.

### SEC-04 — Configuración de producción acepta valores sintéticos

**Evidencia.** El secreto HMAC de ejemplo supera el único control de longitud: [.env.example](../../.env.example#L8-L15) y [tenant-context.crypto.ts](../../apps/api/src/common/tenant-context/tenant-context.crypto.ts#L32-L50). El parser de orígenes acepta `http:` y no hay validación condicionada por entorno: [tenant-context.crypto.ts](../../apps/api/src/common/tenant-context/tenant-context.crypto.ts#L10-L30).

**Impacto.** Copiar `.env.example` a un despliegue puede producir handles firmados con material predecible y permitir transporte no TLS.

**Agente responsable.** `Backend/API Implementer` debe implementar la validación central y el arranque fail-closed en `apps/api`. Debe realizar handoff a `Test and Evidence Engineer` para añadir y mapear los tests de placeholders, secretos débiles, orígenes HTTP y combinaciones parciales. Tras la implementación, corresponde la revisión de `Implementation PR Reviewer`.

**Procedimiento recomendado.**

1. Crear validación central de configuración con perfil de entorno.
2. En producción, rechazar placeholders conocidos, HTTP y secretos con entropía claramente insuficiente; cargar secretos desde el gestor de la plataforma.
3. Añadir tests de arranque fail-closed para cada placeholder y combinación parcial.

## Datos y aislamiento multi-tenant

### DATA-01 — Excepción no resuelta a RLS forzada

**Evidencia.** La migración deja `iam_app.tenant_contexts` con `ENABLE ROW LEVEL SECURITY` y `NO FORCE ROW LEVEL SECURITY`: [0007_add_tenant_contexts.sql](../../packages/database/drizzle/0007_add_tenant_contexts.sql#L21-L30). Ninguna migración posterior lo revierte. `MT-REQ-004` exige que toda tabla tenant-owned tenga RLS habilitada y forzada: [MT-SPIKE-001-requirements.md](../../specs/multitenancy/MT-SPIKE-001-requirements.md#L45-L53).

**Impacto.** El propietario y funciones `SECURITY DEFINER` no quedan limitados por la policy. Hoy el riesgo está mitigado por revocación de acceso directo y validaciones dentro de comandos, pero una regresión futura en esas funciones podría cruzar tenants. Además, la implementación contradice la cobertura declarada.

**Procedimiento recomendado.**

1. No aplicar `FORCE` de forma mecánica: la resolución de handles necesita localizar contexto antes de conocer el tenant.
2. Clasificar formalmente la tabla. Si es tenant-owned, separar un locator global mínimo de la tabla tenant-owned con RLS forzada. Si se considera infraestructura global, aprobar y documentar la excepción y su threat model.
3. Probar acceso con el propietario, `dive_app` y cada función privilegiada, incluyendo handles de otro tenant.
4. Actualizar `MT-REQ-004`, TRACE y evidencia solo después de la decisión y las pruebas.

### DATA-02 — El proceso no verifica el rol runtime efectivo

**Evidencia.** El API acepta cualquier `APP_DATABASE_URL`: [database.module.ts](../../apps/api/src/common/database/database.module.ts#L20-L28). El bootstrap solo aplica atributos seguros al crear roles; si ya existen, no revoca `SUPERUSER`, `BYPASSRLS`, membresías o propiedad: [bootstrap-roles.ts](../../packages/database/src/bootstrap-roles.ts#L18-L48).

**Impacto.** Una URL que apunte a `dive_migration` o un `dive_app` previamente privilegiado desactiva las garantías de aislamiento sin impedir el arranque.

**Procedimiento recomendado.**

1. Hacer idempotente el hardening de roles mediante `ALTER ROLE` y revocaciones explícitas.
2. Añadir un preflight de arranque/deploy que compruebe `current_user`, `rolsuper`, `rolbypassrls`, propiedad de tablas y privilegios DDL.
3. Fallar el arranque si el rol no cumple el perfil runtime.
4. Añadir pruebas negativas con rol migrador, propietario y `BYPASSRLS`.

**Corrección aplicada.** `bootstrapRoles` revalida los atributos de `dive_migration` y `dive_app`; `assertRuntimeDatabaseRole` inspecciona la conexión efectiva y el `DatabaseModule` cierra el pool y aborta el arranque ante un rol inseguro. La prueba focalizada cubre el rol válido y las condiciones de migración, `SUPERUSER`, `BYPASSRLS`, creación de base/roles, propiedad y privilegios `CREATE`: [runtime-role.ts](../../packages/database/src/runtime-role.ts), [database.module.ts](../../apps/api/src/common/database/database.module.ts) y [roles.integration.test.ts](../../packages/database/test/integration/roles.integration.test.ts).

### DATA-03 — Pool contaminable si falla el rollback

**Evidencia.** La unidad de trabajo ignora el error de `ROLLBACK` y siempre ejecuta `client.release()` sin destruir la conexión: [unit-of-work.ts](../../packages/database/src/unit-of-work.ts#L13-L35). El harness duplica exactamente el patrón: [harness-unit-of-work.ts](../../packages/database/src/harness-unit-of-work.ts#L12-L34). Las pruebas cubren rollback normal y error SQL, no fallo del propio rollback: [pooling.integration.test.ts](../../packages/database/test/integration/pooling.integration.test.ts#L34-L139).

**Impacto.** Una conexión con transacción abierta o estado incierto puede volver al pool y afectar la siguiente operación o el aislamiento de contexto.

**Procedimiento recomendado.**

1. Si `ROLLBACK` falla, liberar destruyendo la conexión (`release(true)` o API equivalente del driver).
2. Preservar el error original y registrar la causa de rollback sin incluir datos sensibles.
3. Extraer la primitiva común para evitar que producción y harness diverjan.
4. Añadir una prueba que fuerce fallo de rollback y demuestre que el backend físico no se reutiliza.

**Corrección aplicada.** `rollbackAndReleaseClient` centraliza el cierre de la transacción para la UoW productiva y el harness; ante un `ROLLBACK` fallido usa `release(true)` y conserva el error original. `pooling.integration.test.ts` fuerza el fallo, verifica el error de negocio y comprueba que el siguiente checkout obtiene otro backend físico. La prueba focalizada pasa junto con los casos existentes de commit, rollback, error SQL y alternancia de tenants.

## Disponibilidad, errores y rendimiento

### REL-01 — PostgreSQL sin límites operativos

**Evidencia.** El pool runtime recibe límites de tamaño, conexión, sentencia, lock y transacción inactiva desde `APP_DATABASE_*`: [env.ts](../../packages/database/src/env.ts) y [database.module.ts](../../apps/api/src/common/database/database.module.ts). La prueba operativa cubre configuración efectiva en PostgreSQL, saturación de checkout, sentencia bloqueada, lock contention y terminación de transacción inactiva: [operability.integration.test.ts](../../packages/database/test/integration/operability.integration.test.ts).

**Impacto.** Locks o consultas bloqueadas pueden consumir el pool y convertir una degradación local en indisponibilidad total.

**Procedimiento recomendado.**

1. Aprobar valores por entorno para espera de conexión, sentencia, lock e inactividad transaccional; no inventarlos en código.
2. Configurar `connectionTimeoutMillis` y timeouts PostgreSQL transaction-local o por rol.
3. Añadir métricas de espera, uso y saturación del pool.
4. Probar lock contention, cancelación, rollback y reutilización sana de la conexión.

**Corrección aplicada.** El pool runtime exige `APP_DATABASE_POOL_MAX`, `APP_DATABASE_CONNECTION_TIMEOUT_MS`, `APP_DATABASE_STATEMENT_TIMEOUT_MS`, `APP_DATABASE_LOCK_TIMEOUT_MS` y `APP_DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS`; `pg` aplica los límites a las conexiones de aplicación. La prueba focalizada pasa `5/5`, incluyendo checkout con `max: 1`, `statement_timeout` (`57014`), `lock_timeout` (`55P03`) e idle transaction. Los valores del `.env.example` son ejemplos locales `Proposed`, no una política de producción. Las métricas de pool siguen abiertas porque el paquete de observabilidad aún no expone una API.

### REL-02 — Dependencias remotas sin deadline y errores operativos ocultos

**Evidencia.** La autenticación esperaba verificación de token, sesión y usuario sin deadline: [clerk.ts](../../packages/identity/src/clerk.ts) y el guard transformaba todo en 401: [auth.guard.ts](../../apps/api/src/common/auth/auth.guard.ts). El cliente web usaba `fetch` sin `AbortSignal`: [tenant-context.ts](../../apps/web/src/features/dashboard/tenant-context.ts).

**Impacto.** Una caída de Clerk o una red que no responde puede colgar requests, saturar recursos y presentarse al usuario y a observabilidad como credenciales inválidas.

**Corrección aplicada.** `ClerkIdentityAdapter` exige `CLERK_REQUEST_TIMEOUT_MS`, entrega una señal abortable a las dependencias y clasifica credenciales inválidas separadas de indisponibilidad del proveedor. El guard conserva 401 para credenciales inválidas y devuelve 503 genérico para indisponibilidad, registrando un evento operativo sin ampliar `IamDenialReason`. El cliente dashboard exige `NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS` en la página, propaga señales de TanStack Query y aborta requests que exceden el deadline. Las pruebas focalizadas cubren promesas que no resuelven, propagación de señal, clasificación operativa y ausencia de detalles sensibles.

**Procedimiento recomendado.**

1. **Proposed:** aprobar por entorno los valores de `CLERK_REQUEST_TIMEOUT_MS` y `NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS`, y confirmar la semántica 401/503.
2. **Documented residual:** el SDK Clerk 3.20.1 no expone `AbortSignal` ni transporte `fetch` inyectable para `verifyToken`, `getSession` y `getUser`; el deadline limita la espera de nuestro puerto, pero la cancelación del request HTTP subyacente queda abierta hasta sustituir o ampliar ese transporte.
3. Mantener fail-closed y no registrar tokens ni detalles del proveedor.

### PERF-01 — Índices y paginación no alineados con todas las consultas

**Evidencia.** Actividades y slots permiten omitir `status` y usan `OFFSET`: [activity-catalog.service.ts](../../apps/api/src/catalog/activities/activity-catalog.service.ts#L47-L84) y [slot-catalog.service.ts](../../apps/api/src/catalog/slots/slot-catalog.service.ts#L47-L132). Los índices finales interponen `status` antes del orden temporal: [0013_fine_nightshade.sql](../../packages/database/drizzle/0013_fine_nightshade.sql#L5-L12). La validación comprueba cada operando, pero no que `(page - 1) * pageSize` siga siendo entero seguro: [catalog.validation.ts](../../apps/api/src/catalog/catalog.validation.ts#L34-L58).

**Impacto.** Las consultas sin estado pueden requerir sort y degradarse con volumen; páginas profundas tienen coste lineal y un offset extremo puede perder precisión.

**Procedimiento recomendado.**

1. Capturar `EXPLAIN (ANALYZE, BUFFERS)` con datos sintéticos representativos para consultas con y sin `status`.
2. Añadir índices solo si la medición lo justifica.
3. Rechazar offsets no seguros de inmediato.
4. Evaluar cursor/keyset cuando el volumen o los objetivos aprobados demuestren que `OFFSET` no cumple; preservar el contrato vigente hasta aprobar el cambio.

**Corrección aplicada.** La validación rechaza offsets fuera del rango entero seguro de JavaScript. La migración `0015_add_catalog_list_order_indexes.sql` añade índices que mantienen `tenant_id`, `center_id` y `activity_id` como prefijo, y dejan `status` fuera del camino de ordenación cuando el filtro es opcional. La consulta de actividades explicita `DESC NULLS LAST`, que coincide con el índice y no cambia resultados porque las claves son `NOT NULL`. La prueba de migración y una comprobación `EXPLAIN` con `enable_seqscan=off` confirman la ruta indexada; falta evidencia `ANALYZE` con volumen representativo para validar la elección por coste.

## Calidad, CI y gobierno

### QA-01 — CI no construye artefactos desplegables

**Evidencia.** CI ejecuta `pnpm check` y `pnpm test`, pero no `pnpm build`: [ci.yml](../../.github/workflows/ci.yml#L43-L65). Turbo hace que los tests construyan dependencias, no necesariamente el artefacto de la app bajo prueba: [turbo.json](../../turbo.json#L25-L36).

**Impacto.** Un error exclusivo de `next build`, `nest build` o del worker puede entrar en `main`.

**Procedimiento recomendado.**

1. Añadir `pnpm build` como job o paso sin secretos, usando `.nvmrc` y lockfile.
2. Mantenerlo separado de integración para identificar con claridad el fallo.
3. Validar desde checkout limpio y conservar logs/artefactos cuando fallen.

**Corrección aplicada.** El job `check-and-test` ejecuta `pnpm build` después de instalar el lockfile y antes de check/test. CI usa permisos `contents: read` y ya no modifica ni empuja la rama desde GitHub Actions; el formateo debe ejecutarse localmente o corregirse mediante un commit explícito.

### QA-02 — La suite API incluye tests duplicados de dependencias

**Evidencia.** `include: ['**/*.spec.ts']` no limita descubrimiento a `src` ni excluye `node_modules`: [vitest.config.ts](../../apps/api/vitest.config.ts#L1-L12). En la ejecución auditada, API ejecutó dos copias adicionales de cada suite Clerk a través de dependencias workspace, al menos 80 tests duplicados.

**Impacto.** El conteo de 339 tests sobredeclara cobertura del API, aumenta tiempo y puede hacer que cambios en empaquetado alteren la suite sin cambiar comportamiento.

**Procedimiento recomendado.**

1. Restringir `include` a `src/**/*.spec.ts` y excluir explícitamente `node_modules`, `dist` y `coverage`.
2. Mantener las pruebas de `packages/identity` en su propio workspace.
3. Ejecutar una vez sin caché y revisar la lista de archivos descubiertos.

**Corrección aplicada.** La configuración de Vitest del API solo descubre
`src/**/*.spec.ts` y excluye explícitamente `node_modules`, `dist`, `coverage`
y las pruebas e2e. Las pruebas de `packages/identity` continúan ejecutándose
desde su propio workspace.

### GOV-01 — ADR y TRACE quedan fuera de la gobernanza automática

**Evidencia.** El validador descubre exclusivamente nombres `SPEC-*.md`: [validate-spec-governance.mjs](../../scripts/validate-spec-governance.mjs#L17-L39). En consecuencia, una PR que solo modifica ADR o TRACE no activa la validación de cuerpo ni revisa estado, versión o procedencia, aunque el workflow sí se dispara para todo `specs/**`: [spec-governance.yml](../../.github/workflows/spec-governance.yml#L3-L10).

**Impacto.** La fuente normativa puede cambiar sin las garantías que el repositorio declara obligatorias.

**Procedimiento recomendado.**

1. Crear descubrimiento y validadores específicos para SPEC, ADR y TRACE; no aplicar a todos la misma gramática.
2. Validar el cuerpo de la PR ante cualquier cambio normativo, aunque no haya un `SPEC-*` modificado.
3. Añadir fixtures válidos e inválidos y tests del script.
4. No promover estados ni reinterpretar procedencia como parte de este cambio técnico.

**Corrección aplicada.** El validador descubre y valida por separado SPEC, ADR
y TRACE. La validación de cambios usa todos esos tipos de artefacto y exige el
esqueleto de la PR cuando cambia cualquiera de ellos. Fixtures válidos e
inválidos cubren las tres reglas mediante el test Node nativo del validador.

### OBS-01 — Observabilidad acoplada y correlación fragmentada

**Evidencia.** API importa `@nestjs/observe` directamente y desactiva instrumentación si falta una de dos variables: [app.module.ts](../../apps/api/src/app/app.module.ts#L1-L29). El paquete previsto como frontera está vacío: [packages/observability/src/index.ts](../../packages/observability/src/index.ts#L1). Los IDs de correlación se generan por acción, por ejemplo en [iam.controller.ts](../../apps/api/src/iam/iam.controller.ts#L59-L84) y [auth.guard.ts](../../apps/api/src/common/auth/auth.guard.ts#L58-L73), sin una identidad de request propagada por HTTP. ADR-DIVE-002 decide OpenTelemetry vendor-neutral y correlation ID: [ADR-DIVE-002.md](../../specs/architecture/adrs/ADR-DIVE-002.md#L18-L30).

**Impacto.** No se puede seguir de forma fiable un request entre HTTP, IAM, DB, outbox y proveedor; cambiar de backend de observabilidad afecta al composition root.

**Procedimiento recomendado.**

1. Implementar en `@dive-center/observability` el puerto/adaptador OpenTelemetry y ocultar el SDK concreto.
2. Crear o validar un correlation ID al entrar, devolverlo en respuesta y propagarlo mediante contexto asíncrono a logs, DB, outbox y llamadas externas.
3. Validar configuración por entorno; evitar desactivación silenciosa donde la telemetría sea obligatoria.
4. Probar que una petición conserva el mismo ID en respuesta, evento de seguridad, audit y outbox.

## Estructura y mantenibilidad

### ARCH-01 — Componente de dashboard con demasiadas razones de cambio

**Evidencia.** `DashboardTenantContext` concentra creación del cliente, `sessionStorage`, ciclo de sesión, caché React Query, selección automática, revocación, logout, recuperación de errores y todas las vistas de estado en 557 líneas: [dashboard-tenant-context.tsx](../../apps/web/src/features/dashboard/dashboard-tenant-context.tsx#L28-L557). Su test principal alcanza 715 líneas.

**Impacto.** Cada nuevo flujo de dashboard aumenta estados combinatorios, efectos acoplados y coste de regresión. La cobertura actual es buena, pero el diseño dificulta extender catálogo o centros.

**Procedimiento recomendado.**

1. Extraer un hook/controlador `useDashboardTenantContext` que exponga estado y comandos observables.
2. Modelar transiciones de sesión/contexto con reducer o máquina explícita, evitando booleanos y efectos coordinados informalmente.
3. Separar vistas de estado y selector en componentes de presentación sin acceso a red o storage.
4. Mantener los tests actuales como caracterización; después repartirlos entre transiciones del controlador y renderizado.

### DOC-01 — Versión de TypeScript divergente

**Evidencia.** ADR-DIVE-003 fija TypeScript 7.0.2: [ADR-DIVE-003.md](../../specs/architecture/adrs/ADR-DIVE-003.md#L20-L35). El catálogo efectivo fija 6.0.3: [pnpm-workspace.yaml](../../pnpm-workspace.yaml#L1-L7).

**Impacto.** Agentes y mantenedores no pueden saber si deben actualizar tooling o corregir el ADR; la fuente normativa y la configuración ejecutable discrepan.

**Procedimiento recomendado.** Resolver explícitamente cuál es la versión aprobada. Si cambia la decisión, actualizar ADR y procedencia; si la decisión sigue vigente, actualizar catálogo y lockfile en una PR de tooling con build y tests completos.

## Bloqueos de salida que no son bugs actuales

No deben mezclarse con los hallazgos anteriores, pero bloquean producción cuando se active su alcance:

- `MT-COND-WORKER-001`: el worker real, retry/backoff, dead-letter y efectos externos siguen pendientes. El starter vacío es correcto mientras no haya efectos externos.
- Backups cifrados, PITR y restauración ensayada son no-go antes de datos reales según [operations-quality-recovery.md](../../specs/foundation/operations-quality-recovery.md#L23-L38).
- Rate limits y noisy-neighbor requieren decisión normativa antes de fijar cifras.
- La cobertura parcial de IAM, soporte, tokens públicos y privacidad ya está declarada en [TRACE-DIVE-MVP-001.md](../../specs/traceability/TRACE-DIVE-MVP-001.md#L158-L180); no debe presentarse como conformidad completa.

## Reglas recomendadas para agentes

### Reglas globales

Añadir a `.github/copilot-instructions.md`:

```md
- Treat pull-request code as untrusted. Validation workflows use read-only permissions by default and never execute PR-controlled code with write credentials.
- A change to a deployable app is not validated until its production build has run with the Node version from `.nvmrc`.
- Every external I/O boundary must define cancellation, timeout, error taxonomy, and observability. Do not invent numeric values; use an approved SPEC/ADR or record an open question.
- Runtime database startup must fail closed when the effective role is owner, migration role, superuser, has `BYPASSRLS`, or has DDL privileges.
- Test discovery must be scoped to owned source roots and exclude `node_modules`, build output, and coverage output. Never use duplicated test counts as evidence.
- Do not claim a control exists in infrastructure unless its versioned manifest or executable test exists in the repository.
```

### Cambios en agentes especializados

1. **CI/CD + Quality Automation:** eliminar la regla que obliga a auto-commit en PRs. Sustituirla por permisos read-only, `pnpm build` y validación de forks.
2. **Backend/API Implementer:** exigir deadlines y taxonomía de errores en PostgreSQL, Clerk y cualquier proveedor; exigir prueba del bootstrap HTTP cuando cambie CORS, headers, filtros o Swagger.
3. **Tenancy and Data Isolation Engineer / skill:** añadir el caso “rollback falla” y exigir destrucción de la conexión; comprobar RLS final después de todas las migraciones, no solo el SQL de creación.
4. **Test and Evidence Engineer:** revisar la lista real de archivos descubiertos, distinguir tests propios de dependencias y rechazar evidencia cuyo directorio solo contenga placeholders.
5. **Frontend/Web + Widget Engineer:** toda llamada `fetch` debe aceptar cancelación y distinguir sesión inválida de indisponibilidad del API sin debilitar fail-closed.
6. **Implementation PR Reviewer:** incluir una comprobación explícita de permisos GitHub Actions cuando una PR cambie workflows, scripts de instalación o lifecycle scripts.

Para controles deterministas de CI, permisos o comandos obligatorios, preferir workflows/hooks sobre instrucciones en lenguaje natural.

## Plan de corrección por fases

### Fase 0 — Inmediata

1. Corregir SEC-01 y QA-01: CI read-only y build obligatorio.
2. Resolver DATA-02 y DATA-03: preflight de rol y descarte de conexión ante rollback fallido.
3. Corregir QA-02 para recuperar una señal de tests fiable.

### Fase 1 — Antes de exponer el API

1. Cerrar DATA-01 mediante decisión SDD y pruebas de propietario/funciones privilegiadas.
2. Cerrar REL-01 con límites operativos y evidencia; implementar REL-02, SEC-02 y SEC-04.
3. Implementar OBS-01 antes de depender de diagnósticos de producción.
4. Añadir los gates SEC-03.

### Fase 2 — Escalabilidad y mantenibilidad

1. Medir y corregir PERF-01.
2. Refactorizar ARCH-01 preservando los tests de caracterización.
3. Extender la gobernanza de GOV-01 y reconciliar DOC-01.

## Validación realizada

- `pnpm check`: correcto; Biome y 17 tareas de typecheck pasaron.
- `nvm use 22.22.3 && CI=1 pnpm exec turbo run build --ui=stream`: correcto; 14 tareas, incluyendo `next build`, `nest build` y worker.
- `CI=1 pnpm exec turbo run test --ui=stream`: correcto; web 22, identity 40 y API 339, con la duplicación descrita en QA-02.
- `CI=1 pnpm audit --prod --audit-level high`: sin vulnerabilidades conocidas.
- No se ejecutó `pnpm test:integration` durante esta auditoría porque modifica la base configurada. CI sí contiene un job PostgreSQL 18 para esa suite.
- La corrección de REL-01 se validó aparte con `pnpm --filter @dive-center/database exec node --env-file=../../.env.example ./node_modules/vitest/vitest.mjs run --config vitest.config.ts test/integration/operability.integration.test.ts`: 1 archivo y 5 tests pasaron localmente.

## Controles sólidos observados

- RLS forzada y claves tenant-aware en el resto de tablas revisadas.
- `dive_app` sin DDL ni `BYPASSRLS` en el harness probado.
- Contexto tenant transaccional y tests de reutilización normal del pool.
- Autorización server-side, CORS exacto, webhook firmado con raw body, handles opacos y errores no divulgativos.
- Audit y outbox atómicos en las mutaciones implementadas.
- Build, typecheck y tests actuales pasan con Node 22.22.3.