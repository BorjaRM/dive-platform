# Borrador temporal: invitaciones IAM y bootstrap

> **Estado:** Draft de trabajo. Este archivo no es fuente normativa y debe eliminarse o sustituirse por las decisiones aprobadas en `specs/`, ADRs, issue y PR correspondientes.
>
> **Propósito:** consolidar las decisiones confirmadas y las preguntas abiertas antes de documentar e implementar el ajuste de invitaciones.

## Alcance

Este borrador cubre dos flujos relacionados, pero distintos:

- Invitaciones ordinarias para añadir trabajadores a un tenant.
- Invitaciones de bootstrap para completar el alta inicial de un tenant u operador.

La separación de ambos flujos es una decisión de diseño de seguridad. No se debe inferir que un ticket de Clerk y un grant de bootstrap son intercambiables. El flujo ordinario mantiene provisionalmente una credencial bearer propia hasta que Clerk demuestre un reemplazo equivalente.

## Perfil operativo de empleado sin identidad

**Documented -- decisión explícita 2026-10-04.** Un Owner o Admin puede crear
y editar un perfil operativo de empleado dentro de su tenant sin crear una
identidad Clerk ni una membresía IAM. Ese perfil no tiene `issuer + subject`,
no puede iniciar sesión, no concede permisos y no aparece como autorización
pendiente.

**Documented -- decisión explícita 2026-10-04.** El perfil puede incluir un
`nickname` opcional y una referencia opcional a un avatar o foto para facilitar
su identificación visual en el calendario. Son datos de presentación y no
representan una identidad, una credencial ni una autorización. El contrato de
subida, almacenamiento, formatos y privacidad de la imagen queda pendiente.

**Documented -- decisión explícita 2026-10-04.** Aunque el MVP no ejecuta la
vinculación con Clerk, el diseño debe reservar una relación futura
`employee_profile_identity_link` con `tenant_id`, `employee_profile_id`,
`membership_id`, `issuer`, `subject`, `linked_at` y `unlinked_at` opcional.
`issuer + subject` es la pareja estable de identidad; el email, nickname y
avatar no participan en la vinculación. En el MVP no se crean enlaces ni se
rellenan estos campos.

El Owner o Admin puede asignar el perfil a actividades, calendario/booking y
otros registros operativos, tenga o no tenga una identidad vinculada. Estas
acciones administrativas no requieren que el empleado pueda iniciar sesión y
no modifican los contratos existentes de actividad o calendario. Un trabajador
sin identidad no puede consultar esos datos por sí mismo.

La entidad a la que se aplica el aislamiento adicional de esta propuesta es
el registro operativo de empleado y cualquier relación futura con actividad,
actividad programada o centro: todos deben resolverse dentro del tenant y
centro autorizados, sin recuperar el tenant desde datos del cliente.

Si más adelante se quiere dar acceso al trabajador, el administrador enviaría
una invitación individual de Clerk vinculada al perfil operativo concreto:

```text
registro operativo sin identidad
    -> invitación ordinaria vinculada al registro
    -> autenticación individual mediante Clerk
    -> verificación de la correlación Clerk-local
    -> vinculación issuer + subject
    -> activación de la membresía con roles y centros explícitos
```

La invitación no se resolvería por email ni convertiría automáticamente al
perfil en identidad. La activación conservaría el contrato de correlación
exacta, dirección verificada, estado, expiración y scopes de las invitaciones
ordinarias. Si la invitación se revoca, caduca o falla, el registro operativo
continúa existiendo sin acceso.

**Documented -- decisión explícita 2026-10-04.** Se descarta una cuenta
compartida para el centro. Cada persona que necesite acceso debe utilizar su
propia identidad y sesión, de modo que las acciones sean atribuibles y el
acceso pueda revocarse individualmente.

El contrato de campos, lifecycle, duplicados y asignaciones está documentado
[booking](../../specs/booking/SPEC-DIVE-BOOKING-001.md) y
[calendario/scheduling](../../specs/booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md)
cuando sean aplicables. Esta propuesta no cambia `DIVE-IAM-REQ-017`, no crea
una nueva identidad ficticia y no autoriza implementar el alcance diferido de
`SPEC-DIVE-OPS-001`.

