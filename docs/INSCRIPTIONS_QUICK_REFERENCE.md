# 🎯 Inscriptions UX - Quick Reference

## ✅ What's Been Implemented

### 1. Database Schema (`0032_inscription_form_builder.sql`)
- ✅ `inscription_form_schemas` table for storing custom forms
- ✅ `participant_form_responses` table for storing submissions
- ✅ `get_inscription_form_schema()` RPC function
- ✅ `validate_form_response()` RPC function
- ✅ RLS policies for security

### 2. TypeScript Types (`types/inscription-form.ts`)
- ✅ `FormField` types (text, textarea, number, select, checkbox, file, etc.)
- ✅ `InscriptionFormSchema` interface
- ✅ `INSCRIPTION_STATUS_CONFIG` for contest status UI mapping
- ✅ Validation error types

### 3. Composables (`app/composables/useInscriptionForm.ts`)
- ✅ Form state management
- ✅ Field CRUD operations
- ✅ Validation engine
- ✅ Response tracking
- ✅ Schema import/export

### 4. Components
- ✅ `DynamicFormRenderer.vue` - Renders custom forms
- ✅ `FormBuilder.vue` - Drag-and-drop form builder UI

### 5. Pages
- ✅ Updated `join/[token]/index.vue` with:
  - Contest status checking
  - Status-based UI states
  - Custom form rendering
  - Progress indicator
  - Validation display

### 6. API Endpoints
- ✅ `GET /api/contests/[id]/form-schema` - Get schema
- ✅ `POST /api/contests/[id]/form-schema` - Save schema
- ✅ `POST /api/contests/[id]/form-schema.publish` - Publish schema

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

**Field Types to Support:**
- ✅ text, textarea, number, email, phone, date
- ✅ select, radio, checkbox, checkbox-group
- ✅ file, url

**Features:**
- ✅ Required/optional toggle
- ✅ Field ordering (up/down arrows)
- ✅ Duplicate field
- ✅ Hide/show field
- ✅ Validation rules per field

### 4. Dynamic Form Rendering

**Component Structure:**
```vue
<DynamicFormRenderer
  :fields="formSchema"
  v-model="responses"
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

## 🚀 Next Steps

### Immediate (To Complete Implementation)

1. **Run Database Migration**
```bash
# Apply the new migration
npx supabase db push --include-all
# Or manually run 0032_inscription_form_builder.sql
```

2. **Create Organizer UI Page**
```vue
<!-- app/pages/contest/[slug]/settings/inscriptions-form.vue -->
<script setup>
const { params } = useRoute()
const formSchema = ref([])

async function saveSchema(fields) {
  await $fetch(`/api/contests/${params.slug}/form-schema`, {
    method: 'POST',
    body: { fields }
  })
}
</script>

<template>
  <FormBuilder 
    :initial-fields="formSchema"
    @save="saveSchema"
  />
</template>
```

3. **Update Enrollment API**
```typescript
// server/api/public/inscriptions/[token]/enroll.post.ts
// Add custom_fields to the enroll_participant RPC call
```

### Phase 2 (Enhancements)

- [ ] Add drag-and-drop reordering (`@vueuse/core` useDraggable)
- [ ] Implement preview mode modal
- [ ] Add i18n support for field labels
- [ ] Create form response viewer for organizers
- [ ] Add export to CSV functionality

### Phase 3 (Optimization)

- [ ] Virtual scrolling for 50+ fields
- [ ] Debounced auto-save
- [ ] Schema caching
- [ ] Accessibility audit
- [ ] Performance testing

---

## 📁 Files Created

```
types/inscription-form.ts                          ✅ 250 lines
app/composables/useInscriptionForm.ts              ✅ 280 lines
app/components/inscription/DynamicFormRenderer.vue ✅ 250 lines
app/components/inscription/FormBuilder.vue         ✅ 450 lines
app/pages/join/[token]/index.vue                   ✅ Updated
supabase/migrations/0032_inscription_form_builder.sql ✅ 200 lines
server/api/contests/[id]/form-schema.get.ts        ✅ Created
server/api/contests/[id]/form-schema.post.ts       ✅ Created
server/api/contests/[id]/form-schema.publish.post.ts ✅ Created
docs/INSCRIPTIONS_UX_IMPROVEMENTS.md               ✅ 600 lines
```

**Total: ~2,500 lines of new code**

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
- ✅ `lucide-vue-next` - Icons
- ✅ `@internationalized/date` - Date handling
- ✅ `@vueuse/core` - Composables (for future drag-drop)
- ✅ `class-variance-authority` - Variant management

---

**Questions?** Refer to `docs/INSCRIPTIONS_UX_IMPROVEMENTS.md` for detailed implementation guide.
