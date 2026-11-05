/** Only user-initiated dismissals use this guard; successful saves close normally. */
export function confirmDiscard(dirty:boolean,confirm:()=>boolean):boolean {
 return !dirty || confirm()
}
