<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { marked } from 'marked'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Bold, Italic,
  List, ListOrdered, Quote, Minus, Link2, Unlink2,
  Undo2, Redo2, Underline as UnderlineIcon, Strikethrough,
  Code, Square, AlignLeft, AlignCenter, AlignRight, AlignJustify,
} from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  minHeight?: string
}>(), {
  modelValue: '',
  placeholder: 'Escribe aquí...',
  minHeight: '220px',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// ── Bubble menu state ─────────────────────────────────────────────────────────
const showBubble = ref(false)
const bubbleTop = ref(0)
const bubbleLeft = ref(0)

function updateBubble(editor: ReturnType<typeof useEditor>['value']) {
  if (!editor) return
  const { state, view } = editor
  const { selection } = state
  if (selection.empty || !view.hasFocus()) {
    showBubble.value = false
    return
  }
  try {
    const { from, to } = selection
    const startCoords = view.coordsAtPos(from)
    const endCoords = view.coordsAtPos(Math.min(to, from + 80))
    bubbleTop.value = startCoords.top - 52
    bubbleLeft.value = (startCoords.left + endCoords.left) / 2
    showBubble.value = true
  } catch {
    showBubble.value = false
  }
}

// ── Editor ────────────────────────────────────────────────────────────────────
const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: props.placeholder }),
    Link.configure({ openOnClick: false }),
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ],
  editorProps: {
    handlePaste: (_view, event) => {
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (!text) return false
      const mdPattern = /^#{1,6}\s|\*\*|^[*-]\s|^\d+\.\s|^>\s/m
      if (!mdPattern.test(text)) return false
      const html = marked.parse(text) as string
      editor.value?.commands.insertContent(html)
      return true
    },
  },
  onUpdate: ({ editor }) => {
    const html = editor.getHTML()
    emit('update:modelValue', html === '<p></p>' ? '' : html)
  },
  onSelectionUpdate: ({ editor }) => updateBubble(editor),
  onBlur: () => { showBubble.value = false },
})

watch(() => props.modelValue, (val) => {
  if (!editor.value) return
  const current = editor.value.getHTML()
  if (current === val || (current === '<p></p>' && !val)) return
  editor.value.commands.setContent(val || '', false)
})

onBeforeUnmount(() => {
  showBubble.value = false
  editor.value?.destroy()
})

// ── Link helper ───────────────────────────────────────────────────────────────
function setLink() {
  const prev = editor.value?.getAttributes('link').href ?? ''
  const url = window.prompt('URL del enlace:', prev)
  if (url === null) return
  if (!url) {
    editor.value?.chain().focus().unsetLink().run()
    return
  }
  const href = url.startsWith('http') ? url : `https://${url}`
  editor.value?.chain().focus().setLink({ href }).run()
}

// ── Styling helpers ───────────────────────────────────────────────────────────
function btn(active: boolean) {
  return [
    'h-7 w-7 rounded flex-shrink-0',
    active
      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800',
  ]
}

function btnDisabled(disabled: boolean) {
  return [
    'h-7 w-7 rounded flex-shrink-0',
    'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800',
    disabled && 'opacity-30 pointer-events-none',
  ]
}

// ── Heading select ────────────────────────────────────────────────────────────
const currentHeading = computed<string>(() => {
  if (!editor.value) return 'p'
  for (const level of [1, 2, 3, 4] as const) {
    if (editor.value.isActive('heading', { level })) return String(level)
  }
  return 'p'
})

function setHeading(val: string) {
  if (!editor.value) return
  if (val === 'p') {
    editor.value.chain().focus().setParagraph().run()
  } else {
    editor.value.chain().focus().setHeading({ level: Number(val) as 1 | 2 | 3 | 4 }).run()
  }
}

function bubbleBtn(active: boolean) {
  return [
    'p-1 rounded',
    active
      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
      : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800',
  ]
}
</script>

