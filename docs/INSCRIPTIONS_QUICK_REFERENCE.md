# 🎯 Inscriptions UX - Quick Reference

## Estado real

Esta página describía como terminado un constructor de formularios que nunca
llegó a montarse en ninguna ruta. Lo de abajo separa lo que existe y está
cableado de lo que todavía no, y enlaza la issue que cierra cada hueco. Si
añades una pieza, mueve la fila — no marques nada como hecho antes de tiempo.

### Cableado

| Pieza | Fichero | Notas |
|--|--|--|
| Contrato de tipos | `shared/inscription-form.ts` | Fuente única. `app/types/inscription-form.ts` lo reexporta y añade lo que solo usa la UI, así que `~/types/inscription-form` sigue valiendo. `server/` importa el de `shared/`. |
| Migración | `supabase/migrations/0033_inscription_form_builder.sql` | Tablas `inscription_form_schemas` y `participant_form_responses`, RPCs `get_inscription_form_schema()` y `validate_form_response()`, políticas RLS. |
| Composable | `app/composables/useInscriptionForm.ts` | Estado de campos, CRUD, motor de validación, import/export de schema. |
| Renderer | `app/components/inscription/DynamicFormRenderer.vue` | Pinta un `FormField[]`. Acepta `errors` por `field.id` y los cablea a `aria-invalid`/`aria-describedby`. |
| Constructor | `app/components/inscription/FormBuilder.vue` | Paleta de tipos, configuración por campo, reordenado por arrastre nativo **y** por botones ↑/↓ (KAN-50). |
| Pestaña de organizador | `app/components/inscription/InscriptionFormTab.vue` | Carga, guarda y publica. Montada en `app/pages/contests/[slug]/inscriptions.vue`, pestaña «Formulario» (KAN-41). |
| Endpoints de organizador | `server/api/contests/[id]/form-schema.{get,post,publish}.post.ts` | Cerrados con `requireOrgOwnerOrMember`. |

### Sin cablear

| Hueco | Issue |
|--|--|
| El formulario público de `app/pages/join/[token]/index.vue` sigue con los campos fijos: no renderiza el schema. | KAN-45 |
| No hay endpoint público que sirva el schema publicado a la página de inscripción. | KAN-45 |
| Las respuestas del participante no se guardan en `participant_form_responses`. | KAN-45 |
| El tipo de campo `file` está deshabilitado en la paleta: no hay subida ni almacenamiento. | KAN-59 |

---

## 📋 Quick Answers to Your Questions

### 1. Where to check contest status?

**Answer: BOTH page load AND form submit**

```typescript
// Page load (client-side)
const statusConfig = computed(() => 
  INSCRIPTION_STATUS_CONFIG[contest.value?.status]
)

// Form submit (server-side - in RPC)
-- Already validated in enroll_participant function
IF NOT v_reg_open THEN
  RAISE EXCEPTION 'registration_closed';
END IF;
```

### 2. UI States by Contest Status

| Status | Badge | Show Form? | Message |
|--------|-------|------------|---------|
| `draft` | ✅ "Inscripciones abiertas" | Yes | "Completa el formulario" |
| `active` | 🟣 "Concurso en progreso" | No | "Inscripciones cerradas" |
| `finished` | ⚪ "Concurso finalizado" | No | "Consulta resultados" |
| `cancelled` | ❌ "Concurso cancelado" | No | "Cancelado por organizador" |

### 3. Custom Form Builder UX

**Recommended: Click-to-add + Settings Panel** (not drag-and-drop initially)

```
Field Types (left panel):
┌─────────────┐
│ 📝 Texto    │
│ ¶ Área      │
│ # Número    │
│ 📧 Email    │
│ 📞 Teléfono │
│ 📅 Fecha    │
│ ⌄ Desplegable│
│ ○ Opción    │
│ ☑ Casilla   │
│ 📎 Archivo  │
└─────────────┘

Fields List (center):
┌──────────────────────────┐
│ ≡ Nombre completo   [⋮] │
│ ≡ Email             [⋮] │
│ ≡ Teléfono          [⋮] │
└──────────────────────────┘

Settings (modal on click):
- Label, Description
- Required toggle
- Validation rules
- Width (full/half/third)
```

**Field Types:**
- Disponibles: text, textarea, number, email, phone, date, select, radio,
  checkbox, checkbox-group, url
- Deshabilitado en la paleta: `file` — el tipo existe en el contrato y el
  constructor sabe configurarlo, pero no hay subida ni almacenamiento hasta
  KAN-59, así que ofrecerlo guardaría un campo que no recoge nada.

**Features:**
- Required/optional toggle
- Reordenado por arrastre (HTML Drag and Drop nativo) y por botones ↑/↓;
  los botones son la ruta accesible y los movimientos se anuncian por
  `aria-live`
- Duplicate field
- Hide/show field
- Validation rules per field

### 4. Dynamic Form Rendering

**Component Structure:**
```vue
<DynamicFormRenderer
  v-model="responses"
  :fields="formSchema"
  :errors="errors"
  @field-blur="validateField"
/>
```

