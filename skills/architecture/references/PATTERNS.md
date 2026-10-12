<!-- derived from ai-factory@2.19.0 skills/aif-architecture/references/architecture.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Architecture patterns — knowledge base

Reference for choosing a pattern and generating `docs/architecture.md`. Adapt names and extensions to the project's stack.

## Decision matrix

| Factor | Layered | Structured Modules | Explicit Architecture | Explicit (Vertical Slice) | Microservices |
|---|---|---|---|---|---|
| Team size | 1-5 | 3-10 | 5-30 | 5-30 | 20+ |
| Domain complexity | Low | Medium | High | High | High |
| Scale requirements | Low | Low-Moderate | Moderate-High | Moderate-High | Very High |
| Feature independence | Low | Medium | Medium | High | Very High |
| Module boundaries | None | Soft | Hard | Hard | Hard (network) |
| Domain purity | no | Encouraged | Enforced | Enforced | Varies |
| Initial velocity | Fast | Fast | Medium | Medium | Slow |
| Operational complexity | Low | Low | Medium | Medium | High |
| Testing complexity | Medium | Medium | Low (ports) | Low (ports) | Medium-High (contract tests across services) |
| Learning curve | Low | Low-Medium | Medium-High | Medium-High | High |
| Deployment model | Single | Single | Single | Single | Multi-service |

Folder-organization variants (by technical layer / by vertical slice / flat slice) share their pattern's scores except feature
independence; choose the variant separately, by module size.

## Terminology (placeholders used below)

`[EntityName]` core domain model with identity and rules (User, Order). `[FeatureName]` a use case of a single entity (CreateUser).
`[ProcessName]` an orchestration across several entities (PlaceOrder, Checkout). `[ModuleName]` a feature module (Structured
Modules). `[ContextName]` a bounded context with its own language (Explicit Architecture). `[ServiceName]` an independently
deployable microservice. Entity slices and process slices are siblings inside `Slices/`. Per slice choose one file style and keep it:
**Unified** (one controller/service per entity) for small slices, **Granular** (one file per feature) for slices with many use cases.

## Quick decision guide

```text
New project, small team, simple domain?                  → Layered
Growing project, need structure but not full formalism?  → Structured Modules
Complex business logic, many rules?                      → Explicit Architecture
Many independent features, long-lived?                   → Explicit Architecture (Vertical Slice By Entity)
Multiple subdomains, large team?                         → Explicit (layers / vertical / flat vertical)
Independent scaling + large org?                         → Microservices
Simple CRUD app?                                         → Layered
Unclear requirements?                                    → Start with Structured Modules, evolve to Explicit when patterns emerge
```

## Evolution triggers (when to move to a more structured architecture)

```text
Layered → Structured Modules:
- Services grow beyond 500 LOC and mix unrelated features
- Cross-feature imports form a tangled web
- Testing a service requires mocking half the application
- New features consistently touch 5+ files across the entire src/ tree

Structured Modules → Explicit Architecture:
- Domain logic leaks into services despite convention (business rules in orchestrators)
- Need to swap infrastructure (DB, messaging) without touching domain
- Multiple teams work on the same module and step on each other
- Module "Infrastructure/" grows uncontrollably — sign of missing domain boundaries

Monolith (any pattern) → Microservices:
- Different parts of the system need independent scaling
- Teams are blocked by coordinated deployments
- Polyglot persistence is required (SQL + NoSQL + search)
- A single team's deploy failure blocks all other teams
```

## Layered Architecture

Separate concerns into horizontal layers; each layer depends only on the layer directly below. Minimum viable separation: prevents
HTTP handling, business logic and data access in one function. Degrades as the project grows: services accumulate unrelated logic.

```text
src/
├── controllers/   # request/response, input validation
├── services/      # business logic
├── models/        # data structures, entities (shared, not a layer)
├── repositories/  # data access (queries, ORM)
├── routes/        # URL → controller mapping
├── middleware/    # cross-cutting: auth, errors, logging
└── utils/         # shared helpers
```
Dependency rules: routes → controllers → services → repositories → database. No skipping layers (controllers do not call
repositories). Middleware and utils are cross-cutting, hold no business logic. Controllers stay thin (validate, call one or two
service methods, format the response); services are stateless.
Anti-patterns: God Controller; business logic in routes/middleware; layer skipping; upward dependencies (services importing
controllers); shared mutable state in module-level variables.

## Structured Modules

A lightweight domain-aware modular monolith: each module owns routes, application services (orchestrators), rich models and
repositories. Domain-centric, not service-centric: services only orchestrate (fetch → call model method → save); business rules,
validation and state changes live in the models. Easy migration to Explicit Architecture later.

```text
src/
├── <module>/                 # feature module
│   ├── controllers/  services/  repositories/  models/     # by technical layer
│   └── slices/<entity>/      # OR by vertical slice: controller + service + repository per entity; process slices for cross-entity flows
├── <other-module>/
└── infrastructure/           # cross-cutting and small: types, utils, middleware, config
```
Dependency rules: controllers → services → repositories, never upward; inner layers (repositories, models) never depend on outer
ones; controllers do not bypass services; modules depend on root `infrastructure/` but not on each other's internals — cross-module
calls go through a module's public API.
Principles: module boundaries with a public API; lightweight dependency inversion (constructor injection, repository interfaces
encouraged); push domain logic into models; no strict aggregates or hexagonal ports; root infrastructure stays minimal.
Anti-patterns: anemic domain models; layer skipping; upward dependencies; circular module dependencies (use shared types or events).

