'use client'

import {useState} from 'react'
import Link from 'next/link'
import {ArrowLeft,FileSpreadsheet,Upload} from 'lucide-react'
import {toast} from 'sonner'
import {useAuth} from '@/lib/auth'
import {supabase} from '@/lib/supabase'
import {parsePositiveList,PositiveListPreview} from '@/lib/positiveListImport'
import {Button} from '@/components/ui/Button'
import {Card} from '@/components/ui/Card'
import {Field,Input} from '@/components/ui/Input'
import {DataTable,TD,TH,THead,TR} from '@/components/ui/DataTable'

const friendlyError=(error:any)=>{const message=String(error?.message||error||'Erreur inconnue');return message.includes('duplicate key value')?'Cette version existe déjà pour ce client / cette société.':message}

export default function Page(){
  const {activeDomain,user}=useAuth()
  const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<PositiveListPreview|null>(null),[busy,setBusy]=useState(false)
  const analyze=async()=>{if(!file)return;setBusy(true);try{setPreview(await parsePositiveList(file))}catch(error:any){toast.error(friendlyError(error))}finally{setBusy(false)}}
  const save=async()=>{
    if(!file||!preview||!activeDomain||!user)return
    setBusy(true);let uploadedPath:string|null=null,completed=false
    try{
      const lookup=await supabase.from('phyto_positive_lists').select('id,status,source_file_path').eq('domain_id',activeDomain.domain_id).eq('version',preview.version).maybeSingle()
      if(lookup.error)throw lookup.error
      const existing=lookup.data as {id:string;status:string;source_file_path:string|null}|null
      if(existing&&!['brouillon','a_controler'].includes(existing.status))throw new Error(`La version ${preview.version} est ${existing.status.replace('_',' ')} et son historique ne peut pas être écrasé. Utilisez un nouveau numéro de version.`)
      if(existing&&!confirm(`La version ${preview.version} existe déjà et est encore en contrôle. Remplacer son fichier et toutes ses lignes importées ?`)){setBusy(false);return}
      uploadedPath=`${activeDomain.domain_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
      const upload=await supabase.storage.from('phyto-positive-lists').upload(uploadedPath,file);if(upload.error)throw upload.error
      const header={document_code:preview.document_code||null,document_date:preview.document_date||null,source_file_name:file.name,source_file_path:uploadedPath,status:'a_controler'}
      let listId:string
      if(existing){
        listId=existing.id
        const old=await supabase.from('phyto_positive_list_entries').select('id').eq('list_id',listId);if(old.error)throw old.error
        const rows=preview.rows.map(row=>({...row,list_id:listId,domain_id:activeDomain.domain_id,raw_data:row}))
        const inserted=await supabase.from('phyto_positive_list_entries').insert(rows).select('id');if(inserted.error)throw inserted.error
        const updated=await supabase.from('phyto_positive_lists').update(header).eq('id',listId)
        if(updated.error){const newIds=(inserted.data||[]).map(row=>row.id);if(newIds.length)await supabase.from('phyto_positive_list_entries').delete().in('id',newIds);throw updated.error}
        const oldIds=(old.data||[]).map(row=>row.id);if(oldIds.length){const removed=await supabase.from('phyto_positive_list_entries').delete().in('id',oldIds);if(removed.error)throw removed.error}
        if(existing.source_file_path&&existing.source_file_path!==uploadedPath)await supabase.storage.from('phyto-positive-lists').remove([existing.source_file_path])
        completed=true;toast.success(`Version ${preview.version} remplacée : ${rows.length} lignes à contrôler`)
      }else{
        const created=await supabase.from('phyto_positive_lists').insert({...header,domain_id:activeDomain.domain_id,version:preview.version}).select('id').single();if(created.error)throw created.error
        listId=created.data.id
        const rows=preview.rows.map(row=>({...row,list_id:listId,domain_id:activeDomain.domain_id,raw_data:row}))
        const inserted=await supabase.from('phyto_positive_list_entries').insert(rows);if(inserted.error){await supabase.from('phyto_positive_lists').delete().eq('id',listId);throw inserted.error}
        completed=true;toast.success(`${rows.length} lignes importées pour contrôle`)
      }
    }catch(error:any){toast.error(friendlyError(error))}
    finally{if(uploadedPath&&!completed)await supabase.storage.from('phyto-positive-lists').remove([uploadedPath]);setBusy(false)}
  }
  return <div className="space-y-md"><div className="flex justify-between gap-md"><div><Link href="/agronomie/produits"><ArrowLeft size={12}/> Produits phytosanitaires</Link><h1 className="text-heading font-bold mt-sm">Importer une liste positive</h1></div><Link href="/agronomie/produits/listes"><Button variant="ghost">LISTES À CONTRÔLER</Button></Link></div><Card><Field label="PDF, Excel ou CSV"><Input type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={(event:any)=>{setFile(event.target.files?.[0]||null);setPreview(null)}}/></Field><Button onClick={analyze} disabled={!file} loading={busy}><Upload size={14}/> ANALYSER</Button></Card>{preview&&<><Card><div className="grid grid-cols-1 md:grid-cols-3 gap-md"><Field label="Code"><Input value={preview.document_code} onChange={event=>setPreview({...preview,document_code:event.target.value})}/></Field><Field label="Version" required><Input value={preview.version} onChange={event=>setPreview({...preview,version:event.target.value})}/></Field><Field label="Date"><Input type="date" value={preview.document_date} onChange={event=>setPreview({...preview,document_date:event.target.value})}/></Field></div>{preview.warnings.map(warning=><p key={warning} className="text-warning mt-sm">{warning}</p>)}</Card><Card padding="none"><DataTable minWidth={900}><THead><TR><TH>Page</TH><TH>Section</TH><TH>Cible</TH><TH>Produit</TH><TH>Classe</TH><TH>DAR</TH><TH>Dose</TH><TH>Mode</TH></TR></THead><tbody>{preview.rows.slice(0,250).map((row,index)=><TR key={index}><TD>{row.source_page||'—'}</TD><TD>{row.section}</TD><TD>{row.target_label}</TD><TD>{row.commercial_name}</TD><TD>{row.risk_class}</TD><TD>{row.phi_days??'NA'}</TD><TD>{row.dose_text}</TD><TD>{row.treatment_mode}</TD></TR>)}</tbody></DataTable></Card><Button onClick={save} loading={busy} disabled={!preview.version||!preview.rows.length}><FileSpreadsheet size={14}/> IMPORTER POUR CONTRÔLE</Button></>}</div>
}
