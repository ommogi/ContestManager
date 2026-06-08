import { defineConfig } from 'vitepress'
import { loadEnv } from 'vite'

// Lee SUPABASE_URL y SUPABASE_ANON_KEY del .env del proyecto
const env = loadEnv('', process.cwd(), '')

export default defineConfig({
  title: 'ContestSaaS Docs',
  description: 'Documentación técnica: API, base de datos y frontend',
  lang: 'es',
  themeConfig: {
    nav: [
      { text: 'API', link: '/api' },
      { text: 'Playground', link: '/playground' },
      { text: 'Database', link: '/database' },
      { text: 'Frontend', link: '/frontend' },
    ],
    sidebar: [
      { text: 'Inicio', link: '/' },
      {
        text: 'Referencia',
        items: [
          { text: 'API Reference', link: '/api' },
          { text: 'Base de datos', link: '/database' },
          { text: 'Frontend', link: '/frontend' },
        ],
      },
      {
        text: 'Guías',
        items: [
          { text: 'Inscripciones — UX', link: '/INSCRIPTIONS_UX_IMPROVEMENTS' },
          { text: 'Inscripciones — Quick Ref', link: '/INSCRIPTIONS_QUICK_REFERENCE' },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [],
    outline: { level: [2, 3] },
  },
  vite: {
    define: {
      __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL || ''),
      __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY || ''),
    },
  },
})
