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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          pack?: 's' | 'm' | 'l';
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
