---
title: "Design a Data Mesh Architecture"
description: "A system-design case study for data mesh: domain ownership, data products with contracts, a self-serve platform, federated computational governance and when not to do it."
technology: ["data-engineering", "databricks", "data-warehousing"]
topic: ["data-mesh", "data-products", "governance"]
difficulty: "Advanced"
publishedDate: "2026-10-08"
updatedDate: "2026-10-08"
reviewedDate: "2026-10-08"
problem: "A large retailer's central data team of 25 engineers is a bottleneck for 15 business domains: requests wait months, the team does not understand every domain's data, and quality problems are found far from where they start. Leadership wants to move to a data mesh. Design the architecture and operating model: how domains own and publish data products, what the shared platform provides, how governance works across domains, and how to migrate without breaking existing reporting."
functionalRequirements:
  - "Domains (orders, payments, inventory, marketing, logistics) publish data products they own end to end"
  - "Each data product has an interface (tables, views, streams or APIs), a contract, documentation, SLOs and an owner"
  - "Consumers discover, request access to and use data products across domains"
  - "A self-serve platform provides storage, compute, pipelines, quality, lineage and access control as templates and APIs"
  - "Global policies (security, privacy, interoperability) are defined once and enforced automatically"
  - "Cross-domain products (Customer 360, finance reporting) are built from domain products"
nonFunctionalRequirements:
  - "A domain team can publish a new data product in days using platform templates"
  - "Consumers get stable, versioned interfaces with published SLOs"
  - "Global policies apply to every product without manual review"
  - "Cost and usage visible per data product and domain"
  - "Existing critical reports keep working throughout the migration"
scaleAssumptions:
  - "Assumption: 15 domains, each with 2 to 6 engineers able to own data"
  - "Assumption: about 150 data products after two years"
  - "Assumption: 3,000 consumers (analysts, data scientists, applications)"
  - "Assumption: one cloud and one main lakehouse or warehouse platform"
architectureSummary: "Domains own source-aligned and consumer-aligned data products, each deployed from a platform template into a domain-owned space (catalog, schema or project) on a shared lakehouse or warehouse. A product descriptor in Git declares outputs, schema contract, SLOs, owners, classifications and access rules; CI validates it against global policies and the platform provisions storage, pipelines, quality checks, lineage and grants. A central catalog lists products for discovery and access requests. A federated governance group sets interoperability standards and policies as code; a platform team builds and runs the self-serve capabilities."
technologies:
  - "Shared lakehouse or warehouse with per-domain catalogs or projects (Unity Catalog, Snowflake databases, BigQuery projects)"
  - "Data product templates: dbt projects, orchestration, quality checks, CI/CD"
  - "Data contracts and product descriptors in Git"
  - "Central catalog with lineage and access workflows"
  - "Kafka with schema registry for streaming data products"
  - "Policy as code (tag-based masking, row filters, CI policy checks)"
tradeoffs:
  - decision: "Domain ownership of data products"
    alternative: "A central data team builds everything"
    reason: "Owners understand the data and fix problems at the source; delivery scales with domains"
    consequence: "Domains need data skills and capacity, and quality varies without strong standards"
  - decision: "One shared platform with domain-owned spaces"
    alternative: "Each domain picks its own stack"
    reason: "Interoperability, shared security and lower operating cost; domains build products, not infrastructure"
    consequence: "The platform team becomes critical and must treat domains as customers"
  - decision: "Federated computational governance"
    alternative: "Central review board for every product"
    reason: "Policies enforced automatically in CI and the platform scale to hundreds of products"
    consequence: "Policies must be precise enough to code; edge cases still need people"
  - decision: "Contracts and versioned interfaces for every product"
    alternative: "Consumers read whatever tables domains happen to produce"
    reason: "Consumers can depend on products; breaking changes are planned"
    consequence: "Versioning and deprecation work for producers"
  - decision: "Incremental migration, starting with a few willing domains"
    alternative: "Big-bang reorganisation"
    reason: "Proves the platform and operating model before scaling; existing reports keep working"
    consequence: "A long period with both central pipelines and domain products"
interviewFollowUps:
  - "What are the four principles of data mesh, and which is hardest in practice?"
  - "What exactly is a data product, and what makes it different from a table?"
  - "Who owns a cross-domain product such as Customer 360?"
  - "How do you prevent 15 domains defining customer id 15 different ways?"
  - "How do you migrate existing central pipelines without breaking finance reporting?"
  - "When would you advise a company not to adopt data mesh?"
related:
  - "articles:databricks/unity-catalog-governance"
  - "articles:data-warehousing/lake-vs-warehouse-vs-lakehouse"
  - "system-designs:data-catalog-lineage-system"
  - "system-designs:data-quality-framework"
  - "system-designs:multi-tenant-data-platform"
  - "system-designs:scalable-lakehouse"
