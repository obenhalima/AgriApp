// AbortSignal alone does not bound SDK work waiting before fetch (e.g. auth).
export async function withDeadline<T>(work:(signal:AbortSignal)=>PromiseLike<T>,ms:number,message:string):Promise<T>{
 const controller=new AbortController()
 let timer:ReturnType<typeof setTimeout>|undefined
 try{
  return await Promise.race([
   Promise.resolve().then(()=>work(controller.signal)),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error(message))},ms)}),
  ])
 }finally{if(timer)clearTimeout(timer)}
}
