export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: any }
  | any[]

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  limit: number
  total: number
}

// ─── Auth / Profile ──────────────────────────────────────────────────────────

export type AccountType = 'org_owner' | 'user'

export type Profile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  account_type: AccountType
  first_name: string | null
  last_name: string | null
  dni: string | null
  country: string | null
  phone: string | null
  birthdate: string | null
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          owner_id: string
          name: string
          slug: string
          logo_url: string | null
          contact_phone: string | null
          contact_country: string | null
          ticket_balance: number
          activation_balance: number
          stripe_account_id: string | null
          stripe_onboarding_done: boolean
          stripe_charges_enabled: boolean
          stripe_payouts_enabled: boolean
          settings: Json | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
      }
      contests: {
        Row: {
          id: string
          organization_id: string
          name: string
          slug: string
          description: string | null
          type: 'music' | 'general' | 'dance' | 'libre'
          status: 'draft' | 'active' | 'finished' | 'cancelled'
          is_rounds_dynamic: boolean
          starts_at: string | null
          ends_at: string | null
          registration_token: string | null
          registration_open: boolean
          entry_fee_cents: number | null
          rules: string | null
          settings: Json | null
          cover_image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['contests']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['contests']['Insert']>
      }
      contest_members: {
        Row: {
          id: string
          contest_id: string
          user_id: string
          full_name: string | null
          email: string | null
          role: 'organizer' | 'judge' | 'viewer'
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['contest_members']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['contest_members']['Insert']>
      }
      judges: {
        Row: {
          id: string
          full_name: string
          email: string
          specialty: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['judges']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['judges']['Insert']>
      }
      judge_pool_members: {
        Row: {
          id: string
          organization_id: string
          judge_id: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['judge_pool_members']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['judge_pool_members']['Insert']>
      }
      categories: {
        Row: {
          id: string
          contest_id: string
          name: string
          description: string | null
          order: number
          status: 'pending' | 'active' | 'closed'
          min_age: number | null
          max_age: number | null
          max_participants: number | null
          tier: string | null
          artistic_type: string | null
          speciality: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['categories']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['categories']['Insert']>
      }
      rounds: {
        Row: {
          id: string
          category_id: string
          name: string
          order: number
          status: 'pending' | 'active' | 'closed'
          scoring_type: 'numeric' | 'rank' | 'vote'
          max_score: number | null
          next_round_id: string | null
          is_final: boolean
          is_ranking: boolean
          is_published: boolean
          started_at: string | null
          closed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['rounds']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['rounds']['Insert']>
      }
      participants: {
        Row: {
          id: string
          contest_id: string
          category_id: string
          user_id: string | null
          name: string
          first_name: string | null
          last_name: string | null
          dni: string | null
          birthdate: string | null
          country: string | null
          email: string | null
          metadata: Json | null
          status: 'active' | 'eliminated'
          amount_paid_cents: number | null
          amount_refunded_cents: number | null
          payment_status: 'free' | 'pending' | 'paid' | 'refunded' | 'partial_refund'
          stripe_payment_intent_id: string | null
          stripe_checkout_session_id: string | null
          stripe_refund_id: string | null
          refunded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['participants']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['participants']['Insert']>
      }
      round_participants: {
        Row: {
          id: string
          round_id: string
          participant_id: string
          order: number | null
          is_qualified: boolean | null
          scheduled_at: string | null
          location: string | null
          final_score_override: number | null
          final_score_override_by: string | null
          final_score_override_at: string | null
          final_score_override_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['round_participants']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['round_participants']['Insert']>
      }
      score_criteria: {
        Row: {
          id: string
          round_id: string
          name: string
          weight: number
          max_value: number
          order: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['score_criteria']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['score_criteria']['Insert']>
      }
      scores: {
        Row: {
          id: string
          round_id: string
          participant_id: string
          judge_id: string
          value: number
          criteria_scores: Json | null
          notes: string | null
          submitted_at: string
          set_by_admin: boolean
          admin_user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['scores']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['scores']['Insert']>
      }
      prizes: {
        Row: {
          id: string
          category_id: string
          description: string
          winner_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['prizes']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['prizes']['Insert']>
      }
      rehearsals: {
        Row: {
          id: string
          round_id: string
          participant_id: string
          accompanist_id: string | null
          scheduled_at: string
          location: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['rehearsals']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['rehearsals']['Insert']>
      }
    }
    Enums: {
      contest_type: 'music' | 'general' | 'dance' | 'libre'
      contest_status: 'draft' | 'active' | 'finished' | 'cancelled'
      contest_role: 'organizer' | 'judge' | 'viewer'
      category_status: 'pending' | 'active' | 'closed'
      round_status: 'pending' | 'active' | 'closed'
      scoring_type: 'numeric' | 'rank' | 'vote'
      participant_status: 'active' | 'eliminated'
    }
  }
}

export type ContestFormPayload = {
  name: string
  short_description?: string
  prizes?: string
  rules?: string
  starts_at?: string
  ends_at?: string
  is_rounds_dynamic?: boolean
  mode?: 'standard' | 'tournament'
}

// Flat exports for easier consumption
export type Organization = Database['public']['Tables']['organizations']['Row']
export type Contest = Database['public']['Tables']['contests']['Row']
export type ContestMember = Database['public']['Tables']['contest_members']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Round = Database['public']['Tables']['rounds']['Row']
export type Participant = Database['public']['Tables']['participants']['Row']
export type RoundParticipant = Database['public']['Tables']['round_participants']['Row']
export type ScoreCriteria = Database['public']['Tables']['score_criteria']['Row']
export type Score = Database['public']['Tables']['scores']['Row']
export type Prize = Database['public']['Tables']['prizes']['Row']
export type Rehearsal = Database['public']['Tables']['rehearsals']['Row']
export type Judge = Database['public']['Tables']['judges']['Row']
export type JudgePoolMember = Database['public']['Tables']['judge_pool_members']['Row'] & {
  full_name: string
  email: string
  specialty: string | null
  judge_id: string
  avatar_url: string | null
}