previous: "system-designs:cost-optimized-warehouse-strategy"
versionContext: "Design discussion; the product descriptor YAML is illustrative and was not executed. Data mesh principles follow Zhamak Dehghani's published definition."
sources:
  - { label: "Zhamak Dehghani, Data Mesh: Delivering Data-Driven Value at Scale (free chapter, Thoughtworks)", url: "https://www.thoughtworks.com/content/dam/thoughtworks/documents/books/bk_data_mesh_excerpt.pdf" }
  - { label: "Unity Catalog documentation", url: "https://docs.databricks.com/en/data-governance/unity-catalog/index.html" }
  - { label: "dbt documentation: model contracts", url: "https://docs.getdbt.com/reference/resource-configs/contract" }
  - { label: "OpenLineage: object model", url: "https://openlineage.io/docs/spec/object-model/" }
  - { label: "Confluent Schema Registry: schema evolution and compatibility", url: "https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html" }
---

## Approach

Data mesh is a **socio-technical** design: an operating model as much as an architecture. Zhamak Dehghani, who introduced it, describes four principles: **domain-oriented ownership**, **data as a product**, a **self-serve data platform**, and **federated computational governance**. The principles depend on each other: domain ownership without a platform produces fifteen incompatible stacks, and data products without governance produce datasets nobody can join. Ask:

- **What problem are we solving?** A central bottleneck, poor domain understanding, slow delivery, or quality far from the source? If the company has three domains and a small data team, data mesh is probably not the answer.
- **Are domains willing and able to own data?** Do they have engineers, budget and leadership support?
- **What platform exists?** One lakehouse or warehouse, or many?
- **What must not break?** Finance close, regulatory reports, executive dashboards.
- **How is governance done today?** Central approval, or nothing?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Domains</strong> own source-aligned products (orders, payments, inventory events) built from their operational systems, and consumer-aligned products for their own analytics.</li>
<li><strong>Data product</strong>: output ports (tables, views, streams), a contract, documentation, quality checks, SLOs and an owner, all declared in a product descriptor in the domain's repository.</li>
<li><strong>Self-serve platform</strong>: templates and APIs that provision a product's storage space, pipelines, CI/CD, quality checks, lineage, monitoring and access control from the descriptor.</li>
<li><strong>Federated governance</strong>: a group of domain and platform representatives defines global standards (identifiers, formats, classifications, SLO definitions) as code, enforced in CI and the platform.</li>
<li><strong>Discovery and access</strong>: a central catalog lists every product with owner, contract, SLOs, quality and lineage; consumers request access, owners approve, grants apply automatically.</li>
<li><strong>Composite products</strong>: cross-domain products (Customer 360, finance reporting) are built from domain products by the domain that owns that business capability.</li>
</ol>
<figcaption>Domains build and own products; the platform makes building them easy; governance makes them interoperable and safe.</figcaption>
</figure>

The payments domain wants to publish settled payments. Its engineers copy the platform's data product template, fill in the descriptor (output tables, contract, SLO of "fresh by 03:00 UTC", PII tags, consumers' access groups) and push to Git. CI checks the descriptor against global policies: the `customer_id` column uses the global identifier type, card data is excluded, an owner and on-call rota exist. The platform provisions a payments schema, a dbt project skeleton, an orchestrated job, quality checks and lineage. Once the first run passes, the product appears in the catalog. The finance domain finds it, requests access, the payments owner approves, and finance builds its revenue reporting product on top of it.

## What a data product is

A table is data; a data product is data **plus the promises around it**:

- **Output ports**: the supported interfaces (a set of tables or views, a Kafka topic, an API), versioned.
- **Contract**: schema, semantics, keys, allowed values, freshness and quality guarantees.
- **Documentation**: purpose, definitions, known limitations, examples.
- **SLOs**: freshness, completeness, availability, with monitoring.
- **Owner**: a named team with an on-call or support channel.
- **Access policy**: who may use it and how, with classifications.
- **Lineage and cost**: where it comes from and what it costs to run.

<!-- noexec -->
```yaml
# data-products/payments/settled-payments/product.yaml
name: settled-payments
domain: payments
owner: team-payments-data
support: "#payments-data"
version: 2
output_ports:
  - type: table
    name: payments.settled_payments_v2
    contract: contracts/settled_payments_v2.yaml
  - type: topic
    name: payments.payment.settled.v2
slo:
  freshness: "03:00 UTC daily"
  completeness: ">= 99.9% of ledger rows"
classification:
  pii: [customer_id]
  excluded: [card_number, cvv]
access:
  default: request
  pre_approved_groups: [finance-analysts]
deprecates: { version: 1, sunset: "2027-03-31" }
```

Source-aligned products (close to an operational system) are usually owned by the domain that runs that system; aggregate or consumer-aligned products are owned by the domain that needs them, or by the domain that owns the business capability for cross-domain products.

## The self-serve platform

The platform's job is to make the right thing the easy thing:

