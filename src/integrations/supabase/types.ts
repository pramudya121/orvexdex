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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      indexer_state: {
        Row: {
          id: string
          last_block: number
          lease_until: string | null
          updated_at: string
          zklbtc_usd: number | null
        }
        Insert: {
          id?: string
          last_block?: number
          lease_until?: string | null
          updated_at?: string
          zklbtc_usd?: number | null
        }
        Update: {
          id?: string
          last_block?: number
          lease_until?: string | null
          updated_at?: string
          zklbtc_usd?: number | null
        }
        Relationships: []
      }
      pools: {
        Row: {
          address: string
          created_at: string
          factory: string | null
          reserve0: number
          reserve1: number
          token0: string
          token1: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          factory?: string | null
          reserve0?: number
          reserve1?: number
          token0: string
          token1: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          factory?: string | null
          reserve0?: number
          reserve1?: number
          token0?: string
          token1?: string
          updated_at?: string
        }
        Relationships: []
      }
      swaps_history: {
        Row: {
          amount0: number
          amount1: number
          block_number: number
          block_time: string
          id: number
          log_index: number
          pool: string
          recipient: string | null
          sender: string | null
          tx_hash: string
        }
        Insert: {
          amount0: number
          amount1: number
          block_number: number
          block_time: string
          id?: never
          log_index: number
          pool: string
          recipient?: string | null
          sender?: string | null
          tx_hash: string
        }
        Update: {
          amount0?: number
          amount1?: number
          block_number?: number
          block_time?: string
          id?: never
          log_index?: number
          pool?: string
          recipient?: string | null
          sender?: string | null
          tx_hash?: string
        }
        Relationships: []
      }
      token_stats: {
        Row: {
          canonical_pool: string | null
          high_24h: number | null
          liquidity: number | null
          low_24h: number | null
          open_24h: number | null
          pool_count: number | null
          price: number | null
          price_change_24h: number | null
          sparkline: Json | null
          token: string
          trades_24h: number | null
          updated_at: string
          volume_24h: number | null
          zklbtc_usd: number | null
        }
        Insert: {
          canonical_pool?: string | null
          high_24h?: number | null
          liquidity?: number | null
          low_24h?: number | null
          open_24h?: number | null
          pool_count?: number | null
          price?: number | null
          price_change_24h?: number | null
          sparkline?: Json | null
          token: string
          trades_24h?: number | null
          updated_at?: string
          volume_24h?: number | null
          zklbtc_usd?: number | null
        }
        Update: {
          canonical_pool?: string | null
          high_24h?: number | null
          liquidity?: number | null
          low_24h?: number | null
          open_24h?: number | null
          pool_count?: number | null
          price?: number | null
          price_change_24h?: number | null
          sparkline?: Json | null
          token?: string
          trades_24h?: number | null
          updated_at?: string
          volume_24h?: number | null
          zklbtc_usd?: number | null
        }
        Relationships: []
      }
      tokens: {
        Row: {
          address: string
          category: string
          created_at: string
          decimals: number
          first_seen_block: number | null
          logo_url: string | null
          name: string
          symbol: string
          updated_at: string
        }
        Insert: {
          address: string
          category?: string
          created_at?: string
          decimals?: number
          first_seen_block?: number | null
          logo_url?: string | null
          name?: string
          symbol?: string
          updated_at?: string
        }
        Update: {
          address?: string
          category?: string
          created_at?: string
          decimals?: number
          first_seen_block?: number | null
          logo_url?: string | null
          name?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      x_verifications: {
        Row: {
          followed: boolean
          token_expires_at: string | null
          updated_at: string
          verified_at: string | null
          wallet_address: string
          x_access_token: string | null
          x_name: string | null
          x_refresh_token: string | null
          x_user_id: string | null
          x_username: string | null
        }
        Insert: {
          followed?: boolean
          token_expires_at?: string | null
          updated_at?: string
          verified_at?: string | null
          wallet_address: string
          x_access_token?: string | null
          x_name?: string | null
          x_refresh_token?: string | null
          x_user_id?: string | null
          x_username?: string | null
        }
        Update: {
          followed?: boolean
          token_expires_at?: string | null
          updated_at?: string
          verified_at?: string | null
          wallet_address?: string
          x_access_token?: string | null
          x_name?: string | null
          x_refresh_token?: string | null
          x_user_id?: string | null
          x_username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      refresh_token_stats: {
        Args: { p_zklbtc_usd?: number }
        Returns: undefined
      }
      token_candles: {
        Args: { p_interval: string; p_token: string }
        Returns: {
          candle_time: string
          close: number
          high: number
          low: number
          open: number
          trades: number
          volume: number
        }[]
      }
      token_trades: {
        Args: { p_limit?: number; p_token: string }
        Returns: {
          amount: number
          maker: string
          price: number
          side: string
          total: number
          trade_time: string
          tx_hash: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
