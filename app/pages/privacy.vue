<script setup lang="ts">
definePageMeta({
  layout: 'auth',
})
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Política de Privacidad</h1>
      <p class="text-sm text-muted-foreground mt-1">Última actualización: Mayo 2026</p>
    </div>

    <div class="prose prose-sm prose-zinc dark:prose-invert max-w-none space-y-4">
      <h2>1. Responsable del tratamiento</h2>
      <p>
        ContestManager es el responsable del tratamiento de los datos personales que nos
        proporcionas al utilizar la plataforma.
      </p>

      <h2>2. Datos que recopilamos</h2>
      <ul>
        <li><strong>Datos de cuenta:</strong> email, nombre, teléfono</li>
        <li><strong>Datos de perfil:</strong> DNI/NIE/pasaporte, país, fecha de nacimiento</li>
        <li><strong>Datos de participación:</strong> inscripciones a concursos, puntuaciones</li>
        <li><strong>Datos de pago:</strong> procesados por Stripe (no almacenamos datos de tarjeta)</li>
      </ul>

      <h2>3. Finalidad del tratamiento</h2>
      <ul>
        <li>Gestión de cuentas y autenticación</li>
        <li>Procesamiento de inscripciones a concursos</li>
        <li>Facturación y cobro de cuotas de inscripción</li>
        <li>Comunicación de novedades y actualizaciones (solo con consentimiento)</li>
      </ul>

      <h2>4. Base legal</h2>
      <p>
        El tratamiento se basa en la ejecución del contrato de servicio, el consentimiento
        del usuario y el interés legítimo del responsable.
      </p>

      <h2>5. Conservación de datos</h2>
      <p>
        Los datos se conservan mientras la cuenta esté activa y durante los plazos legales
        posteriores a su cierre.
      </p>

      <h2>6. Derechos del usuario</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, supresión, portabilidad y
        limitación del tratamiento contactando con
        <a href="mailto:soporte@contestmanager.com">soporte@contestmanager.com</a>.
      </p>

      <h2>7. Terceros</h2>
      <p>
        Compartimos datos con:
      </p>
      <ul>
        <li><strong>Supabase:</strong> almacenamiento de base de datos y autenticación</li>
        <li><strong>Stripe:</strong> procesamiento de pagos</li>
      </ul>

      <h2>8. Seguridad</h2>
      <p>
        Implementamos medidas técnicas y organizativas apropiadas para proteger tus datos
        personales contra el tratamiento no autorizado o ilícito y su pérdida, destrucción
        o daño accidental.
      </p>

      <h2>9. Contacto</h2>
      <p>
        Para cualquier consulta sobre privacidad, contacta con
        <a href="mailto:soporte@contestmanager.com">soporte@contestmanager.com</a>.
      </p>
    </div>
  </div>
</template>
