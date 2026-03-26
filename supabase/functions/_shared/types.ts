/**
 * Shared types for Edge Functions.
 * TODO: Add more shared types as needed.
 */

export interface RecipeStatus {
  id: string
  status: 'pending' | 'parsing' | 'parsed' | 'draft' | 'error'
  parseError?: string
}

export interface IngredientData {
  original: string
  quantity?: number
  unit?: string
  name: string
  notes?: string
}

export interface StepData {
  instruction: string
  timerMinutes?: number
}

export interface SupabaseConfig {
  url: string
  anonKey: string
  serviceRoleKey?: string
}

/**
 * CORS headers for Edge Functions.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
