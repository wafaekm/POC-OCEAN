# POC – Geo Digital Twin Littoral

## Project Overview

This repository contains the implementation of a **Proof of Concept (POC)** for a **coastal digital twin platform**.

The objective of this POC is to demonstrate how heterogeneous environmental and geospatial data (satellite, oceanographic, terrain and infrastructure data) can be integrated into a unified platform to support **coastal risk analysis and decision making**.

The platform aims to provide:

- integration of multi-source geospatial datasets
- simplified coastal flooding simulations
- interactive visualization in **2D and 3D**

---

## Architecture (POC Scope)

The POC architecture is composed of several main components:

- **Data ingestion layer**: ETL pipelines integrating multiple geospatial datasets
- **Processing layer**: simplified hydrodynamic modelling and vulnerability scoring
- **API layer**: services exposing processed data and simulation results
- **Visualization layer**: interactive web interface (2D and 3D geospatial viewers)

---

## Development Workflow

To ensure collaborative development and maintain code quality, the following workflow is used.

### Branch Strategy

Each change must be developed in a dedicated branch.

Branch naming convention:

| Type | Prefix | Example |
|-----|------|------|
| New feature | `feature/` | `feature/sig-viewer` |
| Bug fix | `fix/` | `fix/map-layer-loading` |
| Maintenance | `chore/` | `chore/add-ci-workflow` |
| Documentation | `docs/` | `docs/update-readme` |

Branches should always be created from `main`.

---

### Pull Requests

Changes must be integrated through **Pull Requests**.

Before merging:

- a Pull Request must be created
- at least **one review** is recommended
- the CI pipeline must pass successfully

Pull Requests should include:

- a clear title
- a description of the changes
- instructions on how to test the changes (if relevant)

---

## Coding Best Practices

To maintain readability and consistency across the project:

- Code and documentation should be written **in English**
- Use **clear and descriptive naming**
- Prefer **small and frequent commits**
- Keep functions and components **modular and readable**
- Avoid unnecessary complexity

Comments should be added when necessary to clarify non-obvious logic.

---

## Continuous Integration

A lightweight **CI pipeline** has been set up using **GitHub Actions**.

The CI workflow currently performs basic checks on Pull Requests and pushes to the `main` branch.

Current CI goals:

- validate repository structure
- prepare the project for future automated checks
- ensure safe integration of changes

The CI pipeline will be extended as the project evolves to include:

- linting
- build validation
- automated tests

---

## Project Status

This repository currently hosts the initial setup of the POC.

Upcoming development includes:

- frontend initialization (Vue.js + geospatial viewers)
- integration of MapLibre for 2D visualization
- integration of Cesium / iTowns for 3D visualization
- ETL pipelines for geospatial datasets
- simplified coastal flooding simulation models
---

## License

This project is currently developed as an internal proof of concept.