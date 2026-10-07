(() => {
 const notice=document.createElement('p');
 notice.textContent='Document historique : certains parcours et exemples restent à réviser. Pour la procédure actuelle et la définition des champs, utilisez le wiki intégré. Les captures disponibles ont été actualisées.';
 notice.style.cssText='position:sticky;top:0;z-index:20;margin:0;padding:16px;background:#faf5e8;color:#0B3D2E;border-bottom:2px solid #D4A95C;font:14px sans-serif';
 document.body.prepend(notice);
 const current={recoltes:'/guide-screenshots/current/recoltes.jpg',production:'/guide-screenshots/current/plan-culture.jpg',dashboard:'/guide-screenshots/current/dashboard-desktop.jpg','dashboard-kpis':'/guide-screenshots/current/dashboard-desktop.jpg'};
 document.querySelectorAll('img[src^="/guide-screenshots/"]').forEach(image=>{
  const key=image.getAttribute('src').split('/').pop().replace('.png','');
  if(current[key]) {
   image.src=current[key];image.removeAttribute('onerror');
   const heading=image.closest('.sw')?.previousElementSibling;
   if(heading?.classList.contains('sl'))heading.textContent=key==='recoltes'?'ÉCRAN RÉCOLTES · CAPTURE D’INTERFACE ACTUELLE':'CAPTURE D’INTERFACE ACTUELLE';
   const caption=image.closest('.sw')?.nextElementSibling;
   if(caption?.classList.contains('sc'))caption.textContent='Les valeurs dépendent du client et des filtres sélectionnés. Cliquez sur la capture pour l’afficher dans un espace plein écran.';
   const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','Agrandir la capture');button.style.cssText='display:block;width:100%;border:0;padding:0;background:transparent;cursor:zoom-in';image.parentNode.insertBefore(button,image);button.append(image);
   button.addEventListener('click',()=>{
    const dialog=document.createElement('dialog');dialog.style.cssText='position:fixed;inset:0;width:100vw;max-width:none;height:100vh;max-height:none;margin:0;padding:16px;border:0;background:#F6F4EB;box-sizing:border-box';
    const close=document.createElement('button');close.textContent='Fermer ×';close.style.cssText='position:sticky;top:0;float:right;background:#0B3D2E;color:white;border:0;border-radius:8px;padding:12px;cursor:pointer';
    const large=image.cloneNode();large.removeAttribute('style');large.style.cssText='display:block;width:auto;height:auto;max-width:100%;max-height:calc(100vh - 80px);object-fit:contain;margin:48px auto 0';dialog.append(close,large);document.body.append(dialog);close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();button.focus()});dialog.showModal();close.focus();
   });
  }
  else {const figure=image.closest('.sw');if(figure)figure.hidden=true;}
 });
})();