## Decisiones confirmadas

### 1. Se mantiene el modelo de invitaciones

**Derivada de la conversación y coherente con el contrato existente.**

El owner o admin puede crear la membresía pendiente, asignar los roles y centros permitidos y solicitar la entrega. El trabajador reclama la invitación con su propia identidad y completa la autenticación mediante Clerk.

No se adopta el modelo de contraseña temporal administrada por el owner/admin. Ese modelo introduciría una credencial adicional que habría que generar, entregar, proteger, invalidar y cambiar; para usuarios que ya tienen cuenta también podría crear una identidad o contraseña innecesaria.

La creación administrativa de una membresía no concede acceso inmediato:

```text
owner/admin crea la invitación
    -> membresía pending, sin autorización
    -> entrega al destinatario
    -> identidad autenticada + validaciones de invitación
    -> membresía active
```

### 1.1. No se conceden permisos por omisión

**Documentada -- autorización explícita 2026-10-04.** Una invitación no debe
interpretar un rol, permiso, tenant o centro ausente como un valor más amplio.
Para roles limitados a centros, la lista de centros debe ser explícita, no
vacía y pertenecer al tenant objetivo. La ausencia de esa lista no significa
todos los centros; la ausencia de rol no significa un rol por defecto. Los
autorización.

Si el trabajador ya tiene una membresía activa en el mismo tenant y se quiere
añadir otro centro, se usa `membership.scope.update`, una operación
administrativa separada de ampliación aditiva. Solo Owner/Admin pueden usarla
para una membresía activa no-owner del mismo tenant. Debe seleccionar
explícitamente la membresía, un conjunto no vacío de centros del tenant y una
clave de idempotencia; deriva el tenant del contexto autenticado y audita el
resultado. No modifica roles, no elimina centros, no concede todos los centros
y no activa una membresía pendiente o deshabilitada. La escritura, auditoría
y outbox son atómicos y las operaciones concurrentes se serializan.

La pertenencia a otro tenant sí requiere una invitación ordinaria. Bootstrap
mantiene sus propios grants, metadata, rutas, permisos y consumidores; ninguna
omisión del flujo ordinario puede conceder un grant bootstrap, ni al contrario.

### 1.2. Roles reutilizables y asignación individual

**Documented -- decisión explícita 2026-10-04.** Los roles son definiciones
reutilizables del catálogo IAM, no permisos diseñados para una persona. Owner o
Admin asigna uno o varios roles a cada membresía; un trabajador puede combinar,
por ejemplo, `instructor` y `calendar_editor`. Los centros permitidos se
asignan explícitamente a la membresía completa en el MVP. Las capacidades
efectivas son la unión de los roles asignados, limitada a esos centros.

Los grupos de empleados no forman parte del modelo de permisos del MVP. El
`job_title`, nickname, avatar, perfil operativo o asignación a una actividad no
conceden permisos. Un perfil sin identidad y sin membresía no tiene acceso,
aunque pueda ser administrado y asignado operativamente.

### 1.3. Contrato del perfil operativo para el MVP

**Documented -- decisión explícita 2026-10-04.** El perfil operativo debe
contener `id`, `tenant_id`, `display_name`, `status`, `created_at` y
`updated_at`. `nickname`, `avatar_asset_id`, `given_name`, `family_name`,
`job_title`, `contact_email` y `phone` son opcionales. `job_title` describe una
cualificación o función operativa, como instructor o divemaster, y nunca
concede permisos IAM.

El perfil empieza en `active` y puede pasar a `archived`. Un perfil archivado
se conserva para histórico y no recibe nuevas asignaciones. No se impone
unicidad sobre `display_name` ni `nickname`; dos personas pueden compartirlos.
No se permite el borrado físico mientras exista histórico o una asignación
referenciada.

Las asignaciones se modelan mediante relaciones explícitas propiedad de cada
dominio de actividad/calendario, no mediante una relación polimórfica genérica.
Creación, edición, archivado, asignación y retirada deben auditar el actor y
ser idempotentes; las escrituras concurrentes deben serializarse.

