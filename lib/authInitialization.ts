export const AUTH_INITIALIZATION_TIMEOUT_MS = 30000

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
    let timedOut=false
    const abort=()=>controller.abort()
    if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true})
    const timer=setTimeout(()=>{timedOut=true;abort()},timeout)
    try{return await fetcher(input,{...init,signal:controller.signal})}
    catch(error){
      // Report our own deadline as a retryable HTTP failure. A raw AbortError
      // is logged as an uncaught console error by the SDK's fetch handler.
      if(timedOut&&!parent?.aborted)return new Response(JSON.stringify({message:'Authentication service timed out',code:'auth_service_timeout'}),{status:503,headers:{'Content-Type':'application/json'}})
      throw error
    }
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

/** Retry a transient read once within the caller's cancellation deadline. */
export async function retryAuthRead<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T> {
  try { return await work() }
  catch(error) {
    signal.throwIfAborted()
    const failure=(error??{}) as {name?:string;status?:number;message?:string;isAcquireTimeout?:boolean}
    const temporary=failure.name==='AuthRetryableFetchError'||failure.name==='AbortError'||failure.isAcquireTimeout===true||
      (failure.status!==undefined&&failure.status>=500)||
      /failed to fetch|fetch failed|network|load failed/i.test(failure.message??'')
    if(!temporary)throw error
    return work()
  }
}

/** Same-user focus events share a recently completed server verification. */
export function needsAuthRecheck(verified:{id:string;at:number}|null,userId:string|undefined,now=Date.now()):boolean {
  return !verified||verified.id!==userId||now-verified.at>=60000
}
