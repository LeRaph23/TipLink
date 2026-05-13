// Stub — replace with: supabase start && npm run db:types
// Matches GenericTable shape expected by @supabase/postgrest-js v0.17+

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      groups: {
        Row: {
          id: string;
          name: string;
          logo_url: string | null;
          settings: Json;
          created_at: string;
          deleted_at: string | null;
          legal_name: string | null;
          vat_number: string | null;
          billing_address: Json | null;
          shipping_address: Json | null;
          stripe_customer_id: string | null;
          subscription_id: string | null;
          subscription_status: string | null;
          subscription_pack: 'solo' | 'duo' | null;
          platform_fee_bps: number;
          onboarding_completed_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          logo_url?: string | null;
          settings?: Json;
          created_at?: string;
          deleted_at?: string | null;
          legal_name?: string | null;
          vat_number?: string | null;
          billing_address?: Json | null;
          shipping_address?: Json | null;
          stripe_customer_id?: string | null;
          subscription_id?: string | null;
          subscription_status?: string | null;
          subscription_pack?: 's' | 'm' | 'l' | null;
          platform_fee_bps?: number;
          onboarding_completed_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          logo_url?: string | null;
          settings?: Json;
          created_at?: string;
          deleted_at?: string | null;
          legal_name?: string | null;
          vat_number?: string | null;
          billing_address?: Json | null;
          shipping_address?: Json | null;
          stripe_customer_id?: string | null;
          subscription_id?: string | null;
          subscription_status?: string | null;
          subscription_pack?: 's' | 'm' | 'l' | null;
          platform_fee_bps?: number;
          onboarding_completed_at?: string | null;
        };
        Relationships: [];
      };
      smarttag_orders: {
        Row: {
          id: string;
          group_id: string;
          pack: 'solo' | 'duo';
          quantity: number;
          stripe_checkout_session_id: string | null;
          stripe_invoice_id: string | null;
          status: 'pending_payment' | 'pending_fulfillment' | 'encoding' | 'ready_to_ship' | 'shipped' | 'delivered' | 'canceled';
          shipping_address: Json | null;
          tracking_number: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          tags_encoded_count: number;
          fulfilled_at: string | null;
          promo_code: string | null;
          promo_code_id: string | null;
          discount_amount: number;
          stripe_discount_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          pack: 'solo' | 'duo';
          quantity: number;
          stripe_checkout_session_id?: string | null;
          stripe_invoice_id?: string | null;
          status?: 'pending_payment' | 'pending_fulfillment' | 'encoding' | 'ready_to_ship' | 'shipped' | 'delivered' | 'canceled';
          shipping_address?: Json | null;
          tracking_number?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          tags_encoded_count?: number;
          fulfilled_at?: string | null;
          promo_code?: string | null;
          promo_code_id?: string | null;
          discount_amount?: number;
          stripe_discount_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          pack?: 'solo' | 'duo';
          quantity?: number;
          stripe_checkout_session_id?: string | null;
          stripe_invoice_id?: string | null;
          status?: 'pending_payment' | 'pending_fulfillment' | 'encoding' | 'ready_to_ship' | 'shipped' | 'delivered' | 'canceled';
          shipping_address?: Json | null;
          tracking_number?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          tags_encoded_count?: number;
          fulfilled_at?: string | null;
          promo_code?: string | null;
          promo_code_id?: string | null;
          discount_amount?: number;
          stripe_discount_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'smarttag_orders_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          }
        ];
      };
      smarttag_order_tags: {
        Row: {
          order_id: string;
          sticker_id: string;
          encoded_at: string;
        };
        Insert: {
          order_id: string;
          sticker_id: string;
          encoded_at?: string;
        };
        Update: {
          order_id?: string;
          sticker_id?: string;
          encoded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'smarttag_order_tags_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'smarttag_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'smarttag_order_tags_sticker_id_fkey';
            columns: ['sticker_id'];
            isOneToOne: false;
            referencedRelation: 'nfc_stickers';
            referencedColumns: ['id'];
          }
        ];
      };
      contact_requests: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          company: string | null;
          team_size: string | null;
          message: string;
          locale: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone?: string | null;
          company?: string | null;
          team_size?: string | null;
          message: string;
          locale?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          phone?: string | null;
          company?: string | null;
          team_size?: string | null;
          message?: string;
          locale?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      establishments: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          business_type: 'restaurant' | 'beauty';
          slug: string;
          stripe_account_id: string | null;
          country: string;
          currency: string;
          onboarding_status: 'not_started' | 'pending' | 'complete';
          address: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          business_type: 'restaurant' | 'beauty';
          slug: string;
          stripe_account_id?: string | null;
          country?: string;
          currency?: string;
          onboarding_status?: 'not_started' | 'pending' | 'complete';
          address?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          name?: string;
          business_type?: 'restaurant' | 'beauty';
          slug?: string;
          stripe_account_id?: string | null;
          country?: string;
          currency?: string;
          onboarding_status?: 'not_started' | 'pending' | 'complete';
          address?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'establishments_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          }
        ];
      };
      staff_profiles: {
        Row: {
          id: string;
          establishment_id: string;
          user_id: string | null;
          full_name: string;
          avatar_url: string | null;
          stripe_account_id: string | null;
          onboarding_status: 'not_started' | 'pending' | 'complete';
          is_active: boolean;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          establishment_id: string;
          user_id?: string | null;
          full_name: string;
          avatar_url?: string | null;
          stripe_account_id?: string | null;
          onboarding_status?: 'not_started' | 'pending' | 'complete';
          is_active?: boolean;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          establishment_id?: string;
          user_id?: string | null;
          full_name?: string;
          avatar_url?: string | null;
          stripe_account_id?: string | null;
          onboarding_status?: 'not_started' | 'pending' | 'complete';
          is_active?: boolean;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_profiles_establishment_id_fkey';
            columns: ['establishment_id'];
            isOneToOne: false;
            referencedRelation: 'establishments';
            referencedColumns: ['id'];
          }
        ];
      };
      nfc_stickers: {
        Row: {
          id: string;
          short_id: string;
          establishment_id: string | null;
          generated_at: string;
          batch_label: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          short_id: string;
          establishment_id?: string | null;
          generated_at?: string;
          batch_label?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          short_id?: string;
          establishment_id?: string | null;
          generated_at?: string;
          batch_label?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nfc_stickers_establishment_id_fkey';
            columns: ['establishment_id'];
            isOneToOne: false;
            referencedRelation: 'establishments';
            referencedColumns: ['id'];
          }
        ];
      };
      transactions: {
        Row: {
          id: string;
          amount: number;
          currency: string;
          staff_id: string | null;
          establishment_id: string;
          stripe_payment_intent_id: string | null;
          stripe_session_id: string | null;
          status: 'pending' | 'succeeded' | 'failed' | 'refunded';
          metadata: Json;
          idempotency_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          amount: number;
          currency: string;
          staff_id?: string | null;
          establishment_id: string;
          stripe_payment_intent_id?: string | null;
          stripe_session_id?: string | null;
          status?: 'pending' | 'succeeded' | 'failed' | 'refunded';
          metadata?: Json;
          idempotency_key: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          amount?: number;
          currency?: string;
          staff_id?: string | null;
          establishment_id?: string;
          stripe_payment_intent_id?: string | null;
          stripe_session_id?: string | null;
          status?: 'pending' | 'succeeded' | 'failed' | 'refunded';
          metadata?: Json;
          idempotency_key?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_establishment_id_fkey';
            columns: ['establishment_id'];
            isOneToOne: false;
            referencedRelation: 'establishments';
            referencedColumns: ['id'];
          }
        ];
      };
      webhook_events: {
        Row: {
          id: string;
          stripe_event_id: string;
          event_type: string;
          payload: Json;
          processed_at: string | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          stripe_event_id: string;
          event_type: string;
          payload: Json;
          processed_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          stripe_event_id?: string;
          event_type?: string;
          payload?: Json;
          processed_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_audit_log: {
        Row: {
          id: string;
          actor_user_id: string;
          action: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id: string;
          action: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_user_id?: string;
          action?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: 'super_admin' | 'group_admin' | 'manager' | 'staff';
          group_id: string | null;
          establishment_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: 'super_admin' | 'group_admin' | 'manager' | 'staff';
          group_id?: string | null;
          establishment_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: 'super_admin' | 'group_admin' | 'manager' | 'staff';
          group_id?: string | null;
          establishment_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      promo_codes: {
        Row: {
          id: string;
          code: string;
          stripe_coupon_id: string;
          stripe_promo_code_id: string;
          percentage_off: number;
          max_redemptions: number | null;
          times_redeemed: number;
          expires_at: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          deleted_at: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          stripe_coupon_id: string;
          stripe_promo_code_id: string;
          percentage_off: number;
          max_redemptions?: number | null;
          times_redeemed?: number;
          expires_at?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          stripe_coupon_id?: string;
          stripe_promo_code_id?: string;
          percentage_off?: number;
          max_redemptions?: number | null;
          times_redeemed?: number;
          expires_at?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      ambassadors: {
        Row: {
          id: string;
          name: string;
          promo_code_id: string;
          pin_hash: string;
          pin_salt: string | null;
          is_active: boolean;
          created_at: string;
          siret: string | null;
          stripe_account_id: string | null;
          onboarding_status: string;
          email: string | null;
          phone: string | null;
          city: string | null;
          referrer_ambassador_id: string | null;
          referral_code: string | null;
          referral_validated_at: string | null;
          pin_setup_token: string | null;
          pin_setup_expires_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          promo_code_id: string;
          pin_hash?: string | null;
          pin_salt?: string | null;
          is_active?: boolean;
          created_at?: string;
          siret?: string | null;
          stripe_account_id?: string | null;
          onboarding_status?: string;
          email?: string | null;
          phone?: string | null;
          city?: string | null;
          referrer_ambassador_id?: string | null;
          referral_code?: string | null;
          referral_validated_at?: string | null;
          pin_setup_token?: string | null;
          pin_setup_expires_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          promo_code_id?: string;
          pin_hash?: string | null;
          pin_salt?: string | null;
          is_active?: boolean;
          created_at?: string;
          siret?: string | null;
          stripe_account_id?: string | null;
          onboarding_status?: string;
          email?: string | null;
          phone?: string | null;
          city?: string | null;
          referrer_ambassador_id?: string | null;
          referral_code?: string | null;
          referral_validated_at?: string | null;
          pin_setup_token?: string | null;
          pin_setup_expires_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ambassadors_promo_code_id_fkey';
            columns: ['promo_code_id'];
            isOneToOne: true;
            referencedRelation: 'promo_codes';
            referencedColumns: ['id'];
          }
        ];
      };
      ambassador_sales: {
        Row: {
          id: string;
          ambassador_id: string;
          smarttag_order_id: string;
          pack: 'solo' | 'duo';
          commission_amount: number;
          salon_name_partial: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ambassador_id: string;
          smarttag_order_id: string;
          pack: 'solo' | 'duo';
          commission_amount: number;
          salon_name_partial?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ambassador_id?: string;
          smarttag_order_id?: string;
          pack?: 'solo' | 'duo';
          commission_amount?: number;
          salon_name_partial?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ambassador_sales_ambassador_id_fkey';
            columns: ['ambassador_id'];
            isOneToOne: false;
            referencedRelation: 'ambassadors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ambassador_sales_smarttag_order_id_fkey';
            columns: ['smarttag_order_id'];
            isOneToOne: false;
            referencedRelation: 'smarttag_orders';
            referencedColumns: ['id'];
          }
        ];
      };
      ambassador_pin_attempts: {
        Row: {
          id: string;
          ip_hash: string;
          code: string;
          attempted_at: string;
        };
        Insert: {
          id?: string;
          ip_hash: string;
          code: string;
          attempted_at?: string;
        };
        Update: {
          id?: string;
          ip_hash?: string;
          code?: string;
          attempted_at?: string;
        };
        Relationships: [];
      };
      ambassador_payouts: {
        Row: {
          id: string;
          ambassador_id: string;
          amount_cents: number;
          status: 'pending' | 'paid' | 'failed' | 'canceled';
          stripe_transfer_id: string | null;
          stripe_payout_id: string | null;
          failure_reason: string | null;
          requested_at: string;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          ambassador_id: string;
          amount_cents: number;
          status?: 'pending' | 'paid' | 'failed' | 'canceled';
          stripe_transfer_id?: string | null;
          stripe_payout_id?: string | null;
          failure_reason?: string | null;
          requested_at?: string;
          paid_at?: string | null;
        };
        Update: {
          id?: string;
          ambassador_id?: string;
          amount_cents?: number;
          status?: 'pending' | 'paid' | 'failed' | 'canceled';
          stripe_transfer_id?: string | null;
          stripe_payout_id?: string | null;
          failure_reason?: string | null;
          requested_at?: string;
          paid_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ambassador_payouts_ambassador_id_fkey';
            columns: ['ambassador_id'];
            isOneToOne: false;
            referencedRelation: 'ambassadors';
            referencedColumns: ['id'];
          }
        ];
      };
      ambassador_recruitment_applications: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          city: string;
          phone: string;
          email: string;
          siret: string;
          no_fraud_pledge: boolean;
          notes: string | null;
          status: 'pending' | 'accepted' | 'rejected';
          reviewed_at: string | null;
          ip_hash: string | null;
          created_at: string;
          referrer_ambassador_id: string | null;
          referrer_code_used: string | null;
          source: string;
          reminder_count: number;
          last_reminder_at: string | null;
        };
        Insert: {
          id?: string;
          first_name: string;
          last_name: string;
          city: string;
          phone: string;
          email: string;
          siret: string;
          no_fraud_pledge: boolean;
          notes?: string | null;
          status?: 'pending' | 'accepted' | 'rejected';
          reviewed_at?: string | null;
          ip_hash?: string | null;
          created_at?: string;
          referrer_ambassador_id?: string | null;
          referrer_code_used?: string | null;
          source?: string;
          reminder_count?: number;
          last_reminder_at?: string | null;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          city?: string;
          phone?: string;
          email?: string;
          siret?: string;
          no_fraud_pledge?: boolean;
          notes?: string | null;
          status?: 'pending' | 'accepted' | 'rejected';
          reviewed_at?: string | null;
          ip_hash?: string | null;
          created_at?: string;
          referrer_ambassador_id?: string | null;
          referrer_code_used?: string | null;
          source?: string;
          reminder_count?: number;
          last_reminder_at?: string | null;
        };
        Relationships: [];
      };
      referral_payouts: {
        Row: {
          id: string;
          referrer_ambassador_id: string;
          referred_ambassador_id: string;
          amount_cents: number;
          reason: 'validation' | 'milestone_5' | 'milestone_10';
          status: 'pending' | 'credited' | 'voided';
          credited_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          referrer_ambassador_id: string;
          referred_ambassador_id: string;
          amount_cents: number;
          reason: 'validation' | 'milestone_5' | 'milestone_10';
          status?: 'pending' | 'credited' | 'voided';
          credited_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          referrer_ambassador_id?: string;
          referred_ambassador_id?: string;
          amount_cents?: number;
          reason?: 'validation' | 'milestone_5' | 'milestone_10';
          status?: 'pending' | 'credited' | 'voided';
          credited_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      referral_email_log: {
        Row: {
          id: string;
          ambassador_id: string;
          recipient_email: string;
          sent_at: string;
        };
        Insert: {
          id?: string;
          ambassador_id: string;
          recipient_email: string;
          sent_at?: string;
        };
        Update: {
          id?: string;
          ambassador_id?: string;
          recipient_email?: string;
          sent_at?: string;
        };
        Relationships: [];
      };
      cold_email_prospects: {
        Row: {
          id: string;
          siret: string | null;
          company_name: string | null;
          email: string | null;
          first_name: string | null;
          city: string | null;
          naf_code: string | null;
          creation_date: string | null;
          birth_year_estimate: number | null;
          imported_at: string;
          sequence_step: number;
          last_sent_at: string | null;
          replied_at: string | null;
          unsubscribed_at: string | null;
          clicked_landing_at: string | null;
          notes: string | null;
          linkedin_url: string | null;
          status: 'not_contacted' | 'contacted' | 'in_discussion' | 'accepted' | 'refused';
        };
        Insert: {
          id?: string;
          siret?: string | null;
          company_name?: string | null;
          email?: string | null;
          first_name?: string | null;
          city?: string | null;
          naf_code?: string | null;
          creation_date?: string | null;
          birth_year_estimate?: number | null;
          imported_at?: string;
          sequence_step?: number;
          last_sent_at?: string | null;
          replied_at?: string | null;
          unsubscribed_at?: string | null;
          clicked_landing_at?: string | null;
          notes?: string | null;
          linkedin_url?: string | null;
          status?: 'not_contacted' | 'contacted' | 'in_discussion' | 'accepted' | 'refused';
        };
        Update: {
          id?: string;
          siret?: string | null;
          company_name?: string | null;
          email?: string | null;
          first_name?: string | null;
          city?: string | null;
          naf_code?: string | null;
          creation_date?: string | null;
          birth_year_estimate?: number | null;
          imported_at?: string;
          sequence_step?: number;
          last_sent_at?: string | null;
          replied_at?: string | null;
          unsubscribed_at?: string | null;
          clicked_landing_at?: string | null;
          notes?: string | null;
          linkedin_url?: string | null;
          status?: 'not_contacted' | 'contacted' | 'in_discussion' | 'accepted' | 'refused';
        };
        Relationships: [];
      };
      ambassador_email_templates: {
        Row: {
          id: string;
          slug: string;
          name: string;
          subject: string;
          body_html: string;
          is_seeded: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          subject: string;
          body_html: string;
          is_seeded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          subject?: string;
          body_html?: string;
          is_seeded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ambassador_email_logs: {
        Row: {
          id: string;
          ambassador_id: string;
          template_id: string | null;
          template_slug: string | null;
          subject: string;
          body_html: string;
          to_email: string;
          sent_by: string;
          resend_id: string | null;
          status: 'sent' | 'failed';
          error: string | null;
          sent_at: string;
        };
        Insert: {
          id?: string;
          ambassador_id: string;
          template_id?: string | null;
          template_slug?: string | null;
          subject: string;
          body_html: string;
          to_email: string;
          sent_by: string;
          resend_id?: string | null;
          status: 'sent' | 'failed';
          error?: string | null;
          sent_at?: string;
        };
        Update: {
          id?: string;
          ambassador_id?: string;
          template_id?: string | null;
          template_slug?: string | null;
          subject?: string;
          body_html?: string;
          to_email?: string;
          sent_by?: string;
          resend_id?: string | null;
          status?: 'sent' | 'failed';
          error?: string | null;
          sent_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ambassador_email_logs_ambassador_id_fkey';
            columns: ['ambassador_id'];
            isOneToOne: false;
            referencedRelation: 'ambassadors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ambassador_email_logs_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'ambassador_email_templates';
            referencedColumns: ['id'];
          }
        ];
      };
      ambassador_contract_templates: {
        Row: {
          id: string;
          name: string;
          version: number;
          body_html: string;
          consent_text: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          version?: number;
          body_html: string;
          consent_text: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          version?: number;
          body_html?: string;
          consent_text?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ambassador_contracts: {
        Row: {
          id: string;
          ambassador_id: string;
          template_id: string | null;
          title: string;
          content_snapshot: string;
          content_hash: string;
          consent_text: string;
          status: 'sent' | 'viewed' | 'signed' | 'revoked';
          sent_by: string;
          sent_at: string;
          viewed_at: string | null;
          signed_at: string | null;
          signature_image_path: string | null;
          signer_ip_hash: string | null;
          signer_user_agent: string | null;
          revoked_at: string | null;
          revoked_reason: string | null;
        };
        Insert: {
          id?: string;
          ambassador_id: string;
          template_id?: string | null;
          title: string;
          content_snapshot: string;
          content_hash: string;
          consent_text: string;
          status?: 'sent' | 'viewed' | 'signed' | 'revoked';
          sent_by: string;
          sent_at?: string;
          viewed_at?: string | null;
          signed_at?: string | null;
          signature_image_path?: string | null;
          signer_ip_hash?: string | null;
          signer_user_agent?: string | null;
          revoked_at?: string | null;
          revoked_reason?: string | null;
        };
        Update: {
          id?: string;
          ambassador_id?: string;
          template_id?: string | null;
          title?: string;
          content_snapshot?: string;
          content_hash?: string;
          consent_text?: string;
          status?: 'sent' | 'viewed' | 'signed' | 'revoked';
          sent_by?: string;
          sent_at?: string;
          viewed_at?: string | null;
          signed_at?: string | null;
          signature_image_path?: string | null;
          signer_ip_hash?: string | null;
          signer_user_agent?: string | null;
          revoked_at?: string | null;
          revoked_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ambassador_contracts_ambassador_id_fkey';
            columns: ['ambassador_id'];
            isOneToOne: false;
            referencedRelation: 'ambassadors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ambassador_contracts_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'ambassador_contract_templates';
            referencedColumns: ['id'];
          }
        ];
      };
      ambassador_contract_audit_log: {
        Row: {
          id: string;
          contract_id: string;
          action: 'sent' | 'viewed' | 'signed' | 'revoked' | 'downloaded';
          actor_type: 'admin' | 'ambassador' | 'system';
          actor_id: string | null;
          ip_hash: string | null;
          user_agent: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          contract_id: string;
          action: 'sent' | 'viewed' | 'signed' | 'revoked' | 'downloaded';
          actor_type: 'admin' | 'ambassador' | 'system';
          actor_id?: string | null;
          ip_hash?: string | null;
          user_agent?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          contract_id?: string;
          action?: 'sent' | 'viewed' | 'signed' | 'revoked' | 'downloaded';
          actor_type?: 'admin' | 'ambassador' | 'system';
          actor_id?: string | null;
          ip_hash?: string | null;
          user_agent?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ambassador_contract_audit_log_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'ambassador_contracts';
            referencedColumns: ['id'];
          }
        ];
      };
      salon_zones: {
        Row: {
          id: string;
          city: string;
          name: string;
          osm_relation_id: number | null;
          bbox_min_lat: number | null;
          bbox_min_lon: number | null;
          bbox_max_lat: number | null;
          bbox_max_lon: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          city: string;
          name: string;
          osm_relation_id?: number | null;
          bbox_min_lat?: number | null;
          bbox_min_lon?: number | null;
          bbox_max_lat?: number | null;
          bbox_max_lon?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          city?: string;
          name?: string;
          osm_relation_id?: number | null;
          bbox_min_lat?: number | null;
          bbox_min_lon?: number | null;
          bbox_max_lat?: number | null;
          bbox_max_lon?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      salons: {
        Row: {
          id: string;
          zone_id: string | null;
          city: string;
          name: string;
          address: string | null;
          postal_code: string | null;
          phone: string | null;
          website: string | null;
          lat: number | null;
          lon: number | null;
          osm_id: number | null;
          osm_type: 'node' | 'way' | 'relation' | null;
          is_active: boolean;
          created_at: string;
          google_place_id: string | null;
          business_status: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null;
          opening_hours: Json | null;
          google_rating: number | null;
          google_user_ratings_total: number | null;
          google_enriched_at: string | null;
        };
        Insert: {
          id?: string;
          zone_id?: string | null;
          city: string;
          name: string;
          address?: string | null;
          postal_code?: string | null;
          phone?: string | null;
          website?: string | null;
          lat?: number | null;
          lon?: number | null;
          osm_id?: number | null;
          osm_type?: 'node' | 'way' | 'relation' | null;
          is_active?: boolean;
          created_at?: string;
          google_place_id?: string | null;
          business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null;
          opening_hours?: Json | null;
          google_rating?: number | null;
          google_user_ratings_total?: number | null;
          google_enriched_at?: string | null;
        };
        Update: {
          id?: string;
          zone_id?: string | null;
          city?: string;
          name?: string;
          address?: string | null;
          postal_code?: string | null;
          phone?: string | null;
          website?: string | null;
          lat?: number | null;
          lon?: number | null;
          osm_id?: number | null;
          osm_type?: 'node' | 'way' | 'relation' | null;
          is_active?: boolean;
          created_at?: string;
          google_place_id?: string | null;
          business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null;
          opening_hours?: Json | null;
          google_rating?: number | null;
          google_user_ratings_total?: number | null;
          google_enriched_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'salons_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'salon_zones';
            referencedColumns: ['id'];
          }
        ];
      };
      ambassador_zone_claims: {
        Row: {
          id: string;
          ambassador_id: string;
          zone_id: string;
          claimed_at: string;
          released_at: string | null;
          released_by_admin: boolean;
        };
        Insert: {
          id?: string;
          ambassador_id: string;
          zone_id: string;
          claimed_at?: string;
          released_at?: string | null;
          released_by_admin?: boolean;
        };
        Update: {
          id?: string;
          ambassador_id?: string;
          zone_id?: string;
          claimed_at?: string;
          released_at?: string | null;
          released_by_admin?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'ambassador_zone_claims_ambassador_id_fkey';
            columns: ['ambassador_id'];
            isOneToOne: false;
            referencedRelation: 'ambassadors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ambassador_zone_claims_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'salon_zones';
            referencedColumns: ['id'];
          }
        ];
      };
      salon_visits: {
        Row: {
          id: string;
          ambassador_id: string;
          salon_id: string;
          visited_at: string;
          flyer_left: boolean;
          convinced: 'yes' | 'maybe' | 'no';
          likelihood_rating: number;
          notes: string | null;
          follow_up_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ambassador_id: string;
          salon_id: string;
          visited_at?: string;
          flyer_left?: boolean;
          convinced?: 'yes' | 'maybe' | 'no';
          likelihood_rating: number;
          notes?: string | null;
          follow_up_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ambassador_id?: string;
          salon_id?: string;
          visited_at?: string;
          flyer_left?: boolean;
          convinced?: 'yes' | 'maybe' | 'no';
          likelihood_rating?: number;
          notes?: string | null;
          follow_up_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'salon_visits_ambassador_id_fkey';
            columns: ['ambassador_id'];
            isOneToOne: false;
            referencedRelation: 'ambassadors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'salon_visits_salon_id_fkey';
            columns: ['salon_id'];
            isOneToOne: false;
            referencedRelation: 'salons';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_my_group_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      get_my_managed_establishment_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      get_my_staff_establishment_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_my_staff_profile_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_establishment_report: {
        Args: {
          p_establishment_id: string;
          p_from: string;
          p_to: string;
        };
        Returns: {
          staff_id: string;
          full_name: string;
          total_tips: number;
          transaction_count: number;
          currency: string;
        }[];
      };
      admin_transactions_summary: {
        Args: {
          p_status?: string | null;
          p_group_id?: string | null;
          p_establishment_id?: string | null;
          p_from?: string | null;
          p_to?: string | null;
        };
        Returns: {
          row_count: number;
          succeeded_volume_cents: number;
        }[];
      };
      validate_unassigned_nfc_code: {
        Args: { p_short_id: string };
        Returns: string | null;
      };
    };
    Enums: {
      business_type: 'restaurant' | 'beauty';
      transaction_status: 'pending' | 'succeeded' | 'failed' | 'refunded';
      stripe_onboarding_status: 'not_started' | 'pending' | 'complete';
      user_role: 'super_admin' | 'group_admin' | 'manager' | 'staff';
    };
  };
};
