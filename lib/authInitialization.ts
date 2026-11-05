export const AUTH_INITIALIZATION_TIMEOUT_MS = 15000

/** Abort scoped database reads on timeout, success or provider teardown. */
export async function withAuthCancellation<T>(work:(signal:AbortSignal)=>Promise<T>,controller:AbortController,timeout=AUTH_INITIALIZATION_TIMEOUT_MS):Promise<T>{
  try{return await withAuthDeadline(work(controller.signal),timeout)}
  finally{controller.abort()}
}

/** Supabase getUser has no signal option. Bound its underlying HTTP request. */
export function withAuthRequestDeadline(fetcher:typeof fetch,timeout=10000):typeof fetch{
  return async(input,init)=>{
    const request=typeof Request!=='undefined'&&input instanceof Request?input:null
    const url=String(request?.url||input)
    if(!/\/auth\/v1\/(user|token)(?:\?|$)/.test(url))return fetcher(input,init)
    const controller=new AbortController(),parent=init?.signal||request?.signal
    const abort=()=>controller.abort()
    if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true})
    const timer=setTimeout(abort,timeout)
    try{return await fetcher(input,{...init,signal:controller.signal})}
    finally{clearTimeout(timer);parent?.removeEventListener('abort',abort)}
  }
}

// Bounds the complete identity/permissions read. Late results are not applied
// by the caller; this never removes or changes the persisted Supabase session.
export async function withAuthDeadline<T>(work: PromiseLike<T>, timeout = AUTH_INITIALIZATION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('AUTH_INITIALIZATION_TIMEOUT')), timeout)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