Owner/Admin puede gestionar perfiles y asignaciones dentro del tenant y de su
alcance autorizado de centros. La subida y almacenamiento real del avatar, la
vinculación Clerk y los grupos de empleados permanecen fuera del MVP.

### 2. Bootstrap y ordinarias permanecen separadas

**Derivada de la conversación; alineada con la separación documental existente.**

Bootstrap es un flujo especialmente sensible y conserva sus propios contratos, eventos, consumidor, controles de revocación y permisos. Las invitaciones ordinarias no deben reutilizar el contrato de bootstrap solo porque ambos usen Clerk como proveedor de identidad.

Se puede compartir infraestructura técnica cuando no mezcle decisiones de negocio, por ejemplo:

- transporte hacia un proveedor;
- límites de tiempo y clasificación de errores;
- observabilidad no sensible;
- utilidades de reintento.

No se deben compartir implícitamente autorización, payloads de outbox, estados, grants, credenciales ni permisos de base de datos.

### 3. Bootstrap continúa usando la entrega existente mediante Clerk

**Documentada en la implementación actual; no se cambia en este alcance.**

El worker de bootstrap entrega mediante `ClerkBootstrapInvitationAdapter`. Clerk envía la invitación al destinatario y el flujo usa el `grantRef` de DIVE para vincular la invitación del proveedor con el grant de bootstrap.

El worker de bootstrap no debe empezar a consumir registros, referencias o
credenciales de invitaciones IAM ordinarias como efecto lateral de este cambio.

### 4. Se conserva la credencial IAM ordinaria hasta demostrar un reemplazo

**Documentada -- instrucción explícita 2026-10-04.** La credencial bearer
ordinaria se conserva en generación, hash, persistencia, aceptación y entrega
interna hasta que Clerk demuestre un reemplazo equivalente para usuarios nuevos
y existentes. Clerk puede gestionar el ticket y la entrega, pero DIVE no puede
retirar el bearer basándose solo en que el ticket permite completar el login.
La retirada requerirá evidencia de correlación exacta y una decisión posterior.

La respuesta HTTP administrativa debe exponer únicamente estado seguro de la
operación:

- identificadores permitidos;
- estado, expiración y estado de entrega;
- metadatos no sensibles.

El test HTTP debe comprobar que `credential`, hashes, tickets, enlaces completos
**Documentada en `ADR-DIVE-004` y derivada para la implementación.**

Para aceptar una invitación ordinaria, DIVE debe seguir siendo la autoridad sobre la membresía, los roles, los centros y la activación. La identidad autenticada y la dirección verificada proceden de Clerk o del proveedor de identidad autorizado; los campos enviados por el cliente no son prueba de identidad ni de tenant.

Un usuario existente debe poder recibir una membresía adicional sin que el flujo cambie su contraseña ni cree una segunda identidad.

## Decisiones documentadas y evidencia pendiente

### Estado de reconciliación y privilegios

#### 3. Reconciliación del estado del proveedor

**Documented -- implementación y validación local, 2026-10-04.** La
reconciliación busca por el `invitation_attempt_id` inmutable mediante
metadata privada y exige exactamente un resultado. La dirección de correo solo
limita la consulta; no puede resolver por sí sola una invitación ni un tenant.
Una consulta completa sin coincidencias permite crear solo cuando el evento no
tiene una referencia previa; varias coincidencias, metadata inconsistente o
un timeout ambiguo no deben crear ni activar otra invitación.

El worker debe tratar los estados así:

- `pending`: guardar el `provider_invitation_id` y completar la entrega.
- `accepted`: guardar la referencia y marcar la entrega como completada, pero
    mantener la membresía local en `pending`; solo la aceptación autenticada y
    transaccional puede activar el acceso.
- `revoked` o `expired`: guardar el estado terminal y no crear una sustituta
    automáticamente; una nueva entrega requiere una reemisión deliberada que
    genere otro intento local y revoque/superseda el anterior.
