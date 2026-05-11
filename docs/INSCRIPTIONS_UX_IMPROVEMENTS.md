# 📝 Inscriptions UX Improvement - Implementation Guide

## Overview

This document provides comprehensive recommendations and implementation details for improving the inscriptions user experience in the ContestSaas platform.

---

## 📋 Table of Contents

1. [Contest Status Checking](#1-contest-status-checking)
2. [UI States Based on Contest Status](#2-ui-states-based-on-contest-status)
3. [Custom Form Builder UX](#3-custom-form-builder-ux)
4. [Dynamic Form Rendering](#4-dynamic-form-rendering)
5. [Validation Error Display](#5-validation-error-display)
6. [Mobile Responsiveness](#6-mobile-responsiveness)
7. [Performance Considerations](#7-performance-considerations)
8. [Accessibility Guidelines](#8-accessibility-guidelines)
9. [Internationalization](#9-internationalization)
10. [Preview Mode](#10-preview-mode)

---

## 1. Contest Status Checking

### Strategy: Check at BOTH Page Load AND Form Submit

#### Why Both?
- **Page Load**: Provides immediate feedback, prevents user confusion
- **Form Submit**: Prevents race conditions, ensures data consistency

#### Implementation Locations

```typescript
// 1. Server-side (API endpoint)
// server/api/public/inscriptions/[token].get.ts
- Fetches contest status from database
- Returns status with contest data
- Fast, cached response

// 2. Client-side (Page component)
// app/pages/join/[token]/index.vue
- Uses statusConfig computed property
- Maps status to UI configuration
- Reactive updates

// 3. Server-side validation (RPC)
// supabase/migrations/0011_inscriptions.sql
- enroll_participant function validates status
- Prevents registration if closed
- Final safety net
```

#### Recommended Flow

```
User visits /join/[token]
         ↓
Server fetches contest status
         ↓
Client renders appropriate UI state
         ↓
User fills form (if allowed)
         ↓
User submits form
         ↓
Server validates status again (RPC)
         ↓
Success/Error response
```

---

## 2. UI States Based on Contest Status

### Status Configuration Object

```typescript
// types/inscription-form.ts
export const INSCRIPTION_STATUS_CONFIG: Record<ContestStatus, InscriptionStatusConfig> = {
  draft: {
    status: 'draft',
    registrationOpen: true,
    badgeVariant: 'default',
    badgeText: 'Inscripciones abiertas',
    badgeIcon: 'CheckCircle2',
    showForm: true,
    message: {
      title: 'Inscripciones abiertas',
      description: 'Completa el formulario para participar.'
    },
    allowPreview: true
  },
  active: {
    status: 'active',
    registrationOpen: false,
    badgeVariant: 'secondary',
    badgeText: 'Concurso en progreso',
    badgeIcon: 'Trophy',
    showForm: false,
    message: {
      title: 'Inscripciones cerradas',
      description: 'El concurso está en progreso.'
    },
    allowPreview: true
  },
  finished: {
    status: 'finished',
    registrationOpen: false,
    badgeVariant: 'outline',
    badgeText: 'Concurso finalizado',
    badgeIcon: 'Award',
    showForm: false,
    message: {
      title: 'Concurso finalizado',
      description: 'Consulta los resultados.'
    },
    allowPreview: true
  },
  cancelled: {
    status: 'cancelled',
    registrationOpen: false,
    badgeVariant: 'destructive',
    badgeText: 'Concurso cancelado',
    badgeIcon: 'CircleX',
    showForm: false,
    message: {
      title: 'Concurso cancelado',
      description: 'Cancelado por el organizador.'
    },
    allowPreview: true
  }
}
```

### Visual Design

| Status | Badge Color | Icon | Card Border | Message Tone |
|--------|-------------|------|-------------|--------------|
| Draft | Primary (blue) | CheckCircle | Primary | Welcoming |
| Active | Secondary (purple) | Trophy | Amber | Informative |
| Finished | Outline (gray) | Award | Muted | Neutral |
| Cancelled | Destructive (red) | CircleX | Destructive | Apologetic |

---

## 3. Custom Form Builder UX

### Recommended Features

#### ✅ Field Types to Support

```typescript
type FormFieldType =
  | 'text'          // Short text input
  | 'textarea'      // Long text area
  | 'number'        // Numeric input
  | 'email'         // Email with validation
  | 'phone'         // Phone number
  | 'date'          // Date picker
  | 'select'        // Dropdown selection
  | 'radio'         // Single choice radio
  | 'checkbox'      // Single checkbox
  | 'checkbox-group' // Multiple checkboxes
  | 'file'          // File upload
  | 'url'           // URL input
```

#### ✅ Field Configuration Options

1. **Basic Settings**
   - Label (required)
   - Description/help text
   - Placeholder text
   - Required/optional toggle
   - Field width (full/half/third)

2. **Validation Rules**
   - Required field toggle
   - Min/max length (text)
   - Min/max value (numbers)
   - Pattern/regex validation
   - Pre-built validators (email, phone, DNI, URL)

3. **Options (for select/radio/checkbox)**
   - Add/remove options
   - Option label and value
   - Allow "other" option
   - Default selection

4. **File Upload Settings**
   - Accepted file types (MIME)
   - Maximum file size
   - Maximum number of files

#### ✅ Field Management

- **Drag-and-drop reordering** (recommended: use `@vueuse/core` useDraggable)
- **Duplicate field** button
- **Hide/show field** toggle
- **Delete field** with confirmation
- **Field preview** in builder

### UI Layout Recommendation

```
┌─────────────────────────────────────────────────────────────┐
│  [Preview Toggle]  [Reset]              [Save Form]         │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  FIELD       │  FORM FIELDS LIST                            │
│  TYPES       │  ┌─────────────────────────────────────┐    │
│  ┌────┐      │  │ ≡ 📝 Nombre completo          [⋮]   │    │
│  │ 📝 │ Texto │  ├─────────────────────────────────────┤    │
│  └────┘      │  │ ≡ 📧 Email                    [⋮]   │    │
│  ┌────┐      │  ├─────────────────────────────────────┤    │
│  │ ¶ │ Área  │  │ ≡ 📅 Fecha nacimiento       [⋮]   │    │
│  └────┘      │  └─────────────────────────────────────┘    │
│  ┌────┐      │                                              │
│  │ # │ Número│  Click field to edit settings →             │
│  └────┘      │                                              │
│  ...         │                                              │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│  FIELD SETTINGS PANEL (modal or side panel)                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Label: [________________]  Required: [✓]            │   │
│  │ Description: [_________________________________]    │   │
│  │ Width: [Full ▼]                                     │   │
│  │                                                     │   │
│  │ Validation:                                         │   │
│  │ ☑ Required  Min: [__]  Max: [__]                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Dynamic Form Rendering

### Component Architecture

```
DynamicFormRenderer.vue
├── Props: fields, modelValue, disabled
├── Emits: update:modelValue, field-blur, field-change
├── Internal: Renders appropriate input based on field.type
└── Features:
    - Grid layout support (width property)
    - Conditional rendering by field type
    - Built-in validation display
    - Mobile-responsive design

useInscriptionForm composable
├── Manages form state
├── Handles validation logic
├── Provides field manipulation methods
└── Tracks completion percentage
```

### Rendering Logic by Field Type

```vue
<!-- Simplified example -->
<template>
  <div v-for="field in visibleFields" :key="field.id">
    <!-- Text/Email/URL -->
    <Input
      v-if="['text', 'email', 'url'].includes(field.type)"
      :type="field.type"
      v-model="responses[field.id]"
    />
    
    <!-- Textarea -->
    <Textarea
      v-else-if="field.type === 'textarea'"
      :rows="field.rows"
      v-model="responses[field.id]"
    />
    
    <!-- Number -->
    <Input
      v-else-if="field.type === 'number'"
      type="number"
      :step="field.step"
      v-model="responses[field.id]"
    />
    
    <!-- Select -->
    <Select v-else-if="field.type === 'select'" v-model="responses[field.id]">
      <SelectItem
        v-for="opt in field.options"
        :key="opt.value"
        :value="opt.value"
      >
        {{ opt.label }}
      </SelectItem>
    </Select>
    
    <!-- Checkbox Group -->
    <div v-else-if="field.type === 'checkbox-group'">
      <Checkbox
        v-for="opt in field.options"
        :key="opt.value"
        :checked="responses[field.id]?.includes(opt.value)"
        @update:checked="toggleOption(field.id, opt.value, $event)"
      />
    </div>
    
    <!-- File -->
    <Input
      v-else-if="field.type === 'file'"
      type="file"
      :accept="field.accept"
      @change="handleFileUpload(field.id, $event)"
    />
  </div>
</template>
```

### Schema Storage Format

```json
{
  "id": "schema_uuid",
  "contestId": "contest_uuid",
  "version": 1,
  "isPublished": true,
  "fields": [
    {
      "id": "field_1",
      "type": "text",
      "label": "Nombre artístico",
      "required": true,
      "order": 0,
      "width": "full",
      "validation": {
        "required": true,
        "minLength": 2,
        "maxLength": 50
      }
    },
    {
      "id": "field_2",
      "type": "select",
      "label": "Nivel de experiencia",
      "required": false,
      "order": 1,
      "options": [
        { "value": "beginner", "label": "Principiante" },
        { "value": "intermediate", "label": "Intermedio" },
        { "value": "advanced", "label": "Avanzado" }
      ]
    }
  ]
}
```

---

## 5. Validation Error Display

### Error Display Strategy

#### Inline Errors (Recommended)
```vue
<div class="space-y-1.5">
  <Label for="field">Email *</Label>
  <Input
    id="field"
    :class="{ 'border-destructive': errors[fieldId] }"
    @blur="validateField(fieldId)"
  />
  <p v-if="errors[fieldId]" class="text-xs text-destructive">
    {{ errors[fieldId] }}
  </p>
</div>
```

#### Error Types and Messages

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  required: 'Este campo es requerido',
  minLength: (min: number) => `Mínimo ${min} caracteres`,
  maxLength: (max: number) => `Máximo ${max} caracteres`,
  minValue: (min: number) => `Valor mínimo: ${min}`,
  maxValue: (max: number) => `Valor máximo: ${max}`,
  email: 'Email no válido',
  phone: 'Teléfono no válido',
  url: 'URL no válida',
  dni: 'DNI no válido',
  pattern: 'Formato no válido'
}
```

#### Validation Timing
- **On Blur**: Show error when user leaves field
- **On Change**: Clear error when user starts typing
- **On Submit**: Validate all fields, scroll to first error

#### Visual Feedback

```css
/* Valid state */
.input-valid {
  @apply border-emerald-500 focus:ring-emerald-500;
}

/* Invalid state */
.input-invalid {
  @apply border-destructive focus:ring-destructive;
}

/* Error message animation */
.error-message {
  @apply text-xs text-destructive mt-1 animate-in fade-in slide-in-from-top-1;
}
```

---

## 6. Mobile Responsiveness

### Breakpoint Strategy

```css
/* Mobile first approach */
.form-grid {
  @apply grid grid-cols-1 gap-4;  /* Mobile: single column */
  
  @screen sm {
    @apply grid-cols-2;  /* Small: 2 columns for short fields */
  }
  
  @screen lg {
    @apply grid-cols-3;  /* Large: 3 columns for compact fields */
  }
}
```

### Field Width Classes

```typescript
const WIDTH_CLASSES = {
  full: 'col-span-full',
  half: 'sm:col-span-1',
  third: 'sm:col-span-1 lg:col-span-1'
}
```

### Mobile-Specific Considerations

1. **Touch Targets**
   - Minimum 44x44px for buttons and inputs
   - Adequate spacing between interactive elements

2. **Input Types**
   - Use `type="email"` for email keyboard
   - Use `type="tel"` for phone keyboard
   - Use `type="number"` with appropriate inputmode

3. **Date Picker**
   - Native date input on mobile
   - Custom picker on desktop

4. **File Upload**
   - Show file size in KB/MB
   - Provide clear file type guidance
   - Allow camera capture for images

5. **Form Progress**
   - Show progress indicator for long forms
   - Consider multi-step for 10+ fields

### Responsive Layout Example

```vue
<template>
  <div class="grid gap-4">
    <!-- Full width on mobile, half on desktop -->
    <div class="col-span-full sm:col-span-1">
      <Label>Nombre</Label>
      <Input />
    </div>
    
    <!-- Stacked on mobile, side-by-side on desktop -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <Label>Fecha inicio</Label>
        <DatePicker />
      </div>
      <div>
        <Label>Fecha fin</Label>
        <DatePicker />
      </div>
    </div>
  </div>
</template>
```

---

## 7. Performance Considerations

### With Many Custom Fields

#### Optimization Strategies

1. **Virtual Scrolling** (for 50+ fields)
```typescript
import { useVirtualizer } from '@tanstack/vue-virtual'

const rowVirtualizer = useVirtualizer({
  count: fields.length,
  getScrollElement: () => formContainer.value,
  estimateSize: () => 80, // Average field height
  overscan: 3
})
```

2. **Lazy Validation**
```typescript
// Only validate visible fields
const validateVisibleFields = () => {
  return visibleFields.value.map(field => validateField(field.id))
}
```

3. **Debounced Auto-save**
```typescript
const debouncedSave = useDebounceFn(() => {
  saveFormSchema()
}, 1000)

watch(fields, () => {
  if (isDirty.value) debouncedSave()
}, { deep: true })
```

4. **Schema Caching**
```typescript
// Cache form schema in localStorage
const cachedSchema = localStorage.getItem(`form_schema_${contestId}`)
if (cachedSchema) {
  importSchema(JSON.parse(cachedSchema))
}
```

### Bundle Size Optimization

- Code-split form builder (only load for organizers)
- Lazy load date picker and other heavy components
- Tree-shake unused field types

---

## 8. Accessibility Guidelines

### WCAG 2.1 AA Compliance

#### Keyboard Navigation
```vue
<!-- All interactive elements must be focusable -->
<button 
  tabindex="0"
  @keydown.enter="handleAction"
  @keydown.space.prevent="handleAction"
>
  Action
</button>

<!-- Focus indicators -->
<style>
:focus-visible {
  @apply outline-2 outline-offset-2 outline-primary;
}
</style>
```

#### Screen Reader Support
```vue
<!-- ARIA labels -->
<div role="group" aria-labelledby="field-group-label">
  <h3 id="field-group-label">Información adicional</h3>
  <!-- fields -->
</div>

<!-- Error announcements -->
<div 
  v-if="errors[fieldId]"
  role="alert"
  aria-live="polite"
>
  {{ errors[fieldId] }}
</div>

<!-- Required field indicators -->
<Label :for="fieldId">
  {{ field.label }}
  <span v-if="field.required" aria-hidden="true">*</span>
  <span class="sr-only">(requerido)</span>
</Label>
```

#### Color Contrast
- Text: minimum 4.5:1 contrast ratio
- Large text: minimum 3:1 contrast ratio
- Don't rely on color alone (use icons + text)

#### Motion Preferences
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 9. Internationalization

### Field Label Translations

```typescript
interface FormField {
  label: string
  labelTranslations?: Record<string, string>  // { es: '...', en: '...', ca: '...' }
  description?: string
  descriptionTranslations?: Record<string, string>
}
```

### Implementation

```vue
<script setup>
const { locale } = useI18n()

const getLocalizedLabel = (field) => {
  return field.labelTranslations?.[locale.value] || field.label
}
</script>

<template>
  <Label>{{ getLocalizedLabel(field) }}</Label>
</template>
```

### Dynamic Messages

```typescript
// composables/useFormMessages.ts
export const useFormMessages = () => {
  const { t } = useI18n()
  
  return {
    required: () => t('form.validation.required'),
    minLength: (min: number) => t('form.validation.minLength', { min }),
    // ...
  }
}
```

---

## 10. Preview Mode

### For Organizers

```vue
<!-- Preview toggle in form builder -->
<Button
  variant="outline"
  @click="togglePreview"
>
  <Eye v-if="!isPreview" class="w-4 h-4 mr-2" />
  <EyeOff v-else class="w-4 h-4 mr-2" />
  {{ isPreview ? 'Editar' : 'Vista previa' }}
</Button>

<!-- Preview modal -->
<Dialog v-model:open="isPreview">
  <DialogContent class="max-w-4xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Vista previa del formulario</DialogTitle>
      <DialogDescription>
        Así verán los participantes el formulario de inscripción
      </DialogDescription>
    </DialogHeader>
    <DynamicFormRenderer :fields="fields" disabled />
  </DialogContent>
</Dialog>
```

### Preview Features

1. **Read-only mode**: Disable all inputs
2. **Full form view**: Show all fields including hidden (marked)
3. **Validation preview**: Show what errors would appear
4. **Mobile preview**: Toggle mobile/desktop view
5. **Share preview link**: Generate temporary preview URL

---

## 📁 File Structure

```
app/
├── components/
│   └── inscription/
│       ├── DynamicFormRenderer.vue    # Main form renderer
│       ├── FormBuilder.vue            # Builder UI for organizers
│       ├── FormField.vue              # Individual field component
│       └── FormPreview.vue            # Preview modal
├── composables/
│   └── useInscriptionForm.ts          # Form state management
├── pages/
│   └── join/[token]/
│       ├── index.vue                  # Updated inscription page
│       └── confirm.vue                # Payment confirmation
└── types/
    └── inscription-form.ts            # TypeScript types

server/
└── api/
    └── contests/[id]/
        ├── form-schema.get.ts         # Get schema
        ├── form-schema.post.ts        # Save schema
        └── form-schema.publish.post.ts # Publish schema

supabase/
└── migrations/
    └── 0032_inscription_form_builder.sql  # Database schema
```

---

## 🚀 Implementation Priority

### Phase 1 (Core Functionality)
1. ✅ Database schema migration
2. ✅ Contest status UI states
3. ✅ Basic form renderer
4. ✅ Validation system

### Phase 2 (Form Builder)
1. ✅ Form builder UI
2. ✅ Field configuration
3. ✅ Schema save/load
4. ✅ Publish workflow

### Phase 3 (Polish)
1. ⏳ Drag-and-drop reordering
2. ⏳ Preview mode
3. ⏳ Internationalization
4. ⏳ Advanced validation rules

### Phase 4 (Optimization)
1. ⏳ Performance optimization
2. ⏳ Accessibility audit
3. ⏳ Mobile testing
4. ⏳ Analytics integration

---

## 📊 Success Metrics

- **Form completion rate**: Target >80%
- **Time to complete**: Target <3 minutes
- **Validation errors**: Target <5% submission errors
- **Mobile conversion**: Target >60% of inscriptions
- **Accessibility score**: Target >95 (Lighthouse)

---

**Last Updated**: May 2026
**Author**: Frontend Developer Agent
**Status**: Phase 1 & 2 Complete
