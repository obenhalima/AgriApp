import { supabase } from './supabase'

export type OperationalFunction = {
  id: string
  code: string
  name: string
  description: string | null
}

export type BusinessCapability = {
  id: string
  code: string
  name: string
  process_code: string | null
  is_sensitive: boolean
}

export type FunctionCapability = { function_id: string; capability_id: string }
export type FunctionAssignment = { function_id: string; farm_id: string | null; valid_from: string }
export type CapabilityOverride = { capability_id: string; farm_id: string | null; granted: boolean; reason?: string | null }

export async function listOrganizationCatalog(): Promise<{
  functions: OperationalFunction[]
  capabilities: BusinessCapability[]
  mappings: FunctionCapability[]
}> {
  const [functionsResult, capabilitiesResult, mappingsResult] = await Promise.all([
    supabase.from('operational_functions').select('id,code,name,description').eq('is_active', true).order('name'),
    supabase.from('business_capabilities').select('id,code,name,process_code,is_sensitive').eq('is_active', true).order('process_code').order('name'),
    supabase.from('function_capabilities').select('function_id,capability_id'),
  ])
  if (functionsResult.error) throw functionsResult.error
  if (capabilitiesResult.error) throw capabilitiesResult.error
  if (mappingsResult.error) throw mappingsResult.error
  return {
    functions: functionsResult.data ?? [],
    capabilities: capabilitiesResult.data ?? [],
    mappings: mappingsResult.data ?? [],
  }
}

export async function getUserOrganizationConfig(userId: string, domainId: string): Promise<{
  assignments: FunctionAssignment[]
  overrides: CapabilityOverride[]
}> {
  const [assignmentsResult, overridesResult] = await Promise.all([
    supabase.from('user_function_assignments').select('function_id,farm_id,valid_from')
      .eq('user_id', userId).eq('domain_id', domainId).eq('is_active', true),
    supabase.from('user_capability_overrides').select('capability_id,farm_id,granted,reason')
      .eq('user_id', userId).eq('domain_id', domainId).is('valid_until', null),
  ])
  if (assignmentsResult.error) throw assignmentsResult.error
  if (overridesResult.error) throw overridesResult.error
  return { assignments: assignmentsResult.data ?? [], overrides: overridesResult.data ?? [] }
}

export async function saveUserOrganizationConfig(
  userId: string,
  domainId: string,
  assignments: FunctionAssignment[],
  overrides: CapabilityOverride[],
): Promise<void> {
  const { error } = await supabase.rpc('set_user_organization_config', {
    p_user: userId,
    p_domain: domainId,
    p_functions: assignments,
    p_overrides: overrides,
  })
  if (error) throw error
}