- `not_found`: permitir creación únicamente cuando no existe una referencia
    previa y una consulta autoritativa confirma que no hay coincidencia. Después
    de un timeout, una referencia conocida o una respuesta no autoritativa, solo
    se reintenta la reconciliación; no se crea otra invitación.
- Resultado ambiguo, referencia que no coincide o más de una coincidencia:
    reintentar reconciliación, sin activar acceso ni repetir creación, y
    terminar en dead-letter si se agota el límite operativo.

Esta separación evita duplicados después de un timeout y evita convertir un
estado remoto terminal en autorización local. El adaptador distingue los
estados terminales, ambiguos y desconocidos, y el worker los valida antes de
completar el outbox. La activación local continúa siendo responsabilidad del
flujo de aceptación, no de la reconciliación de entrega.

#### 4. Estado de reintentos y privilegios del worker

**Documented -- implementación y validación local, 2026-10-04.** El punto 4
ya está resuelto en el código actual. Las invitaciones ordinarias comparten
con bootstrap el límite de ocho intentos, full jitter y el respeto de
`Retry-After` como demora mínima para `429`; el octavo fallo se conserva como
`dead_letter` y no programa una nueva entrega. La recuperación requiere una
reemisión explícita y no cambia de tenant.

El proceso runtime `dive_worker` ejecuta la entrega mediante las funciones SQL
de outbox. No tiene `SELECT` ni `UPDATE` directo sobre las tablas de
invitaciones u outbox. Las funciones tienen `search_path` explícito, no son
ejecutables por `PUBLIC`, y validan el tenant recibido contra el contexto
transaccional. `dive_invitation_delivery` permanece como rol propietario sin
login ni herencia; no es una credencial adicional del proceso runtime.

La evidencia está en los tests del worker, los tests de privilegios y los tests
de acceso directo de invitaciones. No queda una decisión de implementación
pendiente para este punto; cualquier cambio posterior al límite, al backoff o
a la frontera de privilegios requerirá una nueva decisión documentada.

### Comprobaciones pendientes antes de retirar el bearer o activar provider-only

**Documented -- estado de comprobación, 2026-10-04.** Las siguientes
comprobaciones no están cerradas y no deben presentarse como decisiones de
retirada ni como cobertura de aceptación provider-only:

1. **Entrega interna confiable del bearer:** demostrar el canal interno
     autorizado que emite el bearer una sola vez al destinatario, conserva la
     correlación con tenant e `invitation_attempt_id`, y excluye el valor de
     respuestas HTTP, logs, errores, auditoría y trazas. Hasta esa prueba, el
     hash y la aceptación bearer deben conservarse; la respuesta administrativa
     seguirá usando la proyección sin secretos.
2. **Aceptación ticket-aware de Clerk:** ejecutar el harness para usuario nuevo
     y existente y demostrar recuperación del identificador exacto de la
     Application Invitation, coincidencia de dirección verificada canónica,
     rechazo de referencias ausentes/ambiguas o cruzadas entre tenants,
     revocación/caducidad/reemisión y activación atómica de la membresía. Hasta
     completar esa evidencia y obtener aprobación posterior, el flujo
     provider-only permanece bloqueado y el bearer actual sigue siendo el
     mecanismo de aceptación.

### A. Entrega de la invitación ordinaria

**Decisión aceptada — Documented.**

El destinatario recibe una invitación nativa de Clerk. El worker y el adaptador
pueden reutilizar transporte, timeouts y clasificación de errores, pero la
invitación ordinaria usa una clave de metadata, redirect, outbox, comando de
aceptación y límites de autorización propios.

Clerk gestiona el ticket, el registro/login y el correo; DIVE sigue
decidiendo la membresía, tenant, roles, centros, expiración, revocación y
activación. El retorno debe identificar sin ambigüedad la invitación local. La
credencial bearer provisional de DIVE se conserva hasta cerrar las
comprobaciones 1 y 2 y obtener una aprobación explícita de retirada.

### B. Correlación Clerk-local y bearer provisional

**Decisión documentada -- instrucción explícita 2026-10-04.**