- **Provisioning**: a domain-owned catalog, schema or project per product with storage, compute and permissions created from the descriptor.
- **Pipelines**: templates for batch (dbt plus orchestrator) and streaming (Kafka plus Flink or Spark), with CI/CD.
- **Quality and observability**: contract tests, freshness and volume monitors, SLO dashboards wired in by default.
- **Lineage and catalog registration** automatic on deploy.
- **Access**: request and approval workflows that apply grants, masking and row filters from classifications.
- **Cost**: per-product cost reporting from tags.

The platform team treats domains as customers: it measures time to first product, adoption of templates and support load.

## Federated computational governance

Governance decisions are made by a federated group (domain representatives, platform, security, legal) and **implemented as code** wherever possible:

- **Interoperability standards**: global identifiers (one customer id type, one product id), common date and currency formats, naming conventions, required metadata.
- **Policies as code**: classification-based masking, banned data (card numbers), retention, residency; checked in CI on descriptors and contracts, and enforced by the platform at runtime.
- **SLO definitions**: what "fresh" and "complete" mean, so SLOs are comparable across domains.
- **Lifecycle rules**: versioning and deprecation periods for breaking changes.

Centralise the **rules and the platform**; decentralise **ownership and delivery**.

## Interoperability across domains

- **Global identifiers** are the most important standard. A shared customer identity service (see the Customer 360 design) provides the id that every domain uses.
- **Shared reference data** (calendars, currencies, regions) is itself a data product owned by one domain.
- **Polysemes** (a customer means something different to marketing and to billing) are documented explicitly with mappings, rather than forced into one definition.
- **Contracts with versioning**: additive changes are free; breaking changes publish a new version alongside the old one with a sunset date.

## Migration strategy

1. Start with **two or three willing domains** with clear products and data skills, and a minimal platform.
2. Move existing central pipelines for those domains into domain ownership, keeping output tables stable (or providing compatibility views), so existing reports keep working.
3. Grow platform capabilities based on what the first domains needed.
4. Add domains in waves; the central data team splits into a platform team and embedded engineers who help domains get started.
5. Keep central ownership of a few cross-cutting products (finance reporting) until a domain can own them.

## Security and privacy

Classifications in product descriptors drive masking, row filters and access approvals platform-wide. Erasure requests use lineage across products to reach every copy. Domains cannot opt out of global policies; CI blocks a product that violates them.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Domains lack capacity | Products stale or unowned | Fund data roles in domains; platform templates reduce effort; product health scores |
| Every domain builds its own stack | Silos and duplicated cost | One platform with good enough defaults; governance on approved technologies |
| No global identifiers | Products cannot be joined | Identity standard and service before scaling out |
| Governance as a manual review board | Bottleneck reappears | Policies as code in CI; humans only for exceptions |
| Breaking changes without notice | Consumers break | Contracts, versioning, deprecation periods, consumer notifications from lineage |

## Scaling to 10×

From 150 to 1,500 products: catalog search and product health scores become the main discovery tools, platform templates cover more patterns (ML features, APIs), automated product scorecards (SLO compliance, documentation, usage, cost) drive retirement of unused products, and governance focuses on standards that maximise reuse.

## Monitoring and SLAs

- Per product: SLO compliance, quality check results, usage (consumers, queries), cost.
- Per domain: number of products, health scores, incidents.
- Platform: time to first product, template adoption, provisioning failures.
- Governance: policy violations caught in CI, exceptions granted.

## Capacity estimate

The constraint in a mesh is people and coordination rather than bytes:

- **Products**: 150 products across 15 domains ≈ 10 per domain. If a well-templated product needs about 0.3 of an engineer to run and evolve (assumption), each domain needs about 3 engineers' capacity for data, which matches the 2–6 engineers assumed.
- **Platform team**: serving 15 domains typically needs a dedicated team; size it by the capabilities offered (provisioning, pipelines, quality, catalog, access), not by data volume.
- **Contracts and checks**: 150 products × 20 checks ≈ 3,000 checks a day, well within a quality framework's capacity.
- **Data volume** is the same as before the mesh, but **copies** must be watched: if each consumer domain copies the products it uses, storage and compute multiply. Encourage reading shared products in place.

## What a strong answer includes

- The **four principles** and why they only work together.
- A concrete definition of a **data product** (ports, contract, SLOs, owner, access, docs).
- A **self-serve platform** that provisions products from descriptors.
- **Federated computational governance**: standards and policies as code, enforced in CI and at runtime.
- **Interoperability** through global identifiers and versioned contracts.
- An **incremental migration** plan that protects critical reporting.
- Honest discussion of **when data mesh is not appropriate**.

## Common mistakes

- Treating data mesh as a technology to buy.
- Decentralising ownership without a platform, producing many incompatible stacks.
- Renaming every table a "data product" without contracts, owners or SLOs.
- Recreating a central review board that becomes the new bottleneck.
- Skipping global identifiers and discovering later that products cannot be joined.
- A big-bang reorganisation that breaks finance reporting.
- Adopting a mesh in a small organisation where a single competent central team would be faster.
