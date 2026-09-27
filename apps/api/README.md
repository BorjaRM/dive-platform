# API

## Clerk configuration

The approved topology is one API process for dashboard authentication and Clerk webhooks. The Nest module therefore creates one `ClerkIdentityAdapter` and aliases it as both `IDENTITY_PROVIDER` and `IDENTITY_WEBHOOK_VERIFIER`; these are two ports backed by one configuration boundary, not separate deployables. Startup fails closed when any required value is missing or invalid, so the process cannot serve either path with partial identity configuration:

- `CLERK_SECRET_KEY`: Clerk Backend API secret used by `verifyToken` and the Backend API client. It must use Clerk's `sk_test_` or `sk_live_` format.
- `CLERK_WEBHOOK_SIGNING_SECRET`: endpoint signing secret used by `verifyWebhook`. It must use Clerk's `whsec_` format.
- `CLERK_ISSUER`: exact expected `iss` claim as a canonical HTTPS origin. Wildcards, credentials, paths, queries, and fragments are rejected.
- `CLERK_AUTHORIZED_PARTIES`: comma-separated canonical origins or a JSON string array. Empty entries, wildcard entries, credentials, paths, queries, fragments, and trailing slashes are rejected.

`.env.example` contains synthetic placeholders only. Never commit real Clerk secrets.

For every dashboard request, the adapter calls official `@clerk/backend@3.20.1` APIs `verifyToken`, `sessions.getSession`, and `users.getUser`. It accepts only the standard Clerk session-token profile: exact configured issuer, `sid` and `sub`, an `azp` accepted through the SDK's `authorizedParties`, no `aud` claim, and a provider-confirmed active, unexpired session and usable user. Tokens carrying `aud` are rejected whether the claim is a string or array. Any invalid token, ended/revoked/expired session, mismatch, or provider failure returns the same unauthenticated response.

Ordinary dashboard authentication binds by `issuer + subject` and may return no provider-verified email addresses. Invitation acceptance is stricter: it requires at least one provider-verified address and an exact match to the invitation target.

Clerk's optional experimental `fva` claim is kept inside the adapter. Valid factor ages map to provider-neutral assurance. When `fva` is absent, ordinary MVP dashboard authentication returns `single_factor` with `verifiedAt: null`; no MFA requirement or factor timestamp is fabricated. Exact future step-up use of Clerk's experimental claim remains an open Phase 4 question under `ADR-DIVE-006`.

## Clerk webhook

Configure Clerk to send webhooks to `POST /v1/webhooks/clerk`. Nest raw-body capture is enabled and the route passes the original bytes and request headers to official `verifyWebhook` before creating a provider-neutral event.

The explicit identity inventory is `user.created`, `user.updated`, `user.deleted`, `session.created`, `session.ended`, `session.removed`, and `session.revoked`. All are synchronization signals only; live session and user validation remains request-time. A resolved `user.deleted` event is recorded, audited per associated tenant, and emits `iam.identity.provider_deletion_recorded.v1`, but it never disables an external identity or membership. Verified unknown events are recorded as ignored or unresolved and never create identities, memberships, roles, or scopes.

Duplicate, ignored, unresolved, and applied verified events return `200 {"received":true}`. Invalid signatures, missing signed headers, and invalid envelopes return a non-disclosing `400`. Persistence failures return a non-disclosing `503` so the provider can retry. Logs contain only safe action, reason, and correlation metadata; never log the body, signature, address, or bearer token.

The local verifier contract test executes the real Clerk SDK against an RS256 fixture signed with a generated local key and the documented `jwtKey` option. Session and user Backend API fetches remain mocked; no Clerk sandbox or production validation is claimed.

## OpenAPI

`main.ts` builds an OpenAPI document via `@nestjs/swagger` on every boot. With the app running locally:

- Swagger UI: `http://localhost:3000/docs`
- Raw OpenAPI JSON: `http://localhost:3000/docs-json`

## Local commands

```bash
pnpm --filter @dive-center/api test
pnpm --filter @dive-center/api test:e2e
pnpm --filter @dive-center/api typecheck
```

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. Create a free account at [observe.nestjs.com](https://observe.nestjs.com), add an application, and paste the generated app key and secret into the `ObserveModule.forRoot()` call in `src/app.module.ts`.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
