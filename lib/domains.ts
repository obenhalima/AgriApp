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
    .rpc('create_client_with_defaults', { p_input: { ...input, code: input.code.trim().toUpperCase() } })
  if (error) throw clientDefaultsError(error)
  if (!data?.id) throw new Error('Création non confirmée : vérifiez la liste des clients avant de réessayer.')
  return data as Domain
}

function clientDefaultsError(error: {code?:string;message?:string}) {
  return new Error(['PGRST202','42883'].includes(error.code || '')
    ? 'Initialisation des cultures non activée : appliquer le SQL 156.'
    : error.message || 'Initialisation du client impossible.')
}

export async function initializeClientDefaultCrops(domain: string): Promise<{domain_id:string;created:number;total:number;active:number}> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domain)) throw new Error('Client requis')
  const {data,error}=await supabase.rpc('initialize_client_default_crops',{p_domain:domain})
  if(error)throw clientDefaultsError(error)
  if(data?.domain_id!==domain || !Number.isInteger(data.created) || data.created<0)throw new Error('Initialisation non confirmée : actualisez les cultures.')
  return data
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

