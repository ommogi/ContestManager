<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Info } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useContestStore } from '@/stores/contest'
import { toast } from 'vue-sonner'

const store = useContestStore()
const isOpen = ref(false)
const isSubmitting = ref(false)

const form = ref({
  name: '',
  description: '',
  min_age: '' as string | number,
  max_age: '' as string | number,
  max_participants: '' as string | number,
})

const handleCreate = async () => {
  if (!form.value.name.trim()) return
  
  isSubmitting.value = true
  try {
    // We update the store call to handle the new payload if it supports it, 
    // or we'll just use $fetch directly if the store action is too simple.
    // Based on the store, createCategory only takes a name. Let's fix that.
    const toInt = (v: string | number) => {
      const n = typeof v === 'string' ? parseInt(v, 10) : v
      return Number.isFinite(n) ? n : null
    }
    await store.createCategory(form.value.name, {
      description: form.value.description,
      min_age: toInt(form.value.min_age) as any,
      max_age: toInt(form.value.max_age) as any,
      max_participants: toInt(form.value.max_participants) as any,
    })

    toast.success('Categoría creada correctamente')
    form.value = { name: '', description: '', min_age: '', max_age: '', max_participants: '' }
    isOpen.value = false
  } catch (error) {
    toast.error('Error al crear la categoría')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogTrigger as-child>
      <Button 
        variant="outline" 
        size="sm" 
        class="gap-2 bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-950/50 dark:text-zinc-400 dark:border-zinc-500/30 hover:bg-zinc-100 dark:hover:bg-zinc-900 font-bold border-2 rounded-md transition-all uppercase tracking-tighter text-[10px] px-6 shadow-sm"
      >
        <Plus class="w-4 h-4" />
        Añadir Categoría
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Nueva Categoría</DialogTitle>
        <DialogDescription>
          Configura una nueva división para tu concurso.
        </DialogDescription>
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <Label for="name">Nombre</Label>
          <Input
            id="name"
            v-model="form.name"
            placeholder="Ej. Solistas Junior"
          />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div class="grid gap-2">
            <Label for="min_age">Edad mín.</Label>
            <Input id="min_age" v-model="form.min_age" type="number" min="0" placeholder="—" />
          </div>
          <div class="grid gap-2">
            <Label for="max_age">Edad máx.</Label>
            <Input id="max_age" v-model="form.max_age" type="number" min="0" placeholder="—" />
          </div>
          <div class="grid gap-2">
            <Label for="max_participants">Cupo</Label>
            <Input id="max_participants" v-model="form.max_participants" type="number" min="1" placeholder="∞" />
          </div>
        </div>
        <div class="grid gap-2">
          <Label for="desc">Descripción Corta</Label>
          <Textarea
            id="desc"
            v-model="form.description"
            placeholder="Breve detalle de la categoría..."
            rows="2"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="isOpen = false">
          Cancelar
        </Button>
        <Button 
          class="bg-primary text-primary-foreground hover:bg-primary/90" 
          :disabled="!form.name.trim() || isSubmitting"
          @click="handleCreate"
        >
          {{ isSubmitting ? 'Creando...' : 'Crear Categoría' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
