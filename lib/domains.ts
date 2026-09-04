import { supabase } from './supabase'

export type Domain = {
  id: string
  code: string
  name: string
  legal_name: string | null
  address: string | null
  city: string | null
  region: string | null
  country: string
  currency: string
  timezone: string
  locale: string
  logo_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type DomainInput = Pick<Domain,
  'code' | 'name' | 'legal_name' | 'address' | 'city' | 'region' |
  'country' | 'currency' | 'timezone' | 'locale' | 'logo_url' | 'is_active'
>

export async function listDomains(): Promise<Domain[]> {
  const { data, error } = await supabase
    .from('domains')
    .select('*')
    .order('name')
  if (error) throw error
  return (data ?? []) as Domain[]
}

export async function createDomain(input: DomainInput): Promise<Domain> {
  const { data, error } = await supabase
    .from('domains')
    .insert({ ...input, code: input.code.trim().toUpperCase() })
    .select()
    .single()
  if (error) throw error
  return data as Domain
}

export async function updateDomain(id: string, input: DomainInput): Promise<Domain> {
  const { data, error } = await supabase
    .from('domains')
    .update({ ...input, code: input.code.trim().toUpperCase(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Domain
}

