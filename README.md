# dive-center-platform

> 🤿 **Estado:** Ready to start · **Enfoque:** Spec-Driven Development · **Mercado inicial:** centros de buceo recreativo en España

## Descripción
**dive-center-platform** es una plataforma SaaS multi-tenant para reservas y gestión operativa de centros de buceo, desarrollada mediante Spec-Driven Development.
El primer corte permite configurar centros, actividades y actividades programadas; publicar disponibilidad mediante una página alojada o un widget; recibir reservas online; registrar reservas manuales; consultar un calendario común; cancelar reservas; y emitir confirmaciones trazables sin sobreventa.
## Terminología de dominio
- **Actividad:** oferta general configurada por el centro, por ejemplo, «Bautismo de buceo».
- **Actividad programada:** realización concreta de una actividad en una fecha y hora determinadas, con capacidad y estado propios.
- **`Slot`:** nombre interno de la actividad programada en el código.
- **Sesión:** término reservado para autenticación y ciclo de vida de acceso, como «inicio de sesión».
## Estado del proyecto
El proyecto está preparado para iniciar el repositorio, la infraestructura base, los spikes y el walking skeleton. El estado **Ready to start** permite implementar y desplegar staging con datos sintéticos, pero no autoriza el uso de datos personales reales ni un piloto.
## Objetivos del primer entregable
- Crear un monorepo reproducible con CI en verde.
- Separar dominio, aplicación, contratos y adaptadores de infraestructura.
- Ejecutar migraciones desde cero sobre PostgreSQL 18.
- Demostrar aislamiento multi-tenant mediante RLS y restricciones tenant-aware.
- Validar la concurrencia de la última plaza sin sobreventa.
- Crear reservas idempotentes con auditoría y outbox en la misma transacción.
- Procesar confirmaciones mediante un worker idempotente.
- Completar un primer recorrido vertical desde el canal público hasta el dashboard.
- Conservar trazabilidad entre requisitos, decisiones, código, pruebas y evidencia.
## Walking skeleton
```text
Inicio de sesión
  → configuración de centro y actividad
  → publicación de actividad programada
  → reserva desde página alojada o widget
  → confirmación
  → consulta en calendario
  → reserva manual
  → cancelación
  → auditoría + outbox
```
El primer incremento técnico puede limitarse al siguiente recorrido:
```text
Crear tenant y centro
  → crear una actividad y programarla
  → consultar disponibilidad pública
  → reservar
  → consultar la reserva en el dashboard
  → emitir confirmación en outbox
```
## Stack tecnológico
- **Lenguaje:** TypeScript estricto.
- **Monorepo:** pnpm workspaces + Turborepo.
- **Frontend:** Next.js.
- **Backend:** NestJS como monolito modular.
- **Persistencia:** PostgreSQL 18.x, Drizzle ORM y node-postgres.
- **Aislamiento:** base y esquema compartidos, RLS y restricciones tenant-aware.
- **Identidad:** Clerk detrás de una fachada y un adaptador propios.
- **Integración:** REST/OpenAPI versionada.
- **Procesamiento asíncrono:** outbox transaccional y worker idempotente.
- **Observabilidad**: OpenTelemetry para trazas y métricas, correlación de logs mediante trace_id/span_id y exportación OTLP configurable, sin acoplar la aplicación a un backend concreto.
- **Internacionalización:** next-intl con catálogos tipados en español e inglés.
- **Pruebas frontend:** Vitest, React Testing Library, `@testing-library/user-event` y MSW; Jest solo cuando una integración específica de Next.js no sea compatible con Vitest.
- **Pruebas backend:** Jest, `@nestjs/testing`, Supertest, Testcontainers y fast-check.
- **Pruebas E2E:** Playwright.
- **Entorno local:** Docker, PostgreSQL y Mailpit.
- **Hosting previsto:** Vercel para web y Render en región UE para API, worker y PostgreSQL.
## Estrategia de pruebas
### Frontend · React y Next.js
- `Vitest` es el runner predeterminado para pruebas unitarias y de componentes por su rapidez y soporte de TypeScript.
- `Jest` se reserva para integraciones específicas de Next.js o dependencias que no sean compatibles con Vitest; una misma suite no se duplica en ambos runners.
- `React Testing Library` verifica el comportamiento observable de los componentes sin acoplarse a su implementación interna.
- `@testing-library/user-event` simula clics, escritura, selección, teclado y envío de formularios.
- `MSW` intercepta APIs HTTP y permite reutilizar handlers compatibles con los contratos públicos sin acoplar los tests a `fetch` o Axios.
### Backend · NestJS
- `Jest` es el runner predeterminado para pruebas unitarias y de integración.
- `@nestjs/testing` crea módulos de prueba, sustituye adaptadores y resuelve dependencias mediante el contenedor de NestJS.
- `Supertest` verifica endpoints HTTP, guards, pipes, serialización y códigos de error.
- `Testcontainers` ejecuta las pruebas de integración contra PostgreSQL 18 real con roles separados de migración y runtime.
- `fast-check` cubre propiedades e invariantes, incluidas combinaciones de roles y manipulación de tenant o centro.
- `@clerk/backend` valida sesiones y tokens de Clerk dentro del adaptador de identidad.
- `jose` prueba el contrato JWT/JWKS: firma, emisor, audiencia, expiración y rotación. En producción no se valida dos veces el mismo token.
### End-to-end
- `Playwright` ejecuta pruebas E2E en navegadores reales para el dashboard, la página pública y el widget embebido.
- La suite cubre el recorrido vertical de reserva, aislamiento por tenant y centro, locales `es`/`en`, accesibilidad básica, integración del `iframe` y fallback a la página alojada.
- Cada pull request ejecuta una suite de humo; la suite completa se ejecuta contra staging antes de promover a producción, siempre con datos sintéticos y entornos aislados.
## Estructura inicial
```text
dive-center-platform/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.yml
│   │   ├── feature.yml
│   │   ├── spike.yml
│   │   └── spec-change.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CODEOWNERS
│   └── workflows/
│       ├── ci.yml
│       ├── database.yml
│       ├── security.yml
│       └── deploy-staging.yml
│
├── apps/
│   ├── web/                         # Next.js: dashboard, página pública y widget
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── [locale]/
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   └── book/
│   │   │   │   └── embed/
│   │   │   ├── features/
│   │   │   └── infrastructure/
│   │   └── package.json
│   ├── api/                         # Monolito modular NestJS
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── identity/
│   │   │   │   ├── tenancy/
│   │   │   │   ├── centers/
│   │   │   │   ├── booking/
│   │   │   │   ├── channels/
│   │   │   │   ├── audit/
│   │   │   │   └── outbox/
│   │   │   ├── public-api/
│   │   │   ├── internal-api/
│   │   │   └── main.ts
│   │   └── package.json
│   └── worker/                      # Outbox y tareas asíncronas
│       ├── src/
│       │   ├── handlers/
│       │   ├── providers/
│       │   └── main.ts
│       └── package.json
│
├── packages/
│   ├── domain/                      # Entidades, invariantes y lógica de dominio
│   ├── application/                 # Casos de uso y puertos
│   ├── contracts/                   # DTO, eventos y errores versionados
│   ├── database/                    # Drizzle, migraciones, transacciones y RLS
│   │   ├── src/
│   │   ├── migrations/
│   │   ├── policies/
│   │   └── seeds/
│   ├── identity/                    # Fachada y adaptador de Clerk
│   ├── email/                       # Puerto de correo y adaptadores
│   ├── i18n/                        # Catálogos tipados es/en
│   ├── observability/               # Logging, métricas y correlation ID
│   ├── config/                      # Configuración tipada
│   ├── testing/                     # Fixtures, builders y utilidades comunes
│   ├── eslint-config/
│   └── typescript-config/
│
├── specs/                           # Fuente normativa SDD
│   ├── README.md
│   ├── product/
│   │   └── dive-mvp-profile.md
│   ├── architecture/
│   │   └── adrs/
│   │       ├── ADR-DIVE-001.md
│   │       └── ADR-DIVE-002.md
│   ├── booking/
│   │   └── SPEC-DIVE-BOOKING-001.md
│   ├── iam/
│   │   └── SPEC-DIVE-IAM-001.md
│   ├── domain/
│   │   └── SPEC-DIVE-OPS-001.md      # Deferred
│   ├── multitenancy/
│   │   ├── adoption-profile.md
│   │   ├── MT-SPIKE-001-specification.md
│   │   ├── MT-SPIKE-001-requirements.md
│   │   ├── MT-SPIKE-001-traceability.md
│   │   └── MT-SPIKE-001-results.md
│   ├── spikes/
│   │   ├── SPIKE-DIVE-001/
│   │   │   ├── specification.md
│   │   │   ├── requirements.md
│   │   │   ├── execution-checkpoints.md
│   │   │   ├── traceability.md
│   │   │   └── results.md
│   │   ├── SPIKE-DIVE-002/           # Deferred
│   │   └── SPIKE-DIVE-003/
│   │       ├── specification.md
│   │       ├── requirements.md
│   │       ├── execution-checkpoints.md
│   │       ├── traceability.md
│   │       └── results.md
│   ├── traceability/
│   │   └── TRACE-DIVE-MVP-001.md
│   └── templates/
│       ├── adr-template.md
│       ├── spec-template.md
│       ├── spike-template.md
│       └── evidence-template.md
│
├── tests/
│   ├── architecture/
│   ├── contracts/
│   ├── integration/
│   │   ├── booking/
│   │   ├── multitenancy/
│   │   ├── rls/
│   │   └── outbox/
│   ├── concurrency/
│   ├── e2e/
│   └── security/
│
├── evidence/                        # Resultados reproducibles
│   ├── README.md
│   ├── multitenancy/
│   ├── spikes/
│   ├── contracts/
│   └── releases/
│
├── infra/
│   ├── docker/
│   │   ├── postgres/
│   │   └── mailpit/
│   ├── render/
│   ├── vercel/
│   └── scripts/
│
├── tools/
│   ├── validate-specs/
│   ├── check-traceability/
│   └── test-database-from-zero/
│
├── .env.example
├── .gitignore
├── .node-version
├── docker-compose.yml
├── eslint.config.mjs
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prettier.config.mjs
├── turbo.json
├── tsconfig.json
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
└── README.md
```
## Organización de la arquitectura
### `apps/`
Contiene los procesos desplegables. La web, la API y el worker utilizan los casos de uso y contratos compartidos, pero no concentran reglas de dominio.
### `packages/domain/`
Contiene entidades, value objects, invariantes y servicios de dominio. No puede importar Next.js, NestJS, Clerk, Vercel, Render, Drizzle ni SDK de correo.
### `packages/application/`
Contiene casos de uso y puertos. Los adaptadores de HTTP, persistencia, identidad y correo dependen de estos contratos internos, no al contrario.
### `packages/database/`
Contiene esquema, migraciones, políticas RLS, unidad de trabajo tenant-aware, roles de base de datos y seeds sintéticos. El rol de ejecución no puede realizar DDL ni omitir RLS.
### `specs/`
Es la fuente normativa del proyecto. Contiene perfiles, ADR, especificaciones, requisitos, spikes y trazabilidad. La implementación no debe introducir reglas funcionales que no estén definidas o enlazadas desde estos artefactos.
### `evidence/`
Contiene resultados reproducibles, nunca nuevas reglas. Cada evidencia debe identificar como mínimo el commit, entorno, fecha, comandos ejecutados, requisitos cubiertos y conclusión.
## Flujo Spec-Driven Development
1. Definir o modificar el requisito en su SPEC responsable.
2. Registrar decisiones arquitectónicas relevantes mediante ADR.
3. Actualizar la matriz de trazabilidad.
4. Escribir o actualizar pruebas ejecutables.
5. Implementar el cambio mínimo que satisface los requisitos.
6. Ejecutar las validaciones y conservar evidencia reproducible.
7. Someter especificación, implementación y evidencia a revisión.
8. Marcar un artefacto como **Accepted** solo tras cumplir sus criterios de aceptación.
### Estados documentales
```text
Draft → Ready to start → Review → Accepted
                         ↘ Deferred
```
- **Draft:** contrato en elaboración.
- **Ready to start:** información suficiente para comenzar una implementación reversible.
- **Review:** contrato completo sometido a validación.
- **Accepted:** fuente de verdad aprobada y obligatoria.
- **Deferred:** diseño conservado fuera del alcance activo.
## Reglas de trazabilidad
Toda pull request funcional debe identificar:
- requisitos implementados o afectados;
- ADR aplicables;
- pruebas que demuestran el comportamiento;
- evidencia generada;
- actualización de TRACE cuando cambie la cobertura.
Ejemplo:
```text
Implements: DIVE-BOOK-REQ-006, DIVE-BOOK-REQ-009
Decision: ADR-DIVE-002
Tests: tests/integration/booking/last-seat.spec.ts
Evidence: evidence/spikes/SPIKE-DIVE-001/
Traceability: TRACE-DIVE-MVP-001
```
Los requisitos transversales `MT-REQ-*` permanecen separados de los requisitos y spikes de producto `DIVE-*`, aunque compartan fixtures, infraestructura o pipeline.
## Desarrollo local
### Requisitos previos
- Node.js en la versión fijada por el repositorio.
- pnpm en la versión declarada en `package.json`.
- Docker y Docker Compose.
### Inicio rápido previsto
```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```
Los nombres definitivos de los scripts se fijarán durante la inicialización del monorepo. El objetivo es que una instalación limpia, las migraciones y la ejecución de pruebas requieran comandos únicos y documentados.
## Comandos previstos
```bash
pnpm dev              # Inicia web, API y worker
pnpm build            # Construye todos los workspaces
pnpm lint             # Ejecuta lint
pnpm format:check     # Comprueba formato
pnpm typecheck        # Comprueba TypeScript
pnpm test             # Pruebas unitarias
pnpm test:integration # Integración con PostgreSQL real
pnpm test:e2e         # Pruebas end-to-end
pnpm test:security    # Aislamiento, RLS y pruebas negativas
pnpm db:migrate       # Ejecuta migraciones
pnpm db:seed          # Carga datos sintéticos
pnpm specs:validate   # Valida estructura y metadatos SDD
pnpm trace:check      # Comprueba referencias de trazabilidad
```
## Integración continua
Cada pull request debe ejecutar:
1. Instalación reproducible con lockfile.
2. Comprobación de formato y lint.
3. Comprobación de tipos.
4. Pruebas unitarias.
5. Pruebas de integración con PostgreSQL 18 real.
6. Creación de la base de datos desde cero mediante migraciones.
7. Pruebas negativas multi-tenant y RLS.
8. Validación de OpenAPI y catálogos de traducción.
9. Validación de especificaciones y trazabilidad.
10. Construcción de web, API y worker.
Un merge a la rama principal puede desplegar staging. La promoción a producción debe ser explícita y queda fuera del primer entregable.
## Seguridad y privacidad
- No almacenar secretos, tokens ni datos personales reales en Git.
- No utilizar datos reales en desarrollo, previews o staging durante el primer entregable.
- Derivar tenant, centro y canal público desde configuración controlada por el servidor.
- Mantener `tenant_id` no nulo en toda tabla tenant-owned.
- Utilizar restricciones compuestas para impedir relaciones cruzadas.
- Forzar RLS para el rol runtime y separar el rol de migraciones.
- Limpiar el contexto tenant al reutilizar conexiones del pool.
- Evitar PII y datos de otros tenants en logs y errores.
- Mantener el proveedor de identidad y correo detrás de puertos propios.
- Procesar auditoría y outbox dentro de la misma transacción que la reserva.
## Alcance inicial
### Incluido
- Configuración de tenant, centro, catálogo de actividades y actividades programadas.
- Página pública alojada y widget mediante iframe responsive.
- Consulta pública de disponibilidad.
- Reserva online y reserva manual con las mismas reglas de capacidad.
- Calendario básico.
- Confirmación y correo transaccional.
- Cancelación segura.
- Autorización por tenant, centro, rol y ámbito.
- Auditoría, idempotencia y outbox.
- Español e inglés.
### Fuera de alcance
- Pagos, depósitos, facturación y reembolsos.
- Check-in, manifiesto, inicio y cierre de salidas.
- Certificaciones, datos médicos y contactos de emergencia.
- Marketplace y distribución multi-proveedor.
- Inventario, alquiler y mantenimiento de equipos.
- Operación offline y sincronización.
## Criterios de aceptación del primer entregable
- [ ] El repositorio se instala y construye desde cero con comandos documentados.
- [ ] CI ejecuta lint, tipos, pruebas, migraciones y build.
- [ ] Las migraciones crean el esquema completo del primer slice.
- [ ] El rol runtime no puede omitir RLS ni ejecutar DDL.
- [ ] Las pruebas con dos tenants demuestran aislamiento y limpieza de contexto.
- [ ] Dos reservas concurrentes no superan la capacidad disponible.
- [ ] Un reintento idempotente no duplica reservas ni efectos.
- [ ] Auditoría y outbox se confirman en la misma transacción.
- [ ] El worker procesa reintentos sin duplicar la confirmación observable.
- [ ] La reserva pública aparece únicamente en el dashboard autorizado.
- [ ] El flujo funciona en español e inglés sin claves ausentes.
- [ ] Staging es reproducible y no contiene datos reales.
## Fuente de verdad
GitHub conserva las especificaciones ejecutables, ADR aceptados, código, pruebas y evidencia. Notion mantiene el contexto, la navegación y el estado documental. Ante una discrepancia no resuelta, la implementación debe detenerse hasta aclarar el artefacto normativo responsable.
## Licencia
Pendiente de decisión antes de publicar el repositorio fuera del equipo.