El outbox ordinario puede transportar la referencia local, el propósito de
entrega y la relación con la invitación Clerk. Mientras la correlación exacta
del proveedor no esté demostrada, la entrega interna conserva el bearer y la
aceptación existente continúa validándolo mediante su hash.

La referencia que vuelve del navegador solo selecciona un candidato local; no
autoriza la operación. El servidor debe verificar la asociación Clerk-local,
la identidad autenticada, la dirección verificada, el estado y la expiración.
Si Clerk no conserva una asociación inequívoca hasta el retorno, el flujo
provider-only queda bloqueado; no se elimina ni se sustituye el bearer actual
como si el defecto estuviera resuelto.

### B.1. Normalización canónica de direcciones

**Decisión aceptada -- Documented, autorización explícita 2026-10-04.** Se
conservan la dirección original para entrega/auditoría y una dirección
canónica para comparación. La normalización elimina espacios Unicode externos,
aplica `NFKC`, exige un único `@` con partes no vacías, convierte el dominio a
ASCII IDNA/UTS-46 en minúsculas y compara el local en minúsculas sin eliminar
puntos, etiquetas `+`, guiones ni aplicar alias específicos de un proveedor.
Los valores inválidos o ambiguos se rechazan.

La clave de unicidad de invitaciones pendientes es
`(tenant_id, target_address_canonical)`. La misma función se usa al emitir,
buscar una sustitución latest-wins, reconciliar la entrega y aceptar. Es una
regla de comparación y deduplicación, no una identidad ni un selector de
tenant.

### B.2. Referencia exacta Clerk-local

**Decisión aceptada -- Documented, autorización explícita 2026-10-04.** Antes
de solicitar la entrega se crea un `invitation_attempt_id` local inmutable. El
worker persiste el identificador exacto de la Application Invitation de Clerk
como `provider_invitation_id`, con proveedor `clerk`, y exige que esa relación
sea única. La metadata privada puede repetir el identificador local para
reconciliación, pero no contiene autoridad de tenant, rol, centro ni
activación.

La futura aceptación provider-only resolvería el contexto autenticado de Clerk
hacia exactamente un intento local mediante `provider_invitation_id` y
comprobaría tipo ordinario, estado, expiración, revocación/supersession,
`issuer + subject` y dirección verificada canónicamente coincidente. La
referencia del navegador, el ticket, el enlace, la metadata o el email solo
pueden seleccionar un candidato; no autorizan la aceptación. Si Clerk no
expone el identificador exacto o la asociación es ambigua, esa vía se rechaza
sin activar y el bearer provisional permanece vigente.

### C. Flujo de aceptación ordinario

**Decisión aceptada — Documented.**

El flujo usa un endpoint o página de aplicación que recibe el enlace, conserva
la referencia durante el login/registro de Clerk y termina la aceptación. Debe
definir:

- qué ocurre antes y después de iniciar sesión;
- cómo se verifica la dirección destinataria;
- cómo se resuelve el tenant sin confiar en un selector del cliente;
- cómo se hace la activación atómica;
- qué respuesta se devuelve para una invitación inválida, caducada, revocada o ya usada.

Usar una página de aceptación pública
ticket-aware de Clerk que conserve temporalmente la referencia del enlace
durante el login o registro y termine en una operación autenticada de
aceptación. El servidor debe resolver una única invitación ordinaria mediante
la referencia Clerk verificada y la correlación local; el correo por sí solo no
basta.
Debe derivar el tenant, la invitación, los roles y los centros desde la
invitación almacenada; no debe aceptar esos valores como autoridad del
cliente.

La operación debe comprobar el contexto/ticket de Clerk, el estado y la
expiración, exigir la dirección verificada coincidente y activar la membresía
en una única transacción. La respuesta debe ser segura y no revelar si una
invitación arbitraria pertenece a otro tenant. El nombre exacto de la ruta y
los detalles de UX quedan para el contrato de la aplicación.

### D. Relación entre reintento, idempotencia y reemisión

**Decisión aceptada — Documented.**

Debe quedar explícito que:

- repetir la misma orden idempotente no devuelve de nuevo un ticket o secreto;
- reintentar la entrega no crea una invitación nueva;
- una nueva intención para el mismo destinatario canónico dentro del tenant
    revoca la invitación pendiente anterior y crea una nueva invitación de Clerk;
