import { chromium } from '@playwright/test'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:390,height:844}})
 const page=await context.newPage()
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto('http://localhost:3001/login',{waitUntil:'networkidle',timeout:120000})
 const selector=page.locator('select:has(option[value="ar"])').first()
 await selector.waitFor({timeout:120000})
 for(const locale of ['ar','en','fr']){
  await selector.selectOption(locale)
  await page.waitForFunction(l=>document.documentElement.lang===l,locale)
  const direction=await page.locator('html').getAttribute('dir')
  if(direction!==(locale==='ar'?'rtl':'ltr'))throw Error('Incorrect direction '+locale)
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('Mobile overflow '+locale)
  await page.reload({waitUntil:'domcontentloaded'})
  await page.waitForFunction(l=>document.documentElement.lang===l,locale)
  console.log(locale+': direction, persistence and mobile layout verified')
 }
 if(errors.length)throw Error(errors.join('\n'))
 await context.close()
}finally{await browser.close()}
