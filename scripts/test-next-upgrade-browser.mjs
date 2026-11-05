// Local upgrade smoke checks; no authentication or business-data writes.
import {chromium, expect} from '@playwright/test'
const base=process.env.TEST_BASE_URL||'http://localhost:3101'
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
 await context.route('https://**/*',route=>route.abort())
 const errors=[]
 const page=await context.newPage()
 page.on('pageerror',error=>errors.push(error.message))
 for(const [language,direction] of [['fr','ltr'],['en','ltr'],['ar','rtl']]) {
  await context.addCookies([{name:'itrix_language',value:language,url:base}])
  const response=await page.goto(base+'/login',{waitUntil:'networkidle'})
  expect(response.status()).toBe(200)
  await expect(page.locator('html')).toHaveAttribute('lang',language)
  await expect(page.locator('html')).toHaveAttribute('dir',direction)
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
 }
 for(const [icon,size] of [['icon-512.png',512],['apple.png',180],['icon-192.png',192]]) {
  const response=await context.request.get(base+'/pwa/'+icon)
  expect(response.status()).toBe(200)
  const bytes=await response.body()
  expect(bytes.subarray(1,4).toString()).toBe('PNG')
  expect(bytes.readUInt32BE(16)).toBe(size)
  expect(bytes.readUInt32BE(20)).toBe(size)
 }
 expect(errors).toEqual([])
 console.log('PASS: FR/EN/AR login, server language cookies, RTL, mobile layout, three generated PWA icons. No backend writes.')
} finally {await browser.close()}