- invitaciones para el mismo destinatario en tenants distintos permanecen
    independientes;
- los eventos antiguos no pueden entregar una invitación ya revocada.

Mantener una identidad de entrega estable por invitación y consultar o
reconciliar el estado del proveedor antes de repetir una entrega cuyo resultado
sea ambiguo. Un reintento con la misma clave conserva la invitación y el mismo
evento lógico. Una reemisión con otra clave revoca primero la versión anterior
en DIVE y encola la revocación Clerk antes de crear la sustituta. La operación
debe serializar emisiones concurrentes y conservar razón y referencia de
supersesión. La regla de normalización y la referencia exacta Clerk-local están
definidas en las secciones B.1 y B.2; la restricción y el flujo solo pueden
activarse tras validarlas en el SDK/harness de Clerk y cubrirlas con migración y
pruebas.

Los TTLs, número de intentos y estados del proveedor siguen los contratos
existentes de Clerk y del worker; cualquier cambio posterior requiere una
decisión documentada.

### H. Ampliación directa de centros

**Documentada -- autorización explícita 2026-10-04.** La capacidad
`membership.scope.update` es independiente de `membership.invite`: permite
añadir centros concretos a una membresía activa no-owner del mismo tenant para
Owner/Admin autorizados. No permite activar pendientes o deshabilitadas,
cambiar roles, eliminar centros, cruzar tenants ni inferir todos los centros.
Debe ser idempotente, auditable, tenant-scoped y atómica con su outbox.

### E. Aislamiento operativo de bootstrap

**Decisión aceptada — Documented; evidencia de aislamiento pendiente.**

Los consumidores de bootstrap y ordinarios deben ejecutarse con contratos y
permisos mínimos distintos. Un proceso único no es suficiente como aislamiento
si comparte una credencial de base de datos con capacidad para operar sobre
ambos flujos.

Ejecutar bootstrap y ordinarias como
consumidores separados, idealmente con despliegues y roles de base de datos
distintos. Pueden compartir una librería de transporte, pero el consumidor
ordinario no debe poder reclamar ni revocar grants de bootstrap, y el
consumidor de bootstrap no debe poder leer payloads de invitaciones IAM
ordinarias.

La separación de procesos no sustituye a RLS, autorización ni pruebas de
aislamiento; reduce el impacto de un fallo o una credencial operativa
comprometida. Si temporalmente se usa un proceso común, los contratos y roles
deben seguir separados y esa excepción debe quedar aprobada explícitamente.

### F. Campos públicos del resultado

**Decisión aceptada — Documented.**

El DTO administrativo debe definirse como una proyección segura, no como el resultado interno completo de la base de datos. Hay que revisar también documentación OpenAPI, serialización de errores, logs, auditoría y respuestas idempotentes.

Crear una proyección explícita de respuesta
administrativa con una lista de campos permitidos. El controlador no debe
devolver directamente el resultado interno del comando. El DTO, OpenAPI,
serializador de errores, auditoría y logging deben probar que `credential`,
tokens de proveedor, enlaces completos y payloads de entrega no aparecen.

El test HTTP debe usar una aserción negativa sobre esos campos tanto en la
primera respuesta como en la respuesta idempotente.

### G. Por qué existía la credencial propia

**Documentada en el historial; justifica mantenerla mientras el reemplazo no
esté demostrado.** La
credencial se añadió en `3c77591` para disponer de un bearer provider-neutral,
guardar solo su hash y emitirlo una única vez al límite confiable de entrega.
El diseño buscaba que la aceptación de IAM no dependiera del objeto de
invitación de Clerk. El ADR no autorizaba devolverla en la respuesta HTTP
administrativa; esa exposición apareció al reutilizar el resultado interno al
crear las rutas.

El uso de Clerk para invitaciones ordinarias aporta una posible alternativa,
pero todavía no demuestra la asociación exacta necesaria para eliminar esta
credencial. La implementación debe validar el ticket y el retorno de Clerk sin
retirar el bearer actual; bootstrap seguirá usando sus propios registros,
metadata, redirect y controles.