<template>
  <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">

    <!-- ── Fixed toolbar ────────────────────────────────────────────────────── -->
    <div class="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">

      <!-- History -->
      <Button type="button" variant="ghost" size="icon" :class="btnDisabled(!editor?.can().undo())" title="Deshacer (Ctrl+Z)" @click="editor?.chain().focus().undo().run()">
        <Undo2 class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btnDisabled(!editor?.can().redo())" title="Rehacer (Ctrl+Shift+Z)" @click="editor?.chain().focus().redo().run()">
        <Redo2 class="w-3.5 h-3.5" />
      </Button>

      <Separator orientation="vertical" class="h-5 mx-1" />

      <!-- Heading select -->
      <select
        :value="currentHeading"
        class="h-7 rounded px-1.5 text-xs font-medium bg-transparent border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors"
        title="Formato de texto"
        @change="setHeading(($event.target as HTMLSelectElement).value)"
      >
        <option value="p">Párrafo</option>
        <option value="1">Título 1</option>
        <option value="2">Título 2</option>
        <option value="3">Título 3</option>
        <option value="4">Título 4</option>
      </select>

      <Separator orientation="vertical" class="h-5 mx-1" />

      <!-- Marks -->
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive('bold') ?? false)" title="Negrita (Ctrl+B)" @click="editor?.chain().focus().toggleBold().run()">
        <Bold class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive('italic') ?? false)" title="Cursiva (Ctrl+I)" @click="editor?.chain().focus().toggleItalic().run()">
        <Italic class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive('underline') ?? false)" title="Subrayado (Ctrl+U)" @click="editor?.chain().focus().toggleUnderline().run()">
        <UnderlineIcon class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive('strike') ?? false)" title="Tachado" @click="editor?.chain().focus().toggleStrike().run()">
        <Strikethrough class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive('code') ?? false)" title="Código en línea" @click="editor?.chain().focus().toggleCode().run()">
        <Code class="w-3.5 h-3.5" />
      </Button>

      <Separator orientation="vertical" class="h-5 mx-1" />

      <!-- Lists -->
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive('bulletList') ?? false)" title="Lista con viñetas" @click="editor?.chain().focus().toggleBulletList().run()">
        <List class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive('orderedList') ?? false)" title="Lista numerada" @click="editor?.chain().focus().toggleOrderedList().run()">
        <ListOrdered class="w-3.5 h-3.5" />
      </Button>

      <Separator orientation="vertical" class="h-5 mx-1" />

      <!-- Blocks -->
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive('blockquote') ?? false)" title="Cita" @click="editor?.chain().focus().toggleBlockquote().run()">
        <Quote class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive('codeBlock') ?? false)" title="Bloque de código" @click="editor?.chain().focus().toggleCodeBlock().run()">
        <Square class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btn(false)" title="Separador horizontal" @click="editor?.chain().focus().setHorizontalRule().run()">
        <Minus class="w-3.5 h-3.5" />
      </Button>

      <Separator orientation="vertical" class="h-5 mx-1" />

      <!-- Text align -->
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive({ textAlign: 'left' }) ?? false)" title="Alinear izquierda" @click="editor?.chain().focus().setTextAlign('left').run()">
        <AlignLeft class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive({ textAlign: 'center' }) ?? false)" title="Centrar" @click="editor?.chain().focus().setTextAlign('center').run()">
        <AlignCenter class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive({ textAlign: 'right' }) ?? false)" title="Alinear derecha" @click="editor?.chain().focus().setTextAlign('right').run()">
        <AlignRight class="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive({ textAlign: 'justify' }) ?? false)" title="Justificar" @click="editor?.chain().focus().setTextAlign('justify').run()">
        <AlignJustify class="w-3.5 h-3.5" />
      </Button>

      <Separator orientation="vertical" class="h-5 mx-1" />

      <!-- Link -->
      <Button type="button" variant="ghost" size="icon" :class="btn(editor?.isActive('link') ?? false)" title="Añadir enlace" @click="setLink">
        <Link2 class="w-3.5 h-3.5" />
      </Button>
      <Button v-if="editor?.isActive('link')" type="button" variant="ghost" size="icon" :class="btn(false)" title="Quitar enlace" @click="editor?.chain().focus().unsetLink().run()">
        <Unlink2 class="w-3.5 h-3.5" />
      </Button>
    </div>

    <!-- ── Content area ─────────────────────────────────────────────────────── -->
    <div
      class="rich-content px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 cursor-text"
      :style="{ minHeight }"
      @click="editor?.commands.focus()"
    >
      <EditorContent :editor="editor" />
    </div>
  </div>

  <!-- ── Bubble menu (teleported to body to avoid overflow clipping) ────────── -->
  <Teleport to="body">
    <Transition name="bubble">
      <div
        v-if="showBubble"
        class="fixed z-[9999] flex items-center gap-0.5 px-1.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg pointer-events-auto"
        :style="{ top: `${bubbleTop}px`, left: `${bubbleLeft}px`, transform: 'translateX(-50%)' }"
      >
        <button type="button" :class="bubbleBtn(editor?.isActive('bold') ?? false)" title="Negrita" @mousedown.prevent @click="editor?.chain().focus().toggleBold().run()">
          <Bold class="w-3.5 h-3.5" />
        </button>
        <button type="button" :class="bubbleBtn(editor?.isActive('italic') ?? false)" title="Cursiva" @mousedown.prevent @click="editor?.chain().focus().toggleItalic().run()">
          <Italic class="w-3.5 h-3.5" />
        </button>
        <button type="button" :class="bubbleBtn(editor?.isActive('underline') ?? false)" title="Subrayado" @mousedown.prevent @click="editor?.chain().focus().toggleUnderline().run()">
          <UnderlineIcon class="w-3.5 h-3.5" />
        </button>
        <button type="button" :class="bubbleBtn(editor?.isActive('strike') ?? false)" title="Tachado" @mousedown.prevent @click="editor?.chain().focus().toggleStrike().run()">
          <Strikethrough class="w-3.5 h-3.5" />
        </button>
        <button type="button" :class="bubbleBtn(editor?.isActive('code') ?? false)" title="Código" @mousedown.prevent @click="editor?.chain().focus().toggleCode().run()">
          <Code class="w-3.5 h-3.5" />
        </button>
        <div class="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5 flex-shrink-0" />
        <button type="button" :class="bubbleBtn(editor?.isActive('link') ?? false)" title="Enlace" @mousedown.prevent @click="setLink">
          <Link2 class="w-3.5 h-3.5" />
        </button>
        <button v-if="editor?.isActive('link')" type="button" :class="bubbleBtn(false)" title="Quitar enlace" @mousedown.prevent @click="editor?.chain().focus().unsetLink().run()">
          <Unlink2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.bubble-enter-active,
.bubble-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}
</style>
