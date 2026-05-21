---
layout: home

hero:
  name: ContestSaaS
  text: Documentación técnica
  tagline: Referencia completa de API, base de datos y arquitectura frontend
  actions:
    - theme: brand
      text: API Reference
      link: /api
    - theme: alt
      text: Base de datos
      link: /database
    - theme: alt
      text: Frontend
      link: /frontend

features:
  - title: API — 75 endpoints
    details: Auth, billing, contests, participants, scores, public. Zod validation en todos los POST/PATCH. Rate limiting por usuario.
  - title: Base de datos
    details: 22 tablas, 29 RPCs, RLS policies completas. Flujos de enrollment free/paid/CSV y modelo de billing con tickets + activaciones.
  - title: Frontend
    details: 12 Pinia stores, 7 composables, árbol de rutas completo. Nuxt 4 + Vue 3 + shadcn-vue + Tailwind v4.
---
