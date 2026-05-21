export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      ambassador_bonus_credits: {
        Row: {
          ambassador_id: string
          amount_cents: number
          credited_at: string
          id: string
          kind: string
          period_key: string
        }
        Insert: {
          ambassador_id: string
          amount_cents: number
          credited_at?: string
          id?: string
          kind: string
          period_key: string
        }
        Update: {
          ambassador_id?: string
          amount_cents?: number
          credited_at?: string
          id?: string
          kind?: string
          period_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_bonus_credits_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_contract_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          contract_id: string
          created_at: string
          details: Json | null
          id: string
          ip_hash: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          contract_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          contract_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_contract_audit_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ambassador_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_contract_templates: {
        Row: {
          body_html: string
          consent_text: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          body_html: string
          consent_text: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          version?: number
        }
        Update: {
          body_html?: string
          consent_text?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      ambassador_contracts: {
        Row: {
          ambassador_id: string
          consent_text: string
          content_hash: string
          content_snapshot: string
          id: string
          revoked_at: string | null
          revoked_reason: string | null
          sent_at: string
          sent_by: string
          signature_image_path: string | null
          signed_at: string | null
          signer_ip_hash: string | null
          signer_user_agent: string | null
          status: string
          template_id: string | null
          title: string
          viewed_at: string | null
        }
        Insert: {
          ambassador_id: string
          consent_text: string
          content_hash: string
          content_snapshot: string
          id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          sent_at?: string
          sent_by: string
          signature_image_path?: string | null
          signed_at?: string | null
          signer_ip_hash?: string | null
          signer_user_agent?: string | null
          status?: string
          template_id?: string | null
          title: string
          viewed_at?: string | null
        }
        Update: {
          ambassador_id?: string
          consent_text?: string
          content_hash?: string
          content_snapshot?: string
          id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          sent_at?: string
          sent_by?: string
          signature_image_path?: string | null
          signed_at?: string | null
          signer_ip_hash?: string | null
          signer_user_agent?: string | null
          status?: string
          template_id?: string | null
          title?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_contracts_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambassador_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ambassador_contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_email_logs: {
        Row: {
          ambassador_id: string
          body_html: string
          error: string | null
          id: string
          resend_id: string | null
          sent_at: string
          sent_by: string
          status: string
          subject: string
          template_id: string | null
          template_slug: string | null
          to_email: string
        }
        Insert: {
          ambassador_id: string
          body_html: string
          error?: string | null
          id?: string
          resend_id?: string | null
          sent_at?: string
          sent_by: string
          status: string
          subject: string
          template_id?: string | null
          template_slug?: string | null
          to_email: string
        }
        Update: {
          ambassador_id?: string
          body_html?: string
          error?: string | null
          id?: string
          resend_id?: string | null
          sent_at?: string
          sent_by?: string
          status?: string
          subject?: string
          template_id?: string | null
          template_slug?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_email_logs_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambassador_email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ambassador_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_email_templates: {
        Row: {
          body_html: string
          created_at: string
          id: string
          is_seeded: boolean
          name: string
          slug: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          id?: string
          is_seeded?: boolean
          name: string
          slug: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          id?: string
          is_seeded?: boolean
          name?: string
          slug?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      ambassador_monthly_challenges: {
        Row: {
          activated_by: string | null
          created_at: string
          ends_at: string
          id: string
          prize_cents: number
          settled_at: string | null
          starts_at: string
          status: string
          winner_ambassador_id: string | null
          winner_sales_count: number | null
        }
        Insert: {
          activated_by?: string | null
          created_at?: string
          ends_at: string
          id?: string
          prize_cents?: number
          settled_at?: string | null
          starts_at?: string
          status?: string
          winner_ambassador_id?: string | null
          winner_sales_count?: number | null
        }
        Update: {
          activated_by?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          prize_cents?: number
          settled_at?: string | null
          starts_at?: string
          status?: string
          winner_ambassador_id?: string | null
          winner_sales_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_monthly_challenges_winner_ambassador_id_fkey"
            columns: ["winner_ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_payouts: {
        Row: {
          ambassador_id: string
          amount_cents: number
          failure_reason: string | null
          id: string
          paid_at: string | null
          requested_at: string
          status: string
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
        }
        Insert: {
          ambassador_id: string
          amount_cents: number
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          requested_at?: string
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
        }
        Update: {
          ambassador_id?: string
          amount_cents?: number
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          requested_at?: string
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_payouts_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_pin_attempts: {
        Row: {
          attempted_at: string
          code: string
          id: string
          ip_hash: string
        }
        Insert: {
          attempted_at?: string
          code: string
          id?: string
          ip_hash: string
        }
        Update: {
          attempted_at?: string
          code?: string
          id?: string
          ip_hash?: string
        }
        Relationships: []
      }
      ambassador_recruitment_applications: {
        Row: {
          city: string
          created_at: string
          email: string
          first_name: string
          id: string
          ip_hash: string | null
          last_name: string
          last_reminder_at: string | null
          no_fraud_pledge: boolean
          notes: string | null
          phone: string
          referrer_ambassador_id: string | null
          referrer_code_used: string | null
          reminder_count: number
          reviewed_at: string | null
          siret: string | null
          source: string
          status: string
        }
        Insert: {
          city: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          ip_hash?: string | null
          last_name: string
          last_reminder_at?: string | null
          no_fraud_pledge: boolean
          notes?: string | null
          phone: string
          referrer_ambassador_id?: string | null
          referrer_code_used?: string | null
          reminder_count?: number
          reviewed_at?: string | null
          siret?: string | null
          source?: string
          status?: string
        }
        Update: {
          city?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          ip_hash?: string | null
          last_name?: string
          last_reminder_at?: string | null
          no_fraud_pledge?: boolean
          notes?: string | null
          phone?: string
          referrer_ambassador_id?: string | null
          referrer_code_used?: string | null
          reminder_count?: number
          reviewed_at?: string | null
          siret?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_recruitment_applications_referrer_ambassador_id_fkey"
            columns: ["referrer_ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_sales: {
        Row: {
          ambassador_id: string
          commission_amount: number
          created_at: string
          id: string
          pack: string
          salon_name_partial: string | null
          smarttag_order_id: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          ambassador_id: string
          commission_amount: number
          created_at?: string
          id?: string
          pack: string
          salon_name_partial?: string | null
          smarttag_order_id: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          ambassador_id?: string
          commission_amount?: number
          created_at?: string
          id?: string
          pack?: string
          salon_name_partial?: string | null
          smarttag_order_id?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_sales_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambassador_sales_smarttag_order_id_fkey"
            columns: ["smarttag_order_id"]
            isOneToOne: true
            referencedRelation: "smarttag_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_zone_claims: {
        Row: {
          ambassador_id: string
          claimed_at: string
          id: string
          released_at: string | null
          released_by_admin: boolean
          zone_id: string
        }
        Insert: {
          ambassador_id: string
          claimed_at?: string
          id?: string
          released_at?: string | null
          released_by_admin?: boolean
          zone_id: string
        }
        Update: {
          ambassador_id?: string
          claimed_at?: string
          id?: string
          released_at?: string | null
          released_by_admin?: boolean
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_zone_claims_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambassador_zone_claims_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "salon_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassadors: {
        Row: {
          city: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          onboarding_status: string
          payouts_frozen: boolean
          phone: string | null
          pin_hash: string | null
          pin_salt: string | null
          pin_setup_expires_at: string | null
          pin_setup_token: string | null
          promo_code_id: string
          referral_code: string | null
          referral_validated_at: string | null
          referrer_ambassador_id: string | null
          siret: string | null
          stripe_account_id: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          onboarding_status?: string
          payouts_frozen?: boolean
          phone?: string | null
          pin_hash?: string | null
          pin_salt?: string | null
          pin_setup_expires_at?: string | null
          pin_setup_token?: string | null
          promo_code_id: string
          referral_code?: string | null
          referral_validated_at?: string | null
          referrer_ambassador_id?: string | null
          siret?: string | null
          stripe_account_id?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          onboarding_status?: string
          payouts_frozen?: boolean
          phone?: string | null
          pin_hash?: string | null
          pin_salt?: string | null
          pin_setup_expires_at?: string | null
          pin_setup_token?: string | null
          promo_code_id?: string
          referral_code?: string | null
          referral_validated_at?: string | null
          referrer_ambassador_id?: string | null
          siret?: string | null
          stripe_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ambassadors_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: true
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambassadors_referrer_ambassador_id_fkey"
            columns: ["referrer_ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_email_prospects: {
        Row: {
          birth_year_estimate: number | null
          city: string | null
          clicked_landing_at: string | null
          company_name: string | null
          creation_date: string | null
          email: string | null
          first_name: string | null
          id: string
          imported_at: string
          last_sent_at: string | null
          linkedin_url: string | null
          naf_code: string | null
          notes: string | null
          replied_at: string | null
          sequence_step: number
          siret: string | null
          status: string
          target_program: string
          unsubscribed_at: string | null
        }
        Insert: {
          birth_year_estimate?: number | null
          city?: string | null
          clicked_landing_at?: string | null
          company_name?: string | null
          creation_date?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          imported_at?: string
          last_sent_at?: string | null
          linkedin_url?: string | null
          naf_code?: string | null
          notes?: string | null
          replied_at?: string | null
          sequence_step?: number
          siret?: string | null
          status?: string
          target_program?: string
          unsubscribed_at?: string | null
        }
        Update: {
          birth_year_estimate?: number | null
          city?: string | null
          clicked_landing_at?: string | null
          company_name?: string | null
          creation_date?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          imported_at?: string
          last_sent_at?: string | null
          linkedin_url?: string | null
          naf_code?: string | null
          notes?: string | null
          replied_at?: string | null
          sequence_step?: number
          siret?: string | null
          status?: string
          target_program?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      cold_email_unsubscribe_log: {
        Row: {
          siret: string
          unsubscribed_at: string
        }
        Insert: {
          siret: string
          unsubscribed_at?: string
        }
        Update: {
          siret?: string
          unsubscribed_at?: string
        }
        Relationships: []
      }
      commercial_contract_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          contract_id: string
          created_at: string
          details: Json | null
          id: string
          ip_hash: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          contract_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          contract_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_contract_audit_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "commercial_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_contract_templates: {
        Row: {
          body_html: string
          consent_text: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          body_html: string
          consent_text: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          version?: number
        }
        Update: {
          body_html?: string
          consent_text?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      commercial_contracts: {
        Row: {
          commercial_id: string
          consent_text: string
          content_hash: string
          content_snapshot: string
          id: string
          revoked_at: string | null
          revoked_reason: string | null
          sent_at: string
          sent_by: string
          signature_image_path: string | null
          signed_at: string | null
          signer_ip_hash: string | null
          signer_user_agent: string | null
          status: string
          template_id: string | null
          title: string
          viewed_at: string | null
        }
        Insert: {
          commercial_id: string
          consent_text: string
          content_hash: string
          content_snapshot: string
          id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          sent_at?: string
          sent_by: string
          signature_image_path?: string | null
          signed_at?: string | null
          signer_ip_hash?: string | null
          signer_user_agent?: string | null
          status?: string
          template_id?: string | null
          title: string
          viewed_at?: string | null
        }
        Update: {
          commercial_id?: string
          consent_text?: string
          content_hash?: string
          content_snapshot?: string
          id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          sent_at?: string
          sent_by?: string
          signature_image_path?: string | null
          signed_at?: string | null
          signer_ip_hash?: string | null
          signer_user_agent?: string | null
          status?: string
          template_id?: string | null
          title?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_contracts_commercial_id_fkey"
            columns: ["commercial_id"]
            isOneToOne: false
            referencedRelation: "commerciaux"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "commercial_contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_payouts: {
        Row: {
          amount_cents: number
          commercial_id: string
          failure_reason: string | null
          id: string
          paid_at: string | null
          requested_at: string
          status: string
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
        }
        Insert: {
          amount_cents: number
          commercial_id: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          requested_at?: string
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
        }
        Update: {
          amount_cents?: number
          commercial_id?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          requested_at?: string
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_payouts_commercial_id_fkey"
            columns: ["commercial_id"]
            isOneToOne: false
            referencedRelation: "commerciaux"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_pin_attempts: {
        Row: {
          attempted_at: string
          code: string
          id: string
          ip_hash: string
        }
        Insert: {
          attempted_at?: string
          code: string
          id?: string
          ip_hash: string
        }
        Update: {
          attempted_at?: string
          code?: string
          id?: string
          ip_hash?: string
        }
        Relationships: []
      }
      commercial_recruitment_applications: {
        Row: {
          city: string
          company_name: string
          created_at: string
          email: string
          first_name: string
          id: string
          ip_hash: string | null
          last_name: string
          legal_form: string
          no_fraud_pledge: boolean
          notes: string | null
          phone: string
          reviewed_at: string | null
          sector: string | null
          siret: string
          status: string
          vat_number: string | null
          vrp_status: string
        }
        Insert: {
          city: string
          company_name: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          ip_hash?: string | null
          last_name: string
          legal_form: string
          no_fraud_pledge: boolean
          notes?: string | null
          phone: string
          reviewed_at?: string | null
          sector?: string | null
          siret: string
          status?: string
          vat_number?: string | null
          vrp_status: string
        }
        Update: {
          city?: string
          company_name?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          ip_hash?: string | null
          last_name?: string
          legal_form?: string
          no_fraud_pledge?: boolean
          notes?: string | null
          phone?: string
          reviewed_at?: string | null
          sector?: string | null
          siret?: string
          status?: string
          vat_number?: string | null
          vrp_status?: string
        }
        Relationships: []
      }
      commercial_sales: {
        Row: {
          commercial_id: string
          commission_amount: number
          created_at: string
          id: string
          pack: string
          salon_name_partial: string | null
          smarttag_order_id: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          commercial_id: string
          commission_amount: number
          created_at?: string
          id?: string
          pack: string
          salon_name_partial?: string | null
          smarttag_order_id: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          commercial_id?: string
          commission_amount?: number
          created_at?: string
          id?: string
          pack?: string
          salon_name_partial?: string | null
          smarttag_order_id?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_sales_commercial_id_fkey"
            columns: ["commercial_id"]
            isOneToOne: false
            referencedRelation: "commerciaux"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_sales_smarttag_order_id_fkey"
            columns: ["smarttag_order_id"]
            isOneToOne: true
            referencedRelation: "smarttag_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      commerciaux: {
        Row: {
          city: string
          company_name: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          legal_form: string
          name: string
          onboarding_status: string
          payouts_frozen: boolean
          phone: string
          pin_hash: string | null
          pin_salt: string | null
          pin_setup_expires_at: string | null
          pin_setup_token: string | null
          promo_code_id: string
          sector: string | null
          siret: string
          stripe_account_id: string | null
          vat_number: string | null
          vrp_status: string
        }
        Insert: {
          city: string
          company_name: string
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          legal_form: string
          name: string
          onboarding_status?: string
          payouts_frozen?: boolean
          phone: string
          pin_hash?: string | null
          pin_salt?: string | null
          pin_setup_expires_at?: string | null
          pin_setup_token?: string | null
          promo_code_id: string
          sector?: string | null
          siret: string
          stripe_account_id?: string | null
          vat_number?: string | null
          vrp_status: string
        }
        Update: {
          city?: string
          company_name?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          legal_form?: string
          name?: string
          onboarding_status?: string
          payouts_frozen?: boolean
          phone?: string
          pin_hash?: string | null
          pin_salt?: string | null
          pin_setup_expires_at?: string | null
          pin_setup_token?: string | null
          promo_code_id?: string
          sector?: string | null
          siret?: string
          stripe_account_id?: string | null
          vat_number?: string | null
          vrp_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commerciaux_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: true
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_requests: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          locale: string | null
          message: string
          name: string
          phone: string | null
          team_size: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          locale?: string | null
          message: string
          name: string
          phone?: string | null
          team_size?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          locale?: string | null
          message?: string
          name?: string
          phone?: string | null
          team_size?: string | null
        }
        Relationships: []
      }
      establishments: {
        Row: {
          address: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          country: string
          created_at: string
          currency: string
          deleted_at: string | null
          group_id: string
          id: string
          name: string
          onboarding_status: Database["public"]["Enums"]["stripe_onboarding_status"]
          slug: string
          stripe_account_id: string | null
        }
        Insert: {
          address?: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          country?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          group_id: string
          id?: string
          name: string
          onboarding_status?: Database["public"]["Enums"]["stripe_onboarding_status"]
          slug: string
          stripe_account_id?: string | null
        }
        Update: {
          address?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          country?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          group_id?: string
          id?: string
          name?: string
          onboarding_status?: Database["public"]["Enums"]["stripe_onboarding_status"]
          slug?: string
          stripe_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establishments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_tip_transfers: {
        Row: {
          amount: number
          attempts: number
          created_at: string
          error: string | null
          id: string
          reversed_at: string | null
          staff_id: string
          status: string
          stripe_transfer_id: string | null
          transaction_id: string
        }
        Insert: {
          amount: number
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          reversed_at?: string | null
          staff_id: string
          status?: string
          stripe_transfer_id?: string | null
          transaction_id: string
        }
        Update: {
          amount?: number
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          reversed_at?: string | null
          staff_id?: string
          status?: string
          stripe_transfer_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_tip_transfers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_tip_transfers_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          billing_address: Json | null
          created_at: string
          deleted_at: string | null
          id: string
          legal_name: string | null
          lifecycle_emails_opt_out_at: string | null
          logo_url: string | null
          name: string
          onboarding_completed_at: string | null
          platform_fee_bps: number
          settings: Json
          shipping_address: Json | null
          stripe_customer_id: string | null
          vat_number: string | null
        }
        Insert: {
          billing_address?: Json | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          legal_name?: string | null
          lifecycle_emails_opt_out_at?: string | null
          logo_url?: string | null
          name: string
          onboarding_completed_at?: string | null
          platform_fee_bps?: number
          settings?: Json
          shipping_address?: Json | null
          stripe_customer_id?: string | null
          vat_number?: string | null
        }
        Update: {
          billing_address?: Json | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          legal_name?: string | null
          lifecycle_emails_opt_out_at?: string | null
          logo_url?: string | null
          name?: string
          onboarding_completed_at?: string | null
          platform_fee_bps?: number
          settings?: Json
          shipping_address?: Json | null
          stripe_customer_id?: string | null
          vat_number?: string | null
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          current_step: string | null
          done: number
          error: string | null
          failed_count: number
          finished_at: string | null
          id: string
          last_heartbeat_at: string | null
          params: Json
          result: Json
          started_at: string | null
          status: Database["public"]["Enums"]["import_job_status"]
          succeeded: number
          total: number
          type: Database["public"]["Enums"]["import_job_type"]
          worker_token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_step?: string | null
          done?: number
          error?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          last_heartbeat_at?: string | null
          params?: Json
          result?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_job_status"]
          succeeded?: number
          total?: number
          type: Database["public"]["Enums"]["import_job_type"]
          worker_token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_step?: string | null
          done?: number
          error?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          last_heartbeat_at?: string | null
          params?: Json
          result?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_job_status"]
          succeeded?: number
          total?: number
          type?: Database["public"]["Enums"]["import_job_type"]
          worker_token?: string
        }
        Relationships: []
      }
      lifecycle_email_log: {
        Row: {
          audience: string
          created_at: string
          dedup_key: string
          email_key: string
          error: string | null
          establishment_id: string | null
          group_id: string | null
          id: string
          locale: string
          resend_id: string | null
          sent_at: string | null
          staff_id: string | null
          status: string
          to_email: string
          transactional: boolean
        }
        Insert: {
          audience: string
          created_at?: string
          dedup_key: string
          email_key: string
          error?: string | null
          establishment_id?: string | null
          group_id?: string | null
          id?: string
          locale?: string
          resend_id?: string | null
          sent_at?: string | null
          staff_id?: string | null
          status: string
          to_email: string
          transactional?: boolean
        }
        Update: {
          audience?: string
          created_at?: string
          dedup_key?: string
          email_key?: string
          error?: string | null
          establishment_id?: string | null
          group_id?: string | null
          id?: string
          locale?: string
          resend_id?: string | null
          sent_at?: string | null
          staff_id?: string | null
          status?: string
          to_email?: string
          transactional?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_email_log_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_email_log_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_email_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      negative_balance_events: {
        Row: {
          amount_owed: number
          created_at: string
          dispute_id: string | null
          id: string
          notes: string | null
          resolved_at: string | null
          staff_id: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          amount_owed: number
          created_at?: string
          dispute_id?: string | null
          id?: string
          notes?: string | null
          resolved_at?: string | null
          staff_id: string
          status?: string
          transaction_id?: string | null
        }
        Update: {
          amount_owed?: number
          created_at?: string
          dispute_id?: string | null
          id?: string
          notes?: string | null
          resolved_at?: string | null
          staff_id?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negative_balance_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negative_balance_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      nfc_stickers: {
        Row: {
          batch_label: string | null
          created_at: string
          establishment_id: string | null
          generated_at: string
          id: string
          short_id: string
          updated_at: string
        }
        Insert: {
          batch_label?: string | null
          created_at?: string
          establishment_id?: string | null
          generated_at?: string
          id?: string
          short_id: string
          updated_at?: string
        }
        Update: {
          batch_label?: string | null
          created_at?: string
          establishment_id?: string | null
          generated_at?: string
          id?: string
          short_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfc_stickers_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_redemptions: number | null
          notes: string | null
          percentage_off: number
          seller_type: string | null
          stripe_coupon_id: string
          stripe_promo_code_id: string
          times_redeemed: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          notes?: string | null
          percentage_off: number
          seller_type?: string | null
          stripe_coupon_id: string
          stripe_promo_code_id: string
          times_redeemed?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          notes?: string | null
          percentage_off?: number
          seller_type?: string | null
          stripe_coupon_id?: string
          stripe_promo_code_id?: string
          times_redeemed?: number
        }
        Relationships: []
      }
      referral_email_log: {
        Row: {
          ambassador_id: string
          id: string
          recipient_email: string
          sent_at: string
        }
        Insert: {
          ambassador_id: string
          id?: string
          recipient_email: string
          sent_at?: string
        }
        Update: {
          ambassador_id?: string
          id?: string
          recipient_email?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_email_log_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_payouts: {
        Row: {
          amount_cents: number
          created_at: string
          credited_at: string | null
          id: string
          reason: string
          referred_ambassador_id: string
          referrer_ambassador_id: string
          status: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          credited_at?: string | null
          id?: string
          reason: string
          referred_ambassador_id: string
          referrer_ambassador_id: string
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credited_at?: string | null
          id?: string
          reason?: string
          referred_ambassador_id?: string
          referrer_ambassador_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_payouts_referred_ambassador_id_fkey"
            columns: ["referred_ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_payouts_referrer_ambassador_id_fkey"
            columns: ["referrer_ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_visits: {
        Row: {
          ambassador_id: string
          convinced: string
          created_at: string
          distance_m: number | null
          flyer_left: boolean
          follow_up_at: string | null
          gps_accuracy_m: number | null
          gps_lat: number | null
          gps_lon: number | null
          id: string
          likelihood_rating: number
          location_verified: boolean
          notes: string | null
          salon_id: string
          updated_at: string
          visited_at: string
        }
        Insert: {
          ambassador_id: string
          convinced?: string
          created_at?: string
          distance_m?: number | null
          flyer_left?: boolean
          follow_up_at?: string | null
          gps_accuracy_m?: number | null
          gps_lat?: number | null
          gps_lon?: number | null
          id?: string
          likelihood_rating: number
          location_verified?: boolean
          notes?: string | null
          salon_id: string
          updated_at?: string
          visited_at?: string
        }
        Update: {
          ambassador_id?: string
          convinced?: string
          created_at?: string
          distance_m?: number | null
          flyer_left?: boolean
          follow_up_at?: string | null
          gps_accuracy_m?: number | null
          gps_lat?: number | null
          gps_lon?: number | null
          id?: string
          likelihood_rating?: number
          location_verified?: boolean
          notes?: string | null
          salon_id?: string
          updated_at?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_visits_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_visits_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_zones: {
        Row: {
          bbox_max_lat: number | null
          bbox_max_lon: number | null
          bbox_min_lat: number | null
          bbox_min_lon: number | null
          city: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          osm_relation_id: number | null
        }
        Insert: {
          bbox_max_lat?: number | null
          bbox_max_lon?: number | null
          bbox_min_lat?: number | null
          bbox_min_lon?: number | null
          city: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          osm_relation_id?: number | null
        }
        Update: {
          bbox_max_lat?: number | null
          bbox_max_lon?: number | null
          bbox_min_lat?: number | null
          bbox_min_lon?: number | null
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          osm_relation_id?: number | null
        }
        Relationships: []
      }
      salons: {
        Row: {
          address: string | null
          business_status: string | null
          category: string
          city: string
          converted_at: string | null
          created_at: string
          google_enriched_at: string | null
          google_place_id: string | null
          google_rating: number | null
          google_user_ratings_total: number | null
          id: string
          is_active: boolean
          lat: number | null
          lon: number | null
          name: string
          opening_hours: Json | null
          osm_id: number | null
          osm_type: string | null
          phone: string | null
          postal_code: string | null
          timezone: string
          website: string | null
          zone_id: string | null
        }
        Insert: {
          address?: string | null
          business_status?: string | null
          category?: string
          city: string
          converted_at?: string | null
          created_at?: string
          google_enriched_at?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_user_ratings_total?: number | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lon?: number | null
          name: string
          opening_hours?: Json | null
          osm_id?: number | null
          osm_type?: string | null
          phone?: string | null
          postal_code?: string | null
          timezone?: string
          website?: string | null
          zone_id?: string | null
        }
        Update: {
          address?: string | null
          business_status?: string | null
          category?: string
          city?: string
          converted_at?: string | null
          created_at?: string
          google_enriched_at?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_user_ratings_total?: number | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lon?: number | null
          name?: string
          opening_hours?: Json | null
          osm_id?: number | null
          osm_type?: string | null
          phone?: string | null
          postal_code?: string | null
          timezone?: string
          website?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salons_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "salon_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      smarttag_order_tags: {
        Row: {
          encoded_at: string
          order_id: string
          sticker_id: string
        }
        Insert: {
          encoded_at?: string
          order_id: string
          sticker_id: string
        }
        Update: {
          encoded_at?: string
          order_id?: string
          sticker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smarttag_order_tags_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "smarttag_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smarttag_order_tags_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: true
            referencedRelation: "nfc_stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      smarttag_orders: {
        Row: {
          created_at: string
          delivered_at: string | null
          discount_amount: number
          fulfilled_at: string | null
          group_id: string
          id: string
          internal_notes: string | null
          pack: string
          promo_code: string | null
          promo_code_id: string | null
          quantity: number
          shipped_at: string | null
          shipping_address: Json | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_discount_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          tags_encoded_count: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          discount_amount?: number
          fulfilled_at?: string | null
          group_id: string
          id?: string
          internal_notes?: string | null
          pack: string
          promo_code?: string | null
          promo_code_id?: string | null
          quantity: number
          shipped_at?: string | null
          shipping_address?: Json | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_discount_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          tags_encoded_count?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          discount_amount?: number
          fulfilled_at?: string | null
          group_id?: string
          id?: string
          internal_notes?: string | null
          pack?: string
          promo_code?: string | null
          promo_code_id?: string | null
          quantity?: number
          shipped_at?: string | null
          shipping_address?: Json | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_discount_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          tags_encoded_count?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "smarttag_orders_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smarttag_orders_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_payouts: {
        Row: {
          amount: number
          created_at: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          paid_at: string | null
          staff_id: string
          status: string
          stripe_payout_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          paid_at?: string | null
          staff_id: string
          status: string
          stripe_payout_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          paid_at?: string | null
          staff_id?: string
          status?: string
          stripe_payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_payouts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          establishment_id: string
          full_name: string
          id: string
          is_active: boolean
          last_payout_failure_at: string | null
          last_payout_failure_code: string | null
          lifecycle_emails_opt_out_at: string | null
          onboarding_status: Database["public"]["Enums"]["stripe_onboarding_status"]
          payouts_frozen: boolean
          stripe_account_id: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          establishment_id: string
          full_name: string
          id?: string
          is_active?: boolean
          last_payout_failure_at?: string | null
          last_payout_failure_code?: string | null
          lifecycle_emails_opt_out_at?: string | null
          onboarding_status?: Database["public"]["Enums"]["stripe_onboarding_status"]
          payouts_frozen?: boolean
          stripe_account_id?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          establishment_id?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_payout_failure_at?: string | null
          last_payout_failure_code?: string | null
          lifecycle_emails_opt_out_at?: string | null
          onboarding_status?: Database["public"]["Enums"]["stripe_onboarding_status"]
          payouts_frozen?: boolean
          stripe_account_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          application_fee_amount: number | null
          created_at: string
          currency: string
          dispute_id: string | null
          establishment_id: string
          id: string
          idempotency_key: string
          metadata: Json
          refunded_amount: number
          reversed_at: string | null
          staff_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          stripe_transfer_id: string | null
          succeeded_at: string | null
        }
        Insert: {
          amount: number
          application_fee_amount?: number | null
          created_at?: string
          currency: string
          dispute_id?: string | null
          establishment_id: string
          id?: string
          idempotency_key: string
          metadata?: Json
          refunded_amount?: number
          reversed_at?: string | null
          staff_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          stripe_transfer_id?: string | null
          succeeded_at?: string | null
        }
        Update: {
          amount?: number
          application_fee_amount?: number | null
          created_at?: string
          currency?: string
          dispute_id?: string | null
          establishment_id?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          refunded_amount?: number
          reversed_at?: string | null
          staff_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          stripe_transfer_id?: string | null
          succeeded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          establishment_id: string | null
          group_id: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          establishment_id?: string | null
          group_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          establishment_id?: string | null
          group_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          stripe_event_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          stripe_event_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          stripe_event_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_transactions_summary: {
        Args: {
          p_establishment_id?: string
          p_from?: string
          p_group_id?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          row_count: number
          succeeded_volume_cents: number
        }[]
      }
      ambassador_zone_counts: {
        Args: never
        Returns: {
          bbox_max_lat: number
          bbox_max_lon: number
          bbox_min_lat: number
          bbox_min_lon: number
          city: string
          name: string
          salon_count: number
          todo_count: number
          zone_id: string
        }[]
      }
      claim_nfc_stickers: {
        Args: { p_establishment_id: string; p_short_ids: string[] }
        Returns: {
          id: string
          short_id: string
        }[]
      }
      cleanup_orphan_groups: { Args: never; Returns: number }
      get_establishment_report: {
        Args: { p_establishment_id: string; p_from: string; p_to: string }
        Returns: {
          currency: string
          full_name: string
          staff_id: string
          total_tips: number
          transaction_count: number
        }[]
      }
      get_my_group_ids: { Args: never; Returns: string[] }
      get_my_managed_establishment_ids: { Args: never; Returns: string[] }
      get_my_staff_establishment_id: { Args: never; Returns: string }
      get_my_staff_profile_id: { Args: never; Returns: string }
      get_public_group_staff: {
        Args: { p_establishment_id: string }
        Returns: {
          avatar_url: string
          establishment_currency: string
          establishment_id: string
          establishment_name: string
          full_name: string
          group_logo_url: string
          is_payable: boolean
          staff_id: string
          tip_thresholds: Json
        }[]
      }
      get_public_staff: {
        Args: { p_staff_id: string }
        Returns: {
          avatar_url: string
          establishment_currency: string
          establishment_name: string
          full_name: string
          id: string
          is_payable: boolean
          tip_thresholds: Json
        }[]
      }
      increment_promo_redeemed: { Args: { promo_id: string }; Returns: number }
      is_super_admin: { Args: never; Returns: boolean }
      provision_order_sticker: {
        Args: { p_order_id: string }
        Returns: {
          encoded_count: number
          short_id: string
          sticker_id: string
          total_quantity: number
        }[]
      }
      release_advisory_lock_commercial_payout: {
        Args: { p_commercial_id: string }
        Returns: undefined
      }
      release_advisory_lock_payout: {
        Args: { p_ambassador_id: string }
        Returns: undefined
      }
      try_advisory_lock_commercial_payout: {
        Args: { p_commercial_id: string }
        Returns: boolean
      }
      try_advisory_lock_payout: {
        Args: { p_ambassador_id: string }
        Returns: boolean
      }
      validate_unassigned_nfc_code: {
        Args: { p_short_id: string }
        Returns: string
      }
    }
    Enums: {
      business_type: "restaurant" | "beauty"
      import_job_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
      import_job_type:
        | "import_zones"
        | "import_salons"
        | "enrich_addresses"
        | "enrich_google"
        | "full_import"
        | "import_france"
      stripe_onboarding_status: "not_started" | "pending" | "complete"
      transaction_status:
        | "pending"
        | "succeeded"
        | "failed"
        | "refunded"
        | "disputed"
        | "reversed"
        | "partially_refunded"
      user_role: "super_admin" | "group_admin" | "manager" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      business_type: ["restaurant", "beauty"],
      import_job_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
      ],
      import_job_type: [
        "import_zones",
        "import_salons",
        "enrich_addresses",
        "enrich_google",
        "full_import",
        "import_france",
      ],
      stripe_onboarding_status: ["not_started", "pending", "complete"],
      transaction_status: [
        "pending",
        "succeeded",
        "failed",
        "refunded",
        "disputed",
        "reversed",
        "partially_refunded",
      ],
      user_role: ["super_admin", "group_admin", "manager", "staff"],
    },
  },
} as const
