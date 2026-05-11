<script setup lang="ts">
definePageMeta({
  layout: 'auth',
})
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Términos de Servicio</h1>
      <p class="text-sm text-muted-foreground mt-1">Última actualización: Mayo 2026</p>
    </div>

    <div class="prose prose-sm prose-zinc dark:prose-invert max-w-none space-y-4">
      <h2>1. Descripción del servicio</h2>
      <p>
        ContestManager es una plataforma de gestión de concursos y competiciones que permite a
        organizadores crear, gestionar y evaluar concursos, y a participantes inscribirse y competir.
      </p>

      <h2>2. Cuentas de usuario</h2>
      <p>
        Para utilizar la plataforma necesitas crear una cuenta proporcionando información veraz.
        Eres responsable de mantener la confidencialidad de tus credenciales y de toda actividad
        que ocurra bajo tu cuenta.
      </p>

      <h2>3. Uso aceptable</h2>
      <p>
        No está permitido usar la plataforma para:
      </p>
      <ul>
        <li>Actividades ilegales o fraudulentas</li>
        <li>Subir contenido malicioso o dañino</li>
        <li>Acceder a datos de otros usuarios sin autorización</li>
        <li>Interferir con el funcionamiento del servicio</li>
      </ul>

      <h2>4. Pagos y facturación</h2>
      <p>
        ContestManager opera con un modelo de pago por uso basado en tickets y activaciones.
        Los pagos se procesan a través de Stripe. No hay reembolsos salvo que se indique
        expresamente o lo requiera la ley aplicable.
      </p>

      <h2>5. Propiedad intelectual</h2>
      <p>
        El contenido creado por los organizadores (descripciones, reglamentos, categorías) les
        pertenece. La plataforma y su código son propiedad de ContestManager.
      </p>

      <h2>6. Limitación de responsabilidad</h2>
      <p>
        ContestManager se proporciona "tal cual". No garantizamos disponibilidad ininterrumpida
        del servicio ni nos hacemos responsables de daños indirectos derivados de su uso.
      </p>

      <h2>7. Modificaciones</h2>
      <p>
        Nos reservamos el derecho de modificar estos términos. Los cambios entrarán en vigor
        tras su publicación en la plataforma.
      </p>

      <h2>8. Contacto</h2>
      <p>
        Para cualquier consulta sobre estos términos, contacta con
        <a href="mailto:soporte@contestmanager.com">soporte@contestmanager.com</a>.
      </p>
    </div>
  </div>
</template>
