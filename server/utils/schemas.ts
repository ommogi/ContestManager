import { z } from 'zod'

// ─── Primitives ──────────────────────────────────────────────────────────────

export const uuidString = z.string().uuid()
export const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
export const emailString = z.string().email()
export const phoneString = z.string().regex(/^\+\d{7,15}$/).nullable().optional()
export const dniString = z.string().min(8).max(20).nullable().optional()

// ─── Domain schemas ──────────────────────────────────────────────────────────

/** Shared by free enroll and paid checkout public flows */
export const EnrollBodySchema = z.object({
  category_id: uuidString,
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  birthdate: isoDateString,
  dni: dniString,
  country: z.string().min(2).max(100).nullable().optional(),
  email: emailString.nullable().optional(),
  phone: phoneString,
})

export const ScoreBodySchema = z.object({
  round_id: uuidString,
  participant_id: uuidString,
  judge_id: uuidString,
  value: z.number(),
  notes: z.string().max(1000).nullable().optional(),
  promote: z.boolean().optional().default(false),
})

export const CheckoutPlanSchema = z.object({
  plan: z.enum(['starter', 'pro', 'enterprise']),
})

const returnPathField = z
  .string()
  .refine(v => v.startsWith('/') && !v.startsWith('//'), 'Must be an internal path starting with /')
  .optional()

export const CheckoutTicketsSchema = z.object({
  quantity: z.number().int().min(1).max(500),
  return_path: returnPathField,
})

export const CheckoutActivationsSchema = z.object({
  quantity: z.number().int().min(1).max(50),
  return_path: returnPathField,
})

export const CheckoutEnrollmentSchema = z.object({
  category_id: uuidString,
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  birthdate: isoDateString,
  dni: dniString,
  country: z.string().min(2).max(100).nullable().optional(),
  email: emailString.nullable().optional(),
  phone: phoneString,
})

export const ContestCreateSchema = z.object({
  name: z.string().min(1).max(200),
  short_description: z.string().max(2000).nullable().optional(),
  prizes: z.string().max(5000).nullable().optional(),
  rules: z.string().max(10000).nullable().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  is_rounds_dynamic: z.boolean().optional().default(false),
  mode: z.enum(['standard', 'tournament']).optional().default('standard'),
})

export const RefundBodySchema = z.object({
  amount_cents: z.number().int().min(1).optional(),
  reverse_transfer: z.boolean().optional().default(true),
})

export const BulkRoundParticipantsSchema = z.object({
  participantIds: z.array(uuidString).min(1).max(500),
})

export const JudgePoolSchema = z.object({
  full_name: z.string().max(200).nullable().optional(),
  email: emailString,
  specialty: z.string().max(200).nullable().optional(),
})

export const JudgePoolInviteSchema = z.object({
  full_name: z.string().max(200).nullable().optional(),
  email: emailString,
  specialty: z.string().max(200).nullable().optional(),
})

export const PromoteBodySchema = z.object({
  participantIds: z.array(uuidString).min(1).max(1000),
  nextRoundName: z.string().min(1).max(200).optional(),
  isFinal: z.boolean().optional().default(false),
})

export const ContestPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().max(5000).nullable().optional(),
  type: z.string().min(1).max(50).optional(),
  status: z.enum(['draft', 'active', 'finished', 'cancelled']).optional(),
  is_rounds_dynamic: z.boolean().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
  cover_image_url: z.string().nullable().optional(),
  rules: z.string().max(10000).nullable().optional(),
  entry_fee_cents: z.number().int().min(0).nullable().optional(),
  registration_open: z.boolean().optional(),
})

export const ParticipantPatchSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  birthdate: isoDateString.optional(),
  dni: dniString,
  country: z.string().min(2).max(100).nullable().optional(),
  email: emailString.nullable().optional(),
  phone: phoneString,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.string().min(1).max(50).optional(),
})

export const CategoryPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  order: z.number().int().min(0).optional(),
  status: z.string().min(1).max(50).optional(),
  min_age: z.number().int().min(0).nullable().optional(),
  max_age: z.number().int().min(0).nullable().optional(),
  artistic_type: z.string().max(100).nullable().optional(),
  speciality: z.string().max(100).nullable().optional(),
  max_participants: z.number().int().min(1).nullable().optional(),
})

export const ParticipantCreateSchema = z.object({
  category_id: uuidString,
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  birthdate: isoDateString.optional(),
  dni: dniString,
  country: z.string().min(2).max(100).nullable().optional(),
  email: emailString.nullable().optional(),
  phone: phoneString,
})

export const ContestMemberSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email: emailString.optional(),
  role: z.enum(['judge', 'viewer', 'staff']).optional(),
  user_id: uuidString.optional(),
})

const ImportRowSchema = z.object({
  category_id: uuidString,
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  birthdate: isoDateString,
  dni: dniString,
  country: z.string().min(2).max(100).nullable().optional(),
  email: emailString.nullable().optional(),
  phone: phoneString,
})

export const ImportBodySchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(1000),
})