**Grid Layout:**
```typescript
// Field width options
width: 'full'   // col-span-full
width: 'half'   // sm:col-span-1
width: 'third'  // sm:col-span-1 lg:col-span-1
```

### 5. Validation Error Display

**Inline errors with real-time feedback:**
```vue
<div class="space-y-1.5">
  <Label>Email *</Label>
  <Input 
    :class="{ 'border-destructive': errors.email }"
    @blur="validateField('email')"
  />
  <p v-if="errors.email" class="text-xs text-destructive">
    {{ errors.email }}
  </p>
</div>
```

**Error Types:**
- `required` - "Este campo es requerido"
- `minLength` - "Mínimo X caracteres"
- `maxLength` - "Máximo X caracteres"
- `minValue` / `maxValue` - Range errors
- `email`, `phone`, `url`, `dni` - Format errors

### 6. Mobile Responsiveness

**Key Considerations:**
```css
/* Mobile-first grid */
.grid {
  @apply grid grid-cols-1 gap-4;
  @screen sm { grid-cols-2; }
  @screen lg { grid-cols-3; }
}

/* Touch targets */
button, input {
  @apply min-h-[44px];
}

/* Input types for mobile keyboards */
<input type="email">    <!-- @ keyboard -->
<input type="tel">      <!-- phone keyboard -->
<input type="number">   <!-- numeric keyboard -->
```

---

## Pendiente

### KAN-45 — formulario público dinámico

1. Endpoint público que devuelva el schema publicado del concurso
   (`PublishedFormSchema` del contrato: `id`, `version`, `publishedAt`,
   `fields`). Un concurso sin formulario publicado responde con nulos y un
   array vacío: es un estado normal, no un error.
2. `app/pages/join/[token]/index.vue` monta `DynamicFormRenderer` con esos
   campos y le pasa `errors` por `field.id`.
3. `server/api/public/inscriptions/[token]/` guarda las respuestas en
   `participant_form_responses`, con `form_schema_id` apuntando al schema
   que el participante vio.

### KAN-59 — campos de archivo

Subida a Storage y persistencia de `FormFileReference`. Hasta entonces el
tipo `file` está deshabilitado en la paleta del constructor.

### Más adelante

- [ ] i18n de etiquetas de campo (`labelTranslations` ya está en el contrato).
- [ ] Visor de respuestas para el organizador y exportación a CSV.
- [ ] Auto-guardado con debounce en el constructor.
- [ ] Virtualizar la lista de campos si un formulario pasa de ~50.

---

## Semántica de versiones (importante)

`form-schema.post` **no actualiza: inserta una versión nueva**
(`newVersion = (actual?.version || 0) + 1`). `form-schema.publish` publica
siempre **la de versión más alta**. Publicar sin guardar antes publicaría una
versión antigua, así que la UI bloquea la acción mientras haya cambios sin
guardar. `form-schema.get` devuelve la versión más alta sea borrador o
publicada; el estado se lee de `is_published`, no de que exista la fila.

---

## Mapa de ficheros

```
shared/inscription-form.ts                            contrato (fuente única)
app/types/inscription-form.ts                         reexport + tipos de UI
app/composables/useInscriptionForm.ts                 estado y validación
app/components/inscription/DynamicFormRenderer.vue    render de campos
app/components/inscription/FormBuilder.vue            constructor
app/components/inscription/InscriptionFormTab.vue     pestaña de organizador
app/pages/contests/[slug]/inscriptions.vue            monta la pestaña
server/api/contests/[id]/form-schema.get.ts
server/api/contests/[id]/form-schema.post.ts
server/api/contests/[id]/form-schema.publish.post.ts
supabase/migrations/0033_inscription_form_builder.sql
docs/INSCRIPTIONS_UX_IMPROVEMENTS.md                  guía larga
```

---

## 🎨 Design Tokens Used

```typescript
// Colors (from Tailwind)
primary: 'bg-primary text-primary-foreground'
secondary: 'bg-secondary text-secondary-foreground'
destructive: 'bg-destructive text-destructive-foreground'
muted: 'bg-muted text-muted-foreground'

// Spacing
gap-2, gap-3, gap-4, gap-6
p-3, p-4, p-6, py-8, py-12

// Typography
text-xs, text-sm, text-base, text-lg, text-xl
font-normal, font-medium, font-semibold, font-bold

// Effects
shadow-lg, rounded-lg, border, transition-colors
```

---

## 🔧 Dependencies

Already installed (no new packages needed):
- `lucide-vue-next` - Icons
- `@internationalized/date` - Date handling
- `@vueuse/core` - Composables. No se usa para reordenar: `useDraggable`
  arrastra un elemento por posición absoluta, no reordena listas. El
  constructor usa la HTML Drag and Drop API nativa.
- `class-variance-authority` - Variant management

---

**Questions?** Refer to `docs/INSCRIPTIONS_UX_IMPROVEMENTS.md` for detailed implementation guide.