## Impacto esperado de la corrección

La corrección elimina `credential` únicamente del contrato HTTP administrativo
y de logs, errores y trazas. La generación, persistencia hashada, entrega
interna y aceptación ordinaria se conservan hasta que exista evidencia Clerk
equivalente y una decisión explícita de retirada. El test HTTP debe comprobar
la ausencia del bearer en la respuesta, mientras que los tests de aceptación
deben conservar la cobertura del bearer actual.

La validación del harness y las pruebas de integración completan la evidencia
de entrega ordinaria. Bootstrap debe conservar su comportamiento y sus pruebas
actuales.

## Validación prevista

La implementación deberá cubrir como mínimo:

- respuesta administrativa sin secretos;
- primera creación e idempotencia;
- usuario nuevo y usuario ya existente en Clerk;
- destinatario cuya dirección verificada no coincide;
- tenant o centro no autorizados;
- expiración y revocación;
- aceptación repetida;
- reintento de entrega y timeout ambiguo;
- reemisión que invalida el enlace anterior;
- separación de permisos y datos entre bootstrap e invitaciones ordinarias;
- asociación inequívoca entre invitación Clerk e invitación local con dos
    invitaciones pendientes para el mismo correo;
- latest-wins para dos emisiones al mismo destinatario dentro del mismo tenant;
- independencia de invitaciones al mismo destinatario en tenants distintos;
- concurrencia de emisión/reemisión, revocación y aceptación;
- ticket o metadata manipulado, referencia Clerk-local inconsistente y timeout
    ambiguo sin activación ni duplicación;
- normalización canónica con espacios Unicode, `NFKC`, dominio IDNA/case,
    variantes de local, puntos, etiquetas `+` y direcciones inválidas;
- recuperación del identificador exacto de Clerk para usuarios nuevos y
    existentes, asociación uno-a-uno con el intento local y fallo cerrado cuando
    la referencia no existe, no coincide o es ambigua;
- membresía existente, membresía pending/disabled y ampliación directa de
    centros con permiso, idempotencia y aislamiento tenant;
- aceptación por usuario nuevo y usuario ya existente;
- regresión del worker y del flujo sensible de bootstrap.

Los comandos ejecutados y sus resultados deben quedar en la `Validation` del PR, no copiarse como logs en este archivo.

### Pendientes de implementación y evidencia

**Documented -- estado al aceptar la propuesta, 2026-10-04.** Quedan
pendientes la confirmación ejecutable del contrato de Clerk para recuperar el
`Application Invitation.id` después del login/registro, la migración
TypeScript/SQL que conserve la credencial mientras añade los campos/índices y
deje preparada su retirada futura, la
implementación del worker y la aceptación transaccional, y las pruebas de
unicidad, concurrencia, reemisión, aislamiento y no divulgación. Bootstrap no
forma parte de esta migración y debe conservar su flujo independiente.

## Referencias

- [ADR-DIVE-004: invitaciones e identidad](../../specs/architecture/adrs/ADR-DIVE-004.md)
- [SPEC-DIVE-IAM-001: roles, permisos y scopes](../../specs/iam/SPEC-DIVE-IAM-001.md)
- [SPEC-DIVE-IAM-INVITATIONS-001: invitaciones ordinarias](../../specs/iam/SPEC-DIVE-IAM-INVITATIONS-001.md)
- [SPEC-DIVE-ONBOARDING-001: bootstrap](../../specs/onboarding/SPEC-DIVE-ONBOARDING-001.md)
- [SPEC-DIVE-ONBOARDING-DELIVERY-001: entrega bootstrap](../../specs/onboarding/SPEC-DIVE-ONBOARDING-DELIVERY-001.md)
- [ADR-DIVE-002: outbox y worker](../../specs/architecture/adrs/ADR-DIVE-002.md)
- [Worker de invitaciones bootstrap](../../apps/worker/src/bootstrap-invitation-worker.ts)
- [Adaptador Clerk de bootstrap](../../packages/identity/src/bootstrap-invitations.ts)