## Explicit Architecture

The domain is the center; frameworks, databases and UI are details plugged in through interfaces. Dependencies point INWARD — outer
layers depend on inner layers; inner layers NEVER import from outer layers.

```text
5. Configuration / composition root   DI container, wiring, bootstrap
4. Presentation / inbound adapters    HTTP handlers, CLI, web views
3. Infrastructure / outbound adapters DB repositories, external APIs, messaging
2. Application                        use cases, services, DTOs
1. Domain (center)                    entities, value objects, domain events, ports (interfaces), exceptions
```
Variants inside each bounded context: **by technical layer** (`domain/ application/ infrastructure/ presentation/`),
**vertical slice by entity** (`slices/<entity>/{application,infrastructure,presentation}` with a shared `domain/`; process slices for
cross-entity orchestration), **flat vertical slice** (controller, service, repository side by side in `slices/<entity>/`).

```text
src/
├── <context>/
│   ├── domain/           # pure: zero external deps; ports/ holds interfaces only
│   ├── application/      # use cases per entity + cross-entity process services
│   ├── infrastructure/   # persistence/, external/, messaging/ implement domain ports
│   └── presentation/     # api/, web/, cli/
└── infrastructure/       # application-wide: utils, adapters, migrations, external
```
Principles: bounded contexts talk through DTOs, facades or domain events (Customer/Supplier, Anti-Corruption Layer); the domain
layer has ZERO dependencies on frameworks, databases or external services; every external dependency (database, messaging, file
system, third-party API) is a port in the domain, implemented as an adapter in infrastructure; CQRS is OPTIONAL — only when
read/write complexity or scale justifies it; a Domain Service holds business logic across 2+ entities with no I/O, an Application
Service only orchestrates (load, call domain, save, publish); keep one entity's own rules in the entity.
Anti-patterns: anemic domain model; leaking framework types into the domain; CQRS everywhere; God services; circular dependencies.

## Microservices

Independently deployable services, each owning one business capability and its data, talking through versioned APIs or messaging.
Pays off only when the organizational and scaling pain of a monolith outweighs distribution cost (tracing, network failure modes,
data consistency, mature DevOps). Use for: large teams needing independent deploys, different scaling per service, polyglot
persistence. Not for: teams under 10, unclear domain boundaries, products still finding fit.

```text
<service>/ src/{api,application,domain/ports,infrastructure/{persistence,messaging,external},config}  tests/  migrations/  Dockerfile
monorepo:  <service-a>/  <service-b>/  libs/{contracts,common,testing}  gateway/ (optional)  infra/ (IaC, compose, CI)
```
Principles: service autonomy; API-first contracts with a versioning strategy; smart endpoints, dumb pipes; design for failure
(timeouts, retries with backoff, circuit breakers, fallbacks); one service = one capability. Cross-service transactions use sagas;
direct database access between services is forbidden; an API gateway/BFF is the entry point.
Anti-patterns: distributed monolith; shared database; chatty synchronous chains; no observability; premature decomposition;
nano-services; cascading failures.

## Dependency rules — how to write them so `/keystone:verify` can grep them

Write each rule as one line, source and target as path prefixes, with a grep that returns nothing when the rule holds:

```text
- MUST NOT: domain/ imports infrastructure/        check: grep -rnE "from ['\"].*(infrastructure|infra)/" src/domain
- MUST NOT: controllers/ imports repositories/     check: grep -rnE "(import|require).*repositories" src/controllers
- MUST: external systems are reached through ports/  check: grep -rn "ports/" src/domain | head -1
```
`MUST NOT: A imports B` — verify greps for an import of B inside A; any hit is a violation. Use the project's real import syntax
(`import … from`, `require`, `use`, `#include`, `from … import`). Every rule that cannot be checked mechanically says so (`check: review`).

## Code examples (language-agnostic; adapt to the project's language)

```text
// GOOD: rich model — rules live inside the model            // BAD: anemic model + fat service
class Order {                                                // class Order { items; status; total }  // data only
  addItem(product, qty) {                                    // class OrderService {
    if (status != DRAFT) throw CannotModifyFinalizedOrder()  //   addItem(order, product, qty) {
    if (product.stock < qty) throw InsufficientStock()       //     if (order.status != DRAFT) throw Error()   // logic OUTSIDE the model
    items.push(new OrderItem(product, qty)); recalculate()   //     order.items.push(...); order.total = ...
  }                                                          //   } }
}

// Port (domain) and adapter (infrastructure), wired in the composition root
interface OrderRepository { findById(id): Order; save(order): void }              // domain/ports
class PostgresOrderRepository implements OrderRepository { ... }                  // infrastructure/persistence
orderService = new OrderService(new PostgresOrderRepository(db))                  // composition root

// Application service orchestrates; the business rule is a domain service
class PlaceOrderService { execute(cmd) {
  order = repo.findById(cmd.orderId); customer = customers.findById(order.customerId)
  total = pricing.calculateTotal(order.items, customer)    // domain service: pure rule, no I/O
  order.finalize(total); payments.charge(order.total); repo.save(order); events.publish(order.domainEvents())
} }
```
