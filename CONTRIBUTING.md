# Contributing to device-normalizer

Thanks for considering a contribution. This repo is part of the Peerbits
HealthTech Open Source initiative — small, focused, spec-grounded tools.

## Development setup

```bash
git clone https://github.com/{{GITHUB_ORG}}/device-normalizer.git
cd device-normalizer
npm install
npm test
```

## Making a change

1. Branch off `main`.
2. Write code and tests together.
3. `npm run lint && npm run typecheck && npm test` before opening a PR.
4. Open a PR using the PR template.

## What we will not merge

- Real patient data, real credentials, or client-identifying content.
- Scope creep from a focused component into a full product.
