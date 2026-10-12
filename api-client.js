// Same-origin only. The token is entered by the user, never bundled in the app.
export class ApiError extends Error {
 constructor(message,status=0){super(message);this.status=status;}
}
export class NorskClient {
 constructor({token='',fetcher=(...args)=>fetch(...args),storage=sessionStorage}={}){this.token=token;this.fetcher=fetcher;this.storage=storage;this.session=null;this.pending=null;try{this.pending=JSON.parse(storage.getItem('norsk.pending')||'null');}catch{}}
 async request(path,{method='GET',body,raw=false,timeoutMs=180000}={}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await this.fetcher('/v1'+path,{method,headers:{Authorization:'Bearer '+this.token,...(body&&!raw?{'Content-Type':'application/json'}:{})},body:body?(raw?body:JSON.stringify(body)):undefined,signal:controller.signal});
   if(!response.ok){let detail='Request failed';try{const data=await response.json();detail=typeof data.detail==='string'?data.detail:JSON.stringify(data.detail);}catch{}throw new ApiError(detail,response.status);}
   if(response.status===204)return null;
   if(/^(audio|video)\//.test(response.headers.get('content-type')||''))return response.blob();
   return response.json();
  }catch(e){if(e instanceof ApiError)throw e;if(path==='/speech/synthesize')throw new ApiError('Speech generation timed out or the connection was interrupted. The remote demo may still be processing; avoid repeated clicks.');throw new ApiError('Connection interrupted. Your action is preserved; retry when the server is available.');}
  finally{clearTimeout(timeout);}
 }
 rememberPending(p){this.pending=p;if(p)this.storage.setItem('norsk.pending',JSON.stringify(p));else this.storage.removeItem('norsk.pending');}
 async perform(path,body){
  if(this.pending)throw new ApiError('Retry or reconcile the pending action before starting another.');
  this.rememberPending({path,body});return this.retry();
 }
 async retry(){
  if(!this.pending)throw new ApiError('There is no pending action.');
  try{
   const result=await this.request(this.pending.path,{method:'POST',body:this.pending.body});
   this.rememberPending(null);this.session=result;return result;
  }catch(e){if(e.status>=400&&e.status<500)this.rememberPending(null);throw e;}
 }
 async create(lesson_id='cafe-oatmilk-a2'){return this.perform('/sessions',{request_id:crypto.randomUUID(),lesson_id});}
 async mutate(action,payload={}){
  if(!this.session)throw new ApiError('Start a lesson first.');
  return this.perform(`/sessions/${this.session.id}/${action}`,{...payload,request_id:crypto.randomUUID(),revision:this.session.revision});
 }
 async refresh(){if(this.session)this.session=await this.request('/sessions/'+this.session.id);return this.session;}
}
